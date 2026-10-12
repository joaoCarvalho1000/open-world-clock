#!/usr/bin/env node
// End-to-end test of the web app (site/app/), live in the home page's hero, in headless Chrome. Runnable with node:
//   node test/web/web.test.mjs [--no-build] [--shots <dir>]
// - Builds site/app/ first (node scripts/build-web.mjs) unless --no-build.
// - Serves site/ itself (test/web/serve.mjs) on the first free port between 8810 and 8830, with the security headers
//   from site/_headers (so the frame is allowed exactly as in production), and stops it at the end.
// - Every check opens the home page and works the app inside its frame (#heroApp), as a visitor would.
// - Needs puppeteer-core (npm i --no-save puppeteer-core, or PUPPETEER_CORE=<folder that has it>) and Chrome or Edge
//   (the usual install paths, or CHROME_PATH).
// - Screenshots of the home page (390 and 1440 wide, light and dark: the hero, converting, planner, map) go to
//   dist/web-shots unless --shots.
// - Prints LCP, CLS and bytes, and writes them to <shots>/metrics.json.
// Exit code 1 on any failure.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { startOnFreePort } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const argVal = (name, def) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const SHOTS = path.resolve(argVal('--shots', path.join(ROOT, 'dist', 'web-shots')));
const TZ = 'Europe/Lisbon';
const DEFAULT_CITIES = ['Europe/Lisbon', 'America/New_York', 'America/Los_Angeles', 'Asia/Singapore']; // first run in Lisbon

// ---------- tools ----------
async function loadPuppeteer() {
  const where = process.env.PUPPETEER_CORE;
  if (where) {
    const req = createRequire(path.join(path.resolve(where), 'noop.js'));
    try { return req('puppeteer-core'); } catch { return req(path.resolve(where)); }
  }
  try { return (await import('puppeteer-core')).default; } catch {
    console.error('puppeteer-core not found: run  npm i --no-save puppeteer-core  or set PUPPETEER_CORE to a folder that has it');
    process.exit(1);
  }
}
function findChrome() {
  const L = process.env.LOCALAPPDATA || '';
  const list = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', L && path.join(L, 'Google/Chrome/Application/chrome.exe'),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const hit = list.find((p) => p && fs.existsSync(p));
  if (!hit) { console.error('Chrome or Edge not found: set CHROME_PATH'); process.exit(1); }
  return hit;
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assertion failed'); };
const eq = (a, b, msg) => { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${msg || 'not equal'}: got ${x}, want ${y}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Wall time in a zone, like the app shows it: { hm, ampm }.
function wall(zone, ms, hour12) {
  if (hour12) {
    const s = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit', hour12: true }).format(ms);
    const [hm, ampm] = s.split(/\s+/);
    return { hm, ampm };
  }
  return { hm: new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms), ampm: '' };
}
function offsetMin(zone, ms) {
  const v = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }).formatToParts(ms).find((p) => p.type === 'timeZoneName').value;
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(v);
  return m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +(m[3] || 0)) : 0;
}
function zonedEpoch(zone, ymd, h, mi) {
  const [y, m, d] = ymd.split('-').map(Number);
  const base = Date.UTC(y, m - 1, d, h, mi);
  let t = base;
  for (let i = 0; i < 3; i++) t = base - offsetMin(zone, t) * 60000;
  return t;
}
const todayIn = (zone) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(Date.now());

// ---------- runner ----------
const results = [];
async function check(name, fn) {
  const filter = argVal('--filter', '');
  if (filter && !new RegExp(filter).test(name)) return;
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`ok    ${name} (${Date.now() - t0} ms)`);
  } catch (e) {
    results.push({ name, ok: false, error: String(e && e.message || e) });
    console.log(`FAIL  ${name}\n      ${String(e && e.stack || e).split('\n').slice(0, 4).join('\n      ')}`);
  }
}

// ---------- start ----------
if (!args.includes('--no-build')) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-web.mjs')], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(1);
}
fs.mkdirSync(SHOTS, { recursive: true });
const puppeteer = await loadPuppeteer();
const srv = await startOnFreePort(8810, 8830);
const base = srv.url;
console.log(`serving site/ at ${base} (the app is in the home page's hero)`);
const browser = await puppeteer.launch({
  executablePath: findChrome(), headless: true,
  args: ['--lang=en-US', '--no-first-run', '--no-default-browser-check', '--disable-extensions'],
});

async function openPage(ctx, { width = 1440, height = 900, scheme = 'light', mobile = false } = {}) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (!/^(error|warn|warning|assert)$/.test(m.type())) return;
    errors.push(`console.${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => { const f = r.failure(); if (!/ERR_ABORTED/.test((f && f.errorText) || '')) errors.push(`requestfailed: ${r.url()} ${f && f.errorText}`); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });
  await page.evaluateOnNewDocument(() => {
    document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP violation: ${e.violatedDirective} blocked ${e.blockedURI}`));
  });
  await page.emulateTimezone(TZ);
  await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
  page.errors = errors;
  return page;
}
// The app lives in the home page's hero: open the home page (with a shared link's hash, if any) and return the frame.
// The frame starts after the page's load event (site/assets/demo.js).
async function openHome(page, hash = '', timeout = 30000) {
  await page.goto(`${base}/${hash}`, { waitUntil: 'load', timeout });
  const frame = await appFrame(page, timeout);
  // The hero window slides in (winIn); a click aimed while it still moves lands beside its target.
  await page.evaluate(() => { const d = document.getElementById('demo'); return d && Promise.all(d.getAnimations().map((a) => a.finished.catch(() => {}))); });
  return frame;
}
// The hero's frame, once the app in it has started.
async function appFrame(page, timeout = 30000) {
  await page.waitForFunction(() => { const f = document.getElementById('heroApp'); return f && f.getAttribute('src') && f.contentDocument && f.contentDocument.querySelector('.card[data-zone], .strip .empty'); }, { timeout });
  return (await page.$('#heroApp')).contentFrame();
}
// Scroll the page so the hero's app sits just under the fixed nav: touches and the mouse land on what they aim at.
const toApp = (page) => page.evaluate(() => { const r = document.getElementById('heroApp').getBoundingClientRect(); window.scrollTo(0, scrollY + r.top - 80); });
const cards = (page) => page.$$eval('.card[data-zone]', (cs) => cs.map((c) => ({
  zone: c.dataset.zone, city: c.querySelector('.city') ? c.querySelector('.city').textContent : '', hm: c.querySelector('.hm').textContent,
  ampm: c.querySelector('.ampm').textContent, home: c.classList.contains('home'), converted: c.classList.contains('converted'), source: c.classList.contains('source'),
})));
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('owc-app-settings') || 'null')); // same origin: page or frame
const visible = (page, sel) => page.$eval(sel, (n) => !!n && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden').catch(() => false);
const noErrors = (page, what) => assert(!page.errors.length, `${what}: ${page.errors.length} console/network errors:\n        ${page.errors.join('\n        ')}`);
// Type a time in the converter for a source city (the real controls, as a person would). F is the app's frame.
async function convert(page, F, zone, text) {
  await F.select('#convZone', zone);
  await F.click('#convTime', { count: 3 });
  await page.keyboard.press('Backspace');
  await page.keyboard.type(text);
  await F.waitForFunction(() => { const c = document.querySelectorAll('.card[data-zone]'); return c.length && [...c].every((x) => x.classList.contains('converted')); });
}
async function checkConverted(page, zone, h, mi) {
  const ymd = await page.$eval('#convDate', (n) => n.value);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(ymd), `converter date ${ymd}`);
  const at = zonedEpoch(zone, ymd, h, mi);
  const list = await cards(page);
  for (const c of list) {
    const hour12 = !!c.ampm;
    const want = wall(c.zone, at, hour12);
    eq({ hm: c.hm, ampm: c.ampm }, want, `converted time for ${c.zone}`);
    assert(c.converted, `${c.zone} not marked converted`);
    eq(c.source, c.zone === zone, `source flag for ${c.zone}`);
  }
}

// ======================= a first visit, 1440 wide =======================
const ctxA = await browser.createBrowserContext();
await ctxA.overridePermissions(base, ['clipboard-read', 'clipboard-sanitized-write']);
const A = await openPage(ctxA);
let F = null; // the app's frame in A
let shareUrl = '';

await check('the home page hero runs the app, with the default cities and live times', async () => {
  F = await openHome(A);
  const list = await cards(F);
  eq(list.map((c) => c.zone), DEFAULT_CITIES, 'first-run cities');
  const now = Date.now();
  for (const c of list) {
    assert(/^\d{1,2}:\d{2}$/.test(c.hm), `time text ${c.hm} on ${c.zone}`);
    const hour12 = !!c.ampm;
    const ok = [now, now - 60000, now + 60000].some((t) => { const w = wall(c.zone, t, hour12); return w.hm === c.hm && w.ampm === c.ampm; });
    assert(ok, `${c.zone} shows ${c.hm} ${c.ampm}`);
  }
  assert(list.find((c) => c.zone === TZ).home, 'Lisbon is the home card');
  assert(await F.$eval('html', (n) => n.classList.contains('is-web')), 'html.is-web');
  const hero = await A.evaluate(() => {
    const f = document.getElementById('heroApp'), r = f.getBoundingClientRect();
    return { h1: document.querySelector('.hero h1').textContent, src: f.getAttribute('src'), title: f.title, top: r.top, height: r.height, store: !!document.querySelector('.hero [data-link="store"]') };
  });
  assert(hero.h1.startsWith('The world clock Windows should have shipped with.'), hero.h1);
  eq(hero.src, '/app/#lang=en', 'frame source (the page tells the app its language)');
  assert(/Open World Clock/.test(hero.title), 'the frame has a title for screen readers');
  assert(hero.store, 'the Store button stays in the hero');
  assert(hero.top < 900 && hero.height >= 360, `the app is on the first screen (top ${hero.top}, height ${hero.height})`);
});

await check('no layout choice on the web: the strip here, the switch and the setting are gone; map and planner stay', async () => {
  assert(await F.$eval('#app', (n) => n.classList.contains('layout-strip')), 'strip layout at 1440');
  assert(!(await visible(F, '#layoutWrap')), 'the layout switch is hidden');
  assert(await visible(F, '#btnMap'), 'the map button is shown');
  assert(await visible(F, '#btnPlanner'), 'the planner button is shown');
  await F.click('#btnSettings');
  await F.waitForSelector('#settingsPanel:not([hidden])');
  assert(!(await visible(F, '#optLayout')), 'the layout setting is hidden');
  await A.keyboard.press('Escape');
  await F.waitForSelector('#settingsPanel[hidden]', { hidden: true });
});

await check('the app page is only the hero\'s frame: noindex, no canonical, manifest, Open Graph or service worker', async () => {
  const head = await F.evaluate(() => ({
    robots: (document.querySelector('meta[name="robots"]') || {}).content,
    canonical: !!document.querySelector('link[rel="canonical"]'),
    manifest: !!document.querySelector('link[rel="manifest"]'),
    og: !!document.querySelector('meta[property^="og:"]'),
    ld: !!document.querySelector('script[type="application/ld+json"]'),
    analytics: !!document.querySelector('script[src*="analytics"]'),
    text: document.head.innerHTML,
  }));
  eq(head.robots, 'noindex', 'robots meta');
  eq([head.canonical, head.manifest, head.og, head.ld, head.analytics], [false, false, false, false, false], 'canonical, manifest, og, JSON-LD, analytics');
  assert(!/[\u2013\u2014]/.test(head.text), 'no en or em dashes in the head');
  const r = await A.evaluate(async (u) => { const x = await fetch(u); return { robots: x.headers.get('x-robots-tag'), xfo: x.headers.get('x-frame-options'), csp: x.headers.get('content-security-policy') }; }, `${base}/app/`);
  eq(r.robots, 'noindex', 'X-Robots-Tag');
  eq(r.xfo, 'SAMEORIGIN', 'X-Frame-Options');
  assert(/frame-ancestors 'self'/.test(r.csp), `frame-ancestors: ${r.csp}`);
  assert(!(await F.evaluate(() => navigator.serviceWorker.getRegistrations().then((x) => x.length))), 'no service worker');
  assert(!fs.existsSync(path.join(ROOT, 'site', 'app', 'sw.js')) && !fs.existsSync(path.join(ROOT, 'site', 'app', 'manifest.webmanifest')), 'no sw.js or manifest in site/app');
});

await check('opened on its own, /app/ goes to the home page with the hash, and the hero shows those cities', async () => {
  const ctx = await browser.createBrowserContext();
  const B = await openPage(ctx);
  await B.goto(`${base}/app/#c=Asia/Tokyo,Europe/Paris&t=2026-09-24T15:00&z=Asia/Tokyo`, { waitUntil: 'load' });
  await B.waitForFunction(() => location.pathname === '/', { timeout: 5000 });
  eq(await B.evaluate(() => location.hash), '#c=Asia/Tokyo,Europe/Paris&t=2026-09-24T15:00&z=Asia/Tokyo', 'hash kept');
  const G = await appFrame(B);
  await G.waitForFunction(() => document.querySelectorAll('.card.converted').length === 2);
  eq((await cards(G)).map((c) => c.zone), ['Asia/Tokyo', 'Europe/Paris'], 'the link\'s cities in the hero');
  await B.goto(`${base}/app/`, { waitUntil: 'load' });
  await B.waitForFunction(() => location.pathname === '/' && !location.hash, { timeout: 5000 });
  noErrors(B, 'top-level /app/');
  await ctx.close();
});

await check('Windows-only controls are hidden', async () => {
  for (const sel of ['#btnPin', '#btnMin', '#btnClose']) assert(!(await visible(F, sel)), `${sel} is visible`);
  await F.click('#btnSettings');
  await F.waitForSelector('#settingsPanel:not([hidden])');
  assert(!(await visible(F, '#optTop')), 'Always on top is visible');
  assert(!(await visible(F, '#optLogin')), 'Launch at login is visible');
  assert(!(await visible(F, '#optOpacity')), 'Background opacity is visible');
  assert(await visible(F, '#kofiLink'), 'the Ko-fi link is shown on the web');
  eq(await F.$eval('#ver', (n) => n.textContent), 'v' + JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version, 'version');
  await A.keyboard.press('Escape');
  await F.waitForSelector('#settingsPanel[hidden]', { hidden: true });
});

await check('Help: "Free and open source. No account, no ads." links to the code', async () => {
  eq(await F.$eval('#tip .web-help-free a', (n) => [n.textContent, n.href, n.target]), ['Free and open source. No account, no ads.', 'https://github.com/joaoCarvalho1000/open-world-clock', '_blank'], 'the line in Help');
});

await check('the world map loads after the first paint, and at once when it is asked for first', async () => {
  const ctx = await browser.createBrowserContext();
  const L = await openPage(ctx);
  const LF = await openHome(L);
  await LF.waitForFunction(() => !!window.WCMap, { timeout: 10000 });
  const t = await LF.evaluate(() => {
    const e = performance.getEntriesByType('resource').find((r) => /app\.later\.js$/.test(r.name));
    return { load: performance.getEntriesByType('navigation')[0].loadEventStart, later: e ? e.startTime : -1 };
  });
  assert(t.later >= t.load, `app.later.js requested at ${Math.round(t.later)} ms, before the load event (${Math.round(t.load)} ms)`);
  // when idle never comes, the map button loads the map and opens it (no second press needed)
  const L2 = await openPage(ctx);
  await L2.evaluateOnNewDocument(() => { window.requestIdleCallback = () => 0; });
  const L2F = await openHome(L2);
  await sleep(300);
  assert(!(await L2F.evaluate(() => !!window.WCMap)), 'the map is not loaded before it is needed');
  await L2F.click('#btnMap');
  await L2F.waitForSelector('#mapView:not([hidden])', { timeout: 5000 });
  await L2F.waitForFunction(() => document.getElementById('mapView').children.length > 0 && document.getElementById('mapView').getBoundingClientRect().height > 200);
  // a second press while the map is still on its way (a slow network) does not close it again once it opens
  const L3 = await openPage(ctx);
  await L3.evaluateOnNewDocument(() => { window.requestIdleCallback = () => 0; });
  await L3.setRequestInterception(true);
  L3.on('request', (r) => (/app\.later\.js$/.test(r.url()) ? setTimeout(() => r.continue(), 700) : r.continue()));
  const L3F = await openHome(L3);
  await L3F.click('#btnMap');
  await sleep(150);
  await L3F.click('#btnMap');
  await L3F.waitForFunction(() => !!window.WCMap, { timeout: 5000 });
  await sleep(400);
  assert(await L3F.$eval('#mapView', (n) => !n.hidden), 'the map is open after two presses while it loads');
  noErrors(L, 'map after load');
  noErrors(L2, 'map on first press');
  noErrors(L3, 'map after two presses while it loads');
  await ctx.close();
});

