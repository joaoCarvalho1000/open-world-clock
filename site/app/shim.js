/* Open World Clock in the browser: window.wc for the Windows app's renderer (src/renderer), so the same app.js runs in
   the home page's hero (https://openworldclock.com/, an iframe of /app/) unchanged. The contract is src/preload.js and
   CONTRACT.md.
   - /app/ lives only inside that iframe. Opened on its own (top level) it goes to the home page, hash and all, so an
     older /app/#c=... link still opens those cities, in the hero.
   - Settings live in localStorage under one key (KEY), with the same DEFAULTS and validation as src/main.js (DEFAULTS,
     VALIDATE, updateSettings). test/web/shim.test.mjs runs both on the same inputs, so they cannot drift apart.
   - onSettings: writes from other tabs arrive through the storage event (multi-tab sync). A tab never hears its own
     writes, the same way main never sends a change back to the window that made it.
   - copyText: navigator.clipboard, with a hidden textarea and execCommand('copy') as the fallback.
   - Window calls (drag, minimize, hide, panel, setView, tray names, Startup apps) do nothing here.
   - publicSettings flags: store false, portable false, web true, backdrop 'none', version from package.json (written
     by scripts/build-web.mjs).
   - Layout: no choice on the web. Wide frames get the strip, narrow ones (under 600px) the vertical layout. A saved
     layout is ignored and a new one is never saved (the Windows app keeps its layout switch).
   - Shared links put the city list in the URL hash only, never the query: #c=Europe/Lisbon,Asia/Tokyo, plus
     &t=2026-09-24T15:00&z=America/New_York for a converted time. The link is the home page's
     (https://openworldclock.com/#c=...): the hash is read from the page around the iframe, or from the iframe's own.
     They show those cities for the visit without touching the saved list; web.js offers "Save these cities".
     Renames made while viewing them stay in the visit too.
   - Language: the home page in Portuguese or Spanish frames /app/#lang=pt or #lang=es (with a shared link's keys
     after it, if any). The app's 'auto' language then follows the page (publicSettings systemLanguage) instead of
     the browser; a language picked in Settings still wins. Share links never carry it.
   - Theme: the app's "System" theme follows the website's theme choice (localStorage 'wc-theme', written by
     site/assets/theme.js) when there is one, otherwise the OS. This file answers the renderer's
     matchMedia('(prefers-color-scheme: dark)') for that; every other query goes to the browser.
   Nothing here talks to the network. */
