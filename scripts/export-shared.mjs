#!/usr/bin/env node
// Generates the shared data consumed by the native Apple port (apple/WorldClockCore) from the real renderer JS:
//   shared/zones.json       ZONE_META, ZONE_COORDS, ZONE_CC, ZONE_I18N (src/renderer/zones.js), ABBR + LEGACY (app.js),
//                           DEFAULTS.zones (src/main.js)
//   shared/strings.json     i18n dictionaries (src/renderer/i18n.js) + native-only keys (shared/strings-native.json)
//   shared/world-land.json  land outline (src/renderer/views/world-land.js)
//   shared/golden.json      golden test vectors computed by EXECUTING the renderer code (schema: apple/CORE_API.md)
// Run from the repo root: node scripts/export-shared.mjs   (idempotent; every date is pinned, no Date.now()).
// Then: node scripts/export-xcstrings.mjs && node apple/WorldClockCore/sync-resources.mjs
//
// Renderer files are evaluated in node:vm sandboxes with a fake `window`. Helpers that only exist inside the app.js
// closure are extracted from the source text with a small JS-aware bracket matcher and evaluated in the same sandbox;
// a dependency check stops the export (naming helper and identifier) when an extracted helper starts using another
// closure-level name that is not extracted. Every failure exits non-zero BEFORE anything is written.
// The only hand-copied code is the column/run/total/best logic of app.js buildPlanner (it is interleaved with DOM
// code); it is marked "verbatim" below and the script checks that those lines still exist in app.js.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'shared');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const die = (msg) => { console.error('export-shared: ' + msg); process.exit(1); };
const warnings = [];
const warn = (msg) => { warnings.push(msg); console.warn('warning: ' + msg); };
// Any unexpected exception (typically a renderer helper throwing after an app.js change) stops the export with the
// step that was running and the top of the stack; nothing is written unless every step succeeded.
let STEP = 'loading renderer files';
const section = (name) => { STEP = `golden.${name}`; };
const onFatal = (e) => die(`${STEP} failed: ${e && e.stack ? e.stack.split('\n').slice(0, 4).map((l) => l.trim()).join(' | ') : e}` +
  '\n  (if a renderer helper changed shape, update its extraction or the vectors of this step in scripts/export-shared.mjs)');
process.on('uncaughtException', onFatal);
process.on('unhandledRejection', onFatal);

// ---------------------------------------------------------------------------------------------------------------
// JS-aware source scanning (strings, template literals, comments, regex literals)
// ---------------------------------------------------------------------------------------------------------------
const OPEN = { '(': ')', '[': ']', '{': '}' };
const CLOSE = new Set([')', ']', '}']);
const REGEX_PRECEDERS = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);
const REGEX_KEYWORDS = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'yield', 'await']);

function skipString(src, i) {
  const q = src[i];
  for (i++; i < src.length; i++) {
    if (src[i] === '\\') { i++; continue; }
    if (src[i] === q) return i + 1;
    if (src[i] === '\n') throw new Error('unterminated string literal');
  }
  throw new Error('unterminated string literal');
}
function skipRegex(src, i) {
  let inClass = false;
  for (i++; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') { i++; continue; }
    if (c === '\n') throw new Error('unterminated regex literal');
    if (inClass) { if (c === ']') inClass = false; continue; }
    if (c === '[') inClass = true;
    else if (c === '/') { i++; while (/[a-z]/i.test(src[i] || '')) i++; return i; }
  }
  throw new Error('unterminated regex literal');
}
function skipTemplate(src, i) {
  for (i++; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') { i++; continue; }
    if (c === '`') return i + 1;
    if (c === '$' && src[i + 1] === '{') { i = scan(src, i + 1, 'bracket') - 1; }
  }
  throw new Error('unterminated template literal');
}
// mode 'bracket': src[start] is an opening bracket; returns the index just past its matching close.
// mode 'statement': returns the index just past the first ';' at bracket depth 0 (or of a newline-terminated
// expression is NOT supported: every extracted statement must end with ';').
function scan(src, start, mode) {
  const stack = [];
  let i = start, lastSig = '', lastWord = '';
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { const j = src.indexOf('\n', i); i = j < 0 ? src.length : j; continue; }
    if (c === '/' && n === '*') { const j = src.indexOf('*/', i + 2); if (j < 0) throw new Error('unterminated comment'); i = j + 2; continue; }
    if (c === '"' || c === "'") { i = skipString(src, i); lastSig = c; lastWord = ''; continue; }
    if (c === '`') { i = skipTemplate(src, i); lastSig = '`'; lastWord = ''; continue; }
    if (c === '/' && (REGEX_PRECEDERS.has(lastSig) || REGEX_KEYWORDS.has(lastWord))) { i = skipRegex(src, i); lastSig = '/'; lastWord = ''; continue; }
    if (/[A-Za-z0-9_$]/.test(c)) {
      let j = i; while (j < src.length && /[A-Za-z0-9_$]/.test(src[j])) j++;
      lastWord = src.slice(i, j); lastSig = src[j - 1]; i = j; continue;
    }
    if (OPEN[c]) stack.push(OPEN[c]);
    else if (CLOSE.has(c)) {
      const want = stack.pop();
      if (want !== c) throw new Error(`bracket mismatch at ${i}: expected ${want}, got ${c}`);
      if (mode === 'bracket' && stack.length === 0) return i + 1;
    } else if (c === ';' && mode === 'statement' && stack.length === 0) return i + 1;
    if (!/\s/.test(c)) { lastSig = c; lastWord = ''; }
    i++;
  }
  throw new Error('unexpected end of source while scanning');
}
function uniqueMatch(src, re, what, file) {
  const all = [...src.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))];
  if (all.length !== 1) die(`${file}: expected exactly one ${what}, found ${all.length}`);
  return all[0];
}
// `function name(...) { ... }` -> its full source text.
function extractFunction(src, name, file) {
  const m = uniqueMatch(src, new RegExp(`\\bfunction ${name}\\s*\\(`), `function ${name}`, file);
  try {
    const paramsEnd = scan(src, m.index + m[0].length - 1, 'bracket');
    const bodyStart = src.indexOf('{', paramsEnd);
    if (bodyStart < 0 || src.slice(paramsEnd, bodyStart).trim()) throw new Error('no function body');
    return src.slice(m.index, scan(src, bodyStart, 'bracket'));
  } catch (e) { die(`${file}: cannot extract function ${name}: ${e.message}`); }
}
// `const name = <expr>;` -> the whole statement text.
function extractConst(src, name, file) {
  const m = uniqueMatch(src, new RegExp(`\\bconst ${name}\\s*=`), `const ${name}`, file);
  try { return src.slice(m.index, scan(src, m.index + m[0].length, 'statement')); }
  catch (e) { die(`${file}: cannot extract const ${name}: ${e.message}`); }
}
// `const name = { ... }` -> just the object literal text.
function extractObjectLiteral(src, name, file) {
  const m = uniqueMatch(src, new RegExp(`\\bconst ${name}\\s*=\\s*\\{`), `const ${name} = {`, file);
  try { return src.slice(m.index + m[0].length - 1, scan(src, m.index + m[0].length - 1, 'bracket')); }
  catch (e) { die(`${file}: cannot extract object ${name}: ${e.message}`); }
}
// Source text with comments, string/regex literals and template-literal TEXT blanked out (template ${...}
// expressions are kept, recursively), so identifier references can be listed without false hits.
function codeOnly(src) {
  let out = '', i = 0, lastSig = '', lastWord = '';
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    let j = -1;
    if (c === '/' && n === '/') { j = src.indexOf('\n', i); if (j < 0) j = src.length; }
    else if (c === '/' && n === '*') { j = src.indexOf('*/', i + 2) + 2; if (j < 2) throw new Error('unterminated comment'); }
    else if (c === '"' || c === "'") { j = skipString(src, i); lastSig = c; lastWord = ''; }
    else if (c === '/' && (REGEX_PRECEDERS.has(lastSig) || REGEX_KEYWORDS.has(lastWord))) { j = skipRegex(src, i); lastSig = '/'; lastWord = ''; }
    else if (c === '`') {
      out += ' '; i++;
      while (i < src.length && src[i] !== '`') {
        if (src[i] === '\\') { out += '  '; i += 2; continue; }
        if (src[i] === '$' && src[i + 1] === '{') { const end = scan(src, i + 1, 'bracket'); out += ' (' + codeOnly(src.slice(i + 2, end - 1)) + ') '; i = end; continue; }
        out += ' '; i++;
      }
      out += ' '; i++; lastSig = '`'; lastWord = ''; continue;
    }
    if (j >= 0) { out += ' '.repeat(j - i); i = j; continue; }
    if (/[A-Za-z0-9_$]/.test(c)) {
      let k = i; while (k < src.length && /[A-Za-z0-9_$]/.test(src[k])) k++;
      lastWord = src.slice(i, k); lastSig = src[k - 1]; out += lastWord; i = k; continue;
    }
    if (!/\s/.test(c)) { lastSig = c; lastWord = ''; }
    out += c; i++;
  }
  return out;
}
// Identifiers referenced by `code` (property names after "." excluded).
const referencedNames = (code) => new Set([...codeOnly(code).matchAll(/(?<![\w$.])[A-Za-z_$][\w$]*/g)].map((m) => m[0]));

// ---------------------------------------------------------------------------------------------------------------
// Load renderer files into a vm sandbox
// ---------------------------------------------------------------------------------------------------------------
const window = {};
const sandbox = vm.createContext({ window, Intl, Date, Math, JSON, console, Float32Array, navigator: { language: 'en-US' } });
sandbox.globalThis = sandbox; sandbox.self = window;
function run(code, filename) { return vm.runInContext(code, sandbox, { filename }); }
function load(rel, transform) {
  let code = read(rel);
  if (transform) code = transform(code);
  run(code, path.join(ROOT, rel));
}

