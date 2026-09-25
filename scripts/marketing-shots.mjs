#!/usr/bin/env node
// Re-shoots every marketing image from the real app: the Microsoft Store screenshots (English, Portuguese, Spanish),
// the website images (site/assets/img, site/assets/img/pages, the UI area of site/assets/og.png) and the README
// images (docs/readme). How to use it is in store/README.md ("Regenerating the screenshots").
//   node scripts/marketing-shots.mjs                 capture, then compose into the repo
//   node scripts/marketing-shots.mjs --capture       only the raw captures (dist/marketing/raw/<lang>)
//   node scripts/marketing-shots.mjs --compose       only compose, from the raw captures already there
//   options: --langs en,pt,es   --raw <dir>   --dest <dir> (compose into another folder, same layout as the repo)
//            --scenes a,b (capture only these scenes; see scripts/marketing/capture.cjs)
// Step 1 (scripts/marketing/capture.cjs) runs the dev app once per language in a throwaway profile (WC_USER_DATA),
// with a fixed clock (23 Sep 2026, 13:20 UTC) and fixed cities per language (local city: Lisbon, São Paulo or Mexico
// City), so no real location or personal data appears.
// The installed app can stay open: the throwaway profile has its own single-instance lock. Keep the mouse still and
// leave the display on while it runs (about a minute per language); the window sits at the top-left of the primary
// display, away from the pointer.
// Step 2 (scripts/marketing/compose.cjs) draws the final images on a canvas in a hidden Electron window. No image
// library, nothing to install beyond the project's own devDependencies.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const electron = require('electron'); // the path of the Electron binary
const args = process.argv.slice(2);
const val = (name, def) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const onlyCapture = args.includes('--capture'), onlyCompose = args.includes('--compose');
const langs = val('--langs', 'en,pt,es').split(',').filter((l) => ['en', 'pt', 'es'].includes(l));
const raw = path.resolve(val('--raw', path.join(ROOT, 'dist', 'marketing', 'raw')));
const dest = path.resolve(val('--dest', ROOT));
const scenes = val('--scenes', '');
// Chromium stops painting a window it thinks is covered; the capture window must always paint.
const SWITCHES = ['--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows'];

if (!fs.existsSync(electron)) { console.error(`Electron is missing (${electron}): run npx install-electron`); process.exit(1); }

let failed = false;
if (!onlyCompose) {
  for (const lang of langs) {
    const out = path.join(raw, lang);
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'owc-marketing-'));
    console.log(`capture ${lang} -> ${path.relative(ROOT, out)}`);
    const r = spawnSync(electron, [ROOT, ...SWITCHES], {
      env: { ...process.env, WC_USER_DATA: profile, WC_SMOKE: path.join(ROOT, 'scripts', 'marketing', 'capture.cjs'), WC_BACKDROP: 'none', WC_LANG: lang,
        MKT_OUT: out, MKT_LANG: lang, ...(scenes ? { MKT_SCENES: scenes } : {}) },
      stdio: ['ignore', 'ignore', 'pipe'], timeout: 15 * 60 * 1000,
    });
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* still locked: the OS temp folder cleans it */ }
    const log = fs.existsSync(path.join(out, 'log.txt')) ? fs.readFileSync(path.join(out, 'log.txt'), 'utf8') : '';
    const bad = log.split('\n').filter((l) => /FAILED|ERR /.test(l));
    console.log(`  ${log.split('\n').filter((l) => / shot /.test(l)).length} captures${bad.length ? `, problems:\n  ${bad.join('\n  ')}` : ''}`);
    if (r.status !== 0 || bad.length) { failed = true; if (r.stderr && r.stderr.length) console.log(r.stderr.toString().split('\n').slice(-15).join('\n')); }
  }
}
if (!onlyCapture && !failed) {
  console.log(`compose -> ${dest === ROOT ? 'the repo' : dest}`);
  const r = spawnSync(electron, [path.join(ROOT, 'scripts', 'marketing', 'compose.cjs')], {
    env: { ...process.env, MKT_RAW: raw, MKT_DEST: dest, MKT_LANGS: langs.join(',') }, stdio: ['ignore', 'inherit', 'inherit'], timeout: 10 * 60 * 1000,
  });
  if (r.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
