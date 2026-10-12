// Unit tests for src/update-controller.js and src/update-config.js: the update state machine with an injected updater,
// discovery fetch and timers. Nothing here touches the network, a real feed or an installer.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createUpdateController, discoverLatest, electronUpdaterBackend, classifyUpdaterError, compareVersions, parseVersion,
  FIRST_DELAY_MS, EVERY_MS, MANUAL_MIN_GAP_MS,
} = require('../../src/update-controller.js');
const { checkUpdateConfig, configuredPublisher, DISCOVERY_URL } = require('../../src/update-config.js');

// ---------- fakes ----------
function fakeClock() {
  let t = 1_800_000_000_000, seq = 0;
  const q = new Map();
  return {
    now: () => t,
    timers: {
      setTimeout: (fn, ms) => { const id = ++seq; q.set(id, { at: t + ms, fn }); return id; },
      clearTimeout: (id) => { q.delete(id); },
    },
    pending: () => q.size,
    // advance time, running due timers in order (each may schedule more)
    async advance(ms) {
      const end = t + ms;
      for (;;) {
        const due = [...q.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        q.delete(due[0]); t = due[1].at; due[1].fn();
        await flush();
      }
      t = end;
      await flush();
    },
  };
}
const flush = () => new Promise((r) => setImmediate(r));
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }

// A fake signed backend with controllable promises; records every call.
function fakeUpdater() {
  const u = { checks: [], downloads: [], installs: 0 };
  u.check = () => { const d = deferred(); u.checks.push(d); return d.promise; };
  u.download = (onProgress) => {
    const d = deferred(), job = { ...d, onProgress, cancelled: false };
    job.cancel = () => { job.cancelled = true; const e = new Error('cancelled'); e.name = 'CancellationError'; d.reject(e); };
    u.downloads.push(job);
    return { promise: d.promise, cancel: job.cancel };
  };
  u.install = () => { u.installs++; };
  return u;
}
function make(channel, opts = {}) {
  const clock = fakeClock(), prefs = { autoUpdate: true, autoCheck: false, ...opts.prefs }, states = [], notes = [];
  const updater = opts.updater || fakeUpdater();
  const discover = opts.discover || (() => Promise.resolve('1.3.2'));
  const c = createUpdateController({
    channel, currentVersion: opts.version || '1.3.2', getPrefs: () => prefs, updater, discover,
    timers: clock.timers, now: clock.now, onState: (s) => states.push(s), notify: (k, v) => notes.push([k, v]),
  });
  return { c, clock, prefs, states, notes, updater };
}

// ---------- versions and config ----------
test('versions: numeric comparison, plain releases only', () => {
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1);
  assert.equal(compareVersions('1.3.2', '1.3.2'), 0);
  assert.equal(compareVersions('1.3.1', '1.3.2'), -1);
  for (const bad of ['1.3.2-beta', 'v1.4.0', '99999.0.0', '1.3', '', null, 1.3, ['1.3.2'], { v: 1 }]) assert.equal(parseVersion(bad), null, String(bad));
});

test('update config: only the generic provider on our feed with a publisher', () => {
  const good = { provider: 'generic', url: 'https://download.openworldclock.com', publisherName: ['X'] };
  assert.deepEqual(checkUpdateConfig(good), { ok: true, publishers: ['X'] });
  assert.equal(checkUpdateConfig({ ...good, url: 'https://download.openworldclock.com/' }).ok, true);
  for (const bad of [null, [], 'x', { ...good, publisherName: null }, { ...good, publisherName: [] }, { ...good, publisherName: [''] }, { ...good, publisherName: undefined },
    { ...good, url: 'http://download.openworldclock.com' }, { ...good, url: 'https://evil.example' }, { ...good, provider: 's3' }]) {
    assert.equal(checkUpdateConfig(bad).ok, false, JSON.stringify(bad));
  }
  assert.equal(checkUpdateConfig(good, ['Y']).ok, false);
  assert.deepEqual(configuredPublisher({ signtoolOptions: { certificateSha1: 'AB' } }), null);
  assert.deepEqual(configuredPublisher({ azureSignOptions: { publisherName: ' X ' } }), ['X']);
});

