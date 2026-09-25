// Tests for the website's three languages: English (site/), Brazilian Portuguese (site/pt/) and Spanish (site/es/).
// The shared frame (nav, footer, hreflang) comes from site-chrome.mjs; these tests read the real pages.
// Run: npm test (in cloudflare/) or node --test cloudflare/site-chrome.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { check, applyChrome, applyStore, readStore, fileOf, PAGES, LANGS, TAG, HTML_LANG, PREFIX, ORIGIN, SITE_DIR } from './site-chrome.mjs';

const read = (lang, slug) => readFileSync(fileOf(lang, slug), 'utf8');
const text = (html) => html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/\s+/g, ' ').trim();
const each = (fn) => { for (const slug of PAGES) for (const lang of LANGS) fn(lang, slug, read(lang, slug)); };
const alternates = (html) => Object.fromEntries([...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map((m) => [m[1], m[2]]));

test('every page exists in all three languages and its shared parts are in step (site-chrome.mjs)', () => {
  assert.deepEqual(check(), []);
});

test('applyChrome is stable: a second run changes nothing', () => {
  const html = read('es', 'features');
  assert.equal(applyChrome(html, 'es', 'features'), html);
});

test('each page declares its language, is its own canonical and lists all four alternates, reciprocally', () => {
  each((lang, slug, html) => {
    assert.match(html, new RegExp(`<html lang="${HTML_LANG[lang]}"`), fileOf(lang, slug));
    if (slug === '404') { assert.deepEqual(alternates(html), {}); return; }
    const self = ORIGIN + PREFIX[lang] + slug;
    assert.ok(html.includes(`<link rel="canonical" href="${self}">`), self + ' canonical');
    const alt = alternates(html);
    assert.deepEqual(Object.keys(alt).sort(), ['en', 'es', 'pt-BR', 'x-default']);
    assert.equal(alt[TAG[lang]], self, 'the page lists itself');
    assert.equal(alt['x-default'], ORIGIN + '/' + slug, 'x-default is the English page');
    // reciprocal: every alternate lists the same set back
    for (const other of LANGS) assert.deepEqual(alternates(read(other, slug)), alt, slug + ' ' + lang + ' vs ' + other);
  });
});

test('the language picker on every page links to the same page in each language', () => {
  each((lang, slug, html) => {
    const picker = (html.match(/<details class="lang-menu">[\s\S]*?<\/details>/) || [''])[0];
    for (const l of LANGS) assert.ok(picker.includes(`href="${PREFIX[l]}${slug === '404' ? '' : slug}" hreflang="${TAG[l]}"`), fileOf(lang, slug) + ' -> ' + l);
    assert.ok(picker.includes(`data-lang="${lang}" aria-current="true"`), 'the current language is marked');
  });
});

test('Portuguese and Spanish pages link to pages in their own language and load the shared files from the root', () => {
  const slugs = PAGES.filter((s) => s && s !== '404').join('|');
  for (const lang of ['pt', 'es']) for (const slug of PAGES) {
    const html = read(lang, slug);
    // outside the language picker and links, no internal link may point at the English page
    const body = html.replace(/<a [^>]*data-lang="[^"]*"[^>]*>/g, '').replace(/<link rel="alternate"[^>]*>/g, '');
    assert.deepEqual([...body.matchAll(new RegExp(`href="/(${slugs})?(?=[#"?])`, 'g'))].map((m) => m[0]), [], fileOf(lang, slug));
    assert.deepEqual([...html.matchAll(/(?:src|href)="(?!\/|https?:|#|mailto:|data:|\.\/)[^"]+"/g)].map((m) => m[0]), [], fileOf(lang, slug) + ' relative paths');
  }
});

test('every JSON-LD block parses, uses the page language, and FAQ answers match the visible FAQ', () => {
  each((lang, slug, html) => {
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      const data = JSON.parse(m[1]);
      const nodes = data['@graph'] || [data];
      const page = nodes.find((n) => n['@type'] === 'WebPage');
      if (page) assert.equal(page.inLanguage, HTML_LANG[lang], fileOf(lang, slug) + ' WebPage inLanguage');
      const faq = nodes.find((n) => n['@type'] === 'FAQPage');
      if (!faq) continue;
      const visible = text(html);
      for (const q of faq.mainEntity) {
        assert.ok(visible.includes(q.name), fileOf(lang, slug) + ' question not on the page: ' + q.name);
        assert.ok(visible.includes(text(q.acceptedAnswer.text)), fileOf(lang, slug) + ' answer not on the page: ' + q.acceptedAnswer.text);
      }
    }
  });
});

test('no em or en dashes anywhere in the pages', () => {
  each((lang, slug, html) => assert.ok(!/[\u2013\u2014]/.test(html), fileOf(lang, slug)));
});

test('sitemap.xml lists every page in every language, with the same alternates as the page', () => {
  const sitemap = readFileSync(join(SITE_DIR, 'sitemap.xml'), 'utf8');
  for (const slug of PAGES.filter((s) => s !== '404')) for (const lang of LANGS) {
    const loc = ORIGIN + PREFIX[lang] + slug;
    const entry = (sitemap.match(new RegExp(`<url>\\s*<loc>${loc.replace(/[.?]/g, '\\$&')}</loc>[\\s\\S]*?</url>`)) || [''])[0];
    assert.ok(entry, loc + ' is in the sitemap');
    const alt = Object.fromEntries([...entry.matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => [m[1], m[2]]));
    assert.deepEqual(alt, alternates(read(lang, slug)), loc);
  }
});

test('the Store switch: applyStore flips the hidden attributes and the JSON-LD, and flips back to the same page', () => {
  const store = { storeUrl: 'https://apps.microsoft.com/detail/9TEST', setupUrl: 'https://dl.example.com/Open-World-Clock-1.0.0-setup.exe' };
  const off = '<a data-store hidden href="x">Store</a><a data-store-off href="y">Installer</a>' +
    '{"installUrl":"https://dl.example.com/Open-World-Clock-1.0.0-setup.exe","processorRequirements":"x64","sameAs":["https://github.com/o/r"]}';
  const on = applyStore(off, { ...store, live: true });
  assert.match(on, /<a data-store href="x">/);
  assert.match(on, /<a data-store-off hidden href="y">/);
  assert.match(on, /"installUrl":"https:\/\/apps\.microsoft\.com\/detail\/9TEST"/);
  assert.match(on, /"processorRequirements":"x64 or ARM64"/);
  assert.match(on, /"sameAs":\["https:\/\/apps\.microsoft\.com\/detail\/9TEST","https:\/\/github\.com\/o\/r"\]/);
  assert.equal(applyStore(on, { ...store, live: true }), on, 'applying the same state twice changes nothing');
  assert.equal(applyStore(on, { ...store, live: false }), off);
});

test('the Store switch: while storeLive is false no page shows a Store link, winget or a Store JSON-LD link', () => {
  const { live, storeUrl } = readStore();
  if (live) return;
  each((lang, slug, html) => {
    const shown = html.replace(/<(\w+)[^>]*\sdata-store hidden[^>]*>[\s\S]*?<\/\1>/g, '');
    for (const m of shown.matchAll(/<a [^>]*href="https:\/\/apps\.microsoft\.com[^"]*"/g)) assert.fail(fileOf(lang, slug) + ' shows a Store link: ' + m[0]);
    assert.ok(!/<code>winget install/.test(shown.replace(/<section[^>]*data-store hidden[\s\S]*?<\/section>/g, '').replace(/<div class="opt" data-store hidden>[\s\S]*?<\/div><\/div>/g, '')), fileOf(lang, slug) + ' shows the winget command');
    for (const ld of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) assert.ok(!ld[1].includes(storeUrl), fileOf(lang, slug) + ' JSON-LD links the Store');
  });
});