await check('adds a city with the search box', async () => {
  await F.click('#zoneSearch');
  await A.keyboard.type('Tokyo');
  await F.waitForSelector('#zoneResults li[id^="zr-"]', { visible: true });
  await A.keyboard.press('Enter');
  await F.waitForSelector('.card[data-zone="Asia/Tokyo"]');
  const s = await saved(A);
  eq(s.zones, [...DEFAULT_CITIES, 'Asia/Tokyo'], 'saved cities');
});

await check('converts 15:00 in New York on every card', async () => {
  await convert(A, F, 'America/New_York', '15:00');
  await checkConverted(F, 'America/New_York', 15, 0);
  // screen readers hear it (announce() is debounced while typing)
  await F.waitForFunction(() => /15:00|3:00\sPM/.test(document.getElementById('announce').textContent) && /New York/.test(document.getElementById('announce').textContent), { timeout: 3000 });
});

await check('the meeting planner and the world map open', async () => {
  await F.click('#btnPlanner');
  await F.waitForSelector('#planner:not([hidden]) .plan-row');
  eq(await F.$$eval('.plan-row', (r) => r.length), DEFAULT_CITIES.length + 1, 'planner rows');
  assert((await F.$eval('#plannerSummary', (n) => n.textContent)).length > 0, 'planner summary');
  await F.click('#btnMap');
  await F.waitForSelector('#mapView:not([hidden])');
  assert(await F.$eval('#mapView', (n) => n.children.length > 0 && n.getBoundingClientRect().height > 200), 'map drawn');
  assert(await F.$eval('#planner', (n) => n.hidden), 'planner closes when the map opens');
  await F.click('#btnMap');
  await F.waitForSelector('#mapView', { hidden: true });
});

await check('rename persists across a reload', async () => {
  await F.click('.card[data-zone="Asia/Tokyo"] .more');
  await F.waitForSelector('#cardMenu:not([hidden])');
  await F.click('#cardMenu [data-act="rename"]');
  await F.waitForSelector('.card[data-zone="Asia/Tokyo"] input.rename');
  await A.keyboard.type('Team Tokyo');
  await A.keyboard.press('Enter');
  eq(await F.$eval('.card[data-zone="Asia/Tokyo"] .city', (n) => n.textContent), 'Team Tokyo', 'renamed card');
  await A.reload({ waitUntil: 'load' });
  F = await appFrame(A);
  await F.waitForSelector('.card[data-zone="Asia/Tokyo"]');
  eq(await F.$eval('.card[data-zone="Asia/Tokyo"] .city', (n) => n.textContent), 'Team Tokyo', 'after reload');
  eq((await saved(A)).labels, { 'Asia/Tokyo': 'Team Tokyo' }, 'saved labels');
});

const convertedCount = (frame) => frame.$$eval('.card.converted', (c) => c.length);
await check('mouse wheel (with intent, no scroll trap), keyboard, working hours and help', async () => {
  await toApp(A);
  await sleep(450);
  // wheel over a card's digits, once the mouse has moved there and the page is at rest: one notch is 15 minutes
  const box = await (await F.$('.card[data-zone="America/New_York"] .display')).boundingBox();
  await A.mouse.move(box.x + 4, box.y + 4);
  await A.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 });
  await sleep(400);
  await A.mouse.wheel({ deltaY: -120 });
  await F.waitForFunction(() => document.querySelectorAll('.card.converted').length > 0);
  await F.focus('#convTime');
  await A.keyboard.press('Escape');
  await F.waitForFunction(() => document.querySelectorAll('.card.converted').length === 0);
  // the page scrolling past the frame keeps scrolling: a wheel right after a page scroll, with the mouse parked, is the page's
  await sleep(700); // the scrub above is over (a scrub in progress keeps the wheel for 600 ms)
  await A.evaluate(() => window.scrollBy(0, -40));
  await sleep(60);
  const y0 = await A.evaluate(() => scrollY);
  await A.mouse.wheel({ deltaY: 120 });
  await sleep(500);
  eq(await convertedCount(F), 0, 'no scrub while the page scrolls');
  assert((await A.evaluate(() => scrollY)) > y0, 'the page scrolled');
  await toApp(A);
  await sleep(450);
  // a focused card: ] scrubs 15 minutes, Enter converts from that city
  await F.focus('.card[data-zone="Asia/Singapore"]');
  await A.keyboard.press(']');
  await F.waitForFunction(() => document.querySelectorAll('.card.converted').length > 0);
  await F.focus('.card[data-zone="Asia/Singapore"]');
  await A.keyboard.press('Enter');
  await F.waitForFunction(() => document.querySelector('.card[data-zone="Asia/Singapore"]').classList.contains('source'));
  await F.focus('#convTime');
  await A.keyboard.press('Escape');
  eq(await convertedCount(F), 0, 'back to now');
  // working hours for one city, from its menu
  await F.click('.card[data-zone="Asia/Tokyo"] .more');
  await F.waitForSelector('#cardMenu:not([hidden])');
  await F.click('#cardMenu [data-act="hours"]');
  await F.waitForSelector('#hoursEditor:not([hidden])');
  await F.click('#hoursStart', { count: 3 });
  await A.keyboard.type('10:00');
  await F.click('#hoursEnd', { count: 3 });
  await A.keyboard.type('19:00');
  await F.click('#hoursSave');
  await F.waitForSelector('#hoursEditor', { hidden: true });
  eq((await saved(A)).hours, { 'Asia/Tokyo': { start: '10:00', end: '19:00', days: [1, 2, 3, 4, 5] } }, 'saved working hours');
  // help: shortcuts listed, the zoom keys (a window feature) are not
  await F.click('#btnHelp');
  await F.waitForSelector('#tip:not([hidden])');
  assert(await visible(F, '#helpKeys dt'), 'shortcuts listed');
  assert(!(await visible(F, '#helpKeys .first-zoom')), 'zoom keys hidden');
  await A.keyboard.press('Escape');
  await F.waitForSelector('#tip', { hidden: true });
});

await check('Share (the app window\'s bar) copies a home page link, hash only, with the cities and the converted time', async () => {
  await convert(A, F, 'America/New_York', '15:00');
  await A.evaluate(() => window.scrollTo(0, 0)); // the window's bar clear of the fixed nav
  await sleep(300);
  await A.click('#heroShare');
  await A.waitForFunction(() => document.getElementById('heroShareText').textContent !== 'Share', { timeout: 5000 });
  eq(await A.$eval('#heroShareText', (n) => n.textContent), 'Link copied', 'Share says');
  shareUrl = await A.evaluate(() => navigator.clipboard.readText());
  const ymd = await F.$eval('#convDate', (n) => n.value);
  eq(shareUrl, `${base}/#c=${[...DEFAULT_CITIES, 'Asia/Tokyo'].join(',')}&t=${ymd}T15:00&z=America/New_York`, 'share link');
  assert(!shareUrl.includes('?'), 'nothing in the query string');
  assert(!/Team/.test(shareUrl), 'custom labels stay private');
});

// ======================= one meeting state (a fresh visitor, 1440 wide) =======================
// The planner selection, the converter field, Copy slot, the header copy menu and the Share link all read one meeting:
// typing a new start moves it (same length), a bad or skipped time keeps the draft with a lasting inline error and
// refuses every export, presentation changes and idle keep it, and only an explicit clear goes back to now.
await check('one meeting: select, retype, invalid paste, fix, presentation changes, idle and clear stay consistent', async () => {
  const ctx = await browser.createBrowserContext();
  await ctx.overridePermissions(base, ['clipboard-read', 'clipboard-sanitized-write']);
  const P = await openPage(ctx);
  const shots = path.join(SHOTS, 'meeting'); fs.mkdirSync(shots, { recursive: true });
  try {
    const G = await openHome(P);
    await G.waitForFunction(() => window.WCConverter && window.WCWeb);
    const NY = 'America/New_York';
    const st = () => G.evaluate(() => {
      const s = window.WCConverter.state(), band = document.querySelector('#planner .plan-sel');
      return { ...s, field: document.getElementById('convTime').value, date: document.getElementById('convDate').value,
        sel: document.getElementById('planSel').textContent, bar: !document.getElementById('planSelBar').hidden,
        band: band ? [band.style.left, band.style.width] : null, hash: window.WCShareHash(),
        copyOff: document.getElementById('btnCopy').disabled, slotOff: document.getElementById('planCopy').disabled };
    });
    const clip = async (fn) => { await P.evaluate(() => navigator.clipboard.writeText('')); await fn(); return ((await waitText(P)) || '').replace(/\r/g, ''); };
    const waitText = async (page) => { for (let i = 0; i < 30; i++) { const t = await page.evaluate(() => navigator.clipboard.readText()); if (t) return t; await sleep(50); } return ''; };
    const typeTime = async (text) => { await G.click('#convTime', { count: 3 }); await G.evaluate(() => document.getElementById('convTime').select()); await P.keyboard.type(text); await sleep(150); };
    const band = (got, want, msg) => assert(got && got.every((v, i) => Math.abs(parseFloat(v) - (want[i] / 24) * 100) < 0.01), `${msg}: ${JSON.stringify(got)}`);
    await G.select('#convZone', NY);
    // a fixed Wednesday (2026-10-14: New York UTC-4, Lisbon UTC+1), so the hour assertions are not seasonal
    await G.evaluate(() => { const d = document.getElementById('convDate'); d.value = '2026-10-14'; delete d.dataset.auto; });
    await typeTime('10:00');
    await G.click('#btnPlanner');
    await G.waitForSelector('#planner:not([hidden]) .plan-row');
    // select 09:00 to 11:00 in New York: a click, then Shift+Right
    await G.click(`.plan-row[data-zone="${NY}"] .plan-cell[data-h="9"]`);
    await P.keyboard.down('Shift'); await P.keyboard.press('ArrowRight'); await P.keyboard.up('Shift');
    await sleep(150);
    const sel = await st();
    const ymd = sel.date;
    eq(ymd, '2026-10-14', 'pinned date');
    const start9 = zonedEpoch(NY, ymd, 9, 0);
    eq(sel.meeting, { startMs: start9, endMs: start9 + 2 * 3600000 }, 'selected meeting');
    eq(sel.convert.epochMs, start9, 'converter at the meeting start');
    band(sel.band, [9, 2], 'band over 09:00 to 11:00');
    // type another valid start: the meeting moves, 2 h long, and every consumer follows
    await typeTime('11:30');
    const moved = await st();
    const start1130 = zonedEpoch(NY, ymd, 11, 30);
    eq(moved.meeting, { startMs: start1130, endMs: start1130 + 2 * 3600000 }, 'meeting after typing 11:30');
    eq(moved.convert.epochMs, start1130, 'converter instant after typing 11:30');
    assert(/(11:30 to 13:30|11:30 AM to 1:30 PM) \(New York\)$/.test(moved.sel), `slot line: ${moved.sel}`);
    band(moved.band, [11.5, 2], 'band moved with the time (half a column in)');
    // D9: with a selected meeting the share link is that exact meeting (version 2: start and end in UTC seconds)
    eq(moved.hash.split('&').filter((p) => !p.startsWith('c=')), ['v=2', `z=${NY}`, `s=${start1130 / 1000}`, `e=${start1130 / 1000 + 7200}`], 'share link is the meeting');
    await P.screenshot({ path: path.join(shots, 'retyped.png') });
    const slotClip = await clip(() => G.click('#planCopy'));
    eq(slotClip.split('\n')[0], moved.sel, 'Copy slot first line');
    assert(/New York: (11:30 to 13:30|11:30 AM to 1:30 PM)/.test(slotClip), `Copy slot city line: ${slotClip}`);
    const utcClip = await clip(async () => { await G.click('#btnCopy'); await G.click('#copyMenu [data-copy="utc"]'); });
    eq(utcClip.split('\n')[0], [start1130, start1130 + 7200000].map((ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')).join('/'), 'UTC copy is the meeting interval');
    // paste an invalid time in one input event: the draft stays, a lasting inline error, no exports
    await G.evaluate(() => { const t = document.getElementById('convTime'); t.focus(); t.value = '25:99'; t.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: '25:99' })); });
    await P.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1 });
    await sleep(2000);
    const bad = await st();
    const err = await G.evaluate(() => {
      const t = document.getElementById('convTime'), ids = (t.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
      const desc = ids.map((id) => document.getElementById(id));
      return { invalid: t.getAttribute('aria-invalid'), desc: desc.map((n) => n && n.textContent).join(' '),
        shown: desc.some((n) => n && !n.hidden && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden'), blocked: window.WCShareBlocked(),
        // the error is a row of its own in the layout, under the bar (not a fixed toast laid over the page)
        row: (() => { const r = document.getElementById('convError'), bar = document.querySelector('.bar').getBoundingClientRect(), b = r.getBoundingClientRect();
          return { inDesc: ids.includes('convError'), pos: getComputedStyle(r).position, below: b.top >= bar.bottom - 1, h: b.height }; })() };
    });
    eq(bad.field, '25:99', 'the draft stays in the field');
    assert(err.invalid === 'true' && /like 9/.test(err.desc) && err.shown, `inline error after resize and 2 s: ${JSON.stringify(err)}`);
    assert(bad.copyOff && bad.slotOff && bad.hash === '' && /like 9/.test(err.blocked), `exports refused: ${JSON.stringify(bad)}`);
    assert(err.row.inDesc && err.row.pos === 'static' && err.row.below && err.row.h > 0, `error row in the layout: ${JSON.stringify(err.row)}`);
    assert(/Fix the time/.test(bad.sel), `slot line asks for a fix: ${bad.sel}`);
    await P.screenshot({ path: path.join(shots, 'invalid.png') });
    await P.evaluate(() => navigator.clipboard.writeText('unchanged'));
    await G.evaluate(() => { document.getElementById('planCopy').click(); document.getElementById('btnCopy').click(); });
    await P.evaluate(() => window.scrollTo(0, 0)); await sleep(200);
    await P.click('#heroShare'); await sleep(300);
    eq(await P.evaluate(() => navigator.clipboard.readText()), 'unchanged', 'nothing copied or shared while invalid');
    await P.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    // fixing the value restores the same consistent meeting
    await typeTime('11:30');
    const fixed = await st();
    eq([fixed.meeting, fixed.convert.epochMs, fixed.copyOff, fixed.slotOff], [moved.meeting, start1130, false, false], 'fixed again');
    eq(await G.$eval('#convTime', (n) => n.getAttribute('aria-invalid')), null, 'aria-invalid gone');
    // presentation changes keep both endpoints: 12-hour clock, language and the source city
    await G.click('#btnSettings'); await G.waitForSelector('#settingsPanel:not([hidden])');
    await G.click('#optHour24'); await G.select('#optLanguage', 'pt'); await sleep(200);
    await G.select('#optLanguage', 'auto'); await G.click('#optHour24'); await P.keyboard.press('Escape'); await sleep(200);
    await G.select('#convZone', 'Europe/Lisbon'); await sleep(200);
    const pres = await st();
    eq(pres.meeting, moved.meeting, 'meeting after format, language and source changes');
    assert(pres.convert.zone === 'Europe/Lisbon' && /^(16:30|4:30 PM)$/.test(pres.field), `source shows the same start: ${pres.field}`);
    band(pres.band, [16.5, 2], 'band in Lisbon columns');
    // background idle keeps a selected meeting
    await G.evaluate(() => { window.__wcConvIdleMs = 200; document.hasFocus = () => false; window.dispatchEvent(new Event('blur')); });
    await sleep(700);
    await G.evaluate(() => {
      const setHidden = (on) => { if (on) Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); else delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); };
      setHidden(true); return new Promise((ok) => setTimeout(() => { setHidden(false); ok(); }, 400));
    });
    const idle = await st();
    await G.evaluate(() => { delete document.hasFocus; delete window.__wcConvIdleMs; });
    eq(idle.meeting, moved.meeting, 'meeting survives idle and a long hide');
    // explicit clear goes back to now
    await G.click('#convClear'); await sleep(150);
    const cleared = await st();
    assert(!cleared.convert && !cleared.meeting && !cleared.bar && !cleared.band && cleared.field === '', `cleared: ${JSON.stringify(cleared)}`);
    // a wall time skipped by the spring-forward change needs a correction (no silent shift)
    await G.select('#convZone', NY);
    await G.evaluate(() => { const d = document.getElementById('convDate'); d.value = '2027-03-14'; delete d.dataset.auto; });
    await typeTime('2:30');
    const gap = await st();
    assert(/doesn’t exist on this date/.test(gap.error || '') && gap.field === '2:30' && gap.copyOff && gap.hash === '', `gap: ${JSON.stringify(gap)}`);
    await typeTime('3:30');
    const after = await st();
    eq([after.error, after.convert && after.convert.epochMs], [null, zonedEpoch(NY, '2027-03-14', 3, 30)], 'corrected time converts');
    assert(await G.$eval('#convError', (n) => n.hidden), 'error row gone once fixed');
    // an offset with seconds is not a clock change: Monrovia 1971-01-01 09:00 (UTC-0:44:30) converts exactly
    await G.click('#zoneSearch'); await P.keyboard.type('Monrovia');
    await G.waitForSelector('#zoneResults li[id^="zr-"]', { visible: true }); await P.keyboard.press('Enter');
    await G.waitForSelector('.card[data-zone="Africa/Monrovia"]');
    await G.select('#convZone', 'Africa/Monrovia');
    await G.evaluate(() => { const d = document.getElementById('convDate'); d.value = '1971-01-01'; delete d.dataset.auto; });
    await typeTime('9:00');
    const mon = await st();
    eq([mon.error, mon.convert && mon.convert.epochMs], [null, Date.UTC(1971, 0, 1, 9, 44, 30)], 'Monrovia 1971 09:00');
    noErrors(P, 'meeting state');
  } finally { await ctx.close(); }
});

