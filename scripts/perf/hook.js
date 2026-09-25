// Perf hook: loaded by src/main.js through WC_SMOKE (dev/unpacked runs only, like test/deep.js) and driven by
// scripts/perf/measure.js. Never used by the shipped app. It reports on stdout as "PERF {json}" lines.
//
// Timeline of one run (seconds after the scenario is applied, T0; see measure.js for the defaults):
//   boot         the startup marks are read through a CDP script injected before the page loads, then CDP detaches
//   T0           scenario applied (hide, minimize, open the map, start scrubbing, ...), "ready" is emitted
//   T0+mem1      "sample" event: measure.js samples the process tree from outside (memory, CPU seconds)
//   T0+cpuA..B   idle CPU window: cumulative CPU seconds per process from app.getAppMetrics() at both ends.
//                60 s by default, so it always holds exactly one minute boundary (the full render and its
//                transitions happen once a minute): the number is a true steady-state average.
//   T0+mem2      second "sample" event
//   T0+cdpAt     CDP attaches again: Performance.getMetrics deltas over cdpWindow (placed between two minute
//                boundaries, so it shows the per-second steady state), heap, DOM, listeners, layers
// Settings writes and IPC messages are counted between T0 and T0+cpuB.
'use strict';

module.exports = (win, app) => {
  const fs = require('fs');
  const path = require('path');
  const { ipcMain } = require('electron');
  const cfg = JSON.parse(process.env.WC_PERF || '{}');
  const T = { mem1: 10, cpuA: 10, cpuB: 70, mem2: 70, cdpAt: 72, cdpWindow: 10, ...(cfg.times || {}) };
  const wc = win.webContents;
  const dbg = wc.debugger;
  const emit = (type, data = {}) => { try { process.stdout.write('PERF ' + JSON.stringify({ type, now: Date.now(), ...data }) + '\n'); } catch { /* closed pipe */ } };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code, true);
  const cdp = (method, params) => dbg.sendCommand(method, params || {});

  const marks = { created: typeof process.getCreationTime === 'function' ? process.getCreationTime() : null, hook: Date.now() };
  // Click-through: a stray mouse over the always-on-top test window would add hover transitions (or a click on
  // hide/quit would end the run). Synthetic events from the scenarios still reach the page.
  if (cfg.clickThrough !== false) { try { win.setIgnoreMouseEvents(true); } catch { /* ignore */ } }
  win.once('ready-to-show', () => { marks.readyToShow = Date.now(); });
  wc.once('dom-ready', () => { marks.domReady = Date.now(); });

  // Startup marks from inside the page: wc:boot (first render done), the first frame after it, paint timing.
  const INJECT = `(() => {
    const P = window.__perf = { paint: {} };
    document.addEventListener('wc:boot', () => {
      P.boot = performance.now();
      requestAnimationFrame(() => { P.bootRaf = performance.now(); setTimeout(() => { P.bootFrame = performance.now(); }, 0); });
    }, { once: true });
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) P.paint[e.name] = e.startTime; }).observe({ type: 'paint', buffered: true }); } catch (e) {}
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) P.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) {}
  })();`;
  let startupCdp = cfg.startupCdp !== false;
  if (startupCdp) {
    try {
      dbg.attach('1.3');
      // Page.enable first: without it the script is not injected into the navigation already in flight.
      cdp('Page.enable').catch(() => {});
      cdp('Page.addScriptToEvaluateOnNewDocument', { source: INJECT }).catch((e) => emit('warn', { msg: 'inject: ' + e.message }));
    } catch (e) { startupCdp = false; emit('warn', { msg: 'attach: ' + e.message }); }
  }

  // Counters for the idle window.
  const counts = { ipcSend: 0, ipcInvoke: 0, settingsWrites: 0 };
  let counting = false;
  wc.on('ipc-message', () => { if (counting) counts.ipcSend++; });
  wc.on('ipc-message-sync', () => { if (counting) counts.ipcSend++; });
  try {
    const handlers = ipcMain._invokeHandlers; // private Map channel -> handler (Electron internals, best effort)
    if (handlers && typeof handlers.get === 'function') {
      const get = handlers.get.bind(handlers);
      handlers.get = (k) => { if (counting) counts.ipcInvoke++; return get(k); };
    }
  } catch { /* internals changed: invoke count stays 0 */ }
  const userData = app.getPath('userData');
  // One atomic save touches settings.json.tmp, .bak and settings.json: count bursts, not file events.
  let lastWrite = 0;
  try {
    fs.watch(userData, (_ev, f) => {
      if (!counting || !f || !String(f).startsWith('settings.json')) return;
      const now = Date.now();
      if (now - lastWrite > 150) counts.settingsWrites++;
      lastWrite = now;
    });
  } catch { /* ignore */ }

  const normType = (m) => {
    if (m.type === 'Browser') return 'browser';
    if (m.type === 'GPU') return 'gpu';
    if (m.type === 'Tab') return 'renderer';
    if (m.type === 'Utility') {
      if (/network/i.test(m.serviceName || '')) return 'network';
      if (/proxy_resolver/i.test(m.serviceName || '')) return 'proxy';
      if (/storage/i.test(m.serviceName || '')) return 'storage';
      if (/audio/i.test(m.serviceName || '')) return 'audio';
      return 'utility:' + (m.serviceName || m.name || '?');
    }
    return String(m.type).toLowerCase();
  };
  const metrics = () => app.getAppMetrics().map((m) => ({
    pid: m.pid, type: normType(m), created: m.creationTime,
    cpuSec: m.cpu && typeof m.cpu.cumulativeCPUUsage === 'number' ? m.cpu.cumulativeCPUUsage : null,
    wsKB: m.memory.workingSetSize, privKB: m.memory.privateBytes, peakWsKB: m.memory.peakWorkingSetSize,
  }));

  async function waitFor(fn, timeout, every = 50) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      try { const v = await fn(); if (v) return v; } catch { /* page not ready */ }
      await sleep(every);
    }
    return null;
  }

  // Scenario actions after boot (settings-driven scenarios are seeded by measure.js before launch).
  const scrubCode = `(() => {
    const s = document.getElementById('convSlider'); let v = 0;
    window.__perfScrub = setInterval(() => { v = (v + 15) % 1440; s.value = String(v); s.dispatchEvent(new Event('input', { bubbles: true })); }, 33);
    return true;
  })()`;
  const ACTIONS = {
    hidden: async () => { win.hide(); },
    minimized: async () => { win.minimize(); },
    occluded: async () => { win.setAlwaysOnTop(false); win.setPosition(-32000, -32000); },
    map: async () => { await js(`document.getElementById('btnMap').click(); true`); },
    converting: async () => {
      await js(`(() => { const t = document.getElementById('convTime'); t.value = '9:30'; t.dispatchEvent(new Event('input')); return true; })()`);
    },
    scrub: async () => { await js(scrubCode); },
  };

  async function cdpPhase() {
    const out = {};
    try {
      if (!dbg.isAttached()) dbg.attach('1.3');
      let layers = null, layerEvents = 0;
      dbg.on('message', (_e, method, params) => {
        if (method === 'LayerTree.layerTreeDidChange') {
          layerEvents++;
          if (params && Array.isArray(params.layers)) layers = params.layers;
        }
      });
      // Keep the window clear of a minute boundary (second-of-minute from 2 to 2 + window).
      const som = () => (Date.now() % 60000) / 1000;
      if (T.cdpWindow < 50 && (som() < 1.5 || som() > 58 - T.cdpWindow)) await sleep(((62 - som()) % 60) * 1000);
      await cdp('Performance.enable', { timeDomain: 'timeTicks' });
      await cdp('LayerTree.enable').catch(() => {});
      const get = async () => Object.fromEntries((await cdp('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
      const a = await get();
      await sleep(T.cdpWindow * 1000);
      const b = await get();
      const dt = b.Timestamp - a.Timestamp;
      const rate = (k) => (b[k] - a[k]) / dt;
      out.window = dt;
      out.recalcPerSec = rate('RecalcStyleCount');
      out.layoutPerSec = rate('LayoutCount');
      out.recalcMsPerSec = rate('RecalcStyleDuration') * 1000;
      out.layoutMsPerSec = rate('LayoutDuration') * 1000;
      out.scriptMsPerSec = rate('ScriptDuration') * 1000;
      out.taskMsPerSec = rate('TaskDuration') * 1000;
      out.jsHeapUsed = b.JSHeapUsedSize;
      out.jsHeapTotal = b.JSHeapTotalSize;
      out.nodes = b.Nodes;
      out.layoutObjects = b.LayoutObjects;
      out.listeners = b.JSEventListeners;
      out.documents = b.Documents;
      // A static page commits no frame in the window: nudge one commit to read the layer tree.
      if (!layers) {
        await js(`(() => { const s = document.body.style; s.outlineColor = 'transparent'; requestAnimationFrame(() => { s.outlineColor = ''; }); return true; })()`).catch(() => {});
        await sleep(400);
      }
      out.layerEvents = layerEvents;
      out.layers = layers ? layers.length : null;
      out.drawingLayers = layers ? layers.filter((l) => l.drawsContent).length : null;
      const page = JSON.parse(await js(`JSON.stringify({ elements: document.getElementsByTagName('*').length, visibility: document.visibilityState, cards: document.querySelectorAll('.card[data-zone]').length, anims: document.getAnimations().length, runningAnims: document.getAnimations().filter((a) => a.playState === 'running').map((a) => (a.animationName || a.transitionProperty || (a.effect && a.effect.target && a.effect.target.className) || '?') + '') })`));
      Object.assign(out, page);
      await cdp('HeapProfiler.collectGarbage').catch(() => {});
      const c = await get();
      out.jsHeapUsedAfterGC = c.JSHeapUsedSize;
      out.jsHeapTotalAfterGC = c.JSHeapTotalSize;
      out.nodesAfterGC = c.Nodes;
    } catch (e) { out.error = String(e && e.message || e); }
    try { dbg.detach(); } catch { /* ignore */ }
    return out;
  }

  let started = false;
  async function start() {
    if (started) return;
    started = true;
    try {
      marks.load = Date.now();
      // Boot: the first render emits wc:boot; fall back to "cards are on screen".
      await waitFor(() => js(`!!(window.__perf ? window.__perf.bootFrame : document.querySelector('.card[data-zone] .hm') && document.querySelector('.card[data-zone] .hm').textContent)`), 10000, 25);
      marks.bootSeen = Date.now();
      await sleep(cfg.settle != null ? cfg.settle : 1500);
      const page = JSON.parse(await js(`JSON.stringify({ origin: performance.timeOrigin, perf: window.__perf || null, nav: performance.getEntriesByType('navigation')[0] || null, vis: document.visibilityState })`));
      const abs = (v) => (typeof v === 'number' && v > 0 ? page.origin + v : null);
      const startup = {
        created: marks.created, hook: marks.hook, readyToShow: marks.readyToShow || null, domReady: marks.domReady || null, load: marks.load,
        navStart: page.origin,
        responseEnd: abs(page.nav && page.nav.responseEnd),
        domInteractive: abs(page.nav && page.nav.domInteractive),
        dcl: abs(page.nav && page.nav.domContentLoadedEventEnd),
        loadEvent: abs(page.nav && page.nav.loadEventEnd),
        firstPaint: abs(page.perf && page.perf.paint['first-paint']),
        fcp: abs(page.perf && page.perf.paint['first-contentful-paint']),
        lcp: abs(page.perf && page.perf.lcp),
        boot: abs(page.perf && page.perf.boot),
        bootFrame: abs(page.perf && page.perf.bootFrame),
        cdp: startupCdp,
      };
      const procs0 = metrics();
      for (const p of procs0) startup['proc:' + p.type] = p.created;
      if (startupCdp) { try { dbg.detach(); } catch { /* ignore */ } }

      const act = ACTIONS[cfg.scenario];
      if (act) await act();
      const T0 = Date.now();
      counting = true;
      // Display setup: refresh rate multiplies animation frames, scale factor multiplies pixels per frame.
      let display = null;
      try {
        const { screen } = require('electron');
        const d = screen.getDisplayMatching(win.getBounds());
        display = { scale: d.scaleFactor, hz: d.displayFrequency, size: d.size, count: screen.getAllDisplays().length, primary: screen.getPrimaryDisplay().id === d.id };
      } catch { /* ignore */ }
      emit('ready', { T0, startup, procs: procs0, scenario: cfg.scenario || 'default', display });

      const at = (s) => sleep(Math.max(0, T0 + s * 1000 - Date.now()));
      const internal = {};
      const plan = [
        [T.mem1, 'mem1'], [T.cpuA, 'cpuA'], [T.cpuB, 'cpuB'], [T.mem2, 'mem2'],
      ].sort((x, y) => x[0] - y[0]);
      let vis = null;
      for (const [s, label] of plan) {
        await at(s);
        if (label === 'mem1' || label === 'mem2') emit('sample', { label, T0 });
        internal[label] = { t: Date.now(), procs: metrics() };
        if (label === 'mem1') { try { vis = await js('document.visibilityState'); } catch { /* ignore */ } }
        if (label === 'cpuB') { counting = false; emit('counts', { counts: { ...counts } }); }
      }
      emit('internal', { internal, visibility: vis });
      await at(T.cdpAt);
      const c = await cdpPhase();
      if (cfg.scenario === 'scrub') { try { await js('clearInterval(window.__perfScrub); true'); } catch { /* ignore */ } }
      emit('cdp', { cdp: c });
      // Disk footprint of the profile folder Chromium created.
      let bytes = 0, files = 0;
      const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { files++; try { bytes += fs.statSync(p).size; } catch { /* locked */ } } } };
      try { walk(userData); } catch { /* ignore */ }
      emit('userdata', { bytes, files, entries: fs.readdirSync(userData) });
    } catch (e) {
      emit('error', { msg: String(e && e.stack || e) });
    }
    emit('done');
    setTimeout(() => app.exit(0), 200);
  }
  wc.once('did-finish-load', () => { start(); });
};
