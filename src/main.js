const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, nativeTheme, screen, shell, clipboard, ClipboardItem, session, protocol, net, dialog } = require('electron');
const path = require('path');
const os = require('os');
const { pathToFileURL } = require('url');
const { isAppUrl, APP_INDEX } = require('./url-trust');
const { loginItemAction } = require('./login-item');
const { createReloadGuard } = require('./reload-guard');
const { prefers12h } = require('./locale-prefs');
const { createSettingsStore } = require('./settings-store');
const { buildIcs, validIcsRequest, htmlTable } = require('./share-format');
const fs = require('fs');
const crypto = require('crypto');

// Must run before anything reads userData (tests point this at a temp folder).
if (process.env.WC_USER_DATA && !app.isPackaged) app.setPath('userData', process.env.WC_USER_DATA);

// settings.json lives in userData (src/settings-store.js: load, atomic save, legacy folder copy). Product renames
// ("World Clock", then briefly "Free World Clock", now "Open World Clock") move Electron's userData folder, which is
// derived from productName; on the first run under a new name the store copies settings.json (and its .bak) from the
// most recently used previous folder, leaving it untouched. Skipped when tests point userData elsewhere (WC_USER_DATA).
const LEGACY_USER_DATA_DIRS = ['Free World Clock', 'World Clock'];

// The renderer is served from app://owc (protocol.handle below), not file://: the page URL is the same in every install
// folder, CSP 'self' is that origin, and the packaged build can turn off the GrantFileProtocolExtraPrivileges fuse.
// Registered before ready: standard (relative URLs, an origin) and secure (a secure context, like file:// was).
const RENDERER_DIR = path.join(__dirname, 'renderer');
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true } }]);
// app://owc/<path> -> the file under src/renderer (inside app.asar when packaged). Anything else: 404; a path that
// resolves outside the renderer folder: 403.
function serveApp(req) {
  let u;
  try { u = new URL(req.url); } catch { return new Response(null, { status: 400 }); }
  if (u.host !== 'owc') return new Response(null, { status: 404 });
  let rel;
  try { rel = decodeURIComponent(u.pathname).replace(/^\/+/, ''); } catch { return new Response(null, { status: 400 }); }
  const file = path.resolve(RENDERER_DIR, rel);
  if (!file.startsWith(RENDERER_DIR + path.sep)) return new Response(null, { status: 403 });
  return net.fetch(pathToFileURL(file).href);
}
const APP_ID = 'io.joao.worldclock';
// Auto-update is OFF unless the build explicitly opts in (package.json "build.extraMetadata.wcUpdates": true). Only a
// signed website build sets it (scripts/dist-release.js with signing configured, scripts/signing.js); after-pack.js
// fails any unsigned or Store build that has it. Unsigned builds must never download and run updates.
const UPDATES_ENABLED = (() => { try { return require('../package.json').wcUpdates === true; } catch { return false; } })();
// The updater runs only in the installed (NSIS) copy of such a build: never in the portable exe, which the signed
// release also builds from the same app files, never in the Store build, and never unpackaged.
function updatesActive() {
  return UPDATES_ENABLED && app.isPackaged && !process.windowsStore && !process.env.PORTABLE_EXECUTABLE_FILE;
}
// Offline first: the page is a local file and links open in the browser, so without the updater nothing here uses the
// network. Skipping proxy detection drops the WPAD lookups and Chromium's proxy resolver process, and running the
// network service inside the browser process drops one more helper process (about 7 MB). Keep a single
// enable-features switch: a second appendSwitch with the same name replaces the first, so add features as a comma list.
// The updater needs the system proxy (the user's network may require one), so only the updating install skips this.
if (!updatesActive()) {
  app.commandLine.appendSwitch('no-proxy-server');
  app.commandLine.appendSwitch('enable-features', 'NetworkServiceInProcess2');
}
const LAYOUT_SIZES = {
  strip: { width: 1160, height: 250 },
  compact: { width: 1160, height: 150 },
  vertical: { width: 300, height: 640 },
};
// The compact layout is one row of small cards; taller windows only add empty bands, so its height is capped.
const COMPACT_MAX_H = 220;
// Declared before loadSettings() runs: the viewSizes validator clamps with them.
const MIN_W = 280, MIN_H = 120;
const MAX_DIM = 16384;
// Sizing keys: the layout is the base view; 'map' and 'planner' are overlay views that replace it while open.
// The vertical layout keeps its own overlay sizes (mapVertical, plannerVertical): a tall narrow planner or map there,
// a wide one in the strip and compact layouts.
const VIEW_KEYS = [...Object.keys(LAYOUT_SIZES), 'map', 'planner', 'mapVertical', 'plannerVertical'];
// The planner is never given a remembered size: it opens at the size its content needs (the renderer measures it, see
// window:fitView), so a size left over from a bigger window or fewer cities cannot bring back empty space.
const PLANNER_KEYS = ['planner', 'plannerVertical'];
// Settings only main writes (never accepted from a settings:set patch).
const MAIN_OWNED = new Set(['viewSizes']);
const LANGUAGES = new Set(['auto', 'en', 'pt', 'es']);
const ENV_LANG = ['en', 'pt', 'es'].includes(process.env.WC_LANG) ? process.env.WC_LANG : 'auto';
const DEFAULTS = {
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
  language: ENV_LANG,
  tipSeen: false,
  closeHintSeen: false,
  hours: {},
  planner: false,
  viewSizes: {},
  zoom: 0,
};
const THEMES = new Set(['system', 'light', 'dark']);

// shell.openExternal only ever opens https links on these hosts (the website, the source repo, the Store listing, the
// Ko-fi page; the Ko-fi link is never shown in the Store build).
const EXTERNAL_HOSTS = new Set(['openworldclock.com', 'www.openworldclock.com', 'github.com', 'apps.microsoft.com', 'ko-fi.com']);
const KOFI_URL = 'https://ko-fi.com/joaothecarvalho';

// Page zoom (Ctrl + / Ctrl - / Ctrl 0, Ctrl+wheel): Chromium zoom levels, factor 1.2^level, in 0.5 steps from 100% up
// to 3.8 (200%). The window grows and shrinks with the zoom, so every view keeps its layout (see zf()).
const ZOOM_MAX = 3.8;
const ZOOM_STEPS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, ZOOM_MAX];
function zoomStep(cur, dir) {
  if (dir > 0) return ZOOM_STEPS.find((z) => z > cur + 1e-6) ?? ZOOM_MAX;
  return [...ZOOM_STEPS].reverse().find((z) => z < cur - 1e-6) ?? 0;
}
function openExternalSafe(raw) {
  let u;
  try { u = new URL(String(raw)); } catch { return false; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port || !EXTERNAL_HOSTS.has(u.hostname.toLowerCase())) return false;
  // Store policy restricts external payment links: the Store build never opens Ko-fi, whatever the page asks for.
  if (process.windowsStore && /(^|\.)ko-fi\.com$/i.test(u.hostname)) return false;
  shell.openExternal(u.href).catch(() => {});
  return true;
}

// Windows only offers Snap (drag to edges, Win+Arrow, Win+Z) to windows with a thick frame and a maximize box,
// and Electron drops the thick frame from transparent windows. So on Windows 11 22H2+ (build 22621, which has
// system backdrops) the window is opaque with an acrylic backdrop: the page background stays see-through and the
// OS draws a real frosted blur, rounded corners, and the snap behaviors. Older systems keep the transparent window
// (no snapping). WC_BACKDROP=none|acrylic|mica overrides the choice.
const WIN_BUILD = process.platform === 'win32' ? parseInt(String(os.release()).split('.')[2], 10) || 0 : 0;
const BACKDROP = ['none', 'acrylic', 'mica'].includes(process.env.WC_BACKDROP)
  ? process.env.WC_BACKDROP
  : (WIN_BUILD >= 22621 ? 'acrylic' : 'none');
