#!/usr/bin/env node
// Launch gate: refuses a deploy while the site would send visitors to a dead Store listing, GitHub page or download.
// It reads storeUrl, githubRepo, downloadBase and version from site/assets/config.js and the app version from the root
// package.json, then:
//   1. GETs the Store listing (following redirects): it must answer ok and not land on a /404/ page. Only while
//      storeLive is true in config.js: until the listing is approved every Store link on the site is hidden, so
//      no Store URL is requested at all (not in step 7 either)
//   2. the GitHub repo page must answer 200
//   3. the LICENSE the site links (links.license in config.js) must answer 200
//   4. the installer and the portable exe, built the way config.js builds them
//      (<downloadBase>/Open-World-Clock-<version>-setup.exe and -portable.exe, on Cloudflare R2), must answer ok; the
//      body is cancelled as soon as the answer arrives, so the files themselves are not downloaded
//   5. config.js must have a downloadBase, on https (checked first, without any request)
//   6. the file names download.html (and pt/download.html, es/download.html) prints must be exactly those two names
//   7. every other Store, GitHub repo or download URL in site/*.html, site/*.txt, the Portuguese and Spanish pages
//      (site/pt/*.html, site/es/*.html), site/api/app.json and site/site.webmanifest must answer ok (except
//      /security/advisories/new, which needs a sign-in); Store links that differ only in the ?cid= campaign tag count
//      as the one listing checked in step 1. A link to an older version's exe must still be in the bucket.
//   8. the version in site/assets/config.js, which builds those direct download URLs, must equal package.json's
//      (checked first, without any request)
//   9. freshness dates must agree (also offline, before any request): each page in site/sitemap.xml whose JSON-LD has
//      a dateModified must carry the same date as its <lastmod> (in every language: /pt/features is site/pt/features.html,
//      /es/ is site/es/index.html), and the "Last updated" dates in llms-full.txt and the privacy policy in each language
//      (privacy.html "Last updated 25 September 2026", pt/privacy.html "Última atualização: 25 de setembro de 2026",
//      es/privacy.html "Última actualización: 25 de septiembre de 2026") must not be older than their own <lastmod>
//
//   node cloudflare/check-links.mjs          exit 0 when every link works, 1 with one line per problem
//   OWC_SKIP_LINK_CHECK=1 node ...           skip the check (emergency override): prints a warning and exits 0
//
// npm runs it before `npm run deploy` (the predeploy script in package.json), and `npm run links` runs it alone.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const SITE_DIR = join(here, '..', 'site');
export const PACKAGE_JSON = join(here, '..', 'package.json');
const UA = 'Mozilla/5.0 (compatible; owc-link-check/1.0; +https://openworldclock.com)';
const SKIP_PATHS = ['/security/advisories/new'];
// the site's languages besides English, each in its own folder with the same pages (see cloudflare/site-chrome.mjs)
export const LANG_DIRS = ['pt', 'es'];

export function readConfig(siteDir = SITE_DIR) {
  const src = readFileSync(join(siteDir, 'assets', 'config.js'), 'utf8');
  const pick = (key, optional) => {
    const m = src.match(new RegExp('\\b' + key + "\\s*:\\s*['\"]([^'\"]+)['\"]"));
    if (!m && !optional) throw new Error('site/assets/config.js: no ' + key + ' found');
    return m ? m[1] : undefined;
  };
  // version and downloadBase are optional here so a config without them is reported as a problem (rules 8 and 5)
  // instead of crashing the check
  const live = src.match(/\bstoreLive\s*:\s*(true|false)\b/);
  return { storeUrl: pick('storeUrl'), storeLive: live ? live[1] === 'true' : true, githubRepo: pick('githubRepo'), downloadBase: pick('downloadBase', true), version: pick('version', true) };
}

// The two files the Installer and Portable buttons download, named and placed the way config.js builds them.
export function downloadFiles(downloadBase, version) {
  const base = String(downloadBase || '').replace(/\/+$/, '');
  return ['setup', 'portable'].map((kind) => {
    const name = 'Open-World-Clock-' + version + '-' + kind + '.exe';
    return { kind, name, url: base + '/' + name };
  });
}

