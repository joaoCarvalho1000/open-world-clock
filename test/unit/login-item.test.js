// Unit tests for src/login-item.js: launch at login follows what Windows has (Task Manager > Startup apps).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loginItemAction } = require('../../src/login-item');

const S = path.sep;
const root = process.platform === 'win32' ? 'C:' + S : S;
const dir = root + ['Users', 'joao', 'AppData', 'Local', 'Programs', 'world-clock-widget'].join(S);
const exe = dir + S + 'Open World Clock.exe';
const item = (p, enabled = true) => ({ name: 'io.joao.worldclock', path: p, args: [], scope: 'user', enabled });

test('no Run entry while the setting is on: show it off', () => {
  assert.equal(loginItemAction({ want: true, item: null, exe }), 'settingOff');
  assert.equal(loginItemAction({ want: true, item: undefined, exe }), 'settingOff');
});

test('entry turned off in Task Manager: show it off, do not rewrite it', () => {
  assert.equal(loginItemAction({ want: true, item: item(exe, false), exe }), 'settingOff');
  // also when it points at an old exe: the user's off wins over the upgrade repair
  assert.equal(loginItemAction({ want: true, item: item(dir + S + 'World Clock.exe', false), exe }), 'settingOff');
});

test('enabled entry for this exe: nothing to do (path case does not matter)', () => {
  assert.equal(loginItemAction({ want: true, item: item(exe), exe }), 'none');
  if (process.platform === 'win32') assert.equal(loginItemAction({ want: true, item: item(exe.toUpperCase()), exe }), 'none');
  assert.equal(loginItemAction({ want: true, item: item(dir + S + '.' + S + 'Open World Clock.exe'), exe }), 'none');
});

test('enabled entry at an old World Clock.exe path: rewrite it for this exe', () => {
  assert.equal(loginItemAction({ want: true, item: item(dir + S + 'World Clock.exe'), exe }), 'rewrite');
  assert.equal(loginItemAction({ want: true, item: item(dir + S + 'Free World Clock.exe'), exe }), 'rewrite');
  assert.equal(loginItemAction({ want: true, item: item(''), exe }), 'rewrite');
});

// Electron parses the Run value as a command line and writes it unquoted, so the entry for "...\Open World Clock.exe"
// comes back as path "...\Open" with args ["World", "Clock.exe"] (seen on a real machine with Electron 44).
const split = (p, enabled = true) => { const [first, ...rest] = p.split(' '); return { ...item(first, enabled), args: rest }; };
test('entry split at the spaces of an unquoted path: still this exe, no rewrite on every focus', () => {
  const spaced = root + ['Users', 'John Smith', 'AppData', 'Local', 'Programs', 'world-clock-widget', 'Open World Clock.exe'].join(S);
  assert.equal(loginItemAction({ want: true, item: split(exe), exe }), 'none');
  assert.equal(loginItemAction({ want: true, item: split(spaced), exe: spaced }), 'none');
  assert.equal(loginItemAction({ want: true, item: split(dir + S + 'World Clock.exe'), exe }), 'rewrite');
  assert.equal(loginItemAction({ want: true, item: split(exe, false), exe }), 'settingOff');
});

test('setting off, Windows has an enabled entry for this exe: show it on (turned back on in Task Manager)', () => {
  assert.equal(loginItemAction({ want: false, item: item(exe), exe }), 'settingOn');
  assert.equal(loginItemAction({ want: false, item: split(exe), exe }), 'settingOn');
  if (process.platform === 'win32') assert.equal(loginItemAction({ want: false, item: item(exe.toUpperCase()), exe }), 'settingOn');
});

test('setting off, no enabled entry for this exe: nothing to do', () => {
  assert.equal(loginItemAction({ want: false, item: null, exe }), 'none');
  assert.equal(loginItemAction({ want: false, item: undefined, exe }), 'none');
  assert.equal(loginItemAction({ want: false, item: item(exe, false), exe }), 'none');
  assert.equal(loginItemAction({ want: false, item: split(exe, false), exe }), 'none');
  assert.equal(loginItemAction({ want: false, item: item(dir + S + 'World Clock.exe'), exe }), 'none');
  assert.equal(loginItemAction({ want: false, item: item(''), exe }), 'none');
  assert.equal(loginItemAction({ want: false, item: item(exe), exe: '' }), 'none');
  assert.equal(loginItemAction(), 'none');
});
