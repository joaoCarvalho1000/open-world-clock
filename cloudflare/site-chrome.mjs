#!/usr/bin/env node
// Keeps the parts every page shares in step across the three languages of the website: English (site/*.html),
// Brazilian Portuguese (site/pt/*.html) and Spanish (site/es/*.html). Each page's own words are written by hand in its
// language; this script owns only the repeated frame around them, so a nav label or a new page changes in one place:
//   - the nav: page links, the Menu (with the other languages at its end below 760px), the language picker, the theme
//     button, the Support button (Ko-fi) and the Download pill
//   - the footer: page links, the language links and the legal line
//   - in <head>: hreflang alternates (en, pt-BR, es, x-default = English) after the canonical link, og:locale with
//     its og:locale:alternate tags, and the social card in the page's language (og:image and twitter:image: og.png,
//     og-pt.png, og-es.png, rendered by cloudflare/og/render.mjs) with its alt text
//   - the icon sprite has the cup and globe symbols the nav uses, and the download and file symbols of the
//     direct-download buttons; the floating Ko-fi button's name; the skip link;
//     assets/i18n.js right after config.js and kofi.js on every page
//   - the Store switch (storeLive in site/assets/config.js, see applyStore): the hidden attribute on every
//     [data-store] and [data-store-off] element, and the JSON-LD installUrl, sameAs and processorRequirements. While
//     the listing is not live, llms.txt, llms-full.txt and api/app.json must not link it either (checked, not written)
//
//   node cloudflare/site-chrome.mjs           check: exit 1, with one line per page, if any page is out of step
//   node cloudflare/site-chrome.mjs --write   rewrite the shared parts in place
//
// A page missing in one language is reported (every public page exists in all three). site-chrome.test.mjs runs the
// check (npm test). Slugs stay English in every language (/pt/features), so a page's three addresses differ only in
// the prefix.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SITE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'site');
export const ORIGIN = 'https://openworldclock.com';
export const LANGS = ['en', 'pt', 'es'];
export const TAG = { en: 'en', pt: 'pt-BR', es: 'es' };           // hreflang (plain es: every Spanish-speaking region)
export const HTML_LANG = { en: 'en', pt: 'pt-BR', es: 'es-419' }; // <html lang> and JSON-LD inLanguage (neutral Latin American Spanish)
export const OG = { en: 'en_US', pt: 'pt_BR', es: 'es_419' };     // og:locale (Spanish is neutral Latin American)
export const PREFIX = { en: '/', pt: '/pt/', es: '/es/' };
const NAME = { en: 'English', pt: 'Português', es: 'Español' };
const CODE = { en: 'EN', pt: 'PT', es: 'ES' };
// every public page, by slug ('' is the home page); 404 has no canonical and no hreflang (noindex)
export const PAGES = ['', 'features', 'download', 'faq', 'time-zone-converter', 'meeting-planner', 'world-map',
  'windows-clock-alternative', 'multiple-time-zones-windows', 'support', 'privacy', '404'];

