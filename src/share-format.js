// Pure builders for what the app hands to other programs (no Electron import; unit-tested in test/unit/share-format.test.js):
//   buildIcs(request)        a calendar invite (.ics, RFC 5545) for one event, or null when the request is not valid
//   htmlTable(caption, rows) the rich clipboard version of "Copy times" (Outlook and Teams paste it as a table)
// main.js validates the renderer's input again through these, so the page never sends HTML or calendar text itself.
// The same file runs in the browser: scripts/build-web.mjs puts it in front of web/shim.js (window.WCShareFormat), so the
// web app's calendar download is built and checked by exactly this code.

const WEEK_MS = 7 * 86400000;
const MAX_MS = Date.UTC(9999, 11, 31, 23, 59, 59);

// RFC 5545 TEXT: backslash, semicolon and comma are escaped, a line break becomes \n.
const icsText = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');

// Content lines are folded at 75 octets (UTF-8): the continuation starts with one space, which counts toward the 75.
// Splits between code points only, so a multibyte character is never cut in half.
const utf8Bytes = (ch) => { const c = ch.codePointAt(0); return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; };
function foldLine(line) {
  const out = [];
  let cur = '', bytes = 0;
  for (const ch of line) {
    const b = utf8Bytes(ch);
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

// 20260924T150000Z
const icsUtc = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[-:]/g, '');

// { startMs, endMs, title, description } from the page: whole seconds (a calendar keeps no milliseconds, so a time that
// would be rounded is refused, never moved), from 1970 to the year 9999, end after start and at most 7 days later, a
// title of 1 to 100 characters and a description of at most 2000. Returns the cleaned request or null.
function validIcsRequest(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  const { startMs, endMs, title, description = '' } = r;
  if (!Number.isInteger(startMs) || !Number.isInteger(endMs) || startMs % 1000 || endMs % 1000) return null;
  if (startMs <= 0 || endMs > MAX_MS || endMs <= startMs || endMs - startMs > WEEK_MS) return null;
  if (typeof title !== 'string' || !title.trim() || title.length > 100) return null;
  if (typeof description !== 'string' || description.length > 2000) return null;
  return { startMs, endMs, title: title.trim(), description };
}

// One VEVENT in UTC, CRLF line endings. `uid` and `now` are passed in (crypto.randomUUID() and Date.now() in main).
function buildIcs(request, { uid, now } = {}) {
  const r = validIcsRequest(request);
  if (!r || typeof uid !== 'string' || !uid || !Number.isFinite(now)) return null;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Open World Clock//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}@openworldclock.com`,
    `DTSTAMP:${icsUtc(now)}`,
    `DTSTART:${icsUtc(r.startMs)}`,
    `DTEND:${icsUtc(r.endMs)}`,
    `SUMMARY:${icsText(r.title)}`,
    ...(r.description ? [`DESCRIPTION:${icsText(r.description)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// rows: [[city, time, date], ...] (1 to 50 rows of 3 strings, each at most 200 characters). Null when not valid.
function validRows(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 50) return null;
  if (!rows.every((r) => Array.isArray(r) && r.length === 3 && r.every((c) => typeof c === 'string' && c.length <= 200))) return null;
  return rows;
}

// The caption line, then a plain table (inline styles only: mail clients drop style sheets). Everything escaped.
function htmlTable(caption, rows) {
  if (!validRows(rows)) return null;
  const td = 'padding:2px 14px 2px 0;';
  const body = rows.map(([city, time, date]) =>
    `<tr><td style="${td}font-weight:600">${escapeHtml(city)}</td><td style="${td}">${escapeHtml(time)}</td><td style="${td}">${escapeHtml(date)}</td></tr>`).join('');
  const cap = caption ? `<p style="margin:0 0 4px">${escapeHtml(String(caption).slice(0, 300))}</p>` : '';
  return `${cap}<table style="border-collapse:collapse">${body}</table>`;
}

const api = { buildIcs, validIcsRequest, foldLine, icsText, htmlTable, validRows, escapeHtml };
if (typeof module === 'object' && module && module.exports) module.exports = api;
else if (typeof window === 'object') window.WCShareFormat = Object.freeze(api);
