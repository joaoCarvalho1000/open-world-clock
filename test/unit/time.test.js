// Unit tests for the pure time helpers in src/renderer/time.js (window.WCTime). Run: node --test test/unit
// Signatures assumed (same as the originals in app.js):
//   offsetMinutes(zone, date) -> minutes east of UTC
//   zonedToEpoch(zone, y, m, d, h, mi) -> epoch ms (gap: pre-transition offset; overlap: earlier instant)
//   dayDiff(zone, date, refZone) -> calendar-day difference of zone vs refZone at date
//   parseTime(text) -> [h, mi] | null
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const file = path.resolve(__dirname, '../../src/renderer/time.js');
const exists = fs.existsSync(file);
let T = null;
if (exists) {
  const window = {};
  const ctx = vm.createContext({ window, Intl, Date, Math, console, globalThis: window, self: window });
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  T = window.WCTime;
}
const skip = exists ? false : 'src/renderer/time.js not present yet (renderer extraction pending)';

const iso = (ms) => new Date(ms).toISOString().slice(0, 16) + 'Z';

test('exports the WCTime API', { skip }, () => {
  assert.ok(T, 'window.WCTime is defined');
  for (const k of ['offsetMinutes', 'zonedToEpoch', 'dayDiff', 'parseTime', 'phaseOf', 'formatOffset', 'uniqueClocks', 'workSpans', 'worksThroughout', 'findTimes']) assert.equal(typeof T[k], 'function', k);
});

test('offsetMinutes: fixed and DST zones', { skip }, () => {
  assert.equal(T.offsetMinutes('Asia/Kathmandu', new Date('2026-07-01T12:00Z')), 345);
  assert.equal(T.offsetMinutes('Asia/Kathmandu', new Date('2026-01-01T12:00Z')), 345);
  assert.equal(T.offsetMinutes('America/New_York', new Date('2026-01-15T12:00Z')), -300);
  assert.equal(T.offsetMinutes('America/New_York', new Date('2026-07-15T12:00Z')), -240);
  assert.equal(T.offsetMinutes('Europe/Lisbon', new Date('2026-01-15T12:00Z')), 0);
  assert.equal(T.offsetMinutes('Europe/Lisbon', new Date('2026-07-15T12:00Z')), 60);
  assert.equal(T.offsetMinutes('Pacific/Kiritimati', new Date('2026-07-01T12:00Z')), 840);
  assert.equal(T.offsetMinutes('Pacific/Pago_Pago', new Date('2026-07-01T12:00Z')), -660);
});

test('zonedToEpoch: America/New_York DST gap and overlap (2026)', { skip }, () => {
  // Spring forward 2026-03-08 02:00 EST -> 03:00 EDT; 02:30 does not exist, resolves with pre-transition offset.
  assert.equal(iso(T.zonedToEpoch('America/New_York', 2026, 3, 8, 2, 30)), '2026-03-08T07:30Z');
  assert.equal(iso(T.zonedToEpoch('America/New_York', 2026, 3, 8, 1, 30)), '2026-03-08T06:30Z');
  assert.equal(iso(T.zonedToEpoch('America/New_York', 2026, 3, 8, 3, 30)), '2026-03-08T07:30Z');
  // Fall back 2026-11-01: 01:30 occurs twice (EDT 05:30Z, EST 06:30Z); earlier instant chosen.
  assert.equal(iso(T.zonedToEpoch('America/New_York', 2026, 11, 1, 1, 30)), '2026-11-01T05:30Z');
  assert.equal(iso(T.zonedToEpoch('America/New_York', 2026, 11, 1, 3, 0)), '2026-11-01T08:00Z');
});

