// Unit tests for src/settings-store.js: settings.json load, atomic save with retries, and the legacy folder copy.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSettingsStore } = require('../../src/settings-store');

const made = [];
const tmpDir = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-store-')); made.push(d); return d; };
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });
const DEFAULTS = { zones: ['Europe/Lisbon'], opacity: 0.85, zoom: 0, launchAtLogin: false, theme: 'system', bounds: null };
let windowsStore = false;
const VALIDATE = {
  zones: (v) => (Array.isArray(v) && v.every((z) => typeof z === 'string') ? v : undefined),
  opacity: (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0.6, v)) : undefined),
  zoom: (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(3.8, Math.max(0, v)) : undefined),
  launchAtLogin: (v) => (typeof v === 'boolean' && !windowsStore ? v : undefined),
  theme: (v) => (['system', 'light', 'dark'].includes(v) ? v : undefined),
};
const quiet = { error() {} };
const make = (dir, more = {}) => createSettingsStore({ dir, defaults: DEFAULTS, validate: VALIDATE, log: quiet, ...more });
const put = (dir, name, text) => fs.writeFileSync(path.join(dir, name), text);
const read = (dir, name = 'settings.json') => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));

test('no file: the defaults', () => {
  const dir = tmpDir();
  assert.deepEqual(make(dir).load(), DEFAULTS);
});

test('a corrupt settings.json falls back to the .bak copy', () => {
  const dir = tmpDir();
  put(dir, 'settings.json', '{"zones": ["Asia/Tokyo"');
  put(dir, 'settings.json.bak', JSON.stringify({ zones: ['Asia/Tokyo'], theme: 'dark' }));
  const s = make(dir).load();
  assert.deepEqual(s.zones, ['Asia/Tokyo']);
  assert.equal(s.theme, 'dark');
});

test('JSON that is not an object (an array) falls back to the .bak copy', () => {
  const dir = tmpDir();
  put(dir, 'settings.json', '["Asia/Tokyo"]');
  put(dir, 'settings.json.bak', JSON.stringify({ zones: ['America/New_York'] }));
  assert.deepEqual(make(dir).load().zones, ['America/New_York']);
});

test('a file saved with a byte order mark (Notepad) still loads, with the user edit kept', () => {
  const dir = tmpDir();
  put(dir, 'settings.json', '\uFEFF' + JSON.stringify({ zones: ['Europe/Paris', 'Asia/Tokyo'], theme: 'light' }));
  put(dir, 'settings.json.bak', JSON.stringify({ zones: ['Europe/Lisbon'] }));
  const s = make(dir).load();
  assert.deepEqual(s.zones, ['Europe/Paris', 'Asia/Tokyo']);
  assert.equal(s.theme, 'light');
});

test('opacity and zoom are clamped, bad values fall back to the defaults, bounds need four integers', () => {
  const dir = tmpDir();
  put(dir, 'settings.json', JSON.stringify({ opacity: 0.1, zoom: 99, theme: 'neon', bounds: { x: 10, y: 20, width: 300.5, height: 200 } }));
  const s = make(dir).load();
  assert.equal(s.opacity, 0.6);
  assert.equal(s.zoom, 3.8);
  assert.equal(s.theme, 'system');
  assert.equal(s.bounds, null);
  put(dir, 'settings.json', JSON.stringify({ bounds: { x: -5, y: 20, width: 300, height: 200, extra: 1 } }));
  assert.deepEqual(make(dir).load().bounds, { x: -5, y: 20, width: 300, height: 200 });
});

test('a Store-flagged validator rejects launchAtLogin on load', () => {
  const dir = tmpDir();
  put(dir, 'settings.json', JSON.stringify({ launchAtLogin: true }));
  windowsStore = true;
  try { assert.equal(make(dir).load().launchAtLogin, false); } finally { windowsStore = false; }
  assert.equal(make(dir).load().launchAtLogin, true);
});

test('unknown keys round-trip through write and are never in the loaded settings', () => {
  const dir = tmpDir();
  put(dir, 'settings.json', JSON.stringify({ zones: ['Asia/Tokyo'], futureThing: { a: 1 }, note: 'hi', ['__proto__']: { polluted: true } }));
  const store = make(dir);
  const s = store.load();
  assert.ok(!('futureThing' in s) && !('note' in s), JSON.stringify(s));
  assert.equal(({}).polluted, undefined);
  assert.ok(store.write({ ...s, theme: 'dark' }));
  const disk = read(dir);
  assert.deepEqual(disk.futureThing, { a: 1 });
  assert.equal(disk.note, 'hi');
  assert.equal(disk.theme, 'dark');
  assert.ok(!Object.hasOwn(disk, '__proto__'));
  assert.ok(!('futureThing' in store.load()));
});

