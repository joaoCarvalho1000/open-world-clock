import { readFile, readdir } from 'node:fs/promises';

const res = new URL('../app/src/main/res/', import.meta.url);
const src = new URL('../app/src/main/', import.meta.url);
async function catalog(directory) {
  const values = new Map();
  for (const file of await readdir(new URL(`${directory}/`, res))) {
    if (!file.endsWith('.xml')) continue;
    const xml = await readFile(new URL(`${directory}/${file}`, res), 'utf8');
    for (const match of xml.matchAll(/<string\s+([^>]+)>([\s\S]*?)<\/string>/g)) {
      const name = /\bname="([^"]+)"/.exec(match[1])?.[1];
      if (!name || /\btranslatable="false"/.test(match[1])) continue;
      if (values.has(name)) throw new Error(`${directory}: duplicate ${name}`);
      if (!match[2].trim()) throw new Error(`${directory}: empty ${name}`);
      values.set(name, [...match[2].matchAll(/%(?:(\d+)\$)?([-#+ 0,(]*\d*(?:\.\d+)?)?([a-zA-Z%])/g)]
        .filter(m => m[3] !== '%').map(m => `${m[1] || 'next'}:${m[3]}`).sort().join(','));
    }
  }
  return values;
}

async function referenced(directory, found = new Set()) {
  for (const entry of await readdir(new URL(`${directory}/`, src), { withFileTypes: true })) {
    const child = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await referenced(child, found);
    else if (/\.(kt|xml)$/.test(entry.name) && !/\/res\/values[^/]*\/strings\.xml$/.test(child)) {
      const text = await readFile(new URL(child, src), 'utf8');
      for (const m of text.matchAll(/R\.string\.(\w+)/g)) found.add(m[1]);
      for (const m of text.matchAll(/@string\/(\w+)/g)) found.add(m[1]);
    }
  }
  return found;
}

const english = await catalog('values');
let problems = [];
// A string nothing reads is a translated sentence three people maintain for nobody, and the
// ones found this way had each outlived the code that showed them. Kotlin and every xml but
// the catalogs themselves are searched, so a manifest label or a layout counts as a reader.
const used = await referenced('.');
for (const name of english.keys()) if (!used.has(name)) problems.push(`values: ${name} is never read`);
for (const language of ['pt', 'es']) {
  const translated = await catalog(`values-${language}`);
  for (const [name, format] of english) {
    if (!translated.has(name)) problems.push(`${language}: missing ${name}`);
    else if (translated.get(name) !== format) problems.push(`${language}: format mismatch for ${name}`);
  }
  for (const name of translated.keys()) if (!english.has(name)) problems.push(`${language}: unknown ${name}`);
}
if (problems.length) throw new Error(problems.join('\n'));
console.log(`${english.size} Android strings are read somewhere and have matching Portuguese and Spanish translations and placeholders.`);
