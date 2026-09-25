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
  assert(hero.h1.startsWith('Who’s awake, anywhere.'), hero.h1);
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
  eq(await F.$eval('.web-help-free a', (n) => n.textContent), 'Grátis e de código aberto. Sem conta, sem anúncios.', 'free and open source line');
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
  eq(await PF.$eval('.web-help-free a', (n) => n.textContent), 'Grátis e de código aberto. Sem conta, sem anúncios.', 'web string in Portuguese');
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
  eq(await PF.$eval('.web-shared-text', (n) => n.textContent), 'Estás viendo ciudades compartidas. Tu lista guardada sigue igual.', 'banner text in Spanish');
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
fs.writeFileSync(path.join(SHOTS, 'metrics.json'), JSON.stringify({ metrics, results }, null, 2) + '\n');
console.log('\nmetrics:');
for (const [k, v] of Object.entries(metrics)) console.log(`  ${k}: ${JSON.stringify(v)}`);
console.log(`screenshots: ${shots.length} in ${SHOTS}`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