// A pin carried from the meeting keeps its exact instant (seconds, a repeated hour) when the source city changes.
await check('one meeting: exact pins survive source and format changes (Monrovia 1971 seconds, Troll repeated hour)', async () => {
  const ctx = await browser.createBrowserContext();
  const P = await openPage(ctx);
  try {
    const G = await openHome(P);
    await G.waitForFunction(() => window.WCConverter && window.WCWeb);
    const st = () => G.evaluate(() => ({ ...window.WCConverter.state(), field: document.getElementById('convTime').value }));
    const typeTime = async (text) => { await G.click('#convTime', { count: 3 }); await G.evaluate(() => document.getElementById('convTime').select()); await P.keyboard.type(text); await sleep(150); };
    const add = async (q, zone) => {
      await G.click('#zoneSearch'); await G.evaluate(() => document.getElementById('zoneSearch').select()); await P.keyboard.type(q);
      await G.waitForSelector('#zoneResults li[id^="zr-"]', { visible: true }); await P.keyboard.press('Enter');
      await G.waitForSelector(`.card[data-zone="${zone}"]`);
    };
    const setDate = (ymd) => G.evaluate((v) => { const d = document.getElementById('convDate'); d.value = v; delete d.dataset.auto; }, ymd);
    await add('Monrovia', 'Africa/Monrovia'); await add('Troll', 'Antarctica/Troll');
    // Monrovia 1971-01-01 is UTC-0:44:30: a one-hour meeting typed at 09:00 starts at 09:44:30Z
    await G.select('#convZone', 'Africa/Monrovia'); await setDate('1971-01-01');
    await typeTime('8:00');
    await G.click('#btnPlanner'); await G.waitForSelector('#planner:not([hidden]) .plan-row');
    await G.click('.plan-row[data-zone="Africa/Monrovia"] .plan-cell[data-h="8"]'); await sleep(150);
    await typeTime('9:00');
    const m0 = await st();
    const start = Date.UTC(1971, 0, 1, 9, 44, 30);
    eq([m0.error, m0.convert.epochMs, m0.meeting && m0.meeting.startMs, m0.meeting && m0.meeting.endMs - m0.meeting.startMs], [null, start, start, 3600000], 'Monrovia meeting');
    await G.select('#convZone', 'Europe/Lisbon'); await sleep(150);
    const m1 = await st();
    await G.click('#btnSettings'); await G.waitForSelector('#settingsPanel:not([hidden])');
    await G.click('#optHour24'); await sleep(150); await G.click('#optHour24'); await P.keyboard.press('Escape'); await sleep(150);
    const m2 = await st();
    await G.select('#convZone', 'Africa/Monrovia'); await sleep(150);
    const m3 = await st();
    for (const [m, at] of [[m1, 'Lisbon'], [m2, 'format'], [m3, 'back to Monrovia']]) {
      eq([m.error, m.convert.epochMs, m.meeting], [null, start, m0.meeting], `exact endpoints after ${at}`);
    }
    assert(/^10:44( AM)?$/.test(m1.field) && /^0?9:00( AM)?$/.test(m3.field), `fields show the minute: ${m1.field} ${m3.field}`);
    // Troll falls back two hours (+2 to +0) at 01:00Z on 2026-10-25: 02:00 Lisbon (02:00Z) is the SECOND 02:00 in Troll,
    // two hours after the first (00:00Z). The carried pin keeps it; typed 02:00 there takes the first.
    await G.select('#convZone', 'Europe/Lisbon'); await setDate('2026-10-25');
    await typeTime('2:00');
    const t0 = await st();
    eq([t0.convert.epochMs, t0.meeting && t0.meeting.startMs], [Date.UTC(2026, 9, 25, 2), Date.UTC(2026, 9, 25, 2)], 'Lisbon 02:00 meeting');
    await G.select('#convZone', 'Antarctica/Troll'); await sleep(150);
    const t1 = await st();
    eq([t1.error, t1.convert.epochMs, t1.meeting, /^0?2:00( AM)?$/.test(t1.field)], [null, Date.UTC(2026, 9, 25, 2), t0.meeting, true], 'second 02:00 in Troll kept');
    await typeTime('2:00');
    const t2 = await st();
    eq(t2.convert.epochMs, Date.UTC(2026, 9, 25, 0), 'typed 02:00 in Troll takes the first occurrence');
    // gaps are still refused: 02:30 on 2027-03-14 in New York
    await G.select('#convZone', 'America/New_York'); await setDate('2027-03-14'); await typeTime('2:30');
    const g = await st();
    assert(/doesn’t exist on this date/.test(g.error || ''), `gap still refused: ${JSON.stringify(g)}`);
    noErrors(P, 'exact pins');
  } finally { await ctx.close(); }
});

// The search box's delayed blur (120 ms) must not hide the results of a query typed after coming straight back.
await check('city search: a quick blur and refocus keeps the new results; leaving still dismisses them', async () => {
  const ctx = await browser.createBrowserContext();
  const P = await openPage(ctx);
  try {
    const G = await openHome(P);
    await G.click('#zoneSearch'); await P.keyboard.type('Monrovia');
    await G.waitForSelector('#zoneResults li[id^="zr-"]', { visible: true });
    // blur, refocus within the old timer, a new query, then wait well past 120 ms
    await G.evaluate(() => { const s = document.getElementById('zoneSearch'); s.blur(); s.focus(); s.value = 'Troll'; s.dispatchEvent(new Event('input', { bubbles: true })); });
    await sleep(400);
    const kept = await G.evaluate(() => ({ hidden: document.getElementById('zoneResults').hidden, first: (document.querySelector('#zoneResults li b') || {}).textContent, expanded: document.getElementById('zoneSearch').getAttribute('aria-expanded') }));
    assert(!kept.hidden && kept.first === 'Troll' && kept.expanded === 'true', `results after refocus: ${JSON.stringify(kept)}`);
    await P.keyboard.press('Enter');
    await G.waitForSelector('.card[data-zone="Antarctica/Troll"]');
    // normal dismissal: focus elsewhere and the list goes
    await G.click('#zoneSearch'); await P.keyboard.type('Lima');
    await G.waitForSelector('#zoneResults li[id^="zr-"]', { visible: true });
    await G.click('#convTime'); await sleep(300);
    assert(await G.$eval('#zoneResults', (n) => n.hidden), 'leaving the box hides the results');
    noErrors(P, 'search refocus');
  } finally { await ctx.close(); }
});

// ======================= Find a time (priority 2: truthful availability, fresh visitors) =======================
// Results count a city only when it works for the whole meeting; compromises say so and name everyone outside their
// hours; with nothing on the date the panel searches ahead (14 days) or offers a way forward. Opening it never moves
// the selection; picking a result commits the exact interval.
const findSeed = (zones, hours, extra = {}) => JSON.stringify({ zones, hours, hour12: false, planner: true, firstRun: false, ...extra });
const findState = (G) => G.evaluate(() => {
  const p = document.getElementById('planFindPanel'), b = document.getElementById('planFind'), s = window.WCConverter.state();
  return { open: !p.hidden, expanded: b.getAttribute('aria-expanded'), disabled: b.disabled, intro: (p.querySelector('.find-intro') || {}).textContent || '',
    heads: [...p.querySelectorAll('.find-head')].map((n) => n.textContent),
    items: [...p.querySelectorAll('.find-item')].map((n) => ({ kind: n.className.replace('find-item ', ''), main: n.querySelector('.find-main').textContent, sub: n.querySelector('.find-sub').textContent, start: +n.dataset.start, end: +n.dataset.end })),
    actions: [...p.querySelectorAll('.find-action')].map((n) => n.textContent),
    focus: document.activeElement ? document.activeElement.id || document.activeElement.className : '', meeting: s.meeting, convert: s.convert,
    field: document.getElementById('convTime').value, date: document.getElementById('convDate').value, sel: document.getElementById('planSel').textContent };
});
async function findSetup(ctx, settings, { width = 1440, height = 900, mobile = false } = {}) {
  const P = await openPage(ctx, { width, height, mobile });
  await P.evaluateOnNewDocument((s) => { if (!localStorage.getItem('owc-app-settings')) localStorage.setItem('owc-app-settings', s); }, settings);
  const G = await openHome(P);
  await G.waitForFunction(() => window.WCConverter && document.querySelector('#planner:not([hidden]) .plan-row'));
  const typeTime = async (text) => { await G.click('#convTime', { count: 3 }); await G.evaluate(() => document.getElementById('convTime').select()); await P.keyboard.type(text); await sleep(150); };
  const at = async (zone, ymd, time) => {
    await G.select('#convZone', zone);
    await G.evaluate((v) => { const d = document.getElementById('convDate'); d.value = v; delete d.dataset.auto; }, ymd);
    await typeTime(time);
  };
  return { P, G, typeTime, at };
}
const openFindKeys = async (P, G) => { await G.focus('#planFind'); await P.keyboard.press('Enter'); await sleep(100); };

await check('Find a time: whole-meeting coverage, labeled compromises with every conflict named, keyboard, no implicit selection, all-off recovery', async () => {
  const ctx = await browser.createBrowserContext();
  const shots = path.join(SHOTS, 'find'); fs.mkdirSync(shots, { recursive: true });
  const NY = 'America/New_York', TO = 'America/Toronto', DE = 'America/Detroit', wd = [1, 2, 3, 4, 5];
  const { P, G, at } = await findSetup(ctx, findSeed([NY, TO, DE], { [NY]: { start: '09:00', end: '11:00', days: wd }, [TO]: { start: '09:00', end: '10:00', days: wd }, [DE]: { start: '10:00', end: '11:00', days: wd } }));
  try {
    // Wednesday 2026-10-14, New York source: select 09:00 to 11:00 (a click and Shift+Right)
    await at(NY, '2026-10-14', '9:00');
    await G.click(`.plan-row[data-zone="${NY}"] .plan-cell[data-h="9"]`);
    await P.keyboard.down('Shift'); await P.keyboard.press('ArrowRight'); await P.keyboard.up('Shift'); await sleep(150);
    const before = await findState(G);
    const s9 = zonedEpoch(NY, '2026-10-14', 9, 0);
    eq(before.meeting, { startMs: s9, endMs: s9 + 2 * 3600000 }, 'selected 09:00 to 11:00');
    const t0 = Date.now();
    await openFindKeys(P, G);
    const two = await findState(G);
    two.ms = Date.now() - t0;
    fs.writeFileSync(path.join(shots, 'two-hours.json'), JSON.stringify(two, null, 2));
    await P.screenshot({ path: path.join(shots, 'compromise-two-hours.png') });
    eq(two.meeting, before.meeting, 'opening Find a time does not move the selection');
    assert(two.open && two.expanded === 'true' && /^For a 2 h meeting on Wed, Oct 14, times in New York$/.test(two.intro), `panel: ${JSON.stringify(two)}`);
    assert(!two.heads.includes('Works for everyone') && two.heads[0] === 'Compromises: not everyone is in working hours', `no false full match: ${JSON.stringify(two.heads)}`);
    eq(two.items.map((i) => [i.kind, i.main, i.sub]), [['partial', '09:00 to 11:00 (New York)', '1 of 3 in working hours for the whole meeting. Outside working hours for some or all of it: Toronto, Detroit']], 'two-hour compromise names Toronto and Detroit');
    assert(!two.items.some((i) => /2 of 3/.test(i.sub)), 'never 2 of 3 throughout 09:00 to 11:00');
    assert(two.focus === 'find-item partial', `focus on the first result: ${two.focus}`);
    await P.keyboard.press('Escape'); await sleep(50);
    const esc = await findState(G);
    assert(!esc.open && esc.expanded === 'false' && esc.focus === 'planFind', `Escape closes and returns focus: ${JSON.stringify(esc)}`);
    eq(esc.meeting, before.meeting, 'Escape leaves the selection');
    // one hour: two compromises, each naming the city outside
    await G.click('#convClear'); await at(NY, '2026-10-14', '9:00');
    await openFindKeys(P, G);
    const one = await findState(G);
    eq(one.items.map((i) => [i.main, i.sub]), [['09:00 to 10:00 (New York)', '2 of 3 in working hours for the whole meeting. Outside working hours for some or all of it: Detroit'], ['10:00 to 11:00 (New York)', '2 of 3 in working hours for the whole meeting. Outside working hours for some or all of it: Toronto']], 'one-hour compromises');
    assert(one.heads.includes('Nothing works for everyone in the next 14 days') && one.actions[0] === 'Choose another date' && one.actions.length === 4, `no full match ahead, actions: ${JSON.stringify(one)}`);
    // keyboard: ArrowDown to the second compromise, Enter commits exactly that interval
    await P.keyboard.press('ArrowDown'); await P.keyboard.press('Enter'); await sleep(200);
    const picked = await findState(G);
    const s10 = zonedEpoch(NY, '2026-10-14', 10, 0);
    eq([picked.meeting, picked.convert.epochMs, picked.field, picked.open, picked.focus], [{ startMs: s10, endMs: s10 + 3600000 }, s10, '10:00', false, 'planFind'], 'Enter commits the compromise');
    assert(/^Wed, Oct 14, 10:00 to 11:00 \(New York\)$/.test(picked.sel), `slot line: ${picked.sel}`);
    // Saturday: nobody works, nothing ahead fits everyone: a clear message and ways forward, not a dead end
    await at(NY, '2026-10-17', '10:00');
    await openFindKeys(P, G);
    const sat = await findState(G);
    await P.screenshot({ path: path.join(shots, 'all-off.png') });
    assert(sat.heads[0] === 'No one is in working hours for the whole meeting on this date' && sat.items.length === 0 && sat.heads.includes('Nothing works for everyone in the next 14 days'), `Saturday: ${JSON.stringify(sat)}`);
    eq(sat.actions, ['Choose another date', 'Working hours: New York', 'Working hours: Toronto', 'Working hours: Detroit'], 'recovery actions');
    assert(sat.focus === 'find-action', `focus on the first action: ${sat.focus}`);
    await P.keyboard.press('Enter'); await sleep(150);
    assert(await G.$eval('#dateChips', (n) => !n.hidden), 'Choose another date opens the dates');
    await P.keyboard.press('Escape');
    await openFindKeys(P, G);
    await G.evaluate(() => [...document.querySelectorAll('#planFindPanel .find-action')].find((b) => /Toronto/.test(b.textContent)).click()); await sleep(150);
    assert(await G.$eval('#hoursEditor', (n) => !n.hidden), 'the Toronto hours editor opens');
    await P.keyboard.press('Escape');
    noErrors(P, 'find a time');
  } finally { await ctx.close(); }
});

