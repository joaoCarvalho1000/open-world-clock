// A small static server for the web app tests: serves site/ the way Cloudflare Pages does for these paths
// (/app redirects to /app/, folders serve index.html, clean URLs for *.html, text compressed with Brotli or gzip) and
// sends the security headers from site/_headers (the site-wide rule and the /app/* one, with their detaches), so the
// home page and the app in its hero run under the same Content-Security-Policy and framing rules as in production.
// It counts the bytes it sends.
// Usage: node test/web/serve.mjs [port]   (default 8817; the tests pick their own port between 8810 and 8830)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'site');

// site/_headers, read once: [pattern, [[name, value | null (a "! name" detach)]]] for plain path rules. Host rules
// (https://...) and :placeholders are left out. Only the headers that change how a page may run are sent: the policy
// without upgrade-insecure-requests (it would send a plain-http local preview to https), and no HSTS.
const SENT = new Set(['content-security-policy', 'x-frame-options', 'x-robots-tag', 'referrer-policy', 'permissions-policy', 'cross-origin-opener-policy', 'x-content-type-options']);
function readRules(root) {
  const rules = [];
  let cur = null;
  for (const line of fs.readFileSync(path.join(root, '_headers'), 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) { cur = line.startsWith('/') && !line.includes(':') ? [line.trim(), []] : null; if (cur) rules.push(cur); continue; }
    if (!cur) continue;
    const t = line.trim();
    if (t.startsWith('!')) { cur[1].push([t.slice(1).trim().toLowerCase(), null]); continue; }
    const i = t.indexOf(':');
    if (i > 0) cur[1].push([t.slice(0, i).trim().toLowerCase(), t.slice(i + 1).trim()]);
  }
  return rules;
}
// The headers Pages would send for a path: every matching rule in order, a detach dropping what earlier rules set.
export function headersFor(p, root = SITE) {
  const out = {};
  for (const [pattern, lines] of readRules(root)) {
    const hit = pattern.endsWith('*') ? p.startsWith(pattern.slice(0, -1)) : p === pattern;
    if (!hit) continue;
    for (const [k, v] of lines) {
      if (!SENT.has(k)) continue;
      if (v === null) delete out[k]; else out[k] = out[k] ? `${out[k]}, ${v}` : v;
    }
  }
  if (out['content-security-policy']) out['content-security-policy'] = out['content-security-policy'].replace(/;\s*upgrade-insecure-requests/, '');
  return out;
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};
const TEXT = new Set(['.html', '.js', '.css', '.json', '.webmanifest', '.svg', '.txt', '.ico']);

export function startServer(port = 8817, root = SITE) {
  const log = [];
  const stats = { bytes: 0, requests: 0 };
  const packed = new Map(); // file|mtime|encoding -> compressed buffer
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const p = decodeURIComponent(url.pathname);
    log.push(p);
    stats.requests++;
    if (p === '/app') { res.writeHead(308, { Location: '/app/' + url.search }); res.end(); return; }
    let file = path.join(root, p);
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    else if (!fs.existsSync(file) && fs.existsSync(file + '.html')) file += '.html';
    if (!fs.existsSync(file)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return; }
    const ext = path.extname(file);
    const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=0, must-revalidate', ...headersFor(p, root) };
    let body = fs.readFileSync(file);
    // ETags like Pages: a revalidation (repeat visits) gets a 304 and no body
    const etag = '"' + crypto.createHash('sha1').update(body).digest('hex').slice(0, 16) + '"';
    headers.ETag = etag;
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); return; }
    const accept = String(req.headers['accept-encoding'] || '');
    const enc = TEXT.has(ext) ? (/\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : '') : '';
    if (enc) {
      const key = `${file}|${fs.statSync(file).mtimeMs}|${enc}`;
      if (!packed.has(key)) packed.set(key, enc === 'br' ? zlib.brotliCompressSync(body) : zlib.gzipSync(body, { level: 9 }));
      body = packed.get(key);
      Object.assign(headers, { 'Content-Encoding': enc, Vary: 'Accept-Encoding' });
    }
    headers['Content-Length'] = body.length;
    stats.bytes += body.length;
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
  });
  const sockets = new Set();
  server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve({
      port, url: `http://127.0.0.1:${port}`, log, stats,
      close: () => new Promise((r) => { for (const s of sockets) s.destroy(); server.close(() => r()); }),
    }));
  });
}

// First free port in [from, to].
export async function startOnFreePort(from = 8810, to = 8830, root = SITE) {
  for (let port = from; port <= to; port++) {
    if (port === 8788) continue;
    try { return await startServer(port, root); } catch (e) { if (e.code !== 'EADDRINUSE' && e.code !== 'EACCES') throw e; }
  }
  throw new Error(`no free port between ${from} and ${to}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = +(process.argv[2] || 8817);
  startServer(port).then((s) => console.log(`serving ${SITE} at ${s.url}/ (the app is in the home page's hero; Ctrl+C to stop)`));
}