const NATIVE_FRAME = BACKDROP !== 'none';
// Software compositing on the acrylic path: DWM draws the blur outside our processes and the map is a 2D canvas, so the
// GPU process only added memory (about 15 MB, 75 MB commit) and CPU. The transparent path (Windows 10, WC_BACKDROP=none)
// keeps the GPU: without it that path measured 2.4x the CPU. WC_GPU=1 turns the GPU back on (A/B runs, escape hatch).
if (NATIVE_FRAME && process.env.WC_GPU !== '1') app.disableHardwareAcceleration();

const isZone = (z) => { try { new Intl.DateTimeFormat('en-US', { timeZone: z }); return true; } catch { return false; } };
const isPlainObject = (v) => v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
// One zone's working hours. end < start is allowed (overnight shift); start === end is not.
const cleanHours = (h) => {
  if (!isPlainObject(h)) return undefined;
  const { start, end, days } = h;
  if (typeof start !== 'string' || typeof end !== 'string' || !HHMM.test(start) || !HHMM.test(end) || start === end) return undefined;
  if (!Array.isArray(days) || days.length < 1 || days.length > 7) return undefined;
  if (!days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) || new Set(days).size !== days.length) return undefined;
  return { start, end, days: [...days].sort((a, b) => a - b) };
};

// Validators for values the renderer may send. Returns the sanitized value or undefined to reject.
const VALIDATE = {
  zones: (v) => (Array.isArray(v) && v.every((z) => typeof z === 'string' && z.length < 64) ? [...new Set(v)].filter(isZone) : undefined),
  hour12: (v) => (typeof v === 'boolean' ? v : undefined),
  showSeconds: (v) => (typeof v === 'boolean' ? v : undefined),
  alwaysOnTop: (v) => (typeof v === 'boolean' ? v : undefined),
  // The Store build starts at login through its appx startup task, which only Windows Settings > Apps > Startup
  // controls, so the setting cannot be turned on there (read at call time: tests flip process.windowsStore).
  launchAtLogin: (v) => (typeof v === 'boolean' && !process.windowsStore ? v : undefined),
  firstRun: (v) => (typeof v === 'boolean' ? v : undefined),
  tipSeen: (v) => (typeof v === 'boolean' ? v : undefined),
  closeHintSeen: (v) => (typeof v === 'boolean' ? v : undefined),
  planner: (v) => (typeof v === 'boolean' ? v : undefined), // overlap planner view open; not a layout, never resizes
  // Background alpha (text stays opaque). At least 0.6: lower values let the desktop wash out the text.
  opacity: (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0.6, v)) : undefined),
  zoom: (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(ZOOM_MAX, Math.max(0, v)) * 10) / 10 : undefined),
  theme: (v) => (THEMES.has(v) ? v : undefined),
  layout: (v) => (typeof v === 'string' && Object.hasOwn(LAYOUT_SIZES, v) ? v : undefined),
  language: (v) => (LANGUAGES.has(v) ? v : undefined),
  // Empty label = use the city name, so empty strings are dropped rather than stored.
  labels: (v) => {
    if (!isPlainObject(v)) return undefined;
    const out = {};
    for (const [k, s] of Object.entries(v)) {
      // Drop bad entries individually so one stale zone doesn't wipe every label.
      if (k.length >= 64 || typeof s !== 'string' || !isZone(k)) continue;
      const t = s.trim();
      if (t && t.length <= 40) out[k] = t;
    }
    return out;
  },
  // Missing zone = renderer default 09:00-18:00 Mon-Fri. Bad entries are dropped individually.
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
  // Last user size per view key. Bad entries are dropped individually; sizes are clamped to the minimums here and
  // to the display work area when applied.
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

const store = createSettingsStore({
  dir: app.getPath('userData'),
  defaults: DEFAULTS,
  validate: VALIDATE,
  legacyDirs: LEGACY_USER_DATA_DIRS,
  appDataDir: app.getPath('appData'),
  skipMigration: !!process.env.WC_USER_DATA,
});
store.migrate();

let win = null;
let tray = null;
let quitting = false;
let settings = store.load();

const PANEL_MIN_W = 600, PANEL_MAX_W = 640, PANEL_MIN_H = 640;

// Single owner of window geometry.
// baseSize: the user's size for the current layout (never the panel's, a snapped or a maximized size).
// panelSaved: window position before the settings panel grew/shifted it.
// panelRect: size we gave the window for the panel. panelKeep: panel opened while snapped/maximized with room to
// spare, so the window was left alone. panelReturn: exact snapped rect to go back to when the panel closes.
// restore: last free resting bounds (position + baseSize); persisted while the window is snapped or maximized.
// loop: an OS move/size loop (user dragging the frame or a drag region) in progress, and whether it began snapped.
// wasArranged/fixSize: the window just left a snapped/maximized state; re-apply baseSize once it settles.
// fit: the planner's measured content size { key, width, height, keepWidth } in CSS px (window:fitView); keepWidth
// means width is only a minimum (the vertical planner keeps a wider window).
// overlay: 'map' | 'planner' | null, the overlay view shown over the layout. key: the view key baseSize belongs to
// (overlay if any, else the layout); switching key stores baseSize in settings.viewSizes[key] and applies the new one.
const geo = {
  baseSize: null,
  overlay: null,
  fit: null,
  key: null,
  panelOpen: false,
  panelSaved: null,
  panelRect: null,
  panelKeep: false,
  panelReturn: null,
  restore: null,
  loop: null,
  wasArranged: false,
  fixSize: false,
  dragOrigin: null,
  // Size the window has when nothing else (the OS) is arranging it.
  expected() { return this.panelOpen && this.panelRect ? this.panelRect : this.baseSize; },
  // Size the window should have right now.
  applied() {
    if (this.panelOpen && win && !win.isDestroyed()) { const b = win.getBounds(); return { width: b.width, height: b.height }; }
    return { ...this.baseSize };
  },
};

let saveTimer = null;
function saveSettings() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; store.write(settings); }, 250);
}
function flushSettings() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; store.write(settings); }
}

// First of the user's preferred Windows display languages that the app speaks (pt-PT, pt-BR -> pt; es-419, es-ES -> es).
// Chromium's own locale is limited to the packaged electronLanguages, so it would turn pt-PT or es-MX into English.
let systemLang = null;
function systemLanguage() {
  if (systemLang) return systemLang;
  let list = [];
  try { list = app.getPreferredSystemLanguages() || []; } catch { list = []; }
  try { list = [...list, app.getLocale()]; } catch { /* not ready */ }
  for (const l of list) {
    const s = String(l || '').toLowerCase();
    if (s.startsWith('pt')) { systemLang = 'pt'; break; }
    if (s.startsWith('es')) { systemLang = 'es'; break; }
    if (s.startsWith('en')) { systemLang = 'en'; break; }
  }
  return systemLang || 'en';
}

// The Windows Region format ('pt-BR' here while app.getLocale() is 'en-US'), for the first-run 12/24-hour choice. Tests
// pin it (WC_SMOKE: WC_SYSTEM_LOCALE or en-GB) so the suite runs the same on any machine; dev runs may set
// WC_SYSTEM_LOCALE. A custom short-time format set in Windows Region settings is not read.
function systemLocale() {
  if (!app.isPackaged && process.env.WC_SMOKE) return process.env.WC_SYSTEM_LOCALE || 'en-GB';
  if (!app.isPackaged && process.env.WC_SYSTEM_LOCALE) return process.env.WC_SYSTEM_LOCALE;
  try { return app.getSystemLocale() || ''; } catch { return ''; }
}

// Dates and times in the page follow the Windows Region format when it matches the app language (en-GB reads
// "Thu 24 Sept", en-US "Thu, Sep 24"; i18n.js setLang). Tests leave it empty (WC_SMOKE: WC_REGION_LOCALE when set), so
// the suite reads en-US dates on any machine; the first-run clock format above keeps its own pin.
function regionLocale() {
  if (!app.isPackaged && process.env.WC_SMOKE) return process.env.WC_REGION_LOCALE || '';
  return systemLocale();
}