await check('Find a time: minute schedules, Sunday recovery to the next date, exact result, invalid input gating', async () => {
  const ctx = await browser.createBrowserContext();
  const shots = path.join(SHOTS, 'find'); fs.mkdirSync(shots, { recursive: true });
  const LI = 'Europe/Lisbon', LO = 'Europe/London', ten = { start: '09:10', end: '10:10', days: [1, 2, 3, 4, 5] };
  const { P, G, at, typeTime } = await findSetup(ctx, findSeed([LI, LO], { [LI]: ten, [LO]: ten }));
  try {
    // Wednesday: no whole hour fits, 09:10 does (London is Lisbon's clock)
    await at(LI, '2026-10-14', '12:00');
    await openFindKeys(P, G);
    const wed = await findState(G);
    await P.screenshot({ path: path.join(shots, 'complete-match.png') });
    eq([wed.heads[0], wed.items.map((i) => [i.kind, i.main, i.sub])], ['Works for everyone', [['full', '09:10 to 10:10 (Lisbon)', 'All 2 in working hours for the whole meeting']]], 'complete match at 09:10');
    await P.keyboard.press('Enter'); await sleep(200);
    const got = await findState(G);
    const s = Date.UTC(2026, 9, 14, 8, 10);
    eq([got.meeting, got.convert.epochMs, got.field], [{ startMs: s, endMs: s + 3600000 }, s, '09:10'], 'the result is the meeting, exactly');
    // Sunday: nothing on the date, the next date that works is offered and keeps the meeting length
    await G.click('#convClear');
    await at(LI, '2026-10-18', '12:00');
    await openFindKeys(P, G);
    const sun = await findState(G);
    await P.screenshot({ path: path.join(shots, 'sunday-next.png') });
    eq(sun.heads, ['No one is in working hours for the whole meeting on this date', 'Next date that works for everyone'], 'Sunday groups');
    eq(sun.items.map((i) => [i.kind, i.main]), [['full next', 'Mon, Oct 19, 09:10 to 10:10 (Lisbon)']], 'next date result');
    eq(sun.meeting, null, 'nothing selected by the search');
    await P.keyboard.press('Enter'); await sleep(200);
    const mon = await findState(G);
    const m = Date.UTC(2026, 9, 19, 8, 10);
    eq([mon.meeting, mon.date, mon.field], [{ startMs: m, endMs: m + 3600000 }, '2026-10-19', '09:10'], 'Monday committed with its date');
    // priority 1 gating: an invalid draft disables Find a time and keeps exports off until fixed
    await G.evaluate(() => { const t = document.getElementById('convTime'); t.focus(); t.value = '25:99'; t.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: '25:99' })); });
    await sleep(300);
    const bad = await findState(G);
    const exp = await G.evaluate(() => ({ copy: document.getElementById('btnCopy').disabled, slot: document.getElementById('planCopy').disabled, hash: window.WCShareHash() }));
    assert(bad.disabled && !bad.open && exp.copy && exp.slot && exp.hash === '', `invalid input gating: ${JSON.stringify({ bad, exp })}`);
    await G.evaluate(() => document.getElementById('planFind').click()); await sleep(100);
    assert(!(await findState(G)).open, 'Find a time stays closed while the time is invalid');
    await typeTime('9:10');
    const fixed = await findState(G);
    eq([fixed.disabled, fixed.meeting], [false, mon.meeting], 'fixing the time restores Find a time and the same meeting');
    noErrors(P, 'find a time, minutes');
  } finally { await ctx.close(); }
});

await check('Find a time on a 390 phone: the panel wraps inside the frame in English, Portuguese and Spanish', async () => {
  const shots = path.join(SHOTS, 'find'); fs.mkdirSync(shots, { recursive: true });
  const NY = 'America/New_York', TO = 'America/Toronto', DE = 'America/Detroit', wd = [1, 2, 3, 4, 5];
  for (const lang of ['en', 'pt', 'es']) {
    const ctx = await browser.createBrowserContext();
    const { P, G, at } = await findSetup(ctx, findSeed([NY, TO, DE], { [NY]: { start: '09:00', end: '11:00', days: wd }, [TO]: { start: '09:00', end: '10:00', days: wd }, [DE]: { start: '10:00', end: '11:00', days: wd } }, { language: lang }), { width: 390, height: 844, mobile: true });
    try {
      await toApp(P);
      await at(NY, '2026-10-17', '10:00'); // Saturday: the longest texts (no one, nothing ahead, actions)
      await openFindKeys(P, G);
      const fit = await G.evaluate(() => {
        const p = document.getElementById('planFindPanel'), r = p.getBoundingClientRect();
        const over = [...p.querySelectorAll('*')].filter((n) => n.scrollWidth > n.clientWidth + 1 || n.getBoundingClientRect().right > r.right + 1).map((n) => n.className);
        return { open: !p.hidden, left: r.left, right: r.right, W: innerWidth, over, wide: p.scrollWidth > p.clientWidth + 1, n: p.querySelectorAll('.find-action').length };
      });
      await P.screenshot({ path: path.join(shots, `phone-${lang}.png`) });
      assert(fit.open && fit.left >= 0 && fit.right <= fit.W && !fit.wide && fit.over.length === 0 && fit.n === 4, `${lang}: ${JSON.stringify(fit)}`);
      noErrors(P, `find a time ${lang}`);
    } finally { await ctx.close(); }
  }
});

// ======================= priority 4: one meeting, three actions, exact links (fresh visitors) =======================
// Copy times, Copy link and Calendar file all carry the selected meeting's exact UTC start and end; the link is the
// version 2 form (s/e in whole seconds) and opens the same meeting on every route without saving anything.
const DL = path.join(SHOTS, 'actions-downloads');
async function meetingActions(P, G, dir) {
  const out = {};
  await P.evaluate(() => navigator.clipboard.writeText(''));
  await G.click('#planCopy'); out.times = (await waitClip(P)).replace(/\r/g, '');
  await P.evaluate(() => navigator.clipboard.writeText(''));
  await G.click('#planLink'); out.link = await waitClip(P);
  await P.evaluate(() => navigator.clipboard.writeText(''));
  await G.click('#btnCopy'); await G.click('#copyMenu [data-copy="utc"]'); out.utc = (await waitClip(P)).replace(/\r/g, '');
  for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f));
  await G.click('#planIcs');
  for (let i = 0; i < 60 && !fs.readdirSync(dir).some((f) => f.endsWith('.ics')); i++) await sleep(100);
  const file = fs.readdirSync(dir).find((f) => f.endsWith('.ics'));
  out.icsName = file; out.ics = file ? fs.readFileSync(path.join(dir, file)) : null;
  out.status = await G.evaluate(() => (document.getElementById('convToast').hidden ? '' : document.getElementById('convToast').textContent) || document.getElementById('convHint').textContent);
  out.state = await G.evaluate(() => window.WCConverter.state());
  out.kind = await G.evaluate(() => window.WCShareKind());
  return out;
}
const waitClip = async (P) => { for (let i = 0; i < 40; i++) { const t = await P.evaluate(() => navigator.clipboard.readText()); if (t) return t; await sleep(50); } return ''; };
const icsField = (buf, k) => { const m = new RegExp(`\\r\\n${k}:([0-9TZ]+)\\r\\n`).exec(buf.toString('utf8')); return m ? m[1] : null; };
const icsUtc = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[-:]/g, '');
const isoNoMs = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
function agree(a, m, label) {
  const hash = new URL(a.link).hash.slice(1), q = new URLSearchParams(hash);
  eq([q.get('v'), +q.get('s') * 1000, +q.get('e') * 1000], ['2', m.startMs, m.endMs], `${label}: link s/e`);
  assert(!/label|hours|group/i.test(hash), `${label}: no private data in the link: ${hash}`);
  assert(a.ics && a.icsName === 'meeting.ics', `${label}: a calendar file downloaded (${a.icsName})`);
  eq([icsField(a.ics, 'DTSTART'), icsField(a.ics, 'DTEND')], [icsUtc(m.startMs), icsUtc(m.endMs)], `${label}: calendar file endpoints`);
  const text = a.ics.toString('utf8');
  assert(!/(^|[^\r])\n/.test(text) && text.split('\r\n').every((l) => Buffer.byteLength(l) <= 75) && /\r\nMETHOD:PUBLISH\r\n/.test(text), `${label}: CRLF, folded, publish only`);
  eq(a.utc.split('\n')[0], `${isoNoMs(m.startMs)}/${isoNoMs(m.endMs)}`, `${label}: UTC copy interval`);
  eq(a.state.meeting, m, `${label}: meeting unchanged by the actions`);
  assert(/Calendar file download started/.test(a.status), `${label}: truthful download feedback: ${a.status}`);
  eq(a.times.split('\n').pop(), `UTC: ${isoNoMs(m.startMs)} to ${isoNoMs(m.endMs)}`, `${label}: Copy times ends with the exact UTC interval`);
  return hash;
}

await check('meeting actions: Copy times, Copy link and Calendar file agree on exact intervals (minute start, multi-hour, year boundary, repeated hour)', async () => {
  const ctx = await browser.createBrowserContext();
  await ctx.overridePermissions(base, ['clipboard-read', 'clipboard-sanitized-write']);
  const dir = path.join(DL, 'a'); fs.mkdirSync(dir, { recursive: true });
  const LI = 'Europe/Lisbon', NY = 'America/New_York';
  const { P, G, at, typeTime } = await findSetup(ctx, findSeed([LI, NY], {}, { labels: { [NY]: 'Private Office' } }));
  const cdp = await browser.target().createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dir, browserContextId: ctx.id });
  const evidence = {};
  try {
    const select2h = async (zone, ymd) => {
      await at(zone, ymd, '9:00');
      await G.click(`.plan-row[data-zone="${zone}"] .plan-cell[data-h="9"]`);
      await P.keyboard.down('Shift'); await P.keyboard.press('ArrowRight'); await P.keyboard.up('Shift'); await sleep(150);
    };
    // a: arbitrary minute start, two hours (Lisbon 09:10 to 11:10 on Wed 2026-10-14)
    await select2h(LI, '2026-10-14'); await typeTime('9:10');
    const ma = { startMs: Date.UTC(2026, 9, 14, 8, 10), endMs: Date.UTC(2026, 9, 14, 10, 10) };
    eq(await G.evaluate(() => window.WCShareKind()), 'meeting', 'share kind');
    const a = await meetingActions(P, G, dir);
    const hashA = agree(a, ma, 'minute start');
    assert(/^Wed, Oct 14, 09:10 to 11:10 \(Lisbon\)\n/.test(a.times) && /Private Office: 04:10 to 06:10/.test(a.times), `Copy times: ${a.times}`);
    assert(/Private Office/.test(a.times) && !/Private/.test(hashA), 'labels stay in the copied text, never in the link');
    eq(await P.$eval('#heroShareText', (n) => n.textContent), 'Share meeting', 'host Share label');
    evidence.minute = { times: a.times, link: a.link, utc: a.utc, ics: a.ics.toString('utf8') };
    // b: across midnight and the year (Lisbon 2026-12-31 23:30 to 2027-01-01 01:30)
    await G.click('#convClear'); await select2h(LI, '2026-12-31'); await typeTime('23:30');
    const mb = { startMs: Date.UTC(2026, 11, 31, 23, 30), endMs: Date.UTC(2027, 0, 1, 1, 30) };
    const b = await meetingActions(P, G, dir);
    agree(b, mb, 'year boundary');
    assert(/^Thu, Dec 31, 2026, 23:30 to Fri, Jan 1, 2027, 01:30 \(Lisbon\)\n/.test(b.times) && /\nLisbon: 23:30, Thu, Dec 31 to 01:30, Fri, Jan 1\n/.test(b.times), `Copy times across the year: ${b.times}`);
    evidence.year = { times: b.times, link: b.link, ics: b.ics.toString('utf8') };
    // c: the second 01:30 of New York's fall-back night (06:30Z), opened from its version 2 link in this page
    const sc = Date.UTC(2026, 10, 1, 6, 30) / 1000;
    await G.click('#convClear');
    await P.evaluate((h) => { location.hash = h; }, `v=2&c=${LI},${NY}&z=${NY}&s=${sc}&e=${sc + 5400}`);
    await G.waitForFunction((s) => { const m = window.WCConverter.state().meeting; return m && m.startMs === s * 1000; }, { timeout: 5000 }, sc);
    const mc = { startMs: sc * 1000, endMs: (sc + 5400) * 1000 };
    const c = await meetingActions(P, G, dir);
    const hashC = agree(c, mc, 'repeated hour');
    eq([c.state.convert.zone, await G.$eval('#convTime', (n) => n.value)], [NY, '01:30'], 'source and field show the second 01:30');
    assert(/^Sun, Nov 1, 01:30 to 03:00 \(Private Office, UTC-5 to UTC-5\)\n/.test(c.times), `repeated hour named by its offset: ${c.times}`);
    evidence.repeated = { times: c.times, link: c.link, ics: c.ics.toString('utf8') };
    // without a meeting: the converted time is shared (legacy c/t/z) and labeled Share time; with neither, the cities
    await G.click('#convClear'); await at(LI, '2026-10-14', '15:00');
    eq([await G.evaluate(() => window.WCShareKind()), await P.$eval('#heroShareText', (n) => n.textContent), await G.evaluate(() => window.WCShareHash())],
      ['time', 'Share time', `c=${LI},${NY}&t=2026-10-14T15:00&z=${LI}`], 'converted time sharing');
    await G.click('#convClear'); await sleep(150);
    eq([await G.evaluate(() => window.WCShareKind()), await P.$eval('#heroShareText', (n) => n.textContent), await G.evaluate(() => window.WCShareHash())], ['cities', 'Share cities', `c=${LI},${NY}`], 'city sharing');
    // an invalid draft never becomes city sharing
    await G.evaluate(() => { const t = document.getElementById('convTime'); t.focus(); t.value = '25:99'; t.dispatchEvent(new InputEvent('input', { bubbles: true })); });
    await sleep(200);
    eq([await G.evaluate(() => window.WCShareKind()), await G.evaluate(() => window.WCShareHash())], ['blocked', ''], 'invalid draft blocks sharing');
    fs.writeFileSync(path.join(SHOTS, 'actions-evidence.json'), JSON.stringify({ ...evidence, hashA, hashC }, null, 2));
    globalThis.__p4links = { hashA, hashC, ma, mc };
    noErrors(P, 'meeting actions');
  } finally { await cdp.detach().catch(() => {}); await ctx.close(); }
});

