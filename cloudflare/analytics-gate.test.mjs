// Tests for the host gate in site/assets/analytics.js: analytics loads only on the production hostname
// (window.SITE.siteHost in site/assets/config.js), never on a local preview, a *.pages.dev preview or any other host,
// and never under Do Not Track; for the utm_source suffix config.js adds to Store campaign ids; and for the events
// (the version on download clicks, language_switch, github_click, theme_toggle and hero_app_used from the app in the
// hero's frame, trusted input only). The two real files run in a node:vm sandbox with a stub browser, so nothing is fetched.
// Run: npm test (in cloudflare/) or node --test cloudflare/analytics-gate.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { SITE_DIR } from './check-links.mjs';

const CONFIG = readFileSync(join(SITE_DIR, 'assets', 'config.js'), 'utf8');
const ANALYTICS = readFileSync(join(SITE_DIR, 'assets', 'analytics.js'), 'utf8');

// a page load on `hostname`: runs config.js then analytics.js and returns what the page asked for
function load(hostname, { dnt = null, gpc = undefined, protocol = 'https:', lang = null } = {}) {
  const scripts = [];
  const noop = () => {};
  const origin = protocol + '//' + hostname;
  const document = {
    readyState: 'complete',
    documentElement: { getAttribute: (a) => (a === 'lang' ? lang : null) },
    head: { appendChild: (el) => { if (el.tagName === 'SCRIPT') scripts.push(el.src); return el; } },
    body: {},
    createElement: (tag) => ({ tagName: String(tag).toUpperCase(), src: '', async: false }),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: noop,
  };
  const ctx = {
    document,
    navigator: { doNotTrack: dnt, globalPrivacyControl: gpc },
    location: { hostname, protocol, origin, href: origin + '/', pathname: '/' },
    URL, URLSearchParams, setTimeout, clearTimeout,
    requestIdleCallback: (fn) => fn(), // idle at once, so a load that would happen happens inside the test
    requestAnimationFrame: noop,
    addEventListener: noop, removeEventListener: noop,
    scrollY: 0, innerHeight: 800,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(CONFIG, ctx, { filename: 'config.js' });
  vm.runInContext(ANALYTICS, ctx, { filename: 'analytics.js' });
  return { scripts, posthog: ctx.posthog, site: ctx.SITE };
}

test('config.js names openworldclock.com as the only analytics host', () => {
  assert.equal(load('example.com').site.siteHost, 'openworldclock.com');
});

for (const host of ['127.0.0.1', 'localhost', 'open-world-clock.pages.dev', 'abc123.open-world-clock.pages.dev', 'www.openworldclock.com', 'worldclock.download']) {
  test('off on ' + host + ': no script is added and window.posthog never exists', () => {
    const r = load(host, { protocol: host === 'localhost' || host === '127.0.0.1' ? 'http:' : 'https:' });
    assert.deepEqual(r.scripts, []);
    assert.equal(r.posthog, undefined);
  });
}

test('on openworldclock.com: the SDK is requested from our own /ingest proxy', () => {
  const r = load('openworldclock.com');
  assert.deepEqual(r.scripts, ['https://openworldclock.com/ingest/static/array.js']);
  assert.ok(Array.isArray(r.posthog), 'the PostHog stub queues calls until array.js loads');
});

test('every event carries the page language (page_lang), from <html lang>', () => {
  const reg = (r) => JSON.parse(JSON.stringify(r.posthog.filter((c) => c[0] === 'register').map((c) => c[1]))); // out of the vm realm
  assert.deepEqual(reg(load('openworldclock.com', { lang: 'en' })), [{ page_lang: 'en' }]);
  assert.deepEqual(reg(load('openworldclock.com', { lang: 'pt-BR' })), [{ page_lang: 'pt' }]);
  assert.deepEqual(reg(load('openworldclock.com', { lang: 'es' })), [{ page_lang: 'es' }]);
  assert.deepEqual(reg(load('openworldclock.com')), [{ page_lang: 'en' }]);
});

test('on openworldclock.com with Do Not Track: nothing loads', () => {
  const r = load('openworldclock.com', { dnt: '1' });
  assert.deepEqual(r.scripts, []);
  assert.equal(r.posthog, undefined);
});

test('on openworldclock.com with Global Privacy Control: nothing loads', () => {
  const r = load('openworldclock.com', { gpc: true });
  assert.deepEqual(r.scripts, []);
  assert.equal(r.posthog, undefined);
});

// Store campaign ids carry the launch channel: ?utm_source=reddit turns data-cid="site-hero" into ?cid=site-hero-reddit.
// config.js runs with a stub page holding one hero Store link, and the test reads back the href it wrote.
function storeHref(search) {
  const link = {
    attrs: { 'data-link': 'store', 'data-cid': 'site-hero' },
    getAttribute(a) { return a in this.attrs ? this.attrs[a] : null; },
    setAttribute(a, v) { this.attrs[a] = v; },
  };
  const document = {
    readyState: 'complete',
    querySelectorAll: (sel) => (sel === '[data-link]' ? [link] : []),
    addEventListener: () => {},
  };
  const ctx = { document, location: { search, hostname: 'openworldclock.com', protocol: 'https:' } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(CONFIG, ctx, { filename: 'config.js' });
  return { href: link.attrs.href, suffix: (s) => ctx.SITE.cidSuffix(s) };
}

test('utm_source=reddit adds the channel to the Store campaign id', () => {
  assert.match(storeHref('?utm_source=reddit').href, /\?cid=site-hero-reddit$/);
});

test('utm_source is lowercased and may carry hyphens and digits', () => {
  assert.match(storeHref('?utm_medium=social&utm_source=Show-HN2').href, /\?cid=site-hero-show-hn2$/);
});

test('no utm_source keeps the plain campaign id', () => {
  assert.match(storeHref('').href, /\?cid=site-hero$/);
  assert.match(storeHref('?ref=x').href, /\?cid=site-hero$/);
});

test('an unsafe or too long utm_source is dropped', () => {
  const r = storeHref('?utm_source=%3Cx%3E');
  assert.match(r.href, /\?cid=site-hero$/);
  assert.equal(r.suffix('?utm_source=' + 'a'.repeat(40)), '');
  assert.equal(r.suffix('?utm_source=' + 'a'.repeat(24)), '-' + 'a'.repeat(24));
  assert.equal(r.suffix('?utm_source=a%20b'), '');
  assert.equal(r.suffix('?utm_source=%E0%A4%A'), ''); // malformed escape
  assert.equal(r.suffix('?utm_source='), '');
});

// ---- the events: analytics.js runs on openworldclock.com with a tiny stub page (elements with closest() and
// getAttribute(), enough for the selectors it uses), the test sends it clicks and reads back what it captured

// an element: tag, attributes (id and class included) and its parent; closest() matches compound selectors made of a
// tag, #id, .class and [attr] or [attr="value"], in comma lists (no descendant combinators: analytics.js uses none)
function node(tag, attrs = {}, parent = null) {
  const cls = String(attrs.class || '').split(/\s+/).filter(Boolean);
  cls.contains = (c) => cls.includes(c);
  const e = {
    tagName: tag.toUpperCase(), id: attrs.id || '', classList: cls, parentElement: parent, hidden: !!attrs.hidden,
    value: attrs.value || '',
    getAttribute: (a) => (a in attrs ? String(attrs[a]) : null),
    matches(sel) {
      return sel.split(',').some((one) => {
        const m = one.trim().match(/^([a-z]+)?((?:#[\w-]+|\.[\w-]+|\[[\w-]+(?:="[^"]*")?\])*)$/i);
        if (!m) throw new Error('selector the stub cannot match: ' + one);
        if (m[1] && m[1].toUpperCase() !== e.tagName) return false;
        return (m[2].match(/#[\w-]+|\.[\w-]+|\[[^\]]+\]/g) || []).every((p) => {
          if (p[0] === '#') return e.id === p.slice(1);
          if (p[0] === '.') return cls.includes(p.slice(1));
          const [, k, v] = p.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
          return k in attrs && (v === undefined || String(attrs[k]) === v);
        });
      });
    },
    closest(sel) { for (let x = e; x; x = x.parentElement) if (x.matches(sel)) return x; return null; },
  };
  return e;
}

// a page on `hostname` (openworldclock.com by default); `frame` (optional) is the hero's #heroApp: { pathname, doc },
// doc from frameDoc()
function eventPage({ lang = 'en', themePref = 'system', frame = null, hostname = 'openworldclock.com', tool = '' } = {}) {
  const on = {};
  const listen = (t, fn) => { (on[t] = on[t] || []).push(fn); };
  let heroFrame = null;
  if (frame) {
    heroFrame = node('iframe', { id: 'heroApp' });
    heroFrame.dataset = { tool };
    heroFrame.contentWindow = { location: { pathname: frame.pathname } };
    heroFrame.contentDocument = frame.doc;
    heroFrame.loads = [];
    heroFrame.addEventListener = (t, fn) => { if (t === 'load') heroFrame.loads.push(fn); };
  }
  const document = {
    readyState: 'complete',
    documentElement: { getAttribute: (a) => (a === 'lang' ? lang : a === 'data-theme-pref' ? themePref : null) },
    head: { appendChild: (x) => x },
    body: {},
    createElement: (tag) => ({ tagName: String(tag).toUpperCase(), src: '', async: false }),
    querySelector: (sel) => (sel === '#heroApp' || (sel === '#heroApp[data-tool]' && tool) ? heroFrame : null),
    querySelectorAll: () => [],
    addEventListener: listen,
  };
  const origin = 'https://' + hostname;
  const ctx = {
    document, navigator: {},
    location: { hostname, protocol: 'https:', origin, href: origin + '/', pathname: '/' },
    URL, URLSearchParams, setTimeout, clearTimeout,
    requestIdleCallback: (fn) => fn(), requestAnimationFrame: () => {},
    addEventListener: () => {}, removeEventListener: () => {},
    scrollY: 0, innerHeight: 800,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(CONFIG, ctx, { filename: 'config.js' });
  vm.runInContext(ANALYTICS, ctx, { filename: 'analytics.js' });
  return {
    frame: heroFrame,
    version: ctx.SITE.version,
    click(target, trusted = true) { (on.click || []).forEach((fn) => fn({ type: 'click', isTrusted: trusted, target })); },
    // [name, props, options] of every capture so far, copied out of the vm realm
    sent: () => JSON.parse(JSON.stringify((ctx.posthog || []).filter((c) => c[0] === 'capture').map((c) => c.slice(1)))),
  };
}

// the app's document inside the frame: getElementById over the given elements, and its capture listeners
function frameDoc(elements) {
  const on = {};
  return {
    on,
    getElementById: (id) => elements.find((x) => x.id === id) || null,
    addEventListener: (t, fn) => { (on[t] = on[t] || []).push(fn); },
    fire(type, target, extra = {}, trusted = true) { (on[type] || []).forEach((fn) => fn({ type, isTrusted: trusted, target, ...extra })); },
  };
}
const BEACON = { transport: 'sendBeacon' };

test('installer_click and portable_click carry the version they download; store_click does not', () => {
  const p = eventPage();
  const hero = node('section', { class: 'hero sky-dark' }); // no id; demo.js adds sky-dark at night: still hero
  p.click(node('a', { 'data-track': 'installer_click', href: 'https://download.openworldclock.com/Open-World-Clock-1.3.0-setup.exe' }, hero));
  p.click(node('a', { 'data-track': 'portable_click', href: 'https://download.openworldclock.com/Open-World-Clock-1.2.9-portable.exe' }, hero));
  p.click(node('a', { 'data-track': 'installer_click', href: '#' }, hero)); // no file name: SITE.version
  p.click(node('a', { 'data-track': 'store_click', href: 'https://apps.microsoft.com/detail/9N88FR8M81BM?cid=site-hero' }, hero));
  assert.deepEqual(p.sent(), [
    ['installer_click', { placement: 'hero', version: '1.3.0' }, BEACON],
    ['portable_click', { placement: 'hero', version: '1.2.9' }, BEACON],
    ['installer_click', { placement: 'hero', version: p.version }, BEACON],
    ['store_click', { placement: 'hero' }, BEACON],
  ]);
});

test('language_switch: from the page language to the picked one, with where it was picked; the current language is not a switch', () => {
  const p = eventPage({ lang: 'pt-BR' });
  const header = node('header', { class: 'nav' });
  const picker = node('details', { class: 'lang-menu' }, header);
  const menu = node('details', { class: 'nav-menu' }, header);
  const footer = node('footer', { class: 'footer' });
  p.click(node('a', { href: '/', 'data-lang': 'en' }, picker));
  p.click(node('svg', {}, node('a', { href: '/es/', 'data-lang': 'es' }, menu))); // a press on the globe icon in the link
  p.click(node('a', { href: '/features', 'data-lang': 'en' }, node('li', {}, footer)));
  p.click(node('a', { href: '/pt/', 'data-lang': 'pt', 'aria-current': 'true' }, picker));
  p.click(node('a', { href: '/es/', 'data-lang': 'es' }, node('div', { class: 'lang-hint' })));
  p.click(node('a', { href: '/xx/', 'data-lang': 'xx' }, picker));
  assert.deepEqual(p.sent(), [
    ['language_switch', { from: 'pt', to: 'en', via: 'picker' }, BEACON],
    ['language_switch', { from: 'pt', to: 'es', via: 'menu' }, BEACON],
    ['language_switch', { from: 'pt', to: 'en', via: 'footer' }, BEACON],
    ['language_switch', { from: 'pt', to: 'es', via: 'suggestion' }, BEACON],
  ]);
});

test('github_click: the placement and the kind of link, never the address', () => {
  const p = eventPage();
  const footer = node('footer', { class: 'footer' });
  const sec = node('section', { id: 'privacy' });
  const repo = 'https://github.com/joaoCarvalho1000/open-world-clock';
  p.click(node('a', { 'data-link': 'repo', href: repo }, footer));
  p.click(node('a', { href: repo + '/issues/new?template=bug.yml' }, sec));
  p.click(node('a', { href: repo + '/releases' }, sec));
  p.click(node('a', { 'data-link': 'license', href: repo + '/blob/main/LICENSE' }, footer));
  p.click(node('a', { href: 'https://github.com/joaoCarvalho1000' }, sec));
  p.click(node('a', { href: repo + '/pulls' }));
  p.click(node('a', { href: 'https://notgithub.com/x/y' }, sec)); // not GitHub
  p.click(node('a', { href: '/features' }, sec));
  assert.deepEqual(p.sent(), [
    ['github_click', { placement: 'footer', link: 'repo' }, BEACON],
    ['github_click', { placement: 'privacy', link: 'issues' }, BEACON],
    ['github_click', { placement: 'privacy', link: 'releases' }, BEACON],
    ['github_click', { placement: 'footer', link: 'license' }, BEACON],
    ['github_click', { placement: 'privacy', link: 'profile' }, BEACON],
    ['github_click', { placement: 'page', link: 'other' }, BEACON],
  ]);
});

test('theme_toggle: the theme the button switches to, from data-theme-pref before theme.js changes it', () => {
  for (const [pref, next] of [['system', 'light'], ['light', 'dark'], ['dark', 'system']]) {
    const p = eventPage({ themePref: pref });
    p.click(node('use', {}, node('svg', {}, node('button', { id: 'themeBtn', class: 'theme-btn' }, node('header', { class: 'nav' })))));
    assert.deepEqual(p.sent(), [['theme_toggle', { theme: next }, null]]);
  }
});

// the app's controls, as src/renderer/index.html has them
function appElements() {
  const app = node('div', { id: 'app', class: 'app' });
  const els = { app };
  const add = (key, tag, attrs, parent = app) => (els[key] = node(tag, attrs, parent));
  add('btnMap', 'button', { id: 'btnMap' });
  add('btnPlanner', 'button', { id: 'btnPlanner' });
  add('btnSettings', 'button', { id: 'btnSettings' });
  add('convTime', 'input', { id: 'convTime' });
  add('convDate', 'input', { id: 'convDate' });
  add('optTheme', 'select', { id: 'optTheme' });
  add('optSeconds', 'input', { id: 'optSeconds' });
  add('zoneSearch', 'input', { id: 'zoneSearch' });
  add('zoneResults', 'ul', { id: 'zoneResults', hidden: true });
  add('copyMenu', 'div', { id: 'copyMenu', role: 'menu' });
  add('copyItem', 'button', { role: 'menuitem' }, els.copyMenu);
  add('card', 'div', { class: 'card', tabindex: '0' });
  add('arc', 'div', { class: 'arc' }, els.card);
  add('more', 'button', { class: 'more' }, els.card);
  add('help', 'a', { href: 'https://github.com/joaoCarvalho1000/open-world-clock' });
  return els;
}

test('tool_used distinguishes the tool, counts trusted actions once, and excludes selected values', () => {
  const els = appElements();
  const doc = frameDoc(Object.values(els));
  const p = eventPage({ tool: 'planner', frame: { pathname: '/app/', doc } });
  doc.fire('click', els.btnPlanner, {}, false);
  doc.fire('input', els.convTime);
  doc.fire('input', els.convTime);
  assert.deepEqual(p.sent(), [['tool_used', { action: 'convert', tool: 'planner' }, null]]);
});

test('hero_app_used: real use of the app in the hero, once per action, never scripted events or values', () => {
  const els = appElements();
  const doc = frameDoc(Object.values(els));
  const p = eventPage({ frame: { pathname: '/app/', doc } });
  assert.ok(doc.on.click && doc.on.wheel, 'listens on the frame document');
  doc.fire('click', els.btnPlanner, {}, false); // app.js clicks #btnMap for Ctrl+M, web.js applies shared links: never counted
  doc.fire('input', els.convTime, {}, false);
  doc.fire('click', els.btnMap);
  doc.fire('click', els.btnMap); // once per page
  doc.fire('input', els.convTime);
  doc.fire('change', els.optTheme);
  doc.fire('change', els.optSeconds); // another setting: only the settings button counts as settings
  doc.fire('keydown', els.zoneSearch, { key: 'Enter' }); // results closed: nothing is added
  els.zoneResults.hidden = false;
  doc.fire('keydown', els.zoneSearch, { key: 'Enter' });
  doc.fire('click', els.copyItem);
  doc.fire('keydown', els.card, { key: 'F2' });
  doc.fire('keydown', els.card, { key: ',', ctrlKey: true });
  doc.fire('pointerdown', els.arc, { button: 0 });
  doc.fire('click', els.help); // the GitHub link in the app's Help
  p.click(node('span', {}, node('button', { id: 'heroShare' }, node('section', { id: 'hero' }))));
  const used = p.sent().filter((c) => c[0] === 'hero_app_used');
  assert.deepEqual(used.map((c) => c[1].action), ['map', 'convert', 'theme', 'add_city', 'copy', 'edit_city', 'settings', 'scrub', 'share']);
  assert.ok(used.every((c) => Object.keys(c[1]).join() === 'action'), 'only the action name, never a value');
  assert.deepEqual(p.sent().filter((c) => c[0] === 'github_click'), [['github_click', { placement: 'app', link: 'repo' }, BEACON]]);
});

test('hero_app_used: the wheel counts as scrub only when it changed the converted time', async () => {
  const els = appElements();
  const doc = frameDoc(Object.values(els));
  const p = eventPage({ frame: { pathname: '/app/', doc } });
  const wait = () => new Promise((r) => setTimeout(r, 260));
  doc.fire('wheel', els.card, { deltaY: 100 }); // nothing happened in the app (the strip scrolled)
  await wait();
  assert.deepEqual(p.sent(), []);
  doc.fire('wheel', els.card, { deltaY: 100 });
  els.app.classList.push('converting'); els.convTime.value = '15:15'; // what app.js does on the next frame
  await wait();
  assert.deepEqual(p.sent(), [['hero_app_used', { action: 'scrub' }, null]]);
});

test('hero_app_used: nothing is hooked before the frame shows /app/, nor on any host but openworldclock.com', () => {
  const blank = frameDoc(Object.values(appElements()));
  const p = eventPage({ frame: { pathname: 'blank', doc: blank } });
  assert.equal(blank.on.click, undefined, 'about:blank (no src yet) is left alone');
  const doc = frameDoc(Object.values(appElements()));
  p.frame.contentWindow.location.pathname = '/app/';
  p.frame.contentDocument = doc;
  p.frame.loads.forEach((fn) => fn());
  assert.ok(doc.on.click, 'hooked on the frame load');
  for (const host of ['localhost', '127.0.0.1', 'open-world-clock.pages.dev']) {
    const d = frameDoc(Object.values(appElements()));
    const q = eventPage({ hostname: host, frame: { pathname: '/app/', doc: d } });
    assert.equal(d.on.click, undefined, host);
    assert.deepEqual(q.frame.loads, [], host);
  }
});
