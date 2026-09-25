// Screenshot harness: `npm run shots` (node test/run.js --shots). Drives the real app in a throwaway profile and saves
// PNGs of every layout in light and dark, Windows High Contrast (forced colors, emulated through the DevTools protocol)
// and 200% zoom. Output: WC_SHOTS_DIR, default dist/shots (git-ignored). The list is written to shots.txt there.
module.exports = (w, app) => {
  const fs = require('fs'), path = require('path');
  // Never against the real profile: run.js always points userData at a throwaway folder (WC_USER_DATA).
  if (!process.env.WC_USER_DATA) {
    console.error('shots.js: WC_USER_DATA is not set, so this would run against your real settings. Run it with npm run shots (test/run.js --shots).');
    app.exit(2);
    return;
  }
  const outDir = process.env.WC_SHOTS_DIR || path.resolve(__dirname, '..', 'dist', 'shots');
  fs.mkdirSync(outDir, { recursive: true });
  const log = [];
  const run = (fn, ...args) => w.webContents.executeJavaScript(`(${fn.toString()})(${args.map((a) => JSON.stringify(a)).join(',')})`);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const shot = async (name) => {
    await sleep(450);
    const img = await w.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, `${name}.png`), img.toPNG());
    const s = img.getSize();
    log.push(`${name}.png ${s.width}x${s.height}`);
  };
  const size = async (width, height) => { w.setBounds({ x: 40, y: 40, width, height }); await sleep(200); w.emit('resized'); await sleep(200); };
  const theme = (th) => run((th) => { const o = document.getElementById('optTheme'); o.value = th; o.dispatchEvent(new Event('change')); }, th);
  const layout = async (l) => { await run((l) => document.querySelector(`[data-layout="${l}"]`).click(), l); await sleep(450); };
  const planner = async (on) => { await run((on) => { if (document.getElementById('app').classList.contains('planner-on') !== on) document.getElementById('btnPlanner').click(); }, on); await sleep(400); };
  const map = async (on) => { await run((on) => { if (document.getElementById('app').classList.contains('map-on') !== on) document.getElementById('btnMap').click(); }, on); await sleep(450); };
  const panel = async (on) => { await run((on) => { if (document.getElementById('settingsPanel').hidden === on) document.getElementById(on ? 'btnSettings' : 'panelClose').click(); }, on); await sleep(500); };
  const convert = (time, zone) => run((time, zone) => {
    const t = document.getElementById('convTime'), z = document.getElementById('convZone');
    if (zone && [...z.options].some((o) => o.value === zone)) z.value = zone;
    t.value = time; t.dispatchEvent(new Event('input'));
  }, time, zone);
  const live = () => run(() => document.getElementById('convClear').click());
  // converter on a pinned date (the planner shows that day)
  const convertOn = (time, date, zone) => run((time, date, zone) => {
    const t = document.getElementById('convTime'), d = document.getElementById('convDate'), z = document.getElementById('convZone');
    if (zone && [...z.options].some((o) => o.value === zone)) z.value = zone;
    d.value = date; delete d.dataset.auto; t.value = time; t.dispatchEvent(new Event('input'));
  }, time, date, zone);
  // 12-hour clock with seconds: the seconds sit above AM/PM
  const h12 = async (on) => { await run((on) => { const o = document.getElementById('optHour24'); if (o.checked === on) { o.checked = !on; o.dispatchEvent(new Event('change')); } }, on); await sleep(200); };
  const h12Tour = async (prefix, { all = true, resize = true } = {}) => {
    await h12(true);
    await layout('strip'); if (resize) await size(1160, 250); await shot(`${prefix}-strip-h12`);
    await planner(true); await shot(`${prefix}-planner-h12`); await planner(false); // AM/PM on the 6, 12 and 18 cells
    if (all) { await layout('vertical'); await shot(`${prefix}-vertical-h12`); await layout('compact'); await shot(`${prefix}-compact-h12`); await layout('strip'); if (resize) await size(1160, 250); }
    await h12(false);
  };
  // top bar between one row and the stacked bar: the source city, Today, the clear button and Copy all in view
  const narrowBar = async (prefix) => {
    await layout('strip');
    for (const W of [800, 1000]) { await size(W, 250); await convert('15:00', 'America/New_York'); await shot(`${prefix}-strip-${W}-converting`); await live(); }
    await size(1160, 250);
  };
  const lang = async (l) => { await run((l) => { const o = document.getElementById('optLanguage'); o.value = l; o.dispatchEvent(new Event('change')); }, l); await sleep(250); };
  const addCity = (q) => run((q) => { const s = document.getElementById('zoneSearch'); s.value = q; s.dispatchEvent(new Event('input')); const li = document.querySelector('#zoneResults li'); if (li) li.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); s.value = ''; s.dispatchEvent(new Event('input')); s.blur(); }, q);
  const removeCity = (zone) => run((zone) => {
    const card = document.querySelector(`.card[data-zone="${zone}"]`); if (!card) return;
    card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 100 }));
    document.querySelector('#cardMenu [data-act="remove"]').click();
  }, zone);
  const EXTRA = [['Tokyo', 'Asia/Tokyo'], ['Sydney', 'Australia/Sydney'], ['Berlin', 'Europe/Berlin']];
  const zoom = async (level) => { await run((z) => window.wc.setSettings({ zoom: z }), level); await sleep(600); };
  let dbg = null;
  const forced = async (on, scheme) => {
    if (!dbg) { dbg = w.webContents.debugger; dbg.attach('1.3'); }
    await dbg.sendCommand('Emulation.setEmulatedMedia', { features: on ? [{ name: 'forced-colors', value: 'active' }, { name: 'prefers-color-scheme', value: scheme }] : [] });
    await sleep(200);
  };

  // Each layout (and the planner and map) in the current theme / mode, with a conversion so the Source badge shows.
  const tour = async (prefix, { all = true, resize = true } = {}) => {
    await layout('strip'); if (resize) await size(1160, 250); // a resize at 200% would store a half-size strip
    await live(); await shot(`${prefix}-strip`);
    await convert('10:00', 'America/New_York'); await shot(`${prefix}-strip-converting`);
    await live();
    if (!all) return;
    await layout('compact'); await shot(`${prefix}-compact`);
    await layout('vertical'); await shot(`${prefix}-vertical`);
    await planner(true); await shot(`${prefix}-vertical-planner`); await planner(false); // hour scale under the rows
    await layout('strip');
    await planner(true); await shot(`${prefix}-planner`); await planner(false);
    await map(true); await shot(`${prefix}-map`); await map(false);
    await panel(true); await shot(`${prefix}-settings`); await panel(false);
    // No hour for everyone (New York, Thu Sep 24 2026): "No overlap", the dashed best-hours band and its button, per language
    await convertOn('10:00', '2026-09-24', 'America/New_York'); await planner(true);
    for (const l of ['en', 'pt', 'es']) { await lang(l); await shot(`${prefix}-planner-best-${l}`); }
    await lang('en'); await planner(false); await live();
    if (resize) {
      // More cities than fit: the vertical list and the wrapped rows scroll, with a thin scrollbar
      for (const [q] of EXTRA) await addCity(q);
      await sleep(250);
      await layout('vertical'); await shot(`${prefix}-vertical-scroll`);
      await layout('strip'); await size(700, 560); await shot(`${prefix}-rows-scroll`);
      await size(1160, 250);
      for (const [, z] of EXTRA) await removeCity(z);
      await sleep(250);
    }
    if (resize) await size(1160, 250);
  };

  // Round 2 batch B: the copy menu, a selected planner slot, the close button under the pointer, the vertical planner in pt.
  const extras = async (prefix) => {
    await layout('strip'); await size(1160, 250);
    await convert('10:00', 'America/New_York');
    await run(() => document.getElementById('btnCopy').click()); await shot(`${prefix}-copy-menu`);
    await run(() => document.getElementById('copyMenu').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    await live();
    await convertOn('10:00', '2026-09-24', 'America/New_York'); await planner(true);
    await run(() => {
      const c = document.querySelector('#planner .plan-row[data-zone="America/New_York"] .plan-cell[data-h="12"]');
      c.focus(); c.click();
      for (let i = 0; i < 2; i++) document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true, cancelable: true }));
    });
    await shot(`${prefix}-planner-slot`);
    await planner(false); await live();
    const r = await run(() => { const b = document.getElementById('btnClose').getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }; });
    w.webContents.sendInputEvent({ type: 'mouseMove', x: r.x, y: r.y }); await shot(`${prefix}-close-hover`);
    w.webContents.sendInputEvent({ type: 'mouseMove', x: 5, y: 120 });
    await lang('pt'); await layout('vertical'); await planner(true); await shot(`${prefix}-vertical-planner-pt`); await planner(false);
    await lang('en'); await layout('strip'); await size(1160, 250);
  };

  w.webContents.once('did-finish-load', () => setTimeout(async () => {
    let failed = null;
    try {
      w.show();
      await run(() => { const o = document.getElementById('optOpacity'); o.value = 1; o.dispatchEvent(new Event('change')); }); // opaque captures
      await sleep(200);
      await theme('light'); await tour('light'); await h12Tour('light'); await narrowBar('light');
      await run(() => document.getElementById('btnHelp').click()); await shot('light-help'); await run(() => document.getElementById('tipClose').click());
      for (const l of ['pt', 'es']) { await lang(l); await run(() => document.getElementById('btnHelp').click()); await shot(`light-help-${l}`); await run(() => document.getElementById('tipClose').click()); }
      await lang('en');
      await extras('light');
      await theme('dark'); await tour('dark'); await h12Tour('dark', { all: false }); await extras('dark');
      await forced(true, 'dark'); await tour('forced-dark');
      await forced(true, 'light'); await theme('light'); await tour('forced-light', { all: false });
      await planner(true); await shot('forced-light-planner'); await planner(false);
      await forced(false);
      await theme('light'); await zoom(3.8); await tour('zoom200', { resize: false }); await h12Tour('zoom200', { resize: false });
      await zoom(0);
      // Microsoft Store build: no launch-at-login switch (note and Open Startup apps only), no Ko-fi, no Check for updates.
      const hadStore = Object.getOwnPropertyDescriptor(process, 'windowsStore');
      let storeSet = false;
      try { process.windowsStore = true; storeSet = process.windowsStore === true; } catch { storeSet = false; }
      if (storeSet) {
        const nudge = () => run(() => { const o = document.getElementById('optSeconds'); o.checked = !o.checked; o.dispatchEvent(new Event('change')); });
        await nudge(); await sleep(150); await nudge(); await sleep(250); // round-trips publicSettings (store: true)
        await lang('pt'); await layout('vertical'); await panel(true); await shot('pt-vertical-settings-store'); await panel(false);
        if (hadStore) Object.defineProperty(process, 'windowsStore', hadStore); else delete process.windowsStore;
        await nudge(); await sleep(150); await nudge(); await sleep(250);
        await lang('en'); await layout('strip'); await size(1160, 250);
      } else log.push('SKIP pt-vertical-settings-store (process.windowsStore not writable)');
      // Settings refused at startup: after the retries, the message and Retry button in the strip.
      if (global.__wcTest && global.__wcTest.failSettingsGet) {
        global.__wcTest.failSettingsGet(99);
        w.webContents.reload();
        for (let i = 0; i < 60 && !(await run(() => !!document.querySelector('.boot-failed')).catch(() => false)); i++) await sleep(100);
        await shot('light-boot-failed');
        global.__wcTest.failSettingsGet(0);
        await run(() => document.getElementById('bootRetry').click()); await sleep(600);
      }
    } catch (e) { failed = e; log.push('EXCEPTION ' + (e.stack || e.message)); }
    try { if (dbg) dbg.detach(); } catch {}
    fs.writeFileSync(path.join(outDir, 'shots.txt'), [`${outDir}`, ...log].join('\n'));
    app.exit(failed ? 1 : 0);
  }, 1200));
};