await check('version 2 links open the same exact meeting on home, PT, a tool page, ES tool and /app/; nothing is saved; a bad link shows nothing plausible', async () => {
  const { hashA, hashC, ma, mc } = globalThis.__p4links || {};
  assert(hashA && hashC, 'links from the previous check');
  const routes = [['/', hashA, ma, 'Europe/Lisbon'], ['/pt/', hashA, ma, 'Europe/Lisbon'], ['/meeting-planner.html', hashC, mc, 'America/New_York'], ['/es/meeting-planner.html', hashC, mc, 'America/New_York'], ['/app/', hashC, mc, 'America/New_York']];
  // an ordinary saved profile: planner closed, a label, the 12-hour clock, dark theme (none of it may change on receiving)
  const seeded = findSeed(['Asia/Tokyo'], { 'Asia/Tokyo': { start: '10:00', end: '19:00', days: [1, 2, 3, 4, 5] } }, { planner: false, labels: { 'Asia/Tokyo': 'Tokyo HQ' }, hour12: true, theme: 'dark' });
  const seededObj = JSON.parse(seeded);
  for (const [route, hash, m, zone] of routes) {
    const ctx = await browser.createBrowserContext();
    const P = await openPage(ctx);
    try {
      await P.evaluateOnNewDocument((s) => { if (!localStorage.getItem('owc-app-settings')) localStorage.setItem('owc-app-settings', s); }, seeded);
      await P.goto(`${base}${route}#${hash}`, { waitUntil: 'load' });
      const G = await appFrame(P);
      await G.waitForFunction((s) => { const st = window.WCConverter && window.WCConverter.state(); return st && st.meeting && st.meeting.startMs === s; }, { timeout: 15000 }, m.startMs);
      await sleep(500); // any save the app or the tool wrapper would make (a tool page opens its planner)
      const got = await G.evaluate(() => ({ st: window.WCConverter.state(), stored: JSON.parse(localStorage.getItem('owc-app-settings')), banner: document.documentElement.classList.contains('is-shared') ? document.querySelector('.web-shared-text').textContent : '',
        summary: document.getElementById('planSelBar').hidden ? '' : document.getElementById('planSel').textContent, planner: !document.getElementById('planner').hidden }));
      eq([got.st.meeting, got.st.convert.zone], [m, zone], `${route}: exact meeting`);
      eq(got.stored, seededObj, `${route}: saved settings byte for byte the same`);
      assert(got.planner && got.summary, `${route}: the meeting summary and actions are on screen from the default view: ${JSON.stringify(got)}`);
      assert(/(yours|o seu|el tuyo)/.test(got.banner), `${route}: says whose working hours: ${got.banner}`);
      await sleep(3500); // past any toast
      const note = await G.evaluate(() => { const n = document.getElementById('webImport'); return n.hidden ? '' : n.textContent; });
      assert(/(yours|o seu|el tuyo)/.test(note), `${route}: the imported meeting keeps saying whose hours: ${note}`);
      noErrors(P, `link ${route}`);
    } finally { await ctx.close(); }
  }
  // the visitor's own cities: no shared banner, but the meeting still says whose working hours are shown
  {
    const c0 = await browser.createBrowserContext();
    const P0 = await openPage(c0);
    try {
      await P0.evaluateOnNewDocument((s) => { if (!localStorage.getItem('owc-app-settings')) localStorage.setItem('owc-app-settings', s); }, seeded);
      const sT = Date.UTC(2026, 9, 14, 1, 0) / 1000;
      await P0.goto(`${base}/#v=2&c=Asia/Tokyo&z=Asia/Tokyo&s=${sT}&e=${sT + 3600}`, { waitUntil: 'load' });
      const G0 = await appFrame(P0);
      await G0.waitForFunction((x) => { const st = window.WCConverter && window.WCConverter.state(); return st && st.meeting && st.meeting.startMs === x; }, { timeout: 15000 }, sT * 1000);
      await sleep(3500);
      const r0 = await G0.evaluate(() => ({ shared: document.documentElement.classList.contains('is-shared'), note: document.getElementById('webImport').hidden ? '' : document.getElementById('webImport').textContent, stored: JSON.parse(localStorage.getItem('owc-app-settings')) }));
      assert(!r0.shared && /yours/.test(r0.note), `same cities: disclosure without the shared banner: ${JSON.stringify(r0)}`);
      eq(r0.stored, seededObj, 'same cities: saved settings unchanged');
    } finally { await c0.close(); }
  }
  // malformed: end before start; nothing from it (no cities, no time), and the visitor is told
  const ctx = await browser.createBrowserContext();
  const P = await openPage(ctx);
  try {
    await P.evaluateOnNewDocument((s) => { if (!localStorage.getItem('owc-app-settings')) localStorage.setItem('owc-app-settings', s); }, seeded);
    await P.goto(`${base}/#v=2&c=Europe/Paris&z=Europe/Paris&s=1792000000&e=1791990000`, { waitUntil: 'load' });
    const G = await appFrame(P);
    await G.waitForFunction(() => !document.getElementById('webImport').hidden, { timeout: 8000 });
    const got = await G.evaluate(() => ({ st: window.WCConverter.state(), shared: document.documentElement.classList.contains('is-shared'), cards: [...document.querySelectorAll('.card[data-zone]')].map((c) => c.dataset.zone), toast: document.getElementById('webImport').textContent }));
    eq([got.st.meeting, got.st.convert, got.shared, got.cards], [null, null, false, ['Asia/Tokyo']], 'bad link: nothing plausible');
    await sleep(3500);
    const kept = await G.evaluate(() => { const n = document.getElementById('webImport'); return n.hidden ? '' : n.textContent; });
    assert(/isn’t valid/.test(kept), `bad link message stays: ${kept}`);
  } finally { await ctx.close(); }
  // a valid meeting link, then an invalid one by hashchange: the earlier meeting goes, nothing is exportable as the new link's
  {
    const ctx2 = await browser.createBrowserContext();
    const P2 = await openPage(ctx2);
    try {
      await P2.evaluateOnNewDocument((s) => { if (!localStorage.getItem('owc-app-settings')) localStorage.setItem('owc-app-settings', s); }, seeded);
      await P2.goto(`${base}/#${hashA}`, { waitUntil: 'load' });
      const G2 = await appFrame(P2);
      await G2.waitForFunction((s) => { const st = window.WCConverter && window.WCConverter.state(); return st && st.meeting && st.meeting.startMs === s; }, { timeout: 15000 }, ma.startMs);
      await P2.evaluate(() => { location.hash = 'v=2&c=Europe/Paris&z=Europe/Paris&s=1792000000&s=1792000600&e=1792003600'; });
      await sleep(3500);
      const after = await G2.evaluate(() => ({ st: window.WCConverter.state(), hash: window.WCShareHash(), note: document.getElementById('webImport').hidden ? '' : document.getElementById('webImport').textContent }));
      eq([after.st.meeting, after.st.convert], [null, null], 'the earlier meeting is gone after a bad link');
      assert(/isn’t valid/.test(after.note) && !/v=2|t=/.test(after.hash), `after a bad hashchange: ${JSON.stringify(after)}`);
    } finally { await ctx2.close(); }
  }
  // wrappers keep a bad tuple bad: repeated s, s and e without v, an oversized value (home and a tool page)
  const badHashes = ['v=2&c=Europe/Paris&z=Europe/Paris&s=1792000000&s=x&e=1792003600', 'c=Europe/Paris&s=1792000000&e=1792003600',
    `v=2&c=Europe/Paris&z=Europe/Paris&s=1792000000&e=1792003600&c=${'Asia/Tokyo,'.repeat(380)}`];
  for (const route of ['/', '/meeting-planner.html']) {
    for (const h of badHashes) {
      const c3 = await browser.createBrowserContext();
      const P3 = await openPage(c3);
      try {
        await P3.evaluateOnNewDocument((s) => { if (!localStorage.getItem('owc-app-settings')) localStorage.setItem('owc-app-settings', s); }, seeded);
        await P3.goto(`${base}${route}#${h}`, { waitUntil: 'load' });
        const G3 = await appFrame(P3);
        await G3.waitForFunction(() => !document.getElementById('webImport').hidden, { timeout: 15000 });
        const r = await G3.evaluate(() => ({ st: window.WCConverter.state(), shared: document.documentElement.classList.contains('is-shared'), cards: [...document.querySelectorAll('.card[data-zone]')].map((c) => c.dataset.zone), note: document.getElementById('webImport').textContent }));
        eq([r.st.meeting, r.st.convert, r.shared, r.cards], [null, null, false, ['Asia/Tokyo']], `${route} ${h.slice(0, 60)}: nothing plausible`);
        assert(/isn’t valid/.test(r.note), `${route}: says the link is not valid`);
      } finally { await c3.close(); }
    }
  }
});

await check('clipboard refused: the full text and link to copy by hand, focused and selected; Escape returns focus', async () => {
  const ctx = await browser.createBrowserContext();
  const LI = 'Europe/Lisbon', NY = 'America/New_York';
  const { P, G, at, typeTime } = await findSetup(ctx, findSeed([LI, NY], {}));
  try {
    await at(LI, '2026-10-14', '9:00');
    await G.click(`.plan-row[data-zone="${LI}"] .plan-cell[data-h="9"]`); await sleep(100);
    await typeTime('9:10');
    // stubs: the async clipboard rejects and the execCommand fallback fails (the system clipboard is never touched)
    const stub = () => { navigator.clipboard.writeText = () => Promise.reject(new DOMException('denied', 'NotAllowedError')); document.execCommand = () => false; };
    await G.evaluate(stub); await P.evaluate(stub);
    await G.focus('#planCopy'); await P.keyboard.press('Enter'); await sleep(200);
    const fb = await G.evaluate(() => { const ta = document.getElementById('copyFallbackText'); return { shown: !document.getElementById('copyFallback').hidden, value: ta.value, focus: document.activeElement.id, sel: [ta.selectionStart, ta.selectionEnd, ta.value.length], title: document.getElementById('copyFallbackTitle').textContent }; });
    assert(fb.shown && /^Wed, Oct 14, 09:10 to 10:10 \(Lisbon\)\nLisbon: 09:10 to 10:10/.test(fb.value) && fb.focus === 'copyFallbackText' && fb.sel[0] === 0 && fb.sel[1] === fb.sel[2] && /Ctrl\+C/.test(fb.title), `fallback: ${JSON.stringify(fb)}`);
    await P.screenshot({ path: path.join(SHOTS, 'actions-clipboard-fallback.png') });
    await P.keyboard.press('Escape'); await sleep(50);
    eq(await G.evaluate(() => [document.getElementById('copyFallback').hidden, document.activeElement.id]), [true, 'planCopy'], 'Escape closes and returns focus');
    await G.click('#planLink'); await sleep(200);
    const link = await G.$eval('#copyFallbackText', (n) => n.value);
    assert(/^http:\/\/127\.0\.0\.1:\d+\/#v=2&c=Europe\/Lisbon,America\/New_York&z=Europe\/Lisbon&s=\d+&e=\d+$/.test(link), `link fallback: ${link}`);
    await G.click('#copyFallbackClose');
    // the host page's Share: the link in a selected field under the window
    await P.evaluate(() => window.scrollTo(0, 0)); await P.click('#heroShare'); await sleep(300);
    const host = await P.evaluate(() => { const f = document.querySelector('.share-fallback-link'); return f && { value: f.value, focus: document.activeElement === f, sel: f.selectionEnd === f.value.length, label: f.getAttribute('aria-label') }; });
    assert(host && host.value === link && host.focus && host.sel && /Copy this link/.test(host.label), `host fallback: ${JSON.stringify(host)}`);
    noErrors(P, 'clipboard refused');
  } finally { await ctx.close(); }
});

await check('Calendar file fails from the header with the planner closed: the planner opens and the failure stays beside the meeting', async () => {
  const ctx = await browser.createBrowserContext();
  const LI = 'Europe/Lisbon';
  const { P, G, at } = await findSetup(ctx, findSeed([LI, 'America/New_York'], {}));
  try {
    await at(LI, '2026-10-14', '9:00');
    await G.click(`.plan-row[data-zone="${LI}"] .plan-cell[data-h="9"]`); await sleep(150);
    await G.click('#btnPlanner'); await sleep(200); // close the planner: the meeting stays
    eq(await G.evaluate(() => [document.getElementById('planner').hidden, !!window.WCConverter.state().meeting]), [true, true], 'planner closed, meeting kept');
    await G.evaluate(() => { URL.createObjectURL = () => { throw new Error('blocked'); }; }); // the download cannot start
    await G.click('#btnCopy'); await G.click('#copyMenu [data-copy="ics"]');
    await sleep(2200); // past any short status
    const r = await G.evaluate(() => { const n = document.getElementById('planStatus'); return { planner: !document.getElementById('planner').hidden, status: n.hidden || !n.offsetParent ? '' : n.textContent, retry: !document.getElementById('planIcs').hidden && !document.getElementById('planIcs').disabled }; });
    eq(r, { planner: true, status: 'Couldn’t create the calendar file. Select Calendar file to try again.', retry: true }, 'visible, lasting recovery');
    await P.screenshot({ path: path.join(SHOTS, 'actions-ics-failed-header.png') });
    noErrors(P, 'ics failed from the header');
  } finally { await ctx.close(); }
});

await check('meeting actions wrap inside a 375 phone in English, Portuguese and Spanish', async () => {
  for (const lang of ['en', 'pt', 'es']) {
    const ctx = await browser.createBrowserContext();
    const { P, G, at } = await findSetup(ctx, findSeed(['Europe/Lisbon', 'America/Sao_Paulo'], {}, { language: lang }), { width: 375, height: 812, mobile: true });
    try {
      await at('Europe/Lisbon', '2026-10-14', '9:00');
      await G.click('.plan-row[data-zone="Europe/Lisbon"] .plan-cell[data-h="9"]'); await sleep(200);
      const fit = await G.evaluate(() => {
        const bar = document.getElementById('planSelBar'), W = innerWidth;
        const btns = ['planCopy', 'planLink', 'planIcs'].map((id) => document.getElementById(id)).filter((b) => !b.hidden);
        return { n: btns.length, inside: btns.every((b) => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= W + 0.5; }), clipped: btns.some((b) => b.scrollWidth > b.clientWidth + 1), text: btns.map((b) => b.textContent), barRight: bar.getBoundingClientRect().right, W };
      });
      await toApp(P); await P.screenshot({ path: path.join(SHOTS, `actions-375-${lang}.png`) });
      assert(fit.n === 3 && fit.inside && !fit.clipped, `${lang}: ${JSON.stringify(fit)}`);
      noErrors(P, `actions 375 ${lang}`);
    } finally { await ctx.close(); }
  }
});

