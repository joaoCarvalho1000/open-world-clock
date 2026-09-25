// Tests for check-links.mjs, the launch gate that blocks a deploy while Store, GitHub or download links are dead.
// fetch is stubbed, so nothing leaves the machine. Run: npm test (in cloudflare/) or node --test cloudflare/check-links.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { checkLinks, checkFreshness, collectSiteUrls, downloadFiles, downloadPageNames, readConfig, SITE_DIR, PACKAGE_JSON } from './check-links.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = 'owner/app';
const STORE = 'https://apps.microsoft.com/detail/9TEST';
const VERSION = '1.2.0';
const DL = 'https://dl.example.com';
// the names the build gives the files (artifactName in the root package.json)
const SETUP = 'Open-World-Clock-1.2.0-setup.exe';
const PORTABLE = 'Open-World-Clock-1.2.0-portable.exe';
const DIRECT_SETUP = `${DL}/${SETUP}`;
const DIRECT_PORTABLE = `${DL}/${PORTABLE}`;
let dir;

// a tiny site: config.js (with its version and download host), a download page naming the files, and pages linking
// the Store (with campaign tags), the repo, the direct Installer and Portable downloads and an older version's exe
function site(downloadNames = [SETUP, PORTABLE], { siteVersion = VERSION, downloadBase = DL } = {}) {
  const d = mkdtempSync(join(tmpdir(), 'owc-links-'));
  mkdirSync(join(d, 'assets')); mkdirSync(join(d, 'api'));
  const versionLine = siteVersion ? `  version: '${siteVersion}',  // the release the buttons download\n` : '';
  const baseLine = downloadBase ? `  downloadBase: '${downloadBase}', // R2\n` : '';
  writeFileSync(join(d, 'assets', 'config.js'), `/* - version: bump it with each release */\nwindow.SITE = {\n  name: 'X',\n${versionLine}  storeUrl: '${STORE}',  // listing\n${baseLine}  githubRepo: '${REPO}',\n};\n`);
  writeFileSync(join(d, 'download.html'), `<p>It's named <code>${downloadNames[0]}</code>.</p><p>Get <code>${downloadNames[1]}</code>.</p>` +
    `<a href="https://github.com/${REPO}/releases">release notes</a>`);
  writeFileSync(join(d, 'index.html'), `<a href="${STORE}?cid=site-hero">Store</a><a href="${STORE}?cid=site-download">Store</a>` +
    `<a href="https://github.com/${REPO}">repo</a><a href="https://github.com/${REPO}/issues">issues</a>` +
    `<a href="${DIRECT_SETUP}">Installer</a><a href="${DIRECT_PORTABLE}">Portable</a>` +
    `<a href="https://github.com/${REPO}/security/advisories/new">report</a><a href="https://github.com/other/repo">other</a>` +
    `<a href="https://ko-fi.com/x">kofi</a><a href="https://github.com/${REPO}/releases/download/v${VERSION}/${SETUP}">old</a>`);
  writeFileSync(join(d, 'llms.txt'), `Source: https://github.com/${REPO}/blob/main/LICENSE.\nOlder: ${DL}/Open-World-Clock-1.1.0-portable.exe\nElsewhere: https://download.example.org/x.exe\n`);
  writeFileSync(join(d, 'api', 'app.json'), JSON.stringify({ installUrl: STORE, downloadUrl: DIRECT_SETUP }));
  writeFileSync(join(d, 'site.webmanifest'), '{"name":"X"}');
  return d;
}

// fetch stub: every URL answers 200 unless an override says otherwise; records what was requested
function stub(overrides = {}) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    let o = overrides[url];
    if (typeof o === 'function') o = o(calls.filter((u) => u === url).length);
    o = o || {};
    const res = new Response('ok', { status: o.status || 200 });
    Object.defineProperty(res, 'url', { value: o.finalUrl || url });
    return res;
  };
  fn.calls = calls;
  return fn;
}
const run = (fetchImpl, siteDir = dir) => checkLinks({ fetchImpl, siteDir, version: VERSION, storePace: 0, storeBackoff: [0, 0] });

before(() => { dir = site(); });
after(() => { rmSync(dir, { recursive: true, force: true }); });

