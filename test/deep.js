// In-app test suite: runs inside the real Electron app against the live DOM. Run with `npm test`.
module.exports = (w, app) => {
  const fs = require('fs'), path = require('path');
  const dir = path.dirname(process.env.WC_SMOKE);
  // Never against the real profile: run.js always points userData at a throwaway folder (WC_USER_DATA).
  if (!process.env.WC_USER_DATA) {
    const msg = 'deep.js: WC_USER_DATA is not set, so this would run against your real settings. Run it with npm test (test/run.js).';
    console.error(msg);
    try { fs.writeFileSync(path.join(dir, 'deep.txt'), `0 passed, 1 failed\nFAIL ${msg}`); } catch {}
    app.exit(2);
    return;
  }
  const out = [];
  let pass = 0, fail = 0;
  const check = (name, cond, detail) => { if (cond) pass++; else fail++; out.push(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : '  => ' + detail}`); };
  // Electron 35+ passes one event object ({ level: 'info' | 'warning' | 'error' | 'debug', message, lineNumber, sourceId }).
  w.webContents.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') out.push(`CONSOLE[${e.level}] ${e.message} @ ${e.sourceId}:${e.lineNumber}`); });
  const run = (fn, ...args) => w.webContents.executeJavaScript(`(${fn.toString()})(${args.map((a) => JSON.stringify(a)).join(',')})`);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Poll a condition (sync or async) every `step` ms until it is truthy or `ms` passed; returns its last value. Used
  // where a fixed sleep only guessed how long something takes (a save, a reload, a scroll); animation waits stay sleeps.
  const waitFor = async (fn, ms = 3000, step = 50) => {
    const end = Date.now() + ms;
    for (;;) {
      let v;
      try { v = await fn(); } catch { v = false; }
      if (v || Date.now() >= end) return v;
      await sleep(step);
    }
  };

  // DOM helpers evaluated in the page
  const cards = () => [...document.querySelectorAll('.card[data-zone]')].map((c) => ({
    zone: c.dataset.zone, city: c.querySelector('.city').textContent, hm: c.querySelector('.hm').textContent,
    sec: c.querySelector('.sec').textContent, ampm: c.querySelector('.ampm').textContent, date: c.querySelector('.date').textContent,
    utc: c.querySelector('.utc').textContent, rel: c.querySelector('.rel').textContent, phase: c.querySelector('.phase').textContent,
    home: c.classList.contains('home'), converted: c.classList.contains('converted'),
  }));
  const setConv = (time, date, zone) => {
    const t = document.getElementById('convTime'), d = document.getElementById('convDate'), z = document.getElementById('convZone');
    if (zone) { z.value = zone; }
    d.value = date || ''; // hidden field: tests pin a date, users always convert for today
    if (date) delete d.dataset.auto; // a pinned date is an explicit one (like a date chip), so typing keeps it
    t.value = time; t.dispatchEvent(new Event('input'));
    return document.getElementById('convHint').textContent;
  };
  const search = (q) => { const s = document.getElementById('zoneSearch'); s.value = q; s.dispatchEvent(new Event('input')); return [...document.querySelectorAll('#zoneResults li b')].map((b) => b.textContent); };
  const key = (k) => { document.getElementById('zoneSearch').dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); };
  const menuAct = (zone, act) => {
    const card = document.querySelector(`.card[data-zone="${zone}"]`);
    card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 100 }));
    const btn = document.querySelector(`#cardMenu [data-act="${act}"]`);
    const disabled = btn.disabled; if (!disabled) btn.click();
    return { disabled, menuHidden: document.getElementById('cardMenu').hidden };
  };
  const byZone = (list, z) => list.find((c) => c.zone === z);
  // Type into the add-city search and pick the first result.
  const addFirst = (q) => { const s = document.getElementById('zoneSearch'); s.value = q; s.dispatchEvent(new Event('input')); const li = document.querySelector('#zoneResults li'); if (li) li.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); return !!li; };
  const addAll = async (qs) => { for (const q of qs) await run(addFirst, q); };
  const DEFAULT_ZONES = ['Europe/Lisbon', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Singapore'];
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  w.webContents.once('did-finish-load', () => setTimeout(async () => {
    try {
      // 0. Fresh profile: the window opens at the default strip size (no DPI rounding drift)
      const wa0 = require('electron').screen.getDisplayMatching(w.getBounds()).workArea;
      const fresh = w.getSize();
      // Within 1 DIP: at some fractional scales Windows cannot land every size at every position (Electron 44 at 114.6%
      // turns a 248 or 247 request at y=60 into 249 and 249 into 251), so exact is not always reachable; the old bug
      // (4px too big, growing on each round trip) is still caught.
      check('fresh profile opens at 1160x250 (within 1 DIP)', Math.abs(fresh[0] - Math.min(1160, wa0.width)) <= 1 && Math.abs(fresh[1] - Math.min(250, wa0.height)) <= 1, String(fresh));
      const s0 = await run(async () => window.wc.getSettings());
      check('publicSettings has systemLanguage en|pt|es', ['en', 'pt', 'es'].includes(s0.systemLanguage), s0.systemLanguage);
      // Offline, fewer processes: no proxy detection, the network service in the browser process (ONE enable-features
      // switch: a second appendSwitch would replace it), and software compositing on the native backdrop path.
      const cl = app.commandLine, feats = String(cl.getSwitchValue('enable-features') || '').split(',');
      check('no-proxy-server and enable-features=NetworkServiceInProcess2 are set (updates off)', cl.hasSwitch('no-proxy-server') && feats.includes('NetworkServiceInProcess2'), JSON.stringify({ proxy: cl.hasSwitch('no-proxy-server'), feats }));
      const gpuComp = app.getGPUFeatureStatus().gpu_compositing;
      if (s0.backdrop !== 'none' && process.env.WC_GPU !== '1') check(`native backdrop (${s0.backdrop}): GPU compositing off (software)`, /^disabled_software/.test(gpuComp), gpuComp);
      else out.push(`SKIP software compositing check (backdrop ${s0.backdrop}, WC_GPU ${process.env.WC_GPU || 'unset'})`);
      // No CSS backdrop blur on either path (native: DWM blurs; transparent: Chromium cannot see the desktop, so it blurred
      // nothing); the transparent path clips with paint containment instead.
      const appCss = await run(() => { const cs = getComputedStyle(document.getElementById('app')); return { bf: cs.backdropFilter, contain: cs.contain, native: document.documentElement.classList.contains('backdrop-native') }; });
      check('.app has no CSS backdrop blur; the transparent path uses contain: paint', appCss.bf === 'none' && (appCss.native || /paint/.test(appCss.contain)), JSON.stringify(appCss));
      check('first run follows the Windows region format (pinned to en-GB in tests): 24-hour clock', s0.hour12 === false && !s0.firstRun, JSON.stringify({ hour12: s0.hour12, firstRun: s0.firstRun }));
      w.setBounds({ x: 40, y: 40, width: 1160, height: 250 }); await sleep(300);

      // 1. Boot state. First run: the local city joins the defaults, and a default with the same clock all year as an
      // earlier city is left out (same offset now, on Jan 15 and on Jul 15; the local city wins its group).
      let c = await run(cards);
      const offAt = (z, ms) => {
        const p = {}; for (const x of new Intl.DateTimeFormat('en-US', { timeZone: z, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms))) p[x.type] = x.value;
        return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000) / 60000);
      };
      const yNow = new Date().getUTCFullYear();
      const clockKey = (z) => [Date.now(), Date.UTC(yNow, 0, 15), Date.UTC(yNow, 6, 15)].map((ms) => offAt(z, ms)).join('|');
      const bootBase = DEFAULT_ZONES.includes(localZone) ? DEFAULT_ZONES : [localZone, ...DEFAULT_ZONES];
      const seenClocks = new Set([clockKey(localZone)]);
      const expectedZones = bootBase.filter((z) => { if (z === localZone) return true; const k = clockKey(z); if (seenClocks.has(k)) return false; seenClocks.add(k); return true; });
      const expectedCards = expectedZones.length;
      check(`boot renders ${expectedCards} cards (local ${localZone}), no two with the same clock all year`, c.length === expectedCards && JSON.stringify(c.map((x) => x.zone)) === JSON.stringify(expectedZones), JSON.stringify(c.map((x) => x.zone)));
      const homeCard = c.find((x) => x.home);
      check('local zone card marked home (first when it is not a default city)', !!homeCard && homeCard.zone === localZone && homeCard.rel === 'Local' && (DEFAULT_ZONES.includes(localZone) || c[0].home), JSON.stringify(homeCard || c[0]));
      check('seconds shown live', /^\d\d$/.test(c[1].sec), c[1].sec);
      const bootFit = await run(() => {
        const s = document.getElementById('strip'), cs = [...s.querySelectorAll('.card[data-zone]')];
        const last = cs[cs.length - 1].getBoundingClientRect(), sr = s.getBoundingClientRect();
        return { n: cs.length, right: Math.round((last.right - sr.left) * 10) / 10, clientWidth: s.clientWidth, scrollWidth: s.scrollWidth, width: window.innerWidth };
      });
      if (wa0.width < 1160) out.push(`SKIP first-run cards fit the 1160 wide strip (work area only ${wa0.width} wide)`);
      else check('first-run cards all fit the 1160 wide strip (last card not clipped)', bootFit.width >= 1159 && bootFit.right <= bootFit.clientWidth + 0.5 && bootFit.scrollWidth <= bootFit.clientWidth + 1, JSON.stringify(bootFit));

      // 1b. Motion: the digits never blink and the card keeps one transition list (motion/topbar.css, time.css, cards.css)
      const motionCss = await run(() => {
        const card = document.querySelector('.card[data-zone]'), hm = card.querySelector('.hm');
        const root = getComputedStyle(document.documentElement), cs = getComputedStyle(card);
        const props = cs.transitionProperty.split(',').map((s) => s.trim());
        const rule = [...document.styleSheets].flatMap((sh) => { try { return [...sh.cssRules]; } catch { return []; } })
          .filter((r) => r.selectorText === '.card:active' && r.style && r.style.getPropertyValue('transition-duration')).pop();
        const durs = rule ? rule.style.getPropertyValue('transition-duration').split(',').map((d) => { const m = /var\((--[\w-]+)\)/.exec(d); return (m ? root.getPropertyValue(m[1]) : d).trim(); }) : [];
        return { hm: getComputedStyle(hm).transitionProperty, props, activeTransform: durs[props.indexOf('transform')], durs, count: durs.length };
      });
      check('.hm has no opacity transition (a finished digit roll does not fade up from 0)', !/opacity/.test(motionCss.hm), motionCss.hm);
      check('.card transition includes opacity (drag dim) and border-color; .card:active gives transform 120ms', motionCss.props.includes('opacity') && motionCss.props.includes('border-color')
        && motionCss.count === motionCss.props.length && /^(120ms|0\.12s)$/.test(motionCss.activeTransform || ''), JSON.stringify(motionCss));
      // A minute tick rolls the digits (per-digit overlay, .hm hidden meanwhile): the real digits are back at full opacity.
      const rolled = await run(async () => {
        const card = document.querySelector('.card[data-zone]'), hm = card.querySelector('.hm');
        const t = hm.textContent, next = t.slice(0, -1) + ((+t.slice(-1) + 1) % 10);
        document.dispatchEvent(new CustomEvent('wc:time-change', { detail: { card, from: next, to: t, converting: false } }));
        await new Promise((ok) => setTimeout(ok, 0));
        const fx = card.querySelector('.digit-fx');
        const during = { overlay: !!fx, inline: hm.style.opacity, cells: fx ? fx.querySelectorAll('.dfx-c').length : -1,
          anims: fx ? fx.getAnimations({ subtree: true }).length : -1, text: fx ? [...fx.childNodes].map((n) => (n.nodeType === 3 ? n.data : n.firstChild.textContent)).join('') : '', to: t };
        await new Promise((ok) => setTimeout(ok, 430));
        return { during, overlay: !!card.querySelector('.digit-fx'), inline: hm.style.opacity, opacity: getComputedStyle(hm).opacity };
      });
      check('after a digit roll the time is back at opacity 1 at once (no blink)', rolled.during.overlay && rolled.during.inline === '0' && !rolled.overlay && rolled.inline === '' && rolled.opacity === '1', JSON.stringify(rolled));
      check('a minute digit roll animates only the digit that changed (one box, two animations; the rest is plain text)', rolled.during.cells === 1 && rolled.during.anims === 2 && rolled.during.text === rolled.during.to, JSON.stringify(rolled.during));
      // Continuous scrubbing (steps under 300 ms apart): .app.scrub-live drops the day-line dot's 'left' glide (one layout
      // per frame otherwise); one step still glides, and the class goes 300 ms after the last step.
      const live = await run(async () => {
        const app = document.getElementById('app'), s = document.getElementById('convSlider');
        const dotTr = () => getComputedStyle(document.querySelector('.card.converted .arc-dot') || document.body).transitionProperty;
        const step = (v) => { s.value = String(v); s.dispatchEvent(new Event('input', { bubbles: true })); };
        const frame = () => new Promise((ok) => setTimeout(ok, 80));
        step(540); await frame();
        const one = { live: app.classList.contains('scrub-live'), tr: dotTr() };
        step(555); await frame(); step(570); await frame();
        const many = { live: app.classList.contains('scrub-live'), tr: dotTr() };
        await new Promise((ok) => setTimeout(ok, 400));
        const after = { live: app.classList.contains('scrub-live'), tr: dotTr() };
        const t = document.getElementById('convTime'); t.value = ''; t.dispatchEvent(new Event('input'));
        return { one, many, after };
      });
      check('continuous slider scrubbing sets .scrub-live (dot follows without a left transition), a single step glides', !live.one.live && /left/.test(live.one.tr)
        && live.many.live && !/left/.test(live.many.tr) && !live.after.live && /left/.test(live.after.tr), JSON.stringify(live));

      // 2. Half-hour and 45-minute offsets, negative half offset
      await addAll(['Kolkata', 'Kathmandu', 'St Johns']);
      await sleep(100);
      c = await run(cards);
      check('Kolkata UTC+5:30', byZone(c, 'Asia/Kolkata')?.utc === 'UTC+5:30', byZone(c, 'Asia/Kolkata')?.utc);
      check('Kathmandu UTC+5:45', byZone(c, 'Asia/Kathmandu')?.utc === 'UTC+5:45', byZone(c, 'Asia/Kathmandu')?.utc);
      check('St Johns UTC-3:30 or UTC-2:30', ['UTC-3:30', 'UTC-2:30'].includes(byZone(c, 'America/St_Johns')?.utc), byZone(c, 'America/St_Johns')?.utc);
      check('relative label has minutes for Kolkata', /\d+h30m$/.test(byZone(c, 'Asia/Kolkata')?.rel), byZone(c, 'Asia/Kolkata')?.rel);

      // 3. Converter: basic, year boundary, DST gap, DST overlap
      let hint = await run(setConv, '23:30', '2026-12-31', 'America/Los_Angeles');
      c = await run(cards);
      check('converter hint set', /23:30 in Los Angeles/.test(hint), hint);
      check('LA shows 23:30 converted', byZone(c, 'America/Los_Angeles').hm === '23:30' && byZone(c, 'America/Los_Angeles').converted, JSON.stringify(byZone(c, 'America/Los_Angeles')));
      check('Singapore is Jan 1 2027 +1 day', /Jan 1, 2027.*\+1 day/.test(byZone(c, 'Asia/Singapore').date), byZone(c, 'Asia/Singapore').date);
      check('Singapore 15:30', byZone(c, 'Asia/Singapore').hm === '15:30', byZone(c, 'Asia/Singapore').hm);
      check('no seconds while converting', c.every((x) => x.sec === ''), c.map((x) => x.sec).join(','));
      check('Lisbon is Jan 1 07:30 with +1 day marker', /Jan 1, 2027.*\+1 day/.test(byZone(c, 'Europe/Lisbon').date) && byZone(c, 'Europe/Lisbon').hm === '07:30', byZone(c, 'Europe/Lisbon').date);

      await run(setConv, '02:30', '2026-03-08', 'America/New_York'); // nonexistent local time (spring forward)
      c = await run(cards);
      const nyGap = byZone(c, 'America/New_York').hm, lisGap = byZone(c, 'Europe/Lisbon').hm;
      check('DST gap 02:30 NY resolves to 03:30 NY', nyGap === '03:30', nyGap);
      check('DST gap Lisbon consistent (07:30 GMT)', lisGap === '07:30', lisGap);
      await run(setConv, '01:30', '2026-03-29', 'Europe/Lisbon'); // Lisbon gap
      c = await run(cards);
      check('DST gap 01:30 Lisbon resolves to 02:30', byZone(c, 'Europe/Lisbon').hm === '02:30', byZone(c, 'Europe/Lisbon').hm);
      await run(setConv, '12:00', '2026-07-01', 'Asia/Kolkata'); // no-DST zone, half-hour offset
      c = await run(cards);
      check('12:00 Kolkata is 06:30 UTC (Lisbon 07:30 WEST)', byZone(c, 'Europe/Lisbon').hm === '07:30', byZone(c, 'Europe/Lisbon').hm);

      await run(setConv, '01:30', '2026-11-01', 'America/New_York'); // ambiguous local time (fall back)
      c = await run(cards);
      check('DST overlap 01:30 NY stays 01:30', byZone(c, 'America/New_York').hm === '01:30', byZone(c, 'America/New_York').hm);
      check('DST overlap Lisbon is 05:30 or 06:30', ['05:30', '06:30'].includes(byZone(c, 'Europe/Lisbon').hm), byZone(c, 'Europe/Lisbon').hm);

      // 4. Removing the converter source falls back to local
      let r = await run(menuAct, 'America/New_York', 'remove');
      c = await run(cards);
      const convZone = await run(() => document.getElementById('convZone').value);
      const nyStillShown = !!byZone(c, 'America/New_York');
      check('remove via menu removes card and closes menu', !nyStillShown && r.menuHidden, JSON.stringify(r));
      check('converter source falls back to local after removal', convZone === c[0].zone && c[0].hm === '01:30', `${convZone} ${c[0].hm}`);

      // 5. Live button
      await run(() => document.getElementById('convClear').click());
      c = await run(cards);
      check('Live restores live mode', c.every((x) => !x.converted) && (await run(() => document.getElementById('convHint').textContent)) === '', '');

      // 5b. Smart time input: loose formats, invalid text, slider, arrow nudge, blur normalization
      const typed = async (txt) => { await run(setConv, txt, '', ''); return run(() => ({ hint: document.getElementById('convHint').textContent, invalid: document.getElementById('convTime').classList.contains('invalid'), slider: document.getElementById('convSlider').value })); };
      let r5 = await typed('930');
      check('"930" parses as 09:30', /09:30/.test(r5.hint) && !r5.invalid && r5.slider === '570', JSON.stringify(r5));
      r5 = await typed('3pm');
      check('"3pm" parses as 15:00', /15:00/.test(r5.hint) && r5.slider === '900', JSON.stringify(r5));
      r5 = await typed('9');
      check('"9" parses as 09:00', /09:00/.test(r5.hint), r5.hint);
      r5 = await typed('15h30');
      check('"15h30" parses as 15:30', /15:30/.test(r5.hint), r5.hint);
      r5 = await typed('12am');
      check('"12am" parses as 00:00', /00:00/.test(r5.hint), r5.hint);
      r5 = await typed('12:15 PM');
      check('"12:15 PM" parses as 12:15', /12:15/.test(r5.hint), r5.hint);
      r5 = await typed('25:00');
      check('"25:00" flagged invalid, keeps previous conversion', r5.invalid && /like 9/.test(r5.hint) && (await run(cards)).every((x) => x.converted), JSON.stringify(r5));
      r5 = await typed('abc');
      check('"abc" flagged invalid', r5.invalid, JSON.stringify(r5));
      await run(() => { const s = document.getElementById('convSlider'); s.value = 1020; s.dispatchEvent(new Event('input')); });
      const slNow = await run(() => ({ v: document.getElementById('convTime').value, vt: document.getElementById('convSlider').getAttribute('aria-valuetext') }));
      await sleep(120); // the slider converts once per animation frame
      let tv = await run(() => ({ v: document.getElementById('convTime').value, hint: document.getElementById('convHint').textContent }));
      check('slider 17:00 fills the field at once and converts on the next frame', slNow.v === '17:00' && slNow.vt === '17:00' && tv.v === '17:00' && /17:00/.test(tv.hint), JSON.stringify({ slNow, tv }));
      // Dragging fires many input events per frame: one conversion for all of them, at the last value.
      const slBurst = await run(async () => {
        const s = document.getElementById('convSlider'); let converts = 0;
        const on = () => { converts++; };
        document.addEventListener('wc:time-change', on);
        for (const v of [1030, 1040, 1050, 1060, 1070, 1080]) { s.value = v; s.dispatchEvent(new Event('input')); }
        await new Promise((ok) => setTimeout(ok, 120));
        document.removeEventListener('wc:time-change', on);
        return { converts, hint: document.getElementById('convHint').textContent, time: document.getElementById('convTime').value, cards: document.querySelectorAll('.card[data-zone]').length };
      });
      check('slider burst of 6 input events converts once, to the last value (18:00)', slBurst.time === '18:00' && /18:00/.test(slBurst.hint) && slBurst.converts <= slBurst.cards, JSON.stringify(slBurst));
      await run(() => { const s = document.getElementById('convSlider'); s.value = 1020; s.dispatchEvent(new Event('input')); });
      await sleep(120);
      await run(() => document.getElementById('convTime').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })));
      tv = await run(() => document.getElementById('convTime').value);
      check('ArrowUp nudges +15 min', tv === '17:15', tv);
      await run(() => { const t = document.getElementById('convTime'); t.value = '7'; t.dispatchEvent(new Event('input')); t.dispatchEvent(new Event('blur')); });
      tv = await run(() => document.getElementById('convTime').value);
      check('blur normalizes "7" to 07:00', tv === '07:00', tv);
      await run(() => document.getElementById('convClear').click());
      check('date picker is hidden', await run(() => document.getElementById('convDate').offsetParent === null), '');

      // 5b2. Fall-back night: scrubbing by the hour walks through the repeated hour (it used to stay on the first 01:30);
      // a typed time still takes the first occurrence.
      const lisDst = () => { const c = document.querySelector('.card[data-zone="Europe/Lisbon"]'); return { hm: c.querySelector('.hm').textContent, utc: c.querySelector('.utc').textContent, time: document.getElementById('convTime').value }; };
      const pageUp = () => { const c = document.querySelector('.card[data-zone="Europe/Lisbon"]'); c.focus(); c.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', bubbles: true, cancelable: true })); };
      await run(setConv, '00:30', '2026-10-25', 'Europe/Lisbon');
      const dstSteps = [await run(lisDst)];
      for (let i = 0; i < 3; i++) { await run(pageUp); await sleep(150); dstSteps.push(await run(lisDst)); }
      const ds = dstSteps.map((s) => `${s.hm} ${s.utc}`);
      check('DST: PageUp from 00:30 on Oct 25 2026 in Lisbon goes 01:30 UTC+1, 01:30 UTC+0, 02:30 UTC+0', JSON.stringify(ds) === JSON.stringify(['00:30 UTC+1', '01:30 UTC+1', '01:30 UTC+0', '02:30 UTC+0']), JSON.stringify(dstSteps));
      await run(setConv, '01:30', '2026-10-25', 'Europe/Lisbon');
      const dstTyped = await run(lisDst);
      check('DST: typing 01:30 on Oct 25 2026 in Lisbon still picks the first one (UTC+1)', dstTyped.hm === '01:30' && dstTyped.utc === 'UTC+1', JSON.stringify(dstTyped));
      // A converted digit change crossfades to the element's own opacity: 1, or 0.72 on a card whose city is asleep.
      await run(setConv, '10:00', '2026-07-01', 'Europe/Lisbon');
      await sleep(400);
      await run(pageUp);
      const fadeOp = await run(async () => {
        await new Promise((ok) => setTimeout(ok, 360));
        const cs = [...document.querySelectorAll('.card[data-zone]')];
        return { lis: getComputedStyle(document.querySelector('.card[data-zone="Europe/Lisbon"] .hm')).opacity, time: document.getElementById('convTime').value,
          asleep: cs.filter((c) => c.classList.contains('asleep')).map((c) => getComputedStyle(c.querySelector('.hm')).opacity) };
      });
      check('360 ms after a scrub step the time is at full opacity, asleep cards stay at 0.72', fadeOp.time === '11:00' && fadeOp.lis === '1' && fadeOp.asleep.every((o) => o === '0.72'), JSON.stringify(fadeOp));
      await run(() => { document.getElementById('convClear').click(); if (document.activeElement) document.activeElement.blur(); });
      await sleep(100);

      // 5b3. Planner size: it opens at the size its content needs (measured by the renderer, not guessed): about 1056
      // wide and as tall as the head, the rows and the padding, from any window size, with no band above or below the grid.
      for (let n = (await run(cards)).length; n > 6; n--) { await run(menuAct, (await run(cards)).pop().zone, 'remove'); await sleep(100); }
      const planN = (await run(cards)).length;
      const planWa = require('electron').screen.getDisplayMatching(w.getBounds()).workArea;
      const planGeo = () => run(() => {
        const p = document.getElementById('planner'), body = document.getElementById('planBody'), head = p.querySelector('.plan-head').getBoundingClientRect();
        const rows = [...p.querySelectorAll('.plan-row')].map((r) => r.getBoundingClientRect());
        return { n: rows.length, headBottom: head.bottom, gridTop: rows[0] ? rows[0].top : 0, lastBottom: rows.length ? rows[rows.length - 1].bottom : 0, inner: window.innerHeight, innerW: window.innerWidth,
          fits: body.scrollHeight <= body.clientHeight + 1, moreBelow: p.classList.contains('more-below'), row: parseFloat(getComputedStyle(p).getPropertyValue("--plan-row")) };
      });
      const planStored = ((await run(async () => window.wc.getSettings())).viewSizes || {}).planner;
      const planStrip = w.getSize();
      await run(() => document.getElementById('btnPlanner').click()); await sleep(600);
      const planSz = w.getSize(), pg = await planGeo();
      await run(() => document.getElementById('btnPlanner').click()); await sleep(400);
      // (the harness's own setBounds above can leave the window a DIP or two off at fractional scaling; main's strip size
      // is the 1160x250 default)
      const planStripW = Math.min(1160, planWa.width), planStripH = Math.min(250, planWa.height);
      check(`planner opens at its content size with ${planN} cities: about 1056 wide, and the window hugs the grid (<= 40px under the last row)`, !planStored && planSz[0] >= 1000 && planSz[0] <= 1120
        && pg.inner - pg.lastBottom >= 0 && pg.inner - pg.lastBottom <= 40 && pg.gridTop - pg.headBottom <= 20, JSON.stringify({ planStored, planStrip, planSz, pg }));
      check('planner size: every row visible, no scroll fade, rows 24px', pg.n === planN && pg.fits && !pg.moreBelow && pg.row === 24, JSON.stringify(pg));
      out.push(`INFO planner size ${planSz} ${JSON.stringify(pg)}`);
      check('closing the planner returns to the strip size', Math.abs(w.getSize()[0] - planStripW) <= 1 && Math.abs(w.getSize()[1] - planStripH) <= 1, `${planStrip} -> ${w.getSize()}`);

      // 5b3b. From a big strip window the planner shrinks to its content (no empty band above the grid), a new city grows
      // it, and a size the user gave it is not stored or brought back.
      w.setBounds({ x: 40, y: 40, width: Math.min(1900, planWa.width), height: Math.min(670, planWa.height) }); await sleep(300); w.emit('resized'); await sleep(200);
      const bigStrip = w.getSize();
      await run(() => document.getElementById('btnPlanner').click()); await sleep(600);
      const bigPlan = w.getSize(), bg = await planGeo();
      check('planner from a big strip window shrinks to its content height, no empty band above the grid', bigPlan[1] < bigStrip[1] - 150 && bigPlan[1] === planSz[1] && bg.gridTop - bg.headBottom <= 20 && bg.inner - bg.lastBottom <= 40, JSON.stringify({ bigStrip, bigPlan, planSz, bg }));
      const lastCity = (await run(cards)).pop();
      await run(menuAct, lastCity.zone, 'remove'); await sleep(700);
      const fewer = w.getSize(), fg = await planGeo();
      await run(addFirst, lastCity.city); await sleep(700);
      const grown = w.getSize(), gg = await planGeo();
      check('adding a city grows the planner by one row (removing one shrinks it)', fg.n === planN - 1 && gg.n === planN && grown[1] >= fewer[1] + 24 && grown[1] <= fewer[1] + 40 && Math.abs(grown[1] - bigPlan[1]) <= 2 && gg.inner - gg.lastBottom <= 40 && gg.fits, JSON.stringify({ fewer, grown, bigPlan, fg, gg }));
      w.setBounds({ x: 40, y: 40, width: 1500, height: 640 }); await sleep(200); w.emit('resized'); await sleep(200);
      check('a manual resize of the open planner is respected while it stays open', Math.abs(w.getSize()[0] - 1500) <= 2 && Math.abs(w.getSize()[1] - 640) <= 2, String(w.getSize()));
      await run(() => document.getElementById('btnPlanner').click()); await sleep(400);
      await run(() => document.getElementById('btnPlanner').click()); await sleep(600);
      const reopened = w.getSize(), storedVs = (await run(async () => window.wc.getSettings())).viewSizes || {};
      check('the planner size is not stored and a reopened planner is at its content size again', !storedVs.planner && !storedVs.plannerVertical && Math.abs(reopened[0] - bigPlan[0]) <= 2 && Math.abs(reopened[1] - bigPlan[1]) <= 2, JSON.stringify({ reopened, bigPlan, storedVs }));
      await run(() => document.getElementById('btnPlanner').click()); await sleep(400);
      w.setBounds({ x: 40, y: 40, width: 1160, height: 250 }); await sleep(250); w.emit('resized'); await sleep(150);

      // 5c. Custom label via the card menu rename flow
      await run(() => {
        const card = document.querySelector('.card[data-zone="Europe/Lisbon"]');
        card.querySelector('.more').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        document.querySelector('#cardMenu [data-act="rename"]').click();
      });
      await sleep(100);
      const renamed = await run(() => {
        const inp = document.querySelector('.card[data-zone="Europe/Lisbon"] input.rename');
        if (!inp) return 'no input.rename';
        inp.value = 'Mom';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        return null;
      });
      await sleep(200);
      const lisCity = await run(() => document.querySelector('.card[data-zone="Europe/Lisbon"] .city')?.textContent);
      check('rename via card menu sets label "Mom"', !renamed && lisCity === 'Mom', renamed || lisCity);
      const savedLabels = (await run(async () => window.wc.getSettings())).labels || {};
      check('custom label persisted in main', savedLabels['Europe/Lisbon'] === 'Mom', JSON.stringify(savedLabels));

      // 5d. Copy converted times to the clipboard
      await run(setConv, '09:00', '2026-07-01', 'Europe/Lisbon');
      c = await run(cards);
      await require('electron').clipboard.writeText(''); // clipboard read/write return Promises since Electron 44
      await run(() => { document.getElementById('btnCopy').click(); document.querySelector('#copyMenu [data-copy="text"]').click(); }); // #btnCopy opens the copy menu
      await sleep(300);
      const clip = await require('electron').clipboard.readText();
      const missing = c.filter((x) => !clip.includes(x.city) || !clip.includes(x.hm)).map((x) => `${x.city} ${x.hm}`);
      check('copy puts every city and converted time on the clipboard', clip.length > 0 && missing.length === 0, `missing=[${missing.join('; ')}] clip=${JSON.stringify(clip.slice(0, 300))}`);
      await run(() => document.getElementById('convClear').click());

      // 5e. Vertical layout resizes the window
      await run(() => { const o = document.getElementById('optLayout'); o.value = 'vertical'; o.dispatchEvent(new Event('change')); });
      await sleep(400);
      const vert = await run(() => !!document.querySelector('.app.layout-vertical'));
      check('vertical layout applies .app.layout-vertical and width <= 400', vert && w.getSize()[0] <= 400, `${vert} size=${w.getSize()}`);
      const segFromSelect = await run(() => [...document.querySelectorAll('#layoutSwitch [data-layout]')].map((b) => `${b.dataset.layout}:${b.getAttribute('aria-pressed')}`).join(','));
      check('Settings #optLayout change updates the top-bar switch (aria-pressed)', segFromSelect === 'strip:false,compact:false,vertical:true', segFromSelect);
      await run(() => { const o = document.getElementById('optLayout'); o.value = 'strip'; o.dispatchEvent(new Event('change')); });
      await sleep(400);
      w.setBounds({ x: 40, y: 40, width: 1160, height: 250 }); await sleep(200);

      // 5e2. Top-bar layout switch (#layoutSwitch): toolbar of toggle buttons (aria-pressed) in .actions, clicks set settings.layout like the select
      const segState = () => {
        const g = document.getElementById('layoutSwitch'), tg = document.getElementById('btnLayout');
        const rs = [...g.querySelectorAll('[data-layout]')];
        return {
          role: g.getAttribute('role'), inActions: !!g.closest('.actions'), nextToPlanner: !!document.getElementById('btnPlanner') && g.closest('.actions') === document.getElementById('btnPlanner').parentElement,
          radios: rs.map((b) => `${b.dataset.layout}:${b.getAttribute('role') || b.tagName.toLowerCase()}:${b.getAttribute('aria-pressed')}:${b.tabIndex}`).join(','),
          labeled: rs.every((b) => b.getAttribute('aria-label') && b.title), iconOnly: rs.every((b) => b.textContent.trim() === '' && b.querySelector('svg')),
          segVisible: g.offsetParent !== null, toggleVisible: tg.offsetParent !== null, expanded: tg.getAttribute('aria-expanded'),
          opt: document.getElementById('optLayout').value, cls: document.getElementById('app').className,
        };
      };
      let ss = await run(segState);
      check('layout switch: toolbar with 3 icon-only toggle buttons in .actions next to the planner', ss.role === 'toolbar' && ss.inActions && ss.nextToPlanner && ss.labeled && ss.iconOnly
        && ss.radios === 'strip:button:true:0,compact:button:false:-1,vertical:button:false:-1', JSON.stringify(ss));
      check('layout switch: segments visible at full width, collapse button hidden', ss.segVisible && !ss.toggleVisible, JSON.stringify(ss));
      await run(() => document.querySelector('[data-layout="vertical"]').click());
      await sleep(400);
      ss = await run(segState);
      let lsMain = (await run(async () => window.wc.getSettings())).layout;
      check('clicking [data-layout="vertical"] applies .layout-vertical and resizes the window (<= 400 wide)', /\blayout-vertical\b/.test(ss.cls) && w.getSize()[0] <= 400, `${ss.cls} size=${w.getSize()}`);
      check('vertical via switch: aria-pressed, #optLayout and saved setting follow', ss.radios.startsWith('strip:button:false') && ss.radios.includes('vertical:button:true:0') && ss.opt === 'vertical' && lsMain === 'vertical', JSON.stringify({ ss, lsMain }));
      check('vertical: switch collapses to one button', ss.toggleVisible && !ss.segVisible, JSON.stringify(ss));
      const vfit = await run(() => {
        const W = window.innerWidth; const bad = [...document.querySelectorAll('.bar .actions > *, .bar .search-wrap')].filter((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && (r.right > W + 0.5 || r.left < -0.5); }).map((n) => n.id || n.className);
        const tops = [...document.querySelectorAll('.bar .actions > .icon-btn, #btnLayout')].filter((n) => n.offsetParent).map((n) => Math.round(n.getBoundingClientRect().top));
        return { W, bad, oneRow: new Set(tops).size === 1 };
      });
      check('vertical: every top-bar control fits the ~300px window on one row', vfit.bad.length === 0 && vfit.oneRow, JSON.stringify(vfit));
      await run(() => document.getElementById('btnLayout').click()); await sleep(150);
      const pop = await run(() => { const g = document.getElementById('layoutSwitch'); const r = g.getBoundingClientRect();
        return { visible: g.offsetParent !== null, expanded: document.getElementById('btnLayout').getAttribute('aria-expanded'), inside: r.left >= 0 && r.right <= window.innerWidth, focus: document.activeElement && document.activeElement.dataset.layout }; });
      check('vertical: collapse button opens the segments as a popover inside the window, focus on the current one', pop.visible && pop.expanded === 'true' && pop.inside && pop.focus === 'vertical', JSON.stringify(pop));
      await run(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
      ss = await run(segState);
      check('Escape closes the layout popover', !ss.segVisible && ss.expanded === 'false' && /\blayout-vertical\b/.test(ss.cls), JSON.stringify(ss));
      await run(() => document.querySelector('[data-layout="strip"]').click());
      await sleep(400);
      ss = await run(segState);
      lsMain = (await run(async () => window.wc.getSettings())).layout;
      check('clicking [data-layout="strip"] restores .layout-strip and the wide window', /\blayout-strip\b/.test(ss.cls) && !/\blayout-vertical\b/.test(ss.cls) && w.getSize()[0] > 400, `${ss.cls} size=${w.getSize()}`);
      check('strip via switch: aria-pressed, #optLayout and saved setting follow; segments visible again', ss.radios === 'strip:button:true:0,compact:button:false:-1,vertical:button:false:-1' && ss.opt === 'strip' && lsMain === 'strip' && ss.segVisible && !ss.toggleVisible, JSON.stringify({ ss, lsMain }));
      await run(() => document.querySelector('[data-layout="compact"]').click()); await sleep(300);
      ss = await run(segState);
      check('clicking [data-layout="compact"] applies .layout-compact', /\blayout-compact\b/.test(ss.cls) && ss.opt === 'compact' && ss.radios.includes('compact:button:true:0'), JSON.stringify(ss));
      await run(() => document.querySelector('[data-layout="strip"]').click()); await sleep(300);
      // Keyboard: arrows move focus between segments (roving tabindex) without switching; Enter picks.
      const arrow = (k) => run((k) => { document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); return { f: document.activeElement.dataset.layout, tab: [...document.querySelectorAll('#layoutSwitch [data-layout]')].map((b) => b.tabIndex).join(','), cls: document.getElementById('app').className }; }, k);
      await run(() => document.querySelector('[data-layout="strip"]').focus());
      let ak = await arrow('ArrowRight');
      check('ArrowRight moves focus to the next segment (roving tabindex), layout unchanged', ak.f === 'compact' && ak.tab === '-1,0,-1' && /\blayout-strip\b/.test(ak.cls), JSON.stringify(ak));
      ak = await arrow('ArrowRight'); const ak2 = await arrow('ArrowRight');
      check('arrows wrap around the segments', ak.f === 'vertical' && ak2.f === 'strip', JSON.stringify({ ak, ak2 }));
      ak = await arrow('ArrowLeft');
      check('ArrowLeft moves back (wraps to the last segment)', ak.f === 'vertical', JSON.stringify(ak));
      await run(() => document.querySelector('[data-layout="strip"]').focus());
      w.setBounds({ x: 40, y: 40, width: 1160, height: 250 }); await sleep(250);

      // 5e2b. Per-view window sizes: each view (strip/compact/vertical, map, planner) comes back at its last user size.
      // Programmatic setBounds may not fire 'resized', so emit it: that is the handler a user's frame resize runs.
      const userResize = async (width, height) => { w.setBounds({ x: 40, y: 40, width, height }); await sleep(150); w.emit('resized'); await sleep(100); };
      const pickLayout = async (l) => { await run((l) => document.querySelector(`[data-layout="${l}"]`).click(), l); await sleep(400); };
      const toggleMap = async () => { await run(() => document.getElementById('btnMap').click()); await sleep(350); };
      const wa = require('electron').screen.getDisplayMatching(w.getBounds()).workArea;
      const near = (sz, W, H) => Math.abs(sz[0] - Math.min(W, wa.width)) <= 2 && Math.abs(sz[1] - Math.min(H, wa.height)) <= 2;
      await userResize(1300, 300);
      await pickLayout('vertical');
      let vsz = w.getSize();
      check('view sizes: vertical from a 1300x300 strip is portrait and <= 400 wide', vsz[0] <= 400 && vsz[1] > vsz[0], String(vsz));
      await userResize(360, 700);
      await pickLayout('strip');
      vsz = w.getSize();
      check('view sizes: back to strip restores the user\'s 1300x300', near(vsz, 1300, 300), String(vsz));
      await pickLayout('vertical');
      vsz = w.getSize();
      check('view sizes: vertical again restores the user\'s 360x700', near(vsz, 360, 700), String(vsz));
      await pickLayout('strip');
      vsz = w.getSize();
      check('view sizes: strip again 1300x300', near(vsz, 1300, 300), String(vsz));
      const vsStored = ((await run(async () => window.wc.getSettings())).viewSizes || {}).strip || {};
      check('view sizes: the restored size is exactly the stored size (no DPI drift)', vsz[0] === vsStored.width && vsz[1] === vsStored.height, `${vsz} vs ${JSON.stringify(vsStored)}`);
      await pickLayout('vertical'); await pickLayout('strip');
      check('view sizes: a second round trip does not grow the window', String(w.getSize()) === String(vsz), `${w.getSize()} vs ${vsz}`);
      await toggleMap();
      vsz = w.getSize();
      check('view sizes: map opens at least 1160x360 (default from a 1300x300 strip)', vsz[0] >= Math.min(1160, wa.width) - 2 && vsz[1] >= Math.min(360, wa.height) - 2, String(vsz));
      await userResize(1200, 420);
      await toggleMap();
      vsz = w.getSize();
      check('view sizes: closing the map returns to the strip size', near(vsz, 1300, 300) && (await run(() => document.getElementById('mapView').hidden)), String(vsz));
      await toggleMap();
      vsz = w.getSize();
      check('view sizes: reopening the map restores the user\'s 1200x420', near(vsz, 1200, 420), String(vsz));
      await toggleMap();
      const vsMain = (await run(async () => window.wc.getSettings())).viewSizes || {};
      const nearObj = (o, W, H) => !!o && near([o.width, o.height], W, H);
      check('view sizes: stored per view in settings (strip, vertical, map)', nearObj(vsMain.strip, 1300, 300) && nearObj(vsMain.vertical, 360, 700) && nearObj(vsMain.map, 1200, 420), JSON.stringify(vsMain));
      const vsHostile = await run(async () => window.wc.setSettings({ viewSizes: { strip: { width: 5, height: 5 } } }));
      check('view sizes: renderer cannot write viewSizes', JSON.stringify(vsHostile.viewSizes) === JSON.stringify(vsMain), JSON.stringify(vsHostile.viewSizes));
      await userResize(1160, 250); // later tests expect the strip at 1160x250 as the user's size
      check('view sizes: strip back at 1160x250', near(w.getSize(), 1160, 250) && !(await run(() => document.getElementById('app').classList.contains('map-on'))), String(w.getSize()));

      // 5e3. Scaling: cards share the width, stay bounded in tall windows, digits grow with the card
      const cardGeo = () => {
        const s = document.getElementById('strip').getBoundingClientRect();
        const cs = [...document.querySelectorAll('.card[data-zone]')].map((c) => c.getBoundingClientRect());
        const hm = document.querySelector('.card[data-zone] .hm');
        return { n: cs.length, sl: s.left, sr: s.right, sh: s.height, first: cs[0] && cs[0].left, last: cs.length && cs[cs.length - 1].right,
          maxH: Math.max(...cs.map((r) => r.height)), minW: Math.min(...cs.map((r) => r.width)), maxW: Math.max(...cs.map((r) => r.width)),
          font: parseFloat(getComputedStyle(hm).fontSize), overflow: document.getElementById('strip').scrollWidth > document.getElementById('strip').clientWidth + 1 };
      };
      const g0 = await run(cardGeo);
      w.setBounds({ x: 40, y: 40, width: 1400, height: 560 }); await sleep(350);
      const g1 = await run(cardGeo);
      check('1400x560: cards do not stretch into tall columns (height bounded by width)', g1.maxH <= Math.max(216, g1.maxW * 1.15) + 2 && g1.maxH < g1.sh - 40, JSON.stringify(g1));
      w.setBounds({ x: 40, y: 40, width: 1920, height: 400 }); await sleep(350);
      const g2 = await run(cardGeo);
      const lGap = g2.first - g2.sl, rGap = g2.sr - g2.last;
      check('1920x400: cards fill the width evenly (no dead space at the right)', !g2.overflow && Math.abs(lGap - rGap) <= 3 && g2.maxW - g2.minW <= 2 && rGap < 40, JSON.stringify({ g2, lGap, rGap }));
      check('digits grow with the card (1920x400 larger than 1160x250)', g2.font > g0.font + 4, `${g0.font} -> ${g2.font}`);
      // Edge fades follow the strip's size (read after layout, not during render): none when every card fits, the end
      // fade when cards run past the right edge.
      const fadeAt = () => run(() => ({ end: document.getElementById('strip').classList.contains('overflow-end'), over: document.getElementById('strip').scrollWidth > document.getElementById('strip').clientWidth + 2 }));
      const fWide = await fadeAt();
      w.setBounds({ x: 40, y: 40, width: 700, height: 250 }); await sleep(350);
      const fNarrow = await fadeAt();
      check('strip edge fade: off when the cards fit, on when they run past the edge', !fWide.over && !fWide.end && fNarrow.over && fNarrow.end, JSON.stringify({ fWide, fNarrow }));
      w.setBounds({ x: 40, y: 40, width: 1160, height: 250 }); await sleep(300);
      const g3 = await run(cardGeo);
      check('1160x250: cards fill the strip height as before', g3.maxH >= g3.sh - 30, JSON.stringify(g3));

      // 5f. Keyboard reorder: Alt+ArrowRight on the first card moves it right
      const kOrder0 = (await run(cards)).map((x) => x.zone);
      await run(() => { const card = document.querySelector('.card[data-zone]'); card.focus(); card.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true, cancelable: true })); });
      await sleep(150);
      const kOrder1 = (await run(cards)).map((x) => x.zone);
      check('Alt+ArrowRight moves focused card right', kOrder1[0] === kOrder0[1] && kOrder1[1] === kOrder0[0], `${kOrder0.slice(0, 2)} -> ${kOrder1.slice(0, 2)}`);

      // 5g. Screen reader: dedicated announce region, strip itself not live
      const aria = await run(() => ({ announce: !!document.getElementById('announce'), live: document.getElementById('announce')?.getAttribute('aria-live'), strip: document.getElementById('strip')?.hasAttribute('aria-live') }));
      check('announce region exists and strip has no aria-live', aria.announce && !!aria.live && aria.strip === false, JSON.stringify(aria));
      c = await run(cards);

      // 6. Menu move left/right and disabled edges
      const order0 = c.map((x) => x.zone);
      r = await run(menuAct, order0[0], 'left');
      check('move left disabled on first card', r.disabled, JSON.stringify(r));
      r = await run(menuAct, order0[1], 'left');
      c = await run(cards);
      check('move left swaps first two', c[0].zone === order0[1] && c[1].zone === order0[0], c.map((x) => x.zone).slice(0, 2).join(','));
      r = await run(menuAct, c[c.length - 1].zone, 'right');
      check('move right disabled on last card', r.disabled, JSON.stringify(r));

      // 7. Search: keyboard navigation and dedupe of present zones (Singapore is a first-run card on every machine;
      // London is not when Lisbon, which has the same clock all year, comes first)
      let list = await run(search, 'singa');
      check('present Singapore excluded from search', !list.includes('Singapore'), list.join(','));
      await run(menuAct, 'Asia/Singapore', 'remove');
      list = await run(search, 'singa');
      check('Singapore first in search after removal', list[0] === 'Singapore', list.join(','));
      await run(key, 'ArrowDown'); await run(key, 'ArrowUp'); await run(key, 'Enter');
      c = await run(cards);
      check('Enter adds highlighted result (Singapore back)', !!byZone(c, 'Asia/Singapore'), c.map((x) => x.city).join(','));
      list = await run(search, 'zzzz');
      const hidden = await run(() => document.getElementById('zoneResults').hidden);
      check('no results hides dropdown', list.length === 0 && hidden, `${list.length} ${hidden}`);
      const emptyMsg = await run(() => { const s = document.getElementById('zoneSearch'); s.focus(); s.value = 'zzzz'; s.dispatchEvent(new Event('input')); const r = document.getElementById('zoneResults'); return { hidden: r.hidden, text: r.textContent, b: r.querySelectorAll('li b').length }; });
      check('focused search with no match says so', !emptyMsg.hidden && emptyMsg.text === 'No matching cities' && emptyMsg.b === 0, JSON.stringify(emptyMsg));
      const dupMsg = await run(() => { const s = document.getElementById('zoneSearch'); s.value = 'Singap'; s.dispatchEvent(new Event('input')); return document.getElementById('zoneResults').textContent; });
      check('searching a city already added says it is on the list', dupMsg === 'Singapore is already on your list', dupMsg);
      const accent = await run(() => { const s = document.getElementById('zoneSearch'); s.value = 'sao pa'; s.dispatchEvent(new Event('input')); const r = [...document.querySelectorAll('#zoneResults li b')].map((b) => b.textContent); s.value = ''; s.dispatchEvent(new Event('input')); s.blur(); return r; });
      check('search ignores accents ("sao pa" finds São Paulo)', accent.includes('São Paulo') || (await run(() => [...document.querySelectorAll('.card[data-zone]')].some((c) => c.dataset.zone === 'America/Sao_Paulo'))), accent.join(','));
      list = await run(search, 'hkt');
      check('alias search hkt finds Hong Kong', list.includes('Hong Kong'), list.join(','));
      list = await run(search, 'bengaluru');
      check('present zones excluded from search (Kolkata via alias)', !list.includes('Mumbai'), list.join(','));
      await run(search, '');

      // 8. 12-hour mode
      await run(() => { const o = document.getElementById('optHour24'); o.checked = false; o.dispatchEvent(new Event('change')); });
      await sleep(150);
      c = await run(cards);
      check('12h mode shows AM/PM and no leading zero', c.every((x) => /^(AM|PM)$/.test(x.ampm)) && c.every((x) => !/^0\d:/.test(x.hm)), c.map((x) => x.hm + x.ampm).join(','));
      await run(() => { const o = document.getElementById('optHour24'); o.checked = true; o.dispatchEvent(new Event('change')); });
      await sleep(150);

      // 9. Hostile settings via IPC are rejected or clamped (direct IPC bypasses the renderer state, so a UI save follows)
      const hostile = await run(async () => window.wc.setSettings({ opacity: 5, theme: 'neon', zones: ['Bad/Zone', 'Europe/Paris', 'Europe/Paris'], hour12: 'yes', bounds: { x: 1 }, evil: 1 }));
      check('opacity clamped to 1', hostile.opacity === 1, hostile.opacity);
      check('invalid theme rejected', hostile.theme === 'system', hostile.theme);
      check('invalid + duplicate zones filtered', JSON.stringify(hostile.zones) === JSON.stringify(['Europe/Paris']), JSON.stringify(hostile.zones));
      check('non-boolean hour12 rejected', hostile.hour12 === false, hostile.hour12);
      check('unknown key ignored', !('evil' in hostile), Object.keys(hostile).join(','));
      const hostile2 = await run(async () => window.wc.setSettings({ opacity: 0.3, zoom: 99 }));
      check('opacity below 0.6 clamped to 0.6 (text stays readable)', hostile2.opacity === 0.6, hostile2.opacity);
      const hostile3 = await run(async () => window.wc.setSettings({ zoom: 'big' }));
      check('zoom clamped to 3.8 (200%), non-number rejected', hostile2.zoom === 3.8 && hostile3.zoom === 3.8, `${hostile2.zoom} ${hostile3.zoom}`);
      await run(async () => window.wc.setSettings({ zoom: 0 }));
      await sleep(300);
      // Renderer path: a UI add must leave renderer and main in agreement after main's validation.
      await run(addFirst, 'paris');
      await sleep(200);
      c = await run(cards);
      const mainZones = (await run(async () => window.wc.getSettings())).zones;
      check('renderer and main agree on zones after UI add', JSON.stringify(mainZones) === JSON.stringify(c.map((x) => x.zone)) && mainZones.includes('Europe/Paris'), `main=${JSON.stringify(mainZones)} renderer=${JSON.stringify(c.map((x) => x.zone))}`);
      // Reduce to Paris only for the empty-state test
      await run(async () => window.wc.setSettings({ zones: ['Europe/Paris'] }));
      await run(addFirst, 'rome');
      await sleep(200);
      c = await run(cards);
      check('renderer adopts main state on next save', c.length >= 2 && c.some((x) => x.zone === 'Europe/Rome'), c.map((x) => x.zone).join(','));
      for (const z of c.map((x) => x.zone).filter((z) => z !== 'Europe/Paris')) await run(menuAct, z, 'remove');
      await sleep(100);
      await run(async () => window.wc.setSettings({ opacity: 0.85 }));

      // 10. Empty state
      await run(menuAct, 'Europe/Paris', 'remove');
      c = await run(cards);
      const addVisible = await run(() => document.getElementById('zoneSearch').offsetWidth > 0);
      const convOpts = await run(() => [...document.getElementById('convZone').options].map((o) => o.value));
      check('empty state message shown', await run(() => !!document.querySelector('.empty')), 'no .empty');
      check('empty state: zero cards, add-city search visible', c.length === 0 && addVisible, `${c.length} ${addVisible}`);
      check('empty state: converter still offers local', convOpts.length === 1, convOpts.join(','));

      // 11. Theme switching
      for (const t of ['light', 'dark', 'system']) {
        await run((th) => { const o = document.getElementById('optTheme'); o.value = th; o.dispatchEvent(new Event('change')); }, t);
        await sleep(80);
        const attr = await run(() => document.documentElement.dataset.theme);
        check(`theme ${t} applied`, attr === t, attr);
      }

      // 12. Settings panel toggle and Escape
      const szBefore = w.getSize();
      await run(() => document.getElementById('btnSettings').click()); await sleep(200);
      check('settings open grows window to fit', w.getSize()[1] >= 600 || w.getSize()[1] >= require('electron').screen.getPrimaryDisplay().workArea.height - 2, String(w.getSize()));
      let ph = await run(() => document.getElementById('settingsPanel').hidden);
      check('settings panel opens', ph === false, ph);
      await run(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
      ph = await run(() => document.getElementById('settingsPanel').hidden);
      check('Escape closes panel', ph === true, ph);
      await sleep(200);
      check('closing settings restores window size', Math.abs(w.getSize()[1] - szBefore[1]) <= 2, `${szBefore} -> ${w.getSize()}`);

      await addAll(['chicago', 'berlin']);
      await sleep(150);
      const tzn = await run(() => ['America/Chicago', 'Europe/Berlin'].map((z) => document.querySelector(`.card[data-zone="${z}"] .tzname`)?.textContent || ''));
      check('US zone shows abbreviation (CST/CDT)', /^C[SD]T/.test(tzn[0] || ''), tzn.join(' | '));
      const tzTitle = await run(() => document.querySelector('.card[data-zone="Europe/Berlin"] .tzname')?.title || '');
      check('non-US zone keeps readable name in tooltip', /Central European/.test(tzTitle), tzTitle);
      const sv = await run(() => { const r = document.getElementById('zoneSearch').getBoundingClientRect(); return r.right <= window.innerWidth && r.width > 0; });
      check('add-city search visible in top bar', sv, sv);
      const p1 = await run(() => document.getElementById('btnPin').getAttribute('aria-pressed'));
      await run(() => document.getElementById('btnPin').click()); await sleep(150);
      const p2 = await run(() => document.getElementById('btnPin').getAttribute('aria-pressed'));
      check('pin button toggles always-on-top', p1 !== p2 && w.isAlwaysOnTop() === (p2 === 'true'), `${p1} -> ${p2}, window=${w.isAlwaysOnTop()}`);
      await run(() => document.getElementById('btnPin').click()); await sleep(150);
      check('pin button restores state', w.isAlwaysOnTop() === (p1 === 'true'), String(w.isAlwaysOnTop()));
      const dragBy = (sel) => run(async (sel) => { const t = document.querySelector(sel); const o = { bubbles: true, cancelable: true, pointerId: 9, button: 0, isPrimary: true };
        const ev = (type, d) => t.dispatchEvent(new PointerEvent(type, { ...o, screenX: 400 + d, screenY: 300 + d }));
        ev('pointerdown', 0); for (let i = 1; i <= 5; i++) { ev('pointermove', i * 10); await new Promise((r) => setTimeout(r, 15)); } ev('pointerup', 50); }, sel);
      const pos0 = w.getPosition(); await dragBy('.bar .converter'); await sleep(150); const pos1 = w.getPosition();
      check('dragging background moves the window', Math.abs(pos1[0] - pos0[0] - 50) <= 2 && Math.abs(pos1[1] - pos0[1] - 50) <= 2, `${pos0} -> ${pos1}`);
      const sz0 = w.getSize(); for (let k = 0; k < 20; k++) await dragBy('.bar .converter'); await sleep(150);
      check('window size does not grow over 20 drags', Math.abs(w.getSize()[0] - sz0[0]) <= 2 && Math.abs(w.getSize()[1] - sz0[1]) <= 2, `${sz0} -> ${w.getSize()}`);
      const posAfter = w.getPosition();
      await dragBy('.card[data-zone]'); await sleep(150);
      check('dragging a card does not move the window', String(w.getPosition()) === String(posAfter), `${posAfter} -> ${w.getPosition()}`);
      // 12b. Batch 1: sun-driven night, asleep cue, wheel scrubber, abbreviation/offset search
      for (const z of ['America/Los_Angeles', 'Asia/Tokyo']) if (await run((z) => !!document.querySelector(`.card[data-zone="${z}"]`), z)) await run(menuAct, z, 'remove');
      await addAll(['Lisbon', 'Auckland', 'Reykjavik']);
      await sleep(150);
      const cardState = (z) => { const c = document.querySelector(`.card[data-zone="${z}"]`); if (!c) return null;
        return { night: c.classList.contains('is-night'), asleep: c.classList.contains('asleep'), moon: !c.querySelector('.moon').hidden,
          hm: c.querySelector('.hm').textContent, converted: c.classList.contains('converted'), phase: c.querySelector('.phase').textContent, title: c.querySelector('.phase').title }; };
      await run(setConv, '12:00', '2026-06-21', 'Europe/Lisbon');
      let st = await run(cardState, 'Pacific/Auckland');
      check('sun: Auckland is night at 12:00 Lisbon on Jun 21', st && st.night && st.phase === 'Night', JSON.stringify(st));
      st = await run(cardState, 'Europe/Lisbon');
      check('sun: Lisbon midday is day with sunrise/sunset title', st && !st.night && st.phase === 'Midday' && /^Sunrise \d\d:\d\d · Sunset \d\d:\d\d$/.test(st.title), JSON.stringify(st));
      await run(setConv, '22:30', '2026-06-21', 'Europe/Lisbon');
      st = await run(cardState, 'Atlantic/Reykjavik');
      check('sun: Reykjavik 21:30 in June is still day (hour rule would say night)', st && st.hm === '21:30' && !st.night, JSON.stringify(st));
      await run(setConv, '03:00', '2026-06-21', 'Europe/Lisbon');
      st = await run(cardState, 'Europe/Lisbon');
      const stAk = await run(cardState, 'Pacific/Auckland');
      check('asleep: Lisbon at 03:00 is dimmed with moon', st && st.asleep && st.moon, JSON.stringify(st));
      check('asleep: Auckland at 14:00 is awake', stAk && !stAk.asleep && !stAk.moon, JSON.stringify(stAk));
      // on the digits: they always scrub, whether or not the cards overflow (elsewhere on a card the wheel then scrolls)
      const wheel = (z) => { document.querySelector(`.card[data-zone="${z}"] .display`).dispatchEvent(new WheelEvent('wheel', { deltaY: 100, deltaMode: 0, bubbles: true, cancelable: true })); };
      await run(setConv, '10:00', '2026-06-21', 'Europe/Lisbon');
      await run(wheel, 'Pacific/Auckland'); await sleep(200);
      st = await run(cardState, 'Europe/Lisbon');
      const tv15 = await run(() => document.getElementById("convTime").value);
      check('wheel over a card shifts converter by 15 minutes', st.hm === "10:15" && tv15 === "10:15", `${st.hm} ${tv15}`);
      await run(() => document.getElementById('convClear').click()); await sleep(100);
      st = await run(cardState, 'Europe/Lisbon');
      check('asleep cue not applied in live mode', !st.asleep && !st.moon && !st.converted, JSON.stringify(st));
      await run(wheel, 'Europe/Lisbon'); await sleep(200);
      st = await run(cardState, 'Europe/Lisbon');
      const clearVisible = await run(() => !document.getElementById('convClear').hidden);
      check('wheel in live mode enters convert mode', st.converted && clearVisible, JSON.stringify(st));
      await run(() => document.getElementById('convClear').click()); await sleep(100);
      list = await run(search, 'pst');
      check('search "pst" finds Los Angeles', list[0] === 'Los Angeles', list.join(','));
      list = await run(search, '+9');
      const offRow = await run(() => document.querySelector('#zoneResults li .muted')?.textContent || '');
      check('search "+9" finds Tokyo with offset shown', list.includes('Tokyo') && /UTC\+9/.test(offRow), `${list.join(',')} | ${offRow}`);
      list = await run(search, 'GMT-3');
      check('search "GMT-3" finds São Paulo or Buenos Aires', list.some((x) => /S.o Paulo|Buenos Aires/.test(x)), list.join(','));
      await run(key, 'Escape');

      // 14. Batch 2: planner, working hours, clock-change notes, date shortcuts, sky wiring
      const setZonesUI = async (want, queries) => {
        for (const z of (await run(cards)).map((x) => x.zone)) if (!want.includes(z)) await run(menuAct, z, 'remove');
        for (let i = 0; i < want.length; i++) if (!(await run((z) => !!document.querySelector(`.card[data-zone="${z}"]`), want[i]))) await run(addFirst, queries[i]);
        await sleep(150);
        return (await run(cards)).map((x) => x.zone);
      };
      const planState = () => ({
        hidden: document.getElementById('planner').hidden,
        shown: document.getElementById('planner').offsetParent !== null,
        stripShown: document.getElementById('strip').offsetParent !== null,
        pressed: document.getElementById('btnPlanner').getAttribute('aria-pressed'),
        rows: [...document.querySelectorAll('#planner .plan-row')].map((r) => r.dataset.zone),
        cells: [...document.querySelectorAll('#planner .plan-row')].map((r) => r.querySelectorAll('.plan-cell').length),
        summary: document.getElementById('plannerSummary').textContent,
        overlaps: document.querySelectorAll('#planner .plan-overlap').length,
        best: !document.getElementById('plannerBest').hidden, bestBands: document.querySelectorAll('#planner .plan-best').length,
      });
      // Independent overlap math: default hours (Mon-Fri 09:00-18:00) for every zone; an hour counts when the
      // whole hour is inside working time. Source is Lisbon on 2026-07-01/04 (UTC+1 all day).
      const expectOverlap = (zones, ymd) => {
        const [y, m, d] = ymd.split('-').map(Number);
        const wall = (z, ms) => { const p = {}; for (const x of new Intl.DateTimeFormat('en-US', { timeZone: z, weekday: 'short', hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ms))) p[x.type] = x.value; return { wd: p.weekday, min: (+p.hour % 24) * 60 + +p.minute }; };
        const work = (z, ms) => { const w = wall(z, ms); return w.wd !== 'Sat' && w.wd !== 'Sun' && w.min >= 540 && w.min < 1080; };
        const hrs = [];
        for (let h = 0; h < 24; h++) { const ms = Date.UTC(y, m - 1, d, h) - 3600000; if (zones.every((z) => work(z, ms) && work(z, ms + 59 * 60000))) hrs.push(h); }
        return { n: hrs.length, first: hrs[0], last: hrs[hrs.length - 1] };
      };
      // The source label is whatever the Lisbon card shows (an earlier test renames it).
      const expectText = (e, lab) => (e.n ? `${e.n} h overlap · ${String(e.first).padStart(2, '0')}:00 to ${String((e.last + 1) % 24).padStart(2, '0')}:00 (${lab})` : 'No overlap');

      // 12c. Wheel over a card: with more cards than fit it scrolls to them (only the digits and the day line scrub the
      // time); with every card on screen the whole card scrubs.
      const wheelAt = (sel) => {
        const ok = document.querySelector(sel).dispatchEvent(new WheelEvent('wheel', { deltaY: 100, deltaMode: 0, bubbles: true, cancelable: true }));
        const s = document.getElementById('strip');
        return { notPrevented: ok, time: document.getElementById('convTime').value, top: s.scrollTop, left: s.scrollLeft };
      };
      const stripScroll = () => { const s = document.getElementById('strip'); return { top: s.scrollTop, left: s.scrollLeft, down: s.scrollHeight > s.clientHeight + 1, side: s.scrollWidth > s.clientWidth + 1, time: document.getElementById('convTime').value }; };
      const wz = await setZonesUI(['Europe/Lisbon', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'Europe/Berlin'],
        ['Lisbon', 'New York', 'Los Angeles', 'London', 'Singapore', 'Tokyo', 'Sydney', 'Berlin']);
      await run(() => document.getElementById('convClear').click());
      await pickLayout('vertical');
      w.setBounds({ x: 40, y: 40, width: 300, height: 640 }); await sleep(400);
      await run(() => { document.getElementById('strip').scrollTop = 0; }); await sleep(150);
      const vSel = '.card[data-zone="America/New_York"] .head-text';
      const vPre = await run(stripScroll);
      const vHead = await run(wheelAt, vSel);
      check('wheel, vertical 300x640 with 8 cities: a wheel on a card name is left to the list (not defaultPrevented), no conversion', wz.length === 8 && vPre.down && vHead.notPrevented && vHead.time === '', JSON.stringify({ wz, vPre, vHead }));
      const vPt = await run((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; }, vSel);
      w.show(); w.focus(); w.webContents.focus();
      w.webContents.sendInputEvent({ type: 'mouseWheel', x: vPt.x, y: vPt.y, deltaX: 0, deltaY: -120, wheelTicksX: 0, wheelTicksY: -1, canScroll: true });
      await waitFor(async () => (await run(stripScroll)).top > vPre.top);
      await sleep(100);
      const vAfter = await run(stripScroll);
      check('wheel, vertical: a trusted wheel over a card name scrolls the list down, converter untouched', vAfter.top > vPre.top && vAfter.time === '', JSON.stringify({ vPt, vPre, vAfter }));
      await run(setConv, '10:00', '2026-06-21', 'Europe/Lisbon');
      const vDisp = await run(wheelAt, '.card[data-zone="America/New_York"] .display'); await sleep(200);
      const vConv = await run(() => document.getElementById('convTime').value);
      check('wheel, vertical: a wheel on the digits still converts by 15 minutes', !vDisp.notPrevented && vConv === '10:15', JSON.stringify({ vDisp, vConv }));
      await run(() => document.getElementById('convClear').click()); await sleep(100);
      await pickLayout('strip');
      w.setBounds({ x: 40, y: 40, width: 1160, height: 250 }); await sleep(400);
      await run(menuAct, 'Europe/Berlin', 'remove'); await sleep(200);
      await run(() => { document.getElementById('strip').scrollLeft = 0; }); await sleep(150);
      const sPre = await run(stripScroll);
      await run(wheelAt, '.card[data-zone="America/New_York"] .head-text');
      await waitFor(async () => (await run(stripScroll)).left > sPre.left);
      const sAfter = await run(stripScroll);
      check('wheel, strip 1160x250 with 7 cities: a wheel on a card name scrolls sideways to the hidden cards, no conversion', (await run(cards)).length === 7 && sPre.side && sAfter.left > sPre.left && sAfter.time === '', JSON.stringify({ sPre, sAfter }));
      await run(menuAct, 'Australia/Sydney', 'remove'); await run(menuAct, 'Asia/Tokyo', 'remove'); await sleep(250);
      const fPre = await run(stripScroll);
      const fHead = await run(wheelAt, '.card[data-zone="America/New_York"] .head-text'); await sleep(200);
      const fConv = await run(() => ({ time: document.getElementById('convTime').value, converting: !document.getElementById('convClear').hidden }));
      check('wheel, 5 cities at 1160 (every card fits): a wheel on a card name still converts', (await run(cards)).length === 5 && !fPre.side && !fHead.notPrevented && fConv.converting && /^\d\d:\d\d$/.test(fConv.time), JSON.stringify({ fPre, fHead, fConv }));
      await run(() => { document.getElementById('convClear').click(); if (document.activeElement) document.activeElement.blur(); }); await sleep(100);

      // 14a. Sky wiring and data-epoch
      const sky = await run(() => {
        const links = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute('href'));
        const scripts = [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src'));
        return { css: links.indexOf('motion/sky.css') > links.indexOf('motion/ambient.css'), js: scripts.indexOf('motion/sky.js') > scripts.indexOf('sun.js') && scripts.indexOf('motion/sky.js') < scripts.indexOf('app.js') };
      });
      check('sky.css and sky.js wired (after the other motion files, before app.js)', sky.css && sky.js, JSON.stringify(sky));
      const liveEpochs = await run(() => [...document.querySelectorAll('.card[data-zone]')].map((c) => +c.dataset.epoch));
      check('live cards carry data-epoch = now (to the minute)', liveEpochs.length > 0 && liveEpochs.every((e) => Math.abs(e - Date.now()) < 120000), JSON.stringify(liveEpochs));
      await run(setConv, '12:00', '2026-07-01', 'Europe/Lisbon');
      const convEpochs = await run(() => [...document.querySelectorAll('.card[data-zone]')].map((c) => c.dataset.epoch));
      check('converted cards carry data-epoch = converted instant', convEpochs.every((e) => e === String(Date.UTC(2026, 6, 1, 11))), JSON.stringify(convEpochs));

      // 14b. Planner with an all-overlap pair (Lisbon + London share a clock)
      let zs = await setZonesUI(['Europe/Lisbon', 'Europe/London'], ['Lisbon', 'London']);
      check('planner test zones set to Lisbon + London', JSON.stringify(zs) === JSON.stringify(['Europe/Lisbon', 'Europe/London']), JSON.stringify(zs));
      const lisLabel = await run(() => document.querySelector('.card[data-zone="Europe/Lisbon"] .city').textContent);
      await run(setConv, '10:00', '2026-07-01', 'Europe/Lisbon'); // a Wednesday
      await run(() => document.getElementById('btnPlanner').click()); await sleep(150);
      let ps = await run(planState);
      check('planner toggle shows #planner and hides the strip', !ps.hidden && ps.shown && !ps.stripShown && ps.pressed === 'true', JSON.stringify(ps));
      check('planner: one .plan-row per city in zones order, 24 cells each', JSON.stringify(ps.rows) === JSON.stringify(zs) && ps.cells.every((n) => n === 24), JSON.stringify(ps));
      let exp = await run(expectOverlap, zs, '2026-07-01');
      check('planner: Lisbon + London report a full overlap band', exp.n === 9 && ps.summary === expectText(exp, lisLabel) && ps.overlaps >= 1, `${ps.summary} | expected ${expectText(exp, lisLabel)} overlaps=${ps.overlaps}`);
      check('planner setting persisted in main', (await run(async () => window.wc.getSettings())).planner === true, '');
      check('planner: full overlap shows no best-hours button or band', !ps.best && ps.bestBands === 0, JSON.stringify(ps));

      // 14c. Lisbon + Tokyo (8 h apart): short or no overlap, matching the math; London + Lisbon + Tokyo same
      await run(addFirst, 'Tokyo'); await sleep(150);
      ps = await run(planState);
      exp = await run(expectOverlap, ps.rows, '2026-07-01');
      check('planner rebuilds with 3 rows after adding Tokyo', ps.rows.length === 3 && ps.rows[2] === 'Asia/Tokyo', JSON.stringify(ps.rows));
      check('planner: Lisbon + London + Tokyo summary matches the math', ps.summary === expectText(exp, lisLabel) && (exp.n ? ps.overlaps >= 1 : ps.overlaps === 0), `${ps.summary} | expected ${expectText(exp, lisLabel)}`);
      await run(menuAct, 'Europe/London', 'remove'); await sleep(150);
      ps = await run(planState);
      exp = await run(expectOverlap, ['Europe/Lisbon', 'Asia/Tokyo'], '2026-07-01');
      check('planner: Lisbon + Tokyo default hours consistent with the math', JSON.stringify(ps.rows) === JSON.stringify(['Europe/Lisbon', 'Asia/Tokyo']) && ps.summary === expectText(exp, lisLabel) && (exp.n ? ps.overlaps >= 1 : ps.overlaps === 0), `${ps.summary} | expected ${expectText(exp, lisLabel)} overlaps=${ps.overlaps}`);
      check('planner: two cities that never work at the same time show no best hours', !ps.best && ps.bestBands === 0, JSON.stringify(ps));
      await run(setConv, '10:00', '2026-07-04', 'Europe/Lisbon'); // Saturday
      ps = await run(planState);
      check('planner: weekend date reports "No overlap" and no best hours', ps.summary === 'No overlap' && ps.overlaps === 0 && !ps.best && ps.bestBands === 0, JSON.stringify(ps));

      // 14d. Clicking a planner cell enters convert mode at that hour; arrows move the focused hour
      await run(() => document.getElementById('convClear').click()); await sleep(100);
      await run(() => document.querySelector('#planner .plan-row[data-zone="Asia/Tokyo"] .plan-cell[data-h="14"]').click());
      await sleep(100);
      let pc = await run(() => ({ time: document.getElementById('convTime').value, clear: !document.getElementById('convClear').hidden,
        lis: document.querySelector('.card[data-zone="Europe/Lisbon"] .hm').textContent, conv: [...document.querySelectorAll('.card[data-zone]')].every((c) => c.classList.contains('converted')),
        sel: [...document.querySelectorAll('#planner .plan-cell.sel')].map((c) => c.dataset.h), now: !document.querySelector('#planner .plan-now').hidden && document.querySelector('#planner .plan-now').classList.contains('converted') }));
      check('planner cell click converts at that source hour', pc.time === '14:00' && pc.clear && pc.lis === '14:00' && pc.conv && pc.sel.length === 2 && pc.sel.every((h) => h === '14') && pc.now, JSON.stringify(pc));
      await run(() => { const c = document.querySelector('#planner .plan-row[data-zone="Asia/Tokyo"] .plan-cell[data-h="14"]'); c.focus(); c.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); });
      await sleep(100);
      pc = await run(() => ({ time: document.getElementById('convTime').value, focus: document.activeElement && document.activeElement.dataset.h, row: document.activeElement && document.activeElement.closest('.plan-row')?.dataset.zone }));
      check('ArrowRight on a planner cell moves the focused hour and converter to 15:00', pc.time === '15:00' && pc.focus === '15' && pc.row === 'Asia/Tokyo', JSON.stringify(pc));
      await run(() => { document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })); });
      pc = await run(() => ({ time: document.getElementById('convTime').value, focus: document.activeElement && document.activeElement.dataset.h, row: document.activeElement && document.activeElement.closest('.plan-row')?.dataset.zone }));
      check('ArrowUp moves focus to the same hour in the row above', pc.time === '15:00' && pc.focus === '15' && pc.row === 'Europe/Lisbon', JSON.stringify(pc));

      // 14d2. No hour works for everyone: the planner points at the best partial hours (dashed band and a "Best" button)
      const five = await setZonesUI(['America/Sao_Paulo', 'Europe/Lisbon', 'America/New_York', 'America/Los_Angeles', 'Asia/Singapore'], ['Sao Paulo', 'Lisbon', 'New York', 'Los Angeles', 'Singapore']);
      await run(setConv, '10:00', '2026-09-24', 'America/New_York'); await sleep(150); // a Thursday
      const bestState = () => {
        const b = document.getElementById('plannerBest');
        return { summary: document.getElementById('plannerSummary').textContent, hidden: b.hidden, visible: !b.hidden && b.offsetParent !== null, text: b.textContent,
          title: b.title, label: b.getAttribute('aria-label'), whole: b.scrollWidth <= b.clientWidth + 1,
          bands: document.querySelectorAll('#planner .plan-best').length, overlaps: document.querySelectorAll('#planner .plan-overlap').length };
      };
      let bs = await run(bestState);
      check('planner, 5 cities and no shared hour (New York, Thu Sep 24 2026): "No overlap" and "Best: 12:00 to 13:00 (New York), 4 of 5 working"', five.length === 5 && bs.summary === 'No overlap'
        && bs.visible && bs.text === 'Best: 12:00 to 13:00 (New York), 4 of 5 working' && bs.whole, JSON.stringify({ five, bs }));
      check('planner best hours: the title and name list Singapore 00:00 outside its hours; one dashed band, no overlap band', /Singapore 00:00/.test(bs.title) && bs.label === bs.title && bs.bands === 1 && bs.overlaps === 0, JSON.stringify(bs));
      await run(() => document.getElementById('plannerBest').click()); await sleep(150);
      const bc = await run(() => ({ time: document.getElementById('convTime').value, zone: document.getElementById('convZone').value, ny: document.querySelector('.card[data-zone="America/New_York"] .hm').textContent }));
      check('clicking the best hours converts at 12:00 with New York as the source', bc.time === '12:00' && bc.zone === 'America/New_York' && bc.ny === '12:00', JSON.stringify(bc));
      await run(setConv, '10:00', '2026-07-04', 'America/New_York'); await sleep(100); // Saturday
      bs = await run(bestState);
      check('planner best hours hidden on a weekend', bs.hidden && bs.bands === 0 && bs.summary === 'No overlap', JSON.stringify(bs));
      await setZonesUI(['Europe/Lisbon', 'Asia/Tokyo'], ['Lisbon', 'Tokyo']);
      await run(() => document.getElementById('btnPlanner').click()); await sleep(150);
      ps = await run(planState);
      check('planner toggle off hides #planner and restores the strip', ps.hidden && ps.stripShown && ps.pressed === 'false' && (await run(async () => window.wc.getSettings())).planner === false, JSON.stringify(ps));

      // 14e. Working-hours editor
      const lisState = () => { const c = document.querySelector('.card[data-zone="Europe/Lisbon"]'); return { working: c.classList.contains('working'), offDay: c.classList.contains('off-day'), ws: c.style.getPropertyValue('--ws'), we: c.style.getPropertyValue('--we') }; };
      const editHours = (start, end, toggle) => {
        const ed = document.getElementById('hoursEditor');
        if (ed.hidden) return 'editor hidden';
        const s = document.getElementById('hoursStart'), e = document.getElementById('hoursEnd');
        if (start !== null) { s.value = start; s.dispatchEvent(new Event('input')); }
        if (end !== null) { e.value = end; e.dispatchEvent(new Event('input')); }
        for (const wd of toggle || []) document.querySelector(`#hoursDays .day-pill[data-wd="${wd}"]`).click();
        const disabled = document.getElementById('hoursSave').disabled;
        document.getElementById('hoursSave').click();
        return { disabled, hiddenAfter: ed.hidden };
      };
      await run(setConv, '19:00', '2026-07-01', 'Europe/Lisbon'); // Wednesday 19:00
      let ls = await run(lisState);
      check('default hours: Lisbon 19:00 is not working', !ls.working, JSON.stringify(ls));
      await run(menuAct, 'Europe/Lisbon', 'hours'); await sleep(100);
      const ed0 = await run(() => ({ hidden: document.getElementById('hoursEditor').hidden, s: document.getElementById('hoursStart').value, e: document.getElementById('hoursEnd').value,
        pills: document.querySelectorAll('#hoursDays .day-pill').length, on: [...document.querySelectorAll('#hoursDays .day-pill[aria-pressed="true"]')].map((b) => b.dataset.wd).join(','),
        first: document.querySelector('#hoursDays .day-pill')?.textContent, focus: document.activeElement?.id }));
      check('menu "Working hours…" opens the editor with defaults', !ed0.hidden && ed0.s === '09:00' && ed0.e === '18:00' && ed0.pills === 7 && ed0.on === '1,2,3,4,5' && ed0.first === 'Mon' && ed0.focus === 'hoursStart', JSON.stringify(ed0));
      const bad = await run(() => { const s = document.getElementById('hoursStart'), e = document.getElementById('hoursEnd'); s.value = '9'; e.value = '9:00'; e.dispatchEvent(new Event('input')); return { disabled: document.getElementById('hoursSave').disabled, note: document.getElementById('hoursNote').textContent }; });
      check('editor rejects equal start and end', bad.disabled && /different/.test(bad.note), JSON.stringify(bad));
      let er = await run(editHours, '10', '20', []);
      await sleep(250);
      ls = await run(lisState);
      let mainHours = (await run(async () => window.wc.getSettings())).hours || {};
      check('hours editor saves 10:00-20:00 and Lisbon 19:00 becomes working', !er.disabled && er.hiddenAfter && ls.working && Math.abs(+ls.ws - 10 / 24) < 0.001 && Math.abs(+ls.we - 20 / 24) < 0.001, JSON.stringify({ er, ls }));
      check('hours persisted in main', JSON.stringify(mainHours['Europe/Lisbon']) === JSON.stringify({ start: '10:00', end: '20:00', days: [1, 2, 3, 4, 5] }), JSON.stringify(mainHours));
      await run(menuAct, 'Europe/Lisbon', 'hours'); await sleep(50);
      er = await run(editHours, null, null, [3]); // Wednesday off
      await sleep(250);
      ls = await run(lisState);
      mainHours = (await run(async () => window.wc.getSettings())).hours || {};
      check('turning Wednesday off makes Wednesday 19:00 not working (off-day band)', !ls.working && ls.offDay && JSON.stringify(mainHours['Europe/Lisbon']?.days) === '[1,2,4,5]', JSON.stringify({ ls, h: mainHours['Europe/Lisbon'] }));
      // Overnight shift 22:00-06:00, Mon-Fri: Saturday 02:00 is the tail of Friday's shift, Sunday 02:00 is not.
      await run(menuAct, 'Europe/Lisbon', 'hours'); await sleep(50);
      const onote = await run(() => { const s = document.getElementById('hoursStart'), e = document.getElementById('hoursEnd'); s.value = '22'; s.dispatchEvent(new Event('input')); e.value = '6'; e.dispatchEvent(new Event('input')); return document.getElementById('hoursNote').textContent; });
      er = await run(editHours, null, null, [3]); // Wednesday back on
      await sleep(250);
      await run(setConv, '02:00', '2026-07-04', 'Europe/Lisbon');
      const sat = await run(lisState);
      await run(setConv, '02:00', '2026-07-05', 'Europe/Lisbon');
      const sun = await run(lisState);
      check('overnight hours: note shown, Sat 02:00 working, Sun 02:00 not', /next day/.test(onote) && sat.working && !sun.working, JSON.stringify({ onote, sat, sun }));
      await run(menuAct, 'Europe/Lisbon', 'hours'); await sleep(50);
      await run(() => document.getElementById('hoursReset').click()); await sleep(250);
      await run(setConv, '19:00', '2026-07-01', 'Europe/Lisbon');
      ls = await run(lisState);
      mainHours = (await run(async () => window.wc.getSettings())).hours || {};
      check('Reset restores default hours (19:00 not working, entry removed)', !ls.working && !('Europe/Lisbon' in mainHours) && Math.abs(+ls.ws - 0.375) < 0.001, JSON.stringify({ ls, mainHours }));
      await run(menuAct, 'Europe/Lisbon', 'hours'); await sleep(50);
      await run(() => document.getElementById('hoursEditor').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
      check('Escape closes the hours editor', await run(() => document.getElementById('hoursEditor').hidden), '');

      // 14f. Clock-change notes, keyed to the converted date
      await run(addFirst, 'New York'); await sleep(150);
      const dst = (z) => { const n = document.querySelector(`.card[data-zone="${z}"] .dst-note`); return n ? { hidden: n.hidden, text: n.textContent, title: n.title } : null; };
      await run(setConv, '12:00', '2026-10-28', 'America/New_York');
      let dn = await run(dst, 'America/New_York');
      check('DST note: New York on Oct 28 2026 says clocks change in 4 days (−1 h)', dn && !dn.hidden && dn.text === 'Clocks −1h in 4 days' && /go back 1 h on Sun, Nov 1, 2026 at 02:00/.test(dn.title), JSON.stringify(dn));
      dn = await run(dst, 'Asia/Tokyo');
      check('DST note hidden for a zone without DST (Tokyo)', dn && dn.hidden && dn.text === '', JSON.stringify(dn));
      dn = await run(dst, 'Europe/Lisbon');
      check('DST note hidden for Lisbon on Oct 28 (changed Oct 25)', dn && dn.hidden, JSON.stringify(dn));
      await run(setConv, '12:00', '2026-10-22', 'Europe/Lisbon');
      dn = await run(dst, 'Europe/Lisbon');
      check('DST note: Lisbon on Oct 22 says clocks change in 3 days', dn && !dn.hidden && dn.text === 'Clocks −1h in 3 days', JSON.stringify(dn));
      await run(setConv, '12:00', '2026-03-05', 'America/New_York');
      dn = await run(dst, 'America/New_York');
      check('DST note: New York on Mar 5 2026 clocks go forward (+1 h) in 3 days', dn && !dn.hidden && dn.text === 'Clocks +1h in 3 days' && /go forward/.test(dn.title), JSON.stringify(dn));
      await run(setConv, '12:00', '2026-07-01', 'America/New_York');
      dn = await run(dst, 'America/New_York');
      check('DST note hidden for New York in July', dn && dn.hidden, JSON.stringify(dn));
      // A change at local midnight happens on that day at 00:00, not the day before (Santiago, Beirut)
      await run(addFirst, 'Santiago'); await run(addFirst, 'Beirut'); await sleep(150);
      const midZones = await run(() => ['America/Santiago', 'Asia/Beirut'].map((z) => !!document.querySelector(`.card[data-zone="${z}"]`)));
      await run(setConv, '08:00', '2026-09-03', 'America/Santiago'); // 12:00 UTC
      dn = await run(dst, 'America/Santiago');
      check('DST note: Santiago on Sep 3 2026 says +1h in 3 days, on Sun, Sep 6, 2026 at 00:00', midZones[0] && dn && !dn.hidden && dn.text === 'Clocks +1h in 3 days' && dn.title.includes('Sun, Sep 6, 2026 at 00:00'), JSON.stringify({ midZones, dn }));
      await run(setConv, '15:00', '2026-10-22', 'Asia/Beirut'); // 12:00 UTC
      dn = await run(dst, 'Asia/Beirut');
      check('DST note: Beirut on Oct 22 2026 names Sun, Oct 25, 2026 at 00:00', midZones[1] && dn && !dn.hidden && dn.title.includes('Sun, Oct 25, 2026 at 00:00'), JSON.stringify({ midZones, dn }));
      for (const z of ['America/Santiago', 'Asia/Beirut']) if (await run((z) => !!document.querySelector(`.card[data-zone="${z}"]`), z)) await run(menuAct, z, 'remove');
      await sleep(100);

      // 14g. Date shortcuts
      await run(() => document.getElementById('convClear').click()); await sleep(80);
      await run(setConv, '10:00', '', 'Europe/Lisbon');
      await run(() => document.getElementById('btnDay').click()); await sleep(80);
      const chips = await run(() => ({ hidden: document.getElementById('dateChips').hidden, labels: [...document.querySelectorAll('#dateChips [data-day]')].map((b) => b.textContent),
        pressed: document.querySelector('#dateChips [aria-pressed="true"]')?.dataset.day, expanded: document.getElementById('btnDay').getAttribute('aria-expanded') }));
      check('date chips: Today, Tomorrow + 5 weekday names, Today pressed', !chips.hidden && chips.labels.length === 7 && chips.labels[0] === 'Today' && chips.labels[1] === 'Tomorrow' && chips.labels.slice(2).every((l) => /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/.test(l)) && chips.pressed === '0' && chips.expanded === 'true', JSON.stringify(chips));
      await run(() => document.querySelector('#dateChips [data-day="1"]').click()); await sleep(80);
      const tom = await run(() => {
        const z = 'Europe/Lisbon'; // chips count from today in the converter's source zone
        const p = {}; for (const x of new Intl.DateTimeFormat('en-US', { timeZone: z, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())) p[x.type] = x.value;
        const t = new Date(Date.UTC(+p.year, +p.month - 1, +p.day + 1, 12));
        return { expected: t.toISOString().slice(0, 10), label: new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(t),
          date: document.getElementById('convDate').value, card: document.querySelector('.card[data-zone="Europe/Lisbon"] .date').textContent, hm: document.querySelector('.card[data-zone="Europe/Lisbon"] .hm').textContent,
          hint: document.getElementById('convHint').textContent, btn: document.getElementById('btnDayText').textContent, chipsHidden: document.getElementById('dateChips').hidden };
      });
      check('date chip "Tomorrow" shifts the converted date', tom.date === tom.expected && tom.card.startsWith(tom.label) && tom.hm === '10:00' && tom.chipsHidden, JSON.stringify(tom));
      check('hint and date button show the non-today date', / on (Mon|Tue|Wed|Thu|Fri|Sat|Sun), /.test(tom.hint) && tom.hint.includes(`10:00 in ${lisLabel} on `) && tom.btn === 'Tomorrow', JSON.stringify(tom));
      await run(() => document.getElementById('convClear').click()); await sleep(80);
      await run(() => { document.getElementById('btnDay').click(); document.querySelector('#dateChips [data-day="2"]').click(); });
      await sleep(80);
      const d2 = await run(() => ({ converting: !document.getElementById('convClear').hidden, date: document.getElementById('convDate').value, btn: document.getElementById('btnDayText').textContent, time: document.getElementById('convTime').value }));
      check('a weekday chip in live mode enters convert mode on that day', d2.converting && /^\d{4}-\d\d-\d\d$/.test(d2.date) && /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/.test(d2.btn) && /^\d\d:\d\d$/.test(d2.time), JSON.stringify(d2));
      await run(() => document.getElementById('convClear').click()); await sleep(80);
      check('Back to now resets the date button to Today', (await run(() => document.getElementById('btnDayText').textContent)) === 'Today', '');

      // 14h. New strings are translated
      await run(() => { const o = document.getElementById('optLanguage'); o.value = 'pt'; o.dispatchEvent(new Event('change')); }); await sleep(150);
      const ptS = await run(() => ({ planner: document.getElementById('btnPlanner').title, hours: document.querySelector('#cardMenu [data-act="hours"]').textContent, day: document.getElementById('btnDayText').textContent }));
      const ptL = await run(() => ({ v: document.querySelector('[data-layout="vertical"]').getAttribute('aria-label'), vt: document.querySelector('[data-layout="vertical"]').title, s: document.querySelector('[data-layout="strip"]').getAttribute('aria-label'), map: document.getElementById('btnMap').getAttribute('aria-label') }));
      await run(() => { const o = document.getElementById('optLanguage'); o.value = 'es'; o.dispatchEvent(new Event('change')); }); await sleep(150);
      const esS = await run(() => ({ planner: document.getElementById('btnPlanner').title, hours: document.querySelector('#cardMenu [data-act="hours"]').textContent, day: document.getElementById('btnDayText').textContent }));
      const esL = await run(() => ({ v: document.querySelector('[data-layout="vertical"]').getAttribute('aria-label'), c: document.querySelector('[data-layout="compact"]').title, map: document.getElementById('btnMap').title }));
      await run(() => { const o = document.getElementById('optLanguage'); o.value = 'en'; o.dispatchEvent(new Event('change')); }); await sleep(150);
      check('layout switch and map labels translated (pt, es)', ptL.v === 'Layout vertical' && ptL.vt === 'Layout vertical' && ptL.s === 'Layout em faixa' && ptL.map === 'Mapa-múndi' && esL.v === 'Diseño vertical' && esL.c === 'Diseño compacto' && esL.map === 'Mapa mundial', JSON.stringify({ ptL, esL }));
      const enL = await run(() => [...document.querySelectorAll('#layoutSwitch [data-layout]')].map((b) => b.getAttribute('aria-label')).join('|'));
      check('layout switch labels back in English', enL === 'Strip layout|Compact layout|Vertical layout', enL);
      check('planner / hours / date strings translated (pt, es)', ptS.planner === 'Planejador de reuniões' && ptS.hours === 'Horário de trabalho…' && ptS.day === 'Hoje' && esS.planner === 'Planificador de reuniones' && esS.hours === 'Horario laboral…' && esS.day === 'Hoy', JSON.stringify({ ptS, esS }));

      // 14i. World map view: #btnMap toggles #mapView (renderer-only state), exclusive with the planner
      const mapState = () => ({
        hidden: document.getElementById('mapView').hidden, shown: document.getElementById('mapView').offsetParent !== null,
        stripShown: document.getElementById('strip').offsetParent !== null, pressed: document.getElementById('btnMap').getAttribute('aria-pressed'),
        mapOn: document.getElementById('app').classList.contains('map-on'), plannerHidden: document.getElementById('planner').hidden,
        hasApi: !!(window.WCMap && typeof window.WCMap.mount === 'function'), cities: document.querySelectorAll('#mapView .map-city').length,
        zones: document.querySelectorAll('.card[data-zone]').length,
      });
      const btnMapPlace = await run(() => { const b = document.getElementById('btnMap'); return !!b && b.nextElementSibling === document.getElementById('btnPlanner') && b.getAttribute('aria-pressed') === 'false'; });
      check('#btnMap sits next to #btnPlanner, not pressed by default', btnMapPlace, '');
      await run(() => document.getElementById('btnMap').click()); await sleep(300);
      let ms = await run(mapState);
      check('#btnMap shows #mapView and hides the strip', !ms.hidden && ms.shown && !ms.stripShown && ms.pressed === 'true' && ms.mapOn, JSON.stringify(ms));
      if (ms.hasApi) check('map: one .map-city per zone', ms.cities === ms.zones && ms.zones > 0, JSON.stringify(ms));
      else out.push('SKIP map: one .map-city per zone (window.WCMap not loaded)');
      await run(() => document.getElementById('btnPlanner').click()); await sleep(200);
      ms = await run(mapState);
      check('turning the planner on closes the map', ms.hidden && !ms.plannerHidden && ms.pressed === 'false' && !ms.mapOn, JSON.stringify(ms));
      await run(() => document.getElementById('btnMap').click()); await sleep(250);
      ms = await run(mapState);
      const plannerSaved = (await run(async () => window.wc.getSettings())).planner;
      check('turning the map on closes the planner (setting saved false)', !ms.hidden && ms.plannerHidden && ms.pressed === 'true' && plannerSaved === false, JSON.stringify({ ms, plannerSaved }));
      await run(() => document.getElementById('btnMap').click()); await sleep(200);
      ms = await run(mapState);
      check('#btnMap toggled off hides #mapView and restores the strip', ms.hidden && ms.stripShown && ms.pressed === 'false' && !ms.mapOn, JSON.stringify(ms));

      // 14j. Picking a layout while the planner or map is open closes it and gives the window that layout's size
      await run(() => document.getElementById('btnPlanner').click()); await sleep(300);
      await run(() => document.querySelector('[data-layout="vertical"]').click()); await sleep(450);
      const lp = await run(async () => ({ planner: document.getElementById('planner').hidden, strip: document.getElementById('strip').offsetParent !== null, saved: (await window.wc.getSettings()).planner, cls: document.getElementById('app').className }));
      check('layout change closes the planner and shows the cards', lp.planner && lp.strip && lp.saved === false && /layout-vertical/.test(lp.cls), JSON.stringify(lp));
      check('layout change from the planner resizes to the vertical size (<= 400 wide, portrait)', w.getSize()[0] <= 400 && w.getSize()[1] > w.getSize()[0], String(w.getSize()));
      await run(() => document.getElementById('btnMap').click()); await sleep(350);
      await run(() => document.getElementById('btnLayout').click()); await sleep(100);
      await run(() => document.querySelector('[data-layout="strip"]').click()); await sleep(450);
      const lm = await run(() => ({ map: document.getElementById('mapView').hidden, pressed: document.getElementById('btnMap').getAttribute('aria-pressed'), cls: document.getElementById('app').className }));
      check('layout change closes the map', lm.map && lm.pressed === 'false' && /layout-strip/.test(lm.cls) && w.getSize()[0] > 400, JSON.stringify(lm) + ' ' + w.getSize());

      // 14k. Settings is a modal dialog: everything behind it is inert
      await run(() => document.getElementById('btnSettings').click()); await sleep(250);
      const modal = await run(() => ({ modal: document.getElementById('settingsPanel').getAttribute('aria-modal'), bar: document.querySelector('.bar').inert, strip: document.getElementById('strip').inert, panel: document.getElementById('settingsPanel').inert }));
      await run(() => document.getElementById('panelClose').click()); await sleep(250);
      const after = await run(() => ({ bar: document.querySelector('.bar').inert, strip: document.getElementById('strip').inert }));
      check('settings: aria-modal, bar and cards inert while open, restored after', modal.modal === 'true' && modal.bar && modal.strip && !modal.panel && !after.bar && !after.strip, JSON.stringify({ modal, after }));

      // 15. Hardening: no application menu, every web permission denied, external links limited to https on known hosts,
      // and text fields still copy and paste with Ctrl+C / Ctrl+V without a menu.
      const { Menu, shell, clipboard } = require('electron');
      check('no application menu', Menu.getApplicationMenu() === null, String(Menu.getApplicationMenu()));
      const perms = await run(async () => Promise.all(['notifications', 'geolocation', 'camera', 'microphone', 'clipboard-read'].map((name) =>
        navigator.permissions.query({ name }).then((r) => name + ':' + r.state, (err) => name + ':' + err.name))));
      check('web permissions all denied', perms.every((p) => /:denied$|:TypeError$/.test(p)), perms.join(', '));
      const opened = [];
      const realOpen = shell.openExternal;
      let patched = false;
      try { shell.openExternal = async (u) => { opened.push(u); }; patched = shell.openExternal !== realOpen; } catch { patched = false; }
      if (patched) {
        await run(() => {
          for (const u of ['https://evil.example.com/x', 'http://openworldclock.com/', 'https://github.com.evil.io/', 'https://openworldclock.com:8443/',
            'file:///C:/Windows/System32/calc.exe', 'https://user@github.com/', 'https://openworldclock.com/privacy', 'https://apps.microsoft.com/detail/x',
            'https://ko-fi.com.evil.io/x', 'https://ko-fi.com/joaothecarvalho']) window.open(u);
        });
        await sleep(200);
        shell.openExternal = realOpen;
        check('openExternal only for https on openworldclock.com, github.com, apps.microsoft.com, ko-fi.com',
          JSON.stringify(opened) === JSON.stringify(['https://openworldclock.com/privacy', 'https://apps.microsoft.com/detail/x', 'https://ko-fi.com/joaothecarvalho']), JSON.stringify(opened));
      } else {
        out.push('SKIP openExternal allowlist check (shell.openExternal is not patchable)');
      }
      await clipboard.writeText('');
      w.show(); w.focus(); w.webContents.focus();
      await run(() => { const s = document.getElementById('zoneSearch'); s.value = 'Tokyo'; s.focus(); s.select(); });
      const ctrl = async (keyCode) => {
        w.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers: ['control'] });
        w.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers: ['control'] });
        await sleep(200);
      };
      await ctrl('C');
      const copied = await clipboard.readText();
      await run(() => { const s = document.getElementById('zoneSearch'); s.value = ''; s.focus(); });
      await clipboard.writeText('Kathmandu');
      await ctrl('V');
      const pasted = await run(() => document.getElementById('zoneSearch').value);
      check('Ctrl+C / Ctrl+V work in text fields without a menu', copied === 'Tokyo' && pasted === 'Kathmandu', JSON.stringify({ copied, pasted }));
      await run(() => { const s = document.getElementById('zoneSearch'); s.value = ''; s.dispatchEvent(new Event('input')); s.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); s.blur(); });
      await sleep(150);

      // 16. Accessibility (WCAG 2.2 AA audit)
      const a11yFocus = () => { w.show(); w.focus(); w.webContents.focus(); };
      await run(() => { document.getElementById('convClear').click(); if (document.activeElement) document.activeElement.blur(); });
      w.setBounds({ x: 40, y: 40, width: 1160, height: 250 }); await sleep(150); w.emit('resized'); await sleep(150);
      // 16a. Zoom: Ctrl + / Ctrl - / Ctrl 0 work without an app menu, 0.5 steps up to 3.8 (200%), saved; the window
      // scales with the zoom so each layout keeps its room in CSS px (clamped to the work area).
      a11yFocus();
      const zkey = async (keyCode, n = 1) => {
        for (let i = 0; i < n; i++) { w.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers: ['control'] }); w.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers: ['control'] }); await sleep(120); }
        await sleep(300);
      };
      const zoomNow = async () => ({ level: w.webContents.getZoomLevel(), saved: (await run(async () => window.wc.getSettings())).zoom, size: w.getSize(), inner: await run(() => [window.innerWidth, window.innerHeight]) });
      const zs0 = w.getSize();
      await zkey('=');
      let zn = await zoomNow();
      const grow = 1.2 ** 0.5;
      check('Ctrl+= zooms in one 0.5 step (saved) and the window grows by the same factor', zn.level === 0.5 && zn.saved === 0.5
        && Math.abs(zn.size[0] - Math.min(wa.width, Math.round(zs0[0] * grow))) <= 3 && Math.abs(zn.size[1] - Math.round(zs0[1] * grow)) <= 3, JSON.stringify({ zs0, zn }));
      check('zoomed: the page keeps its CSS size (about 1160x250)', Math.abs(zn.inner[0] - Math.min(1160, wa.width / grow)) <= 4, JSON.stringify(zn.inner));
      await zkey('=', 12);
      zn = await zoomNow();
      check('zoom stops at 3.8 (200%)', zn.level === 3.8 && zn.saved === 3.8 && zn.size[0] <= wa.width && zn.size[1] <= wa.height, JSON.stringify(zn));
      // every layout at 200%: top-bar controls inside the window, no sideways page overflow, cards on screen
      const fit200 = () => {
        const W = window.innerWidth, H = window.innerHeight;
        const out = [...document.querySelectorAll('.bar .actions > *, .bar .search-wrap, #convTime, #convZone, #btnDay')].filter((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && (r.right > W + 0.5 || r.left < -0.5 || r.bottom > H + 0.5); }).map((n) => n.id || n.className);
        const card = document.querySelector('.card[data-zone]'), cr = card && card.getBoundingClientRect();
        return { W, H, out, overflow: document.documentElement.scrollWidth > W + 1, card: cr ? Math.round(cr.height) : 0, cls: document.getElementById('app').className.split(' ').filter((c) => c.startsWith('layout-'))[0] };
      };
      const f200 = [];
      for (const l of ['strip', 'compact', 'vertical']) { await pickLayout(l); await sleep(150); f200.push(await run(fit200)); }
      await pickLayout('strip');
      check('200% zoom: strip, compact and vertical keep every top-bar control inside the window and show cards', f200.every((f) => !f.out.length && !f.overflow && f.card >= 60), JSON.stringify(f200));
      await zkey('-');
      zn = await zoomNow();
      check('Ctrl+- zooms out one step (3.5)', zn.level === 3.5 && zn.saved === 3.5, JSON.stringify(zn));
      await zkey('0');
      zn = await zoomNow();
      check('Ctrl+0 resets zoom to 100% and the window to its size', zn.level === 0 && zn.saved === 0 && Math.abs(zn.size[0] - zs0[0]) <= 2 && Math.abs(zn.size[1] - zs0[1]) <= 2, JSON.stringify({ zs0, zn }));
      const zoomSaid = await run(() => document.getElementById('announce').textContent);
      check('zoom level is announced', zoomSaid === 'Zoom 100%', zoomSaid);

      // 16b. Windows High Contrast: emulate forced-colors and check that state survives (pressed, planner, add-city icon)
      const dbg = w.webContents.debugger;
      let dbgOn = false;
      try { dbg.attach('1.3'); dbgOn = true; } catch (e) { out.push('SKIP forced-colors checks (debugger attach failed: ' + e.message + ')'); }
      if (dbgOn) {
        await dbg.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }, { name: 'prefers-color-scheme', value: 'dark' }] });
        await run(() => { if (!document.getElementById('app').classList.contains('planner-on')) document.getElementById('btnPlanner').click(); });
        await sleep(300);
        const fc = await run(() => {
          const sys = (c) => { const p = document.createElement('div'); p.style.cssText = `forced-color-adjust:none;background-color:${c}`; document.body.append(p); const v = getComputedStyle(p).backgroundColor; p.remove(); return v; };
          const hl = sys('Highlight'), ct = sys('CanvasText'), bt = sys('ButtonText');
          const pressed = document.querySelector('#btnPlanner[aria-pressed="true"]');
          const night = document.querySelector('#planner .plan-cell.night'), work = document.querySelector('#planner .plan-cell.work');
          return {
            active: matchMedia('(forced-colors: active)').matches,
            pressed: !!pressed && getComputedStyle(pressed).backgroundColor === hl,
            night: !!night && getComputedStyle(night).backgroundColor === ct,
            work: !work || (getComputedStyle(work).borderTopColor === hl && parseFloat(getComputedStyle(work).borderTopWidth) >= 1.5 && getComputedStyle(work).backgroundColor !== hl),
            plus: getComputedStyle(document.querySelector('.search-wrap'), '::before').backgroundColor === bt,
            seg: getComputedStyle(document.querySelector('#layoutSwitch [aria-pressed="true"]')).backgroundColor === hl,
            sw: (() => { const c = document.getElementById('optTop'); return !c.checked || getComputedStyle(c).backgroundColor === hl; })(),
            hl, ct, bt,
          };
        });
        check('forced colors: pressed buttons, night/work planner cells and the add-city icon keep system colors', fc.active && fc.pressed && fc.night && fc.work && fc.plus && fc.seg && fc.sw, JSON.stringify(fc));
        // Working cells drop the accent ring in forced colors, but still show a Highlight ring under the pointer.
        const wpt = await run(() => { const c = document.querySelector('#planner .plan-cell.work:not(.sel)'); if (!c) return null; const r = c.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; });
        if (wpt) {
          const wRest = await run(() => getComputedStyle(document.querySelector('#planner .plan-cell.work:not(.sel)')).boxShadow);
          await dbg.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: wpt.x, y: wpt.y }); await sleep(250);
          const wHover = await run((p) => { const c = document.elementFromPoint(p.x, p.y).closest('.plan-cell'); return { hover: c.matches(':hover'), work: c.classList.contains('work'), shadow: getComputedStyle(c).boxShadow }; }, wpt);
          await dbg.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 });
          check('forced colors: a working planner cell has no accent ring at rest and a Highlight ring on hover', wRest === 'none' && wHover.hover && wHover.work && wHover.shadow.includes(fc.hl), JSON.stringify({ wRest, wHover, hl: fc.hl }));
        } else out.push('SKIP forced colors work cell hover (no working cell shown)');
        await dbg.sendCommand('Emulation.setEmulatedMedia', { features: [] });
        try { dbg.detach(); } catch {}
        await run(() => document.getElementById('btnPlanner').click()); await sleep(250);
      }

      // 16c. Search is a combobox (expanded state, active option, labelled list) and says why nothing is listed
      const cb = await run(async () => {
        const s = document.getElementById('zoneSearch'), r = document.getElementById('zoneResults');
        s.focus(); s.value = 'ber'; s.dispatchEvent(new Event('input'));
        s.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        const open = { role: s.getAttribute('role'), auto: s.getAttribute('aria-autocomplete'), controls: s.getAttribute('aria-controls'), expanded: s.getAttribute('aria-expanded'),
          active: s.getAttribute('aria-activedescendant'), sel: r.querySelector('li.sel') && r.querySelector('li.sel').id, label: r.getAttribute('aria-label') };
        s.value = 'zzzz'; s.dispatchEvent(new Event('input'));
        await new Promise((ok) => setTimeout(ok, 700));
        const said = document.getElementById('announce').textContent;
        s.value = ''; s.dispatchEvent(new Event('input')); s.blur();
        await new Promise((ok) => setTimeout(ok, 200));
        return { ...open, said, closed: s.getAttribute('aria-expanded'), activeAfter: s.getAttribute('aria-activedescendant') };
      });
      check('search combobox: role, aria-controls, aria-expanded, aria-activedescendant on the selected option, list labelled "Cities"',
        cb.role === 'combobox' && cb.auto === 'list' && cb.controls === 'zoneResults' && cb.expanded === 'true' && !!cb.active && cb.active === cb.sel && cb.label === 'Cities' && cb.closed === 'false' && cb.activeAfter === null, JSON.stringify(cb));
      check('search: "No matching cities" is announced', cb.said === 'No matching cities', cb.said);

      // 16d. Converter: slider value as a time, format hint, invalid time announced, status toast
      const cv = await run(async () => {
        const sl = document.getElementById('convSlider'), t = document.getElementById('convTime');
        sl.value = 1020; sl.dispatchEvent(new Event('input'));
        const vt = sl.getAttribute('aria-valuetext');
        t.value = 'abc'; t.dispatchEvent(new Event('input'));
        await new Promise((ok) => setTimeout(ok, 900));
        const said = document.getElementById('announce').textContent, inv = t.getAttribute('aria-invalid');
        document.getElementById('convClear').click();
        const toast = document.getElementById('convToast');
        return { vt, said, inv, desc: t.getAttribute('aria-describedby'), fmt: document.getElementById('convFormat').textContent,
          toastRole: toast.getAttribute('role'), toastHidden: toast.getAttribute('aria-hidden'),
          ph: [...document.styleSheets].flatMap((sh) => { try { return [...sh.cssRules]; } catch { return []; } }).some((r) => r.selectorText === '#convTime::placeholder' && /--fg-2/.test(r.style.color)) };
      });
      check('slider aria-valuetext is the time ("17:00")', cv.vt === '17:00', cv.vt);
      check('invalid time: aria-invalid while invalid, announced, format hint attached afterwards', cv.inv === 'true' && /like 9/.test(cv.said) && cv.desc === 'convFormat' && /like 9/.test(cv.fmt), JSON.stringify(cv));
      check('status toast is role=status and not aria-hidden; placeholder uses the secondary text color', cv.toastRole === 'status' && cv.toastHidden === null && cv.ph, JSON.stringify(cv));

      // 16e. Cards: shortcuts exposed, fuller accessible name, named options button, visible Source badge
      const cd = await run(() => {
        const cs = [...document.querySelectorAll('.card[data-zone]')];
        const home = cs.find((c) => c.classList.contains('home')), other = cs.find((c) => !c.classList.contains('home'));
        return { keys: cs[0].getAttribute('aria-keyshortcuts'), desc: cs[0].getAttribute('aria-description'), home: home && home.getAttribute('aria-label'),
          other: other && other.getAttribute('aria-label'), more: other && other.querySelector('.more').getAttribute('aria-label'), city: other && other.querySelector('.city').textContent };
      });
      check('card: aria-keyshortcuts and aria-description list the card shortcuts', /F2/.test(cd.keys) && /Shift\+F10/.test(cd.keys) && /F2 renames/.test(cd.desc), JSON.stringify(cd));
      check('card name: Home on the home card, offset from local and working state on the others', (!cd.home || /, Home,/.test(cd.home)) && /(ahead of local|behind local|same time as local)/.test(cd.other) && /(working hours|off hours)/.test(cd.other), JSON.stringify(cd));
      check('options button names its city', cd.more === `Options for ${cd.city}`, cd.more);
      const srcZone = await run(() => document.querySelector('.card[data-zone]').dataset.zone);
      await run(setConv, '10:00', '2026-07-01', srcZone);
      const sb = await run((z) => {
        const c = document.querySelector(`.card[data-zone="${z}"]`), o = [...document.querySelectorAll('.card[data-zone]')].find((x) => x !== c);
        const b = c.querySelector('.src-badge');
        return { visible: !b.hidden && b.offsetParent !== null, text: b.textContent, label: c.getAttribute('aria-label'), other: o && o.getAttribute('aria-label'), otherBadge: o && !o.querySelector('.src-badge').hidden };
      }, srcZone);
      check('converter source card shows a visible "Source" badge; names say source / converted', sb.visible && sb.text === 'Source' && /converter source/.test(sb.label) && (!sb.other || /converted time/.test(sb.other)) && !sb.otherBadge, JSON.stringify(sb));
      // A focused card keeps its name while scrubbing ([ ]); it updates once focus leaves. Focus and blur events only
      // fire while the window has OS focus.
      a11yFocus(); await sleep(150);
      const fs1 = await run(async () => {
        const c = [...document.querySelectorAll('.card[data-zone]')].pop(); c.focus();
        if (!document.hasFocus()) return { skip: true };
        const before = c.getAttribute('aria-label');
        c.dispatchEvent(new KeyboardEvent('keydown', { key: ']', bubbles: true, cancelable: true }));
        await new Promise((ok) => setTimeout(ok, 250));
        const during = c.getAttribute('aria-label');
        c.blur();
        return { before, during, after: c.getAttribute('aria-label'), time: document.getElementById('convTime').value };
      });
      if (fs1.skip) out.push('SKIP focused card name check (the window has no OS focus)');
      else check('focused card name stays stable while scrubbing, catches up on blur', fs1.before === fs1.during && fs1.after !== fs1.before && fs1.time === '10:15', JSON.stringify(fs1));
      await run(() => document.getElementById('convClear').click()); await sleep(100);

      // 16f. Help popover lists the shortcuts, takes focus, gives it back
      a11yFocus();
      await run(() => document.getElementById('btnHelp').click()); await sleep(150);
      const hp = await run(() => ({ focus: document.activeElement && document.activeElement.id, keys: document.getElementById('helpKeys').textContent }));
      await run(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))); await sleep(100);
      const hpAfter = await run(() => ({ focus: document.activeElement && document.activeElement.id, hidden: document.getElementById('tip').hidden }));
      check('help popover: focus moves to its close button, lists card and zoom shortcuts, Escape returns focus to ?', hp.focus === 'tipClose'
        && ['F2', 'Delete', 'Alt + arrows', '[ and ]', 'Page Up / Page Down', 'Shift + F10', 'Ctrl + plus', 'Zoom in', 'Reset zoom'].every((k) => hp.keys.includes(k)) && hpAfter.focus === 'btnHelp' && hpAfter.hidden, JSON.stringify({ hp, hpAfter }));

      // 16g. Hours dialog: labelled by title + city; invalid fields flagged and described by the note
      await run(menuAct, srcZone, 'hours'); await sleep(100);
      const hd = await run(() => {
        const s = document.getElementById('hoursStart'); s.value = 'zz'; s.dispatchEvent(new Event('input'));
        const r = { labelledby: document.getElementById('hoursEditor').getAttribute('aria-labelledby'), invalid: s.getAttribute('aria-invalid'), desc: s.getAttribute('aria-describedby') };
        document.getElementById('hoursEditor').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        return r;
      });
      check('hours dialog aria-labelledby="hoursTitle hoursCity"; invalid time has aria-invalid + aria-describedby=hoursNote', hd.labelledby === 'hoursTitle hoursCity' && hd.invalid === 'true' && hd.desc === 'hoursNote', JSON.stringify(hd));

      // 16h. Planner row labels are at least 24px tall (target size)
      await run(() => document.getElementById('btnPlanner').click()); await sleep(250);
      const plh = await run(() => Math.min(...[...document.querySelectorAll('#planner .plan-label')].map((l) => l.getBoundingClientRect().height)));
      await run(() => document.getElementById('btnPlanner').click()); await sleep(250);
      check('planner row labels are at least 24px tall', plh >= 23.99, plh); // 24px as laid out (a fraction under at some DPI)

      // 16h2. Closing keeps the app in the tray: X hides the window (no quit), the tray brings it back.
      const beforeClose = w.isVisible();
      await run(() => document.getElementById('btnClose').click()); await sleep(300);
      const hiddenAfterClose = !w.isVisible() && !w.isDestroyed();
      w.show(); await sleep(250);
      check('X button closes to the tray and keeps the app running', beforeClose && hiddenAfterClose && w.isVisible(), JSON.stringify({ beforeClose, hiddenAfterClose, visibleAgain: w.isVisible() }));
      const closeLabel = await run(() => document.getElementById('btnClose').getAttribute('aria-label'));
      check('X button is labeled "Close to tray"', closeLabel === 'Close to tray', closeLabel);

      // 16i. Ko-fi: in Settings and the tray, except in the Microsoft Store build (store=true)
      const trayKofi = () => { const m = global.__wcTest && global.__wcTest.buildTrayMenu(); return m ? m.items.some((i) => i.id === 'kofi') : null; };
      await run(() => document.getElementById('btnSettings').click()); await sleep(250);
      const kf = await run(() => { const a = document.getElementById('kofiLink'); return { exists: !!a, visible: !!a && !a.hidden && a.offsetParent !== null, href: a && a.href, text: a && a.textContent.trim(), target: a && a.target }; });
      check('Ko-fi link shown in Settings when store=false', kf.visible && kf.href === 'https://ko-fi.com/joaothecarvalho' && kf.text === 'Support on Ko-fi' && kf.target === '_blank', JSON.stringify(kf));
      check('Ko-fi item in the tray menu when store=false', trayKofi() === true, String(trayKofi()));
      // 16i2. About row: Website, Report a problem (bug form with this version and build), Check for updates; each opens
      // the browser through openExternalSafe (hosts already allowed), with no tracking parameters.
      const kofiInHtml = /<a id="kofiLink"[^>]*\shidden[\s>]/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8'));
      check('Ko-fi link is hidden in the HTML until main says this is not the Store build', kofiInHtml, String(kofiInHtml));
      const about = await run(() => {
        const g = (id) => { const a = document.getElementById(id); return { href: a.getAttribute('href'), text: a.textContent.trim(), visible: !a.hidden && a.offsetParent !== null, target: a.target }; };
        return { site: g('siteLink'), report: g('reportLink'), updates: g('updatesLink') };
      });
      const wantReport = `https://github.com/joaoCarvalho1000/open-world-clock/issues/new?template=bug.yml&build=Installer&version=v${s0.version}`;
      check('About row (store=false): exact hrefs, report link carries build and version, all three shown', about.site.href === 'https://openworldclock.com/' && about.report.href === wantReport
        && about.updates.href === 'https://openworldclock.com/download#new' && about.site.visible && about.report.visible && about.updates.visible
        && about.site.text === 'Website' && about.report.text === 'Report a problem' && about.updates.text === 'Check for updates'
        && [about.site, about.report, about.updates].every((a) => a.target === '_blank' && !/utm_|ref=/.test(a.href)), JSON.stringify({ about, wantReport }));
      {
        const { shell } = require('electron');
        const openedAbout = [], realOpenA = shell.openExternal;
        let pA = false;
        try { shell.openExternal = async (u) => { openedAbout.push(u); }; pA = shell.openExternal !== realOpenA; } catch { pA = false; }
        if (pA) {
          await run(() => { for (const id of ['siteLink', 'reportLink', 'updatesLink']) document.getElementById(id).click(); });
          await sleep(250);
          shell.openExternal = realOpenA;
          check('About links open in the browser through openExternal with their exact URLs', JSON.stringify(openedAbout) === JSON.stringify([about.site.href, about.report.href, about.updates.href]), JSON.stringify(openedAbout));
        } else out.push('SKIP About link openExternal check (shell.openExternal is not patchable)');
      }
      const aboutFit = [];
      for (const lang of ['en', 'pt', 'es']) {
        await run((l) => { const o = document.getElementById('optLanguage'); o.value = l; o.dispatchEvent(new Event('change')); }, lang); await sleep(150);
        aboutFit.push(await run((l) => {
          const p = document.getElementById('settingsPanel').getBoundingClientRect();
          const ids = ['siteLink', 'reportLink', 'updatesLink', 'kofiLink'];
          const bad = ids.filter((id) => { const r = document.getElementById(id).getBoundingClientRect(); return r.width === 0 || r.left < p.left || r.right > p.right + 0.5; });
          return { l, bad, w: Math.round(p.width) };
        }, lang));
      }
      await run(() => { const o = document.getElementById('optLanguage'); o.value = 'en'; o.dispatchEvent(new Event('change')); }); await sleep(150);
      check('About row fits inside the settings panel, nothing clipped, in en, pt and es', aboutFit.every((f) => !f.bad.length), JSON.stringify(aboutFit));
      const opacityVT = await run(() => ({ vt: document.getElementById('optOpacity').getAttribute('aria-valuetext'), min: document.getElementById('optOpacity').min }));
      check('opacity slider: aria-valuetext "85%", minimum 0.6', opacityVT.vt === '85%' && opacityVT.min === '0.6', JSON.stringify(opacityVT));
      const loginUi = () => {
        const o = document.getElementById('optLogin'), n = document.getElementById('optLoginNote'), b = document.getElementById('optLoginOpen');
        return { disabled: o.disabled, hidden: o.hidden || o.offsetParent === null, checked: o.checked, desc: o.getAttribute('aria-describedby'), note: !n.hidden && n.offsetParent !== null, noteText: n.textContent,
          open: !b.hidden && b.offsetParent !== null, openText: b.textContent, api: typeof window.wc.openStartupSettings === 'function' };
      };
      const loginPlain = await run(loginUi);
      check('launch at login (store=false): switch visible and enabled, no Store note or button', !loginPlain.disabled && !loginPlain.hidden && !loginPlain.note && !loginPlain.open && loginPlain.desc === null && loginPlain.api, JSON.stringify(loginPlain));
      const hadStore = Object.getOwnPropertyDescriptor(process, 'windowsStore');
      let storeSet = false;
      try { process.windowsStore = true; storeSet = process.windowsStore === true; } catch { storeSet = false; }
      if (storeSet) {
        // a UI change round-trips publicSettings (now store: true) into the renderer
        const toggleSeconds = () => run(() => { const o = document.getElementById('optSeconds'); o.checked = !o.checked; o.dispatchEvent(new Event('change')); });
        await toggleSeconds(); await sleep(200); await toggleSeconds(); await sleep(250);
        const kfStore = await run(() => ({ hidden: document.getElementById('kofiLink').hidden, visible: document.getElementById('kofiLink').offsetParent !== null }));
        const aboutStore = await run(() => { const v = (id) => { const a = document.getElementById(id); return !a.hidden && a.offsetParent !== null; }; return { site: v('siteLink'), report: v('reportLink'), updates: v('updatesLink'), href: document.getElementById('reportLink').getAttribute('href') }; });
        const trayStore = trayKofi();
        const loginStore = await run(loginUi);
        const loginSet = await run(async () => (await window.wc.setSettings({ launchAtLogin: true })).launchAtLogin);
        // "Open Startup apps" asks main to open Windows Settings (captured here, so the test never opens it for real)
        const startupOpened = [];
        const realOpenExt = shell.openExternal;
        let extPatched = false;
        try { shell.openExternal = async (u) => { startupOpened.push(u); }; extPatched = shell.openExternal !== realOpenExt; } catch { extPatched = false; }
        if (extPatched) {
          await run(() => document.getElementById('optLoginOpen').click());
          await run(() => { window.open('https://ko-fi.com/joaothecarvalho'); window.open('https://www.ko-fi.com/joaothecarvalho'); });
          await sleep(200);
        }
        if (hadStore) Object.defineProperty(process, 'windowsStore', hadStore); else delete process.windowsStore;
        if (extPatched) { await run(() => window.wc.openStartupSettings()); await sleep(200); shell.openExternal = realOpenExt; }
        await toggleSeconds(); await sleep(200); await toggleSeconds(); await sleep(250);
        const kfBack = await run(() => !document.getElementById('kofiLink').hidden);
        const loginBack = await run(loginUi);
        check('Ko-fi link absent in Settings when store=true (and back when false)', kfStore.hidden && !kfStore.visible && kfBack, JSON.stringify({ kfStore, kfBack }));
        check('Ko-fi item absent from the tray menu when store=true', trayStore === false, String(trayStore));
        check('launch at login (store=true): no switch (hidden and disabled), note "Managed by Windows Startup apps" and "Open Startup apps" shown', loginStore.disabled && loginStore.hidden && loginStore.note && loginStore.open
          && loginStore.noteText === 'Managed by Windows Startup apps' && loginStore.openText === 'Open Startup apps' && loginStore.desc === 'optLoginNote', JSON.stringify(loginStore));
        check('launch at login (store=true): setSettings({ launchAtLogin: true }) leaves it false', loginSet === false, String(loginSet));
        check('launch at login back to store=false: switch visible and enabled, note and button hidden', !loginBack.disabled && !loginBack.hidden && !loginBack.note && !loginBack.open && loginBack.desc === null, JSON.stringify(loginBack));
        if (extPatched) check('"Open Startup apps" opens ms-settings:startupapps in the Store build only, and main never opens Ko-fi there (window.open refused)', JSON.stringify(startupOpened) === JSON.stringify(['ms-settings:startupapps']), JSON.stringify(startupOpened));
        else out.push('SKIP Open Startup apps check (shell.openExternal is not patchable)');
        check('About row (store=true): Website and Report a problem shown, Check for updates hidden, report link says Microsoft Store', aboutStore.site && aboutStore.report && !aboutStore.updates && /[?&]build=Microsoft\+Store(&|$)/.test(aboutStore.href), JSON.stringify(aboutStore));
      } else {
        out.push('SKIP Ko-fi and launch at login store=true checks (process.windowsStore not writable)');
      }
      await run(() => document.getElementById('panelClose').click()); await sleep(250);

      // 18. Round 2: 12-hour digits, top bar widths, time field, going back to now, typed places, keyboard
      w.setBounds({ x: 40, y: 40, width: 1160, height: 250 }); await sleep(250);
      await run(() => { document.getElementById('convClear').click(); if (document.activeElement) document.activeElement.blur(); });
      const r2z = await setZonesUI(['Europe/Lisbon', 'Asia/Tokyo', 'America/New_York'], ['Lisbon', 'Tokyo', 'New York']);
      check('round 2 zones: Lisbon, Tokyo, New York', JSON.stringify(r2z) === JSON.stringify(['Europe/Lisbon', 'Asia/Tokyo', 'America/New_York']), JSON.stringify(r2z));
      const setH12 = (on) => run((on) => { const o = document.getElementById('optHour24'); if (o.checked === on) { o.checked = !on; o.dispatchEvent(new Event('change')); } }, on);
      const setLang = (l) => run((l) => { const o = document.getElementById('optLanguage'); o.value = l; o.dispatchEvent(new Event('change')); }, l);

      // 18a. 12-hour clock: the seconds sit above AM/PM, both right of the digits, in every layout; the digit roll overlay
      // still lands exactly on the digits.
      await setH12(true); await sleep(200);
      const h12Geo = () => {
        const c = document.querySelector('.card[data-zone="Europe/Lisbon"]');
        const r = (s) => c.querySelector(s).getBoundingClientRect();
        const hm = r('.hm'), sec = r('.sec'), ap = r('.ampm');
        return { layout: document.getElementById('app').className.match(/layout-\w+/)[0], sec: c.querySelector('.sec').textContent, ampm: c.querySelector('.ampm').textContent,
          ok: sec.height > 0 && ap.top >= sec.bottom - 0.5 && sec.left >= hm.right - 0.5 && ap.left >= hm.right - 0.5 && ap.bottom <= hm.bottom + 1,
          hm: [hm.left, hm.right, hm.top, hm.bottom].map(Math.round), s: [sec.left, sec.top, sec.bottom].map(Math.round), a: [ap.left, ap.top, ap.bottom].map(Math.round) };
      };
      const h12s = [];
      for (const l of ['strip', 'compact', 'vertical']) { await pickLayout(l); await sleep(150); h12s.push(await run(h12Geo)); }
      await pickLayout('strip'); w.setBounds({ x: 40, y: 40, width: 1160, height: 250 }); await sleep(250);
      check('12-hour: seconds above AM/PM, both right of the digits, in strip, compact and vertical', h12s.every((g) => g.ok && /^\d\d$/.test(g.sec) && /^(AM|PM)$/.test(g.ampm)), JSON.stringify(h12s));
      const roll12 = await run(async () => {
        const card = document.querySelector('.card[data-zone="Europe/Lisbon"]'), hm = card.querySelector('.hm');
        const t = hm.textContent, prev = t.slice(0, -1) + ((+t.slice(-1) + 9) % 10);
        document.dispatchEvent(new CustomEvent('wc:time-change', { detail: { card, from: prev, to: t, converting: false } }));
        await new Promise((ok) => setTimeout(ok, 0));
        const fx = card.querySelector('.digit-fx');
        if (!fx) return { fx: false };
        const a = fx.getBoundingClientRect(), b = hm.getBoundingClientRect();
        return { fx: true, dx: Math.round(Math.abs(a.left - b.left) * 10) / 10, dy: Math.round(Math.abs(a.top - b.top) * 10) / 10 };
      });
      check('12-hour: the minute digit roll overlay lines up with the digits (within 1px)', roll12.fx && roll12.dx <= 1 && roll12.dy <= 1, JSON.stringify(roll12));
      await sleep(450);

      // 18b. Top bar while converting (15:00 shows the clear button and Copy): every control of the converter row is
      // inside the bar with room for its focus ring (4px), 500 to 1100 wide, en/pt/es, 12 and 24 hour. The bar stacks
      // at <= 760px, the layout switch collapses at <= 1120px.
      await run(setConv, '15:00', '', '');
      const barFit = () => {
        const conv = document.querySelector('.converter'), cr = conv.getBoundingClientRect(), app = document.getElementById('app');
        const stack = app.classList.contains('bar-stack'), W = window.innerWidth;
        const kids = [...conv.children].filter((n) => n.offsetParent !== null && n.getBoundingClientRect().width > 0);
        const bad = kids.filter((n) => { const b = n.getBoundingClientRect();
          return stack ? b.right > W - 4 + 0.5 || b.left < 3.5 : b.right > cr.right - 4 + 0.5 || b.left < cr.left + 3.5 || b.top < cr.top + 3.5 || b.bottom > cr.bottom - 3.5; }).map((n) => n.id || n.className);
        const ids = kids.map((n) => n.id).filter(Boolean);
        return { W, stack, collapsed: app.classList.contains('ls-collapsed'), bad, clear: ids.includes('convClear'), copy: ids.includes('btnCopy'), day: ids.includes('btnDay'), zone: ids.includes('convZone') };
      };
      const sweep = [];
      for (const l of ['en', 'pt', 'es']) for (const h12 of [false, true]) {
        await setLang(l); await setH12(h12); await sleep(120);
        for (const W of [500, 600, 700, 800, 900, 1000, 1100]) {
          w.setBounds({ x: 40, y: 40, width: W, height: 250 }); await sleep(160);
          const f = await run(barFit);
          sweep.push({ l, h12, want: W, ...f });
        }
      }
      const sweepBad = sweep.filter((f) => f.bad.length || !f.clear || !f.copy || !f.day || !f.zone || f.stack !== (f.W <= 760) || f.collapsed !== (f.W <= 1120));
      check(`top bar sweep (${sweep.length} sizes): converter controls unclipped with focus ring room, the clear button and Copy always shown, stacked <= 760, switch collapsed <= 1120`, sweep.length === 42 && !sweepBad.length, JSON.stringify(sweepBad.slice(0, 6)));
      await setLang('en'); await setH12(false);
      // the second bar row costs the cards height: every card line stays inside its card (strip 740x250, compact 740x150)
      w.setBounds({ x: 40, y: 40, width: 740, height: 250 }); await sleep(250);
      const cardIn = () => { const c = document.querySelector('.card[data-zone]'), cb = c.getBoundingClientRect(), f = c.querySelector('.card-foot').getBoundingClientRect(), m = c.querySelector('.meta').getBoundingClientRect();
        return { stack: document.getElementById('app').classList.contains('bar-stack'), card: Math.round(cb.bottom), meta: Math.round(m.bottom), foot: Math.round(f.bottom), over: c.scrollHeight > c.clientHeight + 1 }; };
      const in740 = await run(cardIn);
      await pickLayout('compact'); w.setBounds({ x: 40, y: 40, width: 740, height: 150 }); await sleep(250);
      const in740c = await run(cardIn);
      await pickLayout('strip'); w.setBounds({ x: 40, y: 40, width: 1160, height: 250 }); await sleep(250);
      check('stacked bar at 740 wide: the card .meta line stays inside the card (strip 250 tall, compact 150 tall)', in740.stack && in740.meta <= in740.card - 4 && !in740.over && in740c.stack && in740c.foot <= in740c.card - 2 && !in740c.over, JSON.stringify({ in740, in740c }));
      await run(() => document.getElementById('convClear').click());

      // 18c. Time field placeholder "9:30 or 3pm" fits (en/pt/es, one-row and stacked bar) and hides while the empty field has focus
      const phFit = () => {
        const t = document.getElementById('convTime'), cs = getComputedStyle(t);
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.font = `400 13px ${getComputedStyle(document.documentElement).getPropertyValue('--font')}`;
        const need = ctx.measureText(t.placeholder).width, room = t.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        return { ph: t.placeholder, need: Math.round(need * 10) / 10, room, ok: room >= need };
      };
      const phs = [];
      for (const l of ['en', 'pt', 'es']) for (const W of [1160, 600]) { await setLang(l); w.setBounds({ x: 40, y: 40, width: W, height: 250 }); await sleep(150); phs.push(await run(phFit)); }
      await setLang('en'); w.setBounds({ x: 40, y: 40, width: 1160, height: 250 }); await sleep(200);
      const phFocus = await run(() => [...document.styleSheets].flatMap((sh) => { try { return [...sh.cssRules]; } catch { return []; } }).some((r) => r.selectorText === '#convTime:focus::placeholder' && r.style.color === 'transparent'));
      check('time field placeholder fits its field in en, pt and es (one-row and stacked bar)', phs.every((p) => p.ok), JSON.stringify(phs));
      check('the focused empty time field hides its placeholder (only the caret)', phFocus, String(phFocus));

      // 18d. Selects: one drawn chevron (no native arrow; the native arrow is back in forced colors); the date button has a ring
      const chev = await run(() => ['convZone', 'optTheme', 'optLayout', 'optLanguage'].map((id) => { const cs = getComputedStyle(document.getElementById(id)); return { id, app: cs.appearance, img: /svg/.test(cs.backgroundImage), pr: cs.paddingRight }; })
        .concat([{ id: 'btnDay', ring: getComputedStyle(document.getElementById('btnDay')).boxShadow }]));
      check('selects: appearance none, the drawn chevron and 26px right padding; the date button has an edge ring', chev.slice(0, 4).every((c) => c.app === 'none' && c.img && c.pr === '26px') && /inset/.test(chev[4].ring), JSON.stringify(chev));

      // 18e. Back to now: after the idle time (shortened here) with the window unfocused, after a long hide, and on
      // Escape anywhere but a text field. A converting app has .converting.
      await run(() => { window.__wcConvIdleMs = 300; });
      await run(setConv, '15:00', '', '');
      const idleBlur = await run(async () => {
        const converting = document.getElementById('app').classList.contains('converting');
        document.hasFocus = () => false;
        window.dispatchEvent(new Event('blur'));
        const before = !document.getElementById('convClear').hidden;
        await new Promise((ok) => setTimeout(ok, 550));
        delete document.hasFocus;
        return { converting, before, clearHidden: document.getElementById('convClear').hidden, time: document.getElementById('convTime').value, after: document.getElementById('app').classList.contains('converting') };
      });
      check('idle: a conversion goes back to now after the idle time while the window is unfocused (.converting on, then off)', idleBlur.converting && idleBlur.before && idleBlur.clearHidden && idleBlur.time === '' && !idleBlur.after, JSON.stringify(idleBlur));
      const idleHide = await run(async () => {
        const conv = () => !document.getElementById('convClear').hidden;
        const setHidden = (on) => { if (on) Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); else delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); };
        document.hasFocus = () => true; // the idle timer keeps re-arming: only the hide decides
        const t = document.getElementById('convTime'); t.value = '15:00'; t.dispatchEvent(new Event('input'));
        setHidden(true); setHidden(false);
        const shortHide = conv();
        setHidden(true);
        await new Promise((ok) => setTimeout(ok, 550));
        const stillOn = conv();
        setHidden(false);
        const cleared = !conv() && t.value === '';
        delete document.hasFocus;
        return { shortHide, stillOn, cleared };
      });
      check('idle: back after a hide longer than the idle time clears the conversion; a short hide keeps it', idleHide.shortHide && idleHide.stillOn && idleHide.cleared, JSON.stringify(idleHide));
      await run(() => { delete window.__wcConvIdleMs; });
      const escCard = await run(async () => {
        const t = document.getElementById('convTime'); t.value = '15:00'; t.dispatchEvent(new Event('input'));
        const card = document.querySelector('.card[data-zone="Europe/Lisbon"]'); card.focus();
        card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        const r = { clearHidden: document.getElementById('convClear').hidden, time: t.value, focus: document.activeElement === card };
        t.value = '16:00'; t.dispatchEvent(new Event('input'));
        card.focus(); card.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true }));
        const inp = card.querySelector('input.rename');
        if (inp) inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        r.rename = !!inp; r.renameGone = !card.querySelector('input.rename'); r.stillConverting = !document.getElementById('convClear').hidden && t.value === '16:00';
        document.getElementById('convClear').click();
        return r;
      });
      check('Escape on a focused card goes back to now; Escape in the rename field only cancels the rename', escCard.clearHidden && escCard.time === '' && escCard.rename && escCard.renameGone && escCard.stillConverting, JSON.stringify(escCard));

      // 18f. A newly typed time after midnight means today: a leftover automatic date is re-picked; a picked date stays.
      const staleDate = await run(() => {
        const ymd = (z, add) => { const p = {}; for (const x of new Intl.DateTimeFormat('en-US', { timeZone: z, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())) p[x.type] = x.value; return new Date(Date.UTC(+p.year, +p.month - 1, +p.day + add, 12)).toISOString().slice(0, 10); };
        const t = document.getElementById('convTime'), d = document.getElementById('convDate'), z = document.getElementById('convZone');
        z.value = 'Europe/Lisbon'; d.value = ymd('Europe/Lisbon', -1); delete d.dataset.auto; t.value = '09:00'; t.dispatchEvent(new Event('input'));
        d.dataset.auto = '1'; // the automatic date of a conversion left open since yesterday
        t.value = '10:00'; t.dispatchEvent(new Event('input'));
        const today = ymd('Europe/Lisbon', 0), [y, m, dd] = today.split('-').map(Number);
        const card = document.querySelector('.card[data-zone="Europe/Lisbon"]');
        return { today, date: d.value, epoch: +card.dataset.epoch, want: window.WCTime.zonedToEpoch('Europe/Lisbon', y, m, dd, 10, 0), hm: card.querySelector('.hm').textContent };
      });
      check('a time typed the day after a conversion was left open is for today (automatic date re-picked)', staleDate.date === staleDate.today && staleDate.epoch === staleDate.want && staleDate.hm === '10:00', JSON.stringify(staleDate));
      await run(() => { document.getElementById('btnDay').click(); document.querySelector('#dateChips [data-day="2"]').click(); });
      const chipKeep = await run(() => { const d = document.getElementById('convDate'), t = document.getElementById('convTime'); const before = d.value; t.value = '11:00'; t.dispatchEvent(new Event('input')); return { before, after: d.value, auto: d.dataset.auto || null }; });
      check('a date picked from the chips stays when a new time is typed', !!chipKeep.before && chipKeep.after === chipKeep.before && chipKeep.auto === null, JSON.stringify(chipKeep));
      await run(() => document.getElementById('convClear').click());

      // 18g. A place in the time field: "3pm tokyo" converts from Tokyo; a known city not on the list asks to add it first
      const typePlace = (txt) => run((txt) => {
        const t = document.getElementById('convTime'); t.value = txt; t.dispatchEvent(new Event('input'));
        const toast = document.getElementById('convToast'), src = document.querySelector('.card.source');
        return { zone: document.getElementById('convZone').value, source: src && src.dataset.zone, hm: src && src.querySelector('.hm').textContent, invalid: t.classList.contains('invalid'),
          toast: toast.hidden ? '' : toast.textContent, cards: document.querySelectorAll('.card[data-zone]').length };
      }, txt);
      let tp = await typePlace('3pm tokyo');
      const tpBlur = await run(() => { const t = document.getElementById('convTime'); t.dispatchEvent(new Event('blur')); return t.value; });
      check('"3pm tokyo" makes Tokyo the source at 15:00; blur rewrites the field to 15:00', tp.zone === 'Asia/Tokyo' && tp.source === 'Asia/Tokyo' && tp.hm === '15:00' && !tp.invalid && tpBlur === '15:00', JSON.stringify({ tp, tpBlur }));
      tp = await typePlace('15:00 EST');
      const tpLis = await typePlace('lisboa 9');
      check('"15:00 EST" converts from New York; "lisboa 9" finds Lisbon by its Portuguese name', tp.source === 'America/New_York' && tp.hm === '15:00' && tpLis.source === 'Europe/Lisbon' && tpLis.hm === '09:00', JSON.stringify({ tp, tpLis }));
      tp = await typePlace('Sydney 3pm');
      const tpNone = await typePlace('3pm Narnia');
      check('"Sydney 3pm" (not on the list) says "Add Sydney first to convert from it" and adds no card; an unknown place says so', tp.invalid && tp.toast === 'Add Sydney first to convert from it' && tp.cards === 3
        && tpNone.invalid && tpNone.toast === 'No city called Narnia', JSON.stringify({ tp, tpNone }));
      await run(() => { document.getElementById('convClear').click(); document.getElementById('convZone').value = 'Europe/Lisbon'; document.getElementById('convZone').dispatchEvent(new Event('change')); });

      // 18h. Typing a digit on a focused card starts a conversion from that city (real key events)
      a11yFocus(); await sleep(150);
      await run(() => { document.getElementById('convZone').value = 'America/New_York'; document.querySelector('.card[data-zone="Europe/Lisbon"]').focus(); });
      const typeKey = async (k) => { w.webContents.sendInputEvent({ type: 'keyDown', keyCode: k }); w.webContents.sendInputEvent({ type: 'char', keyCode: k }); w.webContents.sendInputEvent({ type: 'keyUp', keyCode: k }); await sleep(120); };
      await typeKey('1'); await typeKey('5');
      const dig = await run(() => { const t = document.getElementById('convTime'); const r = { zone: document.getElementById('convZone').value, value: t.value, focus: document.activeElement === t };
        t.blur(); r.blurred = t.value; r.lis = document.querySelector('.card[data-zone="Europe/Lisbon"] .hm').textContent; return r; });
      check('digits on a focused card: Lisbon becomes the source, the field reads 15, then 15:00 after blur', dig.zone === 'Europe/Lisbon' && dig.value === '15' && dig.focus && dig.blurred === '15:00' && dig.lis === '15:00', JSON.stringify(dig));
      const digEsc = await run(() => { const t = document.getElementById('convTime'); t.focus(); t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); return { clearHidden: document.getElementById('convClear').hidden, value: t.value }; });
      const cardKeys = await run(() => document.querySelector('.card[data-zone]').getAttribute('aria-keyshortcuts'));
      check('Escape returns to live; cards list the digits in aria-keyshortcuts', digEsc.clearHidden && digEsc.value === '' && / 0 1 2 3 4 5 6 7 8 9$/.test(cardKeys), JSON.stringify({ digEsc, cardKeys }));

      // 18i. App-wide shortcuts: Ctrl+F add city, Ctrl+T time field, Ctrl+M map, Ctrl+P planner, Ctrl+Comma settings
      const ctrlKey = (k) => run((k) => { (document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: k, ctrlKey: true, bubbles: true, cancelable: true })); }, k);
      const act = () => run(() => ({ focus: document.activeElement && document.activeElement.id, map: document.getElementById('btnMap').getAttribute('aria-pressed'),
        planner: document.getElementById('btnPlanner').getAttribute('aria-pressed'), panel: !document.getElementById('settingsPanel').hidden }));
      await run(() => { if (document.activeElement) document.activeElement.blur(); });
      await ctrlKey('f'); const scF = await act();
      await ctrlKey('t'); const scT = await act();
      await run(() => document.activeElement.blur());
      await ctrlKey('m'); await sleep(350); const scM = await act();
      await ctrlKey('m'); await sleep(350); const scM2 = await act();
      await ctrlKey('p'); await sleep(350); const scP = await act();
      await ctrlKey('p'); await sleep(350); const scP2 = await act();
      await ctrlKey(','); await sleep(300); const scC = await act();
      await run(() => document.getElementById('panelClose').click()); await sleep(250);
      check('Ctrl+F focuses the add-city field, Ctrl+T the time field (also from a field)', scF.focus === 'zoneSearch' && scT.focus === 'convTime', JSON.stringify({ scF, scT }));
      check('Ctrl+M toggles the map, Ctrl+P the planner, Ctrl+Comma opens settings', scM.map === 'true' && scM2.map === 'false' && scP.planner === 'true' && scP2.planner === 'false' && scC.panel, JSON.stringify({ scM, scM2, scP, scP2, scC }));
      await run(menuAct, 'Europe/Lisbon', 'hours'); await sleep(100);
      await ctrlKey('m'); await ctrlKey('f'); await sleep(200);
      const scH = await act();
      await run(() => document.getElementById('hoursEditor').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))); await sleep(100);
      const scKeys = await run(() => ['zoneSearch', 'convTime', 'btnMap', 'btnPlanner', 'btnSettings'].map((id) => document.getElementById(id).getAttribute('aria-keyshortcuts')).join('|'));
      check('shortcuts do nothing while the hours editor is open; the controls carry aria-keyshortcuts', scH.map === 'false' && scH.focus !== 'zoneSearch' && scKeys === 'Control+F|Control+T|Control+M|Control+P|Control+Comma', JSON.stringify({ scH, scKeys }));
      // the help popover lists the new rows in each language
      const helpRows = {};
      for (const l of ['en', 'pt', 'es']) {
        await setLang(l); await sleep(100);
        await run(() => document.getElementById('btnHelp').click()); await sleep(150);
        helpRows[l] = await run(() => { const t = document.getElementById('tip'); return { keys: document.getElementById('helpKeys').textContent, scroll: t.scrollHeight, client: t.clientHeight }; });
        await run(() => document.getElementById('tipClose').click()); await sleep(100);
      }
      await setLang('en');
      const wantRows = { en: ['0 to 9', 'Type a time: convert from this city', 'Anywhere', 'Ctrl + F', 'Add a city', 'Ctrl + comma'], pt: ['0 a 9', 'Digitar um horário para converter a partir desta cidade', 'Em qualquer lugar', 'Adicionar cidade'], es: ['0 a 9', 'Escribir una hora de esta ciudad', 'En cualquier lugar', 'Agregar ciudad'] };
      check('help popover lists "type a time" and the Anywhere shortcuts in en, pt and es', Object.entries(wantRows).every(([l, ks]) => ks.every((k) => helpRows[l].keys.includes(k))), JSON.stringify(Object.fromEntries(Object.entries(helpRows).map(([l, v]) => [l, v.keys.slice(0, 400)]))));
      out.push(`INFO help popover at 1160x250 scrollHeight/clientHeight: ${Object.entries(helpRows).map(([l, v]) => `${l} ${v.scroll}/${v.client}`).join(', ')}`);

      // 18j. After adding a city with the keyboard, focus is on its new card (Enter then converts from it); with the
      // planner open it stays in the search field.
      await run(menuAct, 'Asia/Tokyo', 'remove'); await sleep(150);
      await run(() => { const s = document.getElementById('zoneSearch'); s.focus(); s.value = 'tok'; s.dispatchEvent(new Event('input')); s.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
      await sleep(200);
      const afterAdd = await run(() => { const a = document.activeElement; return { tag: a && a.tagName, zone: a && a.dataset && a.dataset.zone }; });
      await run(() => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
      const afterEnter = await run(() => ({ zone: document.getElementById('convZone').value, converting: !document.getElementById('convClear').hidden }));
      await run(() => document.getElementById('convClear').click());
      check('adding "tok" with Enter moves focus to the Tokyo card, and Enter then converts from Tokyo', afterAdd.zone === 'Asia/Tokyo' && afterAdd.tag !== 'BODY' && afterEnter.zone === 'Asia/Tokyo' && afterEnter.converting, JSON.stringify({ afterAdd, afterEnter }));
      await run(() => document.getElementById('btnPlanner').click()); await sleep(300);
      await run(() => { const s = document.getElementById('zoneSearch'); s.focus(); s.value = 'sydney'; s.dispatchEvent(new Event('input')); s.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
      await sleep(200);
      const planAdd = await run(() => ({ focus: document.activeElement && document.activeElement.id, added: !!document.querySelector('.card[data-zone="Australia/Sydney"]') }));
      await run(() => document.getElementById('btnPlanner').click()); await sleep(300);
      check('with the planner open, a city added with Enter keeps focus in the search field', planAdd.added && planAdd.focus === 'zoneSearch', JSON.stringify(planAdd));
      await run(() => { const s = document.getElementById('zoneSearch'); s.value = ''; s.dispatchEvent(new Event('input')); s.blur(); });
      await run(menuAct, 'Australia/Sydney', 'remove'); await sleep(150);

      // 13. Restore defaults and persist
      await run(async () => window.wc.setSettings({ zones: ['Europe/Lisbon', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Singapore'], theme: 'system', hour12: false }));
      // saves are debounced 250 ms: wait for the file to say so
      const readSaved = () => JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'settings.json'), 'utf8'));
      await waitFor(() => { const d = readSaved(); return d.zones.length === 5 && d.theme === 'system' && d.hour12 === false; });
      const saved = readSaved();
      check('settings persisted to disk', saved.zones.length === 5 && saved.theme === 'system' && saved.opacity === 0.85, JSON.stringify(saved).slice(0, 200));
      check('version not persisted', !('version' in saved) && !('portable' in saved), Object.keys(saved).join(','));

      // 17. Crash recovery: a crashed page is reloaded once (first crash: after 500 ms), its cards come back and the
      // settings panel's window geometry is undone.
      const sizeNoPanel = w.getSize();
      await run(() => document.getElementById('btnSettings').click()); await sleep(300);
      const sizePanel = w.getSize();
      let loads = 0;
      const loadTimes = [];
      const onLoad = () => { loads++; loadTimes.push(Date.now() - crashAt); };
      const crashAt = Date.now();
      w.webContents.on('did-finish-load', onLoad);
      w.webContents.forcefullyCrashRenderer();
      // First crash: one reload after 500 ms. Wait for it and for the cards, then a little longer to catch a second one.
      let back = await waitFor(async () => loads >= 1 && (await run(() => document.querySelectorAll('.card[data-zone]').length)), 5000, 100);
      const backMs = Date.now() - crashAt;
      await sleep(800);
      const loads3 = loadTimes.filter((t) => t <= 3000).length;
      back = back || 0;
      w.webContents.removeListener('did-finish-load', onLoad);
      const sizeAfter = w.getSize();
      const panelAfter = back ? await run(() => document.getElementById('settingsPanel').hidden) : null;
      check('crash: exactly one reload within 3 s, cards back within 5 s, settings panel geometry undone', loads3 === 1 && loads === 1 && back > 0 && panelAfter === true
        && Math.abs(sizeAfter[0] - sizeNoPanel[0]) <= 2 && Math.abs(sizeAfter[1] - sizeNoPanel[1]) <= 2, JSON.stringify({ loads3, loads, loadTimes, back, backMs, panelAfter, sizeNoPanel, sizePanel, sizeAfter }));
      // 19. Round 2 leftovers: window position saved at once on hide, tray tooltip, legacy ids keep labels and hours,
      // refused settings load (retry, then a message with Retry).
      const { ipcMain } = require('electron');
      const userDataFile = path.join(app.getPath('userData'), 'settings.json');
      const readDisk = () => JSON.parse(fs.readFileSync(userDataFile, 'utf8'));

      // 19a. Move the window and close it to the tray right away (well inside the 300 ms bounds debounce): the new
      // position is saved anyway.
      w.show(); await sleep(150);
      const b0 = w.getBounds();
      w.setBounds({ x: b0.x + 37, y: b0.y + 23, width: b0.width, height: b0.height });
      const moved = w.getBounds();
      await run(() => window.wc.hide());
      const savedPos = await waitFor(() => { const d = readDisk(); return d.bounds && d.bounds.x === moved.x && d.bounds.y === moved.y ? d.bounds : null; }, 2000);
      w.show(); await sleep(200);
      check('closing to the tray right after a move saves the new window position', !!savedPos, JSON.stringify({ moved, disk: readDisk().bounds }));
      w.setBounds(b0); await sleep(400);

      // 19b. Tray tooltip: product name, then each card with its time; at most 127 characters; bad or untrusted names ignored.
      const trayT = () => global.__wcTest.trayTooltip();
      const cardNames = await run(() => [...document.querySelectorAll('.card[data-zone]')].map((c) => c.querySelector('.city').textContent));
      await waitFor(() => cardNames.every((n) => trayT().includes(n)), 2000);
      const tip24 = trayT();
      await setH12(true); await sleep(300);
      const tip12 = trayT();
      await setH12(false); await sleep(300);
      const tipLines = tip24.split('\n');
      check('tray tooltip: "Open World Clock", then one "City HH:MM" line per card (h:mm AM/PM with the 12-hour clock)', tipLines[0] === 'Open World Clock'
        && cardNames.every((n) => tipLines.some((l) => l.startsWith(n + ' ') && /\s\d\d:\d\d$/.test(l)))
        && tip12.split('\n').length === tipLines.length && tip12.split('\n').slice(1).every((l) => /\s\d{1,2}:\d\d\s[AP]M$/.test(l)), JSON.stringify({ tip24, tip12, cardNames }));
      const trustedEvt = { senderFrame: w.webContents.mainFrame, sender: w.webContents };
      const many = Object.fromEntries(Intl.supportedValuesOf('timeZone').slice(0, 50).map((z, i) => [z, `City number ${i}`]));
      ipcMain.emit('tray:names', trustedEvt, many);
      const tipMany = trayT();
      ipcMain.emit('tray:names', { senderFrame: null, sender: null }, { 'Asia/Tokyo': 'Untrusted' });
      const tipUntrusted = trayT();
      ipcMain.emit('tray:names', trustedEvt, { ...many, 'Asia/Tokyo': 'x'.repeat(41) });
      ipcMain.emit('tray:names', trustedEvt, ['Asia/Tokyo']);
      const tipBad = trayT();
      const realNames = await run(() => Object.fromEntries([...document.querySelectorAll('.card[data-zone]')].map((c) => [c.dataset.zone, c.querySelector('.city').textContent])));
      ipcMain.emit('tray:names', trustedEvt, realNames);
      check('tray tooltip: 50 cities stay within 127 characters; untrusted, over-long or non-object names are ignored', tipMany.length <= 127 && tipMany.includes('City number 0')
        && tipUntrusted === tipMany && tipBad === tipMany && cardNames.every((n) => trayT().includes(n)),
        JSON.stringify({ len: tipMany.length, tipUntrusted: tipUntrusted.slice(0, 60), tipBad: tipBad.slice(0, 60) }));

      // 19c. A legacy zone id (Asia/Calcutta) with a custom label and working hours becomes Asia/Kolkata and keeps both.
      await run(async () => window.wc.setSettings({ zones: ['Europe/Lisbon', 'Asia/Calcutta'], labels: { 'Asia/Calcutta': 'Office' }, hours: { 'Asia/Calcutta': { start: '08:00', end: '16:00', days: [1, 2, 3, 4, 5] } } }));
      w.webContents.reload();
      await waitFor(async () => (await run(() => document.querySelectorAll('.card[data-zone]').length)) === 2 && (await run(() => !!document.querySelector('.card[data-zone="Asia/Kolkata"]'))), 5000, 100);
      const legacyUi = await run(() => { const c = document.querySelector('.card[data-zone="Asia/Kolkata"]'); return { card: !!c, city: c && c.querySelector('.city').textContent, old: !!document.querySelector('.card[data-zone="Asia/Calcutta"]') }; });
      const legacyMain = await waitFor(async () => { const s = await run(async () => window.wc.getSettings()); return s.zones.includes('Asia/Kolkata') ? s : null; }, 2000);
      const legacyDisk = await waitFor(() => { const d = readDisk(); return d.zones.includes('Asia/Kolkata') ? d : null; }, 2000);
      check('legacy Asia/Calcutta moves to Asia/Kolkata with its label "Office" and its working hours, in the page, main and settings.json', legacyUi.card && legacyUi.city === 'Office' && !legacyUi.old
        && !!legacyMain && legacyMain.labels['Asia/Kolkata'] === 'Office' && !('Asia/Calcutta' in legacyMain.labels) && !!legacyMain.hours['Asia/Kolkata'] && legacyMain.hours['Asia/Kolkata'].start === '08:00' && !('Asia/Calcutta' in legacyMain.hours)
        && !!legacyDisk && JSON.stringify(legacyDisk.zones) === JSON.stringify(['Europe/Lisbon', 'Asia/Kolkata']) && !JSON.stringify(legacyDisk).includes('Calcutta'),
        JSON.stringify({ legacyUi, labels: legacyMain && legacyMain.labels, hours: legacyMain && legacyMain.hours, disk: legacyDisk && legacyDisk.zones }));
      await run(async () => window.wc.setSettings({ zones: ['Europe/Lisbon', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Singapore'], labels: {}, hours: {} }));

      // 19d. Refused settings load. Once: the retry after 500 ms succeeds and the cards render.
      const bootErrors = [];
      const onBootConsole = (e) => { if (e.level === 'error') bootErrors.push(e.message); };
      global.__wcTest.failSettingsGet(1);
      w.webContents.reload();
      const retried = await waitFor(async () => (await run(() => document.querySelectorAll('.card[data-zone]').length)) === 5, 5000, 100);
      check('settings refused once at startup: the retry loads them and the cards render', retried === true, String(retried));
      // Always: after the retries (500 ms, 1500 ms) one message and a Retry button, settings stay unloaded, handlers do nothing.
      global.__wcTest.failSettingsGet(99);
      w.webContents.on('console-message', onBootConsole);
      w.webContents.reload();
      const failedUi = await waitFor(async () => run(() => {
        const m = document.querySelector('.boot-failed');
        return m ? { text: m.querySelector('p').textContent, retry: !!document.getElementById('bootRetry'), role: m.getAttribute('role'), cards: document.querySelectorAll('.card[data-zone]').length, kofi: document.getElementById('kofiLink').hidden } : null;
      }), 6000, 100);
      bootErrors.length = 0;
      const handlers = await run(() => {
        document.getElementById('btnSettings').click();
        const s = document.getElementById('zoneSearch'); s.focus(); s.value = 'tok'; s.dispatchEvent(new Event('input'));
        s.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', ctrlKey: true, bubbles: true, cancelable: true }));
        return { panel: !document.getElementById('settingsPanel').hidden, results: !document.getElementById('zoneResults').hidden, cards: document.querySelectorAll('.card[data-zone]').length };
      });
      await sleep(200);
      const errorsAfter = [...bootErrors];
      global.__wcTest.failSettingsGet(0);
      await run(() => { const s = document.getElementById('zoneSearch'); s.value = ''; s.blur(); document.getElementById('bootRetry').click(); });
      const recovered = await waitFor(async () => (await run(() => document.querySelectorAll('.card[data-zone]').length)) === 5 && !(await run(() => !!document.querySelector('.boot-failed'))), 5000, 100);
      w.webContents.removeListener('console-message', onBootConsole);
      check('settings refused every time: a message "Could not load your settings..." with Retry, no cards, Ko-fi hidden', !!failedUi && failedUi.text === 'Could not load your settings. Your cities are safe on disk.'
        && failedUi.retry && failedUi.role === 'alert' && failedUi.cards === 0 && failedUi.kofi === true, JSON.stringify(failedUi));
      check('while settings are not loaded, Settings, the search and Ctrl+M do nothing and throw nothing', !handlers.panel && !handlers.results && handlers.cards === 0 && errorsAfter.length === 0, JSON.stringify({ handlers, errorsAfter }));
      check('Retry asks again and the cards come back once settings load', recovered === true, String(recovered));
      // 19e. 12-hour planner: the 6, 12 and 18 cells carry AM or PM, so 9 in the morning and 9 at night differ.
      const apCells = () => run(() => [...document.querySelectorAll('#planner .plan-row[data-zone="America/New_York"] .plan-cell')].filter((c) => c.querySelector('.ap')).map((c) => c.querySelector('span').textContent));
      await run(() => { if (!document.getElementById('app').classList.contains('planner-on')) document.getElementById('btnPlanner').click(); }); await sleep(300);
      const ap24 = await apCells();
      await setH12(true); await sleep(300);
      const ap12 = await apCells();
      await setH12(false); await sleep(200);
      await run(() => { if (document.getElementById('app').classList.contains('planner-on')) document.getElementById('btnPlanner').click(); }); await sleep(300);
      check('12-hour planner: New York 6, 12 and 18 read 6AM, 12PM and 6PM; the 24-hour planner has no AM/PM', ap24.length === 0 && ap12.includes('6AM') && ap12.includes('12PM') && ap12.includes('6PM') && ap12.length === 3, JSON.stringify({ ap24, ap12 }));
      // 20. Round 2 leftovers, batch B: help popover layout and tips, pt/es wording, region dates, vertical cards and
      // planner, copy menu (Discord, UTC, rich table), calendar invite, planner slot, entrances, close button, map layers.
      const resizeTo = async (width, height) => {
        for (let i = 0; i < 5; i++) {
          w.setBounds({ x: 40, y: 40, width, height }); await sleep(200); w.emit('resized');
          if (await waitFor(async () => Math.abs((await run(() => innerWidth)) - width) <= 2, 800)) break;
        }
        await sleep(150);
      };
      const invoke = (ch) => ipcMain._invokeHandlers && ipcMain._invokeHandlers.get(ch);
      const untrustedEvt = { senderFrame: null, sender: null };
      await run(() => { const o = document.getElementById('optLayout'); if (o.value !== 'strip') { o.value = 'strip'; o.dispatchEvent(new Event('change')); } });
      await sleep(300);

      // 20a. Help popover: fits the default strip window (1160x250) and a 900 px one without scrolling, in en, pt and es;
      // five tips; "[ and ]" is two keys; the vertical layout keeps one column.
      const helpFit = [];
      for (const W of [1160, 900]) {
        await resizeTo(W, 250);
        for (const l of ['en', 'pt', 'es']) {
          await setLang(l); await sleep(150);
          await run(() => document.getElementById('btnHelp').click()); await sleep(250);
          helpFit.push(await run((W, l) => {
            const t = document.getElementById('tip'), r = t.getBoundingClientRect();
            const scrub = [...document.querySelectorAll('#helpKeys dt')].find((dt) => dt.querySelectorAll('kbd').length === 2);
            return { W, l, sh: t.scrollHeight, ch: t.clientHeight, top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right),
              iw: innerWidth, ih: innerHeight, tips: document.querySelectorAll('#tipText .chip').length, scrub: scrub ? scrub.textContent : null, focus: document.activeElement && document.activeElement.id };
          }, W, l));
          await run(() => document.getElementById('tipClose').click()); await sleep(120);
        }
      }
      await setLang('en'); await sleep(100);
      const helpBad = helpFit.filter((f) => f.sh > f.ch + 1 || f.top < 0 || f.bottom > f.ih || f.left < 0 || f.right > f.iw || f.tips !== 5 || f.focus !== 'tipClose');
      check('help popover fits 1160x250 and 900x250 without scrolling in en, pt and es (inside the window, five tips, focus on close)', helpFit.length === 6 && !helpBad.length, JSON.stringify(helpBad.length ? helpBad : helpFit.map((f) => `${f.W}/${f.l} ${f.sh}/${f.ch}`)));
      check('help popover: "[ and ]" is two keys with the word between them (en "[ and ]", pt "[ e ]", es "[ y ]")', helpFit.filter((f) => f.W === 1160).map((f) => f.scrub).join('|') === '[ and ]|[ e ]|[ y ]', JSON.stringify(helpFit.map((f) => f.scrub)));
      const tipsEn = await run(() => { document.getElementById('btnHelp').click(); const r = [...document.querySelectorAll('#tipText .chip')].map((c) => c.textContent); document.getElementById('tipClose').click(); return r; });
      check('help tips teach typing (with a place), scrubbing, double-click, working hours and moving; no "widget"', tipsEn.length === 5 && tipsEn[0] === 'Type a time like 3pm or 3pm Tokyo to see it in every city'
        && /drag its day line/.test(tipsEn[1]) && /working hours/.test(tipsEn[3]) && /move the window/.test(tipsEn[4]) && !tipsEn.join(' ').includes('widget'), JSON.stringify(tipsEn));
      await resizeTo(1160, 250);

      // 20b. pt/es wording: "A las 13:00", but "A la 1:00 p.m." (es-419; one o'clock is singular), "Às 13:00" / "À 1:00"; the copy
      // header reads the same; the Home badge says "Aqui" / "Aquí".
      const wording = {};
      const hintFor = async (time) => { await run(setConv, time, '2026-07-01', 'Europe/Lisbon'); await sleep(80); return run(() => document.getElementById('convHint').textContent); };
      await setLang('es'); await sleep(150);
      wording.es13 = await hintFor('13:00');
      await setH12(true); await sleep(150);
      wording.es1pm = await hintFor('1pm');
      await clipboard.writeText('');
      await run(() => { document.getElementById('btnCopy').click(); document.querySelector('#copyMenu [data-copy="text"]').click(); }); await sleep(300);
      wording.esCopy = (await clipboard.readText()).split('\n')[0];
      await setH12(false); await sleep(150);
      wording.esHome = await run(() => (document.querySelector('.card[data-zone] .pin') || {}).textContent);
      wording.esDisplay = await run(() => document.getElementById('grpDisplay').textContent);
      await setLang('pt'); await sleep(150);
      wording.pt13 = await hintFor('13:00');
      wording.pt1 = await hintFor('01:00');
      wording.ptHome = await run(() => (document.querySelector('.card[data-zone] .pin') || {}).textContent);
      await setLang('en'); await sleep(150);
      wording.en13 = await hintFor('13:00');
      await run(() => document.getElementById('convClear').click()); await sleep(100);
      check('es: "A las 13:00 en ...", 12-hour "A la 1:00 p.m. en ..." (es-419), copy header the same; Home badge "Aquí"; "Apariencia"', /^A las 13:00 en /.test(wording.es13) && /^A la 1:00\s?p\.m\. en /.test(wording.es1pm)
        && /^A la 1:00\s?p\.m\. en .*:$/.test(wording.esCopy) && wording.esHome === 'Aquí' && wording.esDisplay === 'Apariencia', JSON.stringify(wording));
      check('pt: "Às 13:00 em ...", "À 01:00 em ..."; Home badge "Aqui"; English unchanged ("When it is 13:00 in ...")', /^Às 13:00 em /.test(wording.pt13) && /^À 01:00 em /.test(wording.pt1) && wording.ptHome === 'Aqui'
        && /^When it is 13:00 in /.test(wording.en13), JSON.stringify(wording));

      // 20c. Dates follow the Windows Region format when it matches the app language (tests pass no region: en-US dates).
      const region = await run(() => {
        const I = window.WCI18N, r = [];
        for (const [l, loc] of [['en', 'en-GB'], ['en', 'en-US'], ['pt', 'en-GB'], ['pt', 'pt-PT'], ['es', 'es-MX'], ['en', 'fr-FR'], ['en', '']]) { I.setLang(l, l, loc); r.push(I.locale); }
        I.setLang('en', 'en', 'en-GB');
        const gb = new Intl.DateTimeFormat(I.locale, { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(Date.UTC(2026, 8, 24, 12)));
        I.setLang('en', 'en', '');
        return { r, gb };
      });
      const sysLoc = (await run(async () => window.wc.getSettings())).systemLocale;
      check('dates follow the region format of the same language: en-GB, en-US, pt stays pt-BR with en-GB, pt-PT, es-MX, not fr-FR; "Thu 24 Sept" in en-GB; the suite passes no region', JSON.stringify(region.r) === JSON.stringify(['en-GB', 'en-US', 'pt-BR', 'pt-PT', 'es-MX', 'en-US', 'en-US'])
        && /^Thu,? 24 Sep/.test(region.gb) && sysLoc === '', JSON.stringify({ region, sysLoc }));

      // 20d. Vertical cards: when the day badge shows, the UTC offset steps aside, so every row keeps the same height.
      await run(() => { const o = document.getElementById('optLayout'); o.value = 'vertical'; o.dispatchEvent(new Event('change')); }); await sleep(500);
      await run(setConv, '22:00', '2026-07-01', 'Europe/Lisbon'); await sleep(200);
      const vcards = await run(() => [...document.querySelectorAll('.card[data-zone]')].map((c) => ({ z: c.dataset.zone, h: Math.round(c.getBoundingClientRect().height),
        badge: !c.querySelector('.dshift').hidden, utc: getComputedStyle(c.querySelector('.utc')).display })));
      await run(() => document.getElementById('convClear').click()); await sleep(100);
      check('vertical: a card with a day badge hides its UTC offset and every card has the same height', vcards.some((c) => c.badge) && vcards.every((c) => (c.badge ? c.utc === 'none' : c.utc !== 'none'))
        && new Set(vcards.map((c) => c.h)).size === 1, JSON.stringify(vcards));

      // 20e. Vertical planner: starts at the top, 24 px cells, an hour scale 00 06 12 18 24 under the rows, every row inside.
      const vpStored = ((await run(async () => window.wc.getSettings())).viewSizes || {}).plannerVertical || null;
      await run(() => document.getElementById('btnPlanner').click()); await sleep(500);
      const vplan = await run(() => {
        const axis = document.querySelector('#planner .plan-axis'), head = document.querySelector('#planner .plan-head').getBoundingClientRect();
        const rows = [...document.querySelectorAll('#planner .plan-row')], body = document.getElementById('planBody').getBoundingClientRect();
        return { axis: axis ? getComputedStyle(axis).display : null, labels: axis ? [...axis.children].map((s) => s.textContent) : [], gap: Math.round(rows[0].getBoundingClientRect().top - head.bottom),
          cellH: Math.round(document.querySelector('#planner .plan-cell').getBoundingClientRect().height), inside: rows.every((r) => r.getBoundingClientRect().bottom <= body.bottom + 1), rows: rows.length,
          free: axis ? Math.round(innerHeight - axis.getBoundingClientRect().bottom) : null, conv: !document.getElementById('convClear').hidden };
      });
      // 20e2. Its size is measured, not guessed: tall enough for the bar, the head, the rows and the scale and no taller
      // (at most the bottom padding free under the scale), and wide enough for 24 hour cells of 14px.
      const vpWa = require('electron').screen.getDisplayMatching(w.getBounds()).workArea;
      const vpSize = w.getSize(), vpClamped = vpSize[1] >= vpWa.height - 2;
      const vpCell = await run(() => document.querySelector('#planner .plan-cell').getBoundingClientRect().width);
      check(`vertical planner fits its ${vplan.rows} rows and the hour scale (${vpSize} window), nothing past the bottom and under 40px free below`, !vpStored && (vpClamped || (vplan.free >= 0 && vplan.free <= 40)), JSON.stringify({ vpSize, vpStored, free: vplan.free, conv: vplan.conv }));
      check('vertical planner: hour cells at least 14px wide', vpCell >= 13.9, String(vpCell));
      await run(() => document.getElementById('btnPlanner').click()); await sleep(300);
      await run(() => { const o = document.getElementById('optLayout'); o.value = 'strip'; o.dispatchEvent(new Event('change')); }); await sleep(500);
      await resizeTo(1160, 250);
      check('vertical planner: hour scale "00 06 12 18 24", first row within 40 px of the head, cells 24 px, every row inside the body', vplan.axis === 'flex' && vplan.labels.join(' ') === '00 06 12 18 24'
        && vplan.gap >= 0 && vplan.gap <= 40 && vplan.cellH >= 24 && vplan.inside, JSON.stringify(vplan));
      const stripAxis = await run(() => { document.getElementById('btnPlanner').click(); const a = document.querySelector('#planner .plan-axis'); const d = a ? getComputedStyle(a).display : null; document.getElementById('btnPlanner').click(); return d; });
      check('strip planner keeps the hour numbers in its cells and hides the scale', stripAxis === 'none', String(stripAxis));
      await sleep(300);

      // 20f. Copy menu: #btnCopy opens it (menu button), the keyboard walks it, each item copies; the rich table is escaped.
      const renameLisbon = (name) => run((name) => {
        document.querySelector('.card[data-zone="Europe/Lisbon"] .more').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        document.querySelector('#cardMenu [data-act="rename"]').click();
        const inp = document.querySelector('.card[data-zone="Europe/Lisbon"] input.rename');
        if (!inp) return false;
        inp.value = name; inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        return true;
      }, name);
      await renameLisbon('<b>&'); await sleep(200);
      await run(setConv, '09:00', '2026-07-01', 'Europe/Lisbon'); await sleep(120);
      a11yFocus();
      const cm = await run(() => {
        const b = document.getElementById('btnCopy'); b.focus(); b.click();
        const m = document.getElementById('copyMenu');
        const r = { open: !m.hidden, expanded: b.getAttribute('aria-expanded'), popup: b.getAttribute('aria-haspopup'), items: [...m.querySelectorAll('[role=menuitem]')].filter((x) => !x.hidden).map((x) => x.dataset.copy), first: document.activeElement.dataset.copy };
        m.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true })); r.end = document.activeElement.dataset.copy;
        m.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })); r.wrap = document.activeElement.dataset.copy;
        m.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        r.afterEsc = { hidden: m.hidden, focus: document.activeElement.id, expanded: b.getAttribute('aria-expanded') };
        return r;
      });
      check('copy menu: menu button, four items (times, Discord, UTC, invite), Home/End wrap, Escape closes and returns focus to #btnCopy', cm.open && cm.expanded === 'true' && cm.popup === 'menu'
        && cm.items.join(',') === 'text,discord,utc,ics' && cm.first === 'text' && cm.end === 'ics' && cm.wrap === 'text' && cm.afterEsc.hidden && cm.afterEsc.focus === 'btnCopy' && cm.afterEsc.expanded === 'false', JSON.stringify(cm));
      const pickCopy = async (what) => {
        await clipboard.writeText('');
        await run((what) => { document.getElementById('btnCopy').click(); document.querySelector(`#copyMenu [data-copy="${what}"]`).click(); }, what);
        return waitFor(async () => (await clipboard.readText()) || null, 1500);
      };
      const epoch = await run(() => { const t = new Date(Date.UTC(2026, 6, 1, 8, 0)); return t.getTime(); }); // 09:00 in Lisbon (UTC+1)
      const dText = await pickCopy('discord');
      const uText = await pickCopy('utc');
      const tText = await pickCopy('text');
      let tHtml = '';
      for (const it of await clipboard.read()) if (it.types.includes('text/html')) tHtml = await (await it.getType('text/html')).text();
      const copyExpect = await run(() => {
        const zones = [...document.querySelectorAll('.card[data-zone]')];
        return zones.map((c) => `${c.querySelector('.hm').textContent} ${c.querySelector('.city').textContent}`);
      });
      check('Copy for Discord: "<t:SEC:F> (<t:SEC:R>)" with the converted instant', /^<t:(\d+):F> \(<t:\1:R>\)$/.test(dText || '') && +/<t:(\d+)/.exec(dText)[1] === Math.floor(epoch / 1000), JSON.stringify({ dText, epoch }));
      check('Copy in UTC: ISO 8601 ending in Z, then "08:00 UTC, Wed, Jul 1"', (uText || '').split('\n')[0] === '2026-07-01T08:00:00Z' && (uText || '').split('\n')[1] === '08:00 UTC, Wed, Jul 1', JSON.stringify(uText));
      check('Copy times: the text lists every card; the HTML is a table with the label escaped ("<b>&" as text)', !!tText && tText.startsWith('When it is 09:00 in ') && copyExpect.every((l) => tText.includes(l))
        && /<table/.test(tHtml) && tHtml.includes('&lt;b&gt;&amp;') && !tHtml.includes('<b>&'), JSON.stringify({ tText, tHtml: tHtml.slice(0, 200) }));
      const clipH = invoke('clipboard:write');
      if (clipH) {
        const trusted = { senderFrame: w.webContents.mainFrame, sender: w.webContents };
        const r51 = await clipH(trusted, { text: 'x', rows: Array.from({ length: 51 }, () => ['a', 'b', 'c']) });
        const rStr = await clipH(trusted, { text: 'x', rows: 'rows' });
        const rUn = await clipH(untrustedEvt, 'hello');
        const rOk = await clipH(trusted, { text: 'ok', rows: [['a', 'b', 'c']] });
        check('clipboard:write refuses more than 50 rows, rows that are not a list and untrusted senders', r51 === false && rStr === false && rUn === false && rOk === true, JSON.stringify({ r51, rStr, rUn, rOk }));
      } else out.push('SKIP clipboard:write refusals (no handler map on ipcMain)');
      await renameLisbon(''); await sleep(200); // back to the city name

      // 20g. Save calendar invite: main asks where (stubbed here) and writes one VEVENT at the converted time, 1 hour long.
      const icsFile = path.join(app.getPath('userData'), 'meeting-test.ics');
      global.__wcTest.stubSaveDialog(async (opts) => ({ canceled: false, filePath: icsFile, opts }));
      await run(() => { document.getElementById('btnCopy').click(); document.querySelector('#copyMenu [data-copy="ics"]').click(); });
      const icsText = await waitFor(() => { try { return fs.readFileSync(icsFile, 'utf8'); } catch { return null; } }, 3000);
      const icsSaid = await run(() => document.getElementById('convHint').textContent);
      const icsH = invoke('ics:save');
      const icsUn = icsH ? await icsH(untrustedEvt, { startMs: epoch, endMs: epoch + 3600000, title: 'x', description: '' }) : null;
      const icsBad = icsH ? await icsH({ senderFrame: w.webContents.mainFrame, sender: w.webContents }, { startMs: epoch, endMs: epoch, title: 'x', description: '' }) : null;
      global.__wcTest.stubSaveDialog(null);
      check('Save calendar invite writes one VEVENT: DTSTART 20260701T080000Z, DTEND an hour later, CRLF lines, then says "Invite saved"', !!icsText && icsText.startsWith('BEGIN:VCALENDAR\r\n')
        && (icsText.match(/BEGIN:VEVENT/g) || []).length === 1 && icsText.includes('\r\nDTSTART:20260701T080000Z\r\n') && icsText.includes('\r\nDTEND:20260701T090000Z\r\n') && icsText.includes('SUMMARY:Meeting') && icsSaid === 'Invite saved',
        JSON.stringify({ icsText: icsText && icsText.slice(0, 300), icsSaid }));
      if (icsH) check('ics:save refuses untrusted senders and an end that is not after the start', icsUn === false && icsBad === false, JSON.stringify({ icsUn, icsBad }));
      await run(() => document.getElementById('convClear').click()); await sleep(100);

      // 20h. Planner slot: Shift+Right twice from New York 12:00 selects 12:00 to 15:00; Copy slot lists each city's own
      // hours; Best selects its whole run; another date clears it; a pointer drag over three cells gives the same slot.
      await run(setConv, '10:00', '2026-09-24', 'America/New_York'); await sleep(150);
      await run(() => document.getElementById('btnPlanner').click()); await sleep(400);
      const slot = await run(() => {
        const c = document.querySelector('#planner .plan-row[data-zone="America/New_York"] .plan-cell[data-h="12"]');
        c.focus(); c.click();
        const k = () => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true, cancelable: true }));
        k(); k();
        const band = document.querySelector('#planner .plan-sel');
        return { text: document.getElementById('planSel').textContent, bar: !document.getElementById('planSelBar').hidden, band: band ? band.style.width : null, time: document.getElementById('convTime').value, focusH: document.activeElement.dataset.h };
      });
      check('planner: Shift+Right twice from New York 12:00 selects "Thu, Sep 24, 12:00 to 15:00 (New York)" (band 3 h wide, time 12:00)', slot.text === 'Thu, Sep 24, 12:00 to 15:00 (New York)' && slot.bar
        && slot.band === `${(3 / 24) * 100}%` && slot.time === '12:00' && slot.focusH === '14', JSON.stringify(slot));
      await clipboard.writeText('');
      await run(() => document.getElementById('planCopy').click());
      const slotClip = await waitFor(async () => (await clipboard.readText()) || null, 1500);
      const slotLines = (slotClip || '').split('\n');
      check('Copy slot: the slot, then one line per city with its own start and end (Lisbon 17:00 to 20:00, Singapore 00:00 to 03:00 the next day)', slotLines[0] === slot.text
        && slotLines.includes('Lisbon: 17:00 to 20:00, Thu, Sep 24') && slotLines.includes('New York: 12:00 to 15:00, Thu, Sep 24') && slotLines.some((l) => /^Singapore: 00:00 to 03:00, Fri, Sep 25$/.test(l)), JSON.stringify(slotLines));
      const drag = await run(() => {
        const row = document.querySelector('#planner .plan-row[data-zone="America/New_York"] .plan-cells');
        const cell = (h) => row.querySelector(`.plan-cell[data-h="${h}"]`).getBoundingClientRect();
        const at = (h) => { const r = cell(h); return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }; };
        const body = document.getElementById('planBody');
        const c12 = row.querySelector('.plan-cell[data-h="12"]');
        row.querySelector('.plan-cell[data-h="10"]').click(); // start from a one-hour slot at 10:00
        const before = document.getElementById('planSel').textContent;
        c12.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7, button: 0, buttons: 1, ...at(12) }));
        body.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 7, buttons: 1, ...at(13) }));
        body.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 7, buttons: 1, ...at(14) }));
        body.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7, button: 0, ...at(14) }));
        return { before, text: document.getElementById('planSel').textContent, time: document.getElementById('convTime').value };
      });
      check('planner: a pointer drag across 12, 13 and 14 selects the same 12:00 to 15:00 slot and converts at 12:00', drag.before === 'Thu, Sep 24, 10:00 to 11:00 (New York)' && drag.text === slot.text && drag.time === '12:00', JSON.stringify(drag));
      await run(setConv, '10:00', '2026-09-24', 'America/New_York'); await sleep(100);
      const best = await run(() => { document.getElementById('plannerBest').click(); return { text: document.getElementById('planSel').textContent, bestHidden: getComputedStyle(document.getElementById('plannerBest')).display === 'none' }; });
      check('planner: Best selects its whole run ("12:00 to 13:00") and gives way to the slot line', best.text === 'Thu, Sep 24, 12:00 to 13:00 (New York)' && best.bestHidden, JSON.stringify(best));
      await run(setConv, '10:00', '2026-09-25', 'America/New_York'); await sleep(150);
      const cleared = await run(() => ({ bar: document.getElementById('planSelBar').hidden, band: !!document.querySelector('#planner .plan-sel') }));
      await run(() => document.getElementById('convClear').click()); await sleep(100);
      const clearedNow = await run(() => document.getElementById('planSelBar').hidden);
      check('planner: another date clears the slot, and so does going back to now', cleared.bar && !cleared.band && clearedNow, JSON.stringify({ cleared, clearedNow }));

      // 20i. Map and planner open with the short entrance (one animation, no inline style left), unless motion is reduced.
      await run(() => document.getElementById('btnPlanner').click()); await sleep(400); // planner off
      const reduced = await run(() => window.WCMotion.reduced());
      const enterOf = async (btn, id) => {
        const n = await run((btn, id) => { document.getElementById(btn).click(); return document.getElementById(id).getAnimations().length; }, btn, id);
        await sleep(600);
        const after = await run((id) => { const e = document.getElementById(id); return { left: e.getAnimations().length, style: e.getAttribute('style') || '', opacity: getComputedStyle(e).opacity }; }, id);
        await run((btn) => document.getElementById(btn).click(), btn); await sleep(500);
        return { n, ...after };
      };
      const enterPlan = await enterOf('btnPlanner', 'planner');
      const enterMap = await enterOf('btnMap', 'mapView');
      if (reduced) out.push('SKIP map and planner entrance (reduced motion)');
      else check('planner and map open with one entrance animation that ends at opacity 1 with no inline style left', enterPlan.n === 1 && enterPlan.left === 0 && enterPlan.opacity === '1' && !/opacity|transform/.test(enterPlan.style)
        && enterMap.n >= 1 && enterMap.left === 0 && enterMap.opacity === '1' && !/opacity|transform/.test(enterMap.style), JSON.stringify({ enterPlan, enterMap }));

      // 20j. Close hovers red like a Windows caption button; the map sun and glow drop will-change and the pills their blur.
      await run(() => document.getElementById('btnMap').click()); await sleep(600);
      const chrome = await run(() => {
        const rules = [...document.styleSheets].flatMap((sh) => { try { return [...sh.cssRules]; } catch { return []; } });
        const hover = rules.find((r) => r.selectorText === '#btnClose:hover');
        const sun = document.querySelector('.map-sun'), pill = document.querySelector('.map-pill');
        const r = { hover: hover ? `${hover.style.backgroundColor}|${hover.style.color}` : null, sunWill: sun ? getComputedStyle(sun).willChange : null, pillBlur: pill ? getComputedStyle(pill).backdropFilter : null };
        document.getElementById('btnMap').click();
        return r;
      });
      check('close button hovers #c42b1c with a white glyph; map sun has no will-change and pills no backdrop blur', chrome.hover === 'rgb(196, 43, 28)|rgb(255, 255, 255)' && chrome.sunWill === 'auto' && chrome.pillBlur === 'none', JSON.stringify(chrome));
      await sleep(300);

      // 20k. The unused quit IPC is gone; an offset search does not fill the formatter cache.
      const quitGone = await run(() => typeof window.wc.quit === 'undefined' && typeof window.wc.hide === 'function');
      check('preload has no quit() (window:quit removed); hide() stays', quitGone, String(quitGone));
      const fc = await run(() => {
        const T = window.WCTime, before = T._fmtSize(), s = document.getElementById('zoneSearch');
        s.focus(); s.value = 'UTC+5'; s.dispatchEvent(new Event('input'));
        const n = document.querySelectorAll('#zoneResults li b').length, after = T._fmtSize();
        s.value = ''; s.dispatchEvent(new Event('input')); s.blur();
        return { before, after, n };
      });
      check('an offset search ("UTC+5") lists cities without filling the formatter cache (at most a few new formatters)', fc.n > 0 && fc.after - fc.before <= 25 && fc.after <= 300, JSON.stringify(fc));
    } catch (e) { fail++; out.push('EXCEPTION ' + (e.stack || e.message)); }
    out.unshift(`${pass} passed, ${fail} failed`);
    fs.writeFileSync(path.join(dir, 'deep.txt'), out.join('\n'));
    app.exit(fail ? 1 : 0);
  }, 1200));
};
