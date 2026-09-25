#!/usr/bin/env node
// Open World Clock resource benchmark: launches the dev build N times per scenario and records memory per process
// type, idle CPU, the cold start timeline and renderer metrics (CDP). Windows only.
//
//   node scripts/perf/measure.js                         all scenarios, 3 runs each (~95 s per run, ~1 h)
//   node scripts/perf/measure.js --scenarios default,map --runs 5
//   node scripts/perf/measure.js --quick                 short windows, 1 run: a smoke check of the harness
//   node scripts/perf/measure.js --app <dir> --label proto-x --args "--disable-gpu" --env WC_BACKDROP=none
//   node scripts/perf/measure.js --packaged <copy>\owc-perf.exe -s default,seconds-off
//        a COPY of dist/win-unpacked with the exe renamed (so it never matches "Open World Clock.exe"); runs with
//        --user-data-dir=<temp> (packaged builds ignore WC_USER_DATA), measured from outside only (no CDP, no hook)
//   node scripts/perf/measure.js -s default,seconds-off --variant "before|app=C:/copy-of-old" --variant "after"
//        A/B: variants run interleaved (round-robin) so background load hits them alike; one .json/.md per variant.
//        Variant spec: "label|app=<dir>|args=<switches>|env=K=V,K2=V2|electron=<exe>|packaged=<exe>"
//
// Output: scripts/perf/results/<label>-<timestamp>.json and .md (override with --out <dir>).
// Never touches the installed app or %APPDATA%\Open World Clock: every run gets a fresh WC_USER_DATA temp folder,
// which main.js honors only in unpacked/dev runs. See README.md for what each number means.
'use strict';
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const HOOK = path.join(__dirname, 'hook.js');
const SAMPLER = path.join(__dirname, 'sample.ps1');

// ---------- options ----------
function parseArgs(argv) {
  const o = { runs: 3, scenarios: 'all', app: ROOT, electron: null, args: '', env: [], label: 'dev', out: path.join(__dirname, 'results'), quick: false, noStartupCdp: false, gap: 3, variants: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '--runs') o.runs = Math.max(1, parseInt(next(), 10) || 1);
    else if (a === '--scenarios' || a === '-s') o.scenarios = next();
    else if (a === '--app') o.app = path.resolve(next());
    else if (a === '--electron') o.electron = path.resolve(next());
    else if (a === '--packaged') o.packaged = path.resolve(next());
    else if (a === '--variant') o.variants.push(next());
    else if (a === '--args') o.args = next();
    else if (a === '--env') o.env.push(next());
    else if (a === '--label') o.label = next();
    else if (a === '--out') o.out = path.resolve(next());
    else if (a === '--quick') o.quick = true;
    else if (a === '--no-startup-cdp') o.noStartupCdp = true;
    else if (a === '--gap') o.gap = parseFloat(next()) || 0;
    else if (a === '--list') o.list = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new Error('unknown option ' + a);
  }
  return o;
}

