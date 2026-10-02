(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const T = window.WCTime;
  const I = window.WCI18N;
  const t = (k, v) => I.t(k, v);
  const el = {
    app: $('app'),
    strip: $('strip'), addCard: $('addCard'), convTime: $('convTime'), convDate: $('convDate'), convZone: $('convZone'),
    convClear: $('convClear'), convSlider: $('convSlider'), convHint: $('convHint'), btnCopy: $('btnCopy'),
    search: $('zoneSearch'), results: $('zoneResults'),
    menu: $('cardMenu'), panel: $('settingsPanel'), optHour24: $('optHour24'), optSeconds: $('optSeconds'),
    optTop: $('optTop'), optLogin: $('optLogin'), optLoginNote: $('optLoginNote'), optLoginOpen: $('optLoginOpen'),
    optOpacity: $('optOpacity'), optOpacityValue: $('optOpacityValue'),
    optTheme: $('optTheme'), optLayout: $('optLayout'), optLanguage: $('optLanguage'), ver: $('ver'),
    btnPin: $('btnPin'), btnSettings: $('btnSettings'), tip: $('tip'), tipText: $('tipText'), tipClose: $('tipClose'),
    announce: $('announce'),
    btnPlanner: $('btnPlanner'), planner: $('planner'), planBody: $('planBody'), plannerSummary: $('plannerSummary'), plannerCaption: $('plannerCaption'),
    plannerBest: $('plannerBest'),
    btnDay: $('btnDay'), btnDayText: $('btnDayText'), dateChips: $('dateChips'),
    hoursEditor: $('hoursEditor'), hoursCity: $('hoursCity'), hoursStart: $('hoursStart'), hoursEnd: $('hoursEnd'), hoursDays: $('hoursDays'),
    hoursSave: $('hoursSave'), hoursReset: $('hoursReset'), hoursNote: $('hoursNote'),
    btnMap: $('btnMap'), mapView: $('mapView'),
    layoutWrap: $('layoutWrap'), layoutSwitch: $('layoutSwitch'), btnLayout: $('btnLayout'),
    convToast: $('convToast'), kofiLink: $('kofiLink'), helpKeys: $('helpKeys'),
    reportLink: $('reportLink'), updatesLink: $('updatesLink'),
    copyMenu: $('copyMenu'), planSelBar: $('planSelBar'), planSel: $('planSel'), planCopy: $('planCopy'), planIcs: $('planIcs'),
  };

  // Chromium lists some legacy IANA ids; map them to the canonical names used in ZONE_META.
  const LEGACY = { 'Europe/Kiev': 'Europe/Kyiv', 'Asia/Calcutta': 'Asia/Kolkata', 'Asia/Saigon': 'Asia/Ho_Chi_Minh',
    'America/Buenos_Aires': 'America/Argentina/Buenos_Aires', 'Asia/Rangoon': 'Asia/Yangon', 'Asia/Katmandu': 'Asia/Kathmandu',
    'Asia/Tel_Aviv': 'Asia/Jerusalem' };
  // Memoized: render, the planner, the map and the copy button ask about every saved zone on every update, and each
  // uncached answer builds an Intl.DateTimeFormat. Self-contained (the cache lives in the closure of this one const),
  // so scripts/export-shared.mjs can still extract it on its own.
  const supportsZone = ((ok) => (z) => {
    let v = ok.get(z);
    if (v === undefined) {
      try { new Intl.DateTimeFormat('en-US', { timeZone: z }); v = true; } catch { v = false; }
      ok.set(z, v);
    }
    return v;
  })(new Map());
  const canonical = (z) => LEGACY[z] || z;
  const readLocalZone = () => canonical(Intl.DateTimeFormat().resolvedOptions().timeZone);
  // The OS time zone can change while the app runs (travel, manual change): re-read every minute and on show.
  let LOCAL_ZONE = readLocalZone();
  // Every searchable zone. Ids Intl lists itself are valid by definition, so only the canonical renames and the
  // ZONE_META extras are checked (no formatter for each of the ~420 listed ids at startup).
  const ALL_ZONES = ((listed) => {
    const intl = new Set(listed);
    return [...new Set([...listed.map(canonical), ...Object.keys(window.ZONE_META)])]
      .filter((z) => !/^Etc\//.test(z) && (intl.has(z) || supportsZone(z)));
  })(typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []);

  let settings = null;
  let convert = null; // { zone, epochMs, h, mi } while the converter is active
  let tick = null;
  let menuZone = null;
  let menuAnchor = null; // the .more button (or card) that opened the menu, for focus return
  let structKey = null; // zones/labels/layout/lang signature of the built cards
  let lastMinute = -1; // minute of the last full render (seconds-only ticks skip the full render)

  // ---------- small helpers ----------
  const parts = T.parts;
  const locale = () => I.locale;
  const layout = () => (settings && settings.layout) || 'strip';
  const englishCity = (z) => (window.ZONE_META[z] ? window.ZONE_META[z].city : z.split('/').pop().replace(/_/g, ' '));
  const cityOf = (z) => { const tr = window.ZONE_I18N && window.ZONE_I18N[I.lang]; return (tr && tr[z]) || englishCity(z); };
  // Localized country name (Intl.DisplayNames) from the zone's ISO code; falls back to ZONE_META, then the IANA area.
  const regionNames = new Map();
  const regionOf = (z) => {
    const cc = window.ZONE_CC && window.ZONE_CC[z];
    if (cc) {
      try {
        let dn = regionNames.get(I.locale);
        if (!dn) { dn = new Intl.DisplayNames([I.locale], { type: 'region', style: 'short' }); regionNames.set(I.locale, dn); }
        const n = dn.of(cc);
        if (n && n !== cc) return n;
      } catch { /* fall through */ }
    }
    return window.ZONE_META[z] ? window.ZONE_META[z].country : z.split('/')[0].replace(/_/g, ' ');
  };
  const customLabel = (z) => { const l = settings && settings.labels && settings.labels[z]; return typeof l === 'string' && l.trim() ? l.trim() : ''; };
  const labelOf = (z) => customLabel(z) || cityOf(z);
  const displayName = (z) => (customLabel(z) ? `${customLabel(z)} (${cityOf(z)})` : cityOf(z));
  const setText = (node, s) => { if (node.textContent !== s) node.textContent = s; };
  // Motion hooks: app state/text changes stay synchronous; motion modules (src/renderer/motion/*.js) only listen and animate.
  const emit = (name, detail) => { try { document.dispatchEvent(new CustomEvent('wc:' + name, { detail })); } catch (e) { console.warn('world-clock: motion hook failed', name, e); } };
  const guard = (fn) => function (...args) { if (!settings) return undefined; return fn.apply(this, args); };
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Native Windows 11 acrylic backdrop (main decides); Windows then draws corners, border, shadow and blur.
  function applyBackdrop(s) { if (s) document.documentElement.classList.toggle('backdrop-native', !!s.backdrop && s.backdrop !== 'none'); }
  function onIpcError(err) {
    console.warn('world-clock: IPC call failed, resyncing settings', err);
    window.wc.getSettings().then(adopt).catch((e) => console.warn('world-clock: resync failed', e));
  }
  // A settings object main sent (settings:get, settings:changed) is only used whole: null (a refused sender) or
  // anything without a zones list is ignored, so settings is never a half-built object.
  const validSettings = (s) => !!s && typeof s === 'object' && Array.isArray(s.zones);
  function adopt(s) {
    if (!validSettings(s)) return;
    // Settings arriving before the first load succeeded (or after it failed) start the app like the first load does.
    if (!booted) { boot(s); return; }
    applyBackdrop(s);
    const prevLang = settings && settings.language, prevSys = settings && settings.systemLanguage, prevLoc = settings && settings.systemLocale;
    const prevZoom = settings ? settings.zoom || 0 : null;
    settings = { ...(settings || {}), ...s };
    if (settings.language !== prevLang || settings.systemLanguage !== prevSys || settings.systemLocale !== prevLoc) applyLanguage();
    // Ctrl + / Ctrl - / Ctrl 0 are handled by main; say the new level.
    if (prevZoom !== null && (settings.zoom || 0) !== prevZoom) announce(t('say.zoom', { n: Math.round(100 * 1.2 ** (settings.zoom || 0)) }));
    syncPanel(); fillConvZones(); renderTip(); render(); scheduleTick();
  }

  let announceTimer = null;
  function announce(msg) {
    clearTimeout(announceTimer);
    el.announce.textContent = '';
    announceTimer = setTimeout(() => { el.announce.textContent = msg; }, 60);
  }

  function relLabel(zone, date) {
    if (zone === LOCAL_ZONE) return t('rel.local');
    const d = T.offsetMinutes(zone, date) - T.offsetMinutes(LOCAL_ZONE, date);
    if (d === 0) return '±0';
    const a = Math.abs(d), h = Math.floor(a / 60), m = a % 60;
    return `${d > 0 ? '+' : '-'}${h}h${m ? String(m).padStart(2, '0') + 'm' : ''}`;
  }
  // Spoken form of the offset for the card's accessible name ("5 h 30 min ahead of local").
  function relSpoken(zone, date) {
    const d = T.offsetMinutes(zone, date) - T.offsetMinutes(LOCAL_ZONE, date);
    if (!d) return t('rel.same');
    return t(d > 0 ? 'rel.ahead' : 'rel.behind', { d: durationText(d) });
  }
  function dayMarker(diff) {
    if (!diff) return '';
    if (diff === 1) return t('day.plus1');
    if (diff === -1) return t('day.minus1');
    return t(diff > 0 ? 'day.plusN' : 'day.minusN', { n: Math.abs(diff) });
  }
  // Wall-clock parts for a zone, honoring the 12/24h setting. 24h always uses hourCycle h23.
  function clock(zone, date) {
    if (settings.hour12) {
      const p = parts(zone, date, { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
      return { hm: `${p.hour}:${p.minute}`, sec: p.second, ampm: p.dayPeriod || '' };
    }
    const p = parts(zone, date, { hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return { hm: `${p.hour}:${p.minute}`, sec: p.second, ampm: '' };
  }
  // Value written into #convTime: always parseable by T.parseTime ("15:00" or "3:00 PM").
  function formatInput(h, mi) {
    if (settings && settings.hour12) return `${h % 12 || 12}:${String(mi).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
    return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
  }
  // Human-facing time (hint, copy, announcements): localized via Intl, day period included.
  function formatTime(h, mi) {
    const d = new Date(Date.UTC(2026, 0, 1, h, mi));
    const opts = settings && settings.hour12 ? { hour: 'numeric', minute: '2-digit', hour12: true } : { hourCycle: 'h23', hour: '2-digit', minute: '2-digit' };
    return T.fmt('UTC', opts, locale()).format(d);
  }
  // "A las 3:00" but "A la 1:00" (Spanish), "Às 3:00" but "À 1:00" (Portuguese): one o'clock is singular. `shown` is
  // the hour as displayed (12-hour clock: 1 for 13:00).
  const shownHour = (h) => (settings && settings.hour12 ? h % 12 || 12 : h);
  function atTime(key, vars, shown) {
    const s = t(key, vars);
    if (shown !== 1) return s;
    if (I.lang === 'es') return s.replace(/^A las /, 'A la ');
    if (I.lang === 'pt') return s.replace(/^Às /, 'À ');
    return s;
  }
  // ---------- working hours ----------
  // settings.hours[zone] = { start: 'HH:MM', end: 'HH:MM', days: [0..6] } (0 = Sunday). end < start = overnight shift.
  const DEFAULT_HOURS = Object.freeze({ start: '09:00', end: '18:00', days: Object.freeze([1, 2, 3, 4, 5]) });
  const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
  const pad2 = (n) => String(n).padStart(2, '0');
  const toMin = (s) => +s.slice(0, 2) * 60 + +s.slice(3, 5);
  const hhmm = (min) => `${pad2(Math.floor(min / 60) % 24)}:${pad2(min % 60)}`;
  function hoursOf(zone) {
    const h = settings && settings.hours && settings.hours[zone];
    if (h && HHMM.test(h.start) && HHMM.test(h.end) && h.start !== h.end && Array.isArray(h.days) && h.days.length) return h;
    return DEFAULT_HOURS;
  }
  const WEEKDAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  // Local weekday (0 = Sunday) and minutes since local midnight.
  function localWall(zone, date) {
    const p = parts(zone, date, { weekday: 'short', hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }, 'en-US');
    return { wd: WEEKDAY[p.weekday], min: (+p.hour % 24) * 60 + +p.minute };
  }
  function isWorking(zone, date) {
    const h = hoursOf(zone); const s = toMin(h.start), e = toMin(h.end);
    const { wd, min } = localWall(zone, date);
    if (s < e) return min >= s && min < e && h.days.includes(wd);
    if (min >= s) return h.days.includes(wd); // overnight shift, evening part
    if (min < e) return h.days.includes((wd + 6) % 7); // overnight shift started the day before
    return false;
  }
  function tzInfo(zone, date) {
    const abbr = parts(zone, date, { timeZoneName: 'short', hour: 'numeric' }, 'en-US').timeZoneName || '';
    const long = parts(zone, date, { timeZoneName: 'long', hour: 'numeric' }, locale()).timeZoneName || '';
    return { abbr: /^[A-Za-z]+$/.test(abbr) && !/^(GMT|UTC)$/.test(abbr) ? abbr : '', long };
  }

  // ---------- sun ----------
  function coordsOf(zone) {
    const m = window.ZONE_META[zone];
    if (m && typeof m.lat === 'number' && typeof m.lng === 'number') return [m.lat, m.lng];
    const c = window.ZONE_COORDS && window.ZONE_COORDS[zone];
    return Array.isArray(c) && c.length === 2 ? c : null;
  }
  // Phase from the real sun position; the local hour only separates morning / midday / afternoon.
  function sunPhase(date, ll, hour) {
    const S = window.WCSun;
    const alt = S.altitude(date, ll[0], ll[1]);
    const rising = S.altitude(new Date(date.getTime() + 600000), ll[0], ll[1]) > alt;
    if (alt < -6) return 'night';
    if (rising && alt <= 6) return 'dawn';
    if (!rising && alt < 0) return 'dusk';
    if (hour >= 11 && hour < 14 && alt > 0) return 'midday';
    if (!rising && alt <= 10) return 'golden';
    return rising && hour < 11 ? 'morning' : 'afternoon';
  }
  const sunCache = new Map();
  function sunTitleOf(zone, date, ll) {
    const key = [zone, Math.floor(date.getTime() / 3600000), settings.hour12, I.lang].join('|');
    if (sunCache.has(key)) return sunCache.get(key);
    const r = window.WCSun.times(date, ll[0], ll[1]);
    let s;
    if (r.polar === 'day') s = t('sun.noSet');
    else if (r.polar === 'night') s = t('sun.noRise');
    else {
      const opts = settings.hour12 ? { hour: 'numeric', minute: '2-digit', hour12: true } : { hourCycle: 'h23', hour: '2-digit', minute: '2-digit' };
      const f = T.fmt(zone, opts, locale());
      s = t('sun.times', { rise: f.format(r.sunrise), set: f.format(r.sunset) });
    }
    if (sunCache.size > 500) sunCache.clear();
    sunCache.set(key, s);
    return s;
  }

  // ---------- clock changes (DST) ----------
  // First UTC-offset change within 7 days after `ms`: { at, delta, old } or null. Offsets change at most once
  // a week, so daily samples find the day and a binary search pins the minute.
  const DAY_MS = 86400000;
  const dstCache = new Map();
  function nextOffsetChange(zone, ms) {
    const key = zone + '|' + Math.floor(ms / 3600000);
    if (dstCache.has(key)) return dstCache.get(key);
    const off = (x) => T.offsetMinutes(zone, new Date(x));
    const old = off(ms);
    let res = null;
    for (let d = 1; d <= 7; d++) {
      const hiOff = off(ms + d * DAY_MS);
      if (hiOff === old) continue;
      let lo = ms + (d - 1) * DAY_MS, hi = ms + d * DAY_MS;
      while (hi - lo > 60000) { const mid = Math.floor((lo + hi) / 2); if (off(mid) === old) lo = mid; else hi = mid; }
      res = { at: Math.floor(hi / 60000) * 60000, delta: off(hi) - old, old };
      break;
    }
    if (dstCache.size > 400) dstCache.clear();
    dstCache.set(key, res);
    return res;
  }
  function durationText(mins) {
    const a = Math.abs(mins), h = Math.floor(a / 60), m = a % 60;
    return [h ? t('unit.h', { n: h }) : '', m ? t('unit.min', { n: m }) : ''].filter(Boolean).join(' ');
  }
  const ymdUTC = (p) => Date.UTC(+p.year, +p.month - 1, +p.day);
  const YMD_OPTS = { year: 'numeric', month: '2-digit', day: '2-digit' };
  // { text, title } for the card's .dst-note, or null when the offset stays put for the next 7 days.
  function dstNote(zone, date) {
    const ch = nextOffsetChange(zone, date.getTime());
    if (!ch) return null;
    // Wall clock at the change, in the old offset ("at 02:00, clocks go back to 01:00"). The day and the count come from
    // it too: a change at local midnight (Santiago, Beirut, Cairo, Havana) happens at 00:00 of that day, not at 23:59 of
    // the day before.
    const wall = new Date(ch.at + ch.old * 60000);
    const days = Math.round((Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate()) - ymdUTC(parts(zone, date, YMD_OPTS))) / DAY_MS);
    // Short enough to never truncate on a card: "Clocks −1h tomorrow". The title carries the full sentence.
    const a = Math.abs(ch.delta), dh = Math.floor(a / 60), dm = a % 60;
    const delta = `${ch.delta > 0 ? '+' : '−'}${dh ? dh + 'h' : ''}${dm ? dm + 'm' : ''}`;
    const text = days <= 0 ? t('dst.today', { delta }) : days === 1 ? t('dst.tomorrow', { delta }) : t('dst.in', { n: days, delta });
    const day = T.fmt('UTC', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }, locale()).format(wall);
    const title = t(ch.delta > 0 ? 'dst.forward' : 'dst.back', { d: durationText(ch.delta), date: day, time: formatTime(wall.getUTCHours(), wall.getUTCMinutes()) });
    return { text, title };
  }

  // ---------- i18n ----------
  function applyStatic() {
    document.documentElement.lang = I.locale;
    document.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n); });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((n) => { n.placeholder = t(n.dataset.i18nPlaceholder); });
    document.querySelectorAll('[data-i18n-title]').forEach((n) => { n.title = t(n.dataset.i18nTitle); });
    document.querySelectorAll('[data-i18n-aria]').forEach((n) => { n.setAttribute('aria-label', t(n.dataset.i18nAria)); });
  }
  function applyLanguage() {
    I.setLang((settings && settings.language) || 'auto', settings && settings.systemLanguage, settings && settings.systemLocale);
    applyStatic();
    structKey = null; // rebuild cards with translated chrome
    planKey = null;
    if (settings) { syncPanel(); fillConvZones(); renderTip(); refreshHint(); }
  }

  // ---------- render ----------
  function structureSignature() {
    const labels = {};
    for (const z of settings.zones) if (customLabel(z)) labels[z] = customLabel(z);
    return JSON.stringify([settings.zones, labels, layout(), I.lang]);
  }
  function buildStructure() {
    // Commit an in-progress rename before cards are rebuilt so the edit is never lost.
    el.strip.querySelectorAll('input.rename').forEach((i) => { if (typeof i._finish === 'function') i._finish(true); });
    // Keep keyboard focus on whatever had it inside the strip (a card or its "..." button): re-parenting the cards
    // below drops focus to <body> otherwise (e.g. after Move left/right from the card menu).
    const focused = document.activeElement && el.strip.contains(document.activeElement) ? document.activeElement : null;
    const langChanged = !el.strip.dataset.lang || el.strip.dataset.lang !== I.lang;
    el.strip.dataset.lang = I.lang;
    const existing = langChanged ? new Map()
      : new Map([...el.strip.querySelectorAll('.card[data-zone]')].map((c) => [c.dataset.zone, c]));
    const frag = document.createDocumentFragment();
    for (const zone of settings.zones) {
      if (!supportsZone(zone)) continue;
      const card = existing.get(zone) || buildCard(zone);
      applyLabel(card, zone);
      frag.appendChild(card);
    }
    // Card count drives the CSS size scale (cards share the width evenly, see .card --cw in style.css).
    el.strip.dataset.count = String(Math.max(1, frag.childNodes.length));
    el.strip.style.setProperty('--n', el.strip.dataset.count);
    if (!frag.childNodes.length) frag.appendChild(buildEmpty());
    frag.appendChild(el.addCard);
    el.strip.replaceChildren(frag);
    updateStripRows();
    sendTrayNames();
    if (focused && focused.isConnected && document.activeElement !== focused) focused.focus({ preventScroll: false });
  }
  // The tray tooltip lists the cards with their times (main formats the times on hover). Sent when the cards are
  // rebuilt (cities, labels, layout or language changed), never on a tick.
  let trayKey = '';
  function sendTrayNames() {
    if (typeof window.wc.setTrayNames !== 'function') return;
    const names = {};
    for (const z of settings.zones.filter(supportsZone).slice(0, 50)) names[z] = labelOf(z).slice(0, 40);
    const k = JSON.stringify(names);
    if (k === trayKey) return;
    trayKey = k;
    window.wc.setTrayNames(names);
  }
  // Tall strip windows with more cards than fit in one row: wrap into rows instead of one long scrolling row with
  // empty bands above and below (cards never grow taller than ~1.15x their width). --n becomes cards per row.
  const CARD_MIN_W = 200, CARD_MIN_H = 216;
  let rowsKey = '';
  function updateStripRows() {
    const s = el.strip, n = +s.dataset.count || 1;
    const key = [n, layout(), s.clientWidth, s.clientHeight].join('|');
    if (key === rowsKey) return;
    rowsKey = key;
    let rows = 1, cols = n;
    if (settings && layout() === 'strip' && s.querySelector('.card[data-zone]')) {
      const cs = getComputedStyle(s), gap = parseFloat(cs.columnGap) || 12;
      const w = s.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
      const h = s.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
      const perRow = Math.max(1, Math.floor((w + gap) / (CARD_MIN_W + gap)));
      const fitRows = Math.max(1, Math.floor((h + gap) / (CARD_MIN_H + gap)));
      if (n > perRow && fitRows > 1) {
        const lines = Math.ceil(n / perRow);
        // all lines fit: balance the cards over them; otherwise size for the visible rows and scroll down
        if (lines <= fitRows) { rows = lines; cols = Math.ceil(n / rows); } else { rows = fitRows; cols = perRow; }
      }
    }
    s.classList.toggle('rows', rows > 1);
    s.style.setProperty('--rows', String(rows));
    s.style.setProperty('--n', String(rows > 1 ? cols : n));
  }
  function buildEmpty() {
    const e = document.createElement('div'); e.className = 'empty';
    const title = document.createElement('div'); title.className = 'empty-title'; title.textContent = t('empty.title');
    const sub = document.createElement('div'); sub.className = 'empty-sub'; sub.textContent = t('empty.sub');
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'pill empty-add'; btn.textContent = t('empty.add');
    btn.addEventListener('click', () => el.search.focus());
    e.append(title, sub, btn);
    setTimeout(() => { if (btn.isConnected && (document.activeElement === document.body || !document.activeElement)) btn.focus(); }, 0);
    return e;
  }
  const cardEl = (zone) => [...el.strip.querySelectorAll('.card[data-zone]')].find((c) => c.dataset.zone === zone) || null;

  function render() {
    if (!settings) return;
    const sig = structureSignature();
    if (sig !== structKey) { structKey = sig; buildStructure(); }
    if (el.app.classList.contains('converting') !== !!convert) el.app.classList.toggle('converting', !!convert);
    if (!convert && document.activeElement !== el.convSlider) {
      const n = parts(el.convZone.value || LOCAL_ZONE, new Date(), { hourCycle: 'h23', hour: '2-digit', minute: '2-digit' });
      el.convSlider.value = +n.hour * 60 + +n.minute;
    }
    const date = convert ? new Date(convert.epochMs) : new Date();
    const refZone = convert ? convert.zone : LOCAL_ZONE;
    const pickedDate = !!convert && !!el.convDate.value && el.convDate.value !== todayIn(convert.zone);
    // No layout reads here: a minute tick or a scrub step only changes text and classes. The strip's rows follow its
    // size (ResizeObserver below, buildStructure, applyLayout); the edge fades are read after the frame is laid out.
    for (const card of el.strip.querySelectorAll('.card[data-zone]')) updateCard(card, card.dataset.zone, date, refZone, !!convert, pickedDate);
    lastMinute = Math.floor(Date.now() / 60000);
    queueOverflow();
    renderPlanner(date);
    renderMap(date);
    updateDayButton();
    syncSliderText();
  }
  // Screen readers hear the slider as a time ("09:00"), not as minutes ("540").
  function syncSliderText() {
    const v = +el.convSlider.value, txt = formatTime(Math.floor(v / 60) % 24, v % 60);
    if (el.convSlider.getAttribute('aria-valuetext') !== txt) el.convSlider.setAttribute('aria-valuetext', txt);
  }

  function buildCard(zone) {
    const c = document.createElement('div');
    c.className = 'card';
    c.dataset.zone = zone;
    c.draggable = true;
    c.tabIndex = 0;
    c.setAttribute('role', 'group');
    c.innerHTML = `
      <div class="card-head">
        <div class="head-text"><div class="city-row"><span class="city"></span><span class="pin" hidden></span><span class="src-badge" hidden></span></div><div class="phase-row"><span class="phase"></span><span class="moon" role="img" hidden></span></div><div class="dst-note" hidden></div></div>
        <button class="icon-btn more" aria-haspopup="menu" aria-expanded="false" aria-controls="cardMenu"><svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><g fill="currentColor"><circle cx="3.5" cy="8" r="1.35"/><circle cx="8" cy="8" r="1.35"/><circle cx="12.5" cy="8" r="1.35"/></g></svg></button>
      </div>
      <div class="display">
        <div class="time"><span class="hm"></span><span class="sec"></span><span class="ampm"></span></div>
        <div class="sky" hidden></div>
      </div>
      <div class="arc" aria-hidden="true"><span class="arc-work"></span><span class="arc-fill"></span><span class="arc-dot"></span></div>
      <div class="card-foot">
        <div class="date"></div>
        <div class="meta"><span class="tzname"></span><span class="utc"></span><span class="dshift" aria-hidden="true" hidden></span><span class="rel"></span></div>
      </div>`;
    c._city = c.querySelector('.city');
    const moon = c.querySelector('.moon'); moon.textContent = '☾'; moon.setAttribute('aria-label', t('card.asleep')); moon.title = t('card.asleep');
    c.addEventListener('wheel', onCardWheel, { passive: false });
    attachArcScrub(c, zone);
    c.querySelector('.pin').textContent = t('card.home');
    c.querySelector('.src-badge').textContent = t('card.source');
    // Keyboard shortcuts are discoverable from the card itself (and listed in the Help popover).
    c.setAttribute('aria-keyshortcuts', 'Enter F2 Delete Alt+ArrowLeft Alt+ArrowRight [ ] PageUp PageDown Shift+F10 0 1 2 3 4 5 6 7 8 9');
    c.setAttribute('aria-description', t('card.keys'));
    // A focused card keeps its accessible name while it has focus (no re-reading on every minute or scrub step);
    // it catches up when focus arrives or leaves. Conversions are spoken through announce().
    const flushAria = () => { if (c._aria && c.getAttribute('aria-label') !== c._aria) c.setAttribute('aria-label', c._aria); };
    c.addEventListener('focus', flushAria);
    c.addEventListener('blur', flushAria);
    const more = c.querySelector('.more');
    more.title = t('card.moreTitle'); more.setAttribute('aria-label', t('card.more'));
    more.addEventListener('click', (e) => { e.stopPropagation(); if (!settings) return; if (!el.menu.hidden && menuZone === zone) { closeMenu(true); return; } openMenu(zone, more); });
    c.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!settings || e.target.closest('input.rename')) return; openMenu(zone, null, e.clientX, e.clientY); });
    c.addEventListener('dblclick', (e) => { if (e.target.closest('button, input')) return; convertFrom(zone); });
    c.addEventListener('keydown', (e) => onCardKey(e, c));
    c.title = t('card.title');
    attachDrag(c);
    return c;
  }
  function applyLabel(card, zone) {
    const city = card._city;
    setText(city, labelOf(zone));
    city.title = `${displayName(zone)}, ${regionOf(zone)} (${zone})`;
    card.querySelector('.more').setAttribute('aria-label', t('card.moreFor', { city: labelOf(zone) }));
    card._aria = null; // force aria-label refresh
  }

  function updateCard(c, zone, date, refZone, converting, pickedDate) {
    const k = clock(zone, date);
    const hmEl = c.querySelector('.hm'); const prevHm = hmEl.textContent;
    setText(hmEl, k.hm);
    if (prevHm && prevHm !== k.hm) emit('time-change', { card: c, from: prevHm, to: k.hm, converting });
    setText(c.querySelector('.sec'), (!converting && settings.showSeconds) ? k.sec : '');
    setText(c.querySelector('.ampm'), k.ampm);
    const isHome = zone === LOCAL_ZONE;
    c.classList.toggle('converted', converting);
    c.classList.toggle('home', isHome);

    const hp = parts(zone, date, { hourCycle: 'h23', hour: '2-digit', minute: '2-digit' });
    const hour = +hp.hour;
    const ll = coordsOf(zone);
    const key = ll ? sunPhase(date, ll, hour) : T.phaseOf(hour);
    const ph = c.querySelector('.phase');
    const phaseLabel = t('phase.' + key);
    setText(ph, phaseLabel);
    if (ph.className !== `phase ${key}`) ph.className = `phase ${key}`;
    const sunTitle = ll ? sunTitleOf(zone, date, ll) : '';
    if (ph.title !== sunTitle) ph.title = sunTitle;
    if (c.dataset.phase !== key) c.dataset.phase = key;
    const p = ((hour * 60 + +hp.minute) / 1440).toFixed(4);
    if (c._p !== p) { c._p = p; c.style.setProperty('--p', p); }
    // Displayed instant for motion/sky.js: the converted instant, or now to the minute (avoids per-second churn).
    const epoch = String(converting ? date.getTime() : Math.floor(date.getTime() / 60000) * 60000);
    if (c.dataset.epoch !== epoch) c.dataset.epoch = epoch;
    // Working-hours band on the day line follows this city's hours; dimmed on its days off.
    const wh = hoursOf(zone);
    const ws = toMin(wh.start) / 1440, we = toMin(wh.end) / 1440;
    const offDay = !wh.days.includes(localWall(zone, date).wd);
    const bandKey = `${ws}|${we}|${offDay}`;
    if (c._band !== bandKey) {
      c._band = bandKey;
      c.style.setProperty('--ws', ws.toFixed(4)); c.style.setProperty('--we', we.toFixed(4));
      c.querySelector('.arc-work').classList.toggle('overnight', we < ws);
      c.classList.toggle('off-day', offDay);
    }
    c.classList.toggle('working', isWorking(zone, date));
    c.classList.toggle('is-night', ll ? !window.WCSun.isDay(date, ll[0], ll[1]) : (hour < 6 || hour >= 20));
    const asleep = converting && (hour >= 22 || hour < 7);
    c.classList.toggle('asleep', asleep);
    const moonEl = c.querySelector('.moon');
    if (moonEl.hidden === asleep) moonEl.hidden = !asleep;
    const pin = c.querySelector('.pin');
    if (pin.hidden === isHome) pin.hidden = !isHome;
    const sky = c.querySelector('.sky');
    setText(sky, (key === 'night' || key === 'dusk') ? '\u{1F319}' : '☀️');

    const diff = T.dayDiff(zone, date, refZone);
    const dateStr = T.fmt(zone, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }, locale()).format(date);
    const marker = dayMarker(diff);
    const d = c.querySelector('.date');
    const dKey = dateStr + '|' + marker;
    if (d._key !== dKey) {
      d._key = dKey;
      d.textContent = dateStr;
      if (marker) { const s = document.createElement('span'); s.className = 'shift'; s.textContent = marker; d.append(' ', s); }
    }
    d.classList.toggle('same', !diff);
    // A date other than today picked in the converter: every card shows its own local date, so the chosen day is
    // visible on the clocks themselves (not only in the date button). Otherwise the pill shows the day shift.
    const ds = c.querySelector('.dshift');
    const pill = pickedDate ? T.fmt(zone, { month: 'short', day: 'numeric' }, locale()).format(date) : marker;
    setText(ds, pill);
    if (ds.hidden !== !pill) ds.hidden = !pill;
    ds.classList.toggle('on-date', !!pickedDate);
    const isSource = converting && zone === refZone;
    c.classList.toggle('source', isSource);
    const srcBadge = c.querySelector('.src-badge');
    if (srcBadge.hidden === isSource) srcBadge.hidden = !isSource; // visible "Source" label, not only the accent color

    const tz = tzInfo(zone, date);
    const tzn = c.querySelector('.tzname');
    setText(tzn, tz.abbr);
    if (tzn.title !== tz.long) tzn.title = tz.long;
    const utc = `UTC${T.formatOffset(T.offsetMinutes(zone, date))}`;
    setText(c.querySelector('.utc'), utc);
    const rel = c.querySelector('.rel');
    setText(rel, relLabel(zone, date));
    rel.classList.toggle('home', isHome);

    const dn = dstNote(zone, date);
    const dstEl = c.querySelector('.dst-note');
    setText(dstEl, dn ? dn.text : '');
    if (dstEl.title !== (dn ? dn.title : '')) dstEl.title = dn ? dn.title : '';
    if (dstEl.hidden !== !dn) dstEl.hidden = !dn;

    const timeText = k.ampm ? `${k.hm} ${k.ampm}` : k.hm;
    const working = c.classList.contains('working');
    const aria = [displayName(zone), timeText, isHome ? t('card.home') : relSpoken(zone, date),
      converting ? t(isSource ? 'card.state.source' : 'card.state.converted') : '', pickedDate ? dateStr : '', marker,
      phaseLabel, asleep ? t('card.asleep') : '', t(working ? 'card.state.working' : 'card.state.off'), utc, tz.long, dn ? dn.text : '']
      .filter(Boolean).join(', ');
    if (c._aria !== aria) {
      c._aria = aria;
      if (document.activeElement !== c || !c.hasAttribute('aria-label')) c.setAttribute('aria-label', aria);
    }
  }

  // ---------- card actions ----------
  function convertFrom(zone) {
    if (!settings) return;
    el.convZone.value = zone;
    if (!el.convTime.value) el.convTime.value = formatInput(9, 0);
    applyConvert(true);
    el.convTime.focus(); el.convTime.select();
  }
  function moveZone(zone, delta) {
    const z = [...settings.zones]; const i = z.indexOf(zone); const j = i + delta;
    if (i < 0 || j < 0 || j >= z.length) return false;
    [z[i], z[j]] = [z[j], z[i]];
    saveZones(z);
    announce(t('say.moved', { city: labelOf(zone), n: j + 1 }));
    return true;
  }
  function removeZone(zone) {
    const z = settings.zones.filter((x) => x !== zone);
    const i = settings.zones.indexOf(zone);
    saveZones(z);
    announce(t('say.removed', { city: labelOf(zone) }));
    const cards = [...el.strip.querySelectorAll('.card[data-zone]')];
    const next = cards[Math.min(i, cards.length - 1)];
    if (next) next.focus(); else el.search.focus();
  }
  function onCardKey(e, card) {
    if (!settings || e.target !== card) return;
    const zone = card.dataset.zone;
    const vertical = layout() === 'vertical';
    // A digit starts a conversion from this city: the digit goes into the time field, which takes focus, so the rest
    // of the time is typed there ("1", "5" reads 15, then 15:00 on blur).
    if (/^[0-9]$/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      if (el.convDate.dataset.auto) el.convDate.value = ''; // an automatic date is re-picked: today in this city
      el.convZone.value = zone;
      el.convTime.value = e.key;
      applyConvert();
      el.convTime.focus();
      try { el.convTime.setSelectionRange(1, 1); } catch { /* not a text field */ }
    }
    else if (e.key === 'Enter') { e.preventDefault(); convertFrom(zone); }
    else if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || (vertical && (e.key === 'ArrowUp' || e.key === 'ArrowDown')))) {
      e.preventDefault();
      moveZone(zone, (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -1 : 1);
      const c = cardEl(zone); if (c) c.focus();
    } else if (e.key === 'Delete') { e.preventDefault(); removeZone(zone); }
    else if (e.key === 'F2') { e.preventDefault(); startRename(zone); }
    else if (e.key === '[' || e.key === ']') { e.preventDefault(); scrubBy(e.key === ']' ? 15 : -15); }
    else if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); scrubBy(e.key === 'PageUp' ? 60 : -60); }
    else if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') { e.preventDefault(); openMenu(zone, card.querySelector('.more')); }
  }

  // ---------- rename ----------
  function startRename(zone) {
    const card = cardEl(zone); if (!card) return;
    const span = card._city;
    if (!span.isConnected) return; // already renaming
    const input = document.createElement('input');
    input.type = 'text'; input.className = 'rename'; input.maxLength = 40; input.spellcheck = false; input.autocomplete = 'off';
    input.value = labelOf(zone);
    input.setAttribute('aria-label', t('card.renameAria', { city: cityOf(zone) }));
    card.draggable = false;
    span.replaceWith(input);
    input.focus(); input.select();
    let done = false;
    const finish = input._finish = (save) => {
      if (done) return; done = true;
      if (input.isConnected) input.replaceWith(span);
      card.draggable = true;
      if (save && settings) {
        const before = displayName(zone);
        const v = input.value.trim().slice(0, 40);
        const labels = { ...(settings.labels || {}) };
        if (!v || v === cityOf(zone)) delete labels[zone]; else labels[zone] = v;
        if ((labels[zone] || '') !== customLabel(zone)) {
          set({ labels });
          fillConvZones();
          announce(t('say.renamed', { old: before, name: labelOf(zone) }));
        }
      }
      if (card.isConnected && document.activeElement === document.body) card.focus();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); finish(true); card.focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); card.focus(); }
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
    input.addEventListener('dblclick', (e) => e.stopPropagation());
  }

  // ---------- copy ----------
  // "Copy times": a header line, then one line per city. The rows go along too, so main can put a table on the
  // clipboard for mail and chat apps (it builds and escapes the HTML itself).
  function copyData(onlyZone) {
    const date = convert ? new Date(convert.epochMs) : new Date();
    const refZone = convert ? convert.zone : LOCAL_ZONE;
    let header;
    if (convert) header = atTime('copy.header', { time: formatTime(convert.h, convert.mi), city: labelOf(convert.zone) }, shownHour(convert.h));
    else { const k = clock(LOCAL_ZONE, date); header = atTime('copy.header', { time: k.ampm ? `${k.hm} ${k.ampm}` : k.hm, city: labelOf(LOCAL_ZONE) }, parseInt(k.hm, 10)); }
    const zones = settings.zones.filter((z) => supportsZone(z) && (!onlyZone || z === onlyZone));
    const rows = zones.map((z) => {
      const k = clock(z, date);
      const day = T.fmt(z, { weekday: 'short', month: 'short', day: 'numeric' }, locale()).format(date);
      const marker = dayMarker(T.dayDiff(z, date, refZone));
      return [labelOf(z), k.ampm ? `${k.hm} ${k.ampm}` : k.hm, `${day}${marker ? ' ' + marker : ''}`];
    });
    return { text: [header, ...rows.map(([city, time, day]) => `${time} ${city} · ${day}`)].join('\n'), rows };
  }
  const copyLines = (onlyZone) => copyData(onlyZone).text;
  // The instant on screen: the converted one, or now to the minute.
  const shownEpoch = () => (convert ? convert.epochMs : Math.floor(Date.now() / 60000) * 60000);
  // Discord shows <t:...> in each reader's own time zone: the full date and time, then "in 3 hours".
  function discordText() { const sec = Math.floor(shownEpoch() / 1000); return `<t:${sec}:F> (<t:${sec}:R>)`; }
  // ISO 8601 in UTC (no milliseconds), then the same instant as the clock shows it: "15:00 UTC, Thu, Sep 24".
  function utcText() {
    const d = new Date(shownEpoch());
    const day = T.fmt('UTC', { weekday: 'short', month: 'short', day: 'numeric' }, locale()).format(d);
    return `${d.toISOString().replace(/\.\d{3}Z$/, 'Z')}\n${formatTime(d.getUTCHours(), d.getUTCMinutes())} UTC, ${day}`;
  }
  let copiedTimer = null;
  // A short status in the hint line (or the toast under the time field); `say` is what a screen reader hears.
  function flashStatus(text, say) {
    announce(say || text);
    clearTimeout(copiedTimer);
    el.convHint.textContent = text;
    toast(text, 1500);
    copiedTimer = setTimeout(refreshHint, 1500);
  }
  function copyOut(payload, onlyZone) {
    Promise.resolve(window.wc.copyText(payload)).then((ok) => {
      if (ok === false) return;
      flashStatus(t('hint.copied'), t('say.copied'));
      emit('copied', { onlyZone });
    }).catch(onIpcError);
  }
  function doCopy(onlyZone) {
    if (!settings || !settings.zones.some(supportsZone)) return; // a header with no cities is not worth copying
    const d = copyData(onlyZone);
    copyOut(onlyZone || settings.web ? d.text : d, onlyZone); // the web app's clipboard takes plain text
  }
  // A calendar invite (.ics) from startMs to endMs; main checks it, asks where to save it and writes the file.
  function saveInvite(startMs, endMs, description) {
    if (!settings || typeof window.wc.saveIcs !== 'function') return;
    Promise.resolve(window.wc.saveIcs({ startMs, endMs, title: t('ics.title'), description: String(description || '').slice(0, 2000) }))
      .then((r) => { if (r === 'saved') flashStatus(t('say.icsSaved')); }).catch(onIpcError);
  }

  // Copy menu (#btnCopy, shown while converting): the times, a Discord timestamp, UTC, or a calendar invite.
  const copyItems = () => [...el.copyMenu.querySelectorAll('[role="menuitem"]')].filter((b) => !b.hidden && !b.disabled);
  function openCopyMenu() {
    if (!settings || !settings.zones.some(supportsZone)) return;
    closeMenu(false); closeChips(false); closeHours(false);
    el.copyMenu.querySelector('[data-copy="ics"]').hidden = typeof window.wc.saveIcs !== 'function';
    el.copyMenu.hidden = false;
    el.btnCopy.setAttribute('aria-expanded', 'true');
    placePopover(el.copyMenu, el.btnCopy.getBoundingClientRect());
    const first = copyItems()[0]; if (first) first.focus();
    emit('menu', { open: true, menu: el.copyMenu, anchor: el.btnCopy });
  }
  function closeCopyMenu(returnFocus) {
    if (el.copyMenu.hidden) return;
    emit('menu', { open: false, menu: el.copyMenu });
    el.copyMenu.hidden = true;
    el.btnCopy.setAttribute('aria-expanded', 'false');
    if (returnFocus && !el.btnCopy.hidden) el.btnCopy.focus();
  }
  el.btnCopy.addEventListener('click', guard((e) => { e.stopPropagation(); if (el.copyMenu.hidden) openCopyMenu(); else closeCopyMenu(true); }));
  el.copyMenu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-copy]');
    if (!b || !settings) return;
    const what = b.dataset.copy;
    closeCopyMenu(true);
    if (what === 'text') doCopy(null);
    else if (what === 'discord') copyOut(discordText(), null);
    else if (what === 'utc') copyOut(utcText(), null);
    else if (what === 'ics') { const at = shownEpoch(); saveInvite(at, at + 3600000, copyLines(null)); }
  });
  el.copyMenu.addEventListener('keydown', (e) => {
    const items = copyItems(); if (!items.length) return;
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeCopyMenu(true); }
    else if (e.key === 'Tab') { e.preventDefault(); closeCopyMenu(true); }
  });
  document.addEventListener('mousedown', (e) => { if (!el.copyMenu.hidden && !el.copyMenu.contains(e.target) && !el.btnCopy.contains(e.target)) closeCopyMenu(false); });
  window.addEventListener('blur', () => closeCopyMenu(false));

  // ---------- card menu ----------
  const menuItems = () => [...el.menu.querySelectorAll('[role="menuitem"]')].filter((b) => !b.disabled && !b.hidden);
  function openMenu(zone, anchor, x, y) {
    if (!settings) return;
    if (!el.menu.hidden) closeMenu(false);
    menuZone = zone;
    menuAnchor = anchor || cardEl(zone);
    const i = settings.zones.indexOf(zone);
    const vertical = layout() === 'vertical';
    const left = el.menu.querySelector('[data-act="left"]'), right = el.menu.querySelector('[data-act="right"]');
    left.textContent = t(vertical ? 'menu.up' : 'menu.left');
    right.textContent = t(vertical ? 'menu.down' : 'menu.right');
    left.disabled = i <= 0;
    right.disabled = i >= settings.zones.length - 1;
    el.menu.hidden = false;
    if (anchor) anchor.setAttribute('aria-expanded', 'true');
    placePopover(el.menu, anchor ? anchor.getBoundingClientRect() : null, x, y);
    const first = menuItems()[0]; if (first) first.focus();
    emit('menu', { open: true, menu: el.menu, anchor });
  }
  // Popover placement that never covers its own anchor: below it, else above, else beside it (left, then right).
  // A menu taller than the window switches to two columns (.menu-grid) first; past that it scrolls (CSS max-height).
  function placePopover(pop, r, x, y) {
    const W = window.innerWidth, H = window.innerHeight, M = 6;
    pop.classList.remove('menu-grid');
    pop.style.left = '0px'; pop.style.top = '0px';
    // scrollHeight: offsetHeight is already capped by the CSS max-height
    if (pop === el.menu && (layout() === 'compact' || pop.scrollHeight > H - 2 * M)) pop.classList.add('menu-grid');
    const w = pop.offsetWidth, h = pop.offsetHeight;
    const clampX = (v) => Math.max(M, Math.min(v, W - w - M));
    const clampY = (v) => Math.max(M, Math.min(v, H - h - M));
    let lx, ty;
    if (!r) { lx = clampX(x); ty = clampY(y); }
    else if (r.bottom + 4 + h <= H - M) { lx = clampX(r.right - w); ty = r.bottom + 4; }
    else if (r.top - 4 - h >= M) { lx = clampX(r.right - w); ty = r.top - 4 - h; }
    else {
      ty = clampY(r.top - 8);
      lx = clampX(r.left - 4 - w >= M ? r.left - 4 - w : r.right + 4 + w <= W - M ? r.right + 4 : r.right - w);
    }
    pop.style.left = lx + 'px'; pop.style.top = ty + 'px';
  }
  function closeMenu(returnFocus) {
    if (!el.menu.hidden) emit('menu', { open: false, menu: el.menu });
    if (el.menu.hidden) return;
    el.menu.hidden = true;
    el.strip.querySelectorAll('.more[aria-expanded="true"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
    const anchor = menuAnchor;
    menuZone = null; menuAnchor = null;
    if (returnFocus && anchor && anchor.isConnected) anchor.focus();
  }
  el.menu.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || !settings || !menuZone) return;
    const act = btn.dataset.act; const zone = menuZone;
    closeMenu(act !== 'source' && act !== 'rename' && act !== 'remove' && act !== 'hours');
    if (act === 'remove') removeZone(zone);
    else if (act === 'left') moveZone(zone, -1);
    else if (act === 'right') moveZone(zone, 1);
    else if (act === 'source') convertFrom(zone);
    else if (act === 'rename') startRename(zone);
    else if (act === 'copy') doCopy(zone);
    else if (act === 'hours') openHours(zone, cardEl(zone));
  });
  el.menu.addEventListener('keydown', (e) => {
    const items = menuItems(); if (!items.length) return;
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(true); }
    else if (e.key === 'Tab') { e.preventDefault(); closeMenu(true); }
  });
  document.addEventListener('mousedown', (e) => { if (!el.menu.hidden && !el.menu.contains(e.target) && !e.target.closest('.more')) closeMenu(false); });
  window.addEventListener('blur', () => closeMenu(false));

  // ---------- drag reorder ----------
  let dragZone = null;
  function attachDrag(card) {
    card.addEventListener('dragstart', (e) => { if (!settings || arcScrub) { e.preventDefault(); return; } dragZone = card.dataset.zone; card.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    card.addEventListener('dragend', () => { card.classList.remove('dragging'); clearDrop(); dragZone = null; });
    card.addEventListener('dragover', (e) => {
      if (!dragZone || dragZone === card.dataset.zone) return;
      e.preventDefault(); clearDrop();
      const r = card.getBoundingClientRect();
      const before = layout() === 'vertical' ? e.clientY < r.top + r.height / 2 : e.clientX < r.left + r.width / 2;
      card.classList.add(before ? 'drop-before' : 'drop-after');
    });
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!settings || !dragZone || dragZone === card.dataset.zone) { clearDrop(); return; }
      const before = card.classList.contains('drop-before');
      clearDrop();
      const moved = dragZone;
      const z = settings.zones.filter((x) => x !== moved);
      z.splice(z.indexOf(card.dataset.zone) + (before ? 0 : 1), 0, moved);
      saveZones(z);
      announce(t('say.moved', { city: labelOf(moved), n: z.indexOf(moved) + 1 }));
    });
  }
  const clearDrop = () => el.strip.querySelectorAll('.drop-before,.drop-after').forEach((c) => c.classList.remove('drop-before', 'drop-after'));

  // ---------- zones ----------
  let saveSeq = 0;
  function saveZones(z) {
    if (!settings) return;
    const prevZones = settings.zones;
    emit('zones-before', { from: prevZones, to: z });
    settings.zones = z;
    fillConvZones();
    // If the converter's source city was removed, re-run the conversion from the fallback source.
    if (convert && convert.zone !== el.convZone.value) applyConvert(); else render();
    emit('zones-after', { from: prevZones, to: z });
    // Main validates and may drop unknown zones; adopt its copy if it differs. Only the latest reply counts,
    // so a slow reply to an older save cannot clobber newer local changes.
    const seq = ++saveSeq;
    window.wc.setSettings({ zones: z }).then((s) => {
      if (seq === saveSeq && s && JSON.stringify(s.zones) !== JSON.stringify(settings.zones)) saveZones(s.zones);
    }).catch(onIpcError);
  }
  function addZone(zone) {
    if (settings.zones.includes(zone)) return;
    saveZones([...settings.zones, zone]);
    announce(t('say.added', { city: labelOf(zone) }));
  }

  // Abbreviations map to representative zones (first = most common meaning).
  const ABBR = {
    est: ['America/New_York', 'America/Toronto'], edt: ['America/New_York', 'America/Toronto'], et: ['America/New_York'],
    cst: ['America/Chicago', 'America/Mexico_City'], cdt: ['America/Chicago'], ct: ['America/Chicago'],
    mst: ['America/Denver', 'America/Phoenix'], mdt: ['America/Denver'], mt: ['America/Denver'],
    pst: ['America/Los_Angeles', 'America/Vancouver'], pdt: ['America/Los_Angeles', 'America/Vancouver'], pt: ['America/Los_Angeles'],
    akst: ['America/Anchorage'], akdt: ['America/Anchorage'], hst: ['Pacific/Honolulu'],
    ast: ['America/Halifax'], adt: ['America/Halifax'], nst: ['America/St_Johns'], ndt: ['America/St_Johns'],
    brt: ['America/Sao_Paulo'], art: ['America/Argentina/Buenos_Aires'], clt: ['America/Santiago'], cot: ['America/Bogota'], pet: ['America/Lima'],
    gmt: ['Europe/London', 'Europe/Dublin'], bst: ['Europe/London'], wet: ['Europe/Lisbon'], west: ['Europe/Lisbon'],
    cet: ['Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Rome'], cest: ['Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Rome'],
    eet: ['Europe/Athens', 'Europe/Helsinki', 'Africa/Cairo'], eest: ['Europe/Athens', 'Europe/Helsinki'], msk: ['Europe/Moscow'],
    wat: ['Africa/Lagos'], cat: ['Africa/Johannesburg'], sast: ['Africa/Johannesburg'], eat: ['Africa/Nairobi'],
    gst: ['Asia/Dubai'], pkt: ['Asia/Karachi'], ist: ['Asia/Kolkata', 'Europe/Dublin', 'Asia/Jerusalem'], npt: ['Asia/Kathmandu'],
    ict: ['Asia/Bangkok', 'Asia/Ho_Chi_Minh'], wib: ['Asia/Jakarta'], sgt: ['Asia/Singapore'], hkt: ['Asia/Hong_Kong'], pht: ['Asia/Manila'],
    jst: ['Asia/Tokyo'], kst: ['Asia/Seoul'], awst: ['Australia/Perth'],
    acst: ['Australia/Adelaide'], acdt: ['Australia/Adelaide'], aest: ['Australia/Sydney', 'Australia/Brisbane'], aedt: ['Australia/Sydney', 'Australia/Melbourne'],
    nzst: ['Pacific/Auckland'], nzdt: ['Pacific/Auckland'],
  };
  // "+3", "-5", "UTC+5:30", "GMT-3", "utc" -> offset in minutes, else null. A lone "z" is not an offset: it is the
  // start of Zurich, Zagreb...
  function parseOffsetQuery(q) {
    const s = q.replace(/\s+/g, '').replace(/−/g, '-');
    if (/^(utc|gmt)$/.test(s)) return 0;
    const m = /^(?:utc|gmt)?([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(s);
    if (!m || +m[2] > 14 || (m[3] && +m[3] >= 60)) return null;
    return (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + (m[3] ? +m[3] : 0));
  }
  // Case- and accent-insensitive text for matching ("sao" finds São Paulo, "zurich" finds Zúrich).
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  let lastOffsetQuery = null; // { off } when the current results come from an offset / abbreviation match
  function searchZones(q) {
    q = fold(q.trim());
    lastOffsetQuery = null;
    if (!q || !settings) return [];
    const now = new Date();
    const off = parseOffsetQuery(q);
    if (off !== null) {
      lastOffsetQuery = { off };
      // One pass over every zone with throwaway formatters, kept for this minute (and dropped when the search field
      // loses focus), so a "+5" search does not fill the shared formatter cache with ~400 zones.
      const minute = Math.floor(now.getTime() / 60000);
      if (!searchZones.offsets || searchZones.offsets.minute !== minute) {
        const byZone = new Map();
        for (const z of ALL_ZONES) byZone.set(z, T.offsetMinutesUncached(z, now));
        searchZones.offsets = { minute, byZone };
      }
      const offs = searchZones.offsets.byZone;
      return ALL_ZONES.filter((z) => !settings.zones.includes(z) && offs.get(z) === off)
        .sort((a, b) => (window.ZONE_META[a] ? 0 : 1) - (window.ZONE_META[b] ? 0 : 1) || cityOf(a).localeCompare(cityOf(b)))
        .slice(0, 10);
    }
    const abbr = (ABBR[q] || []).filter((z) => supportsZone(z) && !settings.zones.includes(z));
    if (abbr.length) lastOffsetQuery = { abbr: true };
    const scored = abbr.map((z) => ({ z, score: -1 }));
    for (const z of ALL_ZONES) {
      if (settings.zones.includes(z)) continue;
      const m = window.ZONE_META[z];
      const city = fold(cityOf(z)), en = fold(englishCity(z));
      const label = fold(customLabel(z));
      const hay = fold(`${z} ${city} ${en} ${label} ${regionOf(z)} ${m ? m.country + ' ' + (m.alias || '') : ''}`).replace(/_/g, ' ');
      let score = -1;
      if (city.startsWith(q) || en.startsWith(q) || (label && label.startsWith(q))) score = 0;
      else if (city.includes(q) || en.includes(q) || (label && label.includes(q))) score = 1;
      else if (hay.includes(q)) score = m ? 2 : 3;
      if (score >= 0 && !abbr.includes(z)) scored.push({ z, score });
    }
    scored.sort((a, b) => a.score - b.score || (a.score < 0 ? 0 : cityOf(a.z).localeCompare(cityOf(b.z))));
    return scored.slice(0, 10).map((s) => s.z);
  }
  // Nothing to add for this query: say why (the city is already on the list, or nothing matches).
  function emptySearchText(q) {
    const f = fold(q.trim());
    if (!f) return '';
    const have = settings.zones.find((z) => [cityOf(z), englishCity(z), customLabel(z)].some((s) => s && fold(s).startsWith(f)));
    return have ? t('search.already', { city: labelOf(have) }) : t('search.none');
  }
  let sel = -1;
  // Combobox state: aria-expanded follows the popup, aria-activedescendant the highlighted option.
  function syncCombo() {
    const open = !el.results.hidden;
    el.search.setAttribute('aria-expanded', String(open));
    const act = open && sel >= 0 ? document.getElementById('zr-' + sel) : null;
    if (act) el.search.setAttribute('aria-activedescendant', act.id); else el.search.removeAttribute('aria-activedescendant');
  }
  // "No matching cities" / "<City> is already on your list" are spoken once per message (debounced while typing).
  let emptySaid = '', emptyTimer = null;
  function sayEmpty(text) {
    clearTimeout(emptyTimer);
    if (!text) { emptySaid = ''; return; }
    if (text === emptySaid) return;
    emptyTimer = setTimeout(() => { emptySaid = text; announce(text); }, 450);
  }
  function renderResults() {
    renderResultsList();
    syncCombo();
  }
  function renderResultsList() {
    if (!settings) return;
    const list = searchZones(el.search.value);
    const emptyText = list.length || document.activeElement !== el.search ? '' : emptySearchText(el.search.value);
    const wasHidden = el.results.hidden;
    el.results.hidden = list.length === 0 && !emptyText;
    if (!el.results.hidden && wasHidden) queueMicrotask(() => emit('results', { open: true, list: el.results }));
    if (!el.results.hidden) {
      const r = el.search.getBoundingClientRect();
      el.results.style.left = Math.max(6, Math.min(r.right - 260, window.innerWidth - 266)) + 'px';
      el.results.style.top = (r.bottom + 6) + 'px';
      el.results.style.maxHeight = Math.max(80, window.innerHeight - r.bottom - 14) + 'px';
    }
    sel = list.length ? Math.max(0, Math.min(sel, list.length - 1)) : -1;
    sayEmpty(emptyText);
    const now = new Date();
    if (!list.length) {
      if (!emptyText) { el.results.replaceChildren(); return; }
      const li = document.createElement('li');
      li.id = 'zr-empty'; li.className = 'results-empty'; li.setAttribute('role', 'option'); li.setAttribute('aria-disabled', 'true');
      li.textContent = emptyText;
      li.addEventListener('mousedown', (e) => e.preventDefault());
      el.results.replaceChildren(li);
      return;
    }
    el.results.replaceChildren(...list.map((z, i) => {
      const li = document.createElement('li');
      li.id = 'zr-' + i; li.setAttribute('role', 'option'); li.className = i === sel ? 'sel' : '';
      li.setAttribute('aria-selected', String(i === sel));
      const tm = clock(z, now);
      li.innerHTML = '<span><b></b> <span class="muted"></span></span><span class="z"></span>';
      li.querySelector('b').textContent = cityOf(z);
      const region = customLabel(z) ? `${customLabel(z)} · ${regionOf(z)}` : regionOf(z);
      li.querySelector('.muted').textContent = lastOffsetQuery ? `${region} · UTC${T.formatOffset(T.offsetMinutes(z, now))}` : region;
      li.querySelector('.z').textContent = tm.ampm ? `${tm.hm} ${tm.ampm}` : tm.hm;
      li.addEventListener('mousedown', (e) => { e.preventDefault(); pick(z); });
      return li;
    }));
  }
  function pick(z) {
    addZone(z); el.search.value = ''; sel = -1; renderResults();
    // Focus moves to the new card (Enter then converts from it), not to the page body. With the planner or the map
    // open the cards are hidden, so it stays in the search field.
    requestAnimationFrame(() => {
      const c = el.strip.querySelector(`.card[data-zone="${CSS.escape(z)}"]`);
      if (c && c.offsetParent !== null) c.focus({ preventScroll: true }); else el.search.focus();
    });
    const behavior = reducedMotion() ? 'auto' : 'smooth';
    if (layout() === 'vertical') el.strip.scrollTo({ top: el.strip.scrollHeight, behavior });
    else el.strip.scrollTo({ left: el.strip.scrollWidth, behavior });
  }
  el.search.addEventListener('input', guard(() => { sel = 0; renderResults(); }));
  el.search.addEventListener('focus', guard(renderResults));
  el.search.addEventListener('blur', () => setTimeout(() => { el.results.hidden = true; sayEmpty(''); syncCombo(); searchZones.offsets = null; }, 120));
  el.search.addEventListener('keydown', guard((e) => {
    const n = el.results.querySelectorAll('li').length;
    if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, n - 1); renderResults(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); renderResults(); e.preventDefault(); }
    else if (e.key === 'Enter') { const list = searchZones(el.search.value); if (list[sel]) pick(list[sel]); }
    else if (e.key === 'Escape') { el.search.value = ''; renderResults(); el.search.blur(); }
  }));
  // Horizontal wheel scrolling for the strip and compact layouts (vertical and wrapped rows scroll natively). A card
  // marks the wheel defaultPrevented when it scrubs the time (its digits or day line, or anywhere on it when every card
  // fits); otherwise the wheel lands here and scrolls to the hidden cards. Ctrl+wheel zooms.
  let stripWheelAcc = 0;
  el.strip.addEventListener('wheel', (e) => {
    if (layout() === 'vertical' || el.strip.classList.contains('rows') || e.defaultPrevented || e.ctrlKey) return;
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || e.target.closest('.results')) return;
    e.preventDefault();
    // One notch = one card (like one notch = 15 minutes on the digits); small deltas (touchpads) add up to a notch first.
    // The strip snaps to cards, and scrolling by less than a card snaps back to the card it started on, so each step is
    // a whole card: scrollBy lands on the next card in the wheel's direction.
    const dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 100 : 1);
    let steps;
    if (Math.abs(dy) >= 50) { stripWheelAcc = 0; steps = Math.sign(dy) * Math.max(1, Math.round(Math.abs(dy) / 120)); }
    else {
      if (Math.sign(dy) !== Math.sign(stripWheelAcc)) stripWheelAcc = 0;
      stripWheelAcc += dy;
      steps = Math.trunc(stripWheelAcc / 80);
      stripWheelAcc -= steps * 80;
    }
    if (!steps) return;
    // Already at that end: nothing to scroll to (scrollBy would only snap the strip a few pixels back to a card).
    const s = el.strip;
    if (steps > 0 ? s.scrollLeft + s.clientWidth >= s.scrollWidth - 1 : s.scrollLeft <= 0) return;
    const card = el.strip.querySelector('.card[data-zone]');
    const pitch = card ? card.offsetWidth + (parseFloat(getComputedStyle(el.strip).columnGap) || 12) : CARD_MIN_W;
    el.strip.scrollBy({ left: steps * pitch, behavior: 'instant' });
  }, { passive: false });

  // Edge fades while more cards sit past an edge (start fade once scrolled, so cards never slide under a hard edge).
  function updateOverflow() {
    const s = el.strip;
    const vertical = layout() === 'vertical';
    const down = vertical || s.classList.contains('rows');
    const more = down ? s.scrollTop + s.clientHeight < s.scrollHeight - 2 : s.scrollLeft + s.clientWidth < s.scrollWidth - 2;
    s.classList.toggle('overflow-end', more);
    s.classList.toggle('overflow-start', down ? s.scrollTop > 2 : s.scrollLeft > 2);
  }
  // After a render, read the overflow once the frame is laid out (a timer after the next animation frame), so a minute
  // tick or a scrub step never forces a layout. One read per frame at most.
  let overflowQueued = false;
  function queueOverflow() {
    if (overflowQueued) return;
    overflowQueued = true;
    requestAnimationFrame(() => setTimeout(() => { overflowQueued = false; updateOverflow(); }, 0));
  }
  // The strip's rows and fades depend on its size: this catches every size change, including the strip coming back
  // after the planner or map (no window resize then). The callback runs after layout, so its reads are cheap.
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (settings) updateStripRows(); updateOverflow(); }).observe(el.strip);
  el.strip.addEventListener('scroll', updateOverflow, { passive: true });
  let lastNarrow = window.innerWidth < 400;
  window.addEventListener('resize', () => {
    if (settings) { applyBarStack(); updateStripRows(); }
    updateOverflow();
    fitPlanner();
    syncLayoutSwitch(); fixLayoutFocus();
    if (!el.convToast.hidden) el.convToast.hidden = true;
    const narrow = window.innerWidth < 400;
    if (narrow !== lastNarrow) { lastNarrow = narrow; fillConvZones(); }
  });

  // ---------- converter ----------
  function fillConvZones() {
    if (!settings) return;
    const cur = el.convZone.value || LOCAL_ZONE;
    const list = [LOCAL_ZONE, ...settings.zones.filter((z) => z !== LOCAL_ZONE)];
    el.convZone.replaceChildren(...list.map((z) => {
      const o = document.createElement('option'); o.value = z; o.textContent = z === LOCAL_ZONE && window.innerWidth >= 400 ? t('conv.local', { city: labelOf(z) }) : labelOf(z); return o;
    }));
    el.convZone.value = list.includes(cur) ? cur : LOCAL_ZONE;
  }
  function todayIn(zone) { const p = parts(zone, new Date(), { year: 'numeric', month: '2-digit', day: '2-digit' }); return `${p.year}-${p.month}-${p.day}`; }
  // 'YYYY-MM-DD' -> localized "Thu, Sep 24" (the calendar date itself, no zone shift).
  const ymdDate = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); };
  const ymdLabel = (ymd) => T.fmt('UTC', { weekday: 'short', month: 'short', day: 'numeric' }, locale()).format(ymdDate(ymd));
  const addDays = (ymd, n) => new Date(ymdDate(ymd).getTime() + n * DAY_MS).toISOString().slice(0, 10);
  function setInvalid(on) {
    el.convTime.classList.toggle('invalid', on);
    // The format hint (#convFormat) is always attached; while invalid, the hint line says the same thing.
    if (on) { el.convTime.setAttribute('aria-invalid', 'true'); el.convTime.setAttribute('aria-describedby', 'convHint'); }
    else { el.convTime.removeAttribute('aria-invalid'); el.convTime.setAttribute('aria-describedby', 'convFormat'); }
  }
  function refreshHint() {
    clearTimeout(copiedTimer);
    if (!settings) return;
    if (convert) {
      const ymd = el.convDate.value;
      const sh = shownHour(convert.h);
      if (ymd && ymd !== todayIn(convert.zone)) el.convHint.textContent = atTime('hint.whenOn', { time: formatTime(convert.h, convert.mi), city: labelOf(convert.zone), date: ymdLabel(ymd) }, sh);
      else el.convHint.textContent = atTime('hint.when', { time: formatTime(convert.h, convert.mi), city: labelOf(convert.zone) }, sh);
    }
    else if (el.convTime.value.trim() && !T.parseTime(el.convTime.value)) el.convHint.textContent = t('hint.invalid');
    else el.convHint.textContent = '';
  }
  // Below 1400px (and in the vertical bar) the hint line is hidden, so short status messages (invalid time, Copied)
  // appear as a small toast under the time field instead of only a red outline or nothing.
  const hintShown = () => getComputedStyle(el.convHint).display !== 'none';
  let toastTimer = null;
  function toast(text, ms, error) {
    clearTimeout(toastTimer);
    if (!text || hintShown()) { el.convToast.hidden = true; return; }
    el.convToast.textContent = text;
    el.convToast.classList.toggle('error', !!error);
    el.convToast.hidden = false;
    const r = el.convTime.getBoundingClientRect();
    el.convToast.style.left = `${Math.max(6, Math.min(r.left, window.innerWidth - el.convToast.offsetWidth - 6))}px`;
    el.convToast.style.top = `${r.bottom + 6}px`;
    if (ms) toastTimer = setTimeout(() => { el.convToast.hidden = true; }, ms);
  }
  let convAnnounceTimer = null;
  // A place typed with the time ("3pm Tokyo", "15:00 EST", "tokyo 3pm"): resolved against the cities on the list first
  // (label, city name in any language, prefix match), then a time zone abbreviation on the list, then an exact city
  // name anywhere. { zone } when it can be the source, { known } for a city that is not on the list, {} otherwise.
  function namesOf(z) {
    const tr = window.ZONE_I18N || {};
    return [customLabel(z), cityOf(z), englishCity(z), tr.pt && tr.pt[z], tr.es && tr.es[z]].filter(Boolean).map(fold);
  }
  function placeZone(place) {
    const q = fold(place).replace(/\s+/g, ' ').trim();
    if (!q) return {};
    const onList = [...new Set([LOCAL_ZONE, ...settings.zones])].filter(supportsZone);
    let z = onList.find((x) => namesOf(x).some((n) => n.startsWith(q)));
    if (z) return { zone: z };
    const abbr = (ABBR[q.replace(/\s/g, '')] || []).filter(supportsZone);
    z = abbr.find((x) => onList.includes(x));
    if (z) return { zone: z };
    const known = abbr[0] || ALL_ZONES.find((x) => namesOf(x).includes(q));
    return known ? { known } : {};
  }
  // The time in the field: a plain time, or the time of "<time> <place>" when that place can be the source.
  function fieldTime() {
    const v = el.convTime.value, p = T.parseTime(v);
    if (p) return p;
    const sp = T.splitTimePlace(v);
    return sp && placeZone(sp.place).zone ? sp.time : null;
  }
  // Conversions go back to now on their own: 5 minutes after the last change while the window is unfocused (checked
  // again every 5 minutes while it has focus), and when the window comes back after more than 5 minutes hidden.
  const CONV_IDLE_MS = 5 * 60000;
  const convIdleMs = () => (typeof window.__wcConvIdleMs === 'number' ? window.__wcConvIdleMs : CONV_IDLE_MS); // tests shorten it
  let convIdle = null, hiddenSince = 0;
  function clearConversion() { el.convTime.value = ''; applyConvert(true); }
  function armConvIdle() {
    clearTimeout(convIdle); convIdle = null;
    if (!convert) return;
    convIdle = setTimeout(() => {
      convIdle = null;
      if (!convert) return;
      if (!document.hasFocus()) clearConversion(); else armConvIdle();
    }, convIdleMs());
  }
  window.addEventListener('blur', () => armConvIdle());
  function applyConvert(announceNow) {
    if (!settings) return;
    const pin = pinnedEpoch; pinnedEpoch = null; // only the scrub step that set it (setConvEpoch) may use it
    const raw = el.convTime.value;
    const wasConverting = !!convert;
    if (!raw.trim()) {
      closeCopyMenu(false);
      convert = null; el.convDate.value = ''; delete el.convDate.dataset.auto; setInvalid(false); toast(''); el.convClear.hidden = true; el.btnCopy.hidden = true; refreshHint(); render();
      armConvIdle();
      if (wasConverting) emit('convert', { on: false });
      if (wasConverting) { clearTimeout(convAnnounceTimer); announce(t('say.now')); }
      return;
    }
    let parsed = T.parseTime(raw);
    if (!parsed) {
      // "3pm Tokyo": the place becomes the source when it is on the list; otherwise say why nothing converts.
      const sp = T.splitTimePlace(raw);
      let msg = t('hint.invalid');
      if (sp) {
        const r = placeZone(sp.place);
        if (r.zone) {
          if (el.convZone.value !== r.zone) { el.convZone.value = r.zone; if (el.convDate.dataset.auto) el.convDate.value = ''; }
          parsed = sp.time;
        } else msg = r.known ? t('hint.addFirst', { city: cityOf(r.known) }) : t('hint.noPlace', { place: sp.place });
      }
      if (!parsed) {
        setInvalid(true); el.convHint.textContent = msg; toast(msg, 0, true); emit('invalid', { input: el.convTime });
        clearTimeout(convAnnounceTimer); convAnnounceTimer = setTimeout(() => announce(msg), 700); // debounced while typing
        return;
      }
    }
    setInvalid(false);
    if (el.convToast.classList.contains('error')) toast('');
    const [h, mi] = parsed;
    const zone = el.convZone.value || LOCAL_ZONE;
    // Pin the date the conversion is for (today in the source zone) so it stays right across midnight. Marked
    // automatic, so switching the source zone re-picks that zone's today; explicit dates (chips, scrubbing) stay.
    if (!el.convDate.value) { el.convDate.value = todayIn(zone); el.convDate.dataset.auto = '1'; }
    const [y, m, d] = el.convDate.value.split('-').map(Number);
    // A typed time takes the first occurrence of a repeated wall time; a scrub step keeps the instant it landed on
    // (the second 01:30 of a fall-back night) when that is the same wall time, at most an hour from the first.
    const wallEpoch = T.zonedToEpoch(zone, y, m, d, h, mi);
    const epochMs = pin !== null && Math.abs(pin - wallEpoch) <= 3600000 ? pin : wallEpoch;
    convert = { zone, h, mi, epochMs };
    if (document.activeElement !== el.convSlider) el.convSlider.value = h * 60 + Math.round(mi / 15) * 15;
    el.convClear.hidden = false;
    el.btnCopy.hidden = !settings.zones.some(supportsZone); // nothing to copy without cities
    refreshHint();
    render();
    armConvIdle();
    if (!wasConverting) emit('convert', { on: true });
    // Debounced so typing or sliding does not flood the screen reader.
    clearTimeout(convAnnounceTimer);
    let msg = t('say.converted', { time: formatTime(h, mi), city: labelOf(zone) });
    // Scrubbing from a focused card ([ ], PageUp/PageDown): also say that card's new time (its name stays put).
    const fc = document.activeElement && document.activeElement.closest ? document.activeElement.closest('.card[data-zone]') : null;
    if (fc && fc.dataset.zone !== zone && supportsZone(fc.dataset.zone)) {
      const k = clock(fc.dataset.zone, new Date(convert.epochMs));
      msg += `. ${labelOf(fc.dataset.zone)}: ${k.ampm ? `${k.hm} ${k.ampm}` : k.hm}`;
    }
    if (announceNow === true) announce(msg); else convAnnounceTimer = setTimeout(() => announce(msg), 800);
  }
  // A newly typed time means today: an automatic date left over from yesterday (a conversion left open across
  // midnight) is dropped and re-picked. A conversion already on screen keeps its date (slider and scrub paths).
  el.convTime.addEventListener('input', guard(() => {
    if (el.convDate.dataset.auto && el.convDate.value && el.convDate.value !== todayIn(el.convZone.value || LOCAL_ZONE)) el.convDate.value = '';
    applyConvert();
  }));
  el.convTime.addEventListener('blur', guard(() => { const p = fieldTime(); if (p) { el.convTime.value = formatInput(...p); } }));
  el.convTime.addEventListener('keydown', guard((e) => {
    // Up/Down nudge by 15 minutes, Escape returns to live.
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const p = fieldTime() || [9, 0];
      const mins = (p[0] * 60 + p[1] + (e.key === 'ArrowUp' ? 15 : -15) + 1440) % 1440;
      el.convTime.value = formatInput(Math.floor(mins / 60), mins % 60); applyConvert(); e.preventDefault();
    } else if (e.key === 'Escape') { e.stopPropagation(); el.convTime.value = ''; applyConvert(); el.convTime.blur(); }
  }));
  el.convSlider.addEventListener('input', guard(() => {
    // The field and the slider's spoken value follow at once; the conversion itself runs once per frame (flushScrub),
    // however many input events a drag fires.
    const v = +el.convSlider.value; el.convTime.value = formatInput(Math.floor(v / 60), v % 60); syncSliderText();
    pendingSlider = v; queueScrub();
  }));
  el.convDate.addEventListener('input', guard(applyConvert));
  el.convZone.addEventListener('change', guard(() => { if (el.convDate.dataset.auto) el.convDate.value = ''; applyConvert(); }));
  el.convClear.addEventListener('click', guard(() => { el.convTime.value = ''; applyConvert(); el.convTime.focus(); }));

  // ---------- time scrubber (wheel / arc drag / keys) ----------
  // Every path ends in setConvEpoch -> applyConvert, so hint, copy, events and announcements stay consistent.
  const STEP = 15 * 60000;
  // The exact instant a scrub step asked for. In the repeated hour of a fall-back day a wall time happens twice and
  // typing it picks the first; a scrub step that lands on the second one keeps it, so stepping moves through the
  // repeated hour instead of falling back to the first 01:30 forever. Used once, by the next applyConvert.
  let pinnedEpoch = null;
  function setConvEpoch(ms) {
    const zone = el.convZone.value || LOCAL_ZONE;
    const p = parts(zone, new Date(ms), { year: 'numeric', month: '2-digit', day: '2-digit', hourCycle: 'h23', hour: '2-digit', minute: '2-digit' });
    el.convDate.value = `${p.year}-${p.month}-${p.day}`;
    delete el.convDate.dataset.auto;
    el.convTime.value = formatInput(+p.hour % 24, +p.minute);
    pinnedEpoch = ms;
    applyConvert();
  }
  const baseEpoch = () => (convert ? convert.epochMs : Math.round(Date.now() / STEP) * STEP);
  let pendingMin = 0, pendingAbs = null, pendingSlider = null, frame = 0, frameTimer = null;
  // Continuous scrubbing (steps less than 300 ms apart: a slider or day-line drag, a spun wheel): .app gets
  // .scrub-live, and the day-line dots and the planner line follow each step directly instead of restarting a 'left'
  // transition (a layout on every frame) for every step. A single step (one notch, a key) still glides.
  const SCRUB_GAP = 300;
  let lastScrubAt = 0, scrubLiveTimer = null;
  function markScrub() {
    const now = performance.now();
    if (now - lastScrubAt < SCRUB_GAP && !el.app.classList.contains('scrub-live')) el.app.classList.add('scrub-live');
    lastScrubAt = now;
    clearTimeout(scrubLiveTimer);
    scrubLiveTimer = setTimeout(() => el.app.classList.remove('scrub-live'), SCRUB_GAP);
  }
  function flushScrub() {
    if (frame) cancelAnimationFrame(frame);
    clearTimeout(frameTimer);
    frame = 0; frameTimer = null;
    if (!settings) return;
    markScrub();
    // Slider: #convTime already holds its latest value; convert once for all the input events of this frame.
    if (pendingSlider !== null) { pendingSlider = null; applyConvert(); }
    if (pendingAbs !== null) { const a = pendingAbs; pendingAbs = null; setConvEpoch(a); }
    if (pendingMin) { const m = pendingMin; pendingMin = 0; setConvEpoch(baseEpoch() + m * 60000); }
  }
  function queueScrub() {
    if (frame || frameTimer) return;
    frame = requestAnimationFrame(flushScrub);
    frameTimer = setTimeout(flushScrub, 60); // rAF stalls while the window is occluded
  }
  function scrubBy(min) { if (!settings) return; pendingMin += min; queueScrub(); }
  let wheelAcc = 0;
  function onCardWheel(e) {
    if (!settings || e.shiftKey || e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.target.closest('input')) return; // Ctrl+wheel zooms
    // More cards than fit: the wheel scrolls to them, and only the digits and the day line scrub the time. The vertical
    // layout and wrapped rows scroll natively; the strip and compact layouts through the #strip wheel handler (the event
    // is not defaultPrevented). With every card on screen, the whole card scrubs.
    const s = el.strip, down = layout() === 'vertical' || s.classList.contains('rows');
    const canScroll = down ? s.scrollHeight > s.clientHeight + 1 : s.scrollWidth > s.clientWidth + 1;
    if (canScroll && !e.target.closest('.display, .arc')) { wheelAcc = 0; return; }
    e.preventDefault();
    // One wheel notch = one 15-minute step, whatever the display scaling (a notch is ~87px at 115%, 120px at 100%).
    // Small deltas (touchpads, smooth scrolling) accumulate to a notch's worth before stepping.
    const dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 100 : 1);
    if (Math.abs(dy) >= 50) { wheelAcc = 0; scrubBy(Math.sign(dy) * 15 * Math.max(1, Math.round(Math.abs(dy) / 120))); return; }
    if (Math.sign(dy) !== Math.sign(wheelAcc)) wheelAcc = 0;
    wheelAcc += dy;
    const steps = Math.trunc(wheelAcc / 80);
    if (!steps) return;
    wheelAcc -= steps * 80;
    scrubBy(steps * 15);
  }
  let arcScrub = null;
  function attachArcScrub(card, zone) {
    const arc = card.querySelector('.arc');
    const at = (e) => {
      const r = arc.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, (e.clientX - r.left) / (r.width || 1)));
      const mins = Math.min(1425, Math.round((f * 1440) / 15) * 15);
      const d = arcScrub.day;
      pendingAbs = T.zonedToEpoch(zone, d[0], d[1], d[2], Math.floor(mins / 60), mins % 60);
      pendingMin = 0;
      queueScrub();
    };
    arc.addEventListener('pointerdown', (e) => {
      if (!settings || e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      // Scrubbing a card's day line converts from that card's city (not the previous source).
      if (el.convZone.value !== zone && [...el.convZone.options].some((o) => o.value === zone)) {
        const at = baseEpoch();
        el.convZone.value = zone;
        if (convert) setConvEpoch(at);
      }
      const p = parts(zone, new Date(baseEpoch()), { year: 'numeric', month: '2-digit', day: '2-digit' });
      arcScrub = { id: e.pointerId, day: [+p.year, +p.month, +p.day] };
      card.draggable = false; card.classList.add('scrubbing');
      try { arc.setPointerCapture(e.pointerId); } catch {}
      at(e);
    });
    arc.addEventListener('pointermove', (e) => { if (arcScrub && e.pointerId === arcScrub.id) at(e); });
    const end = (e) => {
      if (!arcScrub || e.pointerId !== arcScrub.id) return;
      arcScrub = null; card.draggable = true; card.classList.remove('scrubbing');
      try { arc.releasePointerCapture(e.pointerId); } catch {}
    };
    arc.addEventListener('pointerup', end);
    arc.addEventListener('pointercancel', end);
  }

  // ---------- meeting planner ----------
  // One row per city; 24 columns = the hours of the converter's date in the SOURCE zone. A cell is "work" when the
  // city is inside its working hours for that whole hour, "night" when its local hour is 22-07, else neutral.
  let planKey = null, planYmd = null, planFocusH = null, planRoving = null;
  // Selected meeting slot in source hours ({ start, end }, end exclusive): a click (one hour), a drag across cells,
  // Shift+Left/Right from the focused hour, or the Best button. Cleared when the planner is rebuilt (another day,
  // source, city list...) and when the conversion goes back to now.
  let planSel = null, planSelAnchor = null, planCols = null, planSelDrag = null;
  const plannerOn = () => !!(settings && settings.planner);
  const plannerSource = () => el.convZone.value || LOCAL_ZONE;
  const stripDot = (s) => s.replace(/\.$/, '');
  function cellState(zone, ms) {
    if (isWorking(zone, new Date(ms)) && isWorking(zone, new Date(ms + 59 * 60000))) return 'work';
    const h = localWall(zone, new Date(ms + 30 * 60000)).min / 60;
    return h >= 22 || h < 7 ? 'night' : 'off';
  }
  // The day period Intl writes for local hour `h` in the app locale ('AM' / 'PM', 'a. m.' / 'p. m.'), spaces dropped
  // so it fits a planner cell.
  const dayPeriod = (h) => {
    const p = T.fmt('UTC', { hour: 'numeric', hour12: true }, locale()).formatToParts(new Date(Date.UTC(2000, 0, 1, h))).find((x) => x.type === 'dayPeriod');
    return p ? p.value.replace(/\s+/g, '') : '';
  };
  function buildPlanner(src, ymd, zones) {
    const [y, m, d] = ymd.split('-').map(Number);
    const cols = [];
    for (let h = 0; h < 24; h++) cols.push({ h, ms: T.zonedToEpoch(src, y, m, d, h, 0) });
    const srcLabel = labelOf(src);
    const allWork = cols.map(() => zones.length > 0);
    const states = []; // one row of 24 cell states per city, for the best-hours fallback
    const rows = zones.map((zone) => {
      const rowStates = [];
      states.push(rowStates);
      const row = document.createElement('div');
      row.className = 'plan-row' + (zone === src ? ' source' : '') + (zone === LOCAL_ZONE ? ' home' : '');
      row.dataset.zone = zone;
      const label = document.createElement('button');
      label.type = 'button'; label.className = 'plan-label'; label.title = t('plan.edit', { city: displayName(zone) });
      const city = document.createElement('span'); city.className = 'plan-city'; city.textContent = labelOf(zone);
      const tm = document.createElement('span'); tm.className = 'plan-time';
      label.append(city, tm);
      const cells = document.createElement('div');
      cells.className = 'plan-cells'; cells.setAttribute('role', 'group'); cells.setAttribute('aria-label', displayName(zone));
      cols.forEach((col, i) => {
        const st = cellState(zone, col.ms);
        if (st !== 'work') allWork[i] = false;
        rowStates.push(st);
        const p = parts(zone, new Date(col.ms), { hourCycle: 'h23', hour: '2-digit', minute: '2-digit' });
        const lh = +p.hour % 24, lm = +p.minute;
        const b = document.createElement('button');
        b.type = 'button'; b.className = `plan-cell ${st}`; b.dataset.h = String(col.h); b.tabIndex = -1;
        const s = document.createElement('span');
        if (lh === 0 && lm === 0) { b.classList.add('midnight'); s.textContent = stripDot(T.fmt(zone, { weekday: 'short' }, locale()).format(new Date(col.ms))); }
        else { const hs = settings.hour12 ? String(lh % 12 || 12) : String(lh); s.textContent = lm ? `${hs}:${pad2(lm)}` : hs; }
        // 12-hour clock: 9 in the morning and 9 at night look the same, so the cells at 6, 12 and 18 (and a 0 that is not
        // midnight, which shows the weekday) carry the day period from Intl in the app locale (AM, PM, a.m., p.m.).
        if (settings.hour12 && (lh === 6 || lh === 12 || lh === 18 || (lh === 0 && lm))) {
          const ap = document.createElement('small'); ap.className = 'ap'; ap.textContent = dayPeriod(lh);
          if (ap.textContent) s.append(ap);
        }
        b.append(s);
        b.setAttribute('aria-label', t('plan.cell', { time: formatTime(col.h, 0), src: srcLabel, local: formatTime(lh, lm), city: labelOf(zone), state: t('plan.state.' + st) }));
        cells.append(b);
      });
      row.append(label, cells);
      return row;
    });
    // Contiguous runs of hours where every city is working.
    const runs = []; let start = -1;
    for (let i = 0; i <= 24; i++) {
      const on = i < 24 && allWork[i];
      if (on && start < 0) start = i;
      if (!on && start >= 0) { runs.push([start, i]); start = -1; }
    }
    const layer = document.createElement('div'); layer.className = 'plan-layer'; layer.setAttribute('aria-hidden', 'true');
    for (const [a, b] of runs) {
      const o = document.createElement('div'); o.className = 'plan-overlap';
      o.style.left = `${(a / 24) * 100}%`; o.style.width = `${((b - a) / 24) * 100}%`;
      layer.append(o);
    }
    const now = document.createElement('div'); now.className = 'plan-now'; now.hidden = true; layer.append(now);
    if (rows.length) {
      const grid = document.createElement('div'); grid.className = 'plan-grid'; grid.append(...rows, layer);
      // Hour scale under the rows (shown only by the narrow planner, whose cells carry no numbers): the source
      // city's 0, 6, 12, 18 and 24 h, as the clock shows them, cut to the hour (24 on the 24-hour clock).
      const axis = document.createElement('div'); axis.className = 'plan-axis'; axis.setAttribute('aria-hidden', 'true');
      axis.append(...[0, 6, 12, 18, 24].map((h) => { const sp = document.createElement('span'); sp.textContent = h === 24 && !settings.hour12 ? '24' : formatTime(h % 24, 0).replace(/[:.]00/, ''); return sp; }));
      el.planBody.replaceChildren(grid, axis);
    }
    else {
      const e = document.createElement('div'); e.className = 'plan-empty';
      const msg = document.createElement('div'); msg.textContent = t('plan.empty');
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'pill'; btn.textContent = t('empty.add');
      btn.addEventListener('click', () => el.search.focus());
      e.append(msg, btn);
      el.planBody.replaceChildren(e);
    }
    el.planner.classList.toggle('empty', !rows.length); // no summary or legend without cities
    const total = runs.reduce((n, [a, b]) => n + b - a, 0);
    // No hour works for everyone: point at the hours where the most cities work (the home city and the source first).
    const bestPart = zones.length && !total ? T.bestHours(states, [...new Set([zones.indexOf(LOCAL_ZONE), zones.indexOf(src)])].filter((i) => i >= 0)) : null;
    if (bestPart && rows.length) {
      const o = document.createElement('div'); o.className = 'plan-best';
      o.style.left = `${(bestPart.start / 24) * 100}%`; o.style.width = `${((bestPart.end - bestPart.start) / 24) * 100}%`;
      layer.insertBefore(o, now);
    }
    renderPlanBest(bestPart, cols, zones, srcLabel);
    let summary;
    if (!zones.length) summary = '';
    else if (!total) summary = t('plan.none');
    else {
      const best = runs.reduce((x, r) => (r[1] - r[0] > x[1] - x[0] ? r : x));
      summary = `${t('plan.overlap', { n: total })} · ${t('plan.range', { start: formatTime(best[0], 0), end: formatTime(best[1] % 24, 0) })} (${srcLabel})`;
      if (runs.length > 1) summary += ' ' + t('plan.more', { n: runs.length - 1 });
    }
    setText(el.plannerSummary, summary);
    el.plannerSummary.classList.toggle('none', !total);
    setText(el.plannerCaption, t('plan.caption', { city: srcLabel, date: ymdLabel(ymd) }));
    planRoving = null;
    planCols = cols; planSel = null; planSelAnchor = null; planSelDrag = null;
  }
  // #plannerBest: "Best: 12:00 to 13:00 (New York), 4 of 5 working"; the title and name add up to three cities outside
  // their hours with their local times. Hidden with a full overlap, with no cities, or when no two cities ever work together.
  function renderPlanBest(best, cols, zones, srcLabel) {
    const b = el.plannerBest;
    if (!best) { b.hidden = true; b.textContent = ''; b.removeAttribute('title'); b.removeAttribute('aria-label'); delete b.dataset.h; delete b.dataset.end; return; }
    const text = t('plan.best', { range: t('plan.range', { start: formatTime(best.start, 0), end: formatTime(best.end % 24, 0) }), city: srcLabel, n: best.working, total: best.total });
    const ms = cols[best.start].ms;
    const outside = best.out.slice(0, 3).map((i) => {
      const p = parts(zones[i], new Date(ms), { hourCycle: 'h23', hour: '2-digit', minute: '2-digit' });
      return `${labelOf(zones[i])} ${formatTime(+p.hour % 24, +p.minute)}`;
    });
    let list = outside.join(', ');
    if (best.out.length > 3) list += ' ' + t('plan.more', { n: best.out.length - 3 });
    const full = best.out.length ? `${text}. ${t('plan.bestOut', { list })}` : text;
    setText(b, text);
    b.title = full; b.setAttribute('aria-label', full);
    b.dataset.h = String(best.start); b.dataset.end = String(best.end);
    b.hidden = false;
  }
  el.plannerBest.addEventListener('click', () => {
    if (!settings || el.plannerBest.hidden || !el.plannerBest.dataset.h) return;
    planFocusH = +el.plannerBest.dataset.h;
    planSel = { start: planFocusH, end: +el.plannerBest.dataset.end || planFocusH + 1 }; planSelAnchor = planFocusH; // the whole best run
    pickHour(planFocusH);
  });
  function updatePlanner(date) {
    const src = plannerSource();
    const p = parts(src, date, { ...YMD_OPTS, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' });
    const sameDay = `${p.year}-${p.month}-${p.day}` === planYmd;
    const curH = sameDay ? +p.hour % 24 : null;
    const now = el.planBody.querySelector('.plan-now');
    if (now) {
      if (now.hidden === sameDay) now.hidden = !sameDay;
      const left = `${((((+p.hour % 24) * 60 + +p.minute) / 1440) * 100).toFixed(3)}%`;
      if (now.style.left !== left) now.style.left = left;
      now.classList.toggle('converted', !!convert);
    }
    for (const row of el.planBody.querySelectorAll('.plan-row')) {
      const k = clock(row.dataset.zone, date);
      setText(row.querySelector('.plan-time'), k.ampm ? `${k.hm} ${k.ampm}` : k.hm);
    }
    syncPlanSel();
    for (const c of el.planBody.querySelectorAll('.plan-cell.sel')) if (!convert || +c.dataset.h !== curH) c.classList.remove('sel');
    if (convert && curH !== null) for (const c of el.planBody.querySelectorAll(`.plan-cell[data-h="${curH}"]`)) c.classList.add('sel');
    // Roving tabindex: one tabbable hour per row (the focused hour, else the marker hour, else 09:00).
    const fh = planFocusH !== null ? planFocusH : curH !== null ? curH : 9;
    if (planRoving !== fh) {
      planRoving = fh;
      for (const c of el.planBody.querySelectorAll('.plan-cell')) c.tabIndex = +c.dataset.h === fh ? 0 : -1;
    }
  }
  function renderPlanner(date) {
    const on = plannerOn();
    el.app.classList.toggle('planner-on', on);
    // narrow planner only where the window cannot widen: the web app's vertical layout (a phone)
    el.app.classList.toggle('plan-narrow', on && layout() === 'vertical' && !!settings.web);
    if (el.planner.hidden === on) el.planner.hidden = !on;
    if (el.btnPlanner.getAttribute('aria-pressed') !== String(on)) el.btnPlanner.setAttribute('aria-pressed', String(on));
    if (!on) { planKey = null; planFitSent = null; return; }
    if (!convert && planSel) { planSel = null; planSelAnchor = null; } // back to now: the slot goes too
    const src = plannerSource();
    const ymd = el.convDate.value || todayIn(src);
    const zones = settings.zones.filter(supportsZone);
    const key = JSON.stringify([zones, zones.map(labelOf), src, labelOf(src), ymd, !!settings.hour12, I.lang, zones.map(hoursOf)]);
    if (key !== planKey) { planKey = key; planYmd = ymd; buildPlanner(src, ymd, zones); fitPlanner(); }
    updatePlanner(date);
  }
  // Rows are always 24px (the labels' target size), so the planner has one natural size: the window is made that size
  // (fitWindow) and a taller one only leaves room below the grid. When the work area caps the window, the body
  // scrolls and a bottom fade shows there is more.
  function fitPlanner() {
    if (!plannerOn()) return;
    updatePlanFade();
    fitWindow();
  }
  // The planner's natural size in CSS px, read from the real elements: everything above it (bar, tip), its padding, the
  // head, the grid with its hour scale (the body's scrollHeight, even while the body is scrolling). Width: the label
  // column (the minimum of --plan-label) and 24 cells at a readable minimum; the narrow planner (web, phone) has no label
  // column and only asks for a minimum width.
  const PLAN_CELL_MIN = { full: 34, narrow: 14 };
  function measurePlanner() {
    const p = el.planner, cs = getComputedStyle(p), px = (v) => parseFloat(v) || 0;
    const head = p.querySelector('.plan-head'), narrow = el.app.classList.contains('plan-narrow');
    const headH = head && head.offsetParent ? head.offsetHeight + px(cs.rowGap) : 0;
    const height = Math.ceil(p.offsetTop + px(cs.paddingTop) + headH + el.planBody.scrollHeight + px(cs.paddingBottom)) + 1;
    // the label column at the planner's natural width (--plan-label is clamp(150px, 14vw, 220px): 150 there) plus the
    // 12px column gap; a constant, so a window the user widens does not change what is asked for
    const label = narrow ? 0 : 150 + 12;
    const width = Math.ceil(px(cs.paddingLeft) + px(cs.paddingRight) + label + 24 * (narrow ? PLAN_CELL_MIN.narrow : PLAN_CELL_MIN.full) + 23 * (narrow ? 1 : 2));
    return { width, height, keepWidth: narrow, layout: layout() };
  }
  // Tell main the size when it changed by more than 2px. The first one goes out at once, later ones after the layout
  // settles (a head line that wraps, the bar stacking at the new width). main ignores them while the user drags the frame.
  let planFitSent = null, planFitTimer = 0;
  function sendPlanFit() {
    planFitTimer = 0;
    if (!plannerOn() || !window.wc.fitView || !el.planner.offsetParent) return;
    const m = measurePlanner(), s = planFitSent;
    if (s && s.layout === m.layout && Math.abs(m.width - s.width) <= 2 && Math.abs(m.height - s.height) <= 2) return;
    planFitSent = m;
    window.wc.fitView(m);
  }
  function fitWindow() {
    if (!planFitSent) { clearTimeout(planFitTimer); sendPlanFit(); return; }
    if (!planFitTimer) planFitTimer = setTimeout(sendPlanFit, 80);
  }
  if (typeof ResizeObserver === 'function') {
    // Anything that changes the natural height: the bar and tip above, the head, the rows and the hour scale.
    const ro = new ResizeObserver(() => { if (settings && plannerOn()) fitWindow(); });
    const watch = () => {
      ro.disconnect();
      for (const n of [document.querySelector('.bar'), $('tip'), el.planner.querySelector('.plan-head'), el.planBody, ...el.planBody.children]) if (n) ro.observe(n);
    };
    watch();
    new MutationObserver(() => { watch(); if (plannerOn()) fitWindow(); }).observe(el.planBody, { childList: true });
  }
  function updatePlanFade() {
    const b = el.planBody;
    el.planner.classList.toggle('more-below', b.scrollTop + b.clientHeight < b.scrollHeight - 2);
    el.planner.classList.toggle('more-above', b.scrollTop > 2);
  }
  el.planBody.addEventListener('scroll', updatePlanFade, { passive: true });
  // Converter to hour h (on the planner's date, in the source zone).
  function pickHour(h) {
    if (!settings) return;
    const src = plannerSource();
    if (!el.convDate.value) { el.convDate.value = todayIn(src); el.convDate.dataset.auto = '1'; }
    el.convTime.value = formatInput(h, 0);
    applyConvert(true);
  }
  // End of the slot: the start of hour `end` in the source zone (hour 24 is the next midnight).
  const slotEndMs = () => (planSel.end < 24 ? planCols[planSel.end].ms : planCols[23].ms + 3600000);
  const slotLabel = () => `${ymdLabel(planYmd)}, ${t('plan.range', { start: formatTime(planSel.start, 0), end: formatTime(planSel.end % 24, 0) })} (${labelOf(plannerSource())})`;
  // The slot as text: "Thu, Sep 24, 12:00 to 14:00 (New York)", then each city with its own start and end.
  function slotText() {
    const a = new Date(planCols[planSel.start].ms), b = new Date(slotEndMs());
    const hm = (z, d) => { const k = clock(z, d); return k.ampm ? `${k.hm} ${k.ampm}` : k.hm; };
    const lines = settings.zones.filter(supportsZone).map((z) => {
      const day = T.fmt(z, { weekday: 'short', month: 'short', day: 'numeric' }, locale()).format(a);
      return `${labelOf(z)}: ${t('plan.range', { start: hm(z, a), end: hm(z, b) })}, ${day}`;
    });
    return [slotLabel(), ...lines].join('\n');
  }
  // The filled band over the selected hours and the "Copy slot" / "Save invite" line in the planner head.
  function syncPlanSel() {
    const layer = el.planBody.querySelector('.plan-layer');
    let band = layer ? layer.querySelector('.plan-sel') : null;
    const on = !!(planSel && layer && planCols);
    if (!on) { if (band) band.remove(); }
    else {
      if (!band) { band = document.createElement('div'); band.className = 'plan-sel'; layer.insertBefore(band, layer.querySelector('.plan-now')); }
      const left = `${(planSel.start / 24) * 100}%`, width = `${((planSel.end - planSel.start) / 24) * 100}%`;
      if (band.style.left !== left) band.style.left = left;
      if (band.style.width !== width) band.style.width = width;
      setText(el.planSel, slotLabel());
      el.planIcs.hidden = typeof window.wc.saveIcs !== 'function';
    }
    if (el.planSelBar.hidden === on) {
      el.planSelBar.hidden = !on;
      el.planner.classList.toggle('has-sel', on);
      fitPlanner(); // the head line changed
    }
  }
  el.planCopy.addEventListener('click', () => { if (settings && planSel && planCols) copyOut(slotText(), null); });
  el.planIcs.addEventListener('click', () => { if (settings && planSel && planCols) saveInvite(planCols[planSel.start].ms, slotEndMs(), slotText()); });
  // Drag across the cells of a row: the slot follows the pointer (captured once it leaves the first hour, so a plain
  // click still reaches its cell), and letting go converts at the slot's first hour.
  el.planBody.addEventListener('pointerdown', (e) => {
    const cell = e.target.closest('.plan-cell');
    if (!cell || e.button !== 0 || !settings) return;
    const cells = cell.closest('.plan-cells');
    planSelDrag = { id: e.pointerId, from: +cell.dataset.h, to: +cell.dataset.h, moved: false, rect: cells.getBoundingClientRect() };
  });
  el.planBody.addEventListener('pointermove', (e) => {
    const d = planSelDrag;
    if (!d || e.pointerId !== d.id || !planCols) return;
    const h = Math.max(0, Math.min(23, Math.floor(((e.clientX - d.rect.left) / (d.rect.width || 1)) * 24)));
    if (h === d.to) return;
    d.to = h;
    if (!d.moved) { d.moved = true; try { el.planBody.setPointerCapture(e.pointerId); } catch { /* not capturable */ } }
    planSel = { start: Math.min(d.from, h), end: Math.max(d.from, h) + 1 }; planSelAnchor = d.from;
    syncPlanSel();
  });
  const endSelDrag = (e) => {
    const d = planSelDrag;
    if (!d || e.pointerId !== d.id) return;
    planSelDrag = null;
    try { el.planBody.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    if (!d.moved || !settings || e.type === 'pointercancel') return;
    planFocusH = d.to;
    pickHour(planSel.start);
  };
  el.planBody.addEventListener('pointerup', endSelDrag);
  el.planBody.addEventListener('pointercancel', endSelDrag);
  el.planBody.addEventListener('click', (e) => {
    if (!settings) return;
    const cell = e.target.closest('.plan-cell');
    if (cell) { planFocusH = +cell.dataset.h; planSel = { start: planFocusH, end: planFocusH + 1 }; planSelAnchor = planFocusH; pickHour(planFocusH); return; }
    const label = e.target.closest('.plan-label');
    if (label) openHours(label.closest('.plan-row').dataset.zone, label);
  });
  el.planBody.addEventListener('keydown', (e) => {
    const cell = e.target.closest && e.target.closest('.plan-cell');
    if (!cell || !settings) return;
    const rows = [...el.planBody.querySelectorAll('.plan-row')];
    let h = +cell.dataset.h, ri = rows.indexOf(cell.closest('.plan-row')), pick = true;
    // Shift+Left/Right grows or shrinks the slot from where it started (the anchor); focus follows the moving edge.
    if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      if (!planSel || planSelAnchor === null) planSelAnchor = h;
      h = Math.max(0, Math.min(23, h + (e.key === 'ArrowRight' ? 1 : -1)));
      planSel = { start: Math.min(planSelAnchor, h), end: Math.max(planSelAnchor, h) + 1 };
      planFocusH = h;
      if (!convert || convert.h !== planSel.start || convert.mi) pickHour(planSel.start); else render();
      const tc = rows[ri] && rows[ri].querySelector(`.plan-cell[data-h="${h}"]`);
      if (tc) tc.focus();
      return;
    }
    if (e.key === 'ArrowLeft') h = Math.max(0, h - 1);
    else if (e.key === 'ArrowRight') h = Math.min(23, h + 1);
    else if (e.key === 'Home') h = 0;
    else if (e.key === 'End') h = 23;
    else if (e.key === 'ArrowUp') { ri = Math.max(0, ri - 1); pick = false; }
    else if (e.key === 'ArrowDown') { ri = Math.min(rows.length - 1, ri + 1); pick = false; }
    else return;
    e.preventDefault();
    planFocusH = h;
    if (pick) { planSel = { start: h, end: h + 1 }; planSelAnchor = h; pickHour(h); } else render();
    const target = rows[ri] && rows[ri].querySelector(`.plan-cell[data-h="${h}"]`);
    if (target) target.focus();
  });
  el.btnPlanner.addEventListener('click', guard(() => {
    closeHours(false);
    if (!settings.planner) mapOn = false; // planner and map are mutually exclusive views
    if (window.wc.setView) window.wc.setView(settings.planner ? null : 'planner'); // before set(): one resize, straight to the new view
    set({ planner: !settings.planner });
    emit('planner', { on: settings.planner, planner: el.planner });
  }));

  // ---------- date shortcuts ----------
  // Chips: Today, Tomorrow, then the next five days by weekday name, counted from today in the home zone.
  // Counted from today in the converter's source zone (the zone the picked date is read in), so "Tomorrow" always
  // means the source city's tomorrow, even when home is already a day ahead or behind.
  const homeDay = (n) => addDays(todayIn(plannerSource()), n);
  const effectiveYmd = () => (convert ? el.convDate.value || todayIn(convert.zone) : null);
  function chipLabel(n, ymd) {
    if (n === 0) return t('day.today');
    if (n === 1) return t('day.tomorrow');
    const s = stripDot(T.fmt('UTC', { weekday: 'short' }, locale()).format(ymdDate(ymd)));
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function renderChips() {
    const cur = effectiveYmd() || homeDay(0);
    const full = T.fmt('UTC', { weekday: 'long', month: 'long', day: 'numeric' }, locale());
    el.dateChips.replaceChildren(...Array.from({ length: 7 }, (_, n) => {
      const ymd = homeDay(n);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'date-chip'; b.dataset.day = String(n); b.dataset.date = ymd;
      b.textContent = chipLabel(n, ymd); b.title = full.format(ymdDate(ymd));
      b.setAttribute('aria-pressed', String(ymd === cur));
      return b;
    }));
  }
  function updateDayButton() {
    const ymd = effectiveYmd();
    let label = t('day.today');
    if (ymd) {
      const today = homeDay(0);
      let n = -1;
      for (let i = 0; i < 7; i++) if (addDays(today, i) === ymd) { n = i; break; }
      label = n >= 0 ? chipLabel(n, ymd) : T.fmt('UTC', { month: 'short', day: 'numeric' }, locale()).format(ymdDate(ymd));
    }
    setText(el.btnDayText, label);
    el.btnDay.classList.toggle('set', !!ymd && ymd !== homeDay(0));
    if (!el.dateChips.hidden) {
      const cur = ymd || homeDay(0);
      for (const b of el.dateChips.querySelectorAll('[data-day]')) b.setAttribute('aria-pressed', String(b.dataset.date === cur));
    }
  }
  function openChips() {
    if (!settings) return;
    closeMenu(false); closeHours(false);
    renderChips();
    el.dateChips.hidden = false;
    el.btnDay.setAttribute('aria-expanded', 'true');
    const r = el.btnDay.getBoundingClientRect();
    el.dateChips.style.left = `${Math.max(6, Math.min(r.left, window.innerWidth - el.dateChips.offsetWidth - 6))}px`;
    el.dateChips.style.top = `${r.bottom + 6}px`;
    const target = el.dateChips.querySelector('[aria-pressed="true"]') || el.dateChips.querySelector('[data-day]');
    if (target) target.focus();
    emit('menu', { open: true, menu: el.dateChips, anchor: el.btnDay });
  }
  function closeChips(returnFocus) {
    if (el.dateChips.hidden) return;
    emit('menu', { open: false, menu: el.dateChips });
    el.dateChips.hidden = true;
    el.btnDay.setAttribute('aria-expanded', 'false');
    if (returnFocus) el.btnDay.focus();
  }
  function pickDay(n) {
    if (!settings) return;
    const ymd = homeDay(n);
    if (!fieldTime()) {
      if (n === 0 && !convert) { closeChips(true); return; }
      // Not converting yet: keep the current time of day in the source zone, rounded to 15 minutes.
      const mins = (Math.round(localWall(plannerSource(), new Date()).min / 15) * 15) % 1440;
      el.convTime.value = formatInput(Math.floor(mins / 60), mins % 60);
    }
    el.convDate.value = ymd;
    delete el.convDate.dataset.auto; // a picked day stays when the source zone changes
    applyConvert(true);
    closeChips(true);
  }
  el.btnDay.addEventListener('click', guard((e) => { e.stopPropagation(); if (el.dateChips.hidden) openChips(); else closeChips(true); }));
  el.dateChips.addEventListener('click', (e) => { const b = e.target.closest('[data-day]'); if (b) pickDay(+b.dataset.day); });
  el.dateChips.addEventListener('keydown', (e) => {
    const items = [...el.dateChips.querySelectorAll('[data-day]')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeChips(true); }
    else if (e.key === 'Tab') { e.preventDefault(); closeChips(true); }
  });
  document.addEventListener('mousedown', (e) => { if (!el.dateChips.hidden && !el.dateChips.contains(e.target) && !el.btnDay.contains(e.target)) closeChips(false); });
  window.addEventListener('blur', () => closeChips(false));

  // ---------- working hours editor ----------
  let hoursZone = null, hoursAnchor = null, hoursDays = [];
  const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first
  function buildDayPills() {
    const short = T.fmt('UTC', { weekday: 'short' }, locale()), long = T.fmt('UTC', { weekday: 'long' }, locale());
    el.hoursDays.replaceChildren(...DAY_ORDER.map((wd) => {
      const d = new Date(Date.UTC(2026, 0, 4 + wd, 12)); // 2026-01-04 is a Sunday
      const s = stripDot(short.format(d));
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'day-pill'; b.dataset.wd = String(wd);
      b.textContent = s.charAt(0).toUpperCase() + s.slice(1); b.title = long.format(d);
      b.setAttribute('aria-label', long.format(d));
      b.setAttribute('aria-pressed', String(hoursDays.includes(wd)));
      return b;
    }));
  }
  const splitHM = (s) => [+s.slice(0, 2), +s.slice(3, 5)];
  function readHours() {
    const a = T.parseTime(el.hoursStart.value), b = T.parseTime(el.hoursEnd.value);
    const bad = { start: !a, end: !b };
    if (!a || !b) return { error: 'hours.invalid', bad };
    const start = hhmm(a[0] * 60 + a[1]), end = hhmm(b[0] * 60 + b[1]);
    if (start === end) return { error: 'hours.invalid', bad: { start: false, end: true } };
    if (!hoursDays.length) return { error: 'hours.noDays', bad };
    return { value: { start, end, days: [...hoursDays].sort((x, y) => x - y) }, bad };
  }
  function validateHours() {
    const r = readHours();
    el.hoursStart.classList.toggle('invalid', !!r.bad.start);
    el.hoursEnd.classList.toggle('invalid', !!r.bad.end);
    for (const [inp, bad] of [[el.hoursStart, r.bad.start], [el.hoursEnd, r.bad.end]]) {
      if (bad) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid');
      inp.setAttribute('aria-describedby', 'hoursNote');
    }
    el.hoursSave.disabled = !!r.error;
    el.hoursNote.classList.toggle('error', !!r.error);
    el.hoursNote.textContent = r.error ? t(r.error) : (toMin(r.value.end) < toMin(r.value.start) ? t('hours.overnight') : '');
    return r;
  }
  function openHours(zone, anchor) {
    if (!settings || !zone) return;
    closeMenu(false); closeChips(false); closeHours(false);
    hoursZone = zone; hoursAnchor = anchor || cardEl(zone);
    const h = hoursOf(zone);
    hoursDays = [...h.days];
    el.hoursStart.value = formatInput(...splitHM(h.start));
    el.hoursEnd.value = formatInput(...splitHM(h.end));
    el.hoursCity.textContent = labelOf(zone); // the dialog is labelled by "Working hours" + this city (aria-labelledby)
    buildDayPills();
    validateHours();
    el.hoursEditor.hidden = false;
    const card = cardEl(zone);
    if (card) card.classList.add('editing-hours');
    const r = hoursAnchor && hoursAnchor.isConnected ? hoursAnchor.getBoundingClientRect() : { left: 12, top: 60, width: 0, height: 0, bottom: 60 };
    const w = el.hoursEditor.offsetWidth, ht = el.hoursEditor.offsetHeight;
    const overCard = hoursAnchor && hoursAnchor.classList && hoursAnchor.classList.contains('card');
    let left = overCard ? r.left + (r.width - w) / 2 : r.left;
    let top = overCard ? r.top + 6 : r.bottom + 4;
    left = Math.max(6, Math.min(left, window.innerWidth - w - 6));
    top = Math.max(6, Math.min(top, window.innerHeight - ht - 6));
    el.hoursEditor.style.left = `${left}px`; el.hoursEditor.style.top = `${top}px`;
    el.hoursStart.focus(); el.hoursStart.select();
    emit('menu', { open: true, menu: el.hoursEditor, anchor: hoursAnchor });
  }
  function closeHours(returnFocus) {
    if (el.hoursEditor.hidden) return;
    emit('menu', { open: false, menu: el.hoursEditor });
    el.hoursEditor.hidden = true;
    el.strip.querySelectorAll('.card.editing-hours').forEach((c) => c.classList.remove('editing-hours'));
    const anchor = hoursAnchor;
    hoursZone = null; hoursAnchor = null;
    if (returnFocus && anchor && anchor.isConnected) anchor.focus();
  }
  function saveHours(value) {
    const zone = hoursZone;
    const hours = { ...(settings.hours || {}) };
    const isDefault = value && value.start === DEFAULT_HOURS.start && value.end === DEFAULT_HOURS.end && value.days.join() === DEFAULT_HOURS.days.join();
    if (!value || isDefault) delete hours[zone]; else hours[zone] = value;
    set({ hours });
    announce(t(value ? 'say.hoursSaved' : 'say.hoursReset', { city: labelOf(zone) }));
    closeHours(true);
  }
  el.hoursSave.addEventListener('click', () => { if (!settings || !hoursZone) return; const r = validateHours(); if (!r.error) saveHours(r.value); });
  el.hoursReset.addEventListener('click', () => { if (settings && hoursZone) saveHours(null); });
  el.hoursDays.addEventListener('click', (e) => {
    const b = e.target.closest('.day-pill'); if (!b) return;
    const wd = +b.dataset.wd;
    hoursDays = hoursDays.includes(wd) ? hoursDays.filter((x) => x !== wd) : [...hoursDays, wd];
    b.setAttribute('aria-pressed', String(hoursDays.includes(wd)));
    validateHours();
  });
  for (const inp of [el.hoursStart, el.hoursEnd]) {
    inp.addEventListener('input', validateHours);
    inp.addEventListener('blur', () => { const p = T.parseTime(inp.value); if (p && settings) inp.value = formatInput(...p); });
  }
  const hoursFocusables = () => [...el.hoursEditor.querySelectorAll('input, button:not([disabled])')];
  el.hoursEditor.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeHours(true); }
    else if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); el.hoursSave.click(); }
    else if (e.key === 'Tab') {
      const f = hoursFocusables(); const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  });
  document.addEventListener('mousedown', (e) => {
    if (!el.hoursEditor.hidden && !el.hoursEditor.contains(e.target) && !el.menu.contains(e.target)) closeHours(false);
  });

  // ---------- layout switch (top bar) ----------
  // Segmented control: a toolbar of toggle buttons (aria-pressed), one per layout. Arrow keys move focus between
  // segments (roving tabindex); Enter/Space picks one (picking resizes the window, so it never happens on an arrow press). In narrow windows (vertical layout,
  // or 1120px and under) the control collapses to one button showing the current layout, which opens it as a popover.
  const LAYOUTS = ['strip', 'compact', 'vertical'];
  const layoutRadios = () => [...el.layoutSwitch.querySelectorAll('[data-layout]')];
  const layoutCollapsed = () => el.app.classList.contains('ls-collapsed');
  const layoutPopOpen = () => el.layoutWrap.classList.contains('open');
  function syncLayoutSwitch() {
    const l = layout();
    for (const b of layoutRadios()) {
      const on = b.dataset.layout === l;
      if (b.getAttribute('aria-pressed') !== String(on)) b.setAttribute('aria-pressed', String(on));
      if (document.activeElement !== b || on) b.tabIndex = on ? 0 : -1;
    }
    const collapsed = l === 'vertical' || window.innerWidth <= 1120;
    if (collapsed !== layoutCollapsed()) el.app.classList.toggle('ls-collapsed', collapsed);
    if (!collapsed) setLayoutPop(false);
    const label = t('layout.current', { name: t('opt.layout.' + l) });
    if (el.btnLayout.title !== label) { el.btnLayout.title = label; el.btnLayout.setAttribute('aria-label', label); }
  }
  function setLayoutPop(open) {
    open = !!open && layoutCollapsed();
    if (layoutPopOpen() === open) return;
    el.layoutWrap.classList.toggle('open', open);
    el.btnLayout.setAttribute('aria-expanded', String(open));
    if (open) emit('menu', { open: true, menu: el.layoutSwitch, anchor: el.btnLayout });
  }
  // Keep keyboard focus on a visible control when the switch collapses or expands under it.
  function fixLayoutFocus() {
    const a = document.activeElement;
    if (!a || !el.layoutWrap.contains(a) || a.offsetParent !== null) return;
    const target = layoutCollapsed() && !layoutPopOpen() ? el.btnLayout : layoutRadios().find((b) => b.dataset.layout === layout());
    if (target) target.focus();
  }
  function pickLayout(l) {
    if (!settings || !LAYOUTS.includes(l)) return;
    setLayoutPop(false);
    changeLayout(l);
    fixLayoutFocus();
  }
  // Picking a layout shows that layout: an open map or planner closes, so the window takes the layout's own size
  // (main drops the overlay when the layout changes) instead of squeezing the overlay into another layout's size.
  function changeLayout(l) {
    if (!settings || l === layout()) return;
    const patch = { layout: l };
    const closeMap = mapOn, closePlanner = !!settings.planner;
    if (closeMap || closePlanner) {
      closeHours(false);
      mapOn = false;
      if (closePlanner) patch.planner = false;
    }
    set(patch);
    if (closeMap) emit('map', { on: false, map: el.mapView });
    if (closePlanner) emit('planner', { on: false, planner: el.planner });
  }
  el.layoutSwitch.addEventListener('click', (e) => { const b = e.target.closest('[data-layout]'); if (b) pickLayout(b.dataset.layout); });
  el.layoutSwitch.addEventListener('keydown', (e) => {
    const rs = layoutRadios(); const i = rs.indexOf(document.activeElement);
    if (i < 0) return;
    let j;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % rs.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i + rs.length - 1) % rs.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = rs.length - 1;
    else return;
    e.preventDefault();
    rs.forEach((b, k) => { b.tabIndex = k === j ? 0 : -1; });
    rs[j].focus();
  });
  el.btnLayout.addEventListener('click', () => {
    setLayoutPop(!layoutPopOpen());
    if (layoutPopOpen()) { const cur = layoutRadios().find((b) => b.dataset.layout === layout()); if (cur) cur.focus(); }
  });
  document.addEventListener('mousedown', (e) => { if (layoutPopOpen() && !el.layoutWrap.contains(e.target)) setLayoutPop(false); });

  // ---------- world map view ----------
  // Renderer-only state (not a setting). Map and planner are mutually exclusive; the strip hides while either is on.
  // The view lives in views/map.js (window.WCMap); every call is guarded so a missing or failing module is harmless.
  let mapOn = false, mapMounted = false, mapHover = null, mapWarned = false;
  const mapApi = () => (window.WCMap && typeof window.WCMap.mount === 'function' ? window.WCMap : null);
  const mapFail = (what, e) => { if (!mapWarned) { mapWarned = true; console.warn(`world-clock: map ${what} failed`, e); } };
  function renderMap(date) {
    el.app.classList.toggle('map-on', mapOn);
    if (el.mapView.hidden === mapOn) el.mapView.hidden = !mapOn;
    if (el.btnMap.getAttribute('aria-pressed') !== String(mapOn)) el.btnMap.setAttribute('aria-pressed', String(mapOn));
    const api = mapApi();
    if (!mapOn) {
      if (mapMounted) {
        mapMounted = false; mapHover = null;
        try { if (api && typeof api.unmount === 'function') api.unmount(); } catch (e) { mapFail('unmount', e); }
      }
      return;
    }
    if (!api) return;
    if (!mapMounted) {
      try {
        api.mount(el.mapView, {
          setSource: (z) => { if (settings && settings.zones.includes(z)) convertFrom(z); },
          labelOf,
          onHover: (z) => { mapHover = z || null; el.mapView.dataset.hover = mapHover || ''; },
        });
        mapMounted = true;
      } catch (e) { mapFail('mount', e); return; }
    }
    try {
      if (typeof api.update === 'function') {
        api.update({
          zones: settings.zones.filter(supportsZone), localZone: LOCAL_ZONE, date, converting: !!convert,
          sourceZone: convert ? convert.zone : plannerSource(), hour12: !!settings.hour12, lang: I.lang, locale: I.locale,
        });
      }
    } catch (e) { mapFail('update', e); }
  }
  el.btnMap.addEventListener('click', guard(() => {
    closeHours(false);
    mapOn = !mapOn;
    if (window.wc.setView) window.wc.setView(mapOn ? 'map' : null); // main resizes to the map's remembered size
    if (mapOn && settings.planner) set({ planner: false }); // set() re-renders
    else render();
    emit('map', { on: mapOn, map: el.mapView });
  }));

  // ---------- settings ----------
  const sysDark = window.matchMedia('(prefers-color-scheme: dark)');
  function applyTheme() {
    const th = settings.theme || 'system';
    document.documentElement.dataset.theme = th;
    document.documentElement.classList.toggle('sys-dark', th === 'system' && sysDark.matches);
  }
  sysDark.addEventListener('change', () => settings && applyTheme());
  function applyOpacity(v) {
    document.documentElement.style.setProperty('--bg-alpha', v);
    el.optOpacityValue.textContent = `${Math.round(+v * 100)}%`;
    el.optOpacity.setAttribute('aria-valuetext', `${Math.round(+v * 100)}%`);
    // Accent fill left of the thumb (range 0.6..1).
    el.optOpacity.style.setProperty('--pct', `${Math.max(0, Math.min(100, ((+v - 0.6) / 0.4) * 100)).toFixed(1)}%`);
  }
  function applyLayout() {
    const l = layout();
    if (!el.app.classList.contains(`layout-${l}`)) emit('layout', { layout: l });
    for (const n of ['strip', 'compact', 'vertical']) el.app.classList.toggle(`layout-${n}`, n === l);
    el.app.classList.toggle('h12', !!settings.hour12);
    applyBarStack();
    updateStripRows();
  }
  // Stacked two-row top bar: always in the vertical layout, and in the strip/compact layouts once the window is
  // too narrow (<= 760px) for one row of controls.
  function applyBarStack() {
    const on = layout() === 'vertical' || window.innerWidth <= 760;
    if (el.app.classList.contains('bar-stack') !== on) el.app.classList.toggle('bar-stack', on);
  }
  function syncPanel() {
    if (!settings) return;
    el.optHour24.checked = !settings.hour12;
    el.optSeconds.checked = !!settings.showSeconds;
    el.optTop.checked = !!settings.alwaysOnTop;
    el.btnPin.setAttribute('aria-pressed', String(!!settings.alwaysOnTop));
    el.btnPin.title = settings.alwaysOnTop ? t('btn.pinned') : t('btn.pin');
    el.optLogin.checked = !!settings.launchAtLogin;
    // Microsoft Store build: launch at login is the appx startup task, which only Windows Settings controls. There is no
    // switch there (an always-off switch looks broken), only the row label, a visible note and a button that opens
    // Settings > Apps > Startup. The switch stays disabled too, so a click on the label cannot toggle it.
    const store = !!settings.store;
    if (el.optLogin.disabled !== store) el.optLogin.disabled = store;
    if (el.optLogin.hidden !== store) el.optLogin.hidden = store;
    if (el.optLoginNote.hidden !== !store) el.optLoginNote.hidden = !store;
    if (el.optLoginOpen.hidden !== !store) el.optLoginOpen.hidden = !store;
    if (store) el.optLogin.setAttribute('aria-describedby', 'optLoginNote'); else el.optLogin.removeAttribute('aria-describedby');
    const loginRow = el.optLogin.closest('.row');
    if (!store && settings.portable) loginRow.title = t('opt.login.portable');
    else loginRow.removeAttribute('title');
    if (document.activeElement !== el.optOpacity) { el.optOpacity.value = settings.opacity; applyOpacity(settings.opacity); }
    el.optTheme.value = settings.theme || 'system';
    el.optLayout.value = layout();
    el.optLanguage.value = settings.language || 'auto';
    // Microsoft Store policy restricts external payment links: no Ko-fi link in the Store build. The link is hidden in
    // the HTML and shown only once main has said this is not the Store build (store === false), so it never flashes.
    const kofiHidden = settings.store !== false;
    if (el.kofiLink.hidden !== kofiHidden) el.kofiLink.hidden = kofiHidden;
    syncAbout();
    applyTheme();
    applyLayout();
    syncLayoutSwitch();
  }
  // About row: Website, Report a problem (the bug form with this version and build filled in) and Check for updates
  // (not in the Store build, which the Store updates, nor in the web app, which is always current). Plain links opened
  // in the browser through main's openExternalSafe; no tracking parameters, and the app makes no request itself.
  const REPORT_URL = 'https://github.com/joaoCarvalho1000/open-world-clock/issues/new?template=bug.yml';
  function syncAbout() {
    const q = new URLSearchParams();
    const build = settings.web ? 'Web app (openworldclock.com)' : settings.store ? 'Microsoft Store' : settings.portable ? 'Portable' : 'Installer';
    q.set('build', build);
    if (settings.version) q.set('version', `v${settings.version}`);
    const href = `${REPORT_URL}&${q.toString()}`;
    if (el.reportLink.getAttribute('href') !== href) el.reportLink.setAttribute('href', href);
    const noUpdates = settings.store !== false || !!settings.web;
    if (el.updatesLink.hidden !== noUpdates) el.updatesLink.hidden = noUpdates;
  }
  let setSeq = 0;
  function set(patch) {
    if (!settings) return;
    const langBefore = settings.language;
    Object.assign(settings, patch);
    if (settings.language !== langBefore) applyLanguage();
    syncPanel(); render();
    if ('showSeconds' in patch) scheduleTick();
    const seq = ++setSeq;
    window.wc.setSettings(patch).then((s) => {
      if (seq !== setSeq || !s) return; // a newer change is in flight; its reply will carry the final state
      const { zones, ...rest } = s; // zones are owned by saveZones
      const lb = settings.language;
      settings = { ...settings, ...rest };
      if (settings.language !== lb) applyLanguage();
      syncPanel(); render();
    }).catch(onIpcError);
  }
  el.optHour24.addEventListener('change', guard(() => { set({ hour12: !el.optHour24.checked }); refreshHint(); }));
  el.optSeconds.addEventListener('change', guard(() => set({ showSeconds: el.optSeconds.checked })));
  el.optTop.addEventListener('change', guard(() => set({ alwaysOnTop: el.optTop.checked })));
  el.optLogin.addEventListener('change', guard(() => set({ launchAtLogin: el.optLogin.checked })));
  el.optLoginOpen.addEventListener('click', guard(() => { if (settings.store && window.wc.openStartupSettings) window.wc.openStartupSettings(); }));
  el.optOpacity.addEventListener('input', guard(() => applyOpacity(+el.optOpacity.value)));
  el.optOpacity.addEventListener('change', guard(() => set({ opacity: +el.optOpacity.value })));
  el.optTheme.addEventListener('change', guard(() => set({ theme: el.optTheme.value })));
  el.optLayout.addEventListener('change', guard(() => changeLayout(el.optLayout.value)));
  el.optLanguage.addEventListener('change', guard(() => set({ language: el.optLanguage.value })));
  el.btnPin.addEventListener('click', guard(() => { set({ alwaysOnTop: !settings.alwaysOnTop }); emit('pin', { on: settings.alwaysOnTop, button: el.btnPin }); }));

  // Settings panel: a modal dialog. Focus management, Tab trap, and everything behind it inert (bar, cards, planner,
  // map, popovers), not only the top bar.
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const panelFocusables = () => [...el.panel.querySelectorAll(FOCUSABLE)].filter((n) => !n.hidden && n.offsetParent !== null);
  function openPanel() {
    closeMenu(false); closeHours(false); closeChips(false); closeCopyMenu(false);
    el.panel.hidden = false;
    emit('panel', { open: true, panel: el.panel });
    for (const n of el.app.children) if (n !== el.panel && n !== el.announce && !n.inert) { n.inert = true; n.dataset.panelInert = '1'; }
    window.wc.panel(true);
    el.btnSettings.setAttribute('aria-expanded', 'true');
    const first = el.panel.querySelector('.panel-grid input, .panel-grid select') || panelFocusables()[0];
    if (first) first.focus();
  }
  function closePanel() {
    if (el.panel.hidden) return;
    emit('panel', { open: false, panel: el.panel });
    el.panel.hidden = true;
    for (const n of el.app.querySelectorAll('[data-panel-inert]')) { n.inert = false; delete n.dataset.panelInert; }
    window.wc.panel(false);
    el.btnSettings.setAttribute('aria-expanded', 'false');
    el.btnSettings.focus();
  }
  el.panel.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const f = panelFocusables(); if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    else if (i < 0) { e.preventDefault(); f[0].focus(); }
  });
  el.btnSettings.addEventListener('click', guard(() => { if (el.panel.hidden) openPanel(); else closePanel(); }));
  $('panelClose').addEventListener('click', closePanel);
  $('btnMin').addEventListener('click', () => window.wc.minimize());
  // X keeps the app running in the tray (like Alt+F4); Quit lives in the tray menu.
  $('btnClose').addEventListener('click', () => window.wc.hide());
  const isField = (n) => !!n && (n.tagName === 'TEXTAREA' || n.tagName === 'SELECT' || (n.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(n.type)) || n.isContentEditable);
  document.addEventListener('keydown', (e) => {
    // App-wide shortcuts, while no dialog, menu or popover is open: Ctrl+F add a city, Ctrl+T the time field (both
    // also from a text field), Ctrl+M map, Ctrl+P planner, Ctrl+Comma settings. main reserves only the zoom keys.
    if (e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && settings) {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (!['f', 't', 'm', 'p', ','].includes(k)) return;
      if (!el.panel.hidden || !el.menu.hidden || !el.copyMenu.hidden || !el.hoursEditor.hidden || !el.dateChips.hidden || layoutPopOpen()) return;
      if ((k === 'm' || k === 'p' || k === ',') && isField(e.target)) return;
      e.preventDefault();
      if (!el.tip.hidden) setHelp(false);
      if (k === 'f') el.search.focus();
      else if (k === 't') { el.convTime.focus(); el.convTime.select(); }
      else if (k === 'm') el.btnMap.click();
      else if (k === 'p') el.btnPlanner.click();
      else openPanel();
      return;
    }
    if (e.key !== 'Escape') return;
    if (layoutPopOpen()) { setLayoutPop(false); el.btnLayout.focus(); return; }
    if (!el.dateChips.hidden) { closeChips(true); return; }
    if (!el.hoursEditor.hidden) { closeHours(true); return; }
    if (!el.menu.hidden) { closeMenu(true); return; }
    if (!el.copyMenu.hidden) { closeCopyMenu(true); return; }
    if (!el.panel.hidden) { closePanel(); return; }
    // Escape anywhere else (a card, a button, the page) goes back to now; text fields and selects keep their own
    // Escape (the time field clears itself, the search field empties, a rename is cancelled).
    if (el.tip.hidden && convert && !isField(e.target)) clearConversion();
  });

  // ---------- one-time tip ----------
  // Help lives behind the "?" button; nothing is shown on the main view.
  // Card, app-wide and zoom shortcuts, listed in the Help popover in two groups (key label, what it does). In a wide
  // strip window the groups sit side by side (the group and row set their grid place), so the popover fits the default
  // 250 px tall window without scrolling; narrow windows keep one column.
  const HELP_GROUPS = [
    ['help.keysCard', [['kbd.enter', 'keys.enter'], ['kbd.type', 'keys.type'], ['kbd.f2', 'keys.f2'], ['kbd.del', 'keys.del'], ['kbd.move', 'keys.move'],
      ['kbd.scrub', 'keys.scrub'], ['kbd.hour', 'keys.hour'], ['kbd.menu', 'keys.menu']]],
    ['help.keysAny', [['kbd.ctrlF', 'keys.ctrlF'], ['kbd.ctrlT', 'keys.ctrlT'], ['kbd.ctrlM', 'keys.ctrlM'], ['kbd.ctrlP', 'keys.ctrlP'], ['kbd.ctrlComma', 'keys.ctrlComma'],
      ['kbd.zoomIn', 'keys.zoomIn'], ['kbd.zoomOut', 'keys.zoomOut'], ['kbd.zoomReset', 'keys.zoomReset']]],
  ];
  // "[ and ]" is two keys: each gets its own <kbd>, the connector word stays plain text.
  function keyLabel(k) {
    const txt = t(k), m = k === 'kbd.scrub' ? /^(\S+) (.+) (\S+)$/.exec(txt) : null;
    const kbd = (s) => { const n = document.createElement('kbd'); n.textContent = s; return n; };
    return m ? [kbd(m[1]), ` ${m[2]} `, kbd(m[3])] : [kbd(txt)];
  }
  function renderTip() {
    if (!settings) return;
    const items = [t('tip.chip1'), t('tip.chip2'), t('tip.chip3'), t('tip.chip4'), t('tip.chip5')];
    const key = items.join('|') + I.lang;
    if (el.tipText._key === key) return;
    el.tipText._key = key;
    el.tipText.replaceChildren(...items.map((c) => { const s = document.createElement('span'); s.className = 'chip'; s.textContent = c; return s; }));
    el.helpKeys.replaceChildren(...HELP_GROUPS.flatMap(([title, rows], g) => {
      const note = document.createElement('div'); note.className = `help-note g${g + 1}`; note.textContent = t(title); note.style.setProperty('--hr', '1');
      return [note, ...rows.flatMap(([k, d], i) => {
        const dt = document.createElement('dt'), dd = document.createElement('dd');
        dt.append(...keyLabel(k)); dd.textContent = t(d);
        for (const n of [dt, dd]) { n.className = `g${g + 1}`; n.style.setProperty('--hr', String(i + 2)); }
        if (k === 'kbd.zoomIn') { dt.classList.add('first-zoom'); dd.classList.add('first-zoom'); }
        return [dt, dd];
      })];
    }));
  }
  const btnHelp = $('btnHelp');
  function setHelp(open) {
    if (open === !el.tip.hidden) return;
    if (open) { renderTip(); el.tip.hidden = false; el.tip.style.right = 'auto'; placePopover(el.tip, btnHelp.getBoundingClientRect()); }
    else { emit('tip-dismiss', { tip: el.tip }); el.tip.hidden = true; }
    btnHelp.setAttribute('aria-expanded', String(open));
    // The dialog takes focus on open; Escape and the close button return it to the ? button.
    if (open) { el.tipClose.focus({ preventScroll: true }); emit('menu', { open: true, menu: el.tip, anchor: btnHelp }); }
  }
  btnHelp.addEventListener('click', (e) => { e.stopPropagation(); setHelp(el.tip.hidden); });
  document.addEventListener('mousedown', (e) => { if (!el.tip.hidden && !el.tip.contains(e.target) && !btnHelp.contains(e.target)) setHelp(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.tip.hidden) { setHelp(false); btnHelp.focus(); } });
  el.tipClose.addEventListener('click', () => { setHelp(false); btnHelp.focus(); });

  // ---------- move the window by dragging any non-interactive area ----------
  const INTERACTIVE = 'input, select, button, textarea, a, output, .results, .menu, .panel, .tip, .card[data-zone], .hours-pop, .date-chips, .plan-cells, .seg, .map-view';
  let drag = null;
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest(INTERACTIVE)) return;
    drag = { x: e.screenX, y: e.screenY, id: e.pointerId, moved: false };
  });
  document.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.screenX - drag.x, dy = e.screenY - drag.y;
    if (!drag.moved) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      drag.moved = true; window.wc.dragStart();
      document.documentElement.classList.add('moving');
      try { document.documentElement.setPointerCapture(e.pointerId); } catch {}
    }
    window.wc.dragMove(dx, dy);
  });
  const endDrag = () => { drag = null; document.documentElement.classList.remove('moving'); };
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);

  // ---------- tick ----------
  // Aligned to the next second (seconds shown) or the next minute; paused while the window is hidden.
  function scheduleTick() {
    clearTimeout(tick); tick = null;
    if (!settings || document.visibilityState === 'hidden') return;
    const period = settings.showSeconds ? 1000 : 60000;
    const delay = period - (Date.now() % period) + 15;
    tick = setTimeout(() => { tickNow(); scheduleTick(); }, delay);
  }
  // Full render once a minute (and on every state change); in between, a seconds tick only rewrites the .sec digits.
  // Every zone shares the same seconds (all UTC offsets are whole minutes), so one value serves all cards.
  function tickNow() {
    const now = Date.now();
    if (Math.floor(now / 60000) !== lastMinute) { checkLocalZone(); render(); return; }
    if (convert || !settings.showSeconds) return;
    const sec = String(new Date(now).getUTCSeconds()).padStart(2, '0');
    for (const s of el.strip.querySelectorAll('.card[data-zone] .sec')) setText(s, sec);
  }
  // The OS time zone changed (travel, manual change): rebuild with the new home city.
  function checkLocalZone() {
    const z = readLocalZone();
    if (z === LOCAL_ZONE) return;
    const wasSource = el.convZone.value === LOCAL_ZONE;
    LOCAL_ZONE = z;
    structKey = null; planKey = null;
    if (wasSource) el.convZone.value = '';
    fillConvZones();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { clearTimeout(tick); tick = null; hiddenSince = Date.now(); }
    else if (settings) {
      // Back after more than 5 minutes hidden: a conversion left open goes back to now before the first frame.
      const away = hiddenSince ? Date.now() - hiddenSince : 0;
      hiddenSince = 0;
      if (convert && away > convIdleMs()) clearConversion();
      checkLocalZone(); render(); scheduleTick();
    }
  });

  // ---------- boot ----------
  I.setLang('auto');
  applyStatic();
  let booted = false, bootMsg = null;
  const unsubscribe = window.wc.onSettings((s) => adopt(s));
  window.addEventListener('beforeunload', () => { if (typeof unsubscribe === 'function') unsubscribe(); });
  // Settings load: a refused or failed answer (null, no zones, an IPC error) is retried after 500 ms and 1500 ms. If it
  // still fails, the strip shows one message with a Retry button (one more try). settings stays null the whole time, so
  // guard() keeps every handler from running on a half-built object; there is no read-only fallback.
  const BOOT_RETRY_MS = [500, 1500];
  function loadSettings(attempt) {
    window.wc.getSettings().then((s) => {
      if (booted) return;
      if (!validSettings(s)) throw new Error(`settings:get returned ${s === null ? 'null' : typeof s === 'object' ? 'no zones' : typeof s}`);
      boot(s);
    }).catch((e) => {
      if (booted) { console.error('world-clock: startup failed', e); return; }
      if (attempt < BOOT_RETRY_MS.length) { setTimeout(() => loadSettings(attempt + 1), BOOT_RETRY_MS[attempt]); return; }
      console.error('world-clock: could not load settings', e);
      showBootFailed();
    });
  }
  function showBootFailed() {
    if (bootMsg) return;
    bootMsg = document.createElement('div');
    bootMsg.className = 'boot-failed';
    bootMsg.setAttribute('role', 'alert');
    const p = document.createElement('p');
    p.textContent = t('boot.failed');
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'bootRetry'; b.className = 'pill';
    b.textContent = t('boot.retry');
    // Asks main again (the page itself cannot reload: main refuses page navigations). The message stays until it works.
    b.addEventListener('click', () => { b.disabled = true; loadSettings(BOOT_RETRY_MS.length); setTimeout(() => { b.disabled = false; }, 1000); });
    bootMsg.append(p, b);
    el.strip.prepend(bootMsg);
  }
  function boot(s) {
    if (booted) return;
    booted = true;
    if (bootMsg) { bootMsg.remove(); bootMsg = null; }
    applyBackdrop(s);
    settings = { ...s };
    if (!settings.labels || typeof settings.labels !== 'object') settings.labels = {};
    if (!settings.hours || typeof settings.hours !== 'object') settings.hours = {};
    // Saved legacy ids (e.g. Asia/Tel_Aviv from older versions) move to their canonical zone, keeping their custom
    // labels and working hours (the canonical entry wins when both exist).
    const canon = [...new Set((settings.zones || []).map(canonical))];
    if (!s.firstRun && JSON.stringify(canon) !== JSON.stringify(settings.zones)) {
      const remap = (obj) => {
        const out = {};
        for (const [k, v] of Object.entries(obj)) if (canonical(k) === k) out[k] = v;
        for (const [k, v] of Object.entries(obj)) if (canonical(k) !== k && !(canonical(k) in out)) out[canonical(k)] = v;
        return out;
      };
      const labels = remap(settings.labels), hours = remap(settings.hours);
      settings.zones = canon; settings.labels = labels; settings.hours = hours;
      window.wc.setSettings({ zones: canon, labels, hours }).catch(onIpcError);
    }
    if (s.firstRun) {
      // The local city joins the defaults, and a default city that shows the same time as another all year is left
      // out (a London or Lisbon card twice), so every first-run card fits the default strip. The local city is the
      // Home card, so it wins its group; the others keep their order.
      const base = s.zones.includes(LOCAL_ZONE) ? s.zones : [LOCAL_ZONE, ...s.zones];
      const keep = new Set(T.uniqueClocks([LOCAL_ZONE, ...base.filter((z) => z !== LOCAL_ZONE)], Date.now()));
      const zones = base.filter((z) => keep.has(z));
      settings.zones = zones; settings.firstRun = false;
      window.wc.setSettings({ zones, firstRun: false }).catch(onIpcError);
    }
    applyLanguage();
    el.ver.textContent = s.version ? `v${s.version}` : '';
    syncPanel();
    fillConvZones();
    renderTip();
    render();
    el.strip.scrollLeft = 0;
    emit('boot', { strip: el.strip });
    scheduleTick();
  }
  loadSettings(0);
})();