test('zonedToEpoch: Europe/Lisbon DST gap and overlap (2026)', { skip }, () => {
  // Spring forward 2026-03-29 01:00 WET -> 02:00 WEST; 01:30 does not exist.
  assert.equal(iso(T.zonedToEpoch('Europe/Lisbon', 2026, 3, 29, 1, 30)), '2026-03-29T01:30Z');
  assert.equal(iso(T.zonedToEpoch('Europe/Lisbon', 2026, 3, 29, 2, 30)), '2026-03-29T01:30Z');
  // Fall back 2026-10-25 02:00 WEST -> 01:00 WET; 01:30 occurs twice (00:30Z, 01:30Z).
  assert.equal(iso(T.zonedToEpoch('Europe/Lisbon', 2026, 10, 25, 1, 30)), '2026-10-25T00:30Z');
  assert.equal(iso(T.zonedToEpoch('Europe/Lisbon', 2026, 10, 25, 12, 0)), '2026-10-25T12:00Z');
});

test('zonedToEpoch: Asia/Kathmandu +5:45', { skip }, () => {
  assert.equal(iso(T.zonedToEpoch('Asia/Kathmandu', 2026, 7, 1, 12, 0)), '2026-07-01T06:15Z');
});

test('dayDiff: Kiritimati (+14) vs Pago Pago (-11) spans 2 days in the right window', { skip }, () => {
  // 10:00Z-10:59Z: Kiritimati already Jul 2 00:xx, Pago Pago still Jun 30 23:xx.
  assert.equal(T.dayDiff('Pacific/Kiritimati', new Date('2026-07-01T10:30Z'), 'Pacific/Pago_Pago'), 2);
  assert.equal(T.dayDiff('Pacific/Pago_Pago', new Date('2026-07-01T10:30Z'), 'Pacific/Kiritimati'), -2);
  // Just before (09:59Z) Kiritimati is Jul 1 23:59 -> 1 day; just after (11:00Z) Pago Pago reaches Jul 1 -> 1 day.
  assert.equal(T.dayDiff('Pacific/Kiritimati', new Date('2026-07-01T09:59Z'), 'Pacific/Pago_Pago'), 1);
  assert.equal(T.dayDiff('Pacific/Kiritimati', new Date('2026-07-01T11:00Z'), 'Pacific/Pago_Pago'), 1);
  assert.equal(T.dayDiff('Europe/Lisbon', new Date('2026-07-01T12:00Z'), 'Europe/Lisbon'), 0);
});

test('parseTime cases', { skip }, () => {
  const cases = [
    ['9', [9, 0]], ['930', [9, 30]], ['9:30', [9, 30]], ['3pm', [15, 0]],
    ['12am', [0, 0]], ['12pm', [12, 0]], ['1230pm', [12, 30]],
    ['0am', null], ['12:60', null], ['25:00', null], ['abc', null],
  ];
  for (const [input, want] of cases) assert.deepEqual(JSON.parse(JSON.stringify(T.parseTime(input))), want, JSON.stringify(input)); // normalize cross-realm arrays
});

test('splitTimePlace: a time with a place, either order, with the connector words', { skip }, () => {
  assert.equal(typeof T.splitTimePlace, 'function');
  const norm = (r) => JSON.parse(JSON.stringify(r));
  const cases = [
    ['3pm tokyo', [15, 0], 'tokyo'], ['3 pm in Tokyo', [15, 0], 'Tokyo'], ['15:00 EST', [15, 0], 'EST'],
    ['15h30 lisboa', [15, 30], 'lisboa'], ['tokyo 3pm', [15, 0], 'tokyo'], ['Tokyo at 3pm', [15, 0], 'Tokyo'],
    ['às 15h em Lisboa', [15, 0], 'Lisboa'], ['a las 3pm en Madrid', [15, 0], 'Madrid'], ['3pm new york', [15, 0], 'new york'],
    ['New York 9:30', [9, 30], 'New York'], ['9 india', [9, 0], 'india'], ['15:00 in São Paulo.', [15, 0], 'São Paulo'],
  ];
  for (const [input, time, place] of cases) assert.deepEqual(norm(T.splitTimePlace(input)), { time, place }, JSON.stringify(input));
  // a plain time takes the plain path, and a place alone or a bad time is not a time with a place
  for (const input of ['3pm', '3 pm', '15:00', '9', 'tokyo', '', '25:00 tokyo', 'tokyo 13pm', '3 p', '3 am']) assert.equal(T.splitTimePlace(input), null, JSON.stringify(input));
});