// ---------- scenarios ----------
const LOCAL = Intl.DateTimeFormat().resolvedOptions().timeZone;
const DEFAULT_ZONES = ['Europe/Lisbon', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Singapore'];
const BASE_ZONES = DEFAULT_ZONES.includes(LOCAL) ? DEFAULT_ZONES : [LOCAL, ...DEFAULT_ZONES];
const TWELVE = [...new Set([...BASE_ZONES, 'Asia/Tokyo', 'Australia/Sydney', 'Asia/Kolkata', 'America/Sao_Paulo', 'Europe/Berlin', 'Asia/Dubai', 'America/Chicago', 'Africa/Johannesburg'])].slice(0, 12);
// A returning user: first run done, tip dismissed, the default cities (plus the local one, as the first run adds it).
const BASE_SETTINGS = { zones: BASE_ZONES, firstRun: false, tipSeen: true, showSeconds: true, layout: 'strip', planner: false };
const SCENARIOS = {
  default: { desc: `strip, ${BASE_ZONES.length} cities, seconds on (shipping defaults)` },
  'seconds-off': { desc: 'showSeconds false', settings: { showSeconds: false } },
  hidden: { desc: 'hidden to tray (win.hide)' },
  minimized: { desc: 'minimized' },
  occluded: { desc: 'not on top, moved off screen (native occlusion)' },
  compact: { desc: 'compact layout', settings: { layout: 'compact' } },
  vertical: { desc: 'vertical layout', settings: { layout: 'vertical' } },
  planner: { desc: 'planner open', settings: { planner: true } },
  map: { desc: 'world map open' },
  cities12: { desc: '12 cities', settings: { zones: TWELVE } },
  converting: { desc: 'converter showing 9:30 (static)' },
  scrub: { desc: 'slider scrubbing at 30 Hz (active, not idle)' },
  transparent: { desc: 'WC_BACKDROP=none: transparent window, CSS blur instead of native acrylic', env: { WC_BACKDROP: 'none' } },
};

// ---------- helpers ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MB = (b) => b / 1048576;
function median(xs) {
  const v = xs.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
function stat(xs) {
  const v = xs.filter((x) => typeof x === 'number' && Number.isFinite(x));
  if (!v.length) return null;
  return { median: median(v), min: Math.min(...v), max: Math.max(...v), n: v.length };
}
function typeOf(p) {
  if (p.type === 'browser') return /crashpad/i.test(p.name) ? 'crashpad' : 'browser';
  if (p.type === 'gpu-process') return 'gpu';
  if (p.type === 'renderer') return 'renderer';
  if (p.type === 'crashpad-handler') return 'crashpad';
  if (p.type === 'utility') {
    if (/network/i.test(p.sub)) return 'network';
    if (/proxy_resolver/i.test(p.sub)) return 'proxy';
    if (/storage/i.test(p.sub)) return 'storage';
    if (/audio/i.test(p.sub)) return 'audio';
    return 'utility';
  }
  return p.type;
}
function sampleTree(pid, withPrivate) {
  return new Promise((resolve) => {
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SAMPLER, '-Root', String(pid)];
    if (withPrivate) args.push('-Private');
    execFile('powershell.exe', args, { encoding: 'utf8', windowsHide: true, timeout: 30000 }, (err, stdout) => {
      if (err) return resolve({ error: String(err.message || err) });
      try {
        const j = JSON.parse(stdout);
        const procs = (Array.isArray(j.procs) ? j.procs : [j.procs]).filter(Boolean).map((p) => ({ ...p, kind: typeOf(p) }));
        resolve({ t: j.t, procs });
      } catch (e) { resolve({ error: 'parse: ' + e.message }); }
    });
  });
}
function byKind(procs, field) {
  const out = { total: 0 };
  for (const p of procs) {
    const v = p[field];
    if (typeof v !== 'number') continue;
    out[p.kind] = (out[p.kind] || 0) + v;
    out.total += v;
  }
  return out;
}

// ---------- one run ----------
function runOnce(o, name, sc, times) {
  return new Promise((resolve) => {
    const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'owc-perf-'));
    fs.writeFileSync(path.join(ud, 'settings.json'), JSON.stringify({ ...BASE_SETTINGS, ...(sc.settings || {}) }, null, 2));
    const electron = o.electron || require(path.join(ROOT, 'node_modules', 'electron'));
    const extraEnv = {};
    for (const kv of o.env) { const i = kv.indexOf('='); if (i > 0) extraEnv[kv.slice(0, i)] = kv.slice(i + 1); }
    const env = {
      ...process.env, ...extraEnv, ...(sc.env || {}),
      WC_USER_DATA: ud, WC_LANG: 'en', WC_SMOKE: HOOK,
      WC_PERF: JSON.stringify({ scenario: name, times, startupCdp: !o.noStartupCdp }),
    };
    delete env.ELECTRON_RUN_AS_NODE;
    const args = [o.app, ...o.args.split(/\s+/).filter(Boolean)];
    const run = { scenario: name, spawn: Date.now(), samples: {}, errors: [] };
    const child = spawn(electron, args, { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: false });
    run.pid = child.pid;
    const pending = [];
    let buf = '';
    const onLine = (line) => {
      const i = line.indexOf('PERF ');
      if (i < 0) return;
      let m;
      try { m = JSON.parse(line.slice(i + 5)); } catch { return; }
      if (m.type === 'ready') { run.T0 = m.T0; run.startup = m.startup; run.procs0 = m.procs; run.display = m.display; }
      else if (m.type === 'sample') {
        const label = m.label;
        pending.push(sampleTree(child.pid, true).then((s) => { run.samples[label] = s; }));
      } else if (m.type === 'internal') { run.internal = m.internal; run.visibility = m.visibility; }
      else if (m.type === 'counts') run.counts = m.counts;
      else if (m.type === 'cdp') run.cdp = m.cdp;
      else if (m.type === 'userdata') run.userData = { bytes: m.bytes, files: m.files, entries: m.entries };
      else if (m.type === 'mainmark') (run.mainMarks = run.mainMarks || {})[m.k] = m.now; // prototypes that instrument main.js
      else if (m.type === 'error' || m.type === 'warn') run.errors.push(m.msg);
    };
    child.stdout.on('data', (d) => { buf += d; let k; while ((k = buf.indexOf('\n')) >= 0) { onLine(buf.slice(0, k)); buf = buf.slice(k + 1); } });
    child.stderr.on('data', () => {});
    const killer = setTimeout(() => { run.errors.push('timeout: killed'); try { child.kill(); } catch { /* gone */ } }, (times.cdpAt + times.cdpWindow + 90) * 1000);
    child.on('exit', async (code) => {
      clearTimeout(killer);
      run.exit = code;
      await Promise.all(pending);
      // Chromium's child processes can hold profile files for a moment after the browser exits: retry.
      try { fs.rmSync(ud, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch { /* left in %TEMP% */ }
      resolve(run);
    });
  });
}

// Packaged build: no hook (WC_SMOKE is dev-only), so timing is driven from here and everything is sampled from outside.
const PACKAGED_OK = new Set(['default', 'seconds-off', 'compact', 'vertical', 'planner', 'cities12', 'transparent']);
function runPackaged(o, name, sc, times) {
  return new Promise((resolve) => {
    const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'owc-perf-pkg-'));
    fs.writeFileSync(path.join(ud, 'settings.json'), JSON.stringify({ ...BASE_SETTINGS, language: 'en', ...(sc.settings || {}) }, null, 2));
    const env = { ...process.env, ...(sc.env || {}) };
    for (const kv of o.env) { const i = kv.indexOf('='); if (i > 0) env[kv.slice(0, i)] = kv.slice(i + 1); }
    delete env.ELECTRON_RUN_AS_NODE; delete env.WC_SMOKE; delete env.WC_USER_DATA;
    const run = { scenario: name, spawn: Date.now(), samples: {}, errors: [], packaged: true };
    const child = spawn(o.packaged, ['--user-data-dir=' + ud, ...o.args.split(/\s+/).filter(Boolean)], { env, stdio: 'ignore' });
    run.pid = child.pid;
    let exited = false;
    child.on('exit', (code) => { exited = true; run.exit = code; });
    (async () => {
      const boot = 3000; // no boot signal from a packaged build: give it 3 s, then start the clock
      run.T0 = run.spawn + boot;
      const at = (s) => sleep(Math.max(0, run.T0 + s * 1000 - Date.now()));
      await at(times.mem1); if (!exited) run.samples.mem1 = await sampleTree(child.pid, true);
      await at(times.mem2); if (!exited) run.samples.mem2 = await sampleTree(child.pid, true);
      if (exited) run.errors.push('exited early (code ' + run.exit + ')');
      try { require('child_process').execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ }
      await sleep(800);
      try { fs.rmSync(ud, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch { /* left in %TEMP% */ }
      resolve(run);
    })();
  });
}

// ---------- per-run numbers ----------
function digest(run, times) {
  const d = { scenario: run.scenario, ok: !!run.T0 && (run.packaged ? !!run.samples.mem2 : !!run.cdp), errors: run.errors, visibility: run.visibility, exit: run.exit, display: run.display };
  for (const label of ['mem1', 'mem2']) {
    const s = run.samples[label];
    if (!s || s.error) continue;
    d[label] = { pws: byKind(s.procs, 'pws'), priv: byKind(s.procs, 'priv'), ws: byKind(s.procs, 'ws'), procs: s.procs.length, kinds: s.procs.map((p) => p.kind) };
  }
  // Idle CPU window from app.getAppMetrics() cumulative CPU seconds (per process, exact window).
  const a = run.internal && run.internal.cpuA, b = run.internal && run.internal.cpuB;
  if (a && b) {
    const win = (b.t - a.t) / 1000;
    const cpu = { total: 0 };
    for (const p of b.procs) {
      const q = a.procs.find((x) => x.pid === p.pid);
      if (!q || p.cpuSec == null || q.cpuSec == null) continue;
      const pct = ((p.cpuSec - q.cpuSec) / win) * 100;
      cpu[p.type] = (cpu[p.type] || 0) + pct;
      cpu.total += pct;
    }
    d.cpu = cpu; d.cpuWindow = win;
  }
  // Cross-check from outside (Win32 kernel+user time) between the two samples.
  const s1 = run.samples.mem1, s2 = run.samples.mem2;
  if (s1 && s2 && !s1.error && !s2.error) {
    const win = (s2.t - s1.t) / 1000;
    let tot = 0;
    const byK = { total: 0 };
    for (const p of s2.procs) {
      const q = s1.procs.find((x) => x.pid === p.pid);
      if (!q) continue;
      const sec = (p.cpu100ns - q.cpu100ns) / 1e7;
      tot += sec;
      byK[p.kind] = (byK[p.kind] || 0) + (sec / win) * 100;
    }
    byK.total = (tot / win) * 100;
    d.cpuExternal = byK.total; d.cpuExternalWindow = win; d.cpuExternalByKind = byK;
    if (!d.cpu) { d.cpu = byK; d.cpuWindow = win; d.cpuSource = 'external'; }
  }
  if (run.startup) {
    const s = run.startup, rel = (v) => (typeof v === 'number' ? v - run.spawn : null);
    d.startup = {
      browserProc: rel(s.created), mainReady: rel(s.hook), gpuProc: rel(s['proc:gpu']), rendererProc: rel(s['proc:renderer']),
      navStart: rel(s.navStart), responseEnd: rel(s.responseEnd), dcl: rel(s.dcl), firstPaint: rel(s.firstPaint), fcp: rel(s.fcp),
      boot: rel(s.boot), bootFrame: rel(s.bootFrame), load: rel(s.load), readyToShow: rel(s.readyToShow), cdp: s.cdp,
    };
    if (run.mainMarks) d.startup.main = Object.fromEntries(Object.entries(run.mainMarks).map(([k, v]) => [k, v - run.spawn]));
  }
  if (run.cdp) d.cdp = run.cdp;
  if (run.counts) d.counts = run.counts;
  if (run.userData) d.userData = run.userData;
  return d;
}

function summarize(digests) {
  const pick = (f) => stat(digests.map((d) => { try { return f(d); } catch { return null; } }));
  const kinds = new Set();
  for (const d of digests) for (const k of ['mem1', 'mem2']) if (d[k]) for (const x of Object.keys(d[k].pws)) kinds.add(x);
  const mem = {};
  for (const label of ['mem1', 'mem2']) {
    mem[label] = {};
    for (const field of ['pws', 'priv', 'ws']) {
      mem[label][field] = {};
      for (const k of kinds) mem[label][field][k] = pick((d) => MB(d[label][field][k]));
    }
  }
  const cpuKinds = new Set();
  for (const d of digests) if (d.cpu) for (const k of Object.keys(d.cpu)) cpuKinds.add(k);
  const cpu = {};
  for (const k of cpuKinds) cpu[k] = pick((d) => d.cpu[k] || 0);
  const startup = {};
  for (const k of ['browserProc', 'mainReady', 'gpuProc', 'rendererProc', 'navStart', 'responseEnd', 'dcl', 'firstPaint', 'fcp', 'boot', 'bootFrame', 'load']) startup[k] = pick((d) => d.startup[k]);
  const cdp = {};
  for (const k of ['jsHeapUsed', 'jsHeapTotal', 'jsHeapUsedAfterGC', 'nodes', 'nodesAfterGC', 'elements', 'listeners', 'layers', 'drawingLayers', 'layerEvents', 'recalcPerSec', 'layoutPerSec', 'recalcMsPerSec', 'layoutMsPerSec', 'scriptMsPerSec', 'taskMsPerSec', 'anims']) {
    cdp[k] = pick((d) => d.cdp[k]);
  }
  return {
    runs: digests.length, ok: digests.filter((d) => d.ok).length,
    procs: pick((d) => d.mem2.procs), kinds: [...kinds].filter((k) => k !== 'total'),
    mem, cpu, cpuExternal: pick((d) => d.cpuExternal), startup, cdp,
    counts: { ipcSend: pick((d) => d.counts.ipcSend), ipcInvoke: pick((d) => d.counts.ipcInvoke), settingsWrites: pick((d) => d.counts.settingsWrites) },
    visibility: [...new Set(digests.map((d) => d.visibility))],
    displays: [...new Set(digests.filter((d) => d.display).map((d) => `${d.display.scale}x ${d.display.hz} Hz ${d.display.size.width}x${d.display.size.height}`))],
    runningAnims: [...new Set(digests.flatMap((d) => (d.cdp && d.cdp.runningAnims) || []))],
    userDataMB: pick((d) => MB(d.userData.bytes)),
  };
}

// ---------- report ----------
const f1 = (s, dig = 1) => (s ? (s.n > 1 ? `${s.median.toFixed(dig)} (${s.min.toFixed(dig)}-${s.max.toFixed(dig)})` : s.median.toFixed(dig)) : 'n/a');
const f0 = (s) => f1(s, 0);
function markdown(meta, summary) {
  const L = [];
  L.push(`# Open World Clock perf: ${meta.label}`, '');
  L.push(`${meta.date} | Electron ${meta.electronVersion} | ${meta.cpu} (${meta.cores} threads) | Windows ${os.release()} | app ${meta.app}`);
  L.push(`Runs per scenario: ${meta.runs}. Cells: median (min-max). Memory in MB, sampled from outside ${meta.times.mem2} s after the scenario was applied.`);
  L.push(`CPU: % of one core over the ${meta.times.cpuA}-${meta.times.cpuB} s window (sum over processes, app.getAppMetrics cumulative CPU). CDP metrics over ${meta.times.cdpWindow} s at ${meta.times.cdpAt} s.`);
  const disp = [...new Set(Object.values(summary).flatMap((x) => x.displays || []))];
  if (disp.length) L.push(`Display under the window: ${disp.join('; ')} (refresh rate multiplies animation frames).`);
  if (meta.args || meta.env.length) L.push(`Extra: args \`${meta.args}\` env \`${meta.env.join(' ')}\``);
  L.push('');
  L.push('## Memory and CPU', '');
  L.push('| scenario | procs | private WS (Task Manager) | private bytes (commit) | working set | CPU % of one core | renderer | GPU | browser | other |');
  L.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const [name, s] of Object.entries(summary)) {
    const m = s.mem.mem2;
    const other = s.cpu.total && s.cpu.renderer && s.cpu.gpu && s.cpu.browser ? { median: s.cpu.total.median - s.cpu.renderer.median - s.cpu.gpu.median - s.cpu.browser.median, n: 1 } : null;
    L.push(`| ${name} | ${f0(s.procs)} | ${f1(m.pws.total)} | ${f1(m.priv.total)} | ${f1(m.ws.total)} | ${f1(s.cpu.total, 2)} | ${f1(s.cpu.renderer, 2)} | ${f1(s.cpu.gpu, 2)} | ${f1(s.cpu.browser, 2)} | ${other ? other.median.toFixed(2) : 'n/a'} |`);
  }
  L.push('', `## Memory by process type at ${meta.times.mem2} s (private WS / private bytes, MB, medians)`, '');
  const kinds = [...new Set(Object.values(summary).flatMap((s) => s.kinds))];
  L.push(`| scenario | ${kinds.join(' | ')} |`);
  L.push(`|---|${kinds.map(() => '---').join('|')}|`);
  for (const [name, s] of Object.entries(summary)) {
    L.push(`| ${name} | ${kinds.map((k) => { const a = s.mem.mem2.pws[k], b = s.mem.mem2.priv[k]; return a || b ? `${a ? a.median.toFixed(1) : '-'} / ${b ? b.median.toFixed(1) : '-'}` : '-'; }).join(' | ')} |`);
  }
  L.push('', `## Memory at ${meta.times.mem1} s vs ${meta.times.mem2} s (private WS total / private bytes total, MB)`, '');
  L.push(`| scenario | ${meta.times.mem1} s | ${meta.times.mem2} s |`, '|---|---|---|');
  for (const [name, s] of Object.entries(summary)) L.push(`| ${name} | ${f1(s.mem.mem1.pws.total)} / ${f1(s.mem.mem1.priv.total)} | ${f1(s.mem.mem2.pws.total)} / ${f1(s.mem.mem2.priv.total)} |`);
  L.push('', '## Renderer (CDP)', '');
  L.push('| scenario | JS heap used MB | heap used after GC | heap total | DOM nodes | elements | listeners | layers | recalc/s | layout/s | recalc ms/s | layout ms/s | script ms/s | task ms/s | running anims | visibility |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const [name, s] of Object.entries(summary)) {
    const c = s.cdp, mb = (x) => (x ? { ...x, median: MB(x.median), min: MB(x.min), max: MB(x.max) } : x);
    L.push(`| ${name} | ${f1(mb(c.jsHeapUsed), 2)} | ${f1(mb(c.jsHeapUsedAfterGC), 2)} | ${f1(mb(c.jsHeapTotal), 2)} | ${f0(c.nodes)} | ${f0(c.elements)} | ${f0(c.listeners)} | ${f0(c.layers)} | ${f1(c.recalcPerSec, 2)} | ${f1(c.layoutPerSec, 2)} | ${f1(c.recalcMsPerSec, 2)} | ${f1(c.layoutMsPerSec, 2)} | ${f1(c.scriptMsPerSec, 2)} | ${f1(c.taskMsPerSec, 2)} | ${f0(c.anims)} | ${s.visibility.join(',')} |`);
  }
  L.push('', '## Cold start (ms after spawn)', '');
  L.push('| scenario | browser proc | main ready (window+tray) | GPU proc | renderer proc | nav start | DCL | first paint | FCP | wc:boot | first frame after boot | did-finish-load |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const [name, s] of Object.entries(summary)) {
    const t = s.startup;
    L.push(`| ${name} | ${f0(t.browserProc)} | ${f0(t.mainReady)} | ${f0(t.gpuProc)} | ${f0(t.rendererProc)} | ${f0(t.navStart)} | ${f0(t.dcl)} | ${f0(t.firstPaint)} | ${f0(t.fcp)} | ${f0(t.boot)} | ${f0(t.bootFrame)} | ${f0(t.load)} |`);
  }
  L.push('', '## Idle activity counters (T0 to end of CPU window)', '');
  L.push(`| scenario | IPC send | IPC invoke | settings writes | profile folder MB | cross-check CPU % (outside, ${meta.times.mem1}-${meta.times.mem2} s) |`, '|---|---|---|---|---|---|');
  for (const [name, s] of Object.entries(summary)) L.push(`| ${name} | ${f0(s.counts.ipcSend)} | ${f0(s.counts.ipcInvoke)} | ${f0(s.counts.settingsWrites)} | ${f1(s.userDataMB)} | ${f1(s.cpuExternal, 2)} |`);
  const anims = Object.entries(summary).filter(([, s]) => s.runningAnims.length);
  if (anims.length) {
    L.push('', '## Animations still running at the CDP sample', '');
    for (const [name, s] of anims) L.push(`- ${name}: ${s.runningAnims.join(', ')}`);
  }
  return L.join('\n') + '\n';
}

