// Unit tests for web/shim.js (the browser window.wc): the settings rules must match src/main.js exactly, and the
// storage, shared-link and window-flag behavior must hold. Run: node --test test/web/shim.test.mjs
// src/main.js needs Electron, so its DEFAULTS and VALIDATE are read from the source and run in a sandbox with stubs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MAIN = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
const SHIM = fs.readFileSync(path.join(ROOT, 'web', 'shim.js'), 'utf8');

// ---------- src/main.js rules, in a sandbox ----------
function mainRules() {
  const start = MAIN.indexOf('const LAYOUT_SIZES = {');
  const vStart = MAIN.indexOf('const VALIDATE = {');
  const end = MAIN.indexOf('\n};', vStart);
  assert.ok(start > 0 && vStart > start && end > vStart, 'could not find DEFAULTS and VALIDATE in src/main.js');
  const code = MAIN.slice(start, end + 3) + '\n;({ DEFAULTS, VALIDATE, MAIN_OWNED })';
  const ctx = vm.createContext({
    process: { env: {}, platform: 'linux', windowsStore: false },
    os: { release: () => '10.0.19045' },
    app: { disableHardwareAcceleration() {} },
    shell: { openExternal: () => Promise.resolve() },
  });
  return { ctx, rules: vm.runInContext(code, ctx) };
}