const publicSettings = () => ({
  ...settings,
  version: app.getVersion(),
  portable: !!process.env.PORTABLE_EXECUTABLE_FILE,
  store: !!process.windowsStore,
  shortcut: '',
  backdrop: BACKDROP, // 'acrylic' | 'mica': the OS paints a frosted backdrop behind the see-through page; 'none': plain transparent window
  snap: NATIVE_FRAME, // Windows Snap/maximize available (window has a native thick frame)
  systemLanguage: systemLanguage(), // what language 'auto' resolves to: 'en' | 'pt' | 'es'
  systemLocale: regionLocale(), // Windows Region format ('en-GB', 'pt-PT'...), used for dates when it matches the language
});

// Only accept IPC from our own page: the window's main frame, showing app://owc/index.html (url-trust.js).
const trusted = (e) => {
  try {
    return !!win && !win.isDestroyed() && !!e.senderFrame && e.senderFrame === win.webContents.mainFrame
      && isAppUrl(e.senderFrame.url);
  } catch { return false; }
};

// True when at least a 40px margin of the bounds lands on a connected display.
function boundsVisible(b) {
  if (!b) return false;
  return screen.getAllDisplays().some(({ workArea: a }) =>
    b.x + 40 < a.x + a.width && b.x + b.width - 40 > a.x && b.y + 40 < a.y + a.height && b.y + b.height - 40 > a.y);
}

// Fit bounds inside the work area of the display they mostly sit on, respecting min sizes.
function clampToWorkArea(b) {
  const a = screen.getDisplayMatching(b).workArea;
  const width = Math.max(MIN_W, Math.min(b.width, a.width));
  const height = Math.max(MIN_H, Math.min(b.height, a.height));
  const x = Math.max(a.x, Math.min(b.x, a.x + a.width - width));
  const y = Math.max(a.y, Math.min(b.y, a.y + a.height - height));
  return { x, y, width, height };
}

// Single entry point for programmatic window geometry. At fractional display scaling (115%, 125%, ...) Windows
// converts DIP bounds to device pixels with a rounding step that leaves the window 1 DIP up/left and 2 DIP larger
// than asked (the constructor even lands 6x5 larger). Uncorrected, every stored size came back a little bigger and
// grew on each round trip. So: ask, read back, and correct once by the difference; the correction is remembered so
// later calls are exact on the first try. Only small differences are treated as rounding; a bigger one is the OS
// enforcing something (minimum size, snapping) and is left alone. `verify` false skips the read-back (window drags).
const fit = { x: 0, y: 0, w: 0, h: 0 };
const FIT_MAX = 8;
function placeWindow(b, verify = true) {
  if (!win || win.isDestroyed()) return;
  const t = { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) };
  const ask = () => win.setBounds({ x: t.x - fit.x, y: t.y - fit.y, width: t.width - fit.w, height: t.height - fit.h });
  ask();
  if (!verify) return;
  const g = win.getBounds();
  const d = { x: g.x - t.x, y: g.y - t.y, w: g.width - t.width, h: g.height - t.height };
  if (!d.x && !d.y && !d.w && !d.h) return;
  if (Math.max(Math.abs(d.x), Math.abs(d.y), Math.abs(d.w), Math.abs(d.h)) > FIT_MAX) return;
  const learn = (k, v, ok) => { if (ok) fit[k] = Math.max(-FIT_MAX, Math.min(FIT_MAX, fit[k] + v)); };
  learn('x', d.x, true); learn('y', d.y, true);
  // At the minimum size the OS clamps the request, so the difference says nothing about rounding there.
  learn('w', d.w, t.width > MIN_W + FIT_MAX); learn('h', d.h, t.height > MIN_H + FIT_MAX);
  ask();
  // The rounding is not the same at every position and size (Electron 44 at 114.6% lands 1159 -> 1161 but 1158 -> 1160),
  // so a single learned correction can still be 1 DIP off. Nudge each dimension that is still off by its remaining
  // difference, once, keeping the nudge only if it lands closer (these per-position nudges are not learned). Some
  // sizes cannot be reached at all at a given position; then the closest one stays.
  const off = (r) => {
    const n = win.getBounds();
    return { d: { x: n.x - t.x, y: n.y - t.y, width: n.width - t.width, height: n.height - t.height }, r };
  };
  const cost = (o) => Math.abs(o.d.x) + Math.abs(o.d.y) + Math.abs(o.d.width) + Math.abs(o.d.height);
  let best = off({ x: t.x - fit.x, y: t.y - fit.y, width: t.width - fit.w, height: t.height - fit.h });
  for (const k of ['width', 'height', 'x', 'y']) {
    const v = best.d[k];
    if (!v || Math.abs(v) > 2) continue;
    const r = { ...best.r, [k]: best.r[k] - v };
    win.setBounds(r);
    const o = off(r);
    if (cost(o) < cost(best)) best = o;
    else win.setBounds(best.r);
  }
}

// Panel geometry for a window whose resting size is `base` at position `pos`.
function panelBounds(base, pos) {
  const a = screen.getDisplayMatching({ ...pos, ...base }).workArea;
  const z = zf(), minW = Math.round(PANEL_MIN_W * z), maxW = Math.round(PANEL_MAX_W * z), minH = Math.round(PANEL_MIN_H * z);
  const want = base.width > maxW ? base.width : Math.min(Math.max(base.width, minW), maxW);
  const width = Math.min(want, a.width);
  const height = Math.min(Math.max(base.height, minH), a.height);
  return clampToWorkArea({ x: pos.x, y: pos.y, width, height });
}

// Manual resize: only a resting-size resize updates baseSize.
const measure = () => {
  if (geo.panelOpen || !win || win.isDestroyed() || win.isMaximized()) return;
  // A size loop that started snapped is Windows restoring the window as it is dragged off an edge, not a user resize.
  if (geo.loop ? geo.loop.fromArranged : arranged()) return;
  const b = win.getBounds(), cur = geo.baseSize;
  geo.wasArranged = false;
  // Windows reports frameless transparent windows 1-2px larger after programmatic moves at scaled DPI.
  // Treat that as rounding noise; only a real user resize changes the saved size.
  if (cur && Math.abs(b.width - cur.width) <= 2 && Math.abs(b.height - cur.height) <= 2) return;
  geo.baseSize = { width: b.width, height: b.height };
  rememberSize(geo.key || viewKey(), geo.baseSize); // this view comes back at this size
};

// ---------- per-view sizes ----------
// viewSizes are stored at 100% zoom (CSS px); the window gets them times the zoom factor, so a view keeps its layout at
// every zoom level. At zoom 0 the factor is exactly 1 (stored size = window size).
const zf = () => (settings.zoom ? 1.2 ** settings.zoom : 1);
const scaled = (s) => (s ? { width: Math.round(s.width * zf()), height: Math.round(s.height * zf()) } : s);
const viewKey = () => (geo.overlay ? geo.overlay + (settings.layout === 'vertical' ? 'Vertical' : '') : settings.layout);

// Record `size` (window DIP) as the last size of view `key` (persisted with the other settings, at 100% zoom).
function rememberSize(key, size) {
  if (!VIEW_KEYS.includes(key) || PLANNER_KEYS.includes(key) || !size) return;
  const s = {
    width: Math.min(MAX_DIM, Math.max(MIN_W, Math.round(size.width / zf()))),
    height: Math.min(MAX_DIM, Math.max(MIN_H, Math.round(size.height / zf()))),
  };
  const cur = settings.viewSizes[key];
  if (cur && cur.width === s.width && cur.height === s.height) return;
  settings.viewSizes = { ...settings.viewSizes, [key]: s };
  saveSettings();
}