// ---------- main ----------
// "label|app=<dir>|args=<switches>|env=K=V,K2=V2|electron=<exe>|packaged=<exe>" (every part but the label is optional)
function parseVariant(spec, o) {
  const [label, ...parts] = spec.split('|');
  const v = { label: label.trim(), app: o.app, args: o.args, env: [...o.env], electron: o.electron, packaged: o.packaged };
  for (const part of parts) {
    const i = part.indexOf('=');
    if (i < 0) throw new Error(`--variant ${spec}: expected key=value, got "${part}"`);
    const k = part.slice(0, i).trim(), val = part.slice(i + 1);
    if (k === 'app') v.app = path.resolve(val);
    else if (k === 'args') v.args = val;
    else if (k === 'env') v.env = [...o.env, ...val.split(',').filter(Boolean)];
    else if (k === 'electron') v.electron = path.resolve(val);
    else if (k === 'packaged') v.packaged = path.resolve(val);
    else throw new Error(`--variant ${spec}: unknown key "${k}"`);
  }
  if (!v.label) throw new Error(`--variant ${spec}: missing label`);
  return v;
}

(async () => {
  const o = parseArgs(process.argv.slice(2));
  if (o.help || o.list) {
    console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 20).join('\n').replace(/^\/\/ ?/gm, ''));
    console.log('\nScenarios:');
    for (const [k, v] of Object.entries(SCENARIOS)) console.log(`  ${k.padEnd(12)} ${v.desc}`);
    return;
  }
  if (process.platform !== 'win32') throw new Error('measure.js samples Windows processes (PowerShell/CIM); run it on Windows.');
  const names = o.scenarios === 'all' ? Object.keys(SCENARIOS) : o.scenarios.split(',').map((s) => s.trim()).filter(Boolean);
  for (const n of names) if (!SCENARIOS[n]) throw new Error(`unknown scenario "${n}" (use --list)`);
  // Variants (A/B): every variant runs each scenario once per round, interleaved, so background load hits all alike.
  const variants = o.variants.length ? o.variants.map((spec) => parseVariant(spec, o)) : [{ label: o.label, app: o.app, args: o.args, env: o.env, electron: o.electron, packaged: o.packaged }];
  for (const v of variants) {
    if (!v.packaged) continue;
    if (/open world clock\.exe$/i.test(v.packaged)) throw new Error('--packaged: copy win-unpacked and rename the exe first, so the installed app is never touched or matched');
    for (const n of names) if (!PACKAGED_OK.has(n)) throw new Error(`scenario "${n}" needs the dev hook; packaged runs support ${[...PACKAGED_OK].join(', ')}`);
  }
  const times = o.quick ? { mem1: 4, cpuA: 4, cpuB: 16, mem2: 16, cdpAt: 18, cdpWindow: 4 } : { mem1: 10, cpuA: 10, cpuB: 70, mem2: 70, cdpAt: 72, cdpWindow: 10 };
  const runs = o.quick ? 1 : o.runs;
  const date = new Date().toISOString();
  const metaOf = (v) => {
    const electronPath = v.packaged || v.electron || require(path.join(ROOT, 'node_modules', 'electron'));
    let electronVersion = '?';
    try { electronVersion = fs.readFileSync(path.join(path.dirname(electronPath), 'version'), 'utf8').trim(); } catch { /* packaged copy */ }
    return {
      label: v.label, date, app: v.packaged ? '(packaged) ' + v.packaged : v.app, electron: electronPath, electronVersion,
      cpu: (os.cpus()[0] || {}).model, cores: os.cpus().length, runs, times, args: v.args, env: v.env, scenarios: names,
      group: variants.length > 1 ? variants.map((x) => x.label) : undefined,
    };
  };
  const metas = variants.map(metaOf);
  const per = Math.round(names.length * runs * variants.length * (times.cdpAt + times.cdpWindow + 14 + o.gap) / 60);
  console.log(`perf: ${names.length} scenario(s) x ${runs} run(s) x ${variants.length} variant(s), ~${per} min. ${variants.map((v) => v.label + '=' + (v.packaged || v.app)).join(' ')}`);
  const raw = variants.map(() => ({}));
  const tag = variants.length > 1 ? variants.map((v) => v.label).join('-vs-').slice(0, 60) : variants[0].label;
  for (let r = 0; r < runs; r++) {
    for (const n of names) {
      for (let vi = 0; vi < variants.length; vi++) {
        const v = variants[vi], ov = { ...o, ...v };
        const t = Date.now();
        const run = v.packaged ? await runPackaged(ov, n, SCENARIOS[n], times) : await runOnce(ov, n, SCENARIOS[n], times);
        const d = digest(run, times);
        (raw[vi][n] = raw[vi][n] || []).push({ digest: d, run });
        const m = d.mem2;
        console.log(`  [${r + 1}/${runs}] ${variants.length > 1 ? v.label.padEnd(14) + ' ' : ''}${n.padEnd(12)} ${d.ok ? 'ok ' : 'BAD'} pws=${m ? MB(m.pws.total).toFixed(1) : '?'}MB priv=${m ? MB(m.priv.total).toFixed(1) : '?'}MB cpu=${d.cpu ? d.cpu.total.toFixed(2) : '?'}% boot=${d.startup && d.startup.boot != null ? Math.round(d.startup.boot) : '?'}ms (${Math.round((Date.now() - t) / 1000)}s)${d.ok ? '' : ' exit=' + run.exit}${d.errors.length ? ' errors: ' + d.errors.join('; ').slice(0, 200) : ''}`);
        // Keep a partial file so a long session can be inspected (or salvaged) before it ends.
        try { fs.mkdirSync(o.out, { recursive: true }); fs.writeFileSync(path.join(o.out, `${tag}.partial.json`), JSON.stringify(variants.map((x, i) => ({ meta: metas[i], runs: Object.fromEntries(Object.entries(raw[i]).map(([k, w]) => [k, w.map((y) => y.digest)])) })))); } catch { /* best effort */ }
        if (o.gap) await sleep(o.gap * 1000);
      }
    }
  }
  try { fs.unlinkSync(path.join(o.out, `${tag}.partial.json`)); } catch { /* none */ }
  fs.mkdirSync(o.out, { recursive: true });
  const stamp = date.replace(/[:.]/g, '-').slice(0, 19);
  let mdAll = '';
  for (let vi = 0; vi < variants.length; vi++) {
    const summary = {};
    for (const n of names) summary[n] = summarize(raw[vi][n].map((x) => x.digest));
    const base = path.join(o.out, `${variants[vi].label}-${stamp}`);
    fs.writeFileSync(base + '.json', JSON.stringify({ meta: metas[vi], summary, runs: Object.fromEntries(Object.entries(raw[vi]).map(([k, w]) => [k, w.map((x) => x.digest)])) }, null, 1));
    const md = markdown(metas[vi], summary);
    fs.writeFileSync(base + '.md', md);
    mdAll += md + '\n';
    console.log(`wrote ${base}.json and .md`);
  }
  console.log('\n' + mdAll);
  if (variants.length > 1) console.log(`compare: node scripts/perf/compare.js ${variants.map((v) => path.join(o.out, `${v.label}-${stamp}.json`)).join(' ')}`);
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