load('src/renderer/time.js');
load('src/renderer/sun.js');
load('src/renderer/zones.js');
load('src/renderer/views/world-land.js');
load('src/renderer/views/map.js');
load('src/renderer/i18n.js', (code) => {
  const hook = 'window.WCI18N = api;';
  if (code.split(hook).length !== 2) die('src/renderer/i18n.js: cannot find a unique "window.WCI18N = api;" to expose DICTS');
  return code.replace(hook, hook + ' window.__DICTS = DICTS; window.__LOCALES = LOCALES;');
});
const T = window.WCTime, S = window.WCSun, I = window.WCI18N, MAPI = window.WCMap && window.WCMap._internals;
for (const [name, v] of Object.entries({ WCTime: T, WCSun: S, WCI18N: I, 'WCMap._internals': MAPI, ZONE_META: window.ZONE_META, ZONE_COORDS: window.ZONE_COORDS, ZONE_CC: window.ZONE_CC, ZONE_I18N: window.ZONE_I18N, WCWorldLand: window.WCWorldLand, __DICTS: window.__DICTS })) {
  if (!v) die(`renderer global ${name} was not defined after loading`);
}
I.setLang('en');

STEP = 'loading motion/sky.js';
// motion/sky.js in its own sandbox (it wires DOM listeners at load time; give it inert stubs).
const skyWindow = { WCMotion: { on() {}, reduced: () => true, ms: () => 0 }, ZONE_META: {}, ZONE_COORDS: {} };
const skyCtx = vm.createContext({
  window: skyWindow, Intl, Date, Math, console,
  document: { addEventListener() {}, querySelector: () => null, visibilityState: 'visible' },
  MutationObserver: class { observe() {} disconnect() {} },
  requestAnimationFrame: () => 0, setTimeout: () => 0, clearTimeout() {},
});
vm.runInContext(read('src/renderer/sun.js'), skyCtx, { filename: 'sun.js' });
vm.runInContext(read('src/renderer/motion/sky.js'), skyCtx, { filename: 'motion/sky.js' });
if (!skyWindow.WCSky || typeof skyWindow.WCSky.phaseOf !== 'function') die('motion/sky.js did not expose WCSky.phaseOf');

// ---------------------------------------------------------------------------------------------------------------
// app.js closure helpers (extracted from source text) + main.js DEFAULTS
// ---------------------------------------------------------------------------------------------------------------
const APP = 'src/renderer/app.js';
const appSrc = read(APP);
const ABBR = vm.runInNewContext('(' + extractObjectLiteral(appSrc, 'ABBR', APP) + ')');
const mainSrc = read('src/main.js');
const DEFAULTS = vm.runInNewContext('(' + extractObjectLiteral(mainSrc, 'DEFAULTS', 'src/main.js') + ')', { ENV_LANG: 'auto' });
if (!ABBR || typeof ABBR !== 'object' || !Array.isArray(ABBR.est)) die('ABBR extraction produced an unexpected value');
if (!DEFAULTS || !Array.isArray(DEFAULTS.zones) || !DEFAULTS.zones.length) die('DEFAULTS.zones extraction failed');

STEP = 'extracting app.js helpers';
// Closure-level `const` helpers and `function`s of app.js that the golden vectors execute. The closure's mutable
// state (`let` bindings) is re-declared by the harness below instead of being extracted.
const appConsts = ['T', 'I', 't', 'LEGACY', 'supportsZone', 'canonical', 'ALL_ZONES', 'parts', 'locale', 'englishCity', 'cityOf',
  'regionNames', 'regionOf', 'customLabel', 'DEFAULT_HOURS', 'HHMM', 'pad2', 'toMin', 'WEEKDAY', 'DAY_MS', 'dstCache', 'ymdUTC',
  'YMD_OPTS', 'ABBR', 'fold'];
const appFns = ['relLabel', 'formatInput', 'formatTime', 'hoursOf', 'localWall', 'isWorking', 'sunPhase', 'nextOffsetChange',
  'durationText', 'dstNote', 'parseOffsetQuery', 'searchZones', 'cellState'];
const appLets = ['settings', 'LOCAL_ZONE', 'lastOffsetQuery'];
const appPieces = [...appConsts.map((n) => [n, extractConst(appSrc, n, APP)]), ...appFns.map((n) => [n, extractFunction(appSrc, n, APP)])];

// Explicit dependency check: every closure-level name of app.js (2-space indented const/let/function declaration)
// that an extracted helper references must itself be extracted (or be harness state). This turns "ReferenceError:
// fold is not defined" deep inside a golden section into a clear message naming the helper and the missing name.
const appDeclared = new Set([...appSrc.matchAll(/^ {2}(?:const|let|var|function\*?|async function)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]));
for (const n of [...appConsts, ...appFns]) if (!appDeclared.has(n)) die(`${APP}: "${n}" is no longer a closure-level declaration; update appConsts/appFns`);
for (const n of appLets) if (!appDeclared.has(n)) die(`${APP}: closure state "${n}" no longer exists; update appLets and the harness`);
const provided = new Set([...appConsts, ...appFns, ...appLets]);
const missingDeps = [];
for (const [name, code] of appPieces) {
  const own = new Set([...codeOnly(code).matchAll(/\b(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));
  for (const ref of referencedNames(code)) if (appDeclared.has(ref) && !provided.has(ref) && !own.has(ref)) missingDeps.push(`${name} -> ${ref}`);
}
if (missingDeps.length) die(`${APP}: extracted helpers reference closure names that are not extracted (add them to appConsts/appFns or the harness): ${missingDeps.join(', ')}`);

let appCode = [
  "'use strict';",
  'let settings = { zones: [], labels: {}, hours: {}, hour12: false };',
  "let LOCAL_ZONE = 'UTC';",
  'let lastOffsetQuery = null;',
  'let __nowMs = 0;',
  ...appPieces.map(([, code]) => code),
].join('\n');
// searchZones reads the wall clock; pin it.
const NOW_STMT = 'const now = new Date();';
if (appCode.split(NOW_STMT).length !== 2) die(`${APP} searchZones: cannot find a unique "${NOW_STMT}" to pin`);
appCode = appCode.replace(NOW_STMT, 'const now = new Date(__nowMs);');
appCode += `
return { ${appFns.join(', ')}, ALL_ZONES, LEGACY, canonical, cityOf, regionOf,
  setSettings(s) { settings = s; }, setLocalZone(z) { LOCAL_ZONE = z; }, setNow(ms) { __nowMs = ms; },
  clearDst() { dstCache.clear(); }, lastQuery() { return lastOffsetQuery; } };`;
let A;
try { A = run('(function () {\n' + appCode + '\n})()', 'app-extract.js'); }
catch (e) { die(`evaluating the extracted app.js helpers failed: ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`); }
if (!A || typeof A.searchZones !== 'function') die('app.js helper extraction failed');

// verbatim from src/renderer/app.js buildPlanner (column / allWork / runs / total / best logic; DOM code removed)
const PLANNER_LINES = [
  'for (let h = 0; h < 24; h++) cols.push({ h, ms: T.zonedToEpoch(src, y, m, d, h, 0) });',
  'const allWork = cols.map(() => zones.length > 0);',
  "if (st !== 'work') allWork[i] = false;",
  'const on = i < 24 && allWork[i];',
  'if (!on && start >= 0) { runs.push([start, i]); start = -1; }',
  'const total = runs.reduce((n, [a, b]) => n + b - a, 0);',
  'const best = runs.reduce((x, r) => (r[1] - r[0] > x[1] - x[0] ? r : x));',
  'const lh = +p.hour % 24, lm = +p.minute;',
];
for (const line of PLANNER_LINES) if (!appSrc.includes(line)) die(`${APP} buildPlanner changed; update the verbatim copy (missing: ${line})`);
function planner(src, y, m, d, zones) {
  const cols = [];
  for (let h = 0; h < 24; h++) cols.push({ h, ms: T.zonedToEpoch(src, y, m, d, h, 0) });
  const allWork = cols.map(() => zones.length > 0);
  const cells = {}, localTimes = {};
  for (const zone of zones) {
    cells[zone] = []; localTimes[zone] = [];
    cols.forEach((col, i) => {
      const st = A.cellState(zone, col.ms);
      if (st !== 'work') allWork[i] = false;
      const p = T.parts(zone, new Date(col.ms), { hourCycle: 'h23', hour: '2-digit', minute: '2-digit' });
      const lh = +p.hour % 24, lm = +p.minute;
      cells[zone].push(st); localTimes[zone].push([lh, lm]);
    });
  }
  const runs = []; let start = -1;
  for (let i = 0; i <= 24; i++) {
    const on = i < 24 && allWork[i];
    if (on && start < 0) start = i;
    if (!on && start >= 0) { runs.push([start, i]); start = -1; }
  }
  const total = runs.reduce((n, [a, b]) => n + b - a, 0);
  const best = total ? runs.reduce((x, r) => (r[1] - r[0] > x[1] - x[0] ? r : x)) : null;
  return { columnsMs: cols.map((c) => c.ms), cells, localTimes, runs, totalHours: total, best };
}

// ---------------------------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------------------------
const plain = (v) => JSON.parse(JSON.stringify(v)); // strip vm-realm prototypes
const utc = (y, mo, d, h = 0, mi = 0, s = 0) => Date.UTC(y, mo - 1, d, h, mi, s);
const coordsOf = (z) => { const m = window.ZONE_META[z]; if (m && typeof m.lat === 'number') return [m.lat, m.lng]; return window.ZONE_COORDS[z] || null; };
const localHour = (zone, ms) => +T.parts(zone, new Date(ms), { hourCycle: 'h23', hour: '2-digit' }).hour % 24;
const writeJSON = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
};
const DEFAULT_H = { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] };
const withSettings = (s, fn) => { A.setSettings({ zones: [], labels: {}, hours: {}, hour12: false, ...s }); try { return fn(); } finally { A.setSettings({ zones: [], labels: {}, hours: {}, hour12: false }); } };

