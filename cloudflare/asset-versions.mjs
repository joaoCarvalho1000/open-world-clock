// Cache-busting for the site's own scripts and styles: `node cloudflare/asset-versions.mjs` checks, `--write` fixes.
// Every <script src="…/assets/x.js"> and <link href="…/assets/x.css"> in site/**/*.html gets ?v=<first 10 hex of the
// file's SHA-256>. The zone's browser cache keeps /assets/* for hours, so without this a visitor could run an old
// config.js or site.js after a deploy. A changed file gets a new URL; an unchanged file keeps its cached copy.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const WRITE = process.argv.includes('--write');

const hashes = new Map();
const hashOf = (rel) => {
  if (!hashes.has(rel)) {
    const file = path.join(SITE, rel);
    hashes.set(rel, fs.existsSync(file) ? createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 10) : null);
  }
  return hashes.get(rel);
};

const pages = [];
(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) { if (name !== 'app') walk(p); } else if (name.endsWith('.html')) pages.push(p);
  }
})(SITE);

const RE = /((?:src|href)=")((?:\.\.\/|\/)?assets\/[\w./-]+\.(?:js|css))(?:\?v=[0-9a-f]*)?(")/g;
let stale = 0, missing = 0;
for (const page of pages) {
  const html = fs.readFileSync(page, 'utf8');
  const out = html.replace(RE, (m, pre, ref, post) => {
    const rel = ref.replace(/^(\.\.\/|\/)/, '');
    const h = hashOf(rel);
    if (!h) { missing++; console.error(`missing asset ${ref} in ${path.relative(SITE, page)}`); return m; }
    return `${pre}${ref}?v=${h}${post}`;
  });
  if (out !== html) {
    stale++;
    if (WRITE) fs.writeFileSync(page, out);
    else console.error(`stale asset versions: ${path.relative(SITE, page)}`);
  }
}
if (missing) process.exit(1);
if (!WRITE && stale) { console.error(`asset-versions: ${stale} page(s) out of date. Run: node cloudflare/asset-versions.mjs --write`); process.exit(1); }
console.log(`asset-versions: ${WRITE ? `wrote ${stale} page(s)` : 'OK'} (${pages.length} pages, ${hashes.size} assets)`);
