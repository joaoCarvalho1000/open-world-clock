#!/usr/bin/env node
// Open World Clock profiler: records what the app does while idle (or at startup) and summarizes it.
//
//   node scripts/perf/profile.js                        default strip, 30 s: all-process trace, renderer CPU profile, heap
//   node scripts/perf/profile.js --scenario map         same with the world map open (also: hidden, planner, seconds-off)
//   node scripts/perf/profile.js --startup              trace from main-ready to boot+2.5 s: parse/compile/evaluate per file
//   node scripts/perf/profile.js --minute               renderer CPU profile across one minute boundary (full render)
//   node scripts/perf/profile.js --analyze <trace.json> re-run the summary on an existing trace
//   options: --duration <s>, --app <dir>, --out <dir>, --args "<electron switches>", --env K=V, --no-heap
//
// Files land in scripts/perf/results/profile-<label>-<timestamp>/ (trace-*.json opens in chrome://tracing or
// ui.perfetto.dev, cpu-*.cpuprofile in DevTools > Performance, heap-*.heapsnapshot in DevTools > Memory).
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function parseArgs(argv) {
  const o = { scenario: 'default', duration: 30, app: ROOT, out: path.join(__dirname, 'results'), args: '', env: [], heap: true, startup: false, analyze: null, label: 'dev' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '--scenario' || a === '-s') o.scenario = next();
    else if (a === '--duration') o.duration = parseFloat(next()) || 30;
    else if (a === '--app') o.app = path.resolve(next());
    else if (a === '--out') o.out = path.resolve(next());
    else if (a === '--args') o.args = next();
    else if (a === '--env') o.env.push(next());
    else if (a === '--no-heap') o.heap = false;
    else if (a === '--startup') o.startup = true;
    else if (a === '--minute') o.minute = true;
    else if (a === '--analyze') o.analyze = path.resolve(next());
    else if (a === '--label') o.label = next();
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new Error('unknown option ' + a);
  }
  return o;
}

// ---------- trace analysis ----------
const TOP_TASKS = new Set(['ThreadControllerImpl::RunTask', 'ThreadPool_RunTask', 'TaskGraphRunner::RunTask', 'RunTask', 'ThreadController::Task', 'SequenceManager RunTask']);
const RENDER_EVENTS = ['TimerFire', 'FunctionCall', 'EventDispatch', 'FireAnimationFrame', 'RequestAnimationFrame', 'UpdateLayoutTree', 'Layout', 'PrePaint', 'Paint', 'Layerize', 'UpdateLayer', 'Commit', 'BeginMainThreadFrame', 'ScheduleStyleRecalculation', 'InvalidateLayout', 'Animation', 'MajorGC', 'MinorGC', 'V8.GC_SCAVENGER', 'ParseHTML', 'EvaluateScript', 'v8.compile', 'v8.run', 'ParseAuthorStyleSheet', 'HitTest', 'IntersectionObserverController::computeIntersections', 'ResizeObserverController::DeliverObservations', 'MutationObserver', 'ScrollLayer', 'v8.produceCache', 'v8.consumeCache', 'V8.CompileCode', 'v8.parseOnBackground', 'V8.ScriptCompiler', 'PaintImage', 'RasterTask', 'Decode Image'];

function loadTrace(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(j) ? j : j.traceEvents || [];
}