// the nav and footer words, in the app's own terms for each language (src/renderer/i18n.js)
const W = {
  en: {
    skip: 'Skip to content', main: 'Main', footer: 'Footer', language: 'Language', menu: 'Menu', theme: 'Theme',
    home: 'Open World Clock home', top: 'Open World Clock, back to top',
    features: 'Features', converter: 'Converter', planner: 'Planner', map: 'World map', faq: 'FAQ',
    alt: 'Windows Clock alternative', multi: 'Multiple time zones', download: 'Download', privacy: 'Privacy',
    fFaq: 'FAQ', fConverter: 'Time zone converter', fPlanner: 'Meeting planner', fMulti: 'Multiple time zones on Windows',
    help: 'Support', source: 'Source on GitHub', kofi: 'Support the creator on Ko-fi',
    support: 'Support the creator', supportName: 'Support the creator on Ko-fi', fab: 'Support the creator', fabName: 'Support the creator on Ko-fi',
    legal: 'Free, open source, no telemetry. © {year} João Carvalho. Not affiliated with Microsoft.',
  },
  pt: {
    skip: 'Pular para o conteúdo', main: 'Principal', footer: 'Rodapé', language: 'Idioma', menu: 'Menu', theme: 'Tema',
    home: 'Open World Clock, página inicial', top: 'Open World Clock, voltar ao topo',
    features: 'Recursos', converter: 'Conversor', planner: 'Planejador', map: 'Mapa-múndi', faq: 'Dúvidas',
    alt: 'Alternativa ao Relógio do Windows', multi: 'Vários fusos horários', download: 'Baixar', privacy: 'Privacidade',
    fFaq: 'Perguntas frequentes', fConverter: 'Conversor de fuso horário', fPlanner: 'Planejador de reuniões', fMulti: 'Vários fusos horários no Windows',
    help: 'Ajuda', source: 'Código-fonte no GitHub', kofi: 'Apoie o criador no Ko-fi',
    support: 'Apoie o criador', supportName: 'Apoie o criador no Ko-fi', fab: 'Apoie o criador', fabName: 'Apoie o criador no Ko-fi',
    legal: 'Grátis, de código aberto e sem telemetria. © {year} João Carvalho. Sem vínculo com a Microsoft.',
  },
  es: {
    skip: 'Saltar al contenido', main: 'Principal', footer: 'Pie de página', language: 'Idioma', menu: 'Menú', theme: 'Tema',
    home: 'Open World Clock, inicio', top: 'Open World Clock, volver arriba',
    features: 'Funciones', converter: 'Convertidor', planner: 'Planificador', map: 'Mapa mundial', faq: 'Preguntas',
    alt: 'Alternativa al Reloj de Windows', multi: 'Varias zonas horarias', download: 'Descargar', privacy: 'Privacidad',
    fFaq: 'Preguntas frecuentes', fConverter: 'Convertidor de zona horaria', fPlanner: 'Planificador de reuniones', fMulti: 'Varias zonas horarias en Windows',
    help: 'Ayuda', source: 'Código fuente en GitHub', kofi: 'Apoya al creador en Ko-fi',
    support: 'Apoya al creador', supportName: 'Apoya al creador en Ko-fi', fab: 'Apoya al creador', fabName: 'Apoya al creador en Ko-fi',
    legal: 'Gratis, de código abierto, sin telemetría. © {year} João Carvalho. No está afiliado a Microsoft.',
  },
};
// the social card per language (cloudflare/og/og-card.html) and what it shows: the home page's headline
const OG_IMAGE = { en: 'og.png', pt: 'og-pt.png', es: 'og-es.png' };
const OG_ALT = {
  en: 'Open World Clock: a strip of city clocks, light cards for day and navy cards for night, under the line The world clock Windows should have shipped with.',
  pt: 'Open World Clock: uma faixa de relógios de cidades, com cartões claros para o dia e azul-marinho para a noite, sob a frase “O relógio mundial que já devia vir no Windows.”',
  es: 'Open World Clock: una franja de relojes de ciudades, con tarjetas claras para el día y azul marino para la noche, bajo la frase “El reloj mundial que le faltaba a Windows.”',
};
const KOFI = 'https://ko-fi.com/joaothecarvalho';
const REPO = 'https://github.com/joaoCarvalho1000/open-world-clock';
const SYMBOLS = {
  'i-cup': '<symbol id="i-cup" viewBox="0 0 24 24"><path d="M4 8h12v5a5.5 5.5 0 0 1-5.5 5.5h-1A5.5 5.5 0 0 1 4 13Z"/><path d="M16 9.5h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8 5V3.5M12 5V3.5"/></symbol>',
  'i-globe': '<symbol id="i-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.4 5.2 3.4 8.5s-1 6.1-3.4 8.5c-2.4-2.4-3.4-5.2-3.4-8.5s1-6.1 3.4-8.5Z"/></symbol>',
  // the direct-download buttons (Download installer, Portable exe)
  'i-download': '<symbol id="i-download" viewBox="0 0 24 24"><path d="M12 4v11"/><path d="m7 10.5 5 5 5-5"/><path d="M5 20h14"/></symbol>',
  'i-file': '<symbol id="i-file" viewBox="0 0 24 24"><path d="M7 3.5h6.5L18 8v12.5H7Z"/><path d="M13.5 3.5V8H18"/><path d="M10 13h5M10 16.5h5"/></symbol>',
};