test('write keeps the previous valid file as .bak and leaves no .tmp', () => {
  const dir = tmpDir();
  const store = make(dir);
  store.write({ ...DEFAULTS, theme: 'light' });
  store.write({ ...DEFAULTS, theme: 'dark' });
  assert.equal(read(dir).theme, 'dark');
  assert.equal(read(dir, 'settings.json.bak').theme, 'light');
  assert.ok(!fs.existsSync(path.join(dir, 'settings.json.tmp')));
});

test('a corrupt settings.json never replaces the last good .bak', () => {
  const dir = tmpDir();
  put(dir, 'settings.json', 'not json');
  put(dir, 'settings.json.bak', JSON.stringify({ theme: 'light' }));
  make(dir).write({ ...DEFAULTS, theme: 'dark' });
  assert.equal(read(dir, 'settings.json.bak').theme, 'light');
  assert.equal(read(dir).theme, 'dark');
});

const flakyFs = (failures, code = 'EPERM') => {
  let calls = 0;
  return {
    fs: { ...fs, renameSync: (a, b) => { calls++; if (calls <= failures) { const e = new Error(code); e.code = code; throw e; } return fs.renameSync(a, b); } },
    calls: () => calls,
  };
};

test('rename fails with EPERM 3 times: retried, and the save lands', () => {
  const dir = tmpDir();
  const f = flakyFs(3);
  assert.ok(make(dir, { fs: f.fs }).write({ ...DEFAULTS, theme: 'dark' }));
  assert.equal(f.calls(), 4);
  assert.equal(read(dir).theme, 'dark');
  assert.ok(!fs.existsSync(path.join(dir, 'settings.json.tmp')));
});

test('rename always fails with EBUSY: written in place, no .tmp left', () => {
  const dir = tmpDir();
  const f = flakyFs(Infinity, 'EBUSY');
  const t0 = Date.now();
  assert.ok(make(dir, { fs: f.fs }).write({ ...DEFAULTS, theme: 'light' }));
  assert.equal(f.calls(), 5);
  assert.ok(Date.now() - t0 >= 120, 'waits between tries');
  assert.equal(read(dir).theme, 'light');
  assert.ok(!fs.existsSync(path.join(dir, 'settings.json.tmp')));
});

test('another rename error is not retried and still saves through the fallback', () => {
  const dir = tmpDir();
  const f = flakyFs(Infinity, 'ENOSPC');
  assert.ok(make(dir, { fs: f.fs }).write({ ...DEFAULTS, theme: 'light' }));
  assert.equal(f.calls(), 1);
  assert.equal(read(dir).theme, 'light');
});

test('migration copies from the most recently used legacy folder, and never over an existing file', () => {
  const appData = tmpDir();
  const dir = path.join(appData, 'Open World Clock');
  const older = path.join(appData, 'World Clock'), newer = path.join(appData, 'Free World Clock');
  fs.mkdirSync(older); fs.mkdirSync(newer);
  put(older, 'settings.json', JSON.stringify({ theme: 'light' }));
  put(newer, 'settings.json', JSON.stringify({ theme: 'dark' }));
  put(newer, 'settings.json.bak', JSON.stringify({ theme: 'dark' }));
  const past = new Date(Date.now() - 86400000);
  fs.utimesSync(path.join(older, 'settings.json'), past, past);
  const opts = { legacyDirs: ['Free World Clock', 'World Clock'], appDataDir: appData };
  assert.equal(make(dir, opts).migrate(), true);
  assert.equal(read(dir).theme, 'dark');
  assert.ok(fs.existsSync(path.join(dir, 'settings.json.bak')));
  // An existing settings.json is never overwritten.
  put(dir, 'settings.json', JSON.stringify({ theme: 'system', mine: true }));
  const future = new Date(Date.now() + 86400000);
  fs.utimesSync(path.join(older, 'settings.json'), future, future);
  assert.equal(make(dir, opts).migrate(), false);
  assert.equal(read(dir).mine, true);
});

test('migration is skipped when asked (tests) and when there is no legacy folder', () => {
  const appData = tmpDir();
  const dir = path.join(appData, 'Open World Clock');
  fs.mkdirSync(path.join(appData, 'World Clock'));
  put(path.join(appData, 'World Clock'), 'settings.json', '{}');
  assert.equal(make(dir, { legacyDirs: ['World Clock'], appDataDir: appData, skipMigration: true }).migrate(), false);
  assert.ok(!fs.existsSync(path.join(dir, 'settings.json')));
  assert.equal(make(dir, { legacyDirs: ['Nothing Here'], appDataDir: appData }).migrate(), false);
});