// ---------- discovery fetch ----------
const bodyOf = (text) => new Response(text).body;
function respond(text, { status = 200, redirected = false } = {}) {
  return async (url, init) => {
    respond.last = { url, init };
    const r = new Response(text, { status });
    if (redirected) Object.defineProperty(r, 'redirected', { value: true });
    return r;
  };
}
test('discovery: reads only softwareVersion from the fixed URL, with bounded options', async () => {
  const f = respond(JSON.stringify({ softwareVersion: '1.4.0', downloadUrl: 'file:///C:/x.exe', url: 'https://evil.example' }));
  assert.equal(await discoverLatest(f), '1.4.0');
  assert.equal(respond.last.url, DISCOVERY_URL);
  assert.equal(DISCOVERY_URL, 'https://openworldclock.com/api/app.json');
  assert.deepEqual({ redirect: respond.last.init.redirect, cache: respond.last.init.cache, credentials: respond.last.init.credentials, method: respond.last.init.method }, { redirect: 'error', cache: 'no-store', credentials: 'omit', method: 'GET' });
});
test('discovery: every unusable answer is an error, never a version', async () => {
  const cases = [
    ['404', respond('{"softwareVersion":"1.3.2"}', { status: 404 }), 'feed'],
    ['redirected', respond('{"softwareVersion":"1.3.2"}', { redirected: true }), 'feed'],
    ['HTML page', respond('<!doctype html><title>ok</title>'), 'feed'],
    ['prerelease', respond('{"softwareVersion":"1.4.0-beta"}'), 'feed'],
    ['v prefix', respond('{"softwareVersion":"v1.4.0"}'), 'feed'],
    ['huge part', respond('{"softwareVersion":"999999.0.0"}'), 'feed'],
    ['array', respond('["1.4.0"]'), 'feed'],
    ['object version', respond('{"softwareVersion":{"v":"1.4.0"}}'), 'feed'],
    ['missing', respond('{}'), 'feed'],
    ['70 KB body', respond(JSON.stringify({ softwareVersion: '1.4.0', pad: 'x'.repeat(70 * 1024) })), 'feed'],
    ['redirect refused (fetch throws)', async () => { throw new TypeError('fetch failed: redirect mode is set to error'); }, 'network'],
    ['offline', async () => { throw new TypeError('net::ERR_INTERNET_DISCONNECTED'); }, 'network'],
  ];
  for (const [name, f, kind] of cases) {
    await assert.rejects(discoverLatest(f), (e) => e.kind === kind, name);
  }
});
test('discovery: a body larger than the cap is refused while streaming, whatever Content-Length says', async () => {
  let pulled = 0;
  const big = new ReadableStream({ pull(c) { pulled++; c.enqueue(new Uint8Array(16 * 1024)); } });
  const f = async () => new Response(big, { status: 200, headers: { 'content-length': '10' } });
  await assert.rejects(discoverLatest(f), (e) => e.kind === 'feed');
  assert.ok(pulled <= 6, `stopped reading early (${pulled} chunks)`);
});
test('discovery: a timeout is a network error; the caller abort is "aborted"', async () => {
  const hang = (url, init) => new Promise((_r, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))));
  await assert.rejects(discoverLatest(hang, { timeoutMs: 20 }), (e) => e.kind === 'network');
  const ac = new AbortController();
  const p = discoverLatest(hang, { signal: ac.signal });
  ac.abort();
  await assert.rejects(p, (e) => e.kind === 'aborted');
  void bodyOf;
});