function analyzeTrace(events) {
  const procName = {}, threadName = {};
  for (const e of events) {
    if (e.ph !== 'M') continue;
    if (e.name === 'process_name') procName[e.pid] = e.args && e.args.name;
    if (e.name === 'process_labels' && e.args && e.args.labels) procName[e.pid] = (procName[e.pid] || '') + ' [' + e.args.labels + ']';
    if (e.name === 'thread_name') threadName[e.pid + ':' + e.tid] = e.args && e.args.name;
  }
  let t0 = Infinity, t1 = -Infinity;
  for (const e of events) if (typeof e.ts === 'number' && e.ph !== 'M' && e.ts > 0) { t0 = Math.min(t0, e.ts); t1 = Math.max(t1, e.ts + (e.dur || 0)); }
  const span = (t1 - t0) / 1e6;
  // Convert B/E pairs into complete events per thread.
  const stacks = {};
  const complete = [];
  for (const e of events) {
    if (e.ph === 'X') complete.push(e);
    else if (e.ph === 'B') (stacks[e.pid + ':' + e.tid] = stacks[e.pid + ':' + e.tid] || []).push(e);
    else if (e.ph === 'E') {
      const s = stacks[e.pid + ':' + e.tid];
      const b = s && s.pop();
      if (b) complete.push({ ...b, ph: 'X', dur: e.ts - b.ts, tdur: e.tts && b.tts ? e.tts - b.tts : undefined, args: { ...(b.args || {}), ...(e.args || {}) } });
    }
  }
  const threads = {};
  const key = (e) => e.pid + ':' + e.tid;
  for (const e of complete) {
    const k = key(e);
    const th = threads[k] = threads[k] || { pid: e.pid, tid: e.tid, proc: procName[e.pid] || String(e.pid), thread: threadName[k] || String(e.tid), tasks: 0, taskWall: 0, taskCpu: 0, names: {}, srcs: {} };
    if (TOP_TASKS.has(e.name)) {
      th.tasks++; th.taskWall += e.dur || 0; th.taskCpu += e.tdur != null ? e.tdur : (e.dur || 0);
      const a = e.args || {};
      const src = a.src_func ? `${a.src_file || ''}:${a.src_func}` : a.src ? a.src : a.posted_from ? JSON.stringify(a.posted_from) : a.task && a.task.posted_from ? `${a.task.posted_from.file_name}:${a.task.posted_from.function_name}` : '(unknown)';
      th.srcs[src] = th.srcs[src] || { n: 0, cpu: 0 };
      th.srcs[src].n++; th.srcs[src].cpu += e.tdur != null ? e.tdur : (e.dur || 0);
    }
    const n = th.names[e.name] = th.names[e.name] || { n: 0, dur: 0, tdur: 0 };
    n.n++; n.dur += e.dur || 0; n.tdur += e.tdur || 0;
  }
  // JS entry points on renderer main threads.
  const js = {};
  for (const e of complete) {
    if (!/Renderer/i.test(procName[e.pid] || '') || !/CrRendererMain/i.test(threadName[key(e)] || '')) continue;
    if (e.name !== 'FunctionCall' && e.name !== 'TimerFire' && e.name !== 'FireAnimationFrame' && e.name !== 'EventDispatch') continue;
    const d = (e.args && e.args.data) || {};
    const where = e.name === 'EventDispatch' ? `event ${d.type}` : `${d.functionName || '(anon)'} ${String(d.url || '').split('/').slice(-2).join('/')}:${d.lineNumber != null ? d.lineNumber : '?'}`;
    const k = `${e.name} ${where}`;
    js[k] = js[k] || { n: 0, ms: 0 };
    js[k].n++; js[k].ms += (e.dur || 0) / 1000;
  }
  // Per URL costs (startup): EvaluateScript, compile, stylesheet parse.
  const urls = {};
  for (const e of complete) {
    const d = (e.args && (e.args.data || e.args)) || {};
    const url = d.url || d.styleSheetUrl || d.fileName || (e.args && e.args.fileName) || '';
    if (!url || !/^(file|https?):/.test(url)) continue;
    const short = url.split('/').slice(-2).join('/');
    const u = urls[short] = urls[short] || {};
    u[e.name] = u[e.name] || { n: 0, ms: 0 };
    u[e.name].n++; u[e.name].ms += (e.dur || 0) / 1000;
  }
  return { span, threads: Object.values(threads), js, urls, procName };
}