// ======================= priority 5: the phone planner shows the meeting, and stays where the user scrolls it =======================
// The phone planner (.plan-narrow) scrolls sideways inside #planBody. These checks measure real rectangles: the band or cell
// must sit inside #planBody's visible box (labels are on their own row there, so nothing sticky covers the cells).
const inView = (G, sel) => G.evaluate((sel) => {
  const b = document.getElementById('planBody'), v = b.getBoundingClientRect(), n = document.querySelector(sel);
  if (!n) return { ok: false, why: 'missing ' + sel };
  const r = n.getBoundingClientRect(), right = v.left + b.clientWidth;
  return { ok: r.left >= v.left - 0.5 && r.right <= right + 0.5 && r.width > 0, startIn: r.left >= v.left - 0.5 && r.left < right, past: r.right > right + 0.5,
    r: [Math.round(r.left), Math.round(r.right)], v: [Math.round(v.left), Math.round(right)], scroll: Math.round(b.scrollLeft), max: b.scrollWidth - b.clientWidth };
}, sel);
const pageY = (P) => P.evaluate(() => Math.round(window.scrollY));
async function phonePlanner(ctx, width, hash, extra = {}) {
  const NY = 'America/New_York';
  const { zones = ['Europe/Lisbon', NY, 'Asia/Tokyo'], ...rest } = extra;
  const settings = findSeed(zones, {}, rest);
  const P = await openPage(ctx, { width, height: 820, mobile: width < 600, scheme: extra.theme === 'dark' ? 'dark' : 'light' });
  await P.evaluateOnNewDocument((s) => { if (!localStorage.getItem('owc-app-settings')) localStorage.setItem('owc-app-settings', s); }, settings);
  await P.goto(`${base}/${hash ? '#' + hash : ''}`, { waitUntil: 'load' });
  const G = await appFrame(P);
  await G.waitForFunction(() => window.WCConverter && document.querySelector('#planner:not([hidden]) .plan-row'), { timeout: 20000 });
  await P.evaluate(() => { const r = document.getElementById('heroApp').getBoundingClientRect(); window.scrollTo(0, scrollY + r.top + 120); });
  await sleep(300);
  return { P, G };
}
const nyAt = (ymd, h, mi = 0) => zonedEpoch('America/New_York', ymd, h, mi) / 1000;
const v2 = (zone, s, e, cities = 'Europe/Lisbon,America/New_York,Asia/Tokyo') => `v=2&c=${cities}&z=${zone}&s=${s}&e=${e}`;

await check('phone planner reveal: a received meeting is in view at 375 and 320, a manual scroll stays through ticks and format, explicit picks reveal', async () => {
  const shots = path.join(SHOTS, 'reveal'); fs.mkdirSync(shots, { recursive: true });
  for (const width of [375, 320]) {
    const ctx = await browser.createBrowserContext();
    try {
      const s9 = nyAt('2026-10-14', 9);
      const { P, G } = await phonePlanner(ctx, width, v2('America/New_York', s9, s9 + 3600));
      await G.waitForFunction((x) => { const m = window.WCConverter.state().meeting; return m && m.startMs === x; }, { timeout: 15000 }, s9 * 1000);
      await sleep(200);
      assert(await G.evaluate(() => document.documentElement.classList.contains('plan-narrow') || document.getElementById('app').classList.contains('plan-narrow')), `${width}: the phone planner`);
      let r = await inView(G, '#planner .plan-sel'); const r0 = r;
      assert(r.ok && r.scroll > 0, `${width}: received 09:00 meeting in view, not midnight: ${JSON.stringify(r)}`);
      r = await inView(G, '.plan-row[data-zone="America/New_York"] .plan-cell[data-h="9"]');
      assert(r.ok, `${width}: its 09:00 cell in view: ${JSON.stringify(r)}`);
      await P.screenshot({ path: path.join(shots, `received-${width}.png`) });
      // a touch swipe scrolls the hours (to the far left) without selecting anything
      const y0 = await pageY(P);
      const box = await G.evaluate(() => { const b = document.getElementById('planBody').getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width }; });
      const frame = await P.evaluate(() => { const r = document.getElementById('heroApp').getBoundingClientRect(); return { x: r.left, y: r.top }; });
      const y = frame.y + box.y + 60, x0 = frame.x + box.x + 30;
      const url0 = P.url();
      // one swipe, never one that starts at the very start: Chrome gives an unscrollable swipe to the page (history back)
      await P.touchscreen.touchStart(x0, y);
      for (let i = 1; i <= 8; i++) await P.touchscreen.touchMove(x0 + i * (box.w * 0.85 / 8), y);
      await P.touchscreen.touchEnd();
      await sleep(400);
      eq(P.url(), url0, `${width}: the swipe stayed on the page`);
      const swiped = await G.evaluate(() => document.getElementById('planBody').scrollLeft);
      assert(swiped < r0.scroll, `${width}: the touch swipe scrolled the hours toward the start: ${r0.scroll} -> ${swiped}`);
      await G.evaluate(() => { document.getElementById('planBody').scrollLeft = 0; }); // then settle at the very start, whatever the fling did
      await sleep(200);
      const st0 = await G.evaluate(() => window.WCConverter.state());
      eq(st0.meeting, { startMs: s9 * 1000, endMs: (s9 + 3600) * 1000 }, `${width}: touch scrolling selected nothing`);
      const left0 = await G.evaluate(() => document.getElementById('planBody').scrollLeft);
      // ticks (a minute's worth of renders) and a format change do not snap it back
      await sleep(1500);
      await G.evaluate(() => { for (let i = 0; i < 5; i++) window.dispatchEvent(new Event('resize')); });
      // (clicked in the page, not with G.click: puppeteer's click scrolls the host page to the element itself)
      eq(await pageY(P), y0, `${width}: ticks and resizes did not move the host page`);
      // opening Settings focuses its first option, which the browser brings into view (smoothly): measure from there
      await G.evaluate(() => document.getElementById('btnSettings').click()); await G.waitForSelector('#settingsPanel:not([hidden])'); await sleep(800);
      const y1 = await pageY(P);
      await G.evaluate(() => document.getElementById('optHour24').click()); await sleep(400);
      eq(await pageY(P), y1, `${width}: the format change did not move the host page`);
      await P.keyboard.press('Escape'); await sleep(300);
      eq(await G.evaluate(() => document.getElementById('planBody').scrollLeft), left0, `${width}: the manual scroll is kept through ticks, resizes and a format change`);
      await P.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), y0); await sleep(100); // back where the test started
      // an explicit new start reveals it, inside the planner only
      const ye = await pageY(P);
      await G.evaluate(() => { const t = document.getElementById('convTime'); t.value = '18:00'; t.dispatchEvent(new Event('input', { bubbles: true })); });
      await sleep(300);
      r = await inView(G, '#planner .plan-sel');
      assert(r.ok, `${width}: a new start (18:00) is revealed: ${JSON.stringify(r)}`);
      assert(Math.abs((await pageY(P)) - ye) <= 2, `${width}: revealing the new start did not move the page`);
      // keyboard to a later hour: the focused cell stays visible, the page does not move (measured once the edit's own
      // short status has gone, so its height change, which the browser anchors, is not counted)
      await sleep(2500);
      const yk = await pageY(P);
      await G.evaluate(() => document.querySelector('.plan-row[data-zone="America/New_York"] .plan-cell[data-h="18"]').focus({ preventScroll: true }));
      for (let i = 0; i < 5; i++) await P.keyboard.press('ArrowRight');
      await sleep(200);
      r = await inView(G, '.plan-cell:focus');
      const fh = await G.evaluate(() => document.activeElement.dataset.h);
      assert(r.ok && fh === '23', `${width}: keyboard focus on 23:00 in view: ${fh} ${JSON.stringify(r)}`);
      // the arrows move the meeting, its summary rewraps and the app's height changes: the browser's scroll anchoring may
      // shift the page by layout rounding. A page-level reveal (scrollIntoView) would move it by hundreds.
      const dyk = Math.abs((await pageY(P)) - yk);
      assert(dyk <= 2, `${width}: keyboard did not move the page: ${dyk}px`);
      // scrolled away by hand, then the planner closed and opened again: the meeting is revealed again
      await G.evaluate(() => { document.getElementById('planBody').scrollLeft = 0; });
      for (let i = 0; i < 2; i++) { await G.evaluate(() => document.getElementById('btnPlanner').click()); await sleep(250); }
      r = await inView(G, '#planner .plan-sel');
      assert(r.ok && r.scroll > 0, `${width}: reopening reveals the meeting: ${JSON.stringify(r)}`);
      const dyr = Math.abs((await pageY(P)) - yk);
      assert(dyr <= 2, `${width}: reopening did not move the page: ${dyr}px`);
      noErrors(P, `reveal ${width}`);
    } finally { await ctx.close(); }
  }
});