// ---------- discovery channel ----------
test('discovery off (default): no request at start or over 48 h', async () => {
  let calls = 0;
  const { c, clock } = make('discovery', { discover: () => { calls++; return Promise.resolve('1.3.2'); } });
  c.start();
  await clock.advance(48 * 3600 * 1000);
  assert.equal(calls, 0);
  assert.equal(clock.pending(), 0);
  assert.equal(c.get().phase, 'idle');
  assert.equal(c.get().auto, false);
});
test('discovery on: one check 10 s after start, then daily; turning it off clears the timer', async () => {
  let calls = 0;
  const { c, clock, prefs, notes } = make('discovery', { prefs: { autoCheck: true }, discover: () => { calls++; return Promise.resolve('1.4.0'); } });
  c.start();
  await clock.advance(FIRST_DELAY_MS - 1);
  assert.equal(calls, 0);
  await clock.advance(1);
  assert.equal(calls, 1);
  assert.deepEqual([c.get().phase, c.get().latest], ['available', '1.4.0']);
  assert.deepEqual(notes, [['available', '1.4.0']], 'a scheduled check that finds a version announces it');
  await clock.advance(EVERY_MS.discovery);
  assert.equal(calls, 2);
  prefs.autoCheck = false; c.prefsChanged();
  assert.equal(clock.pending(), 0);
  await clock.advance(5 * EVERY_MS.discovery);
  assert.equal(calls, 2);
});
test('discovery manual check: current, available, error then retry, never "current" on a failure', async () => {
  let answer = Promise.resolve('1.3.2');
  const { c, clock, notes } = make('discovery', { discover: () => answer });
  let s = await c.check();
  assert.deepEqual([s.phase, s.latest, typeof s.checkedAt], ['current', '1.3.2', 'number']);
  answer = Promise.reject(Object.assign(new Error('x'), { kind: 'feed' }));
  answer.catch(() => {});
  await clock.advance(MANUAL_MIN_GAP_MS);
  const { UpdateError } = require('../../src/update-controller.js');
  answer = Promise.reject(new UpdateError('feed')); answer.catch(() => {});
  s = await c.check();
  assert.deepEqual([s.phase, s.errorKind], ['error', 'feed']);
  answer = Promise.resolve('1.10.0');
  s = await c.check(); // retry right away after an error
  assert.deepEqual([s.phase, s.latest], ['available', '1.10.0']);
  assert.deepEqual(notes, [], 'manual results are never announced in the tray');
});
test('discovery: two checks make one request; a quick second Check shows the last result', async () => {
  let calls = 0;
  const d = deferred();
  const { c, clock } = make('discovery', { discover: () => { calls++; return d.promise; } });
  const a = c.check(), b = c.check();
  d.resolve('1.3.2');
  assert.deepEqual(await a, await b);
  assert.equal(calls, 1);
  await c.check();
  assert.equal(calls, 1, 'within 10 s: no new request');
  await clock.advance(MANUAL_MIN_GAP_MS);
  await c.check();
  assert.equal(calls, 2);
});
test('discovery: turning automatic checks off aborts a scheduled check in flight and restores the previous state', async () => {
  let seen;
  const { c, clock, prefs } = make('discovery', { prefs: { autoCheck: true }, discover: (signal) => new Promise((_r, rej) => { seen = signal; signal.addEventListener('abort', () => rej(Object.assign(new Error('a'), { kind: 'aborted' }))); }) });
  c.start();
  await clock.advance(FIRST_DELAY_MS);
  assert.equal(c.get().phase, 'checking');
  prefs.autoCheck = false; c.prefsChanged();
  await flush();
  assert.equal(seen.aborted, true);
  assert.equal(c.get().phase, 'idle');
});
test('discovery never downloads or installs', async () => {
  const { c, updater } = make('discovery', { discover: () => Promise.resolve('2.0.0') });
  await c.check();
  assert.equal(c.download(), false);
  assert.equal(c.install(), false);
  assert.equal(updater.downloads.length + updater.installs, 0);
});

