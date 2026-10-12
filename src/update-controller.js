// Update checking, owned by main. Pure: every effect (network, updater, timers, clock, notifications) is injected, so
// tests drive it without a network or a real updater. Channels (decided by main, never by the page):
// - 'signed': the installed, signed website build. electron-updater, latest.yml on FEED_URL. "Automatic updates"
//   (autoUpdate, default on): a scheduled check downloads a new version in the background. A manual check only
//   reads the metadata; Download is a separate step. Installing is always the user's choice (Restart and install):
//   autoInstallOnAppQuit stays false, so quitting never installs and nothing restarts the app by itself.
// - 'discovery': every other packaged website copy (unsigned installer, portable). Reads the latest version number
//   from DISCOVERY_URL and never downloads or runs anything; the action opens the fixed download page.
//   "Automatically check for updates" (autoCheck) is off by default: then nothing is requested unless the user asks.
// - 'store': the Microsoft Store updates the app. 'disabled': a signed build whose updater configuration failed the
//   publisher check (main never loads the updater). 'none': development runs. These never touch the network.
'use strict';

const { DISCOVERY_URL } = require('./update-config.js');

const FIRST_DELAY_MS = 10 * 1000;
const EVERY_MS = { signed: 6 * 60 * 60 * 1000, discovery: 24 * 60 * 60 * 1000 };
const MANUAL_MIN_GAP_MS = 10 * 1000; // a second Check within this shows the previous result again
const DISCOVERY_TIMEOUT_MS = 10 * 1000;
const DISCOVERY_MAX_BYTES = 64 * 1024;

class UpdateError extends Error {
  constructor(kind, message) { super(message || kind); this.kind = kind; }
}

// Plain release versions only (1.3.2): no prefix, no prerelease, at most 4 digits a part. Returns [a, b, c] or null.
const VERSION_RE = /^(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/;
function parseVersion(v) {
  const m = typeof v === 'string' ? VERSION_RE.exec(v) : null;
  return m ? [+m[1], +m[2], +m[3]] : null;
}
// Numeric comparison (1.10.0 > 1.9.9). Both must parse.
function compareVersions(a, b) {
  const x = parseVersion(a), y = parseVersion(b);
  if (!x || !y) throw new UpdateError('feed', 'not a version');
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

// The request options for the discovery fetch: no redirects, no cache, no cookies.
const discoveryInit = (signal) => ({ method: 'GET', redirect: 'error', cache: 'no-store', credentials: 'omit', headers: { accept: 'application/json' }, signal });

// Reads softwareVersion from the site's app metadata with `fetchFn` (main passes Electron's net.fetch). Bounded:
// 10 s, 64 KB read from the stream (Content-Length is not trusted), no redirects, a 200 JSON object. Only the
// validated version is used; every other field (downloadUrl among them) is ignored. Throws UpdateError: 'network'
// (unreachable or too slow), 'feed' (anything else that is not a usable answer), 'aborted' (signal from the caller).
async function discoverLatest(fetchFn, { signal, timeoutMs = DISCOVERY_TIMEOUT_MS, maxBytes = DISCOVERY_MAX_BYTES } = {}) {
  const ac = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ac.abort(); }, timeoutMs);
  const onAbort = () => ac.abort();
  if (signal) { if (signal.aborted) ac.abort(); else signal.addEventListener('abort', onAbort, { once: true }); }
  const fail = (kind, msg) => { throw new UpdateError(signal && signal.aborted ? 'aborted' : timedOut ? 'network' : kind, msg); };
  let res;
  try {
    try { res = await fetchFn(DISCOVERY_URL, discoveryInit(ac.signal)); } catch (e) { fail('network', e && e.message); }
    if (!res || res.status !== 200 || res.redirected) fail('feed', `status ${res && res.status}`);
    if (!res.body || typeof res.body.getReader !== 'function') fail('feed', 'no body');
    const reader = res.body.getReader(), chunks = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) { reader.cancel().catch(() => {}); fail('feed', 'too large'); }
        chunks.push(value);
      }
    } catch (e) { if (e instanceof UpdateError) throw e; fail('network', e && e.message); }
    let data;
    try { data = JSON.parse(Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8')); } catch { fail('feed', 'not JSON'); }
    if (!data || typeof data !== 'object' || Array.isArray(data) || !parseVersion(data.softwareVersion)) fail('feed', 'no valid softwareVersion');
    return data.softwareVersion;
  } finally {
    // whatever happened, nothing of this request outlives it: an unread error body or an endless stream is dropped
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
    ac.abort();
    if (res && res.body && typeof res.body.cancel === 'function' && !res.body.locked) res.body.cancel().catch(() => {});
  }
}