await check('phone planner reveal: next date result, a long meeting shows its start with more past the edge, half and quarter hour sources, new rows keep the page, no meeting shows now, dark theme', async () => {
  const shots = path.join(SHOTS, 'reveal'); fs.mkdirSync(shots, { recursive: true });
  // next date: Sunday has nothing for everyone; the Monday result is revealed
  {
    const ctx = await browser.createBrowserContext();
    try {
      // Lisbon and New York (weekday hours) share Monday afternoon in Lisbon; Tokyo would leave no full overlap on any date
      const { P, G } = await phonePlanner(ctx, 375, '', { theme: 'dark', zones: ['Europe/Lisbon', 'America/New_York'] });
      await G.select('#convZone', 'Europe/Lisbon');
      await G.evaluate(() => { const d = document.getElementById('convDate'); d.value = '2026-10-18'; delete d.dataset.auto; const t = document.getElementById('convTime'); t.value = '0:00'; t.dispatchEvent(new Event('input', { bubbles: true })); });
      await sleep(300);
      await G.evaluate(() => { document.getElementById('planBody').scrollLeft = 0; });
      // as a user would: Find fully in view below the site's fixed header, then a real tap on it. Opening Find focuses its
      // first result, which the browser may bring into view: measure the reveal from there
      const navH = () => P.evaluate(() => document.querySelector('.nav').getBoundingClientRect().bottom);
      const findOnPage = () => G.evaluate(() => { const r = document.getElementById('planFind').getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; })
        .then(async (r) => { const f = await P.evaluate(() => document.getElementById('heroApp').getBoundingClientRect().top); return { top: f + r.top, bottom: f + r.bottom }; });
      const f0 = await findOnPage(), nav = await navH();
      await P.evaluate((dy) => window.scrollTo({ top: scrollY + dy, behavior: 'instant' }), Math.round(f0.top - nav - 40)); await sleep(200);
      const f1 = await findOnPage();
      assert(f1.top >= nav && f1.bottom <= 820, `Find fully visible below the header before the tap: ${JSON.stringify({ f1, nav })}`);
      await P.touchscreen.tap((await P.evaluate(() => document.getElementById('heroApp').getBoundingClientRect().left)) + (await G.evaluate(() => { const r = document.getElementById('planFind').getBoundingClientRect(); return r.left + r.width / 2; })), (f1.top + f1.bottom) / 2);
      await G.waitForSelector('#planFindPanel:not([hidden])'); await sleep(800);
      const yr = await pageY(P), hr = await P.evaluate(() => document.getElementById('heroApp').getBoundingClientRect().height);
      const next = await G.evaluate(() => { const b = document.querySelector('#planFindPanel .find-item.next'); if (b) b.click(); return b && b.textContent; });
      await sleep(400);
      const r = await inView(G, '#planner .plan-sel');
      assert(next && r.ok, `next date result revealed: ${next} ${JSON.stringify(r)}`);
      // the panel closing and the meeting bar appearing change the app's height, which the browser anchors: allowed up to
      // that change (plus rounding). The old jump (focus returned to Find without preventScroll) moved the page ~450 px.
      const res = await P.evaluate(() => ({ y: Math.round(scrollY), h: document.getElementById('heroApp').getBoundingClientRect().height }));
      const findBtn = await findOnPage(), focus = await G.evaluate(() => document.activeElement.id), nav2 = await navH();
      assert(Math.abs(res.y - yr) <= Math.abs(res.h - hr) + 2 && focus === 'planFind' && findBtn.top >= nav2 && findBtn.bottom <= 820,
        `the result reveal kept the page, focus back on a fully visible Find: ${JSON.stringify({ yr, hr, res, findBtn, nav2, focus })}`);
      await P.screenshot({ path: path.join(shots, 'next-date-375-dark.png') });
      noErrors(P, 'reveal next date');
    } finally { await ctx.close(); }
  }
  // a 12-hour meeting at 320: its start in view, the rest past the right edge, reachable by scrolling
  {
    const ctx = await browser.createBrowserContext();
    try {
      const s8 = nyAt('2026-10-14', 8);
      const { P, G } = await phonePlanner(ctx, 320, v2('America/New_York', s8, s8 + 12 * 3600));
      await G.waitForFunction((x) => { const m = window.WCConverter.state().meeting; return m && m.startMs === x; }, { timeout: 15000 }, s8 * 1000);
      await sleep(200);
      const r = await inView(G, '#planner .plan-sel');
      const c8 = await inView(G, '.plan-row[data-zone="America/New_York"] .plan-cell[data-h="8"]');
      assert(r.startIn && r.past && c8.ok && r.scroll < r.max, `long meeting: start in view, more past the edge: ${JSON.stringify({ r, c8 })}`);
      await P.screenshot({ path: path.join(shots, 'long-320.png') });
      noErrors(P, 'reveal long');
    } finally { await ctx.close(); }
  }
  // half and quarter hour sources (Kolkata +5:30, Kathmandu +5:45): 09:00 there is in view
  for (const zone of ['Asia/Kolkata', 'Asia/Kathmandu']) {
    const ctx = await browser.createBrowserContext();
    try {
      const s = zonedEpoch(zone, '2026-10-14', 9, 0) / 1000;
      const { P, G } = await phonePlanner(ctx, 375, v2(zone, s, s + 3600, `Europe/Lisbon,${zone}`));
      await G.waitForFunction((x) => { const m = window.WCConverter.state().meeting; return m && m.startMs === x; }, { timeout: 15000 }, s * 1000);
      await sleep(200);
      const r = await inView(G, '#planner .plan-sel');
      assert(r.ok && r.scroll > 0, `${zone}: 09:00 in view: ${JSON.stringify(r)}`);
      noErrors(P, `reveal ${zone}`);
    } finally { await ctx.close(); }
  }
  // no meeting: the current time line is in view; adding a city keeps the page and the sideways scroll
  {
    const ctx = await browser.createBrowserContext();
    try {
      const { P, G } = await phonePlanner(ctx, 375, '');
      await sleep(300);
      const now = await inView(G, '#planner .plan-now');
      assert(now.ok, `no meeting: the current time in view: ${JSON.stringify(now)}`);
      await G.evaluate(() => { document.getElementById('planBody').scrollLeft = 200; });
      const y0 = await pageY(P), l0 = await G.evaluate(() => document.getElementById('planBody').scrollLeft);
      await G.evaluate(() => { const s = document.getElementById('zoneSearch'); s.focus({ preventScroll: true }); s.value = 'Sydney'; s.dispatchEvent(new Event('input', { bubbles: true })); });
      await G.waitForSelector('#zoneResults li[id^="zr-"]');
      await G.evaluate(() => document.getElementById('zoneSearch').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
      await G.waitForSelector('.plan-row[data-zone="Australia/Sydney"]');
      await sleep(300);
      eq([await pageY(P), await G.evaluate(() => document.getElementById('planBody').scrollLeft)], [y0, l0], 'a new row keeps the page and the scroll');
      noErrors(P, 'reveal rows');
    } finally { await ctx.close(); }
  }
  // a capped body with more rows than it shows (as in a work-area-limited window): keyboard down to a later city keeps
  // the focused cell inside #planBody vertically too, by scrolling the body, never the page
  {
    const ctx = await browser.createBrowserContext();
    try {
      const zones = ['Europe/Lisbon', 'America/New_York', 'Asia/Tokyo', 'Europe/Berlin', 'Asia/Kolkata', 'Australia/Sydney', 'America/Los_Angeles', 'America/Sao_Paulo'];
      const { P, G } = await phonePlanner(ctx, 375, '', { zones });
      await G.evaluate(() => { const b = document.getElementById('planBody'); b.style.maxHeight = '160px'; });
      await sleep(200);
      const y0 = await pageY(P);
      await G.evaluate(() => document.querySelector('.plan-row[data-zone="Europe/Lisbon"] .plan-cell[data-h="9"]').focus({ preventScroll: true }));
      for (let i = 0; i < 7; i++) await P.keyboard.press('ArrowDown');
      await sleep(200);
      const v = await G.evaluate(() => {
        const b = document.getElementById('planBody'), c = document.activeElement, r = c.getBoundingClientRect(), bb = b.getBoundingClientRect();
        return { zone: c.closest('.plan-row') && c.closest('.plan-row').dataset.zone, inside: r.top >= bb.top - 0.5 && r.bottom <= bb.top + b.clientHeight + 0.5, top: b.scrollTop, capped: b.scrollHeight > b.clientHeight + 1 };
      });
      assert(v.capped && v.zone === 'America/Sao_Paulo' && v.inside && v.top > 0, `focused later city in view vertically: ${JSON.stringify(v)}`);
      const h = await inView(G, '.plan-cell:focus');
      assert(h.ok, `and horizontally: ${JSON.stringify(h)}`);
      eq(await pageY(P), y0, 'vertical keyboard did not move the page');
      noErrors(P, 'reveal vertical');
    } finally { await ctx.close(); }
  }
  // desktop: the whole day fits, the received meeting is simply there (nothing scrolls)
  {
    const ctx = await browser.createBrowserContext();
    try {
      const s9 = nyAt('2026-10-14', 9);
      const { P, G } = await phonePlanner(ctx, 1440, v2('America/New_York', s9, s9 + 3600));
      await G.waitForFunction((x) => { const m = window.WCConverter.state().meeting; return m && m.startMs === x; }, { timeout: 15000 }, s9 * 1000);
      const r = await inView(G, '#planner .plan-sel');
      assert(r.ok && r.scroll === 0 && r.max <= 0, `desktop: in view without scrolling: ${JSON.stringify(r)}`);
      noErrors(P, 'reveal desktop');
    } finally { await ctx.close(); }
  }
});

await check('a shared link opens those clocks in the hero for a new visitor without saving them', async () => {
  const ctxB = await browser.createBrowserContext();
  const B = await openPage(ctxB);
  const BF = await openHome(B, shareUrl.slice(base.length + 1));
  await BF.waitForFunction(() => document.querySelectorAll('.card.converted').length === 5);
  eq((await cards(BF)).map((c) => c.zone), [...DEFAULT_CITIES, 'Asia/Tokyo'], 'shared cities');
  await checkConverted(BF, 'America/New_York', 15, 0);
  eq(await BF.$eval('.card[data-zone="Asia/Tokyo"] .city', (n) => n.textContent), 'Tokyo', 'no label from the sender');
  assert(await visible(BF, '#webShared'), 'banner shown');
  const s = await saved(B);
  assert(!s || s.firstRun === true, 'the visitor has no saved list yet');
  noErrors(B, 'shared link page');
  await ctxB.close();
});

await check('a shared link in the same tab keeps the saved list; "Show my cities" and "Save these cities" work', async () => {
  const before = (await saved(A)).zones;
  // a new hash on the home page (hashchange): the hero switches to the link's cities
  await A.goto(`${base}/#c=Asia/Kolkata,Australia/Sydney&t=2026-09-24T09:30&z=Asia/Kolkata`, { waitUntil: 'load' });
  await F.waitForFunction(() => document.querySelectorAll('.card[data-zone]').length === 2);
  eq((await cards(F)).map((c) => c.zone), ['Asia/Kolkata', 'Australia/Sydney'], 'shared cities');
  await F.waitForFunction(() => document.querySelectorAll('.card.converted').length === 2);
  await checkConverted(F, 'Asia/Kolkata', 9, 30);
  assert(await visible(F, '#webShared'), 'banner shown');
  eq((await saved(A)).zones, before, 'saved list untouched');
  await F.click('#webMine');
  await F.waitForFunction((n) => document.querySelectorAll('.card[data-zone]').length === n, {}, before.length);
  eq((await cards(F)).map((c) => c.zone), before, 'back to my cities');
  eq(await A.evaluate(() => location.hash), '', 'the home page\'s hash cleared');
  assert(!(await visible(F, '#webShared')), 'banner hidden');
  assert(await F.$eval('#convClear', (n) => n.hidden), 'showing the current time again');
  // a fresh load of a link this time (not a hashchange)
  await A.goto('about:blank');
  F = await openHome(A, '#c=Asia/Kolkata,Australia/Sydney');
  await F.waitForFunction(() => document.querySelectorAll('.card[data-zone]').length === 2);
  await F.click('#webSave');
  await F.waitForFunction(() => !document.documentElement.classList.contains('is-shared'));
  eq((await saved(A)).zones, ['Asia/Kolkata', 'Australia/Sydney'], 'saved after "Save these cities"');
  eq(await A.evaluate(() => location.hash), '', 'hash cleared');
});

await check('switches the language to Portuguese, then Spanish, and back', async () => {
  await F.click('#btnSettings');
  await F.waitForSelector('#settingsPanel:not([hidden])');
  await F.select('#optLanguage', 'pt');
  await F.waitForFunction(() => document.documentElement.lang === 'pt-BR');
  eq(await F.$eval('#panelTitle', (n) => n.textContent), 'Configurações', 'panel title');
  eq(await F.$eval('#webSave', (n) => n.textContent), 'Salvar estas cidades', 'banner button');
  eq(await F.$eval('.web-help-free a', (n) => n.textContent), 'Grátis e de código aberto. Sem cadastro, sem anúncios.', 'free and open source line');
  eq((await saved(A)).language, 'pt', 'saved language');
  await F.select('#optLanguage', 'es');
  await F.waitForFunction(() => /^es/.test(document.documentElement.lang));
  eq(await F.$eval('#webMine', (n) => n.textContent), 'Mostrar mis ciudades', 'banner button in Spanish');
  eq(await F.$eval('.web-help-free a', (n) => n.textContent), 'Gratis y de código abierto. Sin cuenta, sin anuncios.', 'free and open source line in Spanish');
  await F.select('#optLanguage', 'auto');
  await F.waitForFunction(() => document.documentElement.lang === 'en-US');
  eq(await F.$eval('#webSave', (n) => n.textContent), 'Save these cities', 'back in English');
});

// L (0..1) of a computed colour: oklch() as is, rgb() by relative luminance.
const lightness = (frame, sel) => frame.$eval(sel, (n) => {
  const c = getComputedStyle(n).backgroundColor;
  let m = /oklch\(([\d.]+)/.exec(c);
  if (m) return +m[1];
  m = /rgba?\(([\d.]+),?\s*([\d.]+),?\s*([\d.]+)/.exec(c);
  return m ? (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255 : -1;
});
await check('switches the theme; "System" follows the website\'s theme button, live', async () => {
  await F.select('#optTheme', 'dark');
  eq(await F.$eval('html', (n) => n.dataset.theme), 'dark', 'data-theme');
  assert((await lightness(F, 'body')) < 0.4, 'dark page');
  await F.select('#optTheme', 'light');
  assert((await lightness(F, 'body')) > 0.8, 'light page');
  await F.select('#optTheme', 'system');
  await A.keyboard.press('Escape');
  // the website's theme button (site/assets/theme.js) on the home page: the app follows at once, and after a reload
  await A.evaluate(() => localStorage.setItem('wc-theme', 'dark'));
  await F.waitForFunction(() => document.documentElement.classList.contains('sys-dark'), { timeout: 3000 });
  await A.reload({ waitUntil: 'load' });
  F = await appFrame(A);
  assert(await F.$eval('html', (n) => n.classList.contains('sys-dark')), 'website dark choice wins over the (light) OS');
  assert((await lightness(F, 'body')) < 0.4, 'dark page');
  await A.evaluate(() => localStorage.removeItem('wc-theme'));
  await A.reload({ waitUntil: 'load' });
  F = await appFrame(A);
  assert(!(await F.$eval('html', (n) => n.classList.contains('sys-dark'))), 'back to the OS theme');
});

await check('no console, CSP or network errors in the first-visit session', async () => { noErrors(A, 'first visit'); });
await ctxA.close();

// ======================= phone =======================
await check('phone width (reduced motion): vertical layout, no horizontal overflow, touch drag scrubs the time', async () => {
  const ctx = await browser.createBrowserContext();
  const P = await openPage(ctx, { width: 390, height: 844, mobile: true });
  await P.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }]);
  const PF = await openHome(P);
  assert(await PF.$eval('#app', (n) => n.classList.contains('layout-vertical')), 'vertical layout');
  assert(!(await visible(PF, '#layoutWrap')), 'layout switch hidden on phones');
  const over = () => {
    const W = innerWidth;
    const out = [...document.querySelectorAll('body *')].filter((n) => {
      const r = n.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (r.right > W + 1 || r.left < -1) && getComputedStyle(n).position !== 'fixed';
    }).map((n) => n.id || n.className || n.tagName).slice(0, 5);
    return { doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, W, out };
  };
  // the home page scrolls no wider than the phone (its map scene clips a wider world on purpose); nothing in the app
  // reaches past the frame's edges
  const home = await P.evaluate(over), app = await PF.evaluate(over);
  assert(home.doc <= home.W && home.body <= home.W, `home page is ${home.doc}px wide in a ${home.W}px viewport`);
  assert(app.doc <= app.W && app.body <= app.W, `app is ${app.doc}px wide in its ${app.W}px frame`);
  eq(app.out, [], 'app: elements past the edges');
  await toApp(P);
  await sleep(300);
  const box = await (await PF.$('.card[data-zone] .arc')).boundingBox();
  assert(box && box.width > 100, 'day line shown on phone rows');
  const y = box.y + box.height / 2;
  await P.touchscreen.touchStart(box.x + box.width * 0.3, y);
  for (let i = 1; i <= 6; i++) await P.touchscreen.touchMove(box.x + box.width * (0.3 + i * 0.05), y);
  await P.touchscreen.touchEnd();
  await PF.waitForFunction(() => document.querySelectorAll('.card.converted').length > 0);
  noErrors(P, 'phone');
  await ctx.close();
});

// Nothing in the frame reaches past its edges: [ids or classes of the first offenders].
const pastEdges = () => [...document.querySelectorAll('body *')].filter((n) => {
  const r = n.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && (r.right > innerWidth + 1 || r.left < -1) && getComputedStyle(n).position !== 'fixed';
}).map((n) => n.id || n.className || n.tagName).slice(0, 5);

await check('phones (360, 390, 430): Copy sits in the top row, the converter keeps one row, nothing past the edges; the frame fits the planner', async () => {
  for (const width of [360, 390, 430]) {
    const ctx = await browser.createBrowserContext();
    const P = await openPage(ctx, { width, height: 844, mobile: true });
    await P.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }]);
    const PF = await openHome(P, `#t=${todayIn('America/New_York')}T15:00&z=America/New_York`);
    await PF.waitForFunction(() => document.querySelectorAll('.card.converted').length > 0 && !document.getElementById('btnCopy').hidden);
    const bar = await PF.evaluate(() => {
      const r = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) }; };
      return { copy: r('btnCopy'), map: r('btnMap'), add: r('zoneSearch'), time: r('convTime'), zone: r('convZone'), clear: r('convClear'), day: r('btnDay'), barH: Math.round(document.querySelector('.bar').getBoundingClientRect().height) };
    });
    const mid = (x) => (x.t + x.b) / 2;
    assert(Math.abs(mid(bar.copy) - mid(bar.map)) <= 2 && bar.copy.r <= bar.map.l && bar.copy.l >= bar.add.r, `${width}: Copy in the top row, between the add button and the icons ${JSON.stringify(bar)}`);
    assert([bar.zone, bar.day, bar.clear].every((x) => Math.abs(mid(x) - mid(bar.time)) <= 2), `${width}: time, city, day and Back to now on one row ${JSON.stringify(bar)}`);
    assert(bar.zone.r - bar.zone.l >= 80, `${width}: the city select keeps its room (${bar.zone.r - bar.zone.l}px)`);
    assert(bar.barH <= 96, `${width}: two bar rows (${bar.barH}px)`);
    eq(await PF.evaluate(pastEdges), [], `${width}: elements past the edges while converting`);
    if (width === 390) {
      const full = await P.evaluate(() => document.getElementById('heroApp').getBoundingClientRect().height);
      await PF.click('#btnPlanner');
      await PF.waitForSelector('#planner:not([hidden]) .plan-row');
      await P.waitForFunction((f) => document.getElementById('heroApp').getBoundingClientRect().height < f - 20, { timeout: 3000 }, full);
      await sleep(200);
      const fit = await PF.evaluate(() => {
        const axis = document.querySelector('#planner .plan-axis').getBoundingClientRect(), body = document.getElementById('planBody');
        return { H: innerHeight, axis: Math.round(axis.bottom), clipped: body.scrollHeight > body.clientHeight + 1 };
      });
      assert(!fit.clipped && fit.axis <= fit.H && fit.H - fit.axis <= 24, `390: the frame ends under the hour scale ${JSON.stringify({ full, ...fit })}`);
      await PF.click('#btnPlanner');
      await P.waitForFunction((f) => Math.abs(document.getElementById('heroApp').getBoundingClientRect().height - f) < 1, { timeout: 3000 }, full);
    }
    noErrors(P, `phone ${width}`);
    await ctx.close();
  }
});

await check('desktop (1280, 1440, 1536, 1920): every default city on one row, nothing scrolled or faded, the cards fill the frame', async () => {
  for (const [width, height] of [[1280, 720], [1440, 900], [1536, 864], [1920, 1080]]) {
    const ctx = await browser.createBrowserContext();
    const P = await openPage(ctx, { width, height });
    await P.emulateTimezone('America/Sao_Paulo'); // first run there: Sao Paulo plus the four defaults with other clocks
    const PF = await openHome(P);
    await sleep(600);
    const m = await PF.evaluate(() => {
      const s = document.getElementById('strip'), cards = [...document.querySelectorAll('.card[data-zone]')].map((c) => c.getBoundingClientRect());
      const sr = s.getBoundingClientRect(), bar = document.querySelector('.bar').getBoundingClientRect();
      return { n: cards.length, scroll: s.scrollWidth - s.clientWidth, fade: /overflow-(start|end)/.test(s.className), rows: s.classList.contains('rows'),
        inside: cards.every((c) => c.left >= sr.left - 1 && c.right <= sr.right + 1), oneRow: new Set(cards.map((c) => Math.round(c.top))).size === 1,
        above: Math.round(Math.min(...cards.map((c) => c.top)) - bar.bottom), below: Math.round(innerHeight - Math.max(...cards.map((c) => c.bottom))), w: Math.round(cards[0].width) };
    });
    assert(m.n === 5 && m.scroll <= 1 && !m.fade && !m.rows && m.inside && m.oneRow, `${width}: five cards on one row, no scroll or fade ${JSON.stringify(m)}`);
    assert(m.above <= 40 && m.below <= 48 && m.w >= 200, `${width}: the cards fill the frame (${m.above}px above, ${m.below}px below, ${m.w}px wide)`);
    noErrors(P, `desktop ${width}`);
    await ctx.close();
  }
});