// ---------- signed channel ----------
test('signed manual check reads metadata only: available, then an explicit Download, then ready; install only on request', async () => {
  const { c, updater, notes, prefs } = make('signed', { prefs: { autoUpdate: false } });
  const p = c.check();
  updater.checks[0].resolve({ available: true, version: '1.4.0' });
  assert.deepEqual([(await p).phase, updater.downloads.length], ['available', 0]);
  assert.equal(c.install(), false, 'nothing to install yet');
  assert.equal(c.download(), true);
  assert.equal(c.download(), false, 'one download at a time');
  updater.downloads[0].onProgress(41.7);
  assert.deepEqual([c.get().phase, c.get().percent], ['downloading', 41]);
  assert.equal((await c.check()).phase, 'downloading', 'checks are ignored while downloading');
  updater.downloads[0].resolve(['x.exe']);
  await flush();
  assert.equal(c.get().phase, 'ready');
  assert.deepEqual(notes, [], 'a download the user started is not announced');
  prefs.autoUpdate = true; c.prefsChanged();
  assert.equal(updater.installs, 0, 'turning automatic updates on never installs');
  assert.equal(c.install(), true);
  assert.equal(updater.installs, 1);
});
test('signed automatic (default on): scheduled check downloads in the background and announces it once ready', async () => {
  const { c, clock, updater, notes } = make('signed');
  assert.equal(c.get().auto, true);
  c.start();
  await clock.advance(FIRST_DELAY_MS);
  updater.checks[0].resolve({ available: true, version: '1.4.0' });
  await flush();
  assert.equal(c.get().phase, 'downloading');
  updater.downloads[0].resolve([]);
  await flush();
  assert.deepEqual([c.get().phase, notes], ['ready', [['ready', '1.4.0']]]);
  await clock.advance(EVERY_MS.signed);
  assert.equal(updater.checks.length, 1, 'no new check once a version is ready');
  assert.equal(updater.installs, 0, 'never installs by itself');
});
test('signed: up to date and errors (network, feed, verification) with retry', async () => {
  const { c, clock, updater } = make('signed');
  let p = c.check();
  updater.checks[0].resolve({ available: false, version: '1.3.2' });
  assert.equal((await p).phase, 'current');
  for (const [msg, kind] of [['net::ERR_NAME_NOT_RESOLVED', 'network'], ['HttpError: 404 Cannot find latest.yml', 'feed']]) {
    await clock.advance(MANUAL_MIN_GAP_MS);
    p = c.check();
    updater.checks.at(-1).reject(new Error(msg));
    const s = await p;
    assert.deepEqual([s.phase, s.errorKind], ['error', kind], msg);
  }
  p = c.check();
  updater.checks.at(-1).resolve({ available: true, version: '1.4.0' });
  await p;
  c.download();
  updater.downloads[0].reject(new Error('New version 1.4.0 is not signed by the application owner: publisherNames: X'));
  await flush();
  assert.deepEqual([c.get().phase, c.get().errorKind], ['error', 'verify']);
  p = c.check();
  updater.checks.at(-1).resolve({ available: true, version: '1.4.0' });
  assert.equal((await p).phase, 'available', 'Try again works after a failed download');
});
test('signed: turning automatic updates off stops the schedule and cancels a background download in flight', async () => {
  const { c, clock, updater, prefs } = make('signed');
  c.start();
  await clock.advance(FIRST_DELAY_MS);
  updater.checks[0].resolve({ available: true, version: '1.4.0' });
  await flush();
  assert.equal(c.get().phase, 'downloading');
  prefs.autoUpdate = false; c.prefsChanged();
  await flush();
  assert.equal(updater.downloads[0].cancelled, true);
  assert.deepEqual([c.get().phase, c.get().auto], ['available', false]);
  assert.equal(clock.pending(), 0);
  await clock.advance(10 * EVERY_MS.signed);
  assert.equal(updater.checks.length, 1);
  assert.equal(updater.installs, 0);
});
test('signed: a scheduled check that returns after automatic updates went off does not download', async () => {
  const { c, clock, updater, prefs } = make('signed');
  c.start();
  await clock.advance(FIRST_DELAY_MS);
  prefs.autoUpdate = false; c.prefsChanged();
  updater.checks[0].resolve({ available: true, version: '1.4.0' });
  await flush();
  assert.deepEqual([c.get().phase, updater.downloads.length], ['available', 0]);
});
test('signed: turning automatic updates off keeps a download the user started; Cancel stops it', async () => {
  const { c, updater, prefs } = make('signed');
  const p = c.check();
  updater.checks[0].resolve({ available: true, version: '1.4.0' });
  await p;
  c.download();
  prefs.autoUpdate = false; c.prefsChanged();
  assert.equal(updater.downloads[0].cancelled, false);
  assert.equal(c.cancel(), true);
  await flush();
  assert.equal(c.get().phase, 'available');
});
test('signed off: nothing is checked over 48 h; manual check still works', async () => {
  const { c, clock, updater } = make('signed', { prefs: { autoUpdate: false } });
  c.start();
  await clock.advance(48 * 3600 * 1000);
  assert.equal(updater.checks.length, 0);
  const p = c.check();
  updater.checks[0].resolve({ available: false, version: '1.3.2' });
  assert.equal((await p).phase, 'current');
});