// electron-updater errors as the kinds the page shows. Cancellation is not an error.
function classifyUpdaterError(e) {
  if (e instanceof UpdateError) return e.kind;
  const text = `${(e && e.name) || ''} ${(e && e.code) || ''} ${(e && e.message) || e || ''}`;
  if (/CancellationError|cancell?ed/i.test(text)) return 'cancelled';
  if (/not signed by the application owner|checksum mismatch|sha512|signature/i.test(text)) return 'verify';
  if (/net::ERR_|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|socket hang up|timed? ?out/i.test(text)) return 'network';
  return 'feed';
}
// A version from latest.yml, for display only.
const SAFE_VERSION_RE = /^[0-9A-Za-z.+-]{1,32}$/;

// Wraps electron-updater's autoUpdater (the installed NsisUpdater). `CancellationToken` comes from
// builder-util-runtime. Downloads never start on their own (autoDownload false) and quitting never installs
// (autoInstallOnAppQuit false: BaseUpdater registers its quit handler only when that is true at download time).
function electronUpdaterBackend(autoUpdater, CancellationToken) {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.logger = null;
  autoUpdater.on('error', () => { /* reported through the promises below */ });
  let installAttempt = null;
  return {
    async check() {
      const r = await autoUpdater.checkForUpdates();
      const v = r && r.updateInfo && String(r.updateInfo.version);
      if (!v || !SAFE_VERSION_RE.test(v)) throw new UpdateError('feed', 'no update information');
      return { available: r.isUpdateAvailable === true, version: v };
    },
    download(onProgress) {
      const token = new CancellationToken();
      const listener = (p) => onProgress(p && p.percent);
      autoUpdater.on('download-progress', listener);
      const promise = Promise.resolve()
        .then(() => autoUpdater.downloadUpdate(token))
        .finally(() => autoUpdater.removeListener('download-progress', listener));
      return { promise, cancel: () => token.cancel() };
    },
    // quitAndInstall returns nothing and reports failure only as an 'error' event: synchronously when there is no
    // downloaded file or doInstall throws (BaseUpdater.install), later when the installer cannot be started
    // (NsisUpdater spawn). Both reach onError while the app is still running; an error after the app has quit
    // cannot be shown. Returns false when it failed at once.
    // One listener per attempt: a retry replaces the previous one, and a failure removes it at once.
    install(onError) {
      if (installAttempt) installAttempt.done();
      let failed = false;
      const attempt = {
        listener: (e) => { failed = true; attempt.done(); onError(e); },
        done: () => { autoUpdater.removeListener('error', attempt.listener); clearTimeout(attempt.timer); if (installAttempt === attempt) installAttempt = null; },
      };
      installAttempt = attempt;
      autoUpdater.on('error', attempt.listener);
      attempt.timer = setTimeout(attempt.done, 30 * 1000);
      if (attempt.timer && typeof attempt.timer.unref === 'function') attempt.timer.unref();
      try { autoUpdater.quitAndInstall(false, true); } catch (e) { if (installAttempt === attempt) attempt.listener(e); }
      return !failed;
    },
  };
}

