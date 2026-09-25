#!/usr/bin/env node
// Keeps the Content-Security-Policy in site/_headers in step with the inline <script>s in site/*.html and in the
// Portuguese and Spanish pages (site/pt/*.html, site/es/*.html).
// The CSP allows scripts only from this origin plus these exact inline blocks (by SHA-256), so any edit to an
// inline script needs a new hash, or the browser will refuse to run it.
//
//   node cloudflare/csp-hashes.mjs          list the hashes and check site/_headers (exit 1 if out of date)
//   node cloudflare/csp-hashes.mjs --write  rewrite the script-src hashes in site/_headers
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = join(dirname(fileURLToPath(import.meta.url)), '..', 'site');
const headersPath = join(site, '_headers');
const hashes = new Map();
const pages = ['', 'pt', 'es'].flatMap((d) => { try { return readdirSync(join(site, d)).filter((n) => n.endsWith('.html')).map((n) => (d ? d + '/' : '') + n); } catch { return []; } });
for (const f of pages) {
  const html = readFileSync(join(site, f), 'utf8');
  for (const m of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1] || '';
    if (/\ssrc\s*=/i.test(attrs)) continue;
    const type = (attrs.match(/\stype\s*=\s*["']?([^"'\s>]+)/i) || [])[1];
    if (type && !/^(text|application)\/(javascript|ecmascript)$|^module$/i.test(type)) continue; // JSON-LD etc. never run
    const h = "'sha256-" + createHash('sha256').update(m[2], 'utf8').digest('base64') + "'";
    hashes.set(h, [...(hashes.get(h) || []), f]);
  }
}
for (const [h, files] of hashes) console.log(h, '  ', [...new Set(files)].join(', '));

const headers = readFileSync(headersPath, 'utf8');
const re = /(script-src 'self')((?: 'sha256-[A-Za-z0-9+/=]+')*)/;
if (!re.test(headers)) { console.error("site/_headers: no \"script-src 'self'\" directive found"); process.exit(1); }
const want = [...hashes.keys()].sort();
const have = (headers.match(re)[2].match(/'sha256-[^']+'/g) || []).sort();
const same = want.length === have.length && want.every((h, i) => h === have[i]);
if (process.argv.includes('--write')) {
  if (same) { console.log('site/_headers already up to date'); process.exit(0); }
  writeFileSync(headersPath, headers.replace(re, (_, a) => a + want.map((h) => ' ' + h).join('')));
  console.log('site/_headers updated');
} else if (!same) {
  console.error('site/_headers is out of date: run  node cloudflare/csp-hashes.mjs --write');
  process.exit(1);
} else {
  console.log('site/_headers OK');
}