// ---------- other channels ----------
for (const [channel, phase] of [['store', 'store'], ['disabled', 'disabled'], ['none', 'none']]) {
  test(`${channel}: no checks, downloads or installs, ever`, async () => {
    let calls = 0;
    const { c, clock, updater } = make(channel, { prefs: { autoUpdate: true, autoCheck: true }, discover: () => { calls++; return Promise.resolve('9.9.9'); } });
    c.start();
    await clock.advance(48 * 3600 * 1000);
    await c.check();
    assert.deepEqual([c.get().phase, calls, updater.checks.length, c.download(), c.install()], [phase, 0, 0, false, false]);
  });
}

test('snapshots are frozen copies', () => {
  const { c } = make('discovery');
  const s = c.get();
  assert.ok(Object.isFrozen(s));
  assert.deepEqual(Object.keys(s).sort(), ['auto', 'channel', 'checkedAt', 'errorKind', 'latest', 'percent', 'phase', 'version']);
});

test('updater errors are classified, cancellation is not an error', () => {
  assert.equal(classifyUpdaterError(Object.assign(new Error('x'), { name: 'CancellationError' })), 'cancelled');
  assert.equal(classifyUpdaterError(new Error('sha512 checksum mismatch, expected a, got b')), 'verify');
  assert.equal(classifyUpdaterError(new Error('net::ERR_CONNECTION_REFUSED')), 'network');
  assert.equal(classifyUpdaterError(new Error('Cannot parse update info')), 'feed');
});

// ---------- the real electron-updater adapter ----------
// electron-updater's NsisUpdater with a fake app adapter (no Electron, no network): the settings the backend applies,
// and BaseUpdater.addQuitHandler (called when a download completes) registering no quit-install handler.
test('electron-updater adapter: no auto download, no install on quit, explicit quitAndInstall only', () => {
  const { NsisUpdater } = require('electron-updater');
  const { CancellationToken } = require('builder-util-runtime');
  const quitHandlers = [];
  const app = { version: '1.3.2', name: 'Open World Clock', isPackaged: true, appUpdateConfigPath: 'none.yml', userDataPath: '.', baseCachePath: '.', onQuit: (h) => quitHandlers.push(h), quit() {}, relaunch() {}, whenReady: () => Promise.resolve() };
  const u = new NsisUpdater(null, app);
  const calls = [];
  u.quitAndInstall = (...a) => calls.push(a);
  const backend = electronUpdaterBackend(u, CancellationToken);
  assert.deepEqual([u.autoDownload, u.autoInstallOnAppQuit, u.allowPrerelease, u.allowDowngrade], [false, false, false, false]);
  u.addQuitHandler(); // what BaseUpdater does when a download finishes
  assert.equal(quitHandlers.length, 0, 'no handler installs the update when the app quits');
  backend.install();
  assert.deepEqual(calls, [[false, true]]);
  const job = backend.download(() => {});
  job.cancel();
  return job.promise.then(() => assert.fail('a download without a check must not succeed'), () => {});
});

