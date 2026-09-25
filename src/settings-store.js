// settings.json on disk: load, atomic save and the one-time copy from older userData folders. No Electron import, so
// test/unit/settings-store.test.js runs it on a temp folder (and with a stubbed fs). main.js owns DEFAULTS and VALIDATE
// (scripts/export-shared.mjs reads DEFAULTS from main.js) and passes them in.
//
// load(): settings.json, or the last good copy (.bak) when the main file is missing, corrupt or not an object. A UTF-8
// byte order mark (Notepad adds one) is ignored. Every known key goes through its validator (bad values fall back to
// the default); `bounds` must be four integers. Keys the app does not know (a newer version wrote them, or the user
// added them) are kept aside and written back unchanged, and are never part of the returned settings (so never sent
// to the page).
// write(settings): write settings.json.tmp and fsync it, copy the current file to .bak only if it parses, then rename
// the temp over settings.json. On Windows the rename fails with EPERM, EACCES or EBUSY while another program (an
// antivirus scan, a sync client, an editor) holds the file: it is retried up to 5 times, 40 ms apart, and then the
// data is written in place and the temp removed, so a save is never lost.
// migrate(): on the first run under a new product name, copy settings.json (and .bak) from the most recently used
// legacy folder under appDataDir; never overwrites an existing settings.json or .bak. skipMigration turns it off
// (tests point userData at a temp folder).
const path = require('path');

const RETRY_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);
const RENAME_TRIES = 5;
const RENAME_WAIT_MS = 40;
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const isPlainObject = (v) => v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;
const parseJson = (text) => JSON.parse(String(text).replace(/^\uFEFF/, ''));
const sleepSync = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* no wait available */ } };

function createSettingsStore({ dir, defaults, validate, fs = require('fs'), legacyDirs = [], appDataDir = null, skipMigration = false, log = console }) {
  const PATH = path.join(dir, 'settings.json');
  const TMP = PATH + '.tmp';
  const BAK = PATH + '.bak';
  let extra = {};

  function readFile() {
    for (const f of [PATH, BAK]) {
      try {
        const raw = parseJson(fs.readFileSync(f, 'utf8'));
        if (isPlainObject(raw)) return raw;
      } catch { /* try the next one */ }
    }
    return null;
  }

  function load() {
    extra = {};
    const out = { ...defaults };
    let raw = null;
    try { raw = readFile(); } catch { raw = null; }
    if (!raw) return out;
    for (const [k, check] of Object.entries(validate)) {
      let v;
      try { v = check(raw[k]); } catch { v = undefined; }
      if (v !== undefined) out[k] = v;
    }
    const b = raw.bounds;
    if (isPlainObject(b) && ['x', 'y', 'width', 'height'].every((k) => Number.isInteger(b[k]))) {
      out.bounds = { x: b.x, y: b.y, width: b.width, height: b.height };
    }
    for (const [k, v] of Object.entries(raw)) {
      if (UNSAFE_KEYS.has(k) || Object.hasOwn(defaults, k) || Object.hasOwn(validate, k) || k === 'bounds') continue;
      extra[k] = v;
    }
    return out;
  }

  function renameWithRetry() {
    for (let i = 1; ; i++) {
      try { fs.renameSync(TMP, PATH); return true; } catch (e) {
        if (!RETRY_CODES.has(e && e.code) || i >= RENAME_TRIES) return false;
        sleepSync(RENAME_WAIT_MS);
      }
    }
  }

  function write(settings) {
    try {
      const data = JSON.stringify({ ...settings, ...extra }, null, 2);
      fs.mkdirSync(dir, { recursive: true });
      const fd = fs.openSync(TMP, 'w');
      try { fs.writeSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      // Back up the current file only if it is valid, so a corrupt file never replaces the last good copy.
      try { parseJson(fs.readFileSync(PATH, 'utf8')); fs.copyFileSync(PATH, BAK); } catch { /* best effort */ }
      if (renameWithRetry()) return true;
      // The rename kept failing (the file is held open): write in place, then drop the temp.
      fs.writeFileSync(PATH, data);
      try { fs.rmSync(TMP, { force: true }); } catch { /* best effort */ }
      return true;
    } catch (e) {
      if (log) log.error('Could not save settings:', e && e.message);
      return false;
    }
  }

  function migrate() {
    if (skipMigration || !appDataDir) return false;
    try {
      if (fs.existsSync(PATH) || fs.existsSync(BAK)) return false;
      const userData = path.resolve(dir);
      let source = null;
      for (const name of legacyDirs) {
        const from = path.resolve(appDataDir, name);
        if (from.toLowerCase() === userData.toLowerCase()) continue;
        let mtime = -1;
        for (const f of ['settings.json', 'settings.json.bak']) {
          try { mtime = Math.max(mtime, fs.statSync(path.join(from, f)).mtimeMs); } catch { /* missing */ }
        }
        if (mtime >= 0 && (!source || mtime > source.mtime)) source = { dir: from, mtime };
      }
      if (!source) return false;
      fs.mkdirSync(userData, { recursive: true });
      for (const [from, to] of [['settings.json', PATH], ['settings.json.bak', BAK]]) {
        try { fs.copyFileSync(path.join(source.dir, from), to, fs.constants.COPYFILE_EXCL); } catch { /* missing or already there */ }
      }
      return true;
    } catch (e) {
      if (log) log.error('Could not migrate settings:', e && e.message);
      return false;
    }
  }

  return { load, write, migrate, paths: { settings: PATH, tmp: TMP, bak: BAK } };
}

module.exports = { createSettingsStore };