// Size a view gets the first time (nothing stored), in window DIP. `cur` is the size of the view being left.
function defaultSize(key, cur) {
  if (Object.hasOwn(LAYOUT_SIZES, key)) return scaled(LAYOUT_SIZES[key]);
  const z = zf(), c = cur || scaled(LAYOUT_SIZES.strip);
  const at = (n) => Math.round(n * z);
  const rows = Math.max(1, settings.zones.length);
  if (key === 'map') return { width: Math.max(c.width, at(1160)), height: Math.max(c.height, at(360)) };
  // vertical map: same column, at least the default vertical height (the world scrolls sideways)
  if (key === 'mapVertical') return { width: c.width, height: Math.max(c.height, at(LAYOUT_SIZES.vertical.height)) };
  // The planner sizes are only a first guess until the renderer sends the measured content size (plannerSize).
  // vertical: 250 = top bar, padding and a three-line head, plus 57 per city (name row, hour cells, gaps).
  if (key === 'plannerVertical') return { width: c.width, height: at(Math.min(760, 250 + rows * 57)) };
  return { width: c.width, height: at(Math.min(520, 112 + rows * 30)) };
}

// Window size (DIP) of a planner view: the measured content size once the renderer has sent it, else the guess.
function plannerSize(key, cur) {
  const f = geo.fit;
  if (!f || f.key !== key) return defaultSize(key, cur);
  const c = cur || scaled(LAYOUT_SIZES[settings.layout]), w = Math.round(f.width * zf());
  return { width: f.keepWidth ? Math.max(c.width, w) : w, height: Math.round(f.height * zf()) };
}

// Compact never opens taller than COMPACT_MAX_H (a taller compact window only adds empty space around the cards).
const capView = (key, s) => (key === 'compact' && s ? { ...s, height: Math.min(s.height, Math.round(COMPACT_MAX_H * zf())) } : s);
const sizeFor = (key, cur) => capView(key, PLANNER_KEYS.includes(key) ? plannerSize(key, cur) : settings.viewSizes[key] ? scaled(settings.viewSizes[key]) : defaultSize(key, cur));

// The view key changed (layout switch, map or planner opened/closed): keep the size of the view being left and give
// the window the new view's size, anchored at its top-left. resizeTo defers it while the panel is open or the
// window is snapped/maximized.
function applyView() {
  const key = viewKey();
  if (key === geo.key) return;
  // A user resize already stored its view's size (measure); only a view that never had one keeps its current size
  // here. Re-storing baseSize every time would save work-area clamped sizes (e.g. a big view at 200% zoom).
  if (geo.key && geo.baseSize && !settings.viewSizes[geo.key]) rememberSize(geo.key, geo.baseSize);
  geo.key = key;
  geo.fit = null; // a planner is measured again each time it opens
  resizeTo(sizeFor(key, geo.baseSize));
}

const sameSize = (a, b) => !!a && !!b && Math.abs(a.width - b.width) <= 2 && Math.abs(a.height - b.height) <= 2;

// True while Windows arranges the window: maximized, or snapped (Win+Arrow, edge drag, Snap Layouts). Electron has
// no snapped flag (getNormalBounds returns the snapped rect), so a window counts as snapped when its size is not the
// one we gave it and it is flush with at least two edges of the work area.
function arranged() {
  if (!win || win.isDestroyed()) return false;
  if (win.isMaximized()) return true;
  if (!NATIVE_FRAME) return false;
  const b = win.getBounds();
  if (sameSize(b, geo.expected())) return false;
  const a = screen.getDisplayMatching(b).workArea, t = 12;
  const edges = [
    Math.abs(b.x - a.x) <= t,
    Math.abs(b.y - a.y) <= t,
    Math.abs(b.x + b.width - (a.x + a.width)) <= t,
    Math.abs(b.y + b.height - (a.y + a.height)) <= t,
  ].filter(Boolean).length;
  return edges >= 2;
}

// Leave maximized before moving/resizing ourselves: setBounds is ignored while maximized. A snapped window takes
// setBounds directly (it simply stops being snapped).
function leaveMaximized() {
  if (win && !win.isDestroyed() && win.isMaximized()) win.unmaximize();
}

function setPanelBounds(nb) {
  geo.panelRect = { width: nb.width, height: nb.height };
  placeWindow(nb);
}

function initialBounds() {
  // Start at the stored size of the starting view: the saved bounds may carry another view's size (e.g. the map was
  // open at quit; the map is not restored on launch).
  const k = viewKey();
  const size = capView(k, PLANNER_KEYS.includes(k) ? defaultSize(k, scaled(settings.viewSizes[settings.layout] || LAYOUT_SIZES[settings.layout])) : scaled(settings.viewSizes[k]));
  if (boundsVisible(settings.bounds)) return clampToWorkArea({ ...settings.bounds, ...size });
  const a = screen.getPrimaryDisplay().workArea;
  return clampToWorkArea({ x: a.x + 60, y: a.y + 60, ...(size || scaled(LAYOUT_SIZES[settings.layout])) });
}

function createWindow() {
  geo.overlay = settings.planner ? 'planner' : null;
  geo.key = viewKey();
  const start = initialBounds();
  geo.baseSize = { width: start.width, height: start.height };
  geo.restore = { ...start };
  if (NATIVE_FRAME) nativeTheme.themeSource = settings.theme; // the acrylic tint follows the app theme, not only the OS
  win = new BrowserWindow({
    ...start,
    minWidth: MIN_W,
    minHeight: MIN_H,
    frame: false,
    fullscreenable: false,
    ...(NATIVE_FRAME
      // Opaque window + system backdrop: keeps the thick frame and maximize box that Windows Snap needs.
      ? { transparent: false, thickFrame: true, maximizable: true, backgroundColor: '#00000000', backgroundMaterial: BACKDROP }
      : { transparent: true, maximizable: false }),
    alwaysOnTop: settings.alwaysOnTop,
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      devTools: !app.isPackaged, // no DevTools in installed builds
    },
  });
  if (settings.alwaysOnTop) win.setAlwaysOnTop(true, 'floating');
  placeWindow(start); // the constructor lands a few DIP off at fractional scaling; correct it before anything measures
  win.loadURL(APP_INDEX);

  // Track leaving a snapped/maximized state (Win+Down, drag off an edge, restore).
  const track = () => {
    const a = arranged();
    if (geo.wasArranged && !a) geo.fixSize = true;
    geo.wasArranged = a;
  };
  win.on('resized', measure);
  win.on('move', track);
  win.on('resize', track);
  win.on('move', persistBounds);
  win.on('resize', persistBounds);
  win.on('maximize', persistBounds);
  win.on('unmaximize', persistBounds);
  // Launch at login may have been changed in Task Manager or Windows Settings while the app ran.
  win.on('focus', reconcileLoginItem);
  // OS move/size loop (drag region, frame edges, Alt+Space move). 'resized'/'moved' fire inside the exit message,
  // so the loop flag is cleared on the next tick, after measure() has seen it.
  const WM_ENTERSIZEMOVE = 0x0231, WM_EXITSIZEMOVE = 0x0232;
  if (process.platform === 'win32' && typeof win.hookWindowMessage === 'function') {
    win.hookWindowMessage(WM_ENTERSIZEMOVE, () => { geo.loop = { fromArranged: arranged() }; });
    win.hookWindowMessage(WM_EXITSIZEMOVE, () => { setTimeout(() => { geo.loop = null; persistBounds(); }, 0); });
  }
  // Closing the window hides to tray; quitting goes through the tray menu or OS shutdown.
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      hideToTray();
    }
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  // Page zoom: there is no app menu (and so no zoom accelerators), so the keys are handled here. Applied on every load.
  win.webContents.on('did-finish-load', applyZoomLevel);
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown' || !(input.control || input.meta) || input.alt) return;
    const k = input.key, c = input.code, cur = settings.zoom || 0;
    let next;
    if (k === '+' || k === '=' || c === 'Equal' || c === 'NumpadAdd') next = zoomStep(cur, 1);
    else if (k === '-' || k === '_' || c === 'Minus' || c === 'NumpadSubtract') next = zoomStep(cur, -1);
    else if (k === '0' || c === 'Digit0' || c === 'Numpad0') next = 0;
    else return;
    e.preventDefault();
    updateSettings({ zoom: next });
  });
  // Ctrl+wheel and touchpad pinch requests (Electron does not zoom on its own): the same 0.5 steps.
  win.webContents.on('zoom-changed', (_e, dir) => updateSettings({ zoom: zoomStep(settings.zoom || 0, dir === 'in' ? 1 : -1) }));
  // The map is renderer-only state: a reloaded page starts with it closed, so drop a stale 'map' overlay.
  // A (re)loading page starts with the settings panel closed and no map (renderer-only state): undo the panel's
  // window geometry and drop a stale 'map' overlay, so the window never stays at the panel's or the map's size.
  win.webContents.on('did-start-loading', () => {
    endPanel();
    geo.dragOrigin = null;
    if (geo.overlay !== 'map') return;
    geo.overlay = settings.planner ? 'planner' : null;
    applyView();
  });
  // A crashed or hung page would leave a dead window on screen: reload it (with a backoff, see scheduleReload).
  win.webContents.on('render-process-gone', (_e, details) => {
    if (quitting || !details || details.reason === 'clean-exit') return;
    scheduleReload();
  });
  // A page hung for 10 s is crashed on purpose; render-process-gone then reloads it.
  let hangTimer = null;
  win.on('unresponsive', () => {
    clearTimeout(hangTimer);
    hangTimer = setTimeout(() => {
      hangTimer = null;
      if (!win || win.isDestroyed() || quitting) return;
      try { win.webContents.forcefullyCrashRenderer(); } catch { scheduleReload(); }
    }, 10000);
  });
  win.on('responsive', () => { clearTimeout(hangTimer); hangTimer = null; });
  // Windows shutdown/logoff does not always run before-quit/will-quit: save now.
  const sessionEnd = () => { quitting = true; captureBounds(true); flushSettings(); };
  win.on('session-end', sessionEnd);
  win.on('query-session-end', () => { captureBounds(true); flushSettings(); });
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url);
    return { action: 'deny' };
  });
}

