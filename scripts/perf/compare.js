#!/usr/bin/env node
// Side-by-side medians from measure.js result files (before/after a change, or several prototypes).
//
//   node scripts/perf/compare.js results/baseline-*.json results/proto-*.json [--scenario default,seconds-off]
//
// One row per (file label, scenario): Task Manager memory (private working set) total and per process type,
// commit, idle CPU total and per process type, and the startup marks. Cells are medians (min-max when n > 1).
'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let only = null;
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--scenario' || args[i] === '-s') only = new Set(args[++i].split(','));
  else files.push(args[i]);
}
if (!files.length) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 7).join('\n').replace(/^\/\/ ?/gm, '')); process.exit(0); }

const f = (s, d = 1) => (s ? (s.n > 1 ? `${s.median.toFixed(d)} (${s.min.toFixed(d)}-${s.max.toFixed(d)})` : s.median.toFixed(d)) : '-');
const m = (s, d = 1) => (s ? s.median.toFixed(d) : '-');
const rows = [];
const kinds = new Set();
for (const file of files) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [sc, s] of Object.entries(j.summary)) {
    if (only && !only.has(sc)) continue;
    for (const k of s.kinds || []) kinds.add(k);
    rows.push({ label: j.meta.label, sc, s });
  }
}
const K = ['browser', 'gpu', 'renderer', 'network', 'proxy', 'storage', 'crashpad', 'utility'].filter((k) => kinds.has(k)).concat([...kinds].filter((k) => !['browser', 'gpu', 'renderer', 'network', 'proxy', 'storage', 'crashpad', 'utility'].includes(k)));
const L = [];
L.push(`| run | scenario | procs | private WS MB | ${K.map((k) => k).join(' | ')} | commit MB | CPU % | renderer | GPU | browser | wc:boot ms | first frame ms |`);
L.push(`|---|---|---|---|${K.map(() => '---').join('|')}|---|---|---|---|---|---|---|`);
for (const { label, sc, s } of rows) {
  const mem = s.mem.mem2;
  L.push(`| ${label} | ${sc} | ${m(s.procs, 0)} | ${f(mem.pws.total)} | ${K.map((k) => m(mem.pws[k])).join(' | ')} | ${f(mem.priv.total)} | ${f(s.cpu.total, 2)} | ${m(s.cpu.renderer, 2)} | ${m(s.cpu.gpu, 2)} | ${m(s.cpu.browser, 2)} | ${m(s.startup.boot, 0)} | ${m(s.startup.bootFrame, 0)} |`);
}
console.log(L.join('\n'));