function reportTrace(a, title) {
  const L = [`## ${title}`, '', `Trace span ${a.span.toFixed(1)} s.`, ''];
  const busy = a.threads.filter((t) => t.tasks).sort((x, y) => y.taskCpu - x.taskCpu);
  L.push('### Threads by CPU in top-level tasks', '', '| process | thread | tasks/s | CPU ms/s | wall ms/s |', '|---|---|---|---|---|');
  for (const t of busy.slice(0, 25)) L.push(`| ${t.proc} | ${t.thread} | ${(t.tasks / a.span).toFixed(1)} | ${(t.taskCpu / 1000 / a.span).toFixed(2)} | ${(t.taskWall / 1000 / a.span).toFixed(2)} |`);
  L.push('', '### Main threads: busiest events (count/s, wall ms/s)', '');
  for (const t of a.threads.filter((x) => /CrBrowserMain|CrGpuMain|CrRendererMain|VizCompositorThread|Compositor$|CrUtilityMain/.test(x.thread))) {
    const top = Object.entries(t.names).filter(([n]) => !TOP_TASKS.has(n)).sort((x, y) => y[1].dur - x[1].dur).slice(0, 14);
    if (!top.length) continue;
    L.push(`- **${t.proc} / ${t.thread}**: ` + top.map(([n, v]) => `${n} ${(v.n / a.span).toFixed(1)}/s ${(v.dur / 1000 / a.span).toFixed(2)}ms`).join('; '));
    const srcs = Object.entries(t.srcs).sort((x, y) => y[1].n - x[1].n).slice(0, 8);
    if (srcs.length && !(srcs.length === 1 && srcs[0][0] === '(unknown)')) L.push(`  - task sources: ` + srcs.map(([s, v]) => `${s} ${(v.n / a.span).toFixed(1)}/s`).join('; '));
  }
  const ren = a.threads.filter((x) => /CrRendererMain/.test(x.thread));
  if (ren.length) {
    L.push('', '### Renderer main thread events', '', '| event | per s | wall ms/s |', '|---|---|---|');
    for (const r of ren) for (const n of RENDER_EVENTS) { const v = r.names[n]; if (v) L.push(`| ${n} | ${(v.n / a.span).toFixed(2)} | ${(v.dur / 1000 / a.span).toFixed(3)} |`); }
  }
  const js = Object.entries(a.js).sort((x, y) => y[1].n - x[1].n).slice(0, 25);
  if (js.length) {
    L.push('', '### JS entry points (renderer main)', '', '| entry | per s | ms/s |', '|---|---|---|');
    for (const [k, v] of js) L.push(`| ${k.replace(/\|/g, '/')} | ${(v.n / a.span).toFixed(2)} | ${(v.ms / a.span).toFixed(3)} |`);
  }
  return L.join('\n') + '\n';
}

function reportStartup(a) {
  const L = ['## Startup: per-file costs (ms, from the trace)', '', '| file | events |', '|---|---|'];
  for (const [u, ev] of Object.entries(a.urls).sort()) {
    L.push(`| ${u} | ${Object.entries(ev).map(([n, v]) => `${n} ${v.ms.toFixed(1)}${v.n > 1 ? ` (x${v.n})` : ''}`).join('; ')} |`);
  }
  return L.join('\n') + '\n' + reportTrace(a, 'Startup trace: threads');
}

function reportProfile(file) {
  const p = JSON.parse(fs.readFileSync(file, 'utf8'));
  const self = new Map();
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const dt = p.timeDeltas || [];
  const total = (p.endTime - p.startTime) / 1000;
  for (let i = 0; i < p.samples.length; i++) {
    const n = byId.get(p.samples[i]);
    const cf = n.callFrame;
    const k = `${cf.functionName || '(anonymous)'} ${String(cf.url).split('/').slice(-2).join('/')}:${cf.lineNumber + 1}`;
    self.set(k, (self.get(k) || 0) + (dt[i + 1] || dt[i] || 0) / 1000);
  }
  const rows = [...self.entries()].sort((a, b) => b[1] - a[1]);
  const busy = rows.filter(([k]) => !/^\((idle|program|garbage collector)\)/.test(k)).reduce((s, [, v]) => s + v, 0);
  const L = [`## Renderer JS CPU profile (${path.basename(file)})`, '', `Window ${(total / 1000).toFixed(1)} s; JS self time ${busy.toFixed(1)} ms (${(busy / (total / 1000)).toFixed(2)} ms/s).`, '', '| function | self ms |', '|---|---|'];
  for (const [k, v] of rows.slice(0, 25)) L.push(`| ${k} | ${v.toFixed(1)} |`);
  return L.join('\n') + '\n';
}