// Where the window returns to, saved with the settings: never the panel geometry, a snapped rect or the maximized size.
// persistBounds debounces it (300 ms) while the window moves; captureBounds(true) saves it at once, before the window
// hides to the tray and at quit or session end, so a move made just before either is not lost with the timer.
let boundsTimer = null;
function captureBounds(force) {
  clearTimeout(boundsTimer); boundsTimer = null;
  if (!win || win.isDestroyed() || win.isMinimized() || (!force && !win.isVisible())) return;
  const isArranged = arranged();
  // Just left a snapped/maximized state at a size that is not the user's (e.g. the layout changed meanwhile):
  // put the user's size back once the OS is done. Not while hiding or quitting.
  if (!force && geo.fixSize && !geo.loop && !geo.panelOpen && !isArranged) {
    const b = win.getBounds();
    if (!sameSize(b, geo.baseSize)) placeWindow(clampToWorkArea({ x: b.x, y: b.y, ...geo.baseSize }));
  }
  if (!force && !geo.loop) geo.fixSize = false;
  if (!isArranged && !geo.panelOpen) {
    const b = win.getBounds();
    geo.restore = { x: b.x, y: b.y, ...geo.baseSize };
  } else if (geo.panelOpen && geo.panelSaved && !geo.panelKeep && !geo.panelReturn) {
    geo.restore = { ...geo.panelSaved, ...geo.baseSize };
  }
  if (!geo.restore || !geo.baseSize) return;
  const next = { x: geo.restore.x, y: geo.restore.y, ...geo.baseSize };
  if (JSON.stringify(next) === JSON.stringify(settings.bounds)) return;
  settings.bounds = next;
  saveSettings();
}
function persistBounds() {
  clearTimeout(boundsTimer);
  boundsTimer = setTimeout(() => captureBounds(false), 300);
}

// Crash recovery: one pending reload at a time, after a growing delay (500 ms, 1 s, 2 s, 4 s, 8 s). After 5 crashes in
// 2 minutes the page is left as it is (a page that crashes on every load would otherwise reload in a loop); showing
// the window from the tray or launching the app again clears that history and tries again.
const reloadGuard = createReloadGuard({ max: 5, windowMs: 120000 });
let reloadTimer = null, reloadStopped = false;
function scheduleReload() {
  if (reloadTimer || quitting || !win || win.isDestroyed()) return;
  const delay = reloadGuard.next(Date.now());
  if (delay === null) {
    if (!reloadStopped) console.error('The page crashed 6 times in 2 minutes; not reloading it until the window is shown again.');
    reloadStopped = true;
    return;
  }
  reloadTimer = setTimeout(() => {
    reloadTimer = null;
    if (win && !win.isDestroyed() && !quitting) win.webContents.reload();
  }, delay);
}
// Tray Show/Hide or a second launch: the user wants the clock, so a page the backoff gave up on gets one more try.
function retryStoppedReload() {
  if (!reloadStopped) return;
  reloadStopped = false;
  reloadGuard.reset();
  scheduleReload();
}

// Keep the window on a connected display after monitors are unplugged, added, or rescaled.
function ensureOnScreen(remeasure) {
  if (!win || win.isDestroyed()) return;
  if (win.isMaximized()) return; // Windows keeps a maximized window on a live display itself
  if (remeasure) measure(); // no-op while the panel is open or snapped, so baseSize never takes those sizes
  if (boundsVisible(win.getBounds())) return;
  const a = screen.getPrimaryDisplay().workArea;
  if (geo.panelOpen) {
    geo.panelSaved = { x: a.x + 40, y: a.y + 40 };
    geo.panelKeep = false; geo.panelReturn = null;
    setPanelBounds(panelBounds(geo.baseSize, geo.panelSaved));
  } else {
    placeWindow(clampToWorkArea({ x: a.x + 40, y: a.y + 40, ...geo.baseSize }));
  }
}

function applyZoomLevel() {
  if (win && !win.isDestroyed()) win.webContents.setZoomLevel(settings.zoom || 0);
}

// View change (layout, map, planner): while the panel is open, or while Windows has the window snapped/maximized, only record the new
// size. It is applied when the panel closes, or by fixSize when the window leaves the snapped/maximized state.
function resizeTo(size) {
  const wasArranged = !!win && !win.isDestroyed() && !geo.panelOpen && arranged(); // judged against the old size
  geo.baseSize = { ...size };
  if (!win || win.isDestroyed() || geo.panelOpen) return;
  if (wasArranged) { geo.wasArranged = true; return; }
  const b = win.getBounds();
  const c = clampToWorkArea({ x: b.x, y: b.y, ...size });
  placeWindow(c);
  // The work area capped it (a big view, or a high zoom): that is the size the window rests at. Keeping the uncapped
  // size would make a window flush with both screen edges look snapped (arranged()) and block the next resize.
  if (c.width !== size.width || c.height !== size.height) geo.baseSize = { width: c.width, height: c.height };
}

function resetPosition() {
  if (!win || win.isDestroyed()) return;
  leaveMaximized();
  const a = screen.getPrimaryDisplay().workArea;
  const pos = { x: a.x + 60, y: a.y + 60 };
  // Back to the current view's default size (overlay defaults are derived from the layout's size).
  const key = viewKey();
  geo.key = key;
  geo.baseSize = defaultSize(key, scaled(settings.viewSizes[settings.layout] || LAYOUT_SIZES[settings.layout]));
  rememberSize(key, geo.baseSize);
  geo.restore = { ...pos, ...geo.baseSize };
  geo.wasArranged = false; geo.fixSize = false;
  if (geo.panelOpen) {
    geo.panelSaved = pos;
    geo.panelKeep = false; geo.panelReturn = null;
    setPanelBounds(panelBounds(geo.baseSize, pos));
  } else {
    placeWindow(clampToWorkArea({ ...pos, ...geo.baseSize }));
  }
  win.show();
}

