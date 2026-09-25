#!/usr/bin/env node
// Builds the web version of Open World Clock into site/app/ from the Windows app's renderer (src/renderer/) plus web/.
// One source of truth: the renderer's scripts and styles are taken as they are, in the order src/renderer/index.html
// loads them, and joined into one script (app.bundle.js) and one stylesheet (app.bundle.css), each part under a
// banner naming its source file. Nothing inside them is rewritten. Joining them takes a first visit from 34
// requests to 13, which shortens the first paint on slow connections. The world map's three files go into a second
// pair (app.later.js, app.later.css) that web.js loads after the page (see LATER below).
// index.html is the renderer's own page with: html class "is-web", a short head (title, noindex), the
// Content-Security-Policy for the site, the shared link banner, shim.js (window.wc for browsers) before any app script,
// web.css after the app's styles and web.js (deferred) after the app. The page is the live app in the home page's hero
// (an iframe of /app/): no manifest, no service worker, no analytics of its own (the home page already counts the visit).
// Re-runnable: site/app/ is deleted and written again every time. The output depends only on the sources (no dates,
// LF line endings), so the same sources always give the same bytes.
// Usage: node scripts/build-web.mjs           build site/app/
//        node scripts/build-web.mjs --check   build to a temporary folder and fail if site/app/ differs (a stale build)
// Docs: web/README.md
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src', 'renderer');
const WEB = path.join(ROOT, 'web');
const SITE = path.join(ROOT, 'site');
const APP = path.join(SITE, 'app'); // where the page lives (links such as ../assets resolve from here)
const CHECK = process.argv.includes('--check');
const OUT = CHECK ? fs.mkdtempSync(path.join(os.tmpdir(), 'owc-web-')) : APP; // where this run writes
if (CHECK) process.on('exit', () => { try { fs.rmSync(OUT, { recursive: true, force: true }); } catch { /* gone */ } });
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION = pkg.version;

// Content-Security-Policy for the page (meta tag). It matches the /app/* rule for site/_headers given in web/README.md,
// minus the directives a meta tag cannot carry (frame-ancestors) or that break plain-http local previews
// (upgrade-insecure-requests). No inline scripts or styles: everything is a file from this origin.
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self'", "img-src 'self' data:", "font-src 'self'",
  "connect-src 'self'", "manifest-src 'none'", "worker-src 'none'", "media-src 'none'", "object-src 'none'",
  "frame-src 'none'", "base-uri 'self'", "form-action 'self'",
].join('; ');

const fail = (msg) => { console.error('build-web: ' + msg); process.exit(1); };
const read = (p) => fs.readFileSync(p, 'utf8');
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const lf = (s) => s.replace(/\r\n/g, '\n');
const TEXT = /\.(html|js|css|json|webmanifest|txt|md)$/;
// file contents, text with LF line endings, so CRLF and LF checkouts build and hash the same
const bytes = (p) => (TEXT.test(p) ? Buffer.from(lf(read(p))) : fs.readFileSync(p));
// a page reference: files next to the page come from this run's output, ../ ones from site/
const resolveRef = (r) => (r.startsWith('../') ? path.resolve(APP, r) : path.resolve(OUT, r));

function listFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p));
    else if (e.isFile()) out.push(p);
  }
  return out;
}
// Replace exactly one match or stop: a renderer change that moves an anchor must fail the build, not ship a broken page.
function replaceOnce(html, re, fn, what) {
  const matches = html.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'));
  if (!matches || matches.length !== 1) fail(`expected exactly one ${what} in src/renderer/index.html, found ${matches ? matches.length : 0}`);
  return html.replace(re, fn);
}

// ---------- 1. fresh output folder ----------
if (!CHECK) {
  if (path.basename(OUT) !== 'app' || path.dirname(OUT) !== SITE) fail('refusing to write outside site/app');
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
}

