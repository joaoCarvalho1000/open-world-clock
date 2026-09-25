// Profile hook: loaded by src/main.js through WC_SMOKE (dev runs only), driven by scripts/perf/profile.js.
// Writes a Chromium trace of every process (contentTracing), a renderer CPU profile and a heap snapshot summary
// into the folder given by profile.js. Modes: idle (default), startup, minute. Reports as "PERF {json}" lines on stdout.
'use strict';

module.exports = (win, app) => {
  const fs = require('fs');
  const path = require('path');
  const { contentTracing } = require('electron');
  const cfg = JSON.parse(process.env.WC_PERF || '{}');
  const outDir = cfg.out;
  const wc = win.webContents;
  const dbg = wc.debugger;
  const emit = (type, data = {}) => { try { process.stdout.write('PERF ' + JSON.stringify({ type, now: Date.now(), ...data }) + '\n'); } catch { /* closed */ } };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code, true);
  const cdp = (m, p) => dbg.sendCommand(m, p || {});
  try { win.setIgnoreMouseEvents(true); } catch { /* click-through: a stray mouse would add hover work */ }

  const IDLE_CATS = [
    'toplevel', 'toplevel.flow', 'devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame',
    'blink', 'cc', 'viz', 'gpu', 'v8', 'ipc', 'mojom', 'renderer.scheduler', 'disabled-by-default-v8.cpu_profiler', 'electron', 'input', 'benchmark', 'base',
  ];
  const STARTUP_CATS = [
    'toplevel', 'devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink', 'loading', 'navigation', 'v8', 'v8.compile', 'disabled-by-default-v8.compile',
    'disabled-by-default-v8.cpu_profiler', 'blink.user_timing', 'ipc', 'electron', 'gpu', 'viz', 'cc', 'netlog', 'disabled-by-default-netlog', 'mojom', 'startup', 'browser', 'base',
  ];

  let startupProfiling = false;
  async function startupTrace() {
    // Started as early as the hook runs (main process ready, window created, page load just requested).
    // The CPU profiler is started on a CDP session opened before the renderer exists; DevTools carries the session
    // (and the started profiler) over to the renderer when the page commits, so the profile covers script evaluation.
    try {
      dbg.attach('1.3');
      cdp('Profiler.enable').then(() => cdp('Profiler.setSamplingInterval', { interval: 100 })).then(() => cdp('Profiler.start')).then(() => { startupProfiling = true; }).catch((e) => emit('warn', { msg: 'profiler: ' + e.message }));
    } catch (e) { emit('warn', { msg: 'attach: ' + e.message }); }
    await contentTracing.startRecording({ included_categories: STARTUP_CATS, excluded_categories: ['*'] });
  }
  const startupP = cfg.mode === 'startup' ? startupTrace() : Promise.resolve();

  const ACTIONS = {
    map: async () => { await js(`document.getElementById('btnMap').click(); true`); },
    hidden: async () => { win.hide(); },
    'seconds-off': async () => { await js(`(async () => { await window.wc.setSettings({ showSeconds: false }); return true; })()`); },
    planner: async () => { await js(`document.getElementById('btnPlanner').click(); true`); },
    // Slider input at 30 Hz, like dragging the converter slider (active use, not idle).
    scrub: async () => { await js(`(() => { const s = document.getElementById('convSlider'); let v = 0; window.__perfScrub = setInterval(() => { v = (v + 15) % 1440; s.value = String(v); s.dispatchEvent(new Event('input', { bubbles: true })); }, 33); return true; })()`); },
  };

  async function heapSummary(file) {
    const chunks = [];
    const onMsg = (_e, method, params) => { if (method === 'HeapProfiler.addHeapSnapshotChunk') chunks.push(params.chunk); };
    dbg.on('message', onMsg);
    await cdp('HeapProfiler.enable');
    await cdp('HeapProfiler.collectGarbage');
    await cdp('HeapProfiler.takeHeapSnapshot', { reportProgress: false, captureNumericValue: false });
    dbg.removeListener('message', onMsg);
    const text = chunks.join('');
    fs.writeFileSync(file, text);
    // Aggregate self size by node type and constructor/name.
    const snap = JSON.parse(text);
    const meta = snap.snapshot.meta;
    const F = meta.node_fields, N = F.length, types = meta.node_types[0];
    const iType = F.indexOf('type'), iName = F.indexOf('name'), iSize = F.indexOf('self_size');
    const nodes = snap.nodes, strings = snap.strings;
    const byType = {}, byName = {};
    let total = 0;
    for (let i = 0; i < nodes.length; i += N) {
      const t = types[nodes[i + iType]], size = nodes[i + iSize];
      let name = strings[nodes[i + iName]];
      if (t === 'string' || t === 'concatenated string' || t === 'sliced string') name = '(string)';
      else if (t === 'code') name = '(code) ' + (name.split(' ')[0] || '');
      else if (t === 'array') name = '(array) ' + name;
      else if (t === 'hidden') name = '(hidden) ' + name;
      else if (t === 'closure') name = '(closure)';
      else if (t === 'number') name = '(number)';
      else if (t === 'native') name = '(native) ' + name.replace(/ \/ .*/, '');
      else if (t === 'object shape') name = '(shape)';
      total += size;
      byType[t] = (byType[t] || 0) + size;
      const k = name.slice(0, 80);
      byName[k] = byName[k] || { size: 0, count: 0 };
      byName[k].size += size; byName[k].count++;
    }
    const top = Object.entries(byName).sort((a, b) => b[1].size - a[1].size).slice(0, 40).map(([name, v]) => ({ name, ...v }));
    return { total, nodeCount: nodes.length / N, byType, top };
  }

  wc.once('did-finish-load', async () => {
    try {
      await startupP;
      await sleep(cfg.mode === 'startup' ? 2500 : 4000);
      if (cfg.mode === 'startup') {
        const file = path.join(outDir, 'startup-trace.json');
        await contentTracing.stopRecording(file);
        emit('trace', { file });
        try {
          const { profile } = await cdp('Profiler.stop');
          const profFile = path.join(outDir, 'startup.cpuprofile');
          fs.writeFileSync(profFile, JSON.stringify(profile));
          emit('profile', { file: profFile, started: startupProfiling });
        } catch (e) { emit('warn', { msg: 'profiler stop: ' + e.message }); }
        emit('done');
        return setTimeout(() => app.exit(0), 200);
      }
      const act = ACTIONS[cfg.scenario];
      if (act) await act();
      await sleep(4000);
      if (cfg.mode === 'minute') {
        // Renderer CPU profile across one minute boundary (the once-a-minute full render and its animations).
        const som = () => (Date.now() % 60000) / 1000;
        dbg.attach('1.3');
        await cdp('Profiler.enable');
        await cdp('Profiler.setSamplingInterval', { interval: 50 });
        await sleep(((57 - som()) + 60) % 60 * 1000);
        await cdp('Profiler.start');
        await sleep(6000);
        const { profile } = await cdp('Profiler.stop');
        const profFile = path.join(outDir, `cpu-minute-${cfg.scenario || 'default'}.cpuprofile`);
        fs.writeFileSync(profFile, JSON.stringify(profile));
        emit('profile', { file: profFile });
        emit('done');
        return setTimeout(() => app.exit(0), 200);
      }
      const dur = (cfg.duration || 30) * 1000;
      // 1. trace of all processes (no CDP attached, so DevTools adds nothing to what is recorded)
      await contentTracing.startRecording({ included_categories: IDLE_CATS, excluded_categories: ['*'] });
      await sleep(dur);
      const traceFile = path.join(outDir, `trace-${cfg.scenario || 'default'}.json`);
      await contentTracing.stopRecording(traceFile);
      emit('trace', { file: traceFile });
      // 2. renderer JS CPU profile
      dbg.attach('1.3');
      await cdp('Profiler.enable');
      await cdp('Profiler.setSamplingInterval', { interval: 200 });
      await cdp('Profiler.start');
      await sleep(dur);
      const { profile } = await cdp('Profiler.stop');
      const profFile = path.join(outDir, `cpu-${cfg.scenario || 'default'}.cpuprofile`);
      fs.writeFileSync(profFile, JSON.stringify(profile));
      emit('profile', { file: profFile });
      // 3. heap snapshot
      if (cfg.heap !== false) {
        const heapFile = path.join(outDir, `heap-${cfg.scenario || 'default'}.heapsnapshot`);
        const summary = await heapSummary(heapFile);
        fs.writeFileSync(heapFile.replace(/\.heapsnapshot$/, '.summary.json'), JSON.stringify(summary, null, 1));
        emit('heap', { file: heapFile, total: summary.total });
      }
      try { dbg.detach(); } catch { /* ignore */ }
    } catch (e) {
      emit('error', { msg: String(e && e.stack || e) });
    }
    emit('done');
    setTimeout(() => app.exit(0), 200);
  });
};