const TRAY_STRINGS = {
  en: { tooltip: 'Open World Clock', showHide: 'Show / Hide', pin: 'Pin above all windows', login: 'Launch at login', loginStore: 'Launch at login: Windows Settings > Apps > Startup', reset: 'Reset position', kofi: 'Support on Ko-fi', quit: 'Quit', closeHintTitle: 'Open World Clock is still running', closeHintText: 'It lives in the tray. Click the clock icon to bring it back, or right-click it and choose Quit.' },
  pt: { tooltip: 'Open World Clock', showHide: 'Mostrar / Ocultar', pin: 'Fixar por cima de todas as janelas', login: 'Iniciar com o Windows', loginStore: 'Iniciar com o Windows: Configurações > Aplicativos > Inicialização', reset: 'Redefinir posição', kofi: 'Apoiar no Ko-fi', quit: 'Sair', closeHintTitle: 'O Open World Clock continua aberto', closeHintText: 'Ele continua na bandeja do sistema. Clique no ícone do relógio para abrir de novo, ou clique nele com o botão direito e escolha Sair.' },
  es: { tooltip: 'Open World Clock', showHide: 'Mostrar / Ocultar', pin: 'Siempre visible', login: 'Iniciar con Windows', loginStore: 'Iniciar con Windows: Configuración > Aplicaciones > Inicio', reset: 'Restablecer posición', kofi: 'Apoyar en Ko-fi', quit: 'Salir', closeHintTitle: 'Open World Clock sigue abierto', closeHintText: 'Sigue en la bandeja del sistema. Haz clic en el ícono del reloj para volver a abrirlo, o haz clic derecho en él y elige Salir.' },
};
function resolvedLanguage() {
  return settings.language !== 'auto' ? settings.language : systemLanguage();
}

function buildTrayMenu() {
  const t = TRAY_STRINGS[resolvedLanguage()] || TRAY_STRINGS.en;
  return Menu.buildFromTemplate([
    { label: t.showHide, click: toggleWindow },
    { type: 'separator' },
    { label: t.pin, type: 'checkbox', checked: settings.alwaysOnTop, click: (item) => updateSettings({ alwaysOnTop: item.checked }) },
    // Store builds start at login through the appx startup task, managed in Windows Settings > Apps > Startup.
    process.windowsStore
      ? { label: t.loginStore, enabled: false }
      : { label: t.login, type: 'checkbox', checked: settings.launchAtLogin, click: (item) => updateSettings({ launchAtLogin: item.checked }) },
    { type: 'separator' },
    { label: t.reset, click: resetPosition },
    { type: 'separator' },
    // Store policy restricts external payment links: the Store build has no Ko-fi item.
    ...(process.windowsStore ? [] : [{ id: 'kofi', label: t.kofi, click: () => openExternalSafe(KOFI_URL) }, { type: 'separator' }]),
    { label: t.quit, click: quit },
  ]);
}

// Tray tooltip: the product name, then one line per city with its current time ('Lisbon 17:37', or '5:37 PM' with the
// 12-hour clock), cut to the 127 characters Windows shows. The renderer sends the card names (tray:names) when the
// cities, their labels or the language change; the times are formatted here, on hover.
const TRAY_TIP_MAX = 127;
let trayNames = [], trayTipAt = 0;
const trayFormatters = new Map();
function trayTime(zone, ms, h12) {
  const key = zone + (h12 ? '|12' : '|24');
  let f = trayFormatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(h12 ? 'en-US' : 'en-GB', h12 ? { timeZone: zone, hour: 'numeric', minute: '2-digit', hour12: true }
      : { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    trayFormatters.set(key, f);
  }
  return f.format(ms);
}
function trayTooltip(ms = Date.now()) {
  const t = TRAY_STRINGS[resolvedLanguage()] || TRAY_STRINGS.en;
  let tip = t.tooltip;
  for (const [zone, name] of trayNames) {
    let line;
    try { line = `${name} ${trayTime(zone, ms, !!settings.hour12)}`; } catch { continue; }
    if (tip.length + 1 + line.length > TRAY_TIP_MAX) break;
    tip += '\n' + line;
  }
  return tip;
}
// Tooltip and menu follow the app language.
function refreshTray() {
  if (!tray) return;
  trayTipAt = 0;
  tray.setToolTip(trayTooltip());
  tray.setContextMenu(buildTrayMenu());
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'icon.ico')));
  refreshTray();
  tray.on('click', toggleWindow);
  // Registered once here (not per close), so repeated hides never add listeners.
  tray.on('balloon-show', onCloseHintShown);
  tray.on('balloon-click', onCloseHintShown);
  tray.on('balloon-closed', () => { hintPending = false; });
  // Hovering the icon shows the cities and their times. Built on hover (at most every 5 s), so there is no timer.
  tray.on('mouse-move', () => {
    const now = Date.now();
    if (now - trayTipAt < 5000) return;
    trayTipAt = now;
    tray.setToolTip(trayTooltip(now));
  });
}

function toggleWindow() {
  if (!win) return;
  retryStoppedReload();
  if (win.isVisible()) win.hide();
  else { win.show(); win.focus(); }
}

// Closing (the X button, Alt+F4, the taskbar) keeps the app running in the tray. The first time, a tray
// notification says so, because a clock that vanishes looks like it quit.
// closeHintSeen is set only once Windows really showed the notification (balloon-show) or it was clicked: with Focus
// assist or Do not disturb on, Windows drops it, and the hint is tried again on a later close (at most 3 times a session).
let hintPending = false, hintTries = 0, hintTimer = null;
function hideToTray() {
  if (!win) return;
  captureBounds(true);
  win.hide();
  if (settings.closeHintSeen || hintPending || hintTries >= 3 || !tray || process.platform !== 'win32' || process.env.WC_SMOKE) return;
  const t = TRAY_STRINGS[resolvedLanguage()] || TRAY_STRINGS.en;
  hintTries++;
  hintPending = true;
  // A notification Windows dropped may not report balloon-closed either: stop waiting after 15 s so a later close can
  // try again (balloon-show, when Windows really shows it, comes well before that).
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => { hintPending = false; }, 15000);
  try { tray.displayBalloon({ iconType: 'info', title: t.closeHintTitle, content: t.closeHintText }); } catch { hintPending = false; }
}
function onCloseHintShown() {
  if (!hintPending) return;
  hintPending = false;
  if (!settings.closeHintSeen) updateSettings({ closeHintSeen: true });
}


function quit() {
  quitting = true;
  app.quit();
}

// The exe Windows should start: the portable exe unpacks to a temp folder on every run, so register the launcher
// itself, not the unpacked binary.
const loginExe = () => process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;

function applyLoginItem(enabled) {
  // setLoginItemSettings does nothing in MSIX packages; the Store build uses the appx startup task.
  if (process.windowsStore) return;
  const exe = loginExe();
  try {
    // Ticking the box is a direct user action, so it also turns the entry back on in Task Manager > Startup apps.
    app.setLoginItemSettings(enabled ? { openAtLogin: true, path: exe, enabled: true } : { openAtLogin: false, path: exe });
  } catch (e) {
    console.error('Could not update login item:', e.message);
  }
}

// Exe names older versions installed in the same folder (the product was renamed twice). Electron only lists the Run
// entries whose program matches the path it is asked about, so an entry left by an upgrade is found by asking for these.
const LEGACY_EXE_NAMES = ['World Clock.exe', 'Free World Clock.exe'];
// Versions before v1.2.0 had no AppUserModelId, so Electron named their Run entry after the product.
const LEGACY_LOGIN_NAMES = ['electron.app.World Clock', 'electron.app.Free World Clock'];
function findLoginItem(exe) {
  const found = [];
  for (const p of [exe, ...LEGACY_EXE_NAMES.map((n) => path.join(path.dirname(exe), n))]) {
    // Electron matches the Run value's program as a command line: an unquoted path with spaces (what it writes) only
    // matches an unquoted lookup, a quoted value only a quoted one.
    for (const q of [p, `"${p}"`]) {
      try { found.push(...(app.getLoginItemSettings({ path: q }).launchItems || [])); } catch { /* not listed */ }
    }
  }
  for (const name of [APP_ID, ...LEGACY_LOGIN_NAMES]) {
    const item = found.find((i) => i && i.name === name);
    if (item) return item;
  }
  return null;
}