(() => {
  'use strict';
  const KEY = 'owc-app-settings';
  const SITE_THEME_KEY = 'wc-theme';
  const VERSION = '1.3.1';
  const root = document.documentElement;

  // Top level: this page belongs in the home page's hero. Go there with the hash (the shared cities, if any). The rest
  // still runs, so nothing on the way out throws.
  let framed = true;
  try { framed = window.top !== window.self; } catch { framed = true; }
  if (!framed) location.replace('/' + location.hash);

  // ---------- settings rules: a port of src/main.js (keep in step; test/web/shim.test.mjs compares them) ----------
  const LAYOUTS = ['strip', 'compact', 'vertical'];
  const VIEW_KEYS = [...LAYOUTS, 'map', 'planner', 'mapVertical', 'plannerVertical'];
  const PLANNER_KEYS = ['planner', 'plannerVertical'];
  const MIN_W = 280, MIN_H = 120, MAX_DIM = 16384, ZOOM_MAX = 3.8;
  const MAIN_OWNED = new Set(['viewSizes']);
  const WEB_FIXED = new Set(['layout']); // the web picks the layout from the width; a patch for it is ignored
  const LANGUAGES = new Set(['auto', 'en', 'pt', 'es']);
  const THEMES = new Set(['system', 'light', 'dark']);
  const DEFAULTS = Object.freeze({
    zones: ['Europe/Lisbon', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Singapore'],
    hour12: false,
    showSeconds: true,
    alwaysOnTop: true,
    opacity: 0.85,
    theme: 'system',
    launchAtLogin: false,
    firstRun: true,
    bounds: null,
    labels: {},
    layout: 'strip',
    language: 'auto',
    tipSeen: false,
    closeHintSeen: false,
    hours: {},
    planner: false,
    viewSizes: {},
    zoom: 0,
  });
  const isZone = (z) => { try { new Intl.DateTimeFormat('en-US', { timeZone: z }); return true; } catch { return false; } };
  const isPlainObject = (v) => v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;
  const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
  const cleanHours = (h) => {
    if (!isPlainObject(h)) return undefined;
    const { start, end, days } = h;
    if (typeof start !== 'string' || typeof end !== 'string' || !HHMM.test(start) || !HHMM.test(end) || start === end) return undefined;
    if (!Array.isArray(days) || days.length < 1 || days.length > 7) return undefined;
    if (!days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) || new Set(days).size !== days.length) return undefined;
    return { start, end, days: [...days].sort((a, b) => a - b) };
  };
  const bool = (v) => (typeof v === 'boolean' ? v : undefined);
  // Returns the sanitized value, or undefined to reject (the stored value is kept).
  const VALIDATE = {
    zones: (v) => (Array.isArray(v) && v.every((z) => typeof z === 'string' && z.length < 64) ? [...new Set(v)].filter(isZone) : undefined),
    hour12: bool,
    showSeconds: bool,
    alwaysOnTop: bool, // window only: stored, never used here
    launchAtLogin: bool, // window only
    firstRun: bool,
    tipSeen: bool,
    closeHintSeen: bool,
    planner: bool,
    opacity: (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0.6, v)) : undefined), // window only
    zoom: (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(ZOOM_MAX, Math.max(0, v)) * 10) / 10 : undefined),
    theme: (v) => (THEMES.has(v) ? v : undefined),
    layout: (v) => (typeof v === 'string' && LAYOUTS.includes(v) ? v : undefined),
    language: (v) => (LANGUAGES.has(v) ? v : undefined),
    labels: (v) => {
      if (!isPlainObject(v)) return undefined;
      const out = {};
      for (const [k, s] of Object.entries(v)) {
        if (k.length >= 64 || typeof s !== 'string' || !isZone(k)) continue;
        const t = s.trim();
        if (t && t.length <= 40) out[k] = t;
      }
      return out;
    },
    hours: (v) => {
      if (!isPlainObject(v)) return undefined;
      const out = {};
      for (const [k, h] of Object.entries(v)) {
        if (k.length >= 64 || !isZone(k)) continue;
        const clean = cleanHours(h);
        if (clean) out[k] = clean;
      }
      return out;
    },
    viewSizes: (v) => {
      if (!isPlainObject(v)) return undefined;
      const out = {};
      for (const k of VIEW_KEYS) {
        if (PLANNER_KEYS.includes(k)) continue; // sizes saved by older versions are dropped
        const s = v[k];
        if (!isPlainObject(s) || !Number.isInteger(s.width) || !Number.isInteger(s.height)) continue;
        out[k] = { width: Math.min(MAX_DIM, Math.max(MIN_W, s.width)), height: Math.min(MAX_DIM, Math.max(MIN_H, s.height)) };
      }
      return out;
    },
  };

  // src/locale-prefs.js: does this locale write times with a 12-hour clock? Asked once, on the first run.
  function prefers12h(locale) {
    if (typeof locale !== 'string' || !locale.trim()) return false;
    try {
      const tag = locale.trim();
      if (!Intl.DateTimeFormat.supportedLocalesOf([tag]).length) return false;
      const hc = new Intl.DateTimeFormat(tag, { hour: 'numeric' }).resolvedOptions().hourCycle;
      return hc === 'h11' || hc === 'h12';
    } catch {
      return false;
    }
  }
  const browserLocale = () => {
    try { return (navigator.languages && navigator.languages[0]) || navigator.language || ''; } catch { return ''; }
  };
  // The page's language, from the hash: the home page in Portuguese or Spanish frames /app/#lang=pt or #lang=es
  // (possibly with a shared link's keys: #lang=pt&c=...). The frame's own hash first, then the home page's.
  const PAGE_LANGS = new Set(['en', 'pt', 'es']);
  function langFrom(hash) {
    const s = String(hash || '').replace(/^#/, '');
    if (!s || s.length > 4000) return '';
    for (const part of s.split('&')) {
      if (!part.startsWith('lang=')) continue;
      const v = part.slice(5).toLowerCase();
      if (PAGE_LANGS.has(v)) return v;
    }
    return '';
  }
  function hashLangNow() {
    let host = '';
    try { host = window.parent !== window ? langFrom(window.parent.location.hash) : ''; } catch { host = ''; }
    return langFrom(location.hash) || host;
  }
  // Read once at start: web.js clears a shared link from the hashes later, and the language must not go with it. A new
  // hash that names a language replaces it (updatePageLang).
  let pageLang = hashLangNow();
  // What 'auto' resolves to: the page's language when the hash gives one, else the first browser language the app
  // speaks. A language picked in the app's Settings still wins (app.js only uses this for 'auto').
  function systemLanguage() {
    if (pageLang) return pageLang;
    let list = [];
    try { list = [...(navigator.languages || []), navigator.language]; } catch { list = []; }
    for (const l of list) {
      const s = String(l || '').toLowerCase();
      if (s.startsWith('pt')) return 'pt';
      if (s.startsWith('es')) return 'es';
      if (s.startsWith('en')) return 'en';
    }
    return 'en';
  }

  const copy = (v) => JSON.parse(JSON.stringify(v));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // ---------- storage ----------
  function readRaw() {
    try {
      const s = localStorage.getItem(KEY);
      if (!s) return null;
      const raw = JSON.parse(s);
      return isPlainObject(raw) ? raw : null;
    } catch { return null; }
  }
  // main.js loadSettings(): defaults, then every stored value that passes its validator. First run (whenReady in
  // main.js) picks the 12 or 24-hour clock from the locale; nothing is written until the renderer's first save.
  function loadSettings() {
    const out = copy(DEFAULTS);
    const raw = readRaw();
    if (raw) {
      for (const [k, validate] of Object.entries(VALIDATE)) {
        const v = validate(raw[k]);
        if (v !== undefined) out[k] = v;
      }
    }
    if (out.firstRun) out.hour12 = prefers12h(browserLocale());
    return out;
  }
  // Blocked storage (private modes, strict settings): the app still works, for this visit only.
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(settings)); return true; } catch { return false; }
  }

  let settings = loadSettings();

  // ---------- shared links (hash only) ----------
  const pad2 = (n) => String(n).padStart(2, '0');
  const encodeZone = (z) => encodeURIComponent(z).replace(/%2F/gi, '/');
  // '#c=Europe/Lisbon,Asia/Tokyo&t=2026-09-24T15:00&z=America/New_York' -> { zones, t: { ymd, h, mi } | null, z }, or
  // null when it holds nothing usable. Unknown keys and invalid zones are ignored; at most 50 cities.
  function parseShare(hash) {
    const s = String(hash || '').replace(/^#/, '');
    if (!s || s.length > 4000) return null;
    const out = { zones: [], t: null, z: null };
    for (const part of s.split('&')) {
      const i = part.indexOf('=');
      if (i < 1) continue;
      const k = part.slice(0, i);
      let v;
      try { v = decodeURIComponent(part.slice(i + 1)); } catch { continue; }
      if (k === 'c') {
        out.zones = [...new Set(v.split(',').map((x) => x.trim()).filter((z) => z && z.length < 64 && isZone(z)))].slice(0, 50);
      } else if (k === 't') {
        const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v);
        if (!m) continue;
        const [y, mo, d, h, mi] = m.slice(1).map(Number);
        const dt = new Date(Date.UTC(y, mo - 1, d));
        if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d || h > 23 || mi > 59) continue;
        out.t = { ymd: `${m[1]}-${m[2]}-${m[3]}`, h, mi };
      } else if (k === 'z') {
        if (v.length < 64 && isZone(v)) out.z = v;
      }
    }
    if (out.z && out.zones.length && !out.zones.includes(out.z)) out.zones.push(out.z); // the source city is on the list
    return out.zones.length || out.t ? out : null;
  }
  // The hash for a list of cities and, while converting, the converted time: { ymd, h, mi, zone }.
  function buildShare(zones, conv) {
    let h = 'c=' + zones.map(encodeZone).join(',');
    if (conv) h += `&t=${conv.ymd}T${pad2(conv.h)}:${pad2(conv.mi)}&z=${encodeZone(conv.zone)}`;
    return h;
  }

  // The hash a shared link brought: the home page's (the page around the iframe, same origin), else this page's own.
  function hostHash() {
    try { return window.parent !== window && parseShare(window.parent.location.hash) ? window.parent.location.hash : ''; } catch { return ''; }
  }
  const shareHash = () => hostHash() || location.hash;

  // While a shared link is on screen: its cities and the labels, kept for the visit only. null otherwise.
  let shared = null;
  function enterShared(zones) {
    shared = zones && zones.length && !same(zones, settings.zones) ? { zones: [...zones], labels: { ...settings.labels } } : null;
    root.classList.toggle('is-shared', !!shared);
  }
  {
    const p = parseShare(shareHash());
    if (p && p.zones.length) enterShared(p.zones);
  }

  // ---------- theme ----------
  const realMatchMedia = window.matchMedia.bind(window);
  const DARK_QUERY = '(prefers-color-scheme: dark)';
  const osDark = realMatchMedia(DARK_QUERY);
  const darkListeners = new Set();
  function sitePref() {
    try { const v = localStorage.getItem(SITE_THEME_KEY); return v === 'light' || v === 'dark' ? v : ''; } catch { return ''; }
  }
  const darkQuery = {
    media: DARK_QUERY,
    onchange: null,
    get matches() { const p = sitePref(); return p ? p === 'dark' : osDark.matches; },
    addEventListener(type, fn) { if (type === 'change' && typeof fn === 'function') darkListeners.add(fn); },
    removeEventListener(type, fn) { if (type === 'change') darkListeners.delete(fn); },
    addListener(fn) { this.addEventListener('change', fn); },
    removeListener(fn) { this.removeEventListener('change', fn); },
    dispatchEvent() { return true; },
  };
  let lastDark = darkQuery.matches;
  function fireDark() {
    const now = darkQuery.matches;
    if (now === lastDark) return;
    lastDark = now;
    const ev = { matches: now, media: DARK_QUERY };
    for (const fn of [...darkListeners]) { try { fn.call(darkQuery, ev); } catch (e) { console.error(e); } }
    if (typeof darkQuery.onchange === 'function') { try { darkQuery.onchange(ev); } catch (e) { console.error(e); } }
  }
  osDark.addEventListener('change', fireDark);
  window.matchMedia = function (q) {
    return String(q).replace(/\s+/g, '').toLowerCase() === '(prefers-color-scheme:dark)' ? darkQuery : realMatchMedia(q);
  };
  // The first paint already has the saved theme (app.js applyTheme() sets the same two things once it runs).
  function paintTheme() {
    const th = settings.theme || 'system';
    root.dataset.theme = th;
    root.classList.toggle('sys-dark', th === 'system' && darkQuery.matches);
  }
  paintTheme();

  // ---------- window.wc ----------
  const narrow = realMatchMedia('(max-width: 599px)');
  const listeners = new Set();
  function publicSettings() {
    const view = shared ? { zones: shared.zones, labels: shared.labels, firstRun: false } : {};
    return copy({
      ...settings,
      ...view,
      layout: narrow.matches ? 'vertical' : 'strip',
      version: VERSION,
      portable: false,
      store: false,
      shortcut: '',
      backdrop: 'none',
      snap: false,
      systemLanguage: systemLanguage(),
      web: true,
      shared: !!shared,
    });
  }
  function emit() {
    const s = publicSettings();
    for (const cb of [...listeners]) { try { cb(copy(s)); } catch (e) { console.error(e); } }
  }
  const sharedListeners = new Set();
  function sharedChanged() { for (const cb of [...sharedListeners]) { try { cb(!!shared); } catch (e) { console.error(e); } } }

  // main.js updateSettings(): validate each key, ignore main-owned ones, store what changed.
  function setSettings(patch) {
    const changed = {};
    for (const [k, v] of Object.entries(isPlainObject(patch) ? patch : {})) {
      if (!Object.hasOwn(VALIDATE, k) || MAIN_OWNED.has(k) || WEB_FIXED.has(k)) continue;
      const clean = VALIDATE[k](v);
      if (clean === undefined) continue;
      if (shared && (k === 'zones' || k === 'labels')) { shared[k] = clean; continue; } // this visit only
      if (!same(clean, settings[k])) changed[k] = clean;
    }
    if (Object.keys(changed).length) {
      Object.assign(settings, changed);
      save();
    }
    return Promise.resolve(publicSettings());
  }

  // Hidden textarea fallback for browsers without the async clipboard (or when it is refused).
  function fallbackCopy(text) {
    const prev = document.activeElement;
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.setAttribute('aria-hidden', 'true');
    ta.className = 'web-copy-buffer';
    document.body.appendChild(ta);
    let ok = false;
    try { ta.select(); ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    if (prev && typeof prev.focus === 'function') { try { prev.focus({ preventScroll: true }); } catch { /* gone */ } }
    return ok;
  }
  function copyText(text) {
    text = String(text);
    if (text.length > 5000) return Promise.resolve(false); // the same cap as main's clipboard:write
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(() => true, () => fallbackCopy(text));
    }
    return Promise.resolve(fallbackCopy(text));
  }

  const noop = () => {};
  window.wc = Object.freeze({
    getSettings: () => Promise.resolve(publicSettings()),
    setSettings,
    onSettings: (cb) => {
      if (typeof cb !== 'function') return noop;
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    copyText,
    dragStart: noop,
    dragMove: noop,
    panel: noop,
    setView: noop,
    hide: noop,
    minimize: noop,
    setTrayNames: noop,
    openStartupSettings: noop,
  });

  // Another tab saved settings, or the website's theme changed there.
  window.addEventListener('storage', (e) => {
    if (e.storageArea && e.storageArea !== localStorage) return;
    if (e.key === KEY || e.key === null) {
      settings = loadSettings();
      if (shared && same(shared.zones, settings.zones)) { shared = null; root.classList.remove('is-shared'); sharedChanged(); }
      emit();
    }
    if (e.key === SITE_THEME_KEY || e.key === null) fireDark();
  });
  // Crossing the phone width switches between the strip and the vertical layout.
  narrow.addEventListener('change', emit);
  // A new hash with a language (this page's, or the home page's): 'auto' follows it at once.
  function updatePageLang() {
    const l = hashLangNow();
    if (l && l !== pageLang) { pageLang = l; emit(); }
  }
  window.addEventListener('hashchange', updatePageLang);
  try { if (window.parent !== window) window.parent.addEventListener('hashchange', updatePageLang); } catch { /* not the home page */ }

  // The first paint already has the layout app.js will pick (CONTRACT.md: .app layout-*, h12, bar-stack, and the
  // collapsed layout switch), so nothing moves when it starts: a phone opens straight in the stacked vertical layout.
  // The parser inserts #app after this file has run; a MutationObserver sees it before anything is painted.
  // Widths come from media queries, not window.innerWidth: reading innerWidth here, while the page is still being
  // parsed, lays out the whole unstyled page once (130 ms on a 4x slowed CPU) before the first paint.
  function prelayout(app) {
    const s = publicSettings();
    const upTo = (w) => realMatchMedia(`(max-width: ${w}px)`).matches;
    for (const l of LAYOUTS) app.classList.toggle('layout-' + l, l === s.layout);
    app.classList.toggle('h12', !!s.hour12);
    app.classList.toggle('bar-stack', s.layout === 'vertical' || upTo(480));
    app.classList.toggle('ls-collapsed', s.layout === 'vertical' || upTo(760));
  }
  if (document.getElementById && document.getElementById('app')) prelayout(document.getElementById('app'));
  else if (typeof MutationObserver === 'function') {
    const mo = new MutationObserver(() => {
      const app = document.getElementById('app');
      if (app) { mo.disconnect(); prelayout(app); }
    });
    mo.observe(root, { childList: true, subtree: true });
  }

  // ---------- for web.js (the page around the app) ----------
  let booted = false;
  const bootQueue = [];
  document.addEventListener('wc:boot', () => { booted = true; bootQueue.splice(0).forEach((fn) => fn()); }, { once: true });

  // The first paint of the clocks: until the app's entrance animation (motion/cards.js) has finished, html.web-entrance
  // keeps the cards opaque (the entrance keeps its rise) and turns off their colour transitions (web.css), so the first
  // paint of the clocks is the one that counts as the largest contentful paint.
  root.classList.add('web-entrance');
  document.addEventListener('wc:boot', () => {
    const done = () => root.classList.remove('web-entrance');
    setTimeout(() => { // after every boot listener (cards.js starts the entrance in its own)
      const onCard = (a) => { const el = a.effect && a.effect.target; return !!(el && el.matches && el.matches('.card[data-zone]')); };
      const anims = typeof document.getAnimations === 'function' ? document.getAnimations().filter(onCard) : [];
      Promise.allSettled(anims.map((a) => a.finished)).then(done);
      setTimeout(done, 3000);
    }, 0);
  }, { once: true });
  window.WCWeb = Object.freeze({
    parseShare,
    buildShare,
    shareHash,
    langFrom,
    pageLang: () => pageLang,
    settings: () => publicSettings(),
    isShared: () => !!shared,
    onShared: (cb) => { if (typeof cb === 'function') sharedListeners.add(cb); },
    // Opens another shared list in this tab (a new link pasted into the address bar).
    enterShared(zones) {
      enterShared(zones);
      sharedChanged();
      emit();
    },
    // "Save these cities": the shared list (and the renames made on it) becomes the saved list.
    saveShared() {
      if (!shared) return false;
      settings.zones = shared.zones;
      settings.labels = shared.labels;
      settings.firstRun = false;
      save();
      shared = null;
      root.classList.remove('is-shared');
      sharedChanged();
      emit();
      return true;
    },
    // "Show my cities": back to the saved list. Returns false when the page should reload instead (a first visit that
    // began on a shared link: the app picks its first cities at start).
    leaveShared() {
      shared = null;
      root.classList.remove('is-shared');
      sharedChanged();
      if (settings.firstRun) return false;
      emit();
      return true;
    },
    whenBooted: (fn) => { if (booted) fn(); else bootQueue.push(fn); },
    // for test/web/shim.test.mjs
    rules: Object.freeze({ DEFAULTS, VALIDATE, MAIN_OWNED, KEY }),
  });
})();
