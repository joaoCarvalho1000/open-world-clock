// Pure time helpers (no DOM access). Exposed as window.WCTime.
(() => {
  'use strict';
  // Intl.DateTimeFormat instances are costly to build, so they are cached, but the cache is a small LRU: a few cards
  // in a few formats need well under 300, and a search or a long session over many zones never grows it past that.
  const FMT_CAP = 300;
  const fmtCache = new Map();

  function fmt(zone, opts, locale) {
    const loc = locale || 'en-US';
    const key = loc + '|' + zone + JSON.stringify(opts);
    let f = fmtCache.get(key);
    if (f) { fmtCache.delete(key); fmtCache.set(key, f); return f; } // most recently used goes last
    f = new Intl.DateTimeFormat(loc, { timeZone: zone, ...opts });
    if (fmtCache.size >= FMT_CAP) fmtCache.delete(fmtCache.keys().next().value);
    fmtCache.set(key, f);
    return f;
  }
  function parts(zone, date, opts, locale) {
    const out = {};
    for (const p of fmt(zone, opts, locale).formatToParts(date)) out[p.type] = p.value;
    return out;
  }
  const YMD = { year: 'numeric', month: '2-digit', day: '2-digit' };

  const OFFSET_OPTS = { hourCycle: 'h23', ...YMD, hour: '2-digit', minute: '2-digit', second: '2-digit' };
  function offsetFrom(f, date) {
    const p = {};
    for (const x of f.formatToParts(date)) p[x.type] = x.value;
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return Math.round((asUTC - Math.floor(date.getTime() / 1000) * 1000) / 60000);
  }
  function offsetMinutes(zone, date) { return offsetFrom(fmt(zone, OFFSET_OPTS), date); }
  // The same without the cache, for one-off passes over every zone (an offset search), which would otherwise push
  // the cards' formatters out of it.
  function offsetMinutesUncached(zone, date) { return offsetFrom(new Intl.DateTimeFormat('en-US', { timeZone: zone, ...OFFSET_OPTS }), date); }
  // "+5:30", "-7", "+0"
  function formatOffset(mins) {
    const sign = mins < 0 ? '-' : '+';
    const a = Math.abs(mins), h = Math.floor(a / 60), m = a % 60;
    return `${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`;
  }
  // Convert a wall-clock time in `zone` to an epoch. Handles DST: in an overlap (clock set back) the first
  // occurrence wins; in a gap (clock set forward) the time is shifted forward by the gap, matching OS behavior.
  function zonedToEpoch(zone, y, m, d, h, mi) {
    const wall = Date.UTC(y, m - 1, d, h, mi);
    const DAY = 86400000;
    const offsets = [...new Set([offsetMinutes(zone, new Date(wall - DAY)), offsetMinutes(zone, new Date(wall + DAY))])];
    const valid = offsets.map((o) => wall - o * 60000).filter((e) => offsetMinutes(zone, new Date(e)) * 60000 === wall - e);
    if (valid.length) return Math.min(...valid);
    return wall - offsets[0] * 60000; // gap: use the pre-transition offset
  }
  function dayDiff(zone, date, refZone) {
    const a = parts(zone, date, YMD);
    const b = parts(refZone, date, YMD);
    return Math.round((Date.UTC(+a.year, +a.month - 1, +a.day) - Date.UTC(+b.year, +b.month - 1, +b.day)) / 86400000);
  }
  // Accepts "9", "09", "930", "9:30", "9.30", "3pm", "3 pm", "3:15pm", "15h", "15h30". Returns [h, m] or null.
  function parseTime(text) {
    const t = String(text || '').trim().toLowerCase().replace(/\s+/g, '');
    if (!t) return null;
    const m = t.match(/^(\d{1,2})(?:[:.h]?(\d{2}))?h?(am|pm|a|p)?$/);
    if (!m) return null;
    let h = +m[1]; const mi = m[2] ? +m[2] : 0; const ap = m[3];
    if (mi > 59) return null;
    if (ap) { if (h < 1 || h > 12) return null; h = h % 12 + (ap[0] === 'p' ? 12 : 0); }
    else if (h > 23) return null;
    return [h, mi];
  }
  // A time with a place, for the converter field: "3pm Tokyo", "3 pm in Tokyo", "15:00 EST", "15h30 lisboa",
  // "tokyo 3pm", "Tokyo at 3pm", "às 15h em Lisboa", "a las 3pm en Madrid". Returns { time: [h, m], place } or null
  // (a plain time like "3pm", a place alone, or no parseable time). The place is returned as typed (trimmed); the
  // caller resolves it to a zone.
  const TIME_RE = '(\\d{1,2}(?:[:.h]\\d{2})?h?(?:\\s?(?:am|pm)|[ap])?)';
  const LEAD_RE = /^(?:at|às|as|a las|a la|las)\s+/i;
  const TIME_FIRST = new RegExp(`^${TIME_RE}(?:\\s+(?:in|at|em|no|na|en|a las|às))?\\s+(.+)$`, 'i');
  const PLACE_FIRST = new RegExp(`^(.+?)(?:\\s+(?:at|às|as|a las|a la))?\\s+${TIME_RE}$`, 'i');
  function splitTimePlace(text) {
    const s = String(text || '').trim().replace(/\s+/g, ' ').replace(/[.,!?;]+$/, '');
    if (!s || parseTime(s)) return null;
    const ok = (tm, place) => {
      const time = parseTime(tm);
      place = String(place || '').trim();
      // the place needs a letter and must not be a time or a day period on its own
      if (!time || !place || !/\p{L}/u.test(place) || parseTime(place) || /^(?:am|pm|a|p|h)$/i.test(place)) return null;
      return { time, place };
    };
    const body = s.replace(LEAD_RE, '');
    let m = TIME_FIRST.exec(body);
    const first = m && ok(m[1], m[2]);
    if (first) return first;
    m = PLACE_FIRST.exec(s);
    return (m && ok(m[2], m[1].replace(LEAD_RE, '').replace(/^(?:in|em|en|no|na)\s+/i, ''))) || null;
  }
  function phaseOf(hour) {
    if (hour < 5) return 'night';
    if (hour < 7) return 'dawn';
    if (hour < 11) return 'morning';
    if (hour < 14) return 'midday';
    if (hour < 17) return 'afternoon';
    if (hour < 19) return 'golden';
    if (hour < 21) return 'dusk';
    return 'night';
  }
  // Zones that show the same time all year form one group: same UTC offset at refMs and on Jan 15 and Jul 15 (UTC) of
  // refMs's year, so the same DST rule too. Keeps the first zone of each group, in order, and drops the later ones
  // (Lisbon and London, for example). Zones on different DST rules that only share a winter offset both stay.
  function uniqueClocks(zones, refMs) {
    const y = new Date(refMs).getUTCFullYear();
    const at = [new Date(refMs), new Date(Date.UTC(y, 0, 15)), new Date(Date.UTC(y, 6, 15))];
    const seen = new Set(), out = [];
    for (const z of zones) {
      let key;
      try { key = at.map((d) => offsetMinutes(z, d)).join('|'); } catch { key = 'zone:' + z; } // unknown zone: its own group
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(z);
    }
    return out;
  }

  // Planner fallback when no hour works for everyone. `states` has one array of 24 'work' | 'night' | 'off' values per
  // row (city); `prefer` lists the rows that should win ties (the home city and the planner source). Each hour scores
  // [cities working, preferred cities working, minus cities at night], compared in that order. Returns the longest run
  // of top-scoring hours (the earliest on a tie) as { start, end (exclusive), working, total, out: rows not working at
  // start }, or null with fewer than 2 rows, when every row works at some hour (the overlap band covers that) or when
  // at most one row works at any hour.
  function bestHours(states, prefer) {
    const rows = Array.isArray(states) ? states : [];
    const total = rows.length;
    if (total < 2) return null;
    const pref = new Set((Array.isArray(prefer) ? prefer : []).filter((i) => Number.isInteger(i) && i >= 0 && i < total));
    const score = [];
    for (let h = 0; h < 24; h++) {
      let w = 0, p = 0, n = 0;
      rows.forEach((row, i) => {
        const st = row && row[h];
        if (st === 'work') { w++; if (pref.has(i)) p++; } else if (st === 'night') n++;
      });
      score.push([w, p, -n]);
    }
    const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
    const top = score.reduce((m, s) => (cmp(s, m) > 0 ? s : m));
    if (top[0] >= total || top[0] < 2) return null;
    let best = null, start = -1;
    for (let h = 0; h <= 24; h++) {
      const on = h < 24 && cmp(score[h], top) === 0;
      if (on && start < 0) start = h;
      if (!on && start >= 0) { if (!best || h - start > best.end - best.start) best = { start, end: h }; start = -1; }
    }
    const out = [];
    rows.forEach((row, i) => { if (!row || row[best.start] !== 'work') out.push(i); });
    return { start: best.start, end: best.end, working: top[0], total, out };
  }

  window.WCTime = { fmt, parts, offsetMinutes, offsetMinutesUncached, formatOffset, zonedToEpoch, dayDiff, parseTime, splitTimePlace, phaseOf,
    uniqueClocks, bestHours, _fmtSize: () => fmtCache.size };
})();