test('phaseOf boundaries', { skip }, () => {
  const label = (h) => { const p = T.phaseOf(h); return Array.isArray(p) ? p[0] : (p && (p.key || p.id || p.name)) || p; };
  assert.equal(label(3), 'night');
  assert.equal(label(9), 'morning');
  assert.equal(label(22), 'night');
});

// First run: default cities that show the same time as another all year are left out (keep the first of each group).
test('uniqueClocks keeps the first zone of each same-time group', { skip }, () => {
  const u = (zones, ref) => JSON.parse(JSON.stringify(T.uniqueClocks(zones, ref))); // normalize cross-realm arrays
  const SEP = Date.UTC(2026, 8, 23, 12); // Sep 23 2026: northern DST still on
  const DEC = Date.UTC(2026, 11, 1, 12);
  const DEFAULTS = ['Europe/Lisbon', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Singapore'];
  for (const ref of [SEP, DEC]) {
    // Sao Paulo user: local city first, London dropped (same clock as Lisbon all year)
    assert.deepEqual(u(['America/Sao_Paulo', ...DEFAULTS], ref), ['America/Sao_Paulo', 'Europe/Lisbon', 'America/New_York', 'America/Los_Angeles', 'Asia/Singapore']);
    // London first: Lisbon and the repeated London go
    assert.deepEqual(u(['Europe/London', 'Europe/Lisbon', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Singapore'], ref),
      ['Europe/London', 'America/New_York', 'America/Los_Angeles', 'Asia/Singapore']);
    // Dublin (GMT in winter, IST in summer) shares both offsets with Lisbon and London: both are dropped
    assert.deepEqual(u(['Europe/Dublin', ...DEFAULTS], ref), ['Europe/Dublin', 'America/New_York', 'America/Los_Angeles', 'Asia/Singapore']);
    // Half and quarter hour offsets are their own clocks
    assert.deepEqual(u(['Asia/Kolkata', 'Asia/Kathmandu'], ref), ['Asia/Kolkata', 'Asia/Kathmandu']);
    // Same winter offset, different DST rules: both stay (Phoenix has no DST)
    assert.deepEqual(u(['America/Phoenix', 'America/Denver'], ref), ['America/Phoenix', 'America/Denver']);
    assert.deepEqual(u(['America/Denver', 'America/Phoenix'], ref), ['America/Denver', 'America/Phoenix']);
    // Same offset in the northern summer only (Lisbon +1 vs Lagos +1 all year): both stay
    assert.deepEqual(u(['Europe/Lisbon', 'Africa/Lagos'], ref), ['Europe/Lisbon', 'Africa/Lagos']);
    // Same clock all year: Singapore and Kuala Lumpur, New York and Toronto
    assert.deepEqual(u(['Asia/Singapore', 'Asia/Kuala_Lumpur', 'America/New_York', 'America/Toronto'], ref), ['Asia/Singapore', 'America/New_York']);
  }
  // A Tokyo or New York user keeps 5 of the 6 cards
  assert.equal(u(['Asia/Tokyo', ...DEFAULTS], SEP).length, 5);
  assert.deepEqual(u(DEFAULTS, SEP), ['Europe/Lisbon', 'America/New_York', 'America/Los_Angeles', 'Asia/Singapore']);
  assert.deepEqual(u([], SEP), []);
  // An unknown zone is kept as its own group instead of throwing
  assert.deepEqual(u(['Bad/Zone', 'Europe/Lisbon'], SEP), ['Bad/Zone', 'Europe/Lisbon']);
});

// Whole-interval coverage: exact at offset changes and schedule edges, never two endpoint samples.
test('workSpans / worksThroughout: Lord Howe rollback inside a Kathmandu 20:00 hour', { skip }, () => {
  const plain = (v) => JSON.parse(JSON.stringify(v));
  const LH = 'Australia/Lord_Howe', hours = { start: '01:00', end: '01:45', days: [0] }; // Sunday 01:00 to 01:45
  const a = T.zonedToEpoch('Asia/Kathmandu', 2026, 4, 4, 20, 0), b = a + 3600000;
  assert.equal(iso(a), '2026-04-04T14:15Z');
  // Lord Howe goes from +11 to +10:30 at 15:00Z (02:00 back to 01:30): 01:15 to 02:00, then 01:30 to 01:45 again.
  // Both ends work; 14:45Z to 15:00Z (01:45 to 02:00 local) does not.
  assert.deepEqual(plain(T.workSpans(LH, hours, a, b)), [[a, Date.UTC(2026, 3, 4, 14, 45)], [Date.UTC(2026, 3, 4, 15, 0), b]]);
  assert.equal(T.worksThroughout(LH, hours, a, b), false);
  assert.equal(T.worksThroughout(LH, hours, a, a + 30 * 60000), true);
  // empty and reversed intervals never count
  assert.deepEqual(plain(T.workSpans(LH, hours, a, a)), []);
  assert.equal(T.worksThroughout(LH, hours, b, a), false);
  // Monrovia 1971 (UTC-0:44:30): 09:00 local starts at 09:44:30Z exactly
  const mon = Date.UTC(1971, 0, 1, 9, 44, 30), day = { start: '09:00', end: '10:00', days: [5] };
  assert.equal(T.worksThroughout('Africa/Monrovia', day, mon, mon + 3600000), true);
  assert.equal(T.worksThroughout('Africa/Monrovia', day, mon - 1000, mon + 3600000), false);
  // an overnight shift crosses midnight into Saturday
  const ny = { start: '22:00', end: '06:00', days: [5] }, fri22 = T.zonedToEpoch('America/New_York', 2026, 10, 16, 22, 0);
  assert.equal(T.worksThroughout('America/New_York', ny, fri22, fri22 + 8 * 3600000), true);
  assert.equal(T.worksThroughout('America/New_York', ny, fri22, fri22 + 9 * 3600000), false);
});

test('findTimes: a city counts only when it works for the whole meeting', { skip }, () => {
  const plain = (v) => JSON.parse(JSON.stringify(v));
  const NY = 'America/New_York', wd = [1, 2, 3, 4, 5];
  const zones = [NY, 'America/Toronto', 'America/Detroit'];
  const hours = [{ start: '09:00', end: '11:00', days: wd }, { start: '09:00', end: '10:00', days: wd }, { start: '10:00', end: '11:00', days: wd }];
  const starts = Array.from({ length: 24 }, (_, h) => T.zonedToEpoch(NY, 2026, 10, 14, h, 0)); // Wednesday
  const at = (h, m = 0) => T.zonedToEpoch(NY, 2026, 10, 14, h, m);
  // Two hours from 09:00: Toronto works the first hour and Detroit the second, so only New York is there throughout.
  const two = plain(T.findTimes(zones, hours, starts, 2 * 3600000, [0], 3));
  assert.deepEqual(two.full, []);
  assert.deepEqual(two.partial, [{ startMs: at(9), endMs: at(11), working: 1, total: 3, out: [1, 2] }]);
  // One hour: 09:00 has New York and Toronto, 10:00 New York and Detroit; neither is everyone.
  const one = plain(T.findTimes(zones, hours, starts, 3600000, [0], 3));
  assert.deepEqual(one.full, []);
  assert.deepEqual(one.partial.map((r) => [r.startMs, r.working, r.out]), [[at(9), 2, [2]], [at(10), 2, [1]]]);
  // Everyone at 10:00 once Toronto works until 11:00; listed results never overlap each other.
  const wide = [hours[0], { start: '09:00', end: '11:00', days: wd }, hours[2]];
  assert.deepEqual(plain(T.findTimes(zones, wide, starts, 3600000, [0], 3)).full, [{ startMs: at(10), endMs: at(11), working: 3, total: 3, out: [] }]);
  // Sunday: nobody works, nothing to offer; duplicate, invalid starts and a nonpositive length are ignored.
  const sun = Array.from({ length: 24 }, (_, h) => T.zonedToEpoch(NY, 2026, 10, 18, h, 0));
  assert.deepEqual(plain(T.findTimes(zones, hours, sun, 3600000, [0], 3)), { full: [], partial: [] });
  assert.deepEqual(plain(T.findTimes(zones, hours, [at(10), at(10), NaN], 3600000, [], 3)).partial.length, 1);
  assert.deepEqual(plain(T.findTimes(zones, hours, starts, 0, [], 3)), { full: [], partial: [] });
  // Minute schedules: two cities working 09:10 to 10:10 fit a one-hour meeting at 09:10, which no whole hour does.
  const ten = { start: '09:10', end: '10:10', days: wd };
  const lisbon = ['Europe/Lisbon', 'Europe/London'], lStarts = Array.from({ length: 24 }, (_, h) => T.zonedToEpoch('Europe/Lisbon', 2026, 10, 14, h, 0));
  const lEnd = T.zonedToEpoch('Europe/Lisbon', 2026, 10, 15, 0, 0);
  assert.deepEqual(plain(T.findTimes(lisbon, [ten, ten], lStarts, 3600000, [], 3)).full, [], 'whole hours alone miss it');
  const minute = plain(T.findTimes(lisbon, [ten, ten], lStarts, 3600000, [], 3, lEnd));
  assert.deepEqual(minute.full.map((r) => [iso(r.startMs), iso(r.endMs)]), [['2026-10-14T08:10Z', '2026-10-14T09:10Z']]);
  // A bounded search stays fast with 50 cities: 15 days of two-hour meetings.
  const many = Intl.supportedValuesOf('timeZone').slice(0, 50), mh = many.map(() => ({ start: '09:00', end: '18:00', days: wd }));
  const t0 = Date.now();
  for (let k = 0; k < 15; k++) {
    const st = Array.from({ length: 24 }, (_, h) => T.zonedToEpoch('UTC', 2026, 10, 14 + k, h, 0));
    T.findTimes(many, mh, st, 2 * 3600000, [0], 3, st[0] + 86400000);
  }
  const took = Date.now() - t0;
  console.log(`findTimes: 50 cities x 15 days in ${took} ms`);
  assert.ok(took < 1500, `took ${took} ms`);
});

test('fmt: the formatter cache is an LRU capped at 300; a hit returns the same instance', { skip }, () => {
  const zones = Intl.supportedValuesOf('timeZone');
  const first = T.fmt('Europe/Lisbon', { hour: '2-digit' }, 'en-US');
  assert.equal(T.fmt('Europe/Lisbon', { hour: '2-digit' }, 'en-US'), first);
  for (let i = 0; i < 1000; i++) T.fmt(zones[i % zones.length], { hour: '2-digit', minute: i % 3 ? '2-digit' : undefined }, i % 2 ? 'en-US' : 'pt-BR');
  assert.ok(T._fmtSize() <= 300, `size ${T._fmtSize()}`);
  // recently used stays: touch one key between inserts and it is never evicted
  const keep = T.fmt('Asia/Tokyo', { weekday: 'long' }, 'es-ES');
  for (let i = 0; i < 400; i++) { T.fmt(zones[i % zones.length], { second: '2-digit' }, 'en-GB'); T.fmt('Asia/Tokyo', { weekday: 'long' }, 'es-ES'); }
  assert.equal(T.fmt('Asia/Tokyo', { weekday: 'long' }, 'es-ES'), keep);
  assert.ok(T._fmtSize() <= 300);
});

test('offsetMinutesUncached matches offsetMinutes and leaves the cache alone', { skip }, () => {
  const d = new Date(Date.UTC(2026, 6, 1, 12));
  const before = T._fmtSize();
  for (const z of ['Asia/Kolkata', 'America/St_Johns', 'Pacific/Chatham', 'Europe/Lisbon']) {
    assert.equal(T.offsetMinutesUncached(z, d), T.offsetMinutes(z, d), z);
  }
  const size = T._fmtSize();
  for (const z of Intl.supportedValuesOf('timeZone').slice(0, 100)) T.offsetMinutesUncached(z, d);
  assert.equal(T._fmtSize(), size);
  assert.ok(size >= before);
});