// ---------------------------------------------------------------------------------------------------------------
// zones.json / strings.json / world-land.json
// ---------------------------------------------------------------------------------------------------------------
STEP = 'building zones.json / strings.json / world-land.json';
const zonesJson = {
  meta: plain(window.ZONE_META),
  coords: plain(window.ZONE_COORDS),
  abbreviations: plain(ABBR),
  defaultZones: plain(DEFAULTS.zones),
  legacy: plain(A.LEGACY),                 // app.js LEGACY: old IANA id -> canonical id (saved settings are migrated)
  countryCodes: plain(window.ZONE_CC),     // zones.js ZONE_CC: zone -> ISO 3166 code (localized country names)
  cityNames: plain(window.ZONE_I18N),      // zones.js ZONE_I18N: { pt: { zone: city }, es: {...} } (en = meta city)
};
// countryNames: what app.js regionOf gets from Intl.DisplayNames([I.locale], { type: 'region', style: 'short' }) for every
// ZONE_CC code, per app language, so the Swift port shows exactly the same country names without depending on the
// platform's ICU (codes DisplayNames cannot name are left out: regionOf then falls back to ZONE_META / the IANA area).
zonesJson.countryNames = {};
for (const [lang, loc] of Object.entries(plain(window.__LOCALES))) {
  const dn = new Intl.DisplayNames([loc], { type: 'region', style: 'short' });
  const names = {};
  for (const cc of [...new Set(Object.values(zonesJson.countryCodes))].sort()) {
    let n = null; try { n = dn.of(cc); } catch { n = null; }
    if (n && n !== cc) names[cc] = n;
  }
  zonesJson.countryNames[lang] = names;
}
for (const [name, v] of Object.entries({ LEGACY: zonesJson.legacy, ZONE_CC: zonesJson.countryCodes, ZONE_I18N: zonesJson.cityNames })) {
  if (!v || typeof v !== 'object' || !Object.keys(v).length) die(`${name} is missing or empty`);
}
for (const [from, to] of Object.entries(zonesJson.legacy)) {
  if (zonesJson.meta[from]) die(`LEGACY ${from} is also a ZONE_META key (meta must use the canonical id ${to})`);
  if (!A.ALL_ZONES.includes(to)) warn(`LEGACY target ${to} is not a valid zone in this Node/ICU build`);
}
for (const [cc, z] of Object.entries(zonesJson.countryCodes).map(([z, cc]) => [cc, z])) if (!/^[A-Z]{2}$/.test(cc)) die(`ZONE_CC ${z}: bad code ${cc}`);
for (const [lang, names] of Object.entries(zonesJson.cityNames)) for (const z of Object.keys(names)) if (!zonesJson.meta[z]) warn(`ZONE_I18N ${lang} ${z} has no ZONE_META entry`);
for (const [z, m] of Object.entries(zonesJson.meta)) {
  if (typeof m.lat !== 'number' || typeof m.lng !== 'number') warn(`ZONE_META ${z} has no lat/lng`);
  if (!A.ALL_ZONES.includes(z)) warn(`ZONE_META ${z} is not a valid zone in this Node/ICU build`);
}

const DICTS = plain(window.__DICTS);
const LANGS = ['en', 'pt', 'es'];
const LOCALES = plain(window.__LOCALES);
for (const l of LANGS) if (!DICTS[l]) die(`i18n.js has no dictionary for ${l}`);
for (const l of ['pt', 'es']) {
  const missing = Object.keys(DICTS.en).filter((k) => !(k in DICTS[l]));
  const extra = Object.keys(DICTS[l]).filter((k) => !(k in DICTS.en));
  if (missing.length) warn(`i18n ${l}: ${missing.length} key(s) missing (runtime falls back to en): ${missing.join(', ')}`);
  if (extra.length) warn(`i18n ${l}: ${extra.length} key(s) not in en: ${extra.join(', ')}`);
}
// Native-only (iOS) keys: merged into strings.json only (golden vectors keep using the renderer's own dictionaries).
const NATIVE_FILE = 'shared/strings-native.json';
const native = JSON.parse(read(NATIVE_FILE));
if (!native || !native.strings || !native.strings.en) die(`${NATIVE_FILE}: expected { strings: { en, pt, es } }`);
const nativeKeys = Object.keys(native.strings.en).sort();
for (const l of Object.keys(native.strings)) {
  if (!LANGS.includes(l)) die(`${NATIVE_FILE}: unknown language "${l}"`);
  for (const [k, v] of Object.entries(native.strings[l])) {
    if (typeof v !== 'string') die(`${NATIVE_FILE}: ${l} "${k}" is not a string`);
    for (const il of LANGS) if (k in DICTS[il]) die(`${NATIVE_FILE}: key "${k}" collides with i18n.js (${il})`);
    if (!(k in native.strings.en)) die(`${NATIVE_FILE}: ${l} "${k}" has no en value`);
  }
}
for (const l of ['pt', 'es']) {
  const missing = nativeKeys.filter((k) => !(k in (native.strings[l] || {})));
  if (missing.length) warn(`${NATIVE_FILE} ${l}: ${missing.length} key(s) missing (falls back to en): ${missing.join(', ')}`);
}
const mergedStrings = {};
for (const l of LANGS) mergedStrings[l] = { ...DICTS[l], ...(native.strings[l] || {}) };
const stringsJson = { languages: LANGS, locales: LOCALES, nativeKeys, strings: mergedStrings };
// Every literal L10n.tr("key") in the Swift app/widgets must exist, or iOS shows the raw key. Keys retired from
// i18n.js that iOS still uses belong in shared/strings-native.json.
const swiftFiles = [];
const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) { if (e.name !== '.build' && !e.name.startsWith('.')) walk(p); } else if (e.name.endsWith('.swift')) swiftFiles.push(p);
} };
for (const d of ['apple/WorldClock', 'apple/WorldClockWidgets', 'apple/Shared']) if (fs.existsSync(path.join(ROOT, d))) walk(path.join(ROOT, d));
const missingSwiftKeys = new Set();
for (const f of swiftFiles) for (const m of fs.readFileSync(f, 'utf8').matchAll(/L10n\.tr\(\s*"([^"\\]+)"/g)) {
  // a literal ending in '.' is a prefix completed at runtime (L10n.tr("plan.state." + state.rawValue))
  const ok = m[1].endsWith('.') ? Object.keys(mergedStrings.en).some((k) => k.startsWith(m[1])) : m[1] in mergedStrings.en;
  if (!ok) missingSwiftKeys.add(`${m[1]} (${path.relative(ROOT, f).replace(/\\/g, '/')})`);
}
if (missingSwiftKeys.size) die(`Swift code uses string keys that are no longer defined (add them to ${NATIVE_FILE} or update the Swift code): ${[...missingSwiftKeys].join(', ')}`);

const land = window.WCWorldLand;
const landJson = { width: land.width, height: land.height, north: land.north, south: land.south,
  projection: `equirectangular x=(lng+180)*10 y=(north-lat)*10`, d: land.d };
if (!/^M/.test(landJson.d)) die('world-land path does not start with M');

// ---------------------------------------------------------------------------------------------------------------
// golden.json
// ---------------------------------------------------------------------------------------------------------------
const G = {};
G.meta = { generatedBy: 'scripts/export-shared.mjs', node: process.versions.node, icu: process.versions.icu, tz: process.versions.tz,
  unicode: process.versions.unicode, cldr: process.versions.cldr };

section('offsets');
// offsets
const OFFSET_ZONES = ['UTC', 'Asia/Kolkata', 'Asia/Kathmandu', 'Australia/Adelaide', 'Australia/Eucla', 'America/St_Johns', 'Asia/Tehran',
  'Pacific/Chatham', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Europe/Lisbon', 'Europe/London', 'America/New_York', 'America/Los_Angeles',
  'America/Sao_Paulo', 'Australia/Lord_Howe', 'Australia/Sydney', 'Pacific/Auckland', 'Asia/Tokyo', 'America/Caracas', 'Pacific/Marquesas',
  'America/Anchorage', 'Pacific/Honolulu', 'Atlantic/Azores', 'Africa/Casablanca'];
const OFFSET_DATES = [utc(2025, 1, 15, 12), utc(2025, 7, 15, 12), utc(2026, 1, 15, 12), utc(2026, 7, 15, 12), utc(2026, 12, 31, 23, 59, 59)];
G.offsets = [];
for (const zone of OFFSET_ZONES) for (const ms of OFFSET_DATES) {
  const o = T.offsetMinutes(zone, new Date(ms));
  G.offsets.push({ zone, epochMs: ms, offsetMinutes: o, formatted: T.formatOffset(o) });
}
// seconds truncation (JS floors the epoch to the second before comparing) and a sub-second instant
for (const ms of [utc(2026, 3, 8, 6, 59, 59) + 999, utc(2026, 3, 8, 7, 0, 0) + 1]) {
  const o = T.offsetMinutes('America/New_York', new Date(ms));
  G.offsets.push({ zone: 'America/New_York', epochMs: ms, offsetMinutes: o, formatted: T.formatOffset(o) });
}
const expectOffset = (zone, ms, mins) => { const got = T.offsetMinutes(zone, new Date(ms)); if (got !== mins) die(`sanity: offset ${zone} @${new Date(ms).toISOString()} = ${got}, expected ${mins}`); };
expectOffset('Asia/Kolkata', utc(2026, 1, 15, 12), 330); expectOffset('Asia/Kathmandu', utc(2026, 1, 15, 12), 345);
expectOffset('Australia/Adelaide', utc(2026, 7, 15, 12), 570); expectOffset('Australia/Adelaide', utc(2026, 1, 15, 12), 630);
expectOffset('Australia/Eucla', utc(2026, 1, 15, 12), 525); expectOffset('America/St_Johns', utc(2026, 1, 15, 12), -210);
expectOffset('America/St_Johns', utc(2026, 7, 15, 12), -150); expectOffset('Asia/Tehran', utc(2026, 7, 15, 12), 210);
expectOffset('Pacific/Chatham', utc(2026, 7, 15, 12), 765); expectOffset('Pacific/Chatham', utc(2026, 1, 15, 12), 825);
expectOffset('America/Sao_Paulo', utc(2026, 1, 15, 12), -180);