// Launch at login follows Windows both ways (see login-item.js). Runs at startup and whenever the window gets focus, so
// the checkbox catches a change made in Task Manager or Settings while the app runs: turned off there, the switch goes
// off; turned back on there, it goes on. Neither writes the registry: only ticking the box does that.
function reconcileLoginItem() {
  if (!app.isPackaged || process.windowsStore || process.platform !== 'win32') return;
  const exe = loginExe();
  const item = findLoginItem(exe);
  const action = loginItemAction({ want: settings.launchAtLogin, item, exe });
  if (action === 'settingOff' || action === 'settingOn') {
    settings.launchAtLogin = action === 'settingOn';
    saveSettings();
    refreshTray();
    if (win && !win.isDestroyed()) win.webContents.send('settings:changed', publicSettings());
  } else if (action === 'rewrite') {
    // The Run entry is keyed by the AppUserModelId, so after an upgrade that renamed the exe (World Clock.exe ->
    // Open World Clock.exe) it still points at the deleted file: register the current exe.
    try {
      app.setLoginItemSettings({ openAtLogin: true, path: exe, enabled: true });
      // An entry from before v1.2.0 has its own name: drop it, it starts the replaced exe.
      if (LEGACY_LOGIN_NAMES.includes(item.name)) app.setLoginItemSettings({ openAtLogin: false, path: item.path, name: item.name });
    } catch (e) { console.error('Could not update login item:', e.message); }
  }
}

// Validate, apply side effects, persist once, and broadcast once. `sender` is skipped in the broadcast.
function updateSettings(patch, sender) {
  const changed = {};
  for (const [k, v] of Object.entries(isPlainObject(patch) ? patch : {})) {
    if (!Object.hasOwn(VALIDATE, k) || MAIN_OWNED.has(k)) continue;
    const clean = VALIDATE[k](v);
    if (clean !== undefined && JSON.stringify(clean) !== JSON.stringify(settings[k])) changed[k] = clean;
  }
  if (!Object.keys(changed).length) return settings;
  // Zoom: a view with no stored size keeps its current one (recorded at the old zoom), so it comes back at the same
  // layout size once scaled by the new factor.
  const zoomed = 'zoom' in changed;
  if (zoomed && geo.key && geo.baseSize && !geo.panelOpen && !arranged() && !settings.viewSizes[geo.key]) rememberSize(geo.key, geo.baseSize);
  Object.assign(settings, changed);
  if ('alwaysOnTop' in changed && win) win.setAlwaysOnTop(changed.alwaysOnTop, 'floating');
  if ('theme' in changed && NATIVE_FRAME) nativeTheme.themeSource = changed.theme;
  if ('launchAtLogin' in changed) applyLoginItem(changed.launchAtLogin);
  // The planner is an overlay view; window:view usually switched it already (then applyView is a no-op).
  if ('planner' in changed) {
    if (changed.planner) geo.overlay = 'planner';
    else if (geo.overlay === 'planner') geo.overlay = null;
  }
  // Picking a layout means "show me that layout": it closes the map or planner, so the window takes the new
  // layout's own size instead of keeping an overlay size made for another layout.
  if ('layout' in changed && geo.overlay && !changed.planner) {
    geo.overlay = null;
    if (settings.planner) { settings.planner = false; changed.planner = false; }
  }
  if ('layout' in changed || 'planner' in changed) applyView();
  if (zoomed) {
    applyZoomLevel();
    if (geo.key) resizeTo(sizeFor(geo.key, geo.baseSize)); // same layout room in CSS px at the new zoom
    if (geo.panelOpen && geo.panelSaved && !geo.panelKeep && !geo.panelReturn) setPanelBounds(panelBounds(geo.baseSize, geo.panelSaved));
  }
  saveSettings();
  refreshTray();
  if (win && !win.isDestroyed() && win.webContents !== sender) win.webContents.send('settings:changed', publicSettings());
  return settings;
}

