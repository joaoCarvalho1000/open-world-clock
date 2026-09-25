// Unit tests for src/reload-guard.js: a crashing renderer is reloaded with a growing delay, and not forever.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createReloadGuard } = require('../../src/reload-guard');

test('delays double from 500 ms: 500, 1000, 2000, 4000, 8000', () => {
  const g = createReloadGuard({ max: 5, windowMs: 120000 });
  const t0 = 1000000;
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => g.next(t0 + i * 1000)), [500, 1000, 2000, 4000, 8000]);
});

test('the 6th crash within 120 s stops the reloads (null), and so does every later one in the window', () => {
  const g = createReloadGuard({ max: 5, windowMs: 120000 });
  const t0 = 5000000;
  for (let i = 0; i < 5; i++) assert.notEqual(g.next(t0 + i * 10000), null);
  assert.equal(g.next(t0 + 60000), null);
  assert.equal(g.next(t0 + 61000), null);
});

test('crashes older than 120 s no longer count', () => {
  const g = createReloadGuard({ max: 5, windowMs: 120000 });
  const t0 = 9000000;
  for (let i = 0; i < 5; i++) g.next(t0 + i * 1000);
  // every earlier crash is now more than 120 s old: the next one starts over at 500 ms
  assert.equal(g.next(t0 + 4000 + 120001), 500);
  // partly expired: only the crashes inside the window count
  const h = createReloadGuard({ max: 5, windowMs: 120000 });
  h.next(0); h.next(100000); // 2 crashes
  assert.equal(h.next(150000), 1000); // the one at 0 expired: this is the 2nd in the window
});

test('reset() clears the history', () => {
  const g = createReloadGuard({ max: 5, windowMs: 120000 });
  for (let i = 0; i < 6; i++) g.next(i);
  assert.equal(g.next(10), null);
  g.reset();
  assert.equal(g.count, 0);
  assert.equal(g.next(20), 500);
});

test('the delay never goes past 30 s (large max)', () => {
  const g = createReloadGuard({ max: 20, windowMs: 1e9 });
  let last = 0;
  for (let i = 0; i < 20; i++) last = g.next(i);
  assert.equal(last, 30000);
});
