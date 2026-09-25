#!/usr/bin/env node
// Checks measure.js results (and the dist/ artifact sizes) against scripts/perf/budgets.json.
//
//   node scripts/perf/check.js results/<label>-<stamp>.json [--strict] [--no-size] [--budgets <file>]
//   node scripts/perf/check.js --latest            newest result file in scripts/perf/results
//   node scripts/perf/check.js                     same as --latest (this is `npm run perf`)
//
// Prints one line per metric: PASS (at or under target), OK (over target, under max), FAIL (over max).
// Exit code 1 on any FAIL; with --strict, also on OK (over target). Scenarios missing from the result are skipped.
// `npm run perf` only checks: measure first (measure.js -s default,seconds-off,hidden,map,scrub --runs 3 --label check).
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const latest = () => {
  const dir = path.join(__dirname, 'results');
  const list = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /-\d{4}-\d\d-\d\dT[\d-]+\.json$/.test(f)).map((f) => path.join(dir, f)) : [];
  return list.sort((x, y) => fs.statSync(y).mtimeMs - fs.statSync(x).mtimeMs)[0] || null;
};
let file = null, named = false, strict = false, size = true, budgetsFile = path.join(__dirname, 'budgets.json');
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--strict') strict = true;
  else if (a === '--no-size') size = false;
  else if (a === '--budgets') budgetsFile = path.resolve(args[++i]);
  else if (a === '--latest') { file = latest(); named = true; }
  else if (a === '--help' || a === '-h') { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 10).join('\n').replace(/^\/\/ ?/gm, '')); process.exit(0); }
  else { file = path.resolve(a); named = true; }
}
if (!named) file = latest();
const budgets = JSON.parse(fs.readFileSync(budgetsFile, 'utf8'));
const MB = 1048576;
let fails = 0, overs = 0;
const line = (name, value, b, unit) => {
  if (value == null || !Number.isFinite(value)) { console.log(`  SKIP ${name}: no data`); return; }
  const st = value > b.max ? 'FAIL' : value > b.target ? 'OK  ' : 'PASS';
  if (st === 'FAIL') fails++; else if (st === 'OK  ') overs++;
  console.log(`  ${st} ${name.padEnd(22)} ${String(+value.toFixed(2)).padStart(8)} ${unit.padEnd(4)} (target ${b.target}, max ${b.max})`);
};

if (file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`perf check: ${path.basename(file)} (${j.meta.label}, ${j.meta.runs} run(s), ${j.meta.cpu})`);
  const med = (s) => (s ? s.median : null);
  for (const [sc, b] of Object.entries(budgets.scenarios)) {
    const s = j.summary[sc];
    if (!s) continue;
    console.log(`${sc}:`);
    const get = {
      memoryMB: () => med(s.mem.mem2.pws.total),
      commitMB: () => med(s.mem.mem2.priv.total),
      processes: () => med(s.procs),
      cpuPct: () => med(s.cpu.total),
      bootMs: () => med(s.startup.boot),
      firstFrameMs: () => med(s.startup.bootFrame),
      jsHeapAfterGcMB: () => (s.cdp.jsHeapUsedAfterGC ? s.cdp.jsHeapUsedAfterGC.median / MB : null),
      elements: () => med(s.cdp.elements),
      listeners: () => med(s.cdp.listeners),
      layoutPerSec: () => med(s.cdp.layoutPerSec),
      recalcPerSec: () => med(s.cdp.recalcPerSec),
      idleIpc: () => (s.counts.ipcSend ? s.counts.ipcSend.median + (s.counts.ipcInvoke ? s.counts.ipcInvoke.median : 0) : null),
      idleSettingsWrites: () => med(s.counts.settingsWrites),
    };
    const units = { memoryMB: 'MB', commitMB: 'MB', processes: '', cpuPct: '%', bootMs: 'ms', firstFrameMs: 'ms', jsHeapAfterGcMB: 'MB', elements: '', listeners: '', layoutPerSec: '/s', recalcPerSec: '/s', idleIpc: '', idleSettingsWrites: '' };
    for (const [k, bb] of Object.entries(b)) { let v = null; try { v = get[k] ? get[k]() : null; } catch { v = null; } line(k, v, bb, units[k] || ''); }
  }
} else console.log('perf check: no result file (run measure.js first, or pass one); checking sizes only');

if (size && budgets.size) {
  const dist = path.join(ROOT, 'dist');
  // Newest matching artifact, x64 only (arm64 packages are listed by size.js but not budgeted here).
  const find = (re) => {
    try {
      const f = fs.readdirSync(dist).filter((x) => re.test(x) && !/arm64/i.test(x)).map((x) => path.join(dist, x))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
      return f ? fs.statSync(f).size / MB : null;
    } catch { return null; }
  };
  console.log('size (dist/):');
  const get = {
    setupMiB: () => find(/-setup\.exe$/i),
    portableMiB: () => find(/-portable\.exe$/i),
    appxMiB: () => find(/\.appx$/i),
    asarMiB: () => { try { return fs.statSync(path.join(dist, 'win-unpacked', 'resources', 'app.asar')).size / MB; } catch { return null; } },
  };
  for (const [k, bb] of Object.entries(budgets.size)) line(k, get[k] ? get[k]() : null, bb, 'MiB');
}
console.log(`\n${fails} over max, ${overs} over target`);
process.exit(fails || (strict && overs) ? 1 : 0);
