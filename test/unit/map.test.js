// Unit tests for src/renderer/views/map.js (window.WCMap._internals) and views/world-land.js.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const window = {};
const ctx = vm.createContext({ window, Intl, Date, Math, console, globalThis: window, self: window, Float32Array });
for (const rel of ['../../src/renderer/sun.js', '../../src/renderer/zones.js', '../../src/renderer/views/world-land.js', '../../src/renderer/views/map.js']) {
  const file = path.resolve(__dirname, rel);
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
}
const M = window.WCMap;
const I = M && M._internals;
const S = window.WCSun;
const lngDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

test('exports the WCMap API and internals', () => {
  assert.ok(M);
  for (const k of ['mount', 'update', 'unmount']) assert.equal(typeof M[k], 'function', k);
  for (const k of ['subsolar', 'altitude', 'isNight', 'nightAlpha', 'viewport', 'project', 'placeLabels', 'pickCenter', 'coordsOf']) {
    assert.equal(typeof I[k], 'function', k);
  }
});

test('subsolar latitude follows the seasons', () => {
  const june = I.subsolar(new Date(Date.UTC(2026, 5, 21, 12)));
  const dec = I.subsolar(new Date(Date.UTC(2026, 11, 21, 12)));
  const mar = I.subsolar(new Date(Date.UTC(2026, 2, 20, 12)));
  const sep = I.subsolar(new Date(Date.UTC(2026, 8, 23, 12)));
  assert.ok(Math.abs(june.lat - 23.44) < 0.3, 'june ' + june.lat);
  assert.ok(Math.abs(dec.lat + 23.44) < 0.3, 'december ' + dec.lat);
  assert.ok(Math.abs(mar.lat) < 0.8, 'march ' + mar.lat);
  assert.ok(Math.abs(sep.lat) < 0.8, 'september ' + sep.lat);
});

test('subsolar longitude is ~0 at 12:00 UTC (within the equation of time)', () => {
  for (const [m, d] of [[1, 15], [3, 20], [6, 21], [9, 23], [11, 3], [12, 21]]) {
    const ss = I.subsolar(new Date(Date.UTC(2026, m - 1, d, 12)));
    assert.ok(Math.abs(ss.lng) <= 4.5, `${m}/${d}: ${ss.lng.toFixed(2)}`);
  }
  // six hours later the sun is ~90 deg further west
  const a = I.subsolar(new Date(Date.UTC(2026, 5, 21, 12)));
  const b = I.subsolar(new Date(Date.UTC(2026, 5, 21, 18)));
  assert.ok(lngDiff(a.lng - 90, b.lng) < 0.5, `${a.lng} -> ${b.lng}`);
});

test('the sun is at the zenith at the subsolar point', () => {
  const date = new Date(Date.UTC(2026, 8, 23, 7, 30));
  const ss = I.subsolar(date);
  // (exactly at the zenith asin() can round past 1, so probe half a degree away)
  assert.ok(Math.abs(S.altitude(date, ss.lat + 0.5, ss.lng) - 89.5) < 0.05);
  assert.ok(Math.abs(S.altitude(date, ss.lat, ss.lng - 0.5) - 89.5) < 0.05);
  assert.ok(Math.abs(I.altitude(ss.lat, ss.lng, ss) - 90) < 1e-6);
});

test('night classification matches WCSun.isDay', () => {
  const cities = [[38.72, -9.14], [40.71, -74.01], [35.68, 139.69], [-33.87, 151.21], [1.35, 103.82], [-23.55, -46.63], [51.51, -0.13], [64.15, -21.94]];
  const dates = [];
  for (let h = 0; h < 24; h += 1.5) dates.push(new Date(Date.UTC(2026, 8, 23, 0, h * 60)), new Date(Date.UTC(2026, 11, 21, 0, h * 60 + 7)));
  for (const date of dates) {
    for (const [lat, lng] of cities) {
      const alt = S.altitude(date, lat, lng);
      if (Math.abs(alt + 0.833) < 0.01) continue; // exactly on the threshold
      assert.equal(I.isNight(date, lat, lng), !S.isDay(date, lat, lng), `${lat},${lng} @ ${date.toISOString()}`);
    }
  }
  // concrete: 12:00 UTC on the September equinox is day in Lisbon, night in Tokyo
  const noon = new Date(Date.UTC(2026, 8, 23, 12));
  assert.equal(I.isNight(noon, 38.72, -9.14), false);
  assert.equal(I.isNight(noon, 35.68, 139.69), true);
});