// ---------- web/shim.js, in a fake browser ----------
// The page runs in the home page's hero, an iframe: `parent` is the home page (its hash is parentHash). topLevel: the
// page opened on its own instead.
function fakeBrowser({ hash = '', parentHash = '', topLevel = false, languages = ['en-GB'], stored = null, narrow = false, siteTheme = null } = {}) {
  const store = new Map();
  if (stored !== null) store.set('owc-app-settings', typeof stored === 'string' ? stored : JSON.stringify(stored));
  if (siteTheme) store.set('wc-theme', siteTheme);
  const winListeners = {}, docListeners = {}, replaced = [];
  const classes = new Set();
  const mq = (matches) => ({ matches, listeners: [], addEventListener(t, fn) { this.listeners.push(fn); } });
  const queries = { narrow: mq(narrow), dark: mq(false) };
  const ctx = {
    console,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); },
    },
    navigator: { languages, language: languages[0] },
    location: { hash, pathname: '/app/', search: '', replace: (u) => { replaced.push(u); } },
    isSecureContext: true,
    document: {
      documentElement: { dataset: {}, classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) } },
      addEventListener: (t, fn) => { (docListeners[t] ||= []).push(fn); },
    },
    matchMedia: (q) => (/max-width/.test(q) ? queries.narrow : queries.dark),
    addEventListener: (t, fn) => { (winListeners[t] ||= []).push(fn); },
  };
  ctx.window = ctx;
  ctx.self = ctx;
  const homeListeners = {};
  const home = { location: { hash: parentHash, pathname: '/', search: '' }, addEventListener: (t, fn) => { (homeListeners[t] ||= []).push(fn); } };
  ctx.top = topLevel ? ctx : home;
  ctx.parent = topLevel ? ctx : home;
  vm.createContext(ctx);
  vm.runInContext(SHIM, ctx);
  // Values cross between realms as JSON: patches are made in the sandbox's realm, results come back as plain data.
  const inRealm = (v) => (v === undefined ? v : vm.runInContext('JSON', ctx).parse(JSON.stringify(v)));
  const plain = (v) => (v === undefined || v === null || typeof v !== 'object' ? v : JSON.parse(JSON.stringify(v)));
  const wc = {
    ...ctx.wc,
    getSettings: async () => plain(await ctx.wc.getSettings()),
    setSettings: async (patch) => plain(await ctx.wc.setSettings(inRealm(patch))),
    onSettings: (cb) => ctx.wc.onSettings((s) => cb(plain(s))),
  };
  const web = {
    ...ctx.WCWeb,
    parseShare: (h) => plain(ctx.WCWeb.parseShare(h)),
    buildShare: (zones, conv) => ctx.WCWeb.buildShare(inRealm(zones), inRealm(conv)),
  };
  return {
    ctx, store, classes, queries, wc, web, replaced,
    fireStorage: (key) => (winListeners.storage || []).forEach((fn) => fn({ key, storageArea: ctx.localStorage })),
    fireNarrow: (m) => { queries.narrow.matches = m; queries.narrow.listeners.forEach((fn) => fn()); },
    // a new hash on this page (own) or on the home page around it
    fireHash: (h, own = true) => { if (own) { ctx.location.hash = h; (winListeners.hashchange || []).forEach((fn) => fn()); } else { home.location.hash = h; (homeListeners.hashchange || []).forEach((fn) => fn()); } },
    saved: () => JSON.parse(store.get('owc-app-settings') || 'null'),
  };
}
// Objects must be created in the realm that validates them (isPlainObject compares prototypes), so every input is
// source text evaluated inside each sandbox; results come back as JSON text.
const INPUTS = [
  'undefined', 'null', 'true', 'false', '0', '1', '-1', '0.3', '0.59', '0.6', '0.85', '1.2', '2.345', '3.8', '4', 'NaN', 'Infinity', '-Infinity',
  "''", "'strip'", "'compact'", "'vertical'", "'map'", "'Strip'", "'system'", "'light'", "'dark'", "'auto'", "'en'", "'pt'", "'es'", "'fr'",
  '[]', "['Europe/Lisbon']", "['Europe/Lisbon', 'Europe/Lisbon', 'Asia/Tokyo']", "['Bad/Zone', 'Asia/Tokyo']", "['x'.repeat(70)]", '[1, 2]', "['UTC', 'Etc/GMT+5']",
  '{}', "({ 'Europe/Lisbon': 'Home' })", "({ 'Europe/Lisbon': '  Home  ', 'Asia/Tokyo': '' })", "({ 'Europe/Lisbon': 'x'.repeat(41) })",
  "({ 'Bad/Zone': 'x', 'Asia/Tokyo': 5 })", "({ ['x'.repeat(70)]: 'long key' })",
  "({ 'Asia/Tokyo': { start: '09:00', end: '17:00', days: [5, 1, 2] } })",
  "({ 'Asia/Tokyo': { start: '9:00', end: '17:00', days: [1] }, 'Europe/Paris': { start: '22:00', end: '06:00', days: [0, 6], extra: 1 } })",
  "({ 'Asia/Tokyo': { start: '10:00', end: '10:00', days: [1] }, 'Europe/Paris': { start: '08:00', end: '16:00', days: [1, 1] } })",
  "({ 'Asia/Tokyo': { start: '08:00', end: '16:00', days: [] }, 'Europe/Paris': { start: '08:00', end: '16:00', days: [0,1,2,3,4,5,6,0] } })",
  "({ 'Asia/Tokyo': { start: '08:00', end: '24:00', days: [1] }, 'Europe/Paris': { start: '08:00', end: '16:00', days: [7] } })",
  "({ strip: { width: 100, height: 50 }, map: { width: 20000, height: 500 }, bogus: { width: 1, height: 1 }, planner: { width: 1.5, height: 2 } })",
  "({ vertical: { width: 300, height: 640 }, mapVertical: 'x', plannerVertical: { width: 400, height: 900 } })",
  'Object.create(null)', 'new Date(0)', "({ toString() { return 'strip'; } })",
];
const evalIn = (ctx, fnSrc) => vm.runInContext(fnSrc, ctx);

test('DEFAULTS match src/main.js', () => {
  const { ctx } = mainRules();
  const b = fakeBrowser();
  const main = evalIn(ctx, 'JSON.stringify(DEFAULTS)');
  const web = evalIn(b.ctx, 'JSON.stringify(WCWeb.rules.DEFAULTS)');
  assert.equal(web, main);
});

