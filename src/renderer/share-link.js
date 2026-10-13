/* Version 2 share links: one selected meeting, exact. Pure; loaded by the Windows app (index.html) and, through
   scripts/build-web.mjs, in front of web/shim.js too, so desktop Copy link and the web app read and write one format.
     'v=2&c=Europe/Lisbon,America/New_York&z=America/New_York&s=1792069200&e=1792076400'
   s and e: the start and end in whole UTC seconds (0 < s < e, at most 7 days, before the year 10000); z: the source city;
   c: the cities (at most 50, z among them). Only time zones and times: never labels, working hours or groups.
   WCLink.parse(hash) -> null (not a meeting link: no v, s or e), { bad: true } (a meeting link that is not exactly
   valid: anything missing, repeated, out of range, mixed with a legacy t, or too long), or { zones, z, startMs, endMs }.
   WCLink.build(zones, zone, startMs, endMs) -> the hash, or '' when the meeting cannot be written exactly (including more
   than 50 cities with the source: refused, never cut). */
(function () {
  const MAX_S = 253402300799, WEEK_S = 7 * 86400, MAX_LEN = 4000, MAX_CITIES = 50;
  const KEYS = new Set(['v', 'c', 'z', 's', 'e', 'lang']);
  const isZone = (z) => { if (typeof z !== 'string' || !z || z.length >= 64) return false; try { new Intl.DateTimeFormat('en-US', { timeZone: z }); return true; } catch { return false; } };
  const encodeZone = (z) => encodeURIComponent(z).replace(/%2F/gi, '/');
  function parse(hash) {
    const s = String(hash || '').replace(/^#/, '');
    const parts = s ? s.split('&') : [];
    const keys = parts.map((p) => { const i = p.indexOf('='); return i > 0 ? p.slice(0, i) : p; });
    if (!keys.some((k) => k === 'v' || k === 's' || k === 'e')) return null; // a legacy (or no) link
    const bad = { bad: true };
    if (s.length > MAX_LEN) return bad;
    const kv = {};
    for (let i = 0; i < parts.length; i++) {
      const k = keys[i];
      if (Object.hasOwn(kv, k)) return bad; // repeated: never pick one
      if (k === 't') return bad; // mixed with a legacy converted time
      if (!KEYS.has(k)) continue;
      const j = parts[i].indexOf('=');
      if (j < 0) return bad;
      try { kv[k] = decodeURIComponent(parts[i].slice(j + 1)); } catch { return bad; }
    }
    if (kv.v !== '2' || !/^\d{1,12}$/.test(kv.s || '') || !/^\d{1,12}$/.test(kv.e || '') || !isZone(kv.z)) return bad;
    const st = +kv.s, en = +kv.e;
    if (!(st > 0 && en > st && en - st <= WEEK_S && en <= MAX_S)) return bad;
    const raw = kv.c === undefined || kv.c === '' ? [] : kv.c.split(',');
    if (raw.length > MAX_CITIES || raw.some((z) => !isZone(z.trim()))) return bad;
    const zones = [...new Set(raw.map((z) => z.trim()))];
    if (!zones.includes(kv.z)) { if (zones.length >= MAX_CITIES) return bad; zones.push(kv.z); } // room for the source, or refuse
    return { zones, z: kv.z, startMs: st * 1000, endMs: en * 1000 };
  }
  function build(zones, zone, startMs, endMs) {
    if (!Number.isInteger(startMs) || !Number.isInteger(endMs) || startMs % 1000 || endMs % 1000 || !isZone(zone)) return '';
    const st = startMs / 1000, en = endMs / 1000;
    if (!(st > 0 && en > st && en - st <= WEEK_S && en <= MAX_S)) return '';
    // every city or none: a list that does not fit with its source (50 at most) is refused, never cut
    const list = [...new Set((zones || []).filter(isZone))];
    if (!list.includes(zone)) list.push(zone);
    if (list.length > MAX_CITIES) return '';
    const h = `v=2&c=${list.map(encodeZone).join(',')}&z=${encodeZone(zone)}&s=${st}&e=${en}`;
    return h.length <= MAX_LEN ? h : '';
  }
  // The public home page the desktop app's Copy link points at (the website opens the meeting; nothing is sent).
  const HOME = 'https://openworldclock.com/';
  window.WCLink = Object.freeze({ parse, build, HOME });
})();
