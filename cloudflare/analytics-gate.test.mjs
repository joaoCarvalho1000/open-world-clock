// Tests for the host gate in site/assets/analytics.js: analytics loads only on the production hostname
// (window.SITE.siteHost in site/assets/config.js), never on a local preview, a *.pages.dev preview or any other host,
// and never under Do Not Track; and for the utm_source suffix config.js adds to Store campaign ids. The two real files run in a node:vm sandbox with a stub browser, so nothing is fetched.
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