// ---------- review cases ----------
test('signed: a download that finishes after Cancel or automatic-off (backend ignores the token) is not ready or announced', async () => {
  const u = fakeUpdater();
  let late;
  u.download = () => { late = deferred(); return { promise: late.promise, cancel: () => {} }; };
  const { c } = make('signed', { updater: u, prefs: { autoUpdate: false } });
  const p = c.check();
  u.checks[0].resolve({ available: true, version: '1.4.0' });
  await p;
  c.download();
  c.cancel();
  late.resolve([]);
  await flush();
  assert.equal(c.get().phase, 'available');
  // the same for a background download stopped by turning Automatic updates off
  const auto = make('signed', { updater: u });
  auto.c.start();
  await auto.clock.advance(FIRST_DELAY_MS);
  u.checks.at(-1).resolve({ available: true, version: '1.4.0' });
  await flush();
  assert.equal(auto.c.get().phase, 'downloading');
  auto.prefs.autoUpdate = false; auto.c.prefsChanged();
  late.resolve([]);
  await flush();
  assert.deepEqual([auto.c.get().phase, auto.notes], ['available', []]);
});
test('discovery: an error status with an endless body is dropped at once (body cancelled, request aborted)', async () => {
  let cancelled = false, signalSeen;
  const endless = new ReadableStream({ pull(ctl) { ctl.enqueue(new Uint8Array(1024)); }, cancel() { cancelled = true; } });
  const f = async (url, init) => { signalSeen = init.signal; return new Response(endless, { status: 500 }); };
  const t0 = Date.now();
  await assert.rejects(discoverLatest(f), (e) => e.kind === 'feed');
  await flush();
  assert.ok(Date.now() - t0 < 1000);
  assert.equal(cancelled, true, 'the unread body was cancelled');
  assert.equal(signalSeen.aborted, true, 'the request signal was aborted');
});
test('discovery: after a success the request signal is released too', async () => {
  let sig;
  await discoverLatest(async (u, init) => { sig = init.signal; return new Response('{"softwareVersion":"1.3.2"}'); });
  assert.equal(sig.aborted, true);
});

test('tray balloons: a click is credited only to the balloon on screen', () => {
  const { createBalloonTracker } = require('../../src/tray-balloon.js');
  const b = createBalloonTracker();
  b.shown('update'); b.shown('hint'); // an update notice, then the close-to-tray hint replaces it
  assert.equal(b.clicked(), 'hint');
  assert.equal(b.clicked(), null, 'one click, one credit');
  b.shown('update'); b.closed();
  assert.equal(b.clicked(), null, 'a closed balloon takes no clicks');
  b.shown('hint'); b.shown('update');
  assert.equal(b.clicked(), 'update');
});

test('a manual Check that joins a scheduled one makes it the user\'s: turning automatic off neither aborts it nor lets it download', async () => {
  // discovery: the joined check survives automatic-off and shows its result
  let sig;
  const d = deferred();
  const disc = make('discovery', { prefs: { autoCheck: true }, discover: (signal) => { sig = signal; return d.promise; } });
  disc.c.start();
  await disc.clock.advance(FIRST_DELAY_MS);
  const joined = disc.c.check();
  disc.prefs.autoCheck = false; disc.c.prefsChanged();
  assert.equal(sig.aborted, false);
  d.resolve('1.4.0');
  assert.deepEqual([(await joined).phase, disc.notes], ['available', []]);
  // signed: the joined check reports available and does not start a background download
  const sg = make('signed');
  sg.c.start();
  await sg.clock.advance(FIRST_DELAY_MS);
  const p = sg.c.check();
  sg.updater.checks[0].resolve({ available: true, version: '1.4.0' });
  assert.equal((await p).phase, 'available');
  assert.equal(sg.updater.downloads.length, 0);
});