test('pass: every link answers, and the downloads match the version and download.html', async () => {
  const f = stub();
  const { problems } = await run(f);
  assert.deepEqual(problems, []);
  assert.ok(f.calls.includes(STORE));
  assert.ok(f.calls.includes(`https://github.com/${REPO}/issues`));
  assert.ok(!f.calls.some((u) => u.endsWith('/security/advisories/new')), 'the sign-in-only advisory form is skipped');
  assert.ok(!f.calls.some((u) => u.includes('github.com/other/') || u.includes('ko-fi.com')), 'only Store and this repo');
  assert.ok(!f.calls.some((u) => u.includes('?cid=')), 'campaign-tagged Store links count as the one listing');
  assert.ok(f.calls.includes(DIRECT_SETUP) && f.calls.includes(DIRECT_PORTABLE), 'the direct Installer and Portable downloads are checked');
  assert.equal(f.calls.filter((u) => u === DIRECT_SETUP).length, 1, 'each download is asked for once');
  assert.ok(f.calls.includes(`${DL}/Open-World-Clock-1.1.0-portable.exe`), 'an older version linked from the site is checked too');
  assert.ok(!f.calls.some((u) => u.includes('download.example.org')), 'only the configured download host');
  assert.ok(!f.calls.some((u) => u.startsWith('https://api.github.com/')), 'no GitHub release is looked up');
});

test('rule 8: config.js with the same version as package.json passes', () => {
  assert.equal(readConfig(dir).version, VERSION);
});