section('zonedToEpoch');
// zonedToEpoch
function zoneNote(zone, y, m, d, h, mi) {
  const wall = Date.UTC(y, m - 1, d, h, mi), DAY = 86400000;
  const offs = [...new Set([T.offsetMinutes(zone, new Date(wall - DAY)), T.offsetMinutes(zone, new Date(wall + DAY))])];
  const valid = offs.map((o) => wall - o * 60000).filter((e) => T.offsetMinutes(zone, new Date(e)) * 60000 === wall - e);
  return valid.length === 0 ? 'gap' : valid.length > 1 ? 'overlap' : 'normal';
}
const Z2E = [
  ['UTC', 2026, 9, 23, 12, 0], ['Europe/Lisbon', 2026, 1, 15, 9, 0], ['Europe/Lisbon', 2026, 7, 15, 9, 0],
  ['America/New_York', 2026, 7, 4, 12, 0], ['America/Los_Angeles', 2026, 2, 28, 23, 59], ['Asia/Tokyo', 2026, 1, 1, 0, 0],
  ['America/New_York', 2026, 3, 8, 1, 59], ['America/New_York', 2026, 3, 8, 2, 0], ['America/New_York', 2026, 3, 8, 2, 30], ['America/New_York', 2026, 3, 8, 3, 0],
  ['Europe/Lisbon', 2026, 3, 29, 0, 59], ['Europe/Lisbon', 2026, 3, 29, 1, 30], ['Europe/Lisbon', 2026, 3, 29, 2, 0],
  ['Europe/London', 2026, 3, 29, 1, 30],
  ['Australia/Sydney', 2026, 10, 4, 2, 30], ['Australia/Sydney', 2026, 10, 4, 3, 0],
  ['America/New_York', 2026, 11, 1, 0, 59], ['America/New_York', 2026, 11, 1, 1, 30], ['America/New_York', 2026, 11, 1, 2, 0],
  ['Europe/London', 2026, 10, 25, 1, 30], ['Europe/London', 2026, 10, 25, 2, 0], ['Europe/Lisbon', 2026, 10, 25, 1, 0],
  ['Australia/Sydney', 2026, 4, 5, 2, 30], ['Australia/Sydney', 2026, 4, 5, 3, 0], ['Australia/Sydney', 2026, 4, 5, 1, 59],
  ['Australia/Lord_Howe', 2026, 10, 4, 2, 0], ['Australia/Lord_Howe', 2026, 10, 4, 2, 15], ['Australia/Lord_Howe', 2026, 10, 4, 2, 30],
  ['Australia/Lord_Howe', 2026, 4, 5, 1, 45], ['Australia/Lord_Howe', 2026, 4, 5, 2, 0],
  ['Pacific/Auckland', 2026, 12, 31, 23, 30], ['Pacific/Auckland', 2027, 1, 1, 0, 15],
  ['America/Los_Angeles', 2026, 12, 31, 23, 30], ['America/Los_Angeles', 2027, 1, 1, 0, 15],
  ['Pacific/Auckland', 2026, 9, 27, 2, 30], ['Pacific/Auckland', 2026, 4, 5, 2, 30],
  ['Asia/Kolkata', 2026, 9, 23, 9, 0], ['Asia/Kolkata', 2026, 1, 1, 0, 0], ['Asia/Kathmandu', 2026, 9, 23, 9, 0], ['Asia/Kathmandu', 2026, 12, 31, 23, 45],
  ['Pacific/Chatham', 2026, 9, 27, 2, 45], ['Pacific/Chatham', 2026, 9, 27, 3, 45], ['America/St_Johns', 2026, 3, 8, 2, 30], ['America/St_Johns', 2026, 11, 1, 1, 30],
  ['Pacific/Kiritimati', 2026, 1, 1, 0, 0], ['Pacific/Pago_Pago', 2026, 12, 31, 23, 0], ['America/Sao_Paulo', 2026, 11, 1, 0, 0],
];
G.zonedToEpoch = Z2E.map(([zone, y, m, d, h, mi]) => ({ zone, y, m, d, h, mi, epochMs: T.zonedToEpoch(zone, y, m, d, h, mi), note: zoneNote(zone, y, m, d, h, mi) }));
const z2eNotes = G.zonedToEpoch.reduce((o, v) => ((o[v.note] = (o[v.note] || 0) + 1), o), {});
if (!z2eNotes.gap || !z2eNotes.overlap) die('sanity: zonedToEpoch vectors should include gaps and overlaps');

section('dayDiff');
// dayDiff
const DD = [
  ['Pacific/Kiritimati', 'Pacific/Pago_Pago', utc(2026, 9, 23, 10, 30)], ['Pacific/Kiritimati', 'Pacific/Pago_Pago', utc(2026, 9, 23, 9, 30)],
  ['Pacific/Kiritimati', 'Pacific/Pago_Pago', utc(2026, 9, 23, 11, 30)], ['Pacific/Pago_Pago', 'Pacific/Kiritimati', utc(2026, 9, 23, 10, 30)],
  ['Pacific/Kiritimati', 'Pacific/Midway', utc(2026, 12, 31, 10, 15)], ['Pacific/Kiritimati', 'Pacific/Pago_Pago', utc(2026, 12, 31, 10, 30)],
  ['Asia/Tokyo', 'America/Los_Angeles', utc(2026, 9, 23, 3, 0)], ['Asia/Tokyo', 'America/Los_Angeles', utc(2026, 9, 23, 20, 0)],
  ['America/Los_Angeles', 'Asia/Tokyo', utc(2026, 9, 23, 3, 0)], ['Asia/Tokyo', 'America/Los_Angeles', utc(2027, 1, 1, 0, 30)],
  ['America/Los_Angeles', 'Asia/Tokyo', utc(2027, 1, 1, 0, 30)], ['Pacific/Auckland', 'Europe/London', utc(2026, 12, 31, 12, 0)],
  ['Europe/Lisbon', 'Europe/London', utc(2026, 9, 23, 23, 30)], ['Asia/Kolkata', 'UTC', utc(2026, 9, 23, 18, 45)],
  ['Asia/Kathmandu', 'UTC', utc(2026, 9, 23, 18, 14)], ['Asia/Kathmandu', 'UTC', utc(2026, 9, 23, 18, 15)],
  ['UTC', 'UTC', utc(2026, 9, 23, 12, 0)],
];
G.dayDiff = DD.map(([zone, refZone, ms]) => ({ zone, refZone, epochMs: ms, diff: T.dayDiff(zone, new Date(ms), refZone) }));
if (!G.dayDiff.some((v) => v.diff === 2) || !G.dayDiff.some((v) => v.diff === -2) || !G.dayDiff.some((v) => v.diff === -1)) die('sanity: dayDiff should hit +2, -2 and -1');

section('relLabel');
// relLabel (label null when zone == localZone; app.js returns the localized "rel.local" string there)
const REL = [
  ['Europe/Lisbon', 'Europe/Lisbon', utc(2026, 9, 23, 12)], ['Europe/Lisbon', 'Europe/London', utc(2026, 9, 23, 12)],
  ['Asia/Kolkata', 'UTC', utc(2026, 9, 23, 12)], ['Asia/Kolkata', 'Europe/Lisbon', utc(2026, 7, 15, 12)], ['America/New_York', 'Europe/Lisbon', utc(2026, 9, 23, 12)],
  ['America/St_Johns', 'Europe/Lisbon', utc(2026, 1, 15, 12)], ['Asia/Kathmandu', 'UTC', utc(2026, 9, 23, 12)], ['Asia/Kathmandu', 'Asia/Kolkata', utc(2026, 9, 23, 12)],
  ['Australia/Eucla', 'Europe/London', utc(2026, 1, 15, 12)], ['UTC', 'Asia/Kathmandu', utc(2026, 9, 23, 12)], ['Pacific/Pago_Pago', 'Pacific/Kiritimati', utc(2026, 9, 23, 12)],
  ['America/New_York', 'Europe/London', utc(2026, 3, 20, 12)], ['America/New_York', 'Europe/London', utc(2026, 4, 1, 12)],
  ['Pacific/Chatham', 'America/Los_Angeles', utc(2026, 1, 15, 12)],
];
G.relLabel = REL.map(([zone, localZone, ms]) => {
  A.setLocalZone(localZone);
  const raw = A.relLabel(zone, new Date(ms));
  if (zone === localZone && raw !== I.t('rel.local')) die('sanity: relLabel for the local zone should return rel.local');
  return { zone, localZone, epochMs: ms, label: zone === localZone ? null : raw };
});
A.setLocalZone('UTC');

section('parseTime');
// parseTime
const PT = ['9', '09', '930', '0930', '9:30', '09:30', '9.30', '3pm', '3 pm', '3:15pm', '3:15 PM', '15h', '15h30', '15H30', '7h05', '0h', '3p', '3a', '11:59PM',
  '  7:05  ', '0', '00:00', '23', '23:59', '12am', '12pm', '12:00 AM', '12:30 am', '1am', '1234', '2359', '9.30pm', '9h30pm', '12 p m',
  '24', '25', '12:60', '13pm', '0am', '0pm', 'abc', '', ' ', '9:5', '9:305', '123', '12345', '-1', '9:30:00', '9;30', '+9', '9 30', 'noon', '3pmx', '٣'];
G.parseTime = PT.map((input) => ({ input, result: plain(T.parseTime(input)) }));