export const fileOf = (lang, slug) => join(SITE_DIR, lang === 'en' ? '' : lang, (slug || 'index') + '.html');
// the address of a page in a language: '/pt/features', '/es/', '/'; 404 has none, so its links go to that language's home
const path = (lang, slug) => PREFIX[lang] + (slug === '404' ? '' : slug);
const url = (lang, slug) => ORIGIN + path(lang, slug);

function langLinks(slug, cur, cls) {
  return LANGS.map((l) => `<li${cls ? ` class="${cls(l)}"` : ''}><a href="${path(l, slug)}" hreflang="${TAG[l]}" lang="${TAG[l]}" data-lang="${l}"${l === cur ? ' aria-current="true"' : ''}>${NAME[l]}</a></li>`);
}

export function navHtml(lang, slug, headerAttrs) {
  const w = W[lang], home = slug === '', a = lang === 'en' && home ? '' : '/';
  const cur = (s) => (s === slug ? ' aria-current="page"' : '');
  const link = (s, text) => `<a href="${path(lang, s)}"${cur(s)}>${text}</a>`;
  const others = LANGS.filter((l) => l !== lang);
  const menuLangs = others.map((l, i) => `<li class="menu-lang${i ? '' : ' menu-lang-first'}"><a href="${path(l, slug)}" hreflang="${TAG[l]}" lang="${TAG[l]}" data-lang="${l}"><svg class="i" aria-hidden="true"><use href="#i-globe"/></svg>${NAME[l]}</a></li>`).join('');
  return `<header ${headerAttrs}>
  <div class="wrap">
    <a class="brand" href="${home ? '#top' : PREFIX[lang]}" aria-label="${home ? w.top : w.home}"><img src="${a}assets/logo-small.svg" alt="" width="28" height="28"><span data-name>Open World Clock</span></a>
    <nav aria-label="${w.main}"><ul class="nav-links"><li>${link('features', w.features)}</li><li class="wide">${link('time-zone-converter', w.converter)}</li><li class="wide">${link('meeting-planner', w.planner)}</li><li class="wide">${link('world-map', w.map)}</li><li>${link('faq', w.faq)}</li></ul><details class="nav-menu"><summary>${w.menu}</summary><ul><li class="in-bar">${link('features', w.features)}</li><li>${link('time-zone-converter', w.converter)}</li><li>${link('meeting-planner', w.planner)}</li><li>${link('world-map', w.map)}</li><li>${link('windows-clock-alternative', w.alt)}</li><li>${link('multiple-time-zones-windows', w.multi)}</li><li>${link('download', w.download)}</li><li class="in-bar">${link('faq', w.faq)}</li><li>${link('privacy', w.privacy)}</li>${menuLangs}</ul></details></nav>
    <div class="nav-actions">
      <details class="lang-menu"><summary aria-label="${w.language}: ${NAME[lang]}" title="${w.language}"><svg class="i" aria-hidden="true"><use href="#i-globe"/></svg><span aria-hidden="true">${CODE[lang]}</span></summary><ul>${langLinks(slug, lang).join('')}</ul></details>
      <button class="theme-btn" id="themeBtn" type="button" aria-label="${w.theme}">
        <svg class="i" data-show="system" aria-hidden="true"><use href="#i-system"/></svg>
        <svg class="i" data-show="light" aria-hidden="true"><use href="#i-sun"/></svg>
        <svg class="i" data-show="dark" aria-hidden="true"><use href="#i-moon"/></svg>
      </button>
      <a class="btn btn-sm nav-kofi" href="${KOFI}" target="_blank" rel="noopener" data-kofi="nav" aria-label="${w.supportName}"><svg class="i" aria-hidden="true"><use href="#i-cup"/></svg><span>${w.support}</span></a>
      <a class="btn btn-sm" href="${home ? '#download' : path(lang, 'download')}"${slug === 'download' ? ' aria-current="page"' : ''}>${w.download}</a>
    </div>
  </div>
</header>`;
}