function createUpdateController({
  channel, currentVersion, getPrefs, discover = null, updater = null,
  timers = { setTimeout, clearTimeout }, now = Date.now, onState = () => {}, notify = () => {},
}) {
  const active = channel === 'signed' || channel === 'discovery';
  const autoPref = () => {
    const p = getPrefs() || {};
    return channel === 'signed' ? p.autoUpdate !== false : channel === 'discovery' ? p.autoCheck === true : false;
  };
  const initialPhase = active ? 'idle' : channel === 'store' ? 'store' : channel === 'disabled' ? 'disabled' : 'none';
  let state = { channel, phase: initialPhase, version: currentVersion, latest: null, percent: null, errorKind: null, checkedAt: null, auto: autoPref() };
  let timer = null, checkRun = null, job = null, lastManual = -Infinity, disposed = false, readyOrigin = null;

  const snapshot = () => Object.freeze({ ...state });
  function setState(patch) {
    state = { ...state, ...patch, auto: autoPref() };
    onState(snapshot());
  }

  function schedule(delay) {
    if (timer) timers.clearTimeout(timer);
    timer = timers.setTimeout(() => {
      timer = null;
      if (disposed || !autoPref()) return;
      check('scheduled');
      schedule(EVERY_MS[channel]);
    }, delay);
  }
  function unschedule() { if (timer) { timers.clearTimeout(timer); timer = null; } }

  // check: metadata only. One at a time (a second call joins the first); ignored while downloading or ready.
  function check(origin = 'manual') {
    if (!active || disposed) return Promise.resolve(snapshot());
    if (checkRun) {
      // a user's Check joins the check under way and makes it theirs: turning automatic checks off no longer stops
      // it, and its result never starts a background download
      if (origin === 'manual') checkRun.origin = 'manual';
      return checkRun.promise;
    }
    if (state.phase === 'downloading' || state.phase === 'ready') {
      // a background download that is ready is announced again on each scheduled tick while automatic updates are on
      // (main shows each version once: this only retries a notice Windows dropped); never a new download or install
      if (origin === 'scheduled' && state.phase === 'ready' && readyOrigin === 'auto' && autoPref()) notify('ready', state.latest);
      return Promise.resolve(snapshot());
    }
    if (origin === 'manual') {
      if (now() - lastManual < MANUAL_MIN_GAP_MS && (state.phase === 'current' || state.phase === 'available')) return Promise.resolve(snapshot());
      lastManual = now();
    }
    const before = { phase: state.phase, latest: state.latest, errorKind: state.errorKind, checkedAt: state.checkedAt };
    const ac = new AbortController();
    const run = { origin, ac };
    setState({ phase: 'checking', errorKind: null, percent: null });
    // started at once, so a second check in the same tick joins this one
    let work;
    try { work = Promise.resolve(channel === 'discovery' ? discover(ac.signal) : updater.check()); } catch (e) { work = Promise.reject(e); }
    if (channel === 'discovery') work = work.then((latest) => ({ available: compareVersions(latest, currentVersion) > 0, version: latest }));
    run.promise = work.then((r) => {
      if (checkRun !== run || disposed) return snapshot();
      checkRun = null;
      if (!r.available) { setState({ phase: 'current', latest: r.version, checkedAt: now() }); return snapshot(); }
      setState({ phase: 'available', latest: r.version, checkedAt: now() });
      // a scheduled check that finds a version downloads it, but only while the automatic preference is still on
      if (run.origin === 'scheduled' && autoPref()) {
        if (channel === 'signed') startDownload('auto');
        else notify('available', r.version);
      }
      return snapshot();
    }, (e) => {
      if (checkRun !== run || disposed) return snapshot();
      checkRun = null;
      const kind = ac.signal.aborted ? 'aborted' : e && typeof e.kind === 'string' ? e.kind : classifyUpdaterError(e);
      if (kind === 'aborted' || kind === 'cancelled') setState(before); // turned off while checking: as before
      else setState({ phase: 'error', errorKind: kind });
      return snapshot();
    });
    checkRun = run;
    return run.promise;
  }

  // download: signed channel, from 'available' only. 'auto' downloads are cancelled when the preference goes off.
  function startDownload(origin = 'manual') {
    if (channel !== 'signed' || disposed || state.phase !== 'available' || job) return false;
    const mine = { origin, cancelled: false };
    let last = -1;
    setState({ phase: 'downloading', percent: 0, errorKind: null });
    const handle = updater.download((pct) => {
      const p = Math.max(0, Math.min(100, Math.floor(Number(pct) || 0)));
      if (job === mine && p !== last) { last = p; setState({ percent: p }); }
    });
    mine.cancel = handle.cancel;
    job = mine;
    handle.promise.then(() => {
      if (job !== mine || disposed) return;
      job = null;
      // cancelled (Cancel, or automatic updates turned off) but finished anyway: still not a background-ready notice
      if (mine.cancelled) { setState({ phase: 'available', percent: null }); return; }
      readyOrigin = origin;
      setState({ phase: 'ready', percent: 100 });
      if (origin === 'auto') notify('ready', state.latest);
    }, (e) => {
      if (job !== mine || disposed) return;
      job = null;
      const kind = mine.cancelled ? 'cancelled' : classifyUpdaterError(e);
      if (kind === 'cancelled') setState({ phase: 'available', percent: null });
      else setState({ phase: 'error', errorKind: kind, percent: null });
    });
    return true;
  }
  function cancel() {
    if (!job) return false;
    job.cancelled = true;
    try { job.cancel(); } catch { /* the promise settles either way */ }
    return true;
  }
  // install: only from 'ready', only through the user's Restart and install. A failure keeps 'ready' (the file is
  // still there) with errorKind 'install', so the page says so and offers Restart and install again.
  function install() {
    if (channel !== 'signed' || disposed || state.phase !== 'ready') return false;
    if (state.errorKind) setState({ errorKind: null });
    const ok = updater.install(() => { if (!disposed && state.phase === 'ready') setState({ errorKind: 'install' }); });
    return ok !== false;
  }

  // The automatic preference changed (or start): schedule, or stop everything automatic that is under way.
  function prefsChanged() {
    if (!active || disposed) return;
    if (autoPref()) { if (!timer) schedule(FIRST_DELAY_MS); }
    else {
      unschedule();
      if (checkRun && checkRun.origin === 'scheduled') checkRun.ac.abort();
      if (job && job.origin === 'auto') cancel();
    }
    setState({});
  }
  function dispose() {
    disposed = true;
    unschedule();
    if (checkRun) checkRun.ac.abort();
    if (job) cancel();
  }

  return { get: snapshot, check, download: () => startDownload('manual'), cancel, install, start: prefsChanged, prefsChanged, dispose };
}

module.exports = {
  createUpdateController, discoverLatest, discoveryInit, electronUpdaterBackend, classifyUpdaterError,
  parseVersion, compareVersions, UpdateError, FIRST_DELAY_MS, EVERY_MS, MANUAL_MIN_GAP_MS,
};