section('inputText');
// inputText (app.js formatInput)
const IT = [[0, 0], [0, 5], [9, 5], [11, 59], [12, 0], [12, 30], [13, 0], [15, 0], [23, 59]];
G.inputText = [];
for (const hour12 of [false, true]) for (const [h, m] of IT) {
  const text = withSettings({ hour12 }, () => A.formatInput(h, m));
  const back = T.parseTime(text);
  if (!back || back[0] !== h || back[1] !== m) die(`sanity: formatInput(${h},${m},${hour12}) = "${text}" does not round-trip`);
  G.inputText.push({ h, m, hour12, text });
}

section('phaseOf');
// phaseOf
G.phaseOf = Array.from({ length: 24 }, (_, hour) => ({ hour, phase: T.phaseOf(hour) }));

section('sunTimes');
// sunTimes (epoch = local solar noon of the date, approximated from longitude)
const PLACES = { London: [51.51, -0.13], Lisbon: [38.72, -9.14], Singapore: [1.35, 103.82], Sydney: [-33.87, 151.21], 'New York': [40.71, -74.01] };
const SEASONS = { 'Mar equinox': [2026, 3, 20], 'Jun solstice': [2026, 6, 21], 'Sep equinox': [2026, 9, 23], 'Dec solstice': [2026, 12, 21] };
const solarNoon = (y, m, d, lng) => Math.round(utc(y, m, d, 12) - (lng / 15) * 3600000);
const SUN_CASES = [];
for (const [p, [lat, lng]] of Object.entries(PLACES)) for (const [s, [y, m, d]] of Object.entries(SEASONS)) SUN_CASES.push([`${p} ${s}`, lat, lng, solarNoon(y, m, d, lng)]);
SUN_CASES.push(
  ['Tromso Jun 21 (polar day)', 69.65, 18.96, solarNoon(2026, 6, 21, 18.96)], ['Tromso Dec 21 (polar night)', 69.65, 18.96, solarNoon(2026, 12, 21, 18.96)],
  ['Tromso Mar 20', 69.65, 18.96, solarNoon(2026, 3, 20, 18.96)], ['Tromso May 15 (edge)', 69.65, 18.96, solarNoon(2026, 5, 15, 18.96)],
  ['Tromso May 25 (edge)', 69.65, 18.96, solarNoon(2026, 5, 25, 18.96)], ['Tromso Nov 20 (edge)', 69.65, 18.96, solarNoon(2026, 11, 20, 18.96)],
  ['McMurdo Jun 21 (polar night)', -77.85, 166.67, solarNoon(2026, 6, 21, 166.67)], ['McMurdo Dec 21 (polar day)', -77.85, 166.67, solarNoon(2026, 12, 21, 166.67)],
  ['Longyearbyen Jun 21', 78.22, 15.65, solarNoon(2026, 6, 21, 15.65)], ['Longyearbyen Dec 21', 78.22, 15.65, solarNoon(2026, 12, 21, 15.65)],
  ['Longyearbyen Mar 20', 78.22, 15.65, solarNoon(2026, 3, 20, 15.65)],
  ['Reykjavik Jun 21 (grazing)', 64.15, -21.94, solarNoon(2026, 6, 21, -21.94)], ['Reykjavik Dec 21', 64.15, -21.94, solarNoon(2026, 12, 21, -21.94)],
  ['Anchorage Jun 21', 61.22, -149.9, solarNoon(2026, 6, 21, -149.9)], ['Quito Mar 20', -0.18, -78.47, solarNoon(2026, 3, 20, -78.47)],
  ['London Sep 23 midnight UTC', 51.51, -0.13, utc(2026, 9, 23, 0, 0)], ['Auckland Dec 31 23:30 local', -36.85, 174.76, utc(2026, 12, 31, 10, 30)],
  ['Kiritimati Jan 1', 1.87, -157.4, solarNoon(2026, 1, 1, -157.4)], ['Honolulu Jul 15 03:00 UTC', 21.31, -157.86, utc(2026, 7, 15, 3, 0)],
);
G.sunTimes = SUN_CASES.map(([name, lat, lng, ms]) => {
  const r = S.times(new Date(ms), lat, lng);
  return { name, lat, lng, epochMs: ms, sunriseMs: r.sunrise ? r.sunrise.getTime() : null, sunsetMs: r.sunset ? r.sunset.getTime() : null, polar: r.polar };
});
const polarOf = (n) => G.sunTimes.find((v) => v.name.startsWith(n)).polar;
if (polarOf('Tromso Jun 21') !== 'day' || polarOf('Tromso Dec 21') !== 'night' || polarOf('McMurdo Jun 21') !== 'night') die('sanity: polar sun cases');

section('sunAltitude');
// sunAltitude
const ALT_POINTS = [[0, 0], [51.51, -0.13], [38.72, -9.14], [-33.87, 151.21], [40.71, -74.01], [69.65, 18.96], [-77.85, 166.67], [89.9, 0], [-89.9, 0], [35.68, 139.69], [1.87, -157.4]];
const ALT_TIMES = [utc(2026, 3, 20, 12), utc(2026, 6, 21, 0), utc(2026, 6, 21, 12), utc(2026, 9, 23, 6, 30), utc(2026, 12, 21, 18, 45)];
G.sunAltitude = [];
for (const ms of ALT_TIMES) for (const [lat, lng] of ALT_POINTS) G.sunAltitude.push({ lat, lng, epochMs: ms, altitude: S.altitude(new Date(ms), lat, lng) });

section('sunPhase');
// sunPhase (app.js; localHour = the zone's local hour at that instant, plus some synthetic hours)
G.sunPhase = [];
const SP_ZONES = ['Europe/Lisbon', 'Asia/Singapore', 'Australia/Sydney', 'America/New_York', 'Atlantic/Reykjavik'];
const SP_DAYS = [[2026, 6, 21], [2026, 12, 21], [2026, 9, 23]];
for (const zone of SP_ZONES) for (const [y, m, d] of SP_DAYS) for (let h = 0; h < 24; h += 1) {
  if (h % 2 && zone !== 'Europe/Lisbon') continue;
  const ms = T.zonedToEpoch(zone, y, m, d, h, 20);
  const [lat, lng] = coordsOf(zone);
  const hour = localHour(zone, ms);
  G.sunPhase.push({ lat, lng, epochMs: ms, localHour: hour, phase: A.sunPhase(new Date(ms), [lat, lng], hour) });
}
// synthetic localHour (the hour only matters for morning/midday/afternoon)
for (const hour of [9, 10, 11, 13, 14, 16]) {
  const ms = utc(2026, 6, 21, 12);
  G.sunPhase.push({ lat: 51.51, lng: -0.13, epochMs: ms, localHour: hour, phase: A.sunPhase(new Date(ms), [51.51, -0.13], hour) });
}
// polar cases
for (const [lat, lng, ms] of [[69.65, 18.96, utc(2026, 6, 21, 23)], [69.65, 18.96, utc(2026, 12, 21, 11)], [-77.85, 166.67, utc(2026, 6, 21, 0)]]) {
  const hour = new Date(ms + Math.round(lng / 15) * 3600000).getUTCHours();
  G.sunPhase.push({ lat, lng, epochMs: ms, localHour: hour, phase: A.sunPhase(new Date(ms), [lat, lng], hour) });
}
const spSeen = new Set(G.sunPhase.map((v) => v.phase));
for (const p of ['night', 'dawn', 'morning', 'midday', 'afternoon', 'golden', 'dusk']) if (!spSeen.has(p)) die(`sanity: sunPhase never produced "${p}"`);

section('skyPhase');
// skyPhase (motion/sky.js phaseOf on a fake card; is-night comes from app.js: !WCSun.isDay when coordinates are known)
function skyPhase(lat, lng, ms) {
  skyWindow.ZONE_COORDS = { 'Test/Zone': [lat, lng] };
  const night = !S.isDay(new Date(ms), lat, lng);
  const card = { dataset: { zone: 'Test/Zone', phase: 'day' }, classList: { contains: (c) => (c === 'is-night' ? night : false) }, getAttribute: (a) => (a === 'data-epoch' ? String(ms) : null) };
  return { phase: skyWindow.WCSky.phaseOf(card), night };
}
G.skyPhase = [];
for (const zone of ['Europe/Lisbon', 'Australia/Sydney', 'Asia/Singapore', 'Atlantic/Reykjavik']) for (const [y, m, d] of SP_DAYS) for (let h = 0; h < 24; h++) {
  if (zone !== 'Europe/Lisbon' && h % 3) continue;
  const ms = T.zonedToEpoch(zone, y, m, d, h, 40);
  const [lat, lng] = coordsOf(zone);
  const r = skyPhase(lat, lng, ms);
  G.skyPhase.push({ lat, lng, epochMs: ms, phase: r.phase, night: r.night });
}
for (const [lat, lng, ms] of [[69.65, 18.96, utc(2026, 6, 21, 23)], [69.65, 18.96, utc(2026, 12, 21, 11)], [-77.85, 166.67, utc(2026, 12, 21, 12)]]) {
  const r = skyPhase(lat, lng, ms);
  G.skyPhase.push({ lat, lng, epochMs: ms, phase: r.phase, night: r.night });
}
const skySeen = new Set(G.skyPhase.map((v) => v.phase));
for (const p of ['night', 'twilight', 'dawn', 'day', 'golden', 'dusk']) if (!skySeen.has(p)) die(`sanity: skyPhase never produced "${p}"`);