test('rule 8: config.js with another version than package.json fails, before any request', async () => {
  const d = site(undefined, { siteVersion: '1.1.0' });
  try {
    const { problems } = await run(stub(), d);
    assert.deepEqual(problems, ['site/assets/config.js says 1.1.0 but package.json is 1.2.0']);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('rule 8: config.js without a version is reported, not thrown', async () => {
  const d = site(undefined, { siteVersion: null });
  try {
    assert.equal(readConfig(d).version, undefined);
    const { problems } = await run(stub(), d);
    assert.deepEqual(problems, ['site/assets/config.js has no version, but package.json is 1.2.0']);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('rule 4: a missing installer or portable exe in the bucket fails, with its URL', async () => {
  const { problems } = await run(stub({ [DIRECT_PORTABLE]: { status: 404 } }));
  assert.deepEqual(problems, [`Portable download ${DIRECT_PORTABLE}: 404`]);
  const r2 = await run(stub({ [DIRECT_SETUP]: { status: 404 } }));
  assert.deepEqual(r2.problems, [`Installer download ${DIRECT_SETUP}: 404`]);
});

test('rule 4: the downloads are checked at the URL config.js builds, even when no page links them', async () => {
  const d = site();
  try {
    writeFileSync(join(d, 'index.html'), '<p>no download links</p>');
    const f = stub();
    const { problems } = await run(f, d);
    assert.deepEqual(problems, []);
    assert.ok(f.calls.includes(DIRECT_SETUP) && f.calls.includes(DIRECT_PORTABLE));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('rule 5: config.js without a downloadBase is reported, and no download is requested', async () => {
  const d = site(undefined, { downloadBase: null });
  try {
    assert.equal(readConfig(d).downloadBase, undefined);
    const f = stub();
    const { problems } = await run(f, d);
    assert.deepEqual(problems, ['site/assets/config.js has no downloadBase (the host that serves the installer and portable exe)']);
    assert.ok(!f.calls.some((u) => u.endsWith('.exe') && u.includes(VERSION) && !u.includes('github.com')));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('rule 5: a downloadBase that is not https fails', async () => {
  const d = site(undefined, { downloadBase: 'http://dl.example.com' });
  try {
    const { problems } = await run(stub(), d);
    assert.deepEqual(problems, ['site/assets/config.js downloadBase http://dl.example.com is not an https URL']);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('rule 7: a dead link to an older version in the bucket fails', async () => {
  const old = `${DL}/Open-World-Clock-1.1.0-portable.exe`;
  const { problems } = await run(stub({ [old]: { status: 404 } }));
  assert.deepEqual(problems, [`Site link ${old}: 404`]);
});

test('downloadFiles builds the names and URLs the way config.js does, with or without a trailing slash', () => {
  const want = [
    { kind: 'setup', name: SETUP, url: DIRECT_SETUP },
    { kind: 'portable', name: PORTABLE, url: DIRECT_PORTABLE },
  ];
  assert.deepEqual(downloadFiles(DL, VERSION), want);
  assert.deepEqual(downloadFiles(DL + '/', VERSION), want);
});

test('rule 1: a dead Store listing (410 to /404/) fails', async () => {
  const { problems } = await run(stub({ [STORE]: { status: 410, finalUrl: 'https://apps.microsoft.com/404/product?errorCode=ProductNotFound' } }));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^Store listing .*410, ended on https:\/\/apps\.microsoft\.com\/404\//);
});

test('rule 1: a Store redirect to a /404/ page fails even with a 200', async () => {
  const { problems } = await run(stub({ [STORE]: { status: 200, finalUrl: 'https://apps.microsoft.com/404/product' } }));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Store listing/);
});

test('rule 1: a Store throttle 403 is retried and passes when the listing answers', async () => {
  const f = stub({ [STORE]: (n) => (n < 3 ? { status: 403 } : {}) });
  const { problems } = await run(f);
  assert.deepEqual(problems, []);
  assert.equal(f.calls.filter((u) => u === STORE).length, 3);
});

test('rule 2: a missing repo fails', async () => {
  const { problems } = await run(stub({ [`https://github.com/${REPO}`]: { status: 404 } }));
  assert.deepEqual(problems, [`GitHub repo https://github.com/${REPO}: 404`]);
});

test('rule 3: a missing LICENSE fails', async () => {
  const { problems } = await run(stub({ [`https://github.com/${REPO}/blob/main/LICENSE`]: { status: 404 } }));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^LICENSE \(links\.license\) .*: 404$/);
});

test('rule 6: download.html naming files with spaces fails, with both names', async () => {
  const d = site(['Open World Clock-1.2.0-setup.exe', 'Open World Clock-1.2.0-portable.exe']);
  try {
    const { problems } = await run(stub(), d);
    assert.deepEqual(problems, [
      'download.html says "Open World Clock-1.2.0-setup.exe" but the file the buttons download is "Open-World-Clock-1.2.0-setup.exe": fix download.html',
      'download.html says "Open World Clock-1.2.0-portable.exe" but the file the buttons download is "Open-World-Clock-1.2.0-portable.exe": fix download.html',
    ]);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('rule 6: download.html that names no portable file fails', async () => {
  const d = site([SETUP, 'the portable one']);
  try {
    const { problems } = await run(stub(), d);
    assert.deepEqual(problems, ['download.html does not name the portable file (expected Open-World-Clock-1.2.0-portable.exe)']);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('rule 6: download.html still naming the previous version fails', async () => {
  const d = site(['Open-World-Clock-1.1.0-setup.exe', PORTABLE]);
  try {
    const { problems } = await run(stub(), d);
    assert.deepEqual(problems, ['download.html says "Open-World-Clock-1.1.0-setup.exe" but the file the buttons download is "Open-World-Clock-1.2.0-setup.exe": fix download.html']);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('site links: a dead repo page linked from the site fails; a network error is reported, not thrown', async () => {
  const issues = `https://github.com/${REPO}/issues`;
  const { problems } = await run(stub({ [issues]: { status: 404 } }));
  assert.deepEqual(problems, [`Site link ${issues}: 404`]);
  const boom = stub();
  const f = async (url, init) => { if (url === issues) throw new Error('getaddrinfo ENOTFOUND'); return boom(url, init); };
  const r2 = await run(f);
  assert.deepEqual(r2.problems, [`Site link ${issues}: request failed (getaddrinfo ENOTFOUND)`]);
});

test('reads the real site: config, download names, and the links it would check', () => {
  const cfg = readConfig(SITE_DIR);
  assert.match(cfg.storeUrl, /^https:\/\/apps\.microsoft\.com\/detail\/\w+$/);
  assert.match(cfg.githubRepo, /^[\w.-]+\/[\w.-]+$/);
  assert.match(cfg.version, /^\d+\.\d+\.\d+/);
  assert.equal(cfg.downloadBase, 'https://download.openworldclock.com');
  // the names the build gives the two files (build.nsis and build.portable artifactName in the root package.json),
  // uploaded to R2 as they are, so the site follows a change to the build's naming
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
  const built = (kind) => pkg.build[kind === 'setup' ? 'nsis' : 'portable'].artifactName
    .replace('${version}', cfg.version).replace('${productName}', pkg.build.productName || pkg.productName);
  assert.deepEqual(downloadFiles(cfg.downloadBase, cfg.version).map((x) => x.name), [built('setup'), built('portable')], 'the gate checks the files the build makes');
  const names = downloadPageNames(SITE_DIR);
  assert.deepEqual(names.slice().sort(), [built('portable'), built('setup')], 'download.html names exactly the two files the build makes');
  const urls = collectSiteUrls(SITE_DIR, cfg.githubRepo, cfg.downloadBase);
  assert.ok(urls.includes('https://github.com/' + cfg.githubRepo));
  for (const kind of ['setup', 'portable']) {
    const direct = cfg.downloadBase + '/' + built(kind);
    assert.ok(urls.includes(direct), 'the direct ' + kind + ' download is among the checked links');
  }
  assert.ok(!urls.some((u) => u.includes('/releases/download/')), 'no page still sends the exe downloads to GitHub');
  assert.ok(urls.every((u) => u.startsWith('https://apps.microsoft.com/') || u.startsWith(cfg.downloadBase + '/') || u.toLowerCase().startsWith('https://github.com/' + cfg.githubRepo.toLowerCase())));
  assert.ok(!urls.some((u) => u.endsWith('/security/advisories/new')));
});

test('config.js builds the same link as the static href on every data-link element of the real site', () => {
  // every <a data-link> on every page, with its static href and campaign id
  const els = [];
  const pages = ['', 'pt', 'es'].flatMap((l) => readdirSync(join(SITE_DIR, l)).filter((f) => f.endsWith('.html')).map((f) => (l ? l + '/' : '') + f));
  for (const n of pages) {
    const html = readFileSync(join(SITE_DIR, n), 'utf8');
    for (const m of html.matchAll(/<a\b[^>]*\bdata-link="[^"]*"[^>]*>/g)) {
      const attrs = {};
      for (const a of m[0].matchAll(/([\w-]+)="([^"]*)"/g)) attrs[a[1]] = a[2].replace(/&amp;/g, '&');
      els.push({ page: n, href0: attrs.href, attrs, getAttribute: (k) => (k in attrs ? attrs[k] : null), setAttribute: (k, v) => { attrs[k] = v; } });
    }
  }
  assert.ok(els.some((e) => e.attrs['data-link'] === 'setup') && els.some((e) => e.attrs['data-link'] === 'portable'));
  const document = { readyState: 'complete', querySelectorAll: (sel) => (sel === '[data-link]' ? els : []), addEventListener: () => {} };
  const ctx = { document };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(SITE_DIR, 'assets', 'config.js'), 'utf8'), ctx, { filename: 'config.js' });
  const wrong = els.filter((e) => e.attrs.href !== e.href0).map((e) => e.page + ' data-link="' + e.attrs['data-link'] + '": static ' + e.href0 + ', config.js ' + e.attrs.href);
  assert.deepEqual(wrong, [], 'a visitor with JavaScript gets the same links as the static HTML');
});

test('OWC_SKIP_LINK_CHECK=1 skips with a loud warning and exits 0', () => {
  const r = spawnSync(process.execPath, [join(here, 'check-links.mjs')], { env: { ...process.env, OWC_SKIP_LINK_CHECK: '1' }, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /OWC_SKIP_LINK_CHECK=1: the Store, GitHub and download link check was SKIPPED/);
});

// ---------- rule 9: freshness dates agree (offline) ----------
// a site with a sitemap, two pages with JSON-LD dateModified, llms-full.txt and a privacy page, dated 24 September
function freshSite({ lastmods = {}, planner = '2026-09-24', llms = '24 September 2026', privacy = '24 September 2026' } = {}) {
  const d = site();
  const mod = { '/': '2026-09-24', '/meeting-planner': '2026-09-24', '/privacy': '2026-09-24', '/llms-full.txt': '2026-09-24', '/world-map': '2026-09-23', ...lastmods };
  const urls = Object.entries(mod).map(([p, m]) => `  <url>\n    <loc>https://openworldclock.com${p}</loc>\n    <lastmod>${m}</lastmod>\n  </url>`).join('\n');
  writeFileSync(join(d, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  writeFileSync(join(d, 'meeting-planner.html'), `<script type="application/ld+json">{ "datePublished": "2026-09-23", "dateModified": "${planner}" }</script><h1>Planner</h1>`);
  writeFileSync(join(d, 'world-map.html'), '<script type="application/ld+json">\n{\n "dateModified": "2026-09-23"\n}\n</script>');
  writeFileSync(join(d, 'llms-full.txt'), `# X\n\nThis file is the description. Last updated: ${llms}. Current version: 1.2.0.\n`);
  writeFileSync(join(d, 'privacy.html'), `<h1>Privacy policy</h1>\n      <p class="updated">Last updated ${privacy}</p>`);
  return d;
}
const withFresh = async (opts, fn) => { const d = freshSite(opts); try { await fn(d); } finally { rmSync(d, { recursive: true, force: true }); } };

test('rule 9: matching dates pass, and a site without a sitemap has nothing to compare', async () => {
  await withFresh({}, (d) => assert.deepEqual(checkFreshness(d), []));
  assert.deepEqual(checkFreshness(dir), []);
  // a Last updated newer than the lastmod is fine: only an older one means the sitemap claims an edit the file lacks
  await withFresh({ llms: '25 September 2026', privacy: '30 September 2026' }, (d) => assert.deepEqual(checkFreshness(d), []));
});

test('rule 9: a page whose JSON-LD dateModified differs from its sitemap lastmod fails, before any request', async () => {
  await withFresh({ planner: '2026-09-23' }, async (d) => {
    const line = 'site/meeting-planner.html dateModified 2026-09-23 but sitemap lastmod 2026-09-24';
    assert.deepEqual(checkFreshness(d), [line]);
    const f = stub();
    const { problems } = await run(f, d);
    assert.deepEqual(problems, [line]);
  });
  await withFresh({ lastmods: { '/world-map': '2026-09-24' } }, (d) =>
    assert.deepEqual(checkFreshness(d), ['site/world-map.html dateModified 2026-09-23 but sitemap lastmod 2026-09-24']));
});

test('rule 9: llms-full.txt Last updated older than its sitemap lastmod fails', async () => {
  await withFresh({ llms: '23 September 2026' }, (d) =>
    assert.deepEqual(checkFreshness(d), ['site/llms-full.txt Last updated 2026-09-23 but sitemap lastmod 2026-09-24']));
});

test('rule 9: privacy.html Last updated older than the /privacy lastmod fails', async () => {
  await withFresh({ privacy: '23 September 2026' }, (d) =>
    assert.deepEqual(checkFreshness(d), ['site/privacy.html Last updated 2026-09-23 but sitemap lastmod 2026-09-24']));
  await withFresh({ privacy: '24 Setembro 2026' }, (d) =>
    assert.deepEqual(checkFreshness(d), ['site/privacy.html Last updated "Last updated 24 Setembro 2026" is not a date like 24 September 2026']));
});

test('rule 9: the real site/ dates agree', () => {
  assert.deepEqual(checkFreshness(SITE_DIR), []);
});

// ---------- the Portuguese (site/pt/) and Spanish (site/es/) pages ----------
test('rule 9: /pt/ and /es/ pages are read from their folders (/pt/ is pt/index.html), and their dates must agree too', async () => {
  const add = (d) => {
    mkdirSync(join(d, 'pt'), { recursive: true }); mkdirSync(join(d, 'es'), { recursive: true });
    const sm = readFileSync(join(d, 'sitemap.xml'), 'utf8').replace('</urlset>',
      ['/pt/', '/es/features'].map((p) => `  <url>
    <loc>https://openworldclock.com${p}</loc>
    <lastmod>2026-09-25</lastmod>
  </url>
`).join('') + '</urlset>');
    writeFileSync(join(d, 'sitemap.xml'), sm);
  };
  await withFresh({}, (d) => {
    add(d);
    writeFileSync(join(d, 'pt', 'index.html'), '<script type="application/ld+json">{"dateModified": "2026-09-25"}</script>');
    writeFileSync(join(d, 'es', 'features.html'), '<script type="application/ld+json">{"dateModified": "2026-09-24"}</script>');
    assert.deepEqual(checkFreshness(d), ['site/es/features.html dateModified 2026-09-24 but sitemap lastmod 2026-09-25']);
  });
});

test('rule 9: the Portuguese and Spanish privacy policies are read in their own words and months', async () => {
  const add = (d, pt, es) => {
    mkdirSync(join(d, 'pt'), { recursive: true }); mkdirSync(join(d, 'es'), { recursive: true });
    const sm = readFileSync(join(d, 'sitemap.xml'), 'utf8').replace('</urlset>',
      ['/pt/privacy', '/es/privacy'].map((p) => `  <url>
    <loc>https://openworldclock.com${p}</loc>
    <lastmod>2026-09-25</lastmod>
  </url>
`).join('') + '</urlset>');
    writeFileSync(join(d, 'sitemap.xml'), sm);
    writeFileSync(join(d, 'pt', 'privacy.html'), '<p class="updated">' + pt + '</p>');
    writeFileSync(join(d, 'es', 'privacy.html'), '<p class="updated">' + es + '</p>');
  };
  await withFresh({}, (d) => {
    add(d, 'Última atualização: 25 de setembro de 2026', 'Última actualización: 25 de septiembre de 2026');
    assert.deepEqual(checkFreshness(d), []);
  });
  await withFresh({}, (d) => {
    add(d, 'Última atualização: 24 de setembro de 2026', 'Última actualización: 25 de setiembre de 2026');
    assert.deepEqual(checkFreshness(d), ['site/pt/privacy.html Last updated 2026-09-24 but sitemap lastmod 2026-09-25']);
  });
  await withFresh({}, (d) => {
    add(d, 'Última atualização: 25 de September de 2026', 'Actualizado hace poco');
    assert.deepEqual(checkFreshness(d), [
      'site/pt/privacy.html Last updated "Última atualização: 25 de September de 2026" is not a date like 24 de setembro de 2026',
      'site/es/privacy.html has no "Last updated" date, but sitemap lastmod is 2026-09-25',
    ]);
  });
});

test('rules 6 and 7: the download pages in every language name the release files, and their links are checked', () => {
  const d = site();
  try {
    mkdirSync(join(d, 'pt'), { recursive: true });
    writeFileSync(join(d, 'pt', 'download.html'), '<code>Open-World-Clock-1.1.0-setup.exe</code> <a href="https://github.com/joaoCarvalho1000/open-world-clock/issues">x</a>');
    assert.ok(downloadPageNames(d).includes('Open-World-Clock-1.1.0-setup.exe'), 'a stale name on pt/download.html is found');
    assert.ok(collectSiteUrls(d, 'joaoCarvalho1000/open-world-clock').includes('https://github.com/joaoCarvalho1000/open-world-clock/issues'));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('storeLive false: no Store URL is requested, and a dead Store listing does not block the deploy', async () => {
  const d = site();
  try {
    const cfg = join(d, 'assets', 'config.js');
    writeFileSync(cfg, readFileSync(cfg, 'utf8').replace("  storeUrl:", "  storeLive: false,\n  storeUrl:"));
    assert.equal(readConfig(d).storeLive, false);
    const f = stub({ [STORE]: { status: 404 } });
    const { problems } = await run(f, d);
    assert.deepEqual(problems, []);
    assert.ok(!f.calls.some((u) => u.startsWith('https://apps.microsoft.com/')), 'the Store is not asked');
    assert.ok(f.calls.includes(DIRECT_SETUP) && f.calls.includes(DIRECT_PORTABLE), 'the downloads still are');
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('the real site: storeLive is read from config.js (true or false, never missing)', () => {
  assert.equal(typeof readConfig(SITE_DIR).storeLive, 'boolean');
});