// testFailGets: dev test hook only (global.__wcTest.failSettingsGet, WC_SMOKE runs), to exercise the renderer's retry.
let testFailGets = 0;
ipcMain.handle('settings:get', (e) => {
  if (testFailGets > 0) { testFailGets--; return null; }
  return trusted(e) ? publicSettings() : null;
});
// Card names for the tray tooltip: a plain object { zone: name }, at most 50 valid zones, names up to 40 characters.
ipcMain.on('tray:names', (e, names) => {
  if (!trusted(e) || !isPlainObject(names)) return;
  const entries = Object.entries(names);
  if (entries.length > 50) return;
  if (!entries.every(([z, n]) => z.length < 64 && isZone(z) && typeof n === 'string' && n.length > 0 && n.length <= 40)) return;
  trayNames = entries;
  if (tray) { trayTipAt = 0; tray.setToolTip(trayTooltip()); }
});
ipcMain.handle('settings:set', (e, patch) => {
  if (!trusted(e)) return null;
  updateSettings(patch, e.sender);
  return publicSettings();
});
// Plain text, or { text, rows: [[city, time, date], ...] } for "Copy times": main builds the escaped HTML table itself
// (share-format.js htmlTable), so Outlook and Teams paste a table and the page never sends HTML.
ipcMain.handle('clipboard:write', async (e, data) => {
  if (!trusted(e)) return false;
  const text = typeof data === 'string' ? data : isPlainObject(data) ? data.text : null;
  if (typeof text !== 'string' || text.length > 5000) return false;
  let html = null;
  if (typeof data !== 'string') {
    html = htmlTable(text.split('\n')[0], data.rows);
    if (!html) return false;
  }
  // Electron 44: Promise-based, and write() takes W3C-style ClipboardItems (both formats land in one atomic write).
  try { await (html ? clipboard.write([new ClipboardItem({ 'text/plain': text, 'text/html': html })]) : clipboard.writeText(text)); return true; } catch { return false; }
});
// Calendar invite: { startMs, endMs, title, description } checked again here (share-format.js), then a save dialog
// (the user picks the file, so the Store build needs no extra capability) and one file write. Resolves 'saved',
// 'canceled' or false.
let testSaveDialog = null; // dev test hook only (global.__wcTest.stubSaveDialog, WC_SMOKE runs)
ipcMain.handle('ics:save', async (e, req) => {
  if (!trusted(e) || !win || !validIcsRequest(req)) return false;
  const ics = buildIcs(req, { uid: crypto.randomUUID(), now: Date.now() });
  if (!ics) return false;
  let downloads = '';
  try { downloads = app.getPath('downloads'); } catch { downloads = app.getPath('home'); }
  try {
    const opts = { defaultPath: path.join(downloads, 'meeting.ics'), filters: [{ name: 'Calendar', extensions: ['ics'] }] };
    const r = await (testSaveDialog ? testSaveDialog(opts) : dialog.showSaveDialog(win, opts));
    if (!r || r.canceled || !r.filePath) return 'canceled';
    await fs.promises.writeFile(r.filePath, ics, 'utf8');
    return 'saved';
  } catch (err) {
    console.error('world-clock: could not save the invite', err);
    return false;
  }
});
// Move with setBounds and the size captured at drag start: setPosition on a transparent frameless window
// grows it by a pixel per move at non-100% display scaling (Electron bug).
ipcMain.on('window:dragStart', (e) => {
  if (!trusted(e) || !win) return;
  let b = win.getBounds();
  // Dragging a snapped/maximized window: like Windows, drop back to the user's size under the cursor.
  if (!geo.panelOpen && arranged()) {
    leaveMaximized();
    const c = screen.getCursorScreenPoint(), size = { ...geo.baseSize };
    const fx = b.width ? (c.x - b.x) / b.width : 0.5;
    b = { x: Math.round(c.x - fx * size.width), y: Math.round(c.y - Math.min(c.y - b.y, size.height / 2)), ...size };
    placeWindow(b);
    geo.dragOrigin = { x: b.x, y: b.y, size };
    return;
  }
  geo.dragOrigin = { x: b.x, y: b.y, size: geo.applied() };
});
ipcMain.on('window:dragMove', (e, dx, dy) => {
  if (!trusted(e)) return;
  const d = geo.dragOrigin;
  if (win && d && Number.isFinite(dx) && Number.isFinite(dy)) placeWindow({ x: d.x + dx, y: d.y + dy, ...d.size }, false);
});
// Settings panel needs room: grow the window while it is open, restore the user's size and position when it closes.
// Snapped/maximized: leave the window alone if it already has room; otherwise grow it and return to the snapped rect.
ipcMain.on('window:panel', (e, open) => {
  if (!trusted(e) || !win) return;
  const b = win.getBounds();
  if (open && !geo.panelOpen) {
    const wasArranged = arranged();
    geo.panelOpen = true;
    geo.panelSaved = { x: b.x, y: b.y };
    geo.panelKeep = false; geo.panelReturn = null; geo.panelRect = null;
    if (wasArranged) {
      const a = screen.getDisplayMatching(b).workArea;
      if (win.isMaximized() || (b.width >= Math.min(Math.round(PANEL_MIN_W * zf()), a.width) && b.height >= Math.min(Math.round(PANEL_MIN_H * zf()), a.height))) {
        geo.panelKeep = true;
        return;
      }
      geo.panelReturn = { ...b };
      setPanelBounds(panelBounds({ width: b.width, height: b.height }, b));
      return;
    }
    setPanelBounds(panelBounds(geo.baseSize, geo.panelSaved));
  } else if (!open && geo.panelOpen) {
    endPanel();
  }
});
// Panel closed (or the page reloaded/crashed with it open): give the window back the user's size and position.
function endPanel() {
  if (!geo.panelOpen || !win || win.isDestroyed()) return;
  const b = win.getBounds();
  const keep = geo.panelKeep, ret = geo.panelReturn, pos = geo.panelSaved || b;
  const nowArranged = arranged(); // the user snapped/maximized it while the panel was open
  geo.panelOpen = false;
  geo.panelSaved = null; geo.panelReturn = null; geo.panelRect = null; geo.panelKeep = false;
  geo.dragOrigin = null;
  if (keep || nowArranged) { geo.wasArranged = arranged(); return; }
  if (ret) placeWindow(ret);
  else placeWindow(clampToWorkArea({ x: pos.x, y: pos.y, ...geo.baseSize }));
  geo.wasArranged = arranged();
}
ipcMain.on('window:hide', (e) => { if (trusted(e)) hideToTray(); });
ipcMain.on('window:minimize', (e) => { if (trusted(e) && win) win.minimize(); });
// Overlay view shown by the renderer: 'map' | 'planner' | null. Sent BEFORE the matching settings change (planner)
// so a map <-> planner switch resizes once, straight to the new view's size.
ipcMain.on('window:view', (e, view) => {
  if (!trusted(e) || !win || !(view === null || view === 'map' || view === 'planner')) return;
  geo.overlay = view;
  applyView();
});
// The open planner's content size in CSS px, measured by the renderer { width, height, keepWidth }. A user resize in
// progress is left alone (the renderer sends again whenever the content changes).
ipcMain.on('window:fitView', (e, size) => {
  if (!trusted(e) || !win || win.isDestroyed() || geo.overlay !== 'planner' || !size || typeof size !== 'object') return;
  const w = Number(size.width), h = Number(size.height);
  if (!Number.isFinite(w) || !Number.isFinite(h)) return;
  const key = viewKey();
  geo.fit = { key, width: Math.min(MAX_DIM, Math.max(MIN_W, Math.round(w))), height: Math.min(MAX_DIM, Math.max(MIN_H, Math.round(h))), keepWidth: size.keepWidth === true };
  if (geo.key !== key || geo.loop) return;
  resizeTo(sizeFor(key, geo.baseSize));
});
// Store build only: launch at login lives in Windows Settings > Apps > Startup. A fixed URI, never one from the page.
ipcMain.on('window:startupSettings', (e) => {
  if (!trusted(e) || !process.windowsStore) return;
  shell.openExternal('ms-settings:startupapps').catch(() => {});
});

// Website installer (NSIS) only: the Store updates the Store build, and the portable build never updates itself.
// Off by default (updatesActive): only a signed website build opts in. electron-updater is required only then, never
// in the default build, which packs it but never loads it (scripts/after-pack.js fails a build that turns updates on
// without it). The feed is build.publish in package.json: latest.yml on https://download.openworldclock.com, and
// app-update.yml carries the certificate's publisher name, so an installer signed by anyone else is refused.
function startAutoUpdate() {
  if (!updatesActive()) return;
  let autoUpdater;
  try { ({ autoUpdater } = require('electron-updater')); } catch (err) {
    console.error('auto-update is on (wcUpdates) but electron-updater could not be loaded; this build will not update:', err && err.message);
    return;
  }
  autoUpdater.logger = null;
  autoUpdater.on('error', () => { /* silent */ });
  const check = () => {
    try { Promise.resolve(autoUpdater.checkForUpdatesAndNotify()).catch(() => {}); } catch { /* silent */ }
  };
  setTimeout(check, 10 * 1000);
  setInterval(check, 6 * 60 * 60 * 1000);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { retryStoppedReload(); win.show(); win.focus(); } });
  // Taskbar grouping and notifications match the installed app. Not in the Store build: the MSIX package gives the
  // process its own id (JoaosApps.OpenWorldClock_...!WorldClock), and a different explicit id would put the window's
  // taskbar button apart from the Start tile and the taskbar pin.
  if (process.platform === 'win32' && !process.windowsStore) app.setAppUserModelId(APP_ID);
  app.on('before-quit', () => { quitting = true; captureBounds(true); flushSettings(); });
  app.on('will-quit', () => { flushSettings(); });
  app.on('window-all-closed', () => { /* keep running in the tray */ });
  // No webviews and no new windows from any page; the only links that leave the app go through openExternalSafe.
  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-attach-webview', (ev) => ev.preventDefault());
    contents.setWindowOpenHandler(({ url }) => { openExternalSafe(url); return { action: 'deny' }; });
  });
  app.whenReady().then(() => {
    // No application menu: the window is frameless, so the default menu only added hidden accelerators (reload,
    // DevTools, zoom). Text fields keep Ctrl+C/X/V/A/Z on Windows without it (Chromium handles those in the page).
    Menu.setApplicationMenu(null);
    // The page needs no web permissions (clipboard writes go through main): deny every request and check.
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.setDevicePermissionHandler(() => false);
    // The page and its files come from app://owc (see serveApp); registered before the window loads.
    protocol.handle('app', serveApp);
    // Launch at login follows Windows: keep a Task Manager disable, re-point an entry an upgrade left at a renamed exe.
    reconcileLoginItem();
    // First run only: the clock follows the Windows Region format (12-hour for en-US, 24-hour for pt-BR). Not saved
    // here: the renderer's first-run save writes the whole settings object, this included. Existing users keep theirs.
    if (settings.firstRun) settings.hour12 = prefers12h(systemLocale());
    createWindow();
    createTray();
    screen.on('display-removed', () => ensureOnScreen(false));
    screen.on('display-added', () => ensureOnScreen(false));
    screen.on('display-metrics-changed', () => ensureOnScreen(true));
    startAutoUpdate();
    if (process.env.WC_SMOKE && !app.isPackaged) {
      // test hooks, dev runs only
      global.__wcTest = { buildTrayMenu, KOFI_URL, trayTooltip, hideToTray, failSettingsGet: (n) => { testFailGets = Math.max(0, n | 0); },
        stubSaveDialog: (fn) => { testSaveDialog = typeof fn === 'function' ? fn : null; } };
      require(process.env.WC_SMOKE)(win, app);
    }
  });
}
