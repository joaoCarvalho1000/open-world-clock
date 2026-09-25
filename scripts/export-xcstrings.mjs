#!/usr/bin/env node
// Writes apple/Shared/Localizable.xcstrings (Xcode String Catalog) from shared/strings.json.
// Run from the repo root after scripts/export-shared.mjs:  node scripts/export-xcstrings.mjs
// Keys are the i18n.js keys verbatim; values keep their {name} placeholders literally (filled at runtime by
// Template.fill), so no string is marked as a printf format. Keys missing in a language are omitted for that
// language (the app falls back to English, like i18n.js t()).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IN = path.join(ROOT, 'shared', 'strings.json');
const OUT = path.join(ROOT, 'apple', 'Shared', 'Localizable.xcstrings');
const die = (msg) => { console.error('export-xcstrings: ' + msg); process.exit(1); };

if (!fs.existsSync(IN)) die('shared/strings.json not found; run node scripts/export-shared.mjs first');
const data = JSON.parse(fs.readFileSync(IN, 'utf8'));
const { languages, locales, strings } = data;
if (!Array.isArray(languages) || !languages.includes('en') || !strings || !strings.en) die('shared/strings.json has an unexpected shape');

// App language code -> .lproj / String Catalog language (en stays "en": it is the development language).
const catalogLang = (l) => (l === 'en' ? 'en' : locales[l] && locales[l].startsWith('pt') ? locales[l] : l);
const langs = languages.map((l) => [l, catalogLang(l)]).sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));

const warnings = [];
const catalog = { sourceLanguage: 'en', strings: {}, version: '1.0' };
for (const key of Object.keys(strings.en).sort()) {
  const localizations = {};
  for (const [l, cl] of langs) {
    const v = strings[l] && strings[l][key];
    if (typeof v !== 'string') { if (l !== 'en') warnings.push(`${cl}: missing "${key}" (falls back to en)`); continue; }
    if (v.includes('%')) warnings.push(`${cl}: "${key}" contains a literal % (catalog value kept verbatim; not a format string)`);
    localizations[cl] = { stringUnit: { state: 'translated', value: v } };
  }
  catalog.strings[key] = { comment: key.split('.')[0], extractionState: 'manual', localizations };
}
for (const l of languages) for (const key of Object.keys(strings[l] || {})) if (!(key in strings.en)) warnings.push(`${l}: extra key "${key}" not in en (skipped)`);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
for (const w of warnings) console.warn('warning: ' + w);
console.log(`apple/Shared/Localizable.xcstrings: ${Object.keys(catalog.strings).length} keys, languages ${langs.map((x) => x[1]).join(', ')}` +
  (warnings.length ? `, ${warnings.length} warning(s)` : ''));