section('isWorking');
// isWorking
const IW = [];
const addIW = (zone, hours, y, m, d, h, mi) => IW.push([zone, hours, T.zonedToEpoch(zone, y, m, d, h, mi)]);
// 2026-09-23 is a Wednesday; 2026-09-26 Saturday; 2026-09-27 Sunday; 2026-09-28 Monday
for (const [h, mi] of [[8, 59], [9, 0], [12, 0], [17, 59], [18, 0], [23, 0]]) addIW('Europe/Lisbon', DEFAULT_H, 2026, 9, 23, h, mi);
addIW('Europe/Lisbon', DEFAULT_H, 2026, 9, 26, 12, 0); addIW('Europe/Lisbon', DEFAULT_H, 2026, 9, 27, 12, 0);
const CUSTOM = { start: '07:30', end: '16:15', days: [0, 1, 2, 3, 4] };
for (const [d, h, mi] of [[23, 7, 29], [23, 7, 30], [23, 16, 14], [23, 16, 15], [25, 10, 0], [27, 10, 0], [26, 10, 0]]) addIW('Asia/Tokyo', CUSTOM, 2026, 9, d, h, mi);
const NIGHT = { start: '22:00', end: '06:00', days: [1, 2, 3, 4, 5] };
// Friday 23:00 (evening part, Fri listed) / Saturday 03:00 (morning after Friday -> working) / Saturday 23:00 (Sat not listed)
// Monday 03:00 (morning after Sunday -> not working) / Monday 23:00 / Tuesday 05:59 / Tuesday 06:00 / Wednesday 12:00
for (const [d, h, mi] of [[25, 23, 0], [26, 3, 0], [26, 23, 0], [28, 3, 0], [28, 23, 0], [29, 5, 59], [29, 6, 0], [23, 12, 0], [28, 21, 59], [28, 22, 0]]) addIW('America/New_York', NIGHT, 2026, 9, d, h, mi);
for (const [h, mi] of [[8, 59], [9, 0], [17, 59], [18, 0]]) addIW('Asia/Kolkata', DEFAULT_H, 2026, 9, 23, h, mi);
for (const [h, mi] of [[8, 59], [9, 0], [17, 59], [18, 0]]) addIW('Asia/Kathmandu', DEFAULT_H, 2026, 9, 23, h, mi);
addIW('America/St_Johns', { start: '09:30', end: '17:30', days: [1, 2, 3, 4, 5] }, 2026, 9, 23, 9, 29);
addIW('America/St_Johns', { start: '09:30', end: '17:30', days: [1, 2, 3, 4, 5] }, 2026, 9, 23, 9, 30);
addIW('Pacific/Kiritimati', { start: '00:00', end: '23:59', days: [0, 1, 2, 3, 4, 5, 6] }, 2026, 9, 23, 23, 59);
addIW('Pacific/Kiritimati', { start: '00:00', end: '23:59', days: [0, 1, 2, 3, 4, 5, 6] }, 2026, 9, 23, 23, 58);
addIW('Europe/London', { start: '18:00', end: '02:00', days: [6] }, 2026, 9, 27, 1, 0); // Sunday 01:00 after a Saturday shift
addIW('Europe/London', { start: '18:00', end: '02:00', days: [6] }, 2026, 9, 26, 1, 0); // Saturday 01:00 (Friday not listed)
G.isWorking = IW.map(([zone, hours, ms]) => ({ zone, hours, epochMs: ms, working: withSettings({ hours: { [zone]: hours } }, () => A.isWorking(zone, new Date(ms))) }));
if (!G.isWorking.some((v) => v.working) || !G.isWorking.some((v) => !v.working)) die('sanity: isWorking vectors');

section('planner');
// planner
const PLANS = [
  { name: 'Lisbon + New York, default hours', source: 'Europe/Lisbon', ymd: [2026, 9, 23], zones: ['Europe/Lisbon', 'America/New_York'], hours: {} },
  { name: 'Tokyo + Los Angeles (1 h: LA Tuesday 17:00 = Tokyo Wednesday 09:00)', source: 'Asia/Tokyo', ymd: [2026, 9, 23], zones: ['Asia/Tokyo', 'America/Los_Angeles'], hours: {} },
  { name: 'Tokyo + New York, no overlap', source: 'Asia/Tokyo', ymd: [2026, 9, 23], zones: ['Asia/Tokyo', 'America/New_York'], hours: {} },
  { name: 'Default zones from Lisbon', source: 'Europe/Lisbon', ymd: [2026, 9, 23], zones: DEFAULTS.zones.slice(), hours: {} },
  { name: 'Overnight shift in New York vs London', source: 'Europe/London', ymd: [2026, 9, 23], zones: ['Europe/London', 'America/New_York'],
    hours: { 'America/New_York': { start: '22:00', end: '06:00', days: [0, 1, 2, 3, 4, 5, 6] }, 'Europe/London': { start: '06:00', end: '14:00', days: [1, 2, 3, 4, 5] } } },
  { name: 'Overnight shift crossing a weekend (Saturday source day)', source: 'Europe/London', ymd: [2026, 9, 26], zones: ['America/New_York'],
    hours: { 'America/New_York': { start: '22:00', end: '06:00', days: [1, 2, 3, 4, 5] } } },
  { name: 'DST day in source: London spring forward', source: 'Europe/London', ymd: [2026, 3, 29], zones: ['Europe/London', 'America/New_York'],
    hours: { 'Europe/London': { start: '00:00', end: '23:00', days: [0, 1, 2, 3, 4, 5, 6] }, 'America/New_York': { start: '00:00', end: '23:00', days: [0, 1, 2, 3, 4, 5, 6] } } },
  { name: 'DST day in source: New York fall back', source: 'America/New_York', ymd: [2026, 11, 1], zones: ['America/New_York', 'Europe/Lisbon'],
    hours: { 'America/New_York': { start: '00:00', end: '12:00', days: [0, 1, 2, 3, 4, 5, 6] }, 'Europe/Lisbon': { start: '00:00', end: '23:00', days: [0, 1, 2, 3, 4, 5, 6] } } },
  { name: 'DST day in source: New York spring forward', source: 'America/New_York', ymd: [2026, 3, 8], zones: ['America/New_York', 'Europe/London'],
    hours: { 'America/New_York': { start: '01:00', end: '05:00', days: [0, 1, 2, 3, 4, 5, 6] }, 'Europe/London': { start: '06:00', end: '12:00', days: [0, 1, 2, 3, 4, 5, 6] } } },
  { name: 'DST day in source: Sydney spring forward (southern hemisphere)', source: 'Australia/Sydney', ymd: [2026, 10, 4], zones: ['Australia/Sydney', 'Asia/Singapore'],
    hours: { 'Australia/Sydney': { start: '00:00', end: '23:00', days: [0, 1, 2, 3, 4, 5, 6] }, 'Asia/Singapore': { start: '00:00', end: '23:00', days: [0, 1, 2, 3, 4, 5, 6] } } },
  { name: 'DST day in source: Lord Howe fall back (30 min)', source: 'Australia/Lord_Howe', ymd: [2026, 4, 5], zones: ['Australia/Lord_Howe', 'Asia/Tokyo'], hours: {} },
  { name: 'Half-hour zone: Kolkata + London', source: 'Europe/London', ymd: [2026, 9, 23], zones: ['Asia/Kolkata', 'Europe/London'], hours: {} },
  { name: 'Half-hour zone as source: Kolkata + Kathmandu + Adelaide', source: 'Asia/Kolkata', ymd: [2026, 9, 23], zones: ['Asia/Kolkata', 'Asia/Kathmandu', 'Australia/Adelaide'], hours: {} },
  { name: 'Two separate runs (tie: first wins)', source: 'UTC', ymd: [2026, 9, 23], zones: ['UTC'],
    hours: { UTC: { start: '20:00', end: '04:00', days: [0, 1, 2, 3, 4, 5, 6] } } },
  { name: 'Weekend: Sunday in source', source: 'Europe/Lisbon', ymd: [2026, 9, 27], zones: ['Europe/Lisbon', 'Asia/Tokyo'], hours: {} },
  { name: 'Invalid hours fall back to default', source: 'Europe/Lisbon', ymd: [2026, 9, 23], zones: ['Europe/Lisbon'],
    hours: { 'Europe/Lisbon': { start: '9:00', end: '18:00', days: [1, 2, 3, 4, 5] } } },
  { name: 'Empty zone list', source: 'Europe/Lisbon', ymd: [2026, 9, 23], zones: [], hours: {} },
];
G.planner = PLANS.map((p) => {
  const [y, m, d] = p.ymd;
  const r = withSettings({ hours: p.hours, zones: p.zones }, () => planner(p.source, y, m, d, p.zones));
  return { name: p.name, source: p.source, y, m, d, zones: p.zones, hours: p.hours, columnsMs: r.columnsMs, cells: r.cells, localTimes: r.localTimes,
    runs: r.runs, totalHours: r.totalHours, best: r.best };
});

section('nextOffsetChange');
// nextOffsetChange + dstNote
const DST = [
  ['America/New_York', 2026, 3, 8], ['America/New_York', 2026, 11, 1], ['Europe/London', 2026, 3, 29], ['Europe/London', 2026, 10, 25],
  ['Australia/Sydney', 2026, 4, 5], ['Australia/Sydney', 2026, 10, 4], ['Australia/Lord_Howe', 2026, 4, 5], ['Australia/Lord_Howe', 2026, 10, 4],
];
const DST_TIMES = [];
const addDays = (y, m, d, n) => { const t = new Date(Date.UTC(y, m - 1, d + n)); return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()]; };
for (const [zone, y, m, d] of DST) {
  DST_TIMES.push([zone, T.zonedToEpoch(zone, y, m, d, 0, 30)]); // same day, before the change
  DST_TIMES.push([zone, T.zonedToEpoch(zone, y, m, d, 12, 0)]); // same day, after the change
  const [py, pm, pd] = addDays(y, m, d, -1);
  DST_TIMES.push([zone, T.zonedToEpoch(zone, py, pm, pd, 23, 30)]);
  for (let k = 1; k <= 8; k++) { const [ky, km, kd] = addDays(y, m, d, -k); DST_TIMES.push([zone, T.zonedToEpoch(zone, ky, km, kd, 12, 0)]); }
}
DST_TIMES.push(['Asia/Tokyo', utc(2026, 3, 5, 12)], ['Asia/Tokyo', utc(2026, 10, 28, 12)], ['UTC', utc(2026, 3, 25, 12)], ['Asia/Kolkata', utc(2026, 3, 25, 12)],
  ['Pacific/Chatham', T.zonedToEpoch('Pacific/Chatham', 2026, 9, 25, 12, 0)], ['America/St_Johns', T.zonedToEpoch('America/St_Johns', 2026, 3, 5, 12, 0)],
  ['Europe/Lisbon', utc(2026, 10, 25, 0, 59)], ['Europe/Lisbon', utc(2026, 10, 25, 1, 0)], ['America/Sao_Paulo', utc(2026, 11, 1, 12)]);
