// Unit tests for src/renderer/sun.js (window.WCSun) and zone coordinates in src/renderer/zones.js.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const window = {};
const ctx = vm.createContext({ window, Intl, Date, Math, console, globalThis: window, self: window });
for (const rel of ['../../src/renderer/sun.js', '../../src/renderer/zones.js']) {
  const file = path.resolve(__dirname, rel);
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
}
const S = window.WCSun;

const MIN = 60000;
const near = (actual, expectedMs, tolMin, label) => {
  assert.ok(actual instanceof Date || (actual && typeof actual.getTime === 'function'), label + ' is a Date');
  const diff = Math.abs(actual.getTime() - expectedMs) / MIN;
  assert.ok(diff <= tolMin, `${label}: ${actual.toISOString()} off by ${diff.toFixed(1)} min`);
};
const noonUtc = (y, m, d, lng) => new Date(Date.UTC(y, m - 1, d, 12) - (lng / 15) * 3600000);

test('exports the WCSun API', () => {
  assert.ok(S);
  for (const k of ['times', 'altitude', 'isDay']) assert.equal(typeof S[k], 'function', k);
});

test('Lisbon 2026-06-21 sunrise ~06:12 WEST, sunset ~21:05 WEST', () => {
  const t = S.times(noonUtc(2026, 6, 21, -9.14), 38.72, -9.14);
  assert.equal(t.polar, null);
  near(t.sunrise, Date.UTC(2026, 5, 21, 5, 12), 5, 'sunrise');
  near(t.sunset, Date.UTC(2026, 5, 21, 20, 5), 5, 'sunset');
});

test('Singapore equinox day length ~12h07m', () => {
  const t = S.times(noonUtc(2026, 3, 20, 103.82), 1.35, 103.82);
  const len = (t.sunset - t.sunrise) / MIN;
  assert.ok(Math.abs(len - 727) <= 10, `day length ${len.toFixed(1)} min`);
});

test('Reykjavik 2026-06-21 has a day longer than 20h', () => {
  const t = S.times(noonUtc(2026, 6, 21, -21.94), 64.15, -21.94);
  assert.equal(t.polar, null);
  assert.ok((t.sunset - t.sunrise) / 3600000 > 20);
});

test('Tromso polar day in June, polar night in December', () => {
  const june = S.times(noonUtc(2026, 6, 21, 18.96), 69.65, 18.96);
  assert.equal(june.polar, 'day');
  assert.equal(june.sunrise, null);
  assert.equal(june.sunset, null);
  const dec = S.times(noonUtc(2026, 12, 21, 18.96), 69.65, 18.96);
  assert.equal(dec.polar, 'night');
  assert.equal(dec.sunrise, null);
  assert.equal(dec.sunset, null);
  assert.equal(S.isDay(noonUtc(2026, 6, 21, 18.96), 69.65, 18.96), true);
  assert.equal(S.isDay(new Date(Date.UTC(2026, 5, 21, 23)), 69.65, 18.96), true);
  assert.equal(S.isDay(noonUtc(2026, 12, 21, 18.96), 69.65, 18.96), false);
});

test('Sydney 2026-12-21 sunset ~20:05 AEDT', () => {
  const t = S.times(noonUtc(2026, 12, 21, 151.21), -33.87, 151.21);
  near(t.sunset, Date.UTC(2026, 11, 21, 9, 5), 5, 'sunset');
});

test('isDay is consistent with times', () => {
  const places = [[38.72, -9.14], [1.35, 103.82], [-33.87, 151.21], [40.71, -74.01], [64.15, -21.94]];
  for (const [lat, lng] of places) {
    for (const [m, d] of [[3, 20], [6, 21], [9, 23], [12, 21]]) {
      const t = S.times(noonUtc(2026, m, d, lng), lat, lng);
      if (t.polar) continue;
      assert.equal(S.isDay(new Date(t.sunrise.getTime() + 10 * MIN), lat, lng), true, `after sunrise ${lat},${m}`);
      assert.equal(S.isDay(new Date(t.sunset.getTime() - 10 * MIN), lat, lng), true, `before sunset ${lat},${m}`);
      assert.equal(S.isDay(new Date(t.sunrise.getTime() - 10 * MIN), lat, lng), false, `before sunrise ${lat},${m}`);
      assert.equal(S.isDay(new Date(t.sunset.getTime() + 10 * MIN), lat, lng), false, `after sunset ${lat},${m}`);
      assert.ok(Math.abs(S.altitude(t.sunrise, lat, lng) + 0.833) < 0.05);
    }
  }
});

test('every ZONE_META entry has finite lat/lng in range', () => {
  const meta = window.ZONE_META;
  assert.ok(meta && Object.keys(meta).length > 0);
  for (const [zone, m] of Object.entries(meta)) {
    assert.ok(Number.isFinite(m.lat) && m.lat >= -90 && m.lat <= 90, zone + ' lat');
    assert.ok(Number.isFinite(m.lng) && m.lng >= -180 && m.lng <= 180, zone + ' lng');
  }
});

test('ZONE_COORDS covers the Intl zone list with valid coordinates', () => {
  const c = window.ZONE_COORDS;
  assert.ok(Object.keys(c).length >= 250);
  for (const [zone, v] of Object.entries(c)) {
    assert.ok(Array.isArray(v) && v.length === 2, zone);
    assert.ok(Number.isFinite(v[0]) && Math.abs(v[0]) <= 90 && Number.isFinite(v[1]) && Math.abs(v[1]) <= 180, zone);
  }
  if (typeof Intl.supportedValuesOf === 'function') {
    const missing = Intl.supportedValuesOf('timeZone').filter((z) => !c[z] && !window.ZONE_META[z]);
    assert.ok(missing.length <= 20, 'missing: ' + missing.join(' '));
  }
});
