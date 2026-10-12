// Unit tests for src/share-format.js: the calendar invite (.ics) and the rich clipboard table.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildIcs, validIcsRequest, foldLine, icsText, htmlTable, validRows } = require('../../src/share-format');

const START = Date.UTC(2026, 8, 24, 15, 0);
const REQ = { startMs: START, endMs: START + 3600000, title: 'Meeting', description: 'When it is 15:00 in Lisbon:\n15:00 Lisbon · Thu, Sep 24' };
const OPTS = { uid: '0f8fad5b-d9cb-469f-a165-70867728950e', now: Date.UTC(2026, 8, 24, 10, 30, 5) };

test('buildIcs: one VEVENT in UTC with CRLF line endings', () => {
  const ics = buildIcs(REQ, OPTS);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Open World Clock//EN\r\n'));
  assert.ok(ics.endsWith('END:VEVENT\r\nEND:VCALENDAR\r\n'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.match(ics, /\r\nDTSTART:20260924T150000Z\r\n/);
  assert.match(ics, /\r\nDTEND:20260924T160000Z\r\n/);
  assert.match(ics, /\r\nDTSTAMP:20260924T103005Z\r\n/);
  assert.match(ics, /\r\nUID:0f8fad5b-d9cb-469f-a165-70867728950e@openworldclock\.com\r\n/);
  assert.ok(!/[^\r]\n/.test(ics), 'every line break is CRLF');
});

test('icsText escapes backslash, semicolon, comma and line breaks', () => {
  assert.equal(icsText('a\\b;c,d\ne\r\nf'), 'a\\\\b\\;c\\,d\\ne\\nf');
  const ics = buildIcs({ ...REQ, title: 'Sync; team, all', description: 'line 1\nline 2' }, OPTS);
  assert.match(ics, /\r\nSUMMARY:Sync\\; team\\, all\r\n/);
  assert.match(ics, /\r\nDESCRIPTION:line 1\\nline 2\r\n/);
});

test('foldLine folds at 75 octets and never splits a multibyte character', () => {
  const long = 'DESCRIPTION:' + 'x'.repeat(200);
  const lines = foldLine(long).split('\r\n');
  assert.equal(Buffer.byteLength(lines[0]), 75);
  for (const l of lines.slice(1)) { assert.ok(l.startsWith(' ')); assert.ok(Buffer.byteLength(l) <= 75); }
  assert.equal(lines.map((l, i) => (i ? l.slice(1) : l)).join(''), long);
  const multi = 'SUMMARY:' + 'São Paulo e Zürich '.repeat(8) + '東京';
  const ml = foldLine(multi).split('\r\n');
  for (const l of ml) assert.ok(Buffer.byteLength(l) <= 75, `${Buffer.byteLength(l)} octets`);
  assert.equal(ml.map((l, i) => (i ? l.slice(1) : l)).join(''), multi);
  assert.ok(!ml.join('').includes('�'));
  const ics = buildIcs({ ...REQ, description: 'Ação à São Paulo, 東京 '.repeat(40) }, OPTS);
  for (const l of ics.split('\r\n')) assert.ok(Buffer.byteLength(l) <= 75);
});

test('validIcsRequest refuses end <= start, spans over 7 days, NaN and bad text', () => {
  assert.equal(validIcsRequest({ ...REQ, endMs: START }), null);
  assert.equal(validIcsRequest({ ...REQ, endMs: START - 1 }), null);
  assert.equal(validIcsRequest({ ...REQ, endMs: START + 7 * 86400000 + 1 }), null);
  assert.ok(validIcsRequest({ ...REQ, endMs: START + 7 * 86400000 }));
  assert.equal(validIcsRequest({ ...REQ, startMs: NaN }), null);
  assert.equal(validIcsRequest({ ...REQ, endMs: Infinity }), null);
  assert.equal(validIcsRequest({ ...REQ, startMs: String(START) }), null);
  assert.equal(validIcsRequest({ ...REQ, title: '' }), null);
  assert.equal(validIcsRequest({ ...REQ, title: 'x'.repeat(101) }), null);
  assert.equal(validIcsRequest({ ...REQ, description: 'x'.repeat(2001) }), null);
  assert.equal(validIcsRequest(null), null);
  assert.equal(validIcsRequest([REQ]), null);
  assert.equal(buildIcs({ ...REQ, endMs: START }, OPTS), null);
  assert.equal(buildIcs(REQ, { now: OPTS.now }), null, 'needs a uid');
});

test('htmlTable escapes every cell and the caption; rows are checked', () => {
  const html = htmlTable('When it is 15:00 in <Lisbon>:', [['<b>&', '15:00', 'Thu, Sep 24'], ['New "York"', "10:00", "it's"]]);
  assert.match(html, /<table/);
  assert.ok(html.includes('&lt;b&gt;&amp;'));
  assert.ok(html.includes('New &quot;York&quot;'));
  assert.ok(html.includes('it&#39;s'));
  assert.ok(html.includes('&lt;Lisbon&gt;'));
  assert.ok(!html.includes('<b>'));
  assert.equal(htmlTable('x', Array.from({ length: 51 }, () => ['a', 'b', 'c'])), null);
  assert.ok(htmlTable('x', Array.from({ length: 50 }, () => ['a', 'b', 'c'])));
  assert.equal(validRows('rows'), null);
  assert.equal(validRows([]), null);
  assert.equal(validRows([['a', 'b']]), null);
  assert.equal(validRows([['a', 'b', 3]]), null);
  assert.equal(validRows([['a', 'b', 'x'.repeat(201)]]), null);
});

test('validIcsRequest: whole positive seconds only, never rounded; bounded; the browser gets the same builder', () => {
  const ok = (a, b) => validIcsRequest({ startMs: a, endMs: b, title: 'Meeting' });
  assert.ok(ok(START, START + 1000));
  assert.equal(ok(START + 500, START + 3600000), null, 'milliseconds are refused, not rounded');
  assert.equal(ok(START, START + 3600000.5), null);
  assert.equal(ok(0, 3600000), null, 'the epoch itself is not a positive start');
  assert.equal(ok(-3600000, 0), null);
  assert.equal(ok(START, START), null);
  assert.equal(ok(START, START + 7 * 86400000 + 1000), null, 'over 7 days');
  assert.ok(ok(Date.UTC(9999, 11, 31, 22, 0), Date.UTC(9999, 11, 31, 23, 0)));
  assert.equal(ok(Date.UTC(9999, 11, 31, 23, 0), Date.UTC(10000, 0, 1, 1, 0)), null, 'past the year 9999');
  // a year boundary and a multibyte title: CRLF only, folded at 75 octets without splitting a character
  const ics = buildIcs({ startMs: Date.UTC(2026, 11, 31, 23, 30), endMs: Date.UTC(2027, 0, 1, 1, 0), title: 'Reunião '.repeat(12).trim(), description: '東京 São Paulo\n'.repeat(20) }, OPTS);
  assert.match(ics, /\r\nDTSTART:20261231T233000Z\r\nDTEND:20270101T010000Z\r\n/);
  assert.equal(ics.replace(/\r\n/g, '').includes('\n'), false, 'no bare LF');
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75, `line over 75 octets: ${line}`);
  assert.equal(Buffer.from(ics, 'utf8').toString('utf8'), ics, 'valid UTF-8 (no split code points)');
  // the browser copy (window.WCShareFormat, as build-web injects it) gives the same bytes
  const vm = require('vm'), fs = require('fs'), path = require('path');
  const win = {};
  vm.runInNewContext(`(function () {\n${fs.readFileSync(path.join(__dirname, '../../src/share-format.js'), 'utf8')}})();`, { window: win });
  assert.equal(win.WCShareFormat.buildIcs({ ...REQ, title: 'Reunião 東京' }, OPTS), buildIcs({ ...REQ, title: 'Reunião 東京' }, OPTS));
});