// Changes at local midnight (Santiago forward on Sep 6, Beirut back on Oct 25): the day and the count come from the
// wall clock at the change in the old offset, so noon the day before is "tomorrow", not "today".
DST_TIMES.push(['America/Santiago', utc(2026, 9, 3, 12)], ['America/Santiago', T.zonedToEpoch('America/Santiago', 2026, 9, 5, 12, 0)],
  ['Asia/Beirut', utc(2026, 10, 22, 12)], ['Asia/Beirut', T.zonedToEpoch('Asia/Beirut', 2026, 10, 24, 12, 0)]);
G.nextOffsetChange = DST_TIMES.map(([zone, ms]) => {
  A.clearDst();
  const r = A.nextOffsetChange(zone, ms);
  return { zone, epochMs: ms, result: r ? { atMs: r.at, delta: r.delta, old: r.old } : null };
});
section('dstNote');
// dstNote picks dst.today (days <= 0) / dst.tomorrow (1) / dst.in {n}; `days` and the short {delta} text ("+1h",
// "−30m") are recovered from the English text by matching it against the en templates themselves, so a wording
// change in i18n.js cannot silently break the parse (a text that matches no template stops the export).
const DST_KEYS = ['dst.today', 'dst.tomorrow', 'dst.in'];
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DST_PATTERNS = DST_KEYS.map((key) => {
  const tpl = DICTS.en[key];
  if (typeof tpl !== 'string' || !tpl.includes('{delta}')) die(`i18n.js en "${key}" is missing or has no {delta} placeholder`);
  if ((key === 'dst.in') !== tpl.includes('{n}')) die(`i18n.js en "${key}": {n} placeholder expected only in dst.in`);
  const src = reEsc(tpl).replace(reEsc('{delta}'), '(?<delta>\\S+)').replace(reEsc('{n}'), '(?<n>\\d+)');
  return { key, re: new RegExp('^' + src + '$') };
});
function parseDstText(text) {
  const hits = DST_PATTERNS.map((p) => ({ key: p.key, m: p.re.exec(text) })).filter((h) => h.m);
  if (hits.length !== 1) die(`dstNote: text "${text}" matches ${hits.length} of the en templates ${DST_KEYS.join('/')}`);
  const { key, m } = hits[0];
  return { key, delta: m.groups.delta, daysUntil: key === 'dst.today' ? 0 : key === 'dst.tomorrow' ? 1 : +m.groups.n };
}
G.dstNote = DST_TIMES.map(([zone, ms]) => {
  A.clearDst();
  const n = A.dstNote(zone, new Date(ms));
  if (!n) return { zone, epochMs: ms, daysUntil: null, delta: null, text: null };
  const p = parseDstText(n.text);
  return { zone, epochMs: ms, daysUntil: p.daysUntil, delta: p.delta, text: n.text };
});
// the en templates the texts were built from (the Swift test fills them from ClockChangeNote.textKey/textVars)
G.dstTemplates = Object.fromEntries(DST_KEYS.map((k) => [k, DICTS.en[k]]));
if (!G.dstNote.some((v) => v.delta && /m$/.test(v.delta))) die('sanity: expected a minutes-only dstNote delta (Lord Howe)');
if (!G.dstNote.some((v) => v.delta && v.delta.startsWith('−'))) die('sanity: expected a negative dstNote delta with U+2212');
if (!G.nextOffsetChange.some((v) => v.result && Math.abs(v.result.delta) === 30)) die('sanity: expected a 30-minute (Lord Howe) change');

section('parseOffsetQuery');
// parseOffsetQuery
const POQ = ['+3', '-5', 'utc', 'gmt', 'z', 'utc+5:30', 'gmt-3', '+05:45', '−3', '+15', '+14', '-12', '+5:60', '+5:59', '3', 'utc + 2', 'abc',
  '+0530', '+530', 'utc+0', '-0', '+', 'utc+', 'UTC+5:30', 'GMT-3', 'Z', 'utc-9:30', 'gmt+12:45', '+3:5', '+123'];
G.parseOffsetQuery = POQ.map((input) => ({ input, minutes: A.parseOffsetQuery(input) }));