export function footerHtml(lang, slug, mark = true) {
  const w = W[lang], home = slug === '', a = lang === 'en' && home ? '' : '/';
  const cur = (s) => (s === slug ? ' aria-current="page"' : '');
  const li = (s, text) => `      <li><a href="${path(lang, s)}"${cur(s)}>${text}</a></li>`;
  const year = home ? '<span id="year">2026</span>' : '2026';
  return `<footer class="footer">
  <div class="wrap">
    <a class="brand" href="${home ? '#top' : PREFIX[lang]}"><img src="${a}assets/logo-small.svg" alt="" width="28" height="28"><span data-name>Open World Clock</span></a>
    <nav aria-label="${w.footer}">
      <ul class="footer-pages">
${[li('features', w.features), li('download', w.download), li('faq', w.fFaq), li('time-zone-converter', w.fConverter),
  li('meeting-planner', w.fPlanner), li('world-map', w.map), li('windows-clock-alternative', w.alt),
  li('multiple-time-zones-windows', w.fMulti), li('privacy', w.privacy), li('support', w.help)].join('\n')}
      <li><a data-link="repo" href="${REPO}">${w.source}</a></li>
      <li><a href="${KOFI}" target="_blank" rel="noopener" data-kofi="footer">${w.kofi}</a></li>
      </ul>
    </nav>
    <nav class="footer-langs" aria-label="${w.language}"><svg class="i" aria-hidden="true"><use href="#i-globe"/></svg><ul>${langLinks(slug, lang).join('')}</ul></nav>
    <p class="legal">${w.legal.replace('{year}', year)}</p>
  </div>${mark ? '\n  <p class="footer-mark" aria-hidden="true"><span data-name>Open World Clock</span></p>' : ''}
</footer>`;
}

export function headLinks(lang, slug) {
  if (slug === '404') return '';
  return LANGS.map((l) => `<link rel="alternate" hreflang="${TAG[l]}" href="${url(l, slug)}">`).join('\n') +
    `\n<link rel="alternate" hreflang="x-default" href="${url('en', slug)}">`;
}

