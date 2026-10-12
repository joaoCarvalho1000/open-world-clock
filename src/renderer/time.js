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

  // ---------- working-hours coverage (exact, for whole meeting intervals) ----------
  // Offset of `zone` at `t`, in ms, to the second (Monrovia before 1972 is -0:44:30).
  function offsetMs(zone, t) {
    const p = {};
    for (const x of fmt(zone, OFFSET_OPTS).formatToParts(new Date(t))) p[x.type] = x.value;
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(t / 1000) * 1000;
  }
  const HOUR = 3600000, DAY = 86400000;
  // [a, b) cut where the offset of `zone` changes, as [start, end, offsetMs] pieces. Offsets change on whole seconds and
  // at most once in 6 hours, so each 6-hour chunk is split at most once, found by bisection over seconds.
  function offsetPieces(zone, a, b) {
    const out = [];
    for (let s = a; s < b; s += 6 * HOUR) {
      const e = Math.min(b, s + 6 * HOUR);
      const oa = offsetMs(zone, s), ob = offsetMs(zone, e - 1);
      if (oa === ob) { out.push([s, e, oa]); continue; }
      let lo = Math.floor(s / 1000), hi = Math.ceil((e - 1) / 1000); // offset(lo s) = oa, offset(hi s) = ob
      while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (offsetMs(zone, mid * 1000) === oa) lo = mid; else hi = mid; }
      const cut = Math.max(s, Math.min(e, hi * 1000));
      if (cut > s) out.push([s, cut, oa]);
      if (e > cut) out.push([cut, e, ob]);
    }
    return out;
  }
  const hhmm = (s) => { const m = /^(\d\d):(\d\d)$/.exec(String(s || '')); return m ? +m[1] * 60 + +m[2] : null; };
  // Whether wall-clock ms `w` (the local date and time written as a UTC epoch) is inside schedule `hours`
  // ({ start, end: 'HH:MM', days: [0..6] }; an end before the start is an overnight shift ending the next day).
  function workingAtWall(hours, w) {
    const s = hhmm(hours.start), e = hhmm(hours.end), days = hours.days || [];
    const day = Math.floor(w / DAY), min = (w - day * DAY) / 60000, wd = (((day + 4) % 7) + 7) % 7; // 1970-01-01 was a Thursday
    if (s === null || e === null || s === e) return false;
    if (s < e) return min >= s && min < e && days.includes(wd);
    if (min >= s) return days.includes(wd);
    if (min < e) return days.includes((wd + 6) % 7);
    return false;
  }
  // The parts of [a, b) (epoch ms) that `zone` spends inside `hours`, as merged [start, end) spans. Exact: the interval
  // is cut at every offset change and at every local midnight, start and end of the schedule, and each piece is tested
  // once. [] for an empty or reversed interval.
  function workSpans(zone, hours, a, b) {
    const spans = [];
    if (!(b > a) || !hours) return spans;
    const sm = hhmm(hours.start), em = hhmm(hours.end);
    for (const [ps, pe, o] of offsetPieces(zone, a, b)) {
      const cuts = [ps, pe];
      for (let d = Math.floor((ps + o) / DAY); d <= Math.floor((pe - 1 + o) / DAY); d++) {
        for (const mins of [0, sm, em]) {
          if (mins === null) continue;
          const t = d * DAY + mins * 60000 - o;
          if (t > ps && t < pe) cuts.push(t);
        }
      }
      cuts.sort((x, y) => x - y);
      for (let i = 0; i < cuts.length - 1; i++) {
        const x = cuts[i], y = cuts[i + 1];
        if (y <= x || !workingAtWall(hours, x + o)) continue;
        const last = spans[spans.length - 1];
        if (last && last[1] === x) last[1] = y; else spans.push([x, y]);
      }
    }
    return spans;
  }
  // Whether `zone` is inside `hours` for the whole of [a, b). False for an empty or reversed interval.
  function worksThroughout(zone, hours, a, b) {
    const s = workSpans(zone, hours, a, b);
    return b > a && s.length === 1 && s[0][0] === a && s[0][1] === b;
  }

  // ---------- Find a time ----------
  // Score candidate meetings for `zones` (with `hours[i]` the schedule of zones[i]), each lasting `durationMs`.
  // Candidates start at each of `starts` (the source hours) and, when `untilMs` is given, also at every instant in
  // [first start, untilMs) where some city's working time begins (its workSpans starts), so a schedule on minutes
  // (09:10 to 10:10) is found even when no whole hour fits; duplicate or invalid starts are skipped. A city counts only
  // when it works for the WHOLE meeting (inside one of its exact working spans), so a two-hour slot where one city works
  // the first hour and another the second claims neither. Each city's spans (and offsets, for the night tie-break) are
  // computed once per call. `prefer` lists row indexes that win ties (home city, source). Returns { full, partial }:
  // `full` the meetings that work for everyone, earliest first; `partial` the compromises with the most cities (then
  // preferred cities, then fewer at night, then earliest), each { startMs, endMs, working, total, out: row indexes
  // outside their hours for part or all of it }. Each list keeps at most `limit` meetings that do not overlap one
  // already listed.
  function findTimes(zones, hours, starts, durationMs, prefer, limit, untilMs) {
    const total = zones.length, max = limit || 3;
    const none = { full: [], partial: [] };
    const base = (starts || []).filter((t) => Number.isFinite(t));
    if (!total || !(durationMs > 0) || !base.length) return none;
    const pref = new Set((prefer || []).filter((i) => Number.isInteger(i)));
    const from = Math.min(...base), until = Number.isFinite(untilMs) ? untilMs : Math.max(...base) + 1;
    const to = Math.max(until, Math.max(...base) + 1) + durationMs;
    const rows = zones.map((z, i) => ({ spans: workSpans(z, hours[i], from, to), pieces: offsetPieces(z, from, to) }));
    const all = new Set(base);
    if (Number.isFinite(untilMs)) for (const r of rows) for (const [s] of r.spans) if (s >= from && s < untilMs) all.add(s);
    const inSpan = (spans, a, b) => { for (const [s, e] of spans) { if (s > a) return false; if (a < e) return b <= e; } return false; };
    const offAt = (pieces, t) => { for (const [s, e, o] of pieces) if (t >= s && t < e) return o; return pieces.length ? pieces[pieces.length - 1][2] : 0; };
    const cands = [];
    for (const startMs of [...all].sort((a, b) => a - b)) {
      const endMs = startMs + durationMs, mid = startMs + durationMs / 2, out = [];
      let p = 0, night = 0;
      rows.forEach((r, i) => {
        if (inSpan(r.spans, startMs, endMs)) { if (pref.has(i)) p++; } else out.push(i);
        const h = ((((mid + offAt(r.pieces, mid)) % DAY) + DAY) % DAY) / HOUR;
        if (h >= 22 || h < 7) night++;
      });
      cands.push({ startMs, endMs, working: total - out.length, total, out, score: [total - out.length, p, -night] });
    }
    const pick = (list) => {
      const got = [];
      for (const c of list) {
        if (got.length >= max) break;
        if (got.some((g) => c.startMs < g.endMs && g.startMs < c.endMs)) continue;
        got.push({ startMs: c.startMs, endMs: c.endMs, working: c.working, total: c.total, out: c.out });
      }
      return got;
    };
    const cmp = (a, b) => b.score[0] - a.score[0] || b.score[1] - a.score[1] || b.score[2] - a.score[2] || a.startMs - b.startMs;
    return { full: pick(cands.filter((c) => c.working === total)), partial: pick(cands.filter((c) => c.working > 0 && c.working < total).sort(cmp)) };
  }

  window.WCTime = { fmt, parts, offsetMinutes, offsetMinutesUncached, formatOffset, zonedToEpoch, dayDiff, parseTime, splitTimePlace, phaseOf,
    uniqueClocks, offsetMs, workSpans, worksThroughout, findTimes, _fmtSize: () => fmtCache.size };
})();