test('VALIDATE has the same keys and gives the same result for every input as src/main.js', () => {
  const { ctx } = mainRules();
  const b = fakeBrowser();
  const mainKeys = JSON.parse(evalIn(ctx, 'JSON.stringify(Object.keys(VALIDATE).sort())'));
  const webKeys = JSON.parse(evalIn(b.ctx, 'JSON.stringify(Object.keys(WCWeb.rules.VALIDATE).sort())'));
  assert.deepEqual(webKeys, mainKeys);
  assert.deepEqual(JSON.parse(evalIn(b.ctx, 'JSON.stringify([...WCWeb.rules.MAIN_OWNED])')), JSON.parse(evalIn(ctx, 'JSON.stringify([...MAIN_OWNED])')));
  let checked = 0;
  for (const key of mainKeys) {
    for (const input of INPUTS) {
      const run = (c, v) => evalIn(c, `(() => { const r = ${v}[${JSON.stringify(key)}](${input}); return r === undefined ? 'undefined' : JSON.stringify(r); })()`);
      assert.equal(run(b.ctx, 'WCWeb.rules.VALIDATE'), run(ctx, 'VALIDATE'), `VALIDATE.${key}(${input})`);
      checked++;
    }
  }
  assert.ok(checked >= mainKeys.length * INPUTS.length);
});