// the page with its shared parts rewritten; throws when a part it expects is missing
export function applyChrome(html, lang, slug) {
  const w = W[lang], problems = [];
  const need = (re, what) => { if (!re.test(html)) problems.push('no ' + what); };
  need(/<header class="nav[^"]*"[^>]*>[\s\S]*?<\/header>/, 'nav <header>');
  need(/<footer class="footer">[\s\S]*?<\/footer>/, '<footer class="footer">');
  if (problems.length) throw new Error(problems.join(', '));

  // before the nav and footer are written, so their language links (to the other languages) stay as they are
  if (lang !== 'en') {
    // /pt/ and /es/ pages share the site's files: every path to them starts at the root
    html = html.replace(/((?:src|href|srcset)="|, )(assets\/|favicon\.ico|site\.webmanifest)/g, '$1/$2');
    // and every link to one of the site's pages stays in the page's language ('/features#x' -> '/pt/features#x')
    const slugs = PAGES.filter((s) => s && s !== '404').join('|');
    html = html.replace(new RegExp(`href="/(${slugs})?(?=[#"?])`, 'g'), (m, s) => `href="${PREFIX[lang]}${s || ''}`);
  }
  html = html.replace(/<html lang="[^"]*"/, `<html lang="${HTML_LANG[lang]}"`);
  html = html.replace(/<header (class="nav[^"]*"[^>]*)>[\s\S]*?<\/header>/, (m, attrs) => navHtml(lang, slug, attrs));
  // the big name under the footer stays where the page had it (the privacy policy has none)
  html = html.replace(/<footer class="footer">[\s\S]*?<\/footer>/, (m) => footerHtml(lang, slug, m.includes('class="footer-mark"')));
  // each page is its own canonical, in its own language
  if (slug !== '404') {
    html = html.replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url(lang, slug)}">`);
    html = html.replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url(lang, slug)}">`);
  }
  html = html.replace(/<a class="skip" href="#main">[^<]*<\/a>/, `<a class="skip" href="#main">${w.skip}</a>`);

  // hreflang: drop the old set, then put a fresh one right after the canonical link
  html = html.replace(/\n<link rel="alternate" hreflang="[^"]*" href="[^"]*">/g, '');
  const links = headLinks(lang, slug);
  if (links) {
    if (!/<link rel="canonical" href="[^"]*">/.test(html)) throw new Error('no canonical link');
    html = html.replace(/(<link rel="canonical" href="[^"]*">)/, `$1\n${links}`);
  }
  // og:locale and its alternates
  html = html.replace(/\n<meta property="og:locale:alternate" content="[^"]*">/g, '');
  html = html.replace(/<meta property="og:locale" content="[^"]*">/, `<meta property="og:locale" content="${OG[lang]}">` +
    LANGS.filter((l) => l !== lang).map((l) => `\n<meta property="og:locale:alternate" content="${OG[l]}">`).join(''));

  // the social card in the page's language, and its alt text
  html = html.replace(/(<meta (?:property="og:image"|name="twitter:image") content="https:\/\/openworldclock\.com\/assets\/)og(?:-pt|-es)?\.png(">)/g, `$1${OG_IMAGE[lang]}$2`);
  html = html.replace(/(<meta (?:property="og:image:alt"|name="twitter:image:alt") content=")[^"]*(">)/g, `$1${OG_ALT[lang]}$2`);

  // the sprite has the nav's symbols
  const sprite = html.match(/<svg width="0" height="0"[^>]*>[\s\S]*?<\/svg>/);
  if (!sprite) throw new Error('no icon sprite');
  let sp = sprite[0];
  for (const [id, sym] of Object.entries(SYMBOLS)) if (!sp.includes(`id="${id}"`)) sp = sp.replace(/\n?<\/svg>$/, `\n  ${sym}\n</svg>`);
  html = html.replace(sprite[0], sp);

  // the floating Ko-fi button's name
  html = html.replace(/(<a class="kofi-fab"[^>]*aria-label=")[^"]*("[^>]*>[\s\S]*?<span>)[^<]*(<\/span><\/a>)/, `$1${w.fabName}$2${w.fab}$3`);

  // scripts: i18n.js right after config.js, kofi.js on every page (asset-versions.mjs adds ?v=<hash> to each src)
  const cfg = html.match(/<script src="(\/?)assets\/config\.js(?:\?v=[0-9a-f]*)?"><\/script>/);
  if (!cfg) throw new Error('no config.js script');
  if (!/assets\/i18n\.js(\?v=[0-9a-f]*)?"/.test(html)) html = html.replace(cfg[0], `${cfg[0]}\n<script src="${cfg[1]}assets/i18n.js"></script>`);
  if (!/assets\/kofi\.js(\?v=[0-9a-f]*)?"/.test(html)) html = html.replace(/(<script src="\/?assets\/analytics\.js(?:\?v=[0-9a-f]*)?" defer><\/script>)/, `$1\n<script src="${cfg[1]}assets/kofi.js" defer></script>`);
  return html;
}

// The Store switch (storeLive in site/assets/config.js), read with the URLs it swaps between.
export function readStore(siteDir = SITE_DIR) {
  const src = readFileSync(join(siteDir, 'assets', 'config.js'), 'utf8');
  // the property line itself, not the header comment (which also says "storeLive: false"); the last one wins, as in JS
  const live = ([...src.matchAll(/^\s*storeLive\s*:\s*(true|false)\b/gm)].pop() || [])[1];
  if (!live) throw new Error('site/assets/config.js: no storeLive: true or false');
  const pick = (k) => (src.match(new RegExp('\\b' + k + "\\s*:\\s*'([^']+)'")) || [])[1];
  return { live: live === 'true', storeUrl: pick('storeUrl'), setupUrl: pick('downloadBase') + '/Open-World-Clock-' + pick('version') + '-setup.exe' };
}

// The page in the Store switch's state: [data-store] elements are hidden while the listing is not live and their
// [data-store-off] twins (the direct downloads) are hidden once it is; the JSON-LD installUrl points at the Store or
// the installer, sameAs lists the Store only when live, and processorRequirements drops ARM64 (Store only) when not.
export function applyStore(html, { live, storeUrl, setupUrl }) {
  html = html.replace(/(\sdata-store(-off)?)(\s+hidden)?(?=[\s>])/g, (m, a, off) => a + ((off ? live : !live) ? ' hidden' : ''));
  html = html.replace(/("installUrl":\s*")[^"]*"/g, `$1${live ? storeUrl : setupUrl}"`);
  html = html.replace(/("processorRequirements":\s*")[^"]*"/g, `$1${live ? 'x64 or ARM64' : 'x64'}"`);
  const esc = storeUrl.replace(/[.?*+^$()[\]{}|\\/]/g, '\\$&');
  if (live) html = html.replace(/("sameAs":\s*\[)(?!\s*"https:\/\/apps\.microsoft)(\s*)/g, `$1$2"${storeUrl}",$2`);
  else html = html.replace(new RegExp(`("sameAs":\\s*\\[[^\\]]*?)"${esc}",\\s*`, 'g'), '$1');
  return html;
}

export function check({ write = false, siteDir = SITE_DIR } = {}) {
  const problems = [];
  let store;
  try { store = readStore(siteDir); } catch (e) { return [e.message]; }
  for (const slug of PAGES) {
    for (const lang of LANGS) {
      const f = join(siteDir, lang === 'en' ? '' : lang, (slug || 'index') + '.html');
      const name = f.slice(siteDir.length + 1).replace(/\\/g, '/');
      if (!existsSync(f)) { problems.push('site/' + name + ' is missing'); continue; }
      const html = readFileSync(f, 'utf8');
      let out;
      try { out = applyStore(applyChrome(html, lang, slug), store); } catch (e) { problems.push('site/' + name + ': ' + e.message); continue; }
      if (out === html) continue;
      if (write) writeFileSync(f, out);
      else problems.push('site/' + name + ' is out of step (run node cloudflare/site-chrome.mjs --write)');
    }
  }
  if (!store.live) {
    for (const name of ['llms.txt', 'llms-full.txt', 'api/app.json']) {
      let text = '';
      try { text = readFileSync(join(siteDir, name), 'utf8'); } catch { continue; }
      if (text.includes(store.storeUrl) || text.includes('-s msstore')) problems.push('site/' + name + ' still links the Microsoft Store or winget, but storeLive is false in site/assets/config.js');
    }
  }
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const write = process.argv.includes('--write');
  const problems = check({ write });
  if (problems.length) {
    for (const p of problems) console.error(p);
    process.exit(1);
  }
  console.log(write ? 'site-chrome: every page written' : 'site-chrome: OK (' + PAGES.length * LANGS.length + ' pages in step)');
}