section('search');
// search (searchZones lower-cases/trims the query itself; parseOffsetQuery does not, so upper-case is only
// meaningful through search). Only inclusion/first/kind are emitted: the IANA list differs between ICU builds.
const SEARCH_NOW = utc(2026, 1, 15, 12);
const SEARCH_SUMMER = utc(2026, 7, 15, 12);
const SEARCH = [
  { query: 'tok', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['Asia/Tokyo'] },
  { query: 'Tokyo', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['Asia/Tokyo'] },
  { query: 'lon', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['Europe/London'] },
  { query: 'lis', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['Europe/Lisbon'] },
  { query: 'porto', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['Europe/Lisbon'] },
  { query: 'sao', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['America/Sao_Paulo'] },
  { query: 'são', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['America/Sao_Paulo'] },
  { query: 'new', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['America/New_York'] },
  { query: 'india', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['Asia/Kolkata'] },
  { query: 'bengaluru', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['Asia/Kolkata'] },
  { query: 'est', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['America/New_York', 'America/Toronto'] },
  { query: 'EST', nowMs: SEARCH_NOW, excluding: ['America/New_York'], mustInclude: ['America/Toronto'] },
  { query: 'ist', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['Asia/Kolkata', 'Europe/Dublin', 'Asia/Jerusalem'] },
  { query: 'cet', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Rome'] },
  { query: 'pst', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['America/Los_Angeles', 'America/Vancouver'] },
  { query: '+5:30', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['Asia/Kolkata', 'Asia/Colombo'] },
  { query: 'UTC+5:45', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['Asia/Kathmandu'] },
  { query: '+9', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['Asia/Tokyo', 'Asia/Seoul'] },
  { query: '-5', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['America/New_York', 'America/Toronto', 'America/Bogota'] },
  { query: '-5', nowMs: SEARCH_SUMMER, excluding: [], mustInclude: ['America/Chicago', 'America/Bogota', 'America/Lima'] },
  { query: 'utc', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['UTC', 'Europe/London', 'Europe/Lisbon'] },
  { query: 'gmt+1', nowMs: SEARCH_SUMMER, excluding: ['Europe/London'], mustInclude: ['Europe/Lisbon', 'Africa/Lagos'] },
  { query: '−3', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['America/Sao_Paulo', 'America/Argentina/Buenos_Aires'] },
  { query: '+14', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['Pacific/Kiritimati'] },
  { query: 'kathmandu', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['Asia/Kathmandu'] },
  { query: 'xyzzy', nowMs: SEARCH_NOW, excluding: [], mustInclude: [] },
  { query: '   ', nowMs: SEARCH_NOW, excluding: [], mustInclude: [] },
  // v1.2: a lone "z" is text (Zurich, Zagreb...), not UTC; accent-insensitive matching; localized city and country
  // names (ZONE_I18N + Intl.DisplayNames) next to the English ones; Israel keyed on Asia/Jerusalem (Tel_Aviv is legacy).
  { query: 'z', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['Europe/Zurich'] },
  { query: 'Z', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['Europe/Zurich'] },
  { query: 'zur', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['Europe/Zurich'] },
  { query: 'zúrich', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['Europe/Zurich'] },
  { query: 'SÃO PAULO', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['America/Sao_Paulo'] },
  { query: 'tel aviv', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['Asia/Jerusalem'], mustExclude: ['Asia/Tel_Aviv'] },
  { query: 'jerusalem', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['Asia/Jerusalem'], mustExclude: ['Asia/Tel_Aviv'] },
  { query: 'israel', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['Asia/Jerusalem'], mustExclude: ['Asia/Tel_Aviv'] },
  { query: 'hungary', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['Europe/Budapest'] },
  { query: 'zurique', lang: 'pt', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['Europe/Zurich'] },
  { query: 'zurich', lang: 'pt', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['Europe/Zurich'] },
  { query: 'toquio', lang: 'pt', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['Asia/Tokyo'] },
  { query: 'londres', lang: 'pt', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['Europe/London'] },
  { query: 'nova', lang: 'pt', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['America/New_York'] },
  { query: 'hungria', lang: 'pt', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['Europe/Budapest'] },
  { query: 'zurich', lang: 'es', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['Europe/Zurich'] },
  { query: 'nueva york', lang: 'es', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['America/New_York'] },
  { query: 'new york', lang: 'es', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['America/New_York'] },
  { query: 'sidney', lang: 'es', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['Australia/Sydney'] },
  { query: 'lo', lang: 'es', nowMs: SEARCH_NOW, excluding: [], mustInclude: ['Europe/London'] },
];
G.search = SEARCH.map((c) => {
  const lang = c.lang || 'en', mustExclude = c.mustExclude || [];
  A.setNow(c.nowMs);
  if (I.setLang(lang) !== lang) die(`search: i18n.js setLang("${lang}") did not select ${lang}`);
  let list;
  try { list = withSettings({ zones: c.excluding }, () => A.searchZones(c.query)); } finally { I.setLang('en'); }
  if (process.env.EXPORT_DEBUG_SEARCH) console.log(lang, JSON.stringify(c.query), list.join(', '));
  const lq = A.lastQuery();
  const kind = lq && lq.off !== undefined ? 'offset' : lq && lq.abbr ? 'abbreviation' : 'text';
  for (const z of c.mustInclude) if (!list.includes(z)) die(`search "${c.query}": expected ${z} in [${list.join(', ')}]`);
  for (const z of [...c.excluding, ...mustExclude]) if (list.includes(z)) die(`search "${c.query}" (${lang}): ${z} must not be returned`);
  // firstReliable: the first hit is curated (ZONE_META) or an abbreviation hit, so it does not depend on which uncurated
  // IANA ids the platform lists or on collation ties between them.
  const first = list.length ? list[0] : null;
  const firstReliable = first === null || kind === 'abbreviation' || !!window.ZONE_META[first];
  return { query: c.query, lang, nowMs: c.nowMs, excluding: c.excluding, mustInclude: c.mustInclude, mustExclude, first, firstReliable, kind, count: list.length };
});

section('cityName');
// cityName (app.js cityOf: ZONE_I18N name for the UI language, else ZONE_META city, else the IANA city part)
const CITY_ZONES = ['Europe/Lisbon', 'Europe/Zurich', 'Asia/Tokyo', 'America/New_York', 'Asia/Kolkata', 'Asia/Jerusalem', 'Australia/Sydney',
  'Africa/Cairo', 'Atlantic/Azores', 'Europe/Budapest', 'America/North_Dakota/New_Salem', 'America/Argentina/Buenos_Aires', 'UTC'];
G.cityName = [];
for (const lang of LANGS) {
  if (I.setLang(lang) !== lang) die(`cityName: i18n.js setLang("${lang}") did not select ${lang}`);
  try { for (const zone of CITY_ZONES) G.cityName.push({ zone, lang, city: A.cityOf(zone) }); } finally { I.setLang('en'); }
}
if (!G.cityName.some((v) => v.lang === 'pt' && v.city === 'Zurique') || !G.cityName.some((v) => v.lang === 'es' && v.city === 'Zúrich')) die('sanity: localized city names');

section('country');
// country (app.js regionOf: localized short country name from ZONE_CC, else ZONE_META country, else the IANA area)
const noCC = A.ALL_ZONES.filter((z) => !window.ZONE_CC[z] && !window.ZONE_META[z] && z.includes('/')).slice(0, 2);
const COUNTRY_ZONES = ['Europe/Lisbon', 'America/New_York', 'Europe/London', 'Europe/Budapest', 'Asia/Hong_Kong', 'Asia/Jerusalem', 'Asia/Tel_Aviv',
  'America/North_Dakota/New_Salem', 'Antarctica/Troll', 'Pacific/Kiritimati', 'UTC', ...noCC];
G.country = [];
for (const lang of LANGS) {
  if (I.setLang(lang) !== lang) die(`country: i18n.js setLang("${lang}") did not select ${lang}`);
  try { for (const zone of COUNTRY_ZONES) G.country.push({ zone, lang, country: A.regionOf(zone) }); } finally { I.setLang('en'); }
}
for (const v of G.country) {
  const cc = zonesJson.countryCodes[v.zone], m = window.ZONE_META[v.zone];
  const expect = (cc && zonesJson.countryNames[v.lang][cc]) || (m ? m.country : v.zone.split('/')[0].replace(/_/g, ' '));
  if (expect !== v.country) die(`country: zones.json countryNames disagree with app.js regionOf for ${v.zone} (${v.lang}): ${expect} vs ${v.country}`);
}

section('canonical');
// canonical (app.js LEGACY: saved legacy ids are migrated on boot; search never offers them)
G.canonical = [...Object.keys(A.LEGACY), 'Asia/Jerusalem', 'Europe/Lisbon', 'UTC', 'Asia/Kolkata']
  .map((zone) => ({ zone, canonical: A.canonical(zone) }));
if (A.canonical('Asia/Tel_Aviv') !== 'Asia/Jerusalem') die('sanity: Asia/Tel_Aviv should be legacy for Asia/Jerusalem');

section('languageResolve');
// languageResolve: 'auto' = the first preferred system language the app speaks (src/main.js systemLanguage over
// app.getPreferredSystemLanguages(), then i18n.js setLang('auto', systemLang)). getLocale() is stubbed to '' (the
// iOS port only has Locale.preferredLanguages).
const mainDeclared = new Set([...mainSrc.matchAll(/^(?:const|let|var|function\*?|async function)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]));
const sysLangSrc = extractFunction(mainSrc, 'systemLanguage', 'src/main.js');
const sysLangDeps = [...referencedNames(sysLangSrc)].filter((n) => mainDeclared.has(n) && !['systemLanguage', 'systemLang', 'app'].includes(n));
if (sysLangDeps.length) die(`src/main.js systemLanguage now depends on ${sysLangDeps.join(', ')}; extend the harness`);
if (!mainDeclared.has('systemLang')) die('src/main.js: the systemLang cache variable is gone; update the systemLanguage harness');
const systemLanguage = vm.runInNewContext(`(() => { let systemLang = null; let __list = [];
  const app = { getPreferredSystemLanguages: () => __list, getLocale: () => '' };
  ${sysLangSrc}
  return (list) => { systemLang = null; __list = list; return systemLanguage(); }; })()`, {}, { filename: 'main-systemLanguage.js' });
const PREFERRED = [[], ['en-US'], ['pt-BR'], ['pt-PT'], ['es-419'], ['es-MX', 'en-US'], ['fr-FR', 'pt-BR'], ['fr-FR', 'de-DE'],
  ['de-DE', 'es-ES', 'pt-BR'], ['en-GB', 'pt-BR'], ['PT-br'], ['zh-Hans-CN', 'es-US'], ['ja-JP', 'en-AU', 'es-ES']];
G.languageResolve = PREFERRED.map((preferred) => {
  const sys = systemLanguage(preferred.slice());
  const lang = I.setLang('auto', sys);
  I.setLang('en');
  return { preferred, lang };
});
if (G.languageResolve.find((v) => v.preferred.join() === 'fr-FR,pt-BR').lang !== 'pt') die('sanity: languageResolve should skip unsupported languages');

section('template');
// template (i18n.js t(): a key that is not in any dictionary is returned as-is, then {placeholders} are filled)
const TPL = [
  ['Hello {name}', { name: 'World' }], ['{a}{b}{a}', { a: '1', b: '2' }], ['Unknown {missing} stays', { other: 'x' }], ['No placeholders', { n: '3' }],
  ['{n} h', { n: '5' }], ['{ n } not a placeholder', { n: '1' }], ['{n-1} not a word', { 'n-1': 'x' }], ['{city} (local)', { city: 'São Paulo' }],
  ['Clocks change in {n} days ({delta})', { n: '3', delta: '−1 h' }], ['{{n}}', { n: 'x' }], ['{n}', { n: '$&' }], ['{_x9}', { _x9: 'ok' }], ['', { a: 'b' }],
];
G.template = TPL.map(([template, vars]) => {
  for (const l of LANGS) if (template in DICTS[l]) die(`template "${template}" collides with an i18n key`);
  return { template, vars, result: I.t(template, vars) };
});

section('map');
// map (views/map.js _internals)
const MAP_TIMES = [utc(2026, 3, 20, 12), utc(2026, 6, 21, 12), utc(2026, 9, 23, 0), utc(2026, 12, 21, 18, 30)];
const MAP_POINTS = [[0, 0], [51.51, -0.13], [-33.87, 151.21], [40.71, -74.01], [35.68, 139.69], [69.65, 18.96], [-77.85, 166.67], [89, 0], [-60, -120], [10, 179.9], [10, -179.9]];
G.map = MAP_TIMES.map((ms) => {
  const date = new Date(ms);
  const ss = MAPI.subsolar(date);
  return {
    epochMs: ms,
    subsolar: { lat: ss.lat, lng: ss.lng },
    samples: MAP_POINTS.map(([lat, lng]) => { const alt = MAPI.altitude(lat, lng, ss); return { lat, lng, altitude: alt, isNight: MAPI.isNight(date, lat, lng), nightAlpha: MAPI.nightAlpha(alt) }; }),
    terminator: [-180, -90, 0, 90, 180].map((lng) => ({ lng, lat: MAPI.terminatorLat(lng, ss) })),
  };
});
G.mapConstants = { sunsetAltitude: MAPI.SUNSET_ALT,
  wrapLng: [-540, -181, -180, -179.5, 0, 179.5, 180, 181, 360, 725].map((lng) => ({ lng, wrapped: MAPI.wrapLng(lng) })),
  nightAlpha: [1, 0.5, 0.49, 0, -0.833, -3, -6, -6.01, -9, -12, -12.01, -20].map((altitude) => ({ altitude, alpha: MAPI.nightAlpha(altitude) })) };

// ---------------------------------------------------------------------------------------------------------------
// write
// ---------------------------------------------------------------------------------------------------------------
STEP = 'writing shared/*.json';
writeJSON(path.join(OUT, 'zones.json'), zonesJson);
writeJSON(path.join(OUT, 'strings.json'), stringsJson);
writeJSON(path.join(OUT, 'world-land.json'), landJson);
writeJSON(path.join(OUT, 'golden.json'), G);

console.log(`shared/zones.json      meta ${Object.keys(zonesJson.meta).length}, coords ${Object.keys(zonesJson.coords).length}, abbreviations ${Object.keys(zonesJson.abbreviations).length}, defaultZones ${zonesJson.defaultZones.length}`);
console.log(`shared/strings.json    ${LANGS.map((l) => `${l} ${Object.keys(mergedStrings[l]).length}`).join(', ')} (${nativeKeys.length} native-only)`);
console.log(`shared/world-land.json ${landJson.width}x${landJson.height}, path ${landJson.d.length} chars`);
console.log(`shared/golden.json     node ${G.meta.node}, icu ${G.meta.icu}, tz ${G.meta.tz}`);
for (const [k, v] of Object.entries(G)) if (Array.isArray(v)) console.log(`  ${k.padEnd(18)} ${v.length}`);
console.log(`  zonedToEpoch notes  ${JSON.stringify(z2eNotes)}`);
if (warnings.length) console.log(`${warnings.length} warning(s)`);