test('first run: defaults, 12 or 24-hour clock from the browser locale, nothing written until a save', async () => {
  const us = fakeBrowser({ languages: ['en-US'] });
  const s = await us.wc.getSettings();
  assert.equal(s.firstRun, true);
  assert.equal(s.hour12, true);
  assert.deepEqual(s.zones, ['Europe/Lisbon', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Singapore']);
  assert.equal(us.saved(), null);
  const gb = fakeBrowser({ languages: ['en-GB'] });
  assert.equal((await gb.wc.getSettings()).hour12, false);
  await gb.wc.setSettings({ zones: ['Asia/Tokyo'], firstRun: false });
  assert.equal(gb.saved().hour12, false);
  assert.deepEqual(gb.saved().zones, ['Asia/Tokyo']);
});

test('publicSettings flags: web build, not Store, not portable, no window backdrop', async () => {
  const b = fakeBrowser({ languages: ['pt-PT', 'en'] });
  const s = await b.wc.getSettings();
  assert.equal(s.web, true);
  assert.equal(s.store, false);
  assert.equal(s.portable, false);
  assert.equal(s.backdrop, 'none');
  assert.equal(s.snap, false);
  assert.equal(s.shortcut, '');
  assert.equal(s.systemLanguage, 'pt');
  assert.equal(typeof s.version, 'string');
});

test('setSettings validates like main: bad values and main-owned keys are ignored, the rest is saved', async () => {
  const b = fakeBrowser({ stored: { zones: ['Asia/Tokyo'], firstRun: false } });
  const s = await b.wc.setSettings({ opacity: 0.1, theme: 'purple', viewSizes: { strip: { width: 500, height: 300 } }, bogus: 1, zones: ['Asia/Tokyo', 'No/Where'] });
  assert.equal(s.opacity, 0.6);
  assert.equal(s.theme, 'system');
  assert.deepEqual(s.viewSizes, {});
  assert.equal('bogus' in s, false);
  assert.deepEqual(s.zones, ['Asia/Tokyo']);
  assert.equal(b.saved().opacity, 0.6);
});

test('no layout choice on the web: a layout patch is ignored, never saved, and leaves the planner open', async () => {
  const b = fakeBrowser({ stored: { firstRun: false, planner: true } });
  const s = await b.wc.setSettings({ layout: 'vertical' });
  assert.equal(s.layout, 'strip');
  assert.equal(s.planner, true);
  assert.deepEqual(b.saved(), { firstRun: false, planner: true }); // nothing changed, nothing written
  await b.wc.setSettings({ layout: 'compact', hour12: true });
  assert.equal(b.saved().hour12, true);
  assert.equal(b.saved().layout, 'strip'); // the default, never the patch
});

test('stored settings are validated on load; corrupt storage falls back to the defaults', async () => {
  const b = fakeBrowser({ stored: { zones: ['Asia/Tokyo', 42], labels: { 'Asia/Tokyo': 'Office', 'Bad/Zone': 'x' }, layout: 'huge', firstRun: false, hour12: true } });
  const s = await b.wc.getSettings();
  assert.deepEqual(s.zones, ['Europe/Lisbon', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Singapore']); // bad list rejected whole
  assert.deepEqual(s.labels, { 'Asia/Tokyo': 'Office' });
  assert.equal(s.layout, 'strip');
  assert.equal(s.hour12, true);
  const c = fakeBrowser({ stored: '{not json' });
  assert.equal((await c.wc.getSettings()).firstRun, true);
});

test('another tab saving reaches onSettings (storage event); unsubscribe works', async () => {
  const b = fakeBrowser({ stored: { zones: ['Asia/Tokyo'], firstRun: false } });
  const seen = [];
  const off = b.wc.onSettings((s) => seen.push(s.zones));
  b.store.set('owc-app-settings', JSON.stringify({ zones: ['Asia/Tokyo', 'Europe/Paris'], firstRun: false }));
  b.fireStorage('owc-app-settings');
  assert.deepEqual(seen, [['Asia/Tokyo', 'Europe/Paris']]);
  off();
  b.fireStorage('owc-app-settings');
  assert.equal(seen.length, 1);
});

test('the layout follows the width: vertical under 600px, the strip above; a saved layout is ignored', async () => {
  const b = fakeBrowser({ stored: { layout: 'compact', firstRun: false }, narrow: true });
  assert.equal((await b.wc.getSettings()).layout, 'vertical');
  const seen = [];
  b.wc.onSettings((s) => seen.push(s.layout));
  b.fireNarrow(false);
  assert.deepEqual(seen, ['strip']);
  b.fireNarrow(true);
  assert.deepEqual(seen, ['strip', 'vertical']);
  assert.equal(b.saved().layout, 'compact');
});

test('opened on its own, /app/ goes to the home page with the hash; in the hero it stays', () => {
  const alone = fakeBrowser({ topLevel: true, hash: '#c=Asia/Tokyo,Europe/Paris&t=2026-09-24T15:00&z=Asia/Tokyo' });
  assert.deepEqual([...alone.replaced], ['/#c=Asia/Tokyo,Europe/Paris&t=2026-09-24T15:00&z=Asia/Tokyo']);
  assert.deepEqual([...fakeBrowser({ topLevel: true }).replaced], ['/']);
  assert.deepEqual([...fakeBrowser().replaced], []);
  assert.equal(typeof alone.wc.getSettings, 'function'); // the rest still runs, so nothing throws on the way out
});

test('a shared link on the home page (the page around the frame) opens its cities; its own anchors are ignored', async () => {
  const b = fakeBrowser({ parentHash: '#c=Asia/Tokyo,Europe/Paris', stored: { zones: ['America/New_York'], firstRun: false } });
  const s = await b.wc.getSettings();
  assert.deepEqual(s.zones, ['Asia/Tokyo', 'Europe/Paris']);
  assert.equal(s.shared, true);
  assert.equal(b.web.shareHash(), '#c=Asia/Tokyo,Europe/Paris');
  const anchor = fakeBrowser({ parentHash: '#download', stored: { zones: ['America/New_York'], firstRun: false } });
  assert.deepEqual((await anchor.wc.getSettings()).zones, ['America/New_York']);
  assert.equal(anchor.web.shareHash(), '');
  assert.equal(anchor.classes.has('is-shared'), false);
});

test('page language from the hash (#lang=pt, #lang=es): auto follows it, a language picked in Settings wins, shared links still open', async () => {
  // the Portuguese home page frames /app/#lang=pt; an English browser still gets Portuguese
  const pt = fakeBrowser({ hash: '#lang=pt', languages: ['en-US'] });
  let s = await pt.wc.getSettings();
  assert.equal(s.systemLanguage, 'pt');
  assert.equal(s.language, 'auto');
  assert.equal(s.shared, false);
  // Spanish, with a shared link's keys after it (in the frame's hash): both apply
  const es = fakeBrowser({ hash: '#lang=es&c=Asia/Tokyo,Europe/Paris&t=2026-09-24T15:00&z=Asia/Tokyo', languages: ['pt-BR'], stored: { zones: ['America/New_York'], firstRun: false } });
  s = await es.wc.getSettings();
  assert.equal(s.systemLanguage, 'es');
  assert.deepEqual(s.zones, ['Asia/Tokyo', 'Europe/Paris']);
  assert.equal(s.shared, true);
  assert.deepEqual(es.web.parseShare('#lang=es&c=Asia/Tokyo'), { zones: ['Asia/Tokyo'], t: null, z: null });
  // the shared link on the home page, the language in the frame's own hash
  const mixed = fakeBrowser({ hash: '#lang=pt', parentHash: '#c=Asia/Tokyo', languages: ['en'], stored: { zones: ['America/New_York'], firstRun: false } });
  s = await mixed.wc.getSettings();
  assert.equal(s.systemLanguage, 'pt');
  assert.deepEqual(s.zones, ['Asia/Tokyo']);
  // a language picked in Settings is kept as it is (app.js uses systemLanguage only for 'auto')
  const picked = fakeBrowser({ hash: '#lang=pt', stored: { language: 'es', firstRun: false } });
  s = await picked.wc.getSettings();
  assert.equal(s.language, 'es');
  // no lang, or an unknown one: the browser's language, as before
  assert.equal((await fakeBrowser({ languages: ['es-MX'] }).wc.getSettings()).systemLanguage, 'es');
  assert.equal((await fakeBrowser({ hash: '#lang=fr', languages: ['pt-PT'] }).wc.getSettings()).systemLanguage, 'pt');
  assert.equal(pt.web.langFrom('#c=Asia/Tokyo&lang=ES'), 'es');
  assert.equal(pt.web.langFrom('#language=pt'), '');
  // Share links never carry the page language
  assert.equal(pt.web.buildShare(['Asia/Tokyo'], null), 'c=Asia/Tokyo');
  // a new hash with a language switches 'auto' at once; a hash without one (a cleared shared link) keeps it
  const seen = [];
  pt.wc.onSettings((x) => seen.push(x.systemLanguage));
  pt.fireHash('#lang=es');
  pt.fireHash('');
  pt.fireHash('#lang=en', false);
  assert.deepEqual(seen, ['es', 'en']);
  assert.equal(pt.web.pageLang(), 'en');
  // opened on its own, the language goes to the home page with the rest of the hash
  assert.deepEqual([...fakeBrowser({ topLevel: true, hash: '#lang=pt&c=Asia/Tokyo' }).replaced], ['/#lang=pt&c=Asia/Tokyo']);
});

test('window-only calls exist and do nothing', () => {
  const b = fakeBrowser();
  assert.equal(b.wc.quit, undefined); // preload has no quit()
  for (const k of ['dragStart', 'dragMove', 'panel', 'setView', 'hide', 'minimize', 'setTrayNames', 'openStartupSettings']) {
    assert.equal(typeof b.wc[k], 'function', k);
    assert.equal(b.wc[k](1, 2), undefined);
  }
});

test('parseShare and buildShare: hash format, validation and round trip', () => {
  const b = fakeBrowser();
  const { parseShare, buildShare } = b.web;
  const p = parseShare('#c=Europe/Lisbon,Asia/Tokyo&t=2026-09-24T15:00&z=America/New_York');
  assert.deepEqual(p, { zones: ['Europe/Lisbon', 'Asia/Tokyo', 'America/New_York'], t: { ymd: '2026-09-24', h: 15, mi: 0 }, z: 'America/New_York' });
  assert.equal(parseShare(''), null);
  assert.equal(parseShare('#c=Bad/Zone,,x'), null);
  assert.equal(parseShare('#t=2026-02-30T10:00'), null); // no Feb 30
  assert.equal(parseShare('#t=2026-09-24T24:00'), null);
  assert.equal(parseShare('#c=' + 'Asia/Tokyo,'.repeat(500)), null); // over the length cap
  assert.deepEqual(parseShare('#c=Asia/Tokyo,Asia/Tokyo,Etc/GMT%2B5').zones, ['Asia/Tokyo', 'Etc/GMT+5']);
  const hash = buildShare(['Europe/Lisbon', 'Etc/GMT+5'], { ymd: '2026-01-02', h: 9, mi: 5, zone: 'Europe/Lisbon' });
  assert.equal(hash, 'c=Europe/Lisbon,Etc/GMT%2B5&t=2026-01-02T09:05&z=Europe/Lisbon');
  const back = parseShare('#' + hash);
  assert.deepEqual(back.zones, ['Europe/Lisbon', 'Etc/GMT+5']);
  assert.equal(back.t.h, 9);
  assert.equal(back.t.mi, 5);
});

test('a shared link shows its cities without touching the saved list until saved', async () => {
  const b = fakeBrowser({ hash: '#c=Asia/Tokyo,Europe/Paris', stored: { zones: ['America/New_York'], labels: { 'America/New_York': 'Office' }, firstRun: false } });
  assert.equal(b.classes.has('is-shared'), true);
  let s = await b.wc.getSettings();
  assert.deepEqual(s.zones, ['Asia/Tokyo', 'Europe/Paris']);
  assert.equal(s.shared, true);
  // adding a city and renaming while viewing: this visit only
  s = await b.wc.setSettings({ zones: ['Asia/Tokyo', 'Europe/Paris', 'Asia/Seoul'], labels: { 'Asia/Tokyo': 'Team' }, theme: 'dark' });
  assert.deepEqual(s.zones, ['Asia/Tokyo', 'Europe/Paris', 'Asia/Seoul']);
  assert.deepEqual(b.saved().zones, ['America/New_York']);
  assert.deepEqual(b.saved().labels, { 'America/New_York': 'Office' });
  assert.equal(b.saved().theme, 'dark'); // other settings save as usual
  assert.equal(b.web.saveShared(), true);
  assert.deepEqual(b.saved().zones, ['Asia/Tokyo', 'Europe/Paris', 'Asia/Seoul']);
  assert.deepEqual(b.saved().labels, { 'Asia/Tokyo': 'Team' });
  assert.equal(b.classes.has('is-shared'), false);
  assert.equal((await b.wc.getSettings()).shared, false);
});

test('"Show my cities" returns to the saved list; a first visit asks for a reload instead', async () => {
  const b = fakeBrowser({ hash: '#c=Asia/Tokyo', stored: { zones: ['America/New_York'], firstRun: false } });
  const seen = [];
  b.wc.onSettings((s) => seen.push(s.zones));
  assert.equal(b.web.leaveShared(), true);
  assert.deepEqual(seen, [['America/New_York']]);
  const first = fakeBrowser({ hash: '#c=Asia/Tokyo' });
  assert.equal((await first.wc.getSettings()).firstRun, false); // the app shows the link's cities as they are
  await first.wc.setSettings({ hour12: true });
  assert.equal(first.saved().firstRun, true); // a later plain visit still gets the first-run cities
  assert.equal(first.web.leaveShared(), false);
});

test('a link to the saved list itself is not treated as shared', async () => {
  const b = fakeBrowser({ hash: '#c=Asia/Tokyo,Europe/Paris', stored: { zones: ['Asia/Tokyo', 'Europe/Paris'], firstRun: false } });
  assert.equal(b.classes.has('is-shared'), false);
  assert.equal((await b.wc.getSettings()).shared, false);
});

test('theme: "System" follows the website theme choice (wc-theme) before the OS', () => {
  const dark = fakeBrowser({ siteTheme: 'dark' });
  assert.equal(dark.ctx.matchMedia('(prefers-color-scheme: dark)').matches, true);
  assert.equal(dark.classes.has('sys-dark'), true);
  const light = fakeBrowser({ siteTheme: 'light' });
  assert.equal(light.ctx.matchMedia('(prefers-color-scheme: dark)').matches, false);
  // an explicit app theme wins
  const app = fakeBrowser({ siteTheme: 'dark', stored: { theme: 'light', firstRun: false } });
  assert.equal(app.ctx.document.documentElement.dataset.theme, 'light');
  assert.equal(app.classes.has('sys-dark'), false);
  // the website theme changed in another tab: listeners hear it
  const b = fakeBrowser();
  let heard = null;
  b.ctx.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => { heard = e.matches; });
  b.store.set('wc-theme', 'dark');
  b.fireStorage('wc-theme');
  assert.equal(heard, true);
});

test('copyText refuses more than 5000 characters, like main', async () => {
  const b = fakeBrowser();
  assert.equal(await b.wc.copyText('x'.repeat(5001)), false);
});

// ---------- web/web.js strings (the page around the app; the app's own are in src/renderer/i18n.js) ----------
test('web strings exist in en, pt and es for every key the page uses, in the plain voice', () => {
  const WEBJS = fs.readFileSync(path.join(ROOT, 'web', 'web.js'), 'utf8');
  const TOP = fs.readFileSync(path.join(ROOT, 'web', 'top.html'), 'utf8');
  const m = WEBJS.match(/const STR = (\{[\s\S]*?\r?\n {2}\});/);
  assert.ok(m, 'const STR not found in web/web.js');
  const STR = vm.runInNewContext('(' + m[1] + ')');
  assert.deepEqual(Object.keys(STR).sort(), ['en', 'es', 'pt']);
  const en = Object.keys(STR.en).sort();
  for (const lang of ['pt', 'es']) assert.deepEqual(Object.keys(STR[lang]).sort(), en, `${lang} has the same keys as en`);
  // every key named in top.html (data-web, data-web-aria, data-web-title) or in web.js (t('x'), dataset.web = 'x',
  // make(tag, class, 'x'))
  const used = new Set([
    ...[...TOP.matchAll(/data-web(?:-aria|-title)?="([^"]+)"/g)].map((x) => x[1]),
    ...[...WEBJS.matchAll(/\bt\('([^']+)'\)/g)].map((x) => x[1]),
    ...[...WEBJS.matchAll(/dataset\.web(?:Title|Aria)? = '([^']+)'/g)].map((x) => x[1]),
    ...[...WEBJS.matchAll(/make\('[^']+', '[^']*', '([^']+)'\)/g)].map((x) => x[1]),
  ]);
  for (const k of ['free', 'free.title', 'touch.tip', 'shared.save']) assert.ok(used.has(k), `the test finds the key ${k}`);
  for (const k of used) assert.ok(en.includes(k), `web.js has no string for ${k}`);
  for (const [lang, table] of Object.entries(STR)) {
    for (const [k, v] of Object.entries(table)) {
      assert.ok(typeof v === 'string' && v.trim(), `${lang} ${k} is empty`);
      assert.ok(!/[\u2013\u2014!]/.test(v), `${lang} ${k} has a dash or an exclamation mark: ${v}`);
      assert.ok(!/\b(seamless|powerful|effortless|elevate|widget)/i.test(v), `${lang} ${k}: ${v}`);
    }
  }
  assert.equal(STR.en.free, 'Free and open source. No account, no ads.');
  // Help links the line to the code
  assert.ok(WEBJS.includes("a.href = 'https://github.com/joaoCarvalho1000/open-world-clock';"), 'the line links to the code');
  // before web.js runs, the shared link banner already reads in English
  assert.match(TOP, new RegExp(`data-web="shared.save">${STR.en['shared.save']}</button>`), 'top.html shows the English banner before web.js runs');
});