export function readVersion(packageJson = PACKAGE_JSON) {
  return JSON.parse(readFileSync(packageJson, 'utf8')).version;
}

// Every unique https URL on the Store, on this GitHub repo or on the download host that the site's pages and data
// files link to.
export function collectSiteUrls(siteDir, repo, downloadBase) {
  const list = (dir) => { try { return readdirSync(dir).filter((n) => /\.(html|txt)$/.test(n)).map((n) => join(dir, n)); } catch { return []; } };
  const files = [siteDir, ...LANG_DIRS.map((l) => join(siteDir, l))].flatMap(list);
  files.push(join(siteDir, 'api', 'app.json'), join(siteDir, 'site.webmanifest'));
  const repoBase = 'https://github.com/' + repo.toLowerCase();
  const dlBase = downloadBase ? String(downloadBase).replace(/\/+$/, '').toLowerCase() + '/' : null;
  const urls = new Set();
  for (const f of files) {
    let text;
    try { text = readFileSync(f, 'utf8'); } catch { continue; }
    for (const m of text.matchAll(/https:\/\/[^\s"'<>()`\\]+/g)) {
      const url = m[0].replace(/&amp;/g, '&').replace(/[.,;:!?]+$/, '');
      const lower = url.toLowerCase();
      const onRepo = lower === repoBase || lower.startsWith(repoBase + '/') || lower.startsWith(repoBase + '?') || lower.startsWith(repoBase + '#');
      const onDownloads = dlBase !== null && lower.startsWith(dlBase);
      if (!onRepo && !onDownloads && !/^https:\/\/apps\.microsoft\.com\//i.test(url)) continue;
      if (SKIP_PATHS.some((p) => new URL(url).pathname.endsWith(p))) continue;
      urls.add(url);
    }
  }
  return [...urls].sort();
}

// month names in the site's three languages, each file read in its own (Spanish also accepts setiembre)
const MONTHS = {
  en: ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'],
  pt: ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
};
const EXAMPLE = { en: '24 September 2026', pt: '24 de setembro de 2026', es: '24 de septiembre de 2026' };
// "24 September 2026" -> "2026-09-24" ("24 de setembro de 2026" in pt, "24 de septiembre de 2026" in es; null if it is
// not a day, a month name in that language and a year)
function isoFromWords(d, month, y, lang = 'en') {
  const m = MONTHS[lang].indexOf(String(month).toLowerCase().replace(/^setiembre$/, 'septiembre'));
  if (m < 0) return null;
  return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}
const readOr = (f) => { try { return readFileSync(f, 'utf8'); } catch { return null; } };

// Rule 9, offline: the dates that tell search engines and AI crawlers how fresh a page is must not disagree.
// Returns one line per problem, for example
//   site/meeting-planner.html dateModified 2026-09-23 but sitemap lastmod 2026-09-24
// A site without sitemap.xml has nothing to compare, so it passes.
export function checkFreshness(siteDir = SITE_DIR) {
  const problems = [];
  const sitemap = readOr(join(siteDir, 'sitemap.xml'));
  if (!sitemap) return problems;
  const lastmod = new Map(); // path ("/", "/privacy", "/llms-full.txt") -> YYYY-MM-DD
  for (const m of sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = (m[1].match(/<loc>\s*([^<\s]+)\s*<\/loc>/) || [])[1];
    const mod = (m[1].match(/<lastmod>\s*(\d{4}-\d{2}-\d{2})[^<]*<\/lastmod>/) || [])[1];
    if (!loc || !mod) continue;
    let path;
    try { path = new URL(loc).pathname; } catch { continue; }
    lastmod.set(path, mod);
  }
  for (const [path, mod] of lastmod) {
    if (path.includes('.') && !path.endsWith('.html')) continue; // llms.txt and other plain files: checked below
    // '/' -> index.html, '/pt/' -> pt/index.html, '/es/features' -> es/features.html
    const file = path.endsWith('/') ? path.slice(1) + 'index.html' : path.replace(/^\//, '').replace(/\.html$/, '') + '.html';
    const html = readOr(join(siteDir, file));
    if (html === null) continue;
    const dm = (html.match(/"dateModified"\s*:\s*"(\d{4}-\d{2}-\d{2})/) || [])[1];
    if (dm && dm !== mod) problems.push('site/' + file + ' dateModified ' + dm + ' but sitemap lastmod ' + mod);
  }
  const older = (file, re, path, lang = 'en') => {
    const mod = lastmod.get(path);
    const text = mod && readOr(join(siteDir, file));
    if (!text) return;
    const m = text.match(re);
    if (!m) { problems.push('site/' + file + ' has no "Last updated" date, but sitemap lastmod is ' + mod); return; }
    const iso = isoFromWords(m[1], m[2], m[3], lang);
    if (!iso) problems.push('site/' + file + ' Last updated "' + m[0] + '" is not a date like ' + EXAMPLE[lang]);
    else if (iso < mod) problems.push('site/' + file + ' Last updated ' + iso + ' but sitemap lastmod ' + mod);
  };
  older('llms-full.txt', /Last updated:\s*(\d{1,2}) ([A-Za-z]+) (\d{4})/, '/llms-full.txt');
  older('privacy.html', /Last updated:?\s*(\d{1,2}) ([A-Za-z]+) (\d{4})/, '/privacy');
  older('pt/privacy.html', /Última atualização:?\s*(\d{1,2}) de ([A-Za-zçÇ]+) de (\d{4})/, '/pt/privacy', 'pt');
  older('es/privacy.html', /Última actualización:?\s*(\d{1,2}) de ([A-Za-z]+) de (\d{4})/, '/es/privacy', 'es');
  return problems;
}

// The installer and portable file names the download page tells people to look for, in every language.
export function downloadPageNames(siteDir) {
  const html = ['download.html', ...LANG_DIRS.map((l) => l + '/download.html')].map((p) => readOr(join(siteDir, p)) || '').join('\n');
  if (!html.trim()) return [];
  return [...new Set([...html.matchAll(/Open[ .-]World[ .-]Clock-(\d+\.\d+\.\d+[0-9A-Za-z.-]*?)-(setup|portable)\.exe/g)].map((m) => m[0]))];
}

const sleep = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
const isStore = (url) => /^https:\/\/apps\.microsoft\.com\//i.test(url);
async function drain(res) { try { await res.body?.cancel(); } catch { /* already consumed */ } }
const describe = (res, url) => res.status + (res.url && res.url !== url ? ', ended on ' + res.url : '');

export async function checkLinks({ fetchImpl = globalThis.fetch, siteDir = SITE_DIR, version, config,
  storePace = 1500, storeBackoff = [3000, 6000] } = {}) {
  const { storeUrl, storeLive = true, githubRepo, downloadBase, version: siteVersion } = config || readConfig(siteDir);
  if (!version) version = readVersion();
  const problems = [];
  const checked = new Set();
  const repoUrl = 'https://github.com/' + githubRepo;

  // 8: the site's version builds the direct Installer and Portable URLs, so it must be the version being released
  if (!siteVersion) problems.push('site/assets/config.js has no version, but package.json is ' + version);
  else if (siteVersion !== version) problems.push('site/assets/config.js says ' + siteVersion + ' but package.json is ' + version);
  // 5: the direct Installer and Portable URLs are built from downloadBase
  const httpsBase = /^https:\/\/[^/]+/i.test(downloadBase || '');
  if (!downloadBase) problems.push('site/assets/config.js has no downloadBase (the host that serves the installer and portable exe)');
  else if (!httpsBase) problems.push('site/assets/config.js downloadBase ' + downloadBase + ' is not an https URL');
  // 9: the freshness dates in the sitemap, the pages' JSON-LD, llms-full.txt and the privacy policy agree
  problems.push(...checkFreshness(siteDir));

  // The Store throttles quick repeat visits with a 403 (a live listing answers 200 again a few seconds later), so its
  // requests are spaced out and a 403 or 429 is retried after a pause. Other hosts get one retry on a 5xx.
  let lastStoreHit = -Infinity;
  async function get(url, headers = {}) {
    const store = isStore(url);
    const tries = store ? storeBackoff.length + 1 : 2;
    let last;
    for (let attempt = 0; attempt < tries; attempt++) {
      if (store) { await sleep(lastStoreHit + storePace - Date.now()); lastStoreHit = Date.now(); }
      try {
        const res = await fetchImpl(url, {
          method: 'GET', redirect: 'follow',
          headers: { 'user-agent': UA, accept: 'text/html,application/json;q=0.9,*/*;q=0.8', ...headers },
          signal: AbortSignal.timeout(20000),
        });
        const retry = attempt < tries - 1 && (store ? res.status === 403 || res.status === 429 || res.status >= 500 : res.status >= 500);
        if (!retry) return res;
        await drain(res);
        last = new Error('HTTP ' + res.status);
        if (store) await sleep(storeBackoff[attempt]);
      } catch (e) {
        last = e;
      }
    }
    throw last;
  }

  // a web page: must answer ok; a Store page must also not land on the Store's /404/ page
  async function page(url, label) {
    checked.add(url);
    try {
      const res = await get(url);
      await drain(res);
      if (!res.ok || (isStore(url) && /\/404\//.test(res.url || ''))) {
        const hint = isStore(url) && res.status === 403 ? ' (the Store kept refusing the check: run it again in a minute)' : '';
        problems.push(label + ' ' + url + ': ' + describe(res, url) + hint);
      }
      return res;
    } catch (e) {
      problems.push(label + ' ' + url + ': request failed (' + (e && e.message || e) + ')');
      return null;
    }
  }

  // 1 to 3: the Store listing, the repo and the license
  if (storeLive) await page(storeUrl, 'Store listing');
  await page(repoUrl, 'GitHub repo');
  await page(repoUrl + '/blob/main/LICENSE', 'LICENSE (links.license)');

  // 4: the installer and the portable exe answer where config.js sends the buttons
  const files = downloadFiles(downloadBase, version);
  if (httpsBase) {
    for (const file of files) await page(file.url, file.kind === 'setup' ? 'Installer download' : 'Portable download');
  }

  // 6: the names the download pages print are the files people get
  const printed = downloadPageNames(siteDir);
  for (const { kind, name } of files) {
    const shown = printed.filter((n) => n.endsWith('-' + kind + '.exe'));
    if (!shown.length) { problems.push('download.html does not name the ' + kind + ' file (expected ' + name + ')'); continue; }
    for (const n of shown) {
      if (n !== name) problems.push('download.html says "' + n + '" but the file the buttons download is "' + name + '": fix download.html');
    }
  }

  // 7: every other Store and repo link on the site. Store links that differ only in their query (the ?cid= campaign
  // tag) are the same listing, so each listing is fetched once: asking the Store for it nine times in a row only
  // earns 403s from its throttle.
  const storeKey = (url) => { const u = new URL(url); return (u.origin + u.pathname).toLowerCase(); };
  const storeSeen = new Set([storeKey(storeUrl)]);
  for (const url of collectSiteUrls(siteDir, githubRepo, downloadBase)) {
    if (checked.has(url)) continue;
    if (isStore(url)) {
      if (!storeLive) continue; // hidden until the listing is approved
      const key = storeKey(url);
      if (storeSeen.has(key)) { checked.add(url); continue; }
      storeSeen.add(key);
    }
    await page(url, 'Site link');
  }

  return { problems, checked: [...checked] };
}

async function main() {
  if (process.env.OWC_SKIP_LINK_CHECK === '1') {
    const bar = '!'.repeat(78);
    console.warn(bar + '\n!! OWC_SKIP_LINK_CHECK=1: the Store, GitHub and download link check was SKIPPED.\n' +
      '!! Emergency override only: npm run deploy still goes to production (--branch main), and dead links send visitors to a 404.\n' + bar);
    process.exit(0);
  }
  const { problems, checked } = await checkLinks();
  if (problems.length) {
    console.error('check-links: ' + problems.length + ' problem' + (problems.length === 1 ? '' : 's') + ', deploy blocked:');
    for (const p of problems) console.error('  ' + p);
    console.error('Fix the links (or publish the Store listing and repo, or upload the exe files to R2 as in PUBLISHING.md) and any dates that disagree, then run it again. Emergency override: OWC_SKIP_LINK_CHECK=1');
    process.exit(1);
  }
  console.log('check-links: OK (' + checked.length + ' URLs, the downloads and download.html agree)');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('check-links: ' + (e && e.stack || e)); process.exit(1); });
}