// ---------- 2. the renderer's page, styles and scripts ----------
let html = lf(read(path.join(SRC, 'index.html')));
const styleTags = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)" \/>\n?/g)];
const scriptTags = [...html.matchAll(/<script src="([^"]+)"><\/script>\n?/g)];
if (!styleTags.length || !scriptTags.length) fail('no stylesheets or scripts found in src/renderer/index.html');
if (scriptTags[scriptTags.length - 1][1] !== 'app.js') fail('app.js must be the last script in src/renderer/index.html');
// every renderer file must be loaded by the page, so nothing is left out of the bundles by mistake
const used = new Set([...styleTags, ...scriptTags].map((m) => m[1]));
for (const p of listFiles(SRC)) {
  const r = path.relative(SRC, p).split(path.sep).join('/');
  if (r !== 'index.html' && /\.(js|css)$/.test(r) && !used.has(r)) fail(`src/renderer/${r} is not loaded by index.html`);
}
// The world map is not needed for the first paint: it only draws when someone opens it, and app.js reaches it only
// through window.WCMap, guarded (a missing module is harmless). Its three files (44 KB of script and 10 KB of styles,
// about a sixth of the page's code) go into app.later.js and app.later.css, which web.js loads once the page has
// loaded, at idle, or at once when the map is asked for first. On a slow phone that takes them off the path to the
// first paint of the clocks. Their order is kept; every other file stays in the main bundles in the page's order.
const LATER = ['views/world-land.js', 'views/map.js', 'views/map.css'];
for (const r of LATER) if (!used.has(r)) fail(`src/renderer/${r} is no longer loaded by index.html: update LATER in scripts/build-web.mjs`);
const isLater = (r) => LATER.includes(r);
const banner = (r) => `/* ---------- src/renderer/${r} ---------- */\n`;
const cssPart = (r) => {
  const text = lf(read(path.join(SRC, r)));
  // one folder for every part: relative url()s and @import would point somewhere else from app.bundle.css
  if (/@import/.test(text) || [...text.matchAll(/url\(\s*["']?([^"')]+)/g)].some((m) => !/^(data:|#)/.test(m[1]))) fail(`src/renderer/${r} uses @import or a relative url()`);
  return banner(r) + text.replace(/\s*$/, '\n') + '\n';
};
// Each script runs in its own try block, so a failure in one still lets the rest start (as separate files would);
// the renderer's scripts declare nothing at the top level (checked here), so a block changes nothing else.
const jsPart = (r) => {
  const text = lf(read(path.join(SRC, r)));
  if (/^(const|let|var|function|class|async function)\s/m.test(text)) fail(`src/renderer/${r} has a top-level declaration; it cannot share app.bundle.js safely`);
  if (/^\s*['"]use strict['"]/.test(text)) fail(`src/renderer/${r} starts with a top-level "use strict"`);
  return banner(r) + 'try {\n' + text.replace(/\s*$/, '\n') + `} catch (e) { console.error('Open World Clock: ${r} failed to start', e); }\n\n`;
};
const joinParts = (tags, part, later) => tags.map((m) => m[1]).filter((r) => isLater(r) === later).map(part).join('');
fs.writeFileSync(path.join(OUT, 'app.bundle.css'), joinParts(styleTags, cssPart, false));
fs.writeFileSync(path.join(OUT, 'app.bundle.js'), joinParts(scriptTags, jsPart, false));
fs.writeFileSync(path.join(OUT, 'app.later.css'), joinParts(styleTags, cssPart, true));
fs.writeFileSync(path.join(OUT, 'app.later.js'), joinParts(scriptTags, jsPart, true));

// ---------- 3. web files ----------
const WEB_FILES = ['shim.js', 'web.js', 'web.css'];
for (const name of WEB_FILES) {
  let text = lf(read(path.join(WEB, name)));
  if (name === 'shim.js') {
    if (!text.includes("'__OWC_VERSION__'")) fail('web/shim.js lost its version placeholder');
    text = text.replace("'__OWC_VERSION__'", `'${VERSION.replace(/[^0-9A-Za-z.+-]/g, '')}'`);
  }
  fs.writeFileSync(path.join(OUT, name), text);
}

// ---------- 4. index.html ----------
const head = lf(read(path.join(WEB, 'head.html'))).replace(/\{\{VERSION\}\}/g, VERSION).trim();
const top = lf(read(path.join(WEB, 'top.html'))).trim();
html = replaceOnce(html, /<html lang="en">/, () => '<html lang="en" class="is-web">', '<html lang="en">');
html = replaceOnce(html, /<meta http-equiv="Content-Security-Policy"[^>]*>/, () => `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`, 'CSP meta tag');
// The SEO title stays: without data-i18n, app.js leaves it alone. The shim comes before the styles so the first paint
// already has the saved theme and layout. The app's script is at the end of the body, where the browser finds it only
// once the shim has run; a preload asks for it together with the shim and the styles, ahead of the brand font.
html = replaceOnce(html, /<title[^>]*>[^<]*<\/title>/, () => `${head}\n<link rel="preload" href="app.bundle.js" as="script" fetchpriority="high" />\n<script src="shim.js"></script>`, '<title>');
const firstStyle = styleTags[0][0];
html = html.replace(firstStyle, '\u0000STYLES\u0000');
for (const m of styleTags.slice(1)) html = html.replace(m[0], '');
html = html.replace('\u0000STYLES\u0000', '<link rel="stylesheet" href="app.bundle.css" />\n<link rel="stylesheet" href="web.css" />\n');
html = html.replace(scriptTags[0][0], '\u0000SCRIPTS\u0000');
for (const m of scriptTags.slice(1)) html = html.replace(m[0], '');
html = html.replace('\u0000SCRIPTS\u0000', [
  '<script src="app.bundle.js"></script>',
  // deferred: it runs once the page is parsed, still after the app (a normal script), and never holds up the parser
  '<script src="web.js" defer></script>',
].join('\n') + '\n');
html = replaceOnce(html, /<body>\n(?=<div id="app")/, () => `<body>\n${top}\n`, '<body> followed by <div id="app">');
if (html.indexOf('src="shim.js"') > html.indexOf('src="app.bundle.js"')) fail('shim.js must load before the app');
fs.writeFileSync(path.join(OUT, 'index.html'), html);

// ---------- 5. checks: every local reference resolves, the copy has no dashes ----------
const exists = (ref) => fs.existsSync(resolveRef(ref.split(/[?#]/)[0]));
const need = (ref, what) => { if (!exists(ref)) fail(`${what} missing: ${ref}`); };
const refs = [...html.matchAll(/\s(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((r) => !/^(https?:|mailto:|#|data:)/.test(r));
for (const r of refs) {
  if (r.startsWith('/')) { if (!fs.existsSync(path.join(SITE, r.slice(1))) && !fs.existsSync(path.join(SITE, r.slice(1) + '.html'))) fail(`index.html links to missing ${r}`); }
  else need(r, 'index.html link');
}
for (const f of [...WEB_FILES, 'head.html', 'top.html', 'README.md']) {
  const p = path.join(WEB, f);
  if (fs.existsSync(p) && /[\u2013\u2014]/.test(read(p))) fail(`web/${f} contains an en or em dash`);
}

// ---------- 6. --check: compare with site/app/ ----------
if (CHECK) {
  const names = (dir) => (fs.existsSync(dir) ? listFiles(dir).map((p) => path.relative(dir, p).split(path.sep).join('/')).sort() : []);
  const want = names(OUT), have = names(APP);
  const diff = [...new Set([...want, ...have])]
    .filter((n) => !want.includes(n) || !have.includes(n) || !bytes(path.join(OUT, n)).equals(bytes(path.join(APP, n))));
  fs.rmSync(OUT, { recursive: true, force: true });
  if (diff.length) fail(`site/app/ is out of date (${diff.join(', ')}): run  node scripts/build-web.mjs`);
  console.log('build-web: site/app/ is up to date');
  process.exit(0);
}

// ---------- 7. summary ----------
let raw = 0, br = 0;
const all = listFiles(OUT);
for (const p of all) { const b = fs.readFileSync(p); raw += b.length; br += zlib.brotliCompressSync(b).length; }
const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log(`build-web: ${rel(OUT)}/ from ${rel(SRC)}/ (${styleTags.length} stylesheets, ${scriptTags.length} scripts) and web/`);
console.log(`build-web: version ${VERSION}`);
console.log(`build-web: ${all.length} files, ${kb(raw)} (${kb(br)} with Brotli)`);