function reportHeap(file) {
  const s = JSON.parse(fs.readFileSync(file, 'utf8'));
  const L = [`## Heap snapshot (${path.basename(file)})`, '', `Total self size ${(s.total / 1048576).toFixed(2)} MB in ${s.nodeCount} nodes.`, '', 'By type: ' + Object.entries(s.byType).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / 1024).toFixed(0)} KB`).join(', '), '', '| name | KB | count |', '|---|---|---|'];
  for (const r of s.top.slice(0, 25)) L.push(`| ${r.name.replace(/\|/g, '/')} | ${(r.size / 1024).toFixed(1)} | ${r.count} |`);
  return L.join('\n') + '\n';
}

// ---------- launch ----------
function launch(o, dir) {
  return new Promise((resolve) => {
    const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'owc-prof-'));
    const LOCAL = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const Z = ['Europe/Lisbon', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Singapore'];
    fs.writeFileSync(path.join(ud, 'settings.json'), JSON.stringify({ zones: Z.includes(LOCAL) ? Z : [LOCAL, ...Z], firstRun: false, tipSeen: true }));
    const extraEnv = {};
    for (const kv of o.env) { const i = kv.indexOf('='); if (i > 0) extraEnv[kv.slice(0, i)] = kv.slice(i + 1); }
    const env = {
      ...process.env, ...extraEnv, WC_USER_DATA: ud, WC_LANG: 'en', WC_SMOKE: path.join(__dirname, 'profile-hook.js'),
      WC_PERF: JSON.stringify({ mode: o.startup ? 'startup' : o.minute ? 'minute' : 'idle', scenario: o.scenario, duration: o.duration, out: dir, heap: o.heap }),
    };
    delete env.ELECTRON_RUN_AS_NODE;
    const electron = require(path.join(ROOT, 'node_modules', 'electron'));
    const child = spawn(electron, [o.app, ...o.args.split(/\s+/).filter(Boolean)], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    const files = {};
    let buf = '';
    child.stdout.on('data', (d) => {
      buf += d; let k;
      while ((k = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, k); buf = buf.slice(k + 1);
        const i = line.indexOf('PERF '); if (i < 0) continue;
        try { const m = JSON.parse(line.slice(i + 5)); if (m.file) files[m.type] = m.file; if (m.type === 'error') console.error(m.msg); else console.log('  ' + m.type + (m.file ? ' ' + m.file : '')); } catch { /* partial */ }
      }
    });
    child.on('exit', () => { try { fs.rmSync(ud, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch { /* ignore */ } resolve(files); });
  });
}

(async () => {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 12).join('\n').replace(/^\/\/ ?/gm, '')); return; }
  if (o.analyze) {
    const a = analyzeTrace(loadTrace(o.analyze));
    console.log(/startup/.test(o.analyze) ? reportStartup(a) : reportTrace(a, path.basename(o.analyze)));
    return;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(o.out, `profile-${o.label}-${o.startup ? 'startup' : o.minute ? 'minute-' + o.scenario : o.scenario}-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  console.log(`profile: ${o.startup ? 'startup' : o.scenario + ' ' + o.duration + ' s'} -> ${dir}`);
  const files = await launch(o, dir);
  let md = `# Open World Clock profile: ${o.startup ? 'startup' : o.scenario} (${o.label})\n\n`;
  if (files.trace) { const a = analyzeTrace(loadTrace(files.trace)); md += o.startup ? reportStartup(a) : reportTrace(a, `All processes, ${o.scenario}`); }
  if (files.profile) md += '\n' + reportProfile(files.profile);
  if (files.heap) md += '\n' + reportHeap(files.heap.replace(/\.heapsnapshot$/, '.summary.json'));
  fs.writeFileSync(path.join(dir, 'summary.md'), md);
  console.log('\n' + md);
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