// ======================= page language from the hash (shim.js) =======================
// The home page in Portuguese or Spanish frames /app/#lang=pt or #lang=es.
await check('page language from the hash: #lang=pt at load and #lang=es later set the app\'s auto language; a shared link keeps it; a picked language wins', async () => {
  const ctx = await browser.createBrowserContext();
  const P = await openPage(ctx);
  // the Portuguese home page (/pt/): demo.js starts the frame at /app/#lang=pt
  const openAt = async (url) => {
    await P.goto(url, { waitUntil: 'load' });
    const f = await appFrame(P);
    await P.evaluate(() => { const d = document.getElementById('demo'); return d && Promise.all(d.getAnimations().map((x) => x.finished.catch(() => {}))); });
    return f;
  };
  let PF = await openAt(`${base}/pt/`);
  await PF.waitForFunction(() => document.documentElement.lang === 'pt-BR');
  eq(await PF.evaluate(() => location.hash), '#lang=pt', 'frame hash');
  eq(await PF.$eval('#btnDayText', (n) => n.textContent), 'Hoje', 'converter day in Portuguese');
  eq(await PF.$eval('.web-help-free a', (n) => n.textContent), 'Grátis e de código aberto. Sem cadastro, sem anúncios.', 'web string in Portuguese');
  eq(await PF.evaluate(() => window.wc.getSettings().then((s) => s.language)), 'auto', 'the saved language stays auto');
  // a new hash on the frame (the page switched language without a reload): Spanish at once
  await PF.evaluate(() => { location.hash = 'lang=es'; });
  await PF.waitForFunction(() => /^es/.test(document.documentElement.lang));
  eq(await PF.$eval('#btnDayText', (n) => n.textContent), 'Hoy', 'converter day in Spanish');
  // a shared link on the Spanish page: the banner in Spanish; "Show my cities" clears the link, not the language
  await P.goto('about:blank');
  PF = await openAt(`${base}/es/#c=Asia/Tokyo,Europe/Paris`);
  await PF.waitForFunction(() => /^es/.test(document.documentElement.lang) && document.documentElement.classList.contains('is-shared'));
  eq((await cards(PF)).map((c) => c.zone), ['Asia/Tokyo', 'Europe/Paris'], 'shared cities');
  eq(await PF.$eval('#webSave', (n) => n.textContent), 'Guardar estas ciudades', 'banner button in Spanish');
  eq(await PF.$eval('.web-shared-text', (n) => n.textContent), 'Estás viendo ciudades compartidas. Tu lista guardada sigue igual. El horario laboral es el tuyo, no el de quien envió el enlace.', 'banner text in Spanish');
  await PF.click('#webMine');
  await P.waitForFunction(() => !location.hash, { timeout: 5000 }).catch(() => {});
  await PF.waitForFunction(() => document.querySelector('.card[data-zone]') && !document.documentElement.classList.contains('is-shared'), { timeout: 10000 }).catch(() => {});
  PF = await appFrame(P);
  await PF.waitForFunction(() => /^es/.test(document.documentElement.lang));
  eq(await PF.evaluate(() => location.hash), '#lang=es', 'the frame keeps its language');
  // a language picked in Settings wins over the page's
  await PF.click('#btnSettings');
  await PF.waitForSelector('#settingsPanel:not([hidden])');
  await PF.select('#optLanguage', 'en');
  await PF.waitForFunction(() => document.documentElement.lang === 'en-US');
  eq(await PF.$eval('#btnDayText', (n) => n.textContent), 'Today', 'English picked in Settings');
  noErrors(P, 'page language');
  await ctx.close();
});

// ======================= touch reorder (web.js) =======================
// A finger, the way a phone sends it: down, rest past the lift delay (web.js HOLD_MS, 380 ms), then move in steps.
const center = async (frame, sel) => {
  const b = await (await frame.$(sel)).boundingBox();
  assert(b, `${sel} is not on screen`);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
async function touchDrag(page, from, to, { hold = 520, steps = 12, before } = {}) {
  await page.touchscreen.touchStart(from.x, from.y);
  await sleep(hold);
  for (let i = 1; i <= steps; i++) {
    await page.touchscreen.touchMove(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    await sleep(16);
  }
  await sleep(120); // the last animation frame places the card
  if (before) await before();
  await page.touchscreen.touchEnd();
}
const order = (frame) => frame.$$eval('.card[data-zone]', (cs) => cs.map((c) => c.dataset.zone));
// nothing left behind by a drag: no lifted card, no offsets, the page class gone
const settled = (frame) => frame.waitForFunction(() => !document.querySelector('.web-lifted') && !document.documentElement.classList.contains('web-reordering')
  && [...document.querySelectorAll('.card[data-zone]')].every((c) => !c.style.translate), { timeout: 3000 });

await check('touch reorder on a phone: hold and drag moves a city; a swipe scrolls; hold and let go opens the menu; Escape cancels; keys still work', async () => {
  const ctx = await browser.createBrowserContext();
  const P = await openPage(ctx, { width: 390, height: 844, mobile: true });
  const PF = await openHome(P);
  await PF.waitForFunction(() => !document.querySelector('.strip.wc-cards-booting'));
  await sleep(600); // the boot animation
  await toApp(P);
  await sleep(300);
  eq(await order(PF), DEFAULT_CITIES, 'first-run order');
  assert(await PF.$eval('#app', (n) => n.classList.contains('layout-vertical')), 'vertical layout');
  // Lisbon (1st) onto Los Angeles (3rd): Lisbon becomes 3rd, through the app's own drop (saved, announced)
  const want = ['America/New_York', 'America/Los_Angeles', 'Europe/Lisbon', 'Asia/Singapore'];
  let mid = null;
  await touchDrag(P, await center(PF, '.card[data-zone="Europe/Lisbon"] .city'), await center(PF, '.card[data-zone="America/Los_Angeles"]'), {
    before: async () => { mid = await PF.evaluate(() => ({ lifted: !!document.querySelector('.card.web-lifted[data-zone="Europe/Lisbon"]'), shifted: [...document.querySelectorAll('.card[data-zone]:not(.web-lifted)')].filter((c) => c.style.translate).length })); },
  });
  eq(mid, { lifted: true, shifted: 2 }, 'mid-drag: Lisbon lifted, New York and Los Angeles moved up to make room');
  await PF.waitForFunction((w) => JSON.stringify([...document.querySelectorAll('.card[data-zone]')].map((c) => c.dataset.zone)) === w, { timeout: 3000 }, JSON.stringify(want));
  eq((await saved(P)).zones, want, 'saved order');
  await PF.waitForFunction(() => /Lisbon moved to position 3/.test(document.getElementById('announce').textContent), { timeout: 3000 });
  await settled(PF);
  // a quick swipe (no hold) is a scroll, not a drag
  const ny = await center(PF, '.card[data-zone="America/New_York"] .city');
  await P.touchscreen.touchStart(ny.x, ny.y);
  for (let i = 1; i <= 6; i++) await P.touchscreen.touchMove(ny.x, ny.y + i * 30);
  await P.touchscreen.touchEnd();
  await sleep(500);
  eq(await order(PF), want, 'order after a swipe');
  assert(!(await PF.$('.web-lifted')), 'no card lifted by a swipe');
  await toApp(P);
  await sleep(300);
  // hold and let go without moving: the card menu (a long press opened it before)
  const la = await center(PF, '.card[data-zone="America/Los_Angeles"] .city');
  await P.touchscreen.touchStart(la.x, la.y);
  await sleep(520);
  assert(await PF.$('.card.web-lifted[data-zone="America/Los_Angeles"]'), 'held card lifts');
  await P.touchscreen.touchEnd();
  await PF.waitForSelector('#cardMenu:not([hidden])', { timeout: 2000 });
  eq(await order(PF), want, 'order after hold and release');
  await P.keyboard.press('Escape');
  await PF.waitForSelector('#cardMenu', { hidden: true });
  await settled(PF);
  // Escape during a drag puts everything back
  await touchDrag(P, await center(PF, '.card[data-zone="Asia/Singapore"] .city'), await center(PF, '.card[data-zone="America/New_York"]'), {
    before: async () => { await P.keyboard.press('Escape'); },
  });
  await settled(PF);
  eq(await order(PF), want, 'order after Escape');
  eq((await saved(P)).zones, want, 'saved order after Escape');
  // keyboard: Alt+Arrow on a focused card still moves it (the app's own keys, untouched by the touch code)
  await PF.focus('.card[data-zone="Asia/Singapore"]');
  await P.keyboard.down('Alt');
  await P.keyboard.press('ArrowUp');
  await P.keyboard.up('Alt');
  eq((await saved(P)).zones, ['America/New_York', 'America/Los_Angeles', 'Asia/Singapore', 'Europe/Lisbon'], 'Alt+ArrowUp');
  noErrors(P, 'touch reorder on a phone');
  await ctx.close();
});

await check('touch reorder on a tablet (reduced motion): the strip layout, no lift or slide, the drop still lands', async () => {
  const ctx = await browser.createBrowserContext();
  const T = await openPage(ctx, { width: 1024, height: 768, mobile: true });
  await T.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }]);
  const TF = await openHome(T);
  await toApp(T);
  await sleep(300);
  assert(await TF.$eval('#app', (n) => n.classList.contains('layout-strip')), 'strip layout on a tablet');
  eq(await order(TF), DEFAULT_CITIES, 'first-run order');
  // Singapore (4th) onto Lisbon (1st)
  let mid = null;
  await touchDrag(T, await center(TF, '.card[data-zone="Asia/Singapore"] .city'), await center(TF, '.card[data-zone="Europe/Lisbon"]'), {
    before: async () => {
      mid = await TF.evaluate(() => {
        const lifted = document.querySelector('.card.web-lifted');
        const other = [...document.querySelectorAll('.card[data-zone]:not(.web-lifted)')].find((c) => c.style.translate);
        const cs = other && getComputedStyle(other);
        // how long a card takes to slide aside: its translate (or all) transition, 0 when there is none
        const props = cs ? cs.transitionProperty.split(',').map((x) => x.trim()) : [];
        const durs = cs ? cs.transitionDuration.split(',').map((x) => parseFloat(x) || 0) : [];
        const slide = props.reduce((m, p, i) => (p === 'translate' || p === 'all' ? Math.max(m, durs[i % durs.length]) : m), 0);
        return { lifted: lifted && lifted.dataset.zone, scale: lifted && getComputedStyle(lifted).scale, moved: !!other, slide };
      });
    },
  });
  eq(mid, { lifted: 'Asia/Singapore', scale: 'none', moved: true, slide: 0 }, 'mid-drag with reduced motion: no scale, the other cards jump aside (no slide)');
  const want = ['Asia/Singapore', 'Europe/Lisbon', 'America/New_York', 'America/Los_Angeles'];
  await TF.waitForFunction((w) => JSON.stringify([...document.querySelectorAll('.card[data-zone]')].map((c) => c.dataset.zone)) === w, { timeout: 3000 }, JSON.stringify(want));
  eq((await saved(T)).zones, want, 'saved order');
  await settled(TF);
  noErrors(T, 'touch reorder on a tablet');
  await ctx.close();
});

// ======================= screenshots =======================
const shots = [];
async function shootSet(scheme, width) {
  const mobile = width < 600;
  const ctx = await browser.createBrowserContext();
  const S = await openPage(ctx, { width, height: mobile ? 844 : 900, scheme, mobile });
  const name = (view) => path.join(SHOTS, `${width}-${scheme}-${view}.png`);
  const snap = async (view) => { await sleep(900); await S.screenshot({ path: name(view) }); shots.push(name(view)); };
  let SF = await openHome(S);
  await snap('hero');
  await S.goto('about:blank');
  SF = await openHome(S, `#t=${todayIn('America/New_York')}T15:00&z=America/New_York`);
  await SF.waitForFunction(() => document.querySelectorAll('.card.converted').length > 0);
  if (mobile) await toApp(S);
  await snap('converter');
  await SF.click('#btnPlanner');
  await SF.waitForSelector('#planner:not([hidden]) .plan-row');
  await snap('planner');
  await SF.click('#btnMap');
  await SF.waitForSelector('#mapView:not([hidden])');
  await snap('map');
  noErrors(S, `screenshots ${width} ${scheme}`);
  await ctx.close();
}
await check('screenshots: 390 and 1440, light and dark (the hero, converting, planner, map)', async () => {
  for (const scheme of ['light', 'dark']) for (const width of [1440, 390]) await shootSet(scheme, width);
});

// ======================= metrics =======================
// The home page's own paint: the headline is the largest paint and renders at once; the app's frame, with its height
// reserved in CSS, moves nothing when it fills.
const metrics = {};
async function measure(label, { throttle = false, width = 1440, mobile = false } = {}) {
  const ctx = await browser.createBrowserContext();
  const M = await openPage(ctx, { width, height: mobile ? 844 : 900, mobile });
  await M.bringToFront();
  await M.evaluateOnNewDocument(() => {
    if (window.top !== window) return; // the home page, not the frame
    window.__lcp = 0; window.__lcpEl = ''; window.__cls = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__lcp = e.startTime; window.__lcpEl = e.element ? (e.element.className || e.element.tagName) + '' : ''; } }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  });
  if (throttle) {
    const cdp = await M.createCDPSession();
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
    await M.emulateCPUThrottling(4);
  }
  const before = { ...srv.stats };
  const MF = await openHome(M, '', 90000);
  await sleep(throttle ? 6000 : 2500);
  const r = await M.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const res = performance.getEntriesByType('resource');
    return {
      lcp: Math.round(window.__lcp), lcpElement: window.__lcpEl, cls: +window.__cls.toFixed(4),
      fcp: Math.round((performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime || 0),
      requests: 1 + res.length,
    };
  });
  r.appFirstCards = await MF.evaluate(() => Math.round((performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime || 0));
  r.serverBytes = srv.stats.bytes - before.bytes;
  metrics[label] = r;
  noErrors(M, `metrics ${label}`);
  await ctx.close();
  return r;
}
await check('performance: the headline is the LCP, within budget, and CLS is 0 (unthrottled and Slow 4G with 4x CPU)', async () => {
  const fast = await measure('home 1440, localhost');
  const slow = await measure('home 1440, Slow 4G + 4x CPU', { throttle: true });
  const phone = await measure('home 390, Slow 4G + 4x CPU', { throttle: true, width: 390, mobile: true });
  for (const m of [fast, slow, phone]) {
    eq(m.cls, 0, 'CLS');
    assert(/h1-big/.test(m.lcpElement), `LCP element ${m.lcpElement}`);
  }
  assert(fast.lcp < 1500, `LCP ${fast.lcp} ms on localhost`);
  assert(slow.lcp < 4000 && phone.lcp < 4000, `LCP ${slow.lcp} / ${phone.lcp} ms throttled`);
});
// Shipped size of the app in the frame: every file it loads, as stored and as Brotli (what Cloudflare sends to Chrome).
{
  const html = fs.readFileSync(path.join(ROOT, 'site', 'app', 'index.html'), 'utf8');
  const refs = [...html.matchAll(/\s(?:src|href)="([^"#?]+)"/g)].map((m) => m[1]).filter((r) => !/^(https?:|\/)/.test(r) && /\.(js|css|png|ico|svg)$/.test(r) && fs.existsSync(path.resolve(ROOT, 'site', 'app', r)));
  // each file once (app.bundle.js is named by its preload and its script tag), plus the map pair web.js loads later
  const files = [...new Set(['index.html', ...refs, 'app.later.js', 'app.later.css', '../assets/fonts/outfit-var.woff2'])];
  let raw = 0, br = 0;
  for (const f of files) {
    const b = fs.readFileSync(path.resolve(ROOT, 'site', 'app', f));
    raw += b.length;
    br += /\.(png|woff2)$/.test(f) ? b.length : zlib.brotliCompressSync(b).length;
  }
  metrics.appShipped = { files: files.length, bytes: raw, brotli: br };
}

await browser.close();
try { await srv.close(); } catch { /* already closed */ }

// ======================= report =======================
fs.writeFileSync(path.join(SHOTS, argVal('--filter', '') ? 'metrics-filtered.json' : 'metrics.json'), JSON.stringify({ metrics, results }, null, 2) + '\n');
console.log('\nmetrics:');
for (const [k, v] of Object.entries(metrics)) console.log(`  ${k}: ${JSON.stringify(v)}`);
console.log(`screenshots: ${shots.length} in ${SHOTS}`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