test('signed: an install that fails keeps the download ready with an install error; Restart and install can be tried again', async () => {
  const u = fakeUpdater();
  let report;
  // the first try fails at once (reported synchronously, as BaseUpdater.install does), the second starts
  u.install = (onError) => { u.installs++; report = onError; if (u.installs === 1) { onError(new Error('No update filepath provided')); return false; } return true; };
  const { c } = make('signed', { updater: u, prefs: { autoUpdate: false } });
  const p = c.check();
  u.checks[0].resolve({ available: true, version: '1.4.0' });
  await p;
  c.download(); u.downloads[0].resolve([]); await flush();
  assert.equal(c.install(), false);
  assert.deepEqual([c.get().phase, c.get().errorKind], ['ready', 'install']);
  assert.equal(c.install(), true, 'tried again');
  assert.deepEqual([c.get().phase, c.get().errorKind], ['ready', null]);
  report(new Error('spawn EACCES')); // a later asynchronous failure, while the app still runs
  assert.equal(c.get().errorKind, 'install');
});
test('signed: a ready background download is announced again on scheduled ticks (main shows each version once), never re-downloaded', async () => {
  const { c, clock, updater, prefs, notes } = make('signed');
  c.start();
  await clock.advance(FIRST_DELAY_MS);
  updater.checks[0].resolve({ available: true, version: '1.4.0' });
  await flush();
  updater.downloads[0].resolve([]);
  await flush();
  await clock.advance(EVERY_MS.signed);
  assert.deepEqual(notes, [['ready', '1.4.0'], ['ready', '1.4.0']]);
  assert.deepEqual([updater.checks.length, updater.downloads.length, updater.installs], [1, 1, 0]);
  prefs.autoUpdate = false; c.prefsChanged();
  await clock.advance(5 * EVERY_MS.signed);
  assert.equal(notes.length, 2, 'off: no more notices');
});
test('electron-updater adapter: install failures from the real NsisUpdater reach the controller; nothing is executed', () => {
  const { NsisUpdater } = require('electron-updater');
  const { CancellationToken } = require('builder-util-runtime');
  const app = { version: '1.3.2', name: 'Open World Clock', isPackaged: true, appUpdateConfigPath: 'none.yml', userDataPath: '.', baseCachePath: '.', onQuit() {}, quit() { throw new Error('must not quit'); }, relaunch() {}, whenReady: () => Promise.resolve() };
  const u = new NsisUpdater(null, app);
  const backend = electronUpdaterBackend(u, CancellationToken);
  // 1. nothing downloaded: BaseUpdater.install dispatches "No update filepath provided"
  const errs = [];
  assert.equal(backend.install((e) => errs.push(e.message)), false);
  assert.match(errs[0], /No update filepath/);
  // 2. a downloaded file, but starting the installer throws (doInstall replaced: no installer ever runs)
  Object.defineProperty(u, 'installerPath', { get: () => 'C:\nowhere\setup.exe' });
  u.downloadedUpdateHelper = { file: 'C:\nowhere\setup.exe', downloadedFileInfo: { isAdminRightsRequired: false } };
  let ran = 0;
  u.doInstall = () => { ran++; throw new Error('cannot start the installer'); };
  const errs2 = [];
  assert.equal(backend.install((e) => errs2.push(e.message)), false);
  assert.deepEqual([ran, errs2], [1, ['cannot start the installer']]);
  assert.equal(u.quitAndInstallCalled, false, 'electron-updater allows another try');
  // each attempt's listener is gone once it failed; a retry gets exactly one callback, earlier attempts none
  const base = u.listenerCount('error');
  const calls = [0, 0, 0];
  for (let i = 0; i < 3; i++) backend.install(() => { calls[i]++; });
  assert.deepEqual(calls, [1, 1, 1]);
  assert.equal(u.listenerCount('error'), base, 'no listener left behind');
  // an attempt that started (no error yet) is replaced by the next one, then a late error reaches only the latest
  u.doInstall = () => true;
  u.quitAndInstall = () => {}; // started: the app would quit now (not here)
  const late = [0, 0];
  backend.install(() => { late[0]++; });
  backend.install(() => { late[1]++; });
  assert.equal(u.listenerCount('error'), base + 1);
  u.emit('error', new Error('spawn EACCES'));
  assert.deepEqual(late, [0, 1]);
  assert.equal(u.listenerCount('error'), base);
});
