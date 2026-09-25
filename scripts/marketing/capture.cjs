// Marketing captures (run by scripts/marketing-shots.mjs through WC_SMOKE; never on its own). Drives the real app in a
// throwaway profile with a fixed demo state and saves one PNG per scene, plus scenes.json with each capture's CSS size.
// - Clock: 23 Sep 2026 13:20 UTC in every language, restarted on every page load, so a shot taken a few seconds after
//   a load reads the same minute (the skies differ from city to city, never from run to run).
// - Local city, per language (DevTools time zone emulation, so it gets the Home / Aqui / Aquí badge):
//   en Lisbon (14:20), pt São Paulo (10:20), es Mexico City (07:20).
// - Cities, per language (the Store listings name these; Los Angeles is labelled San Francisco in all three):
//   en Lisbon, London, New York, San Francisco, Tokyo, Sydney
//   pt São Paulo, Lisbon, London, New York, San Francisco, Tokyo
//   es Mexico City, Madrid, Buenos Aires, New York, San Francisco, Tokyo
//   The planner scene shows the local city, a European one, New York and San Francisco (08:00 to 17:00), so the
//   shared hours come to 2 in every language (es: Madrid works 09:00 to 19:00). A few README and website scenes
//   (English only) use the five-city set their alt texts describe (Sao Paulo, Lisbon, New York, Los Angeles,
//   Singapore), still with Lisbon as the local city.
// - No hover or focus: the window is placed away from the real pointer, the page gets a mouse leave, focus is
//   dropped, and every running animation has finished before the capture.
// - Size: each scene sets a CSS size and a zoom factor (sharper text); the zoom shrinks when the work area is too
//   small, and scenes.json records what was used.
// Env: MKT_OUT (folder), MKT_LANG (en | pt | es), MKT_SCENES (comma list, default: all for en, the Store ones otherwise).
module.exports = (w, app) => {
  const fs = require('fs'), path = require('path');
  const { screen } = require('electron');
  if (!process.env.WC_USER_DATA || !process.env.MKT_OUT) {
    console.error('capture.cjs: run it with node scripts/marketing-shots.mjs (it needs WC_USER_DATA and MKT_OUT).');
    app.exit(2);
    return;
  }
  const out = process.env.MKT_OUT, lang = process.env.MKT_LANG || 'en';
  fs.mkdirSync(out, { recursive: true });
  const logFile = path.join(out, 'log.txt');
  const log = (s) => fs.appendFileSync(logFile, `${new Date().toISOString().slice(11, 19)} ${s}\n`);
  const run = (fn, ...args) => w.webContents.executeJavaScript(`(${fn.toString()})(${args.map((a) => JSON.stringify(a)).join(',')})`);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const meta = {};

  const T = Date.UTC(2026, 8, 23, 13, 20, 0);
  const LA8 = { 'America/Los_Angeles': { start: '08:00', end: '17:00', days: [1, 2, 3, 4, 5] } };
  const DEMO = {
    en: { tz: 'Europe/Lisbon', zones: ['Europe/Lisbon', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'Australia/Sydney'],
      planner: ['Europe/Lisbon', 'Europe/London', 'America/New_York', 'America/Los_Angeles'], hours: LA8 },
    pt: { tz: 'America/Sao_Paulo', zones: ['America/Sao_Paulo', 'Europe/Lisbon', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo'],
      planner: ['America/Sao_Paulo', 'Europe/Lisbon', 'America/New_York', 'America/Los_Angeles'], hours: LA8 },
    es: { tz: 'America/Mexico_City', zones: ['America/Mexico_City', 'Europe/Madrid', 'America/Argentina/Buenos_Aires', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo'],
      planner: ['America/Mexico_City', 'Europe/Madrid', 'America/New_York', 'America/Los_Angeles'],
      hours: { ...LA8, 'Europe/Madrid': { start: '09:00', end: '19:00', days: [1, 2, 3, 4, 5] } },
      stripW: 1500 }, // a little wider, so the local card has room for "Ciudad de México" next to its Aquí badge
  };
  const D = DEMO[lang] || DEMO.en;
  const SIX = D.zones, STRIP_W = D.stripW || 1440;
  const SF = { 'America/Los_Angeles': 'San Francisco' };
  const FIVE = ['America/Sao_Paulo', 'Europe/Lisbon', 'America/New_York', 'America/Los_Angeles', 'Asia/Singapore'];
  const BASE = { zones: SIX, labels: SF, hours: {}, theme: 'light', layout: 'strip', planner: false, opacity: 1, firstRun: false, tipSeen: true,
    closeHintSeen: true, language: lang, hour12: false, showSeconds: true, alwaysOnTop: true, zoom: 0 };

  // ---------- window ----------
  let target = null;
  async function size(cssW, cssH, want = 1.5) {
    const wa = screen.getPrimaryDisplay().workArea;
    const z = Math.min(want, (wa.width - 8) / cssW, (wa.height - 8) / cssH);
    const W = Math.round(cssW * z), H = Math.round(cssH * z);
    // keep the real pointer outside the window: below it when the pointer is near the top, else at the top
    const cur = screen.getCursorScreenPoint();
    const inTop = cur.x >= wa.x && cur.x <= wa.x + W && cur.y >= wa.y && cur.y <= wa.y + H + 20;
    const x = wa.x, y = inTop ? Math.max(wa.y, wa.y + wa.height - H) : wa.y;
    w.webContents.setZoomFactor(z);
    for (let i = 0; i < 6; i++) {
      if (w.isMaximized()) w.unmaximize();
      w.setBounds({ x, y, width: W, height: H });
      await sleep(350);
      const b = w.getBounds();
      if (Math.abs(b.width - W) < 3 && Math.abs(b.height - H) < 3) break;
    }
    target = { x, y, width: W, height: H, z };
    await sleep(500);
    const inner = await run(() => [innerWidth, innerHeight]);
    log(`size ${cssW}x${cssH} z ${z.toFixed(3)} bounds ${JSON.stringify(w.getBounds())} inner ${inner}`);
    return { z, inner };
  }
  // everything settled: no pointer, no focus, no running animation
  async function settle() {
    w.webContents.sendInputEvent({ type: 'mouseMove', x: 1, y: 1 });
    w.webContents.sendInputEvent({ type: 'mouseLeave', x: -5, y: -5 });
    await run(() => { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); });
    await run(() => new Promise((resolve) => {
      const t0 = performance.now();
      const tick = () => {
        const busy = document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.getTiming().iterations !== Infinity);
        if (!busy.length || performance.now() - t0 > 4000) resolve(); else setTimeout(tick, 100);
      };
      tick();
    }));
    await sleep(250);
  }
  async function shot(name, extra = {}) {
    await sleep(600);
    for (let i = 0; i < 5; i++) {
      if (w.isMinimized()) w.restore();
      if (!w.isVisible()) w.showInactive();
      if (target) {
        const b = w.getBounds();
        if (Math.abs(b.width - target.width) > 2 || Math.abs(b.height - target.height) > 2) {
          log(`fix bounds ${JSON.stringify(b)}`);
          w.webContents.setZoomFactor(target.z);
          w.setBounds({ x: target.x, y: target.y, width: target.width, height: target.height });
          await sleep(900);
        }
      }
      await settle();
      const img = await Promise.race([w.webContents.capturePage(), sleep(6000).then(() => null)]);
      if (img && img.getSize().width > 0) {
        fs.writeFileSync(path.join(out, `${name}.png`), img.toPNG());
        const [iw, ih] = await run(() => [innerWidth, innerHeight]);
        meta[name] = { png: img.getSize(), css: { width: iw, height: ih }, z: target ? target.z : 1, ...extra };
        log(`shot ${name} ${JSON.stringify(img.getSize())}`);
        return;
      }
      log(`retry ${name}`);
      await sleep(1200);
    }
    log(`FAILED ${name}`);
  }

  // ---------- app state ----------
  const booted = () => run(() => new Promise((resolve) => {
    const ok = () => document.querySelector('.card[data-zone], .strip .empty');
    if (ok()) resolve(); else { document.addEventListener('wc:boot', () => resolve(), { once: true }); setTimeout(resolve, 5000); }
  }));
  async function set(patch) {
    await run((p) => window.wc.setSettings(p), patch);
    await sleep(250);
    w.webContents.reload();
    await sleep(700);
    await booted();
    await sleep(900);
  }
  const convert = (time, zone, date) => run((time, zone, date) => {
    const z = document.getElementById('convZone'), t = document.getElementById('convTime'), d = document.getElementById('convDate');
    if (zone) { z.value = zone; z.dispatchEvent(new Event('change')); }
    if (date) { d.value = date; delete d.dataset.auto; }
    t.value = time; t.dispatchEvent(new Event('input'));
  }, time, zone, date || null);
  const toggle = async (id, on) => {
    await run((id, on) => { const b = document.getElementById(id); if ((b.getAttribute('aria-pressed') === 'true') !== on) b.click(); }, id, on);
    await sleep(900);
  };
  // the vertical window's height that shows every card with no fade: bar + strip content
  const verticalHeight = () => run(() => {
    const s = document.getElementById('strip'), cards = [...s.querySelectorAll('.card[data-zone]')];
    const last = cards[cards.length - 1].getBoundingClientRect();
    return Math.ceil(last.bottom + s.scrollTop + (parseFloat(getComputedStyle(s).paddingBottom) || 0) + 4);
  });
  // the settings panel's content box, in CSS px
  const panelBox = () => run(() => {
    const kids = [...document.getElementById('settingsPanel').children].filter((n) => n.getClientRects().length);
    const r = kids.map((n) => n.getBoundingClientRect());
    return { left: Math.min(...r.map((b) => b.left)), top: Math.min(...r.map((b) => b.top)), right: Math.max(...r.map((b) => b.right)), bottom: Math.max(...r.map((b) => b.bottom)) };
  });

  // ---------- scenes ----------
  const SCENES = {
    // Store (every language) and the website pages cropped from them
    async 'strip-light'() { await set({ ...BASE }); await size(STRIP_W, 262); await shot('strip-light'); },
    async 'strip-dark'() { await set({ ...BASE, theme: 'dark' }); await size(STRIP_W, 262); await shot('strip-dark'); },
    async converter() { await set({ ...BASE }); await size(STRIP_W, 262); await convert('16:30', 'America/New_York'); await shot('converter'); },
    async 'planner-light'() {
      await set({ ...BASE, zones: D.planner, hours: D.hours, planner: true });
      await size(1440, 300); await shot('planner-light', { summary: await run(() => document.getElementById('plannerSummary').textContent) });
    },
    async map() { await set({ ...BASE, theme: 'dark' }); await size(1400, 600, 1.4); await toggle('btnMap', true); await size(1400, 600, 1.4); await shot('map'); },
    async vertical() {
      for (const theme of ['dark', 'light']) {
        await set({ ...BASE, theme, layout: 'vertical' });
        await size(330, 800);
        const h = await verticalHeight();
        await size(330, h); await shot(`vertical-${theme}`);
      }
    },
    // website home and JSON-LD screenshots (site/assets/img)
    async 'site-strip'() {
      for (const theme of ['light', 'dark']) { await set({ ...BASE, theme }); await size(1331, 289); await shot(`site-strip-${theme}`); }
    },
    async 'site-converter'() { await set({ ...BASE, theme: 'dark' }); await size(1330, 288); await convert('16:30', 'America/New_York'); await shot('site-converter'); },
    async 'site-settings'() {
      await set({ ...BASE, theme: 'dark' }); await size(1160, 250);
      await run(() => document.getElementById('btnSettings').click()); await sleep(900);
      await size(1160, 760); await sleep(300);
      await shot('site-settings', { box: await panelBox(), version: await run(() => document.getElementById('ver').textContent) });
    },
    async 'site-vertical'() {
      await set({ ...BASE, theme: 'dark', layout: 'vertical' });
      // the window takes the image's shape (342x680) at the height that shows every card
      await size(377, 800);
      let h = await verticalHeight();
      await size(Math.round(h * 342 / 680), 800);
      h = await verticalHeight();
      await size(Math.round(h * 342 / 680), h); await shot('site-vertical');
    },
    // Open Graph image: the strip at 1:1 in the old window's place (five cities fill it)
    async og() {
      await set({ ...BASE, zones: ['Europe/Lisbon', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'Australia/Sydney'] });
      await size(1160, 249, 2); await shot('og-strip');
    },
    // README and the planner page's best-hours image: the five-city set in the alt texts
    async readme() {
      for (const theme of ['light', 'dark']) {
        const five = { ...BASE, zones: FIVE, labels: {}, theme };
        await set(five); await size(1160, 251, 1.6); await convert('10:00', 'America/New_York'); await shot(`readme-converter-${theme}`);
        await set({ ...five, planner: true }); await size(1160, 262, 1.6); await convert('10:00', 'America/New_York', '2026-09-24'); await sleep(600);
        await shot(`readme-planner-${theme}`, { best: await run(() => document.getElementById('plannerBest').textContent) });
        if (theme === 'light') { await size(1160, 272, 1.6); await shot('planner-best'); }
        await set({ ...five }); await size(1160, 361, 1.6); await toggle('btnMap', true); await size(1160, 361, 1.6); await shot(`readme-map-${theme}`);
      }
    },
  };
  const STORE = ['strip-light', 'strip-dark', 'converter', 'planner-light', 'map', 'vertical'];
  const list = (process.env.MKT_SCENES ? process.env.MKT_SCENES.split(',') : lang === 'en' ? Object.keys(SCENES) : STORE).filter((s) => SCENES[s]);

  (async () => {
    try {
      const dbg = w.webContents.debugger;
      dbg.attach('1.3');
      await dbg.sendCommand('Emulation.setTimezoneOverride', { timezoneId: D.tz });
      await dbg.sendCommand('Page.enable');
      await dbg.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
        source: `(()=>{const off=${T}-Date.now();const D=Date;class FD extends D{constructor(...a){if(a.length===0)super(D.now()+off);else super(...a);}static now(){return D.now()+off;}}FD.UTC=D.UTC;FD.parse=D.parse;globalThis.Date=FD;})();`,
      });
      await sleep(1200);
      log(`lang ${lang} scenes ${list.join(',')} display ${JSON.stringify(screen.getPrimaryDisplay().workArea)} scale ${screen.getPrimaryDisplay().scaleFactor}`);
      for (const s of list) { log(`scene ${s}`); await SCENES[s](); }
      log(`now ${await run(() => `${Intl.DateTimeFormat().resolvedOptions().timeZone} ${new Date().toISOString()}`)}`);
    } catch (e) { log(`ERR ${e.stack || e}`); }
    fs.writeFileSync(path.join(out, 'scenes.json'), JSON.stringify({ lang, scenes: meta }, null, 1));
    app.exit(0);
  })();
};