test('night shading is 0 in daylight, 1 at night, monotonic through twilight', () => {
  assert.equal(I.nightAlpha(10), 0);
  assert.equal(I.nightAlpha(-20), 1);
  let prev = -1;
  for (let a = 2; a >= -14; a -= 0.25) { const v = I.nightAlpha(a); assert.ok(v >= prev && v >= 0 && v <= 1); prev = v; }
  assert.ok(I.nightAlpha(-6) > 0.3 && I.nightAlpha(-6) < 0.7);
});

test('viewport fills a wide strip and scrolls a tall narrow view', () => {
  const pts = [[38.72, -9.14], [40.71, -74.01], [35.68, 139.69], [-33.87, 151.21]].map(([lat, lng]) => ({ lat, lng }));
  const strip = I.viewport(1136, 190, pts, window.WCWorldLand);
  assert.equal(strip.scroll, false);
  assert.ok(strip.Cw === 1136);
  assert.ok(strip.sx <= strip.sy * 1.35 + 1e-9 && strip.sx >= strip.sy - 1e-9);
  for (const p of pts) {
    const q = I.project(strip, p.lat, p.lng);
    assert.ok(q.x >= 0 && q.x <= strip.Cw && q.y > 0 && q.y < strip.H, JSON.stringify(q));
  }
  const tall = I.viewport(284, 560, pts, window.WCWorldLand);
  assert.equal(tall.scroll, true);
  assert.ok(tall.Cw > 284);
  assert.ok(Math.abs(tall.sx - tall.sy) < 1e-9);
  // project/unproject round trip
  const q = I.project(strip, 10, 20);
  const r = I.unproject(strip, q.x, q.y);
  assert.ok(Math.abs(r.lat - 10) < 1e-9 && lngDiff(r.lng, 20) < 1e-9);
});

test('pickCenter keeps the seam in the widest empty gap', () => {
  const c = I.pickCenter([-9, -74, 2, 13, 139]);
  // the widest gap is the Pacific (139 -> 286), so the seam sits there and the center opposite it
  assert.ok(lngDiff(c, 32.5) < 0.01, 'center ' + c);
  assert.equal(I.pickCenter([42]), 42);
});

test('label placement avoids overlaps and hides what cannot fit', () => {
  const items = [{ x: 100, y: 50, w: 80, h: 20 }, { x: 104, y: 52, w: 80, h: 20 }, { x: 108, y: 54, w: 80, h: 20 }, { x: 110, y: 50, w: 80, h: 20 }, { x: 112, y: 52, w: 80, h: 20 }];
  const res = I.placeLabels(items, { x: 0, y: 0, w: 400, h: 110 });
  const boxes = res.map((r, i) => r.side && { x: items[i].x + r.dx, y: items[i].y + r.dy, w: items[i].w, h: items[i].h }).filter(Boolean);
  assert.ok(res[0].side, 'highest priority label is placed');
  assert.equal(I.placeLabels([{ x: 100, y: 50, w: 80, h: 20 }], { x: 0, y: 0, w: 400, h: 110 })[0].side, 'r');
  assert.ok(res.some((r) => r.side === null), 'something is hidden');
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    assert.ok(!(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h), `overlap ${i} ${j}`);
  }
  // near the right edge the label flips left
  const edge = I.placeLabels([{ x: 390, y: 50, w: 80, h: 20 }], { x: 0, y: 0, w: 400, h: 110 });
  assert.equal(edge[0].side, 'l');
});

test('zone coordinates come from ZONE_META or ZONE_COORDS', () => {
  const l = I.coordsOf('Europe/Lisbon', window);
  assert.equal(l.lat, 38.72);
  assert.equal(l.lng, -9.14);
  const c = I.coordsOf('Pacific/Tahiti', window);
  assert.ok(c && Math.abs(c.lat + 17.53) < 1e-9);
  assert.equal(I.coordsOf('Nowhere/Nothing', window), null);
});

test('time formatting honors hour12', () => {
  const d = new Date(Date.UTC(2026, 8, 23, 15, 5));
  assert.equal(I.formatTime('UTC', d, false, 'en-US'), '15:05');
  assert.match(I.formatTime('UTC', d, true, 'en-US'), /^3:05\sPM$/);
});

test('world land data loads and is compact', () => {
  const L = window.WCWorldLand;
  assert.ok(L && L.width > 0 && L.height > 0);
  assert.equal(typeof L.d, 'string');
  assert.ok(L.d.length > 1000 && /^M/.test(L.d));
  assert.ok((L.north - L.south) * (L.width / 360) === L.height);
  const bytes = fs.statSync(path.resolve(__dirname, '../../src/renderer/views/world-land.js')).size;
  assert.ok(bytes < 120 * 1024, bytes + ' bytes');
});
