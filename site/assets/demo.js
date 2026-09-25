/* World Clock website: the hero sky and the Share button of the live app in the hero (the app itself is site/app/,
   in a frame), the scroll scene over a real world map, and the feature mini demos.
   Everything runs locally from your time zone. No location access, no network, nothing stored but the theme choice.
   Time helpers mirror src/renderer/time.js; sun math is assets/sun.js, copied from the app.
   Performance rules: only the hero is built at load (the map scene and the feature tiles are built as
   their sections near the screen), scroll handlers never read layout (geometry is cached on resize), per-frame motion
   is transform or opacity only, and text only changes once per quarter hour of scene time.
   The same file runs the working converter on /time-zone-converter (the home page has none: the live app in its hero
   is the real one): every home-only part (the hero, the nav's scroll
   states and theme-color, the scroll plumbing, the reveal fallback, the GPU warm-up, the autoplay) checks that its
   element is on the page, and that page adds a city picker (#wcAdd, up to 8 cities, nothing stored).
   Every word it writes (phases, day markers, the planner line, city names) comes from assets/i18n.js, in the page's
   language (<html lang>: en, pt-BR or es-419), so /pt/ and /es/ run this same file. */
(function () {
  'use strict';

  var doc = document, root = doc.documentElement;
  var $ = function (s, r) { return (r || doc).querySelector(s); };
  var mqReduced = matchMedia('(prefers-reduced-motion: reduce)');
  var mqDark = matchMedia('(prefers-color-scheme: dark)');
  var reduced = function () { return mqReduced.matches; };
  var SUN = window.WCSun;
  var CITIES = window.WC_CITIES || {};
  var COORDS = window.WC_COORDS || {};
  var MIN = 60000, HOUR = 3600000, DAY = 86400000, STEP = 15 * MIN;
  var rad = Math.PI / 180;
  var SDA = !!(window.CSS && CSS.supports && CSS.supports('animation-timeline: view()'));
  // motion tokens live in site.css; read them once, on the first rolling digit (reading computed style at load would
  // force a style pass inside this script's task), so WAAPI motion uses the same curves and timings
  var EASE_OUT = '', DUR_3 = 320;
  function motionTokens() {
    if (EASE_OUT) return;
    var cs = getComputedStyle(root), tok = function (n, d) { return (cs.getPropertyValue(n) || '').trim() || d; };
    EASE_OUT = tok('--ease-out', 'cubic-bezier(.16,1,.3,1)'); DUR_3 = parseFloat(tok('--dur-3', '320')) || 320;
  }
  // The live app in the hero (site/app/ in a frame) starts after this page's load event. A same-origin frame shares
  // this page's main thread, and starting it at once held the headline's first paint back by seconds on a slow phone.
  // Its box is sized in CSS from the start, so filling it moves nothing (CLS 0).
  // The frame's hash tells the app the page's language (lang=en, pt or es), after any shared cities or time the page's
  // own hash carries (#c=...&t=...&z=..., from a Share link), so the app opens them in the page's language.
  var I18N = window.SITE_I18N || { lang: 'en', locale: 'en-US', prefix: '/', seq: ['9:30', '15h30', '7am', '3pm'], t: function (k) { return k; }, city: function (z, n) { return n; } };
  var T = I18N.t;
  var heroFrame = doc.getElementById('heroApp');
  if (heroFrame && heroFrame.dataset.src) {
    var frameHash = function () {
      var share = String(location.hash || '').replace(/^#/, '').split('&').filter(function (p) { return /^[ctz]=/.test(p); }).join('&');
      return '#' + (share ? share + '&' : '') + 'lang=' + I18N.lang;
    };
    var startApp = function () { if (!heroFrame.getAttribute('src')) heroFrame.src = heroFrame.dataset.src + frameHash(); };
    if (doc.readyState === 'complete') startApp(); else window.addEventListener('load', startApp, { once: true });
  }
  if (!SUN) return;

  var themeListeners = [];
  function isDark() { return root.dataset.theme === 'dark' || (!root.dataset.theme && mqDark.matches); }
  doc.addEventListener('wc:theme', function () { themeListeners.forEach(function (fn) { fn(); }); });

  /* ---------------- time helpers (from the app) ---------------- */
  var fmtCache = new Map();
  function fmt(zone, opts) {
    var key = zone + JSON.stringify(opts);
    var f = fmtCache.get(key);
    if (!f) { var o = Object.assign({ timeZone: zone }, opts), loc = o.locale || 'en-US'; delete o.locale; f = new Intl.DateTimeFormat(loc, o); fmtCache.set(key, f); }
    return f;
  }
  // dates people read (weekdays, months) in the page's language; fmt stays en-US for the numbers the math reads
  function fmtRead(zone, opts) { return fmt(zone, Object.assign({ locale: I18N.locale }, opts)); }
  function parts(zone, date, opts) {
    var out = {};
    fmt(zone, opts).formatToParts(date).forEach(function (p) { out[p.type] = p.value; });
    return out;
  }
  var YMD = { year: 'numeric', month: '2-digit', day: '2-digit' };
  var WALL = { hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' };
  var HMS = { hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' };
  function offsetMinutes(zone, date) {
    var p = parts(zone, date, WALL);
    var asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return Math.round((asUTC - Math.floor(date.getTime() / 1000) * 1000) / MIN);
  }
  function formatOffset(mins) {
    var sign = mins < 0 ? '-' : '+', a = Math.abs(mins), h = Math.floor(a / 60), m = a % 60;
    return sign + h + (m ? ':' + String(m).padStart(2, '0') : '');
  }
  function zonedToEpoch(zone, y, m, d, h, mi) { // m is 1-based
    var wall = Date.UTC(y, m - 1, d, h, mi);
    var offs = [offsetMinutes(zone, new Date(wall - DAY)), offsetMinutes(zone, new Date(wall + DAY))].filter(function (v, i, a) { return a.indexOf(v) === i; });
    var valid = offs.map(function (o) { return wall - o * MIN; }).filter(function (e) { return offsetMinutes(zone, new Date(e)) * MIN === wall - e; });
    return valid.length ? Math.min.apply(null, valid) : wall - offs[0] * MIN;
  }
  function ymd(zone, date) { var p = parts(zone, date, YMD); return [+p.year, +p.month, +p.day]; }
  function atWall(zone, refDate, h, mi, dayShift) { var y = ymd(zone, refDate); return zonedToEpoch(zone, y[0], y[1], y[2] + (dayShift || 0), h, mi); }
  function dayDiff(zone, date, refZone) {
    var a = ymd(zone, date), b = ymd(refZone, date);
    return Math.round((Date.UTC(a[0], a[1] - 1, a[2]) - Date.UTC(b[0], b[1] - 1, b[2])) / DAY);
  }
  function parseTime(text) {
    var t = String(text || '').trim().toLowerCase().replace(/\s+/g, '');
    if (!t) return null;
    var m = t.match(/^(\d{1,2})(?:[:.h]?(\d{2}))?h?(am|pm|a|p)?$/);
    if (!m) return null;
    var h = +m[1], mi = m[2] ? +m[2] : 0, ap = m[3];
    if (mi > 59) return null;
    if (ap) { if (h < 1 || h > 12) return null; h = h % 12 + (ap[0] === 'p' ? 12 : 0); }
    else if (h > 23) return null;
    return [h, mi];
  }
  function phaseOf(hour) {
    if (hour < 5) return 'night'; if (hour < 7) return 'dawn'; if (hour < 11) return 'morning';
    if (hour < 14) return 'midday'; if (hour < 17) return 'afternoon'; if (hour < 19) return 'golden';
    if (hour < 21) return 'dusk'; return 'night';
  }
  function sunPhase(date, ll, hour) { // same rule as the app
    var alt = SUN.altitude(date, ll[0], ll[1]);
    var rising = SUN.altitude(new Date(date.getTime() + 600000), ll[0], ll[1]) > alt;
    if (alt < -6) return 'night';
    if (rising && alt <= 6) return 'dawn';
    if (!rising && alt < 0) return 'dusk';
    if (hour >= 11 && hour < 14 && alt > 0) return 'midday';
    if (!rising && alt <= 10) return 'golden';
    return rising && hour < 11 ? 'morning' : 'afternoon';
  }
  // which extra sky a card gets on top of plain day or night (same palette as the app's cards)
  function skyOf(key, night) {
    if (night) return key === 'dusk' || key === 'dawn' || key === 'golden' ? 'twilight' : '';
    return key === 'golden' || key === 'dusk' ? 'golden' : key === 'dawn' ? 'dawn' : '';
  }
  var PHASE = {};
  ['night', 'dawn', 'morning', 'midday', 'afternoon', 'golden', 'dusk'].forEach(function (k) { PHASE[k] = T('phase.' + k); });
  function hm(zone, date) { var p = parts(zone, date, { hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }); return (p.hour === '24' ? '00' : p.hour) + ':' + p.minute; }
  function hourOf(zone, date) { var p = parts(zone, date, { hourCycle: 'h23', hour: '2-digit' }); return +p.hour % 24; }
  // "A las 13:30" but "A la 01:30" (Spanish), "Às 13:30" but "À 01:30" (Portuguese): one o'clock is singular, as in the
  // app (atTime in src/renderer/app.js). The demo always shows the 24-hour clock, so only 01:xx is one o'clock.
  function atTime(key, zone, date) {
    var s = T(key, { time: hm(zone, date), city: nameOf(zone) });
    if (hourOf(zone, date) !== 1) return s;
    if (I18N.lang === 'es') return s.replace(/^A las /, 'A la ');
    if (I18N.lang === 'pt') return s.replace(/^Às /, 'À ');
    return s;
  }

  /* ---------------- zones ---------------- */
  var UTCISH = /^(Etc\/)?(UTC|GMT|Universal|Zulu)/;
  var LOCAL = 'UTC';
  try { LOCAL = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; fmt(LOCAL, { hour: 'numeric' }); } catch (e) { LOCAL = 'UTC'; }
  function coordsOf(z) { var c = CITIES[z]; if (c) return [c[1], c[2]]; return COORDS[z] || (UTCISH.test(z) ? [51.48, 0] : null); }
  function nameOf(z) { var c = CITIES[z]; if (c) return I18N.city(z, c[0]); if (UTCISH.test(z)) return 'UTC'; return z.split('/').pop().replace(/_/g, ' '); }
  function isNight(z, date) { var ll = coordsOf(z); if (ll) return !SUN.isDay(date, ll[0], ll[1]); var h = hourOf(z, date); return h < 6 || h >= 20; }
  function phaseKey(z, date) { var ll = coordsOf(z), h = hourOf(z, date); return ll ? sunPhase(date, ll, h) : phaseOf(h); }
  var HOME = LOCAL, HOME_NAME = nameOf(HOME), HOME_LL = coordsOf(HOME) || [51.48, 0];

  var PREF = ['America/New_York', 'Europe/London', 'Asia/Tokyo', 'America/Los_Angeles', 'Asia/Singapore', 'Australia/Sydney', 'America/Sao_Paulo', 'Europe/Berlin', 'Asia/Kolkata', 'Asia/Dubai'];
  var now0 = new Date();
  var usedOff = [offsetMinutes(HOME, now0)], ZONES = [HOME];
  PREF.forEach(function (z) { if (ZONES.length >= 5) return; var o = offsetMinutes(z, now0); if (usedOff.indexOf(o) !== -1) return; usedOff.push(o); ZONES.push(z); });
  ZONES.sort(function (a, b) { return offsetMinutes(a, now0) - offsetMinutes(b, now0); });

  function relLabel(zone, date) {
    if (zone === HOME) return T('rel.local');
    var d = offsetMinutes(zone, date) - offsetMinutes(HOME, date);
    if (d === 0) return '±0';
    var a = Math.abs(d), h = Math.floor(a / 60), m = a % 60;
    return (d > 0 ? '+' : '-') + h + 'h' + (m ? String(m).padStart(2, '0') + 'm' : '');
  }
  function dayMarker(diff) { if (!diff) return ''; if (diff === 1) return T('day.plus1'); if (diff === -1) return T('day.minus1'); return T(diff > 0 ? 'day.plusN' : 'day.minusN', { n: Math.abs(diff) }); }
  function abbr(zone, date) { var a = parts(zone, date, { timeZoneName: 'short', hour: 'numeric' }).timeZoneName || ''; return /^[A-Z]{2,5}$/.test(a) && a !== 'UTC' && a !== 'GMT' ? a : ''; }
  function fmtHours(h) { var m = Math.round(h * 60), hh = Math.floor(m / 60), mm = m % 60; return hh + 'h' + (mm ? ' ' + String(mm).padStart(2, '0') + 'm' : ''); }

  var announceEl = $('#announce'), announceTimer = 0;
  function announce(msg) { if (!announceEl) return; clearTimeout(announceTimer); announceTimer = setTimeout(function () { announceEl.textContent = msg; }, 300); }

  /* ---------------- sky palettes ---------------- */
  // [altitude, top, middle, horizon] in oklch. Hues are unwrapped so sunsets pass through pink, never green.
  // Light stops stay at L >= 0.77 and night stops at L <= 0.46, so hero text keeps 4.5:1 on either side.
  var SKY_LIGHT = [
    [50, [0.80, 0.085, 240], [0.88, 0.055, 232], [0.95, 0.025, 222]],
    [15, [0.82, 0.075, 246], [0.89, 0.05, 250], [0.95, 0.03, 300]],
    [4, [0.80, 0.07, 268], [0.86, 0.07, 322], [0.91, 0.09, 395]],
    [-1, [0.77, 0.07, 280], [0.83, 0.08, 338], [0.88, 0.105, 405]],
  ];
  var SKY_DARK_DAY = [ // dark site theme: same hues, kept dark so light text keeps AA
    [50, [0.40, 0.07, 246], [0.35, 0.06, 250], [0.30, 0.05, 256]],
    [15, [0.38, 0.065, 252], [0.34, 0.06, 262], [0.31, 0.06, 292]],
    [4, [0.34, 0.07, 272], [0.33, 0.075, 316], [0.36, 0.085, 380]],
    [-1, [0.31, 0.07, 280], [0.31, 0.08, 330], [0.35, 0.09, 390]],
  ];
  var SKY_NIGHT = [
    [-1, [0.33, 0.08, 282], [0.39, 0.10, 322], [0.46, 0.12, 372]],
    [-6, [0.27, 0.07, 274], [0.32, 0.08, 296], [0.39, 0.09, 330]],
    [-12, [0.20, 0.055, 266], [0.24, 0.06, 272], [0.30, 0.07, 288]],
    [-90, [0.15, 0.04, 265], [0.18, 0.045, 263], [0.23, 0.05, 260]],
  ];
  function interp(table, alt) {
    if (alt >= table[0][0]) return table[0].slice(1);
    for (var i = 0; i < table.length - 1; i++) {
      var a = table[i], b = table[i + 1];
      if (alt <= a[0] && alt >= b[0]) {
        var t = (a[0] - alt) / (a[0] - b[0]);
        return [1, 2, 3].map(function (k) { return [0, 1, 2].map(function (j) { return a[k][j] + (b[k][j] - a[k][j]) * t; }); });
      }
    }
    return table[table.length - 1].slice(1);
  }
  function oklch(c, dim) { return 'oklch(' + (c[0] * (dim || 1)).toFixed(3) + ' ' + c[1].toFixed(3) + ' ' + (((c[2] % 360) + 360) % 360).toFixed(1) + ')'; }
  // the same colour as #rrggbb, for <meta name="theme-color"> (browser chrome parsers are older than oklch)
  function okHex(c, dim) {
    var L = c[0] * (dim || 1), h = c[2] * rad, a = c[1] * Math.cos(h), b = c[1] * Math.sin(h);
    var l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3), m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3), s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
    return '#' + [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map(function (v) {
      v = Math.max(0, Math.min(1, v)); v = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
      return ('0' + Math.round(v * 255).toString(16)).slice(-2);
    }).join('');
  }
  // the browser's own toolbar (mobile address bar, installed app title bar) wears whatever is under it:
  // the sky over the visitor's city at the top, then the canvas under the frosted nav, then night over the dark scenes
  var metaTC = doc.querySelectorAll('meta[name="theme-color"]'), tcLast = '', heroTop = '';
  function syncThemeColor() {
    var dk = isDark(), c = overDark ? (dk ? '#0a1225' : '#0e182f') : scrolled ? (dk ? '#0a1326' : '#ecf5fd') : heroTop;
    if (!c || c === tcLast) return;
    tcLast = c;
    for (var i = 0; i < metaTC.length; i++) metaTC[i].setAttribute('content', c);
  }

  /* ---------------- cards ---------------- */
  var MOON = '<svg class="moon" viewBox="0 0 16 16" aria-hidden="true"><path d="M10.9 11.9A5.6 5.6 0 0 1 6.1 2.2a5.8 5.8 0 1 0 7.6 7.6 5.6 5.6 0 0 1-2.8 2.1Z"/></svg>';
  function buildCard(zone) {
    var c = doc.createElement('article');
    c.className = 'card'; c.dataset.zone = zone;
    c.innerHTML = '<span class="sky" aria-hidden="true"></span><span class="card-more" aria-hidden="true">···</span>' +
      '<div class="card-head"><div class="city-row"><span class="city"></span>' + (zone === HOME ? '<span class="badge">' + T('card.home') + '</span>' : '') + '</div>' +
      '<div class="phase-row"><span class="phase"></span><span class="moon-wrap" hidden>' + MOON + '</span></div></div>' +
      '<div class="display"><div class="time"><span class="hm" aria-hidden="true"></span><span class="sec" aria-hidden="true"></span></div></div>' +
      '<div class="arc" aria-hidden="true"><div class="arc-work"></div><div class="arc-track"><div class="arc-dot"></div></div></div>' +
      '<div class="meta"><span class="tzname"></span><span class="utc"></span><span class="dshift" hidden></span><span class="rel"></span></div>';
    c.querySelector('.city').textContent = nameOf(zone);
    if (zone === HOME) c.classList.add('home');
    c._q = { phase: c.querySelector('.phase'), hm: c.querySelector('.hm'), sec: c.querySelector('.sec'), moon: c.querySelector('.moon-wrap'),
      track: c.querySelector('.arc-track'), tz: c.querySelector('.tzname'), utc: c.querySelector('.utc'), ds: c.querySelector('.dshift'), rel: c.querySelector('.rel') };
    return c;
  }
  // Rolling digits: only the characters that changed move, with transform and opacity.
  function setChars(el, text, dir) {
    var prev = el.dataset.v || '';
    if (prev === text) return;
    el.dataset.v = text;
    var tNow = performance.now(), fast = !!el._t && tNow - el._t < 260;
    el._t = tNow;
    if (el.children.length !== text.length) {
      el.textContent = '';
      for (var i = 0; i < text.length; i++) { var s = doc.createElement('span'); s.className = 'ch'; s.textContent = text[i]; el.appendChild(s); }
      return;
    }
    for (var j = 0; j < text.length; j++) {
      var ch = el.children[j];
      if (ch.textContent === text[j]) continue;
      ch.textContent = text[j];
      if (!reduced() && ch.animate && prev) {
        motionTokens();
        // a fast scrub gets short, quick rolls, so digits stay legible instead of piling up half-faded
        var dist = fast ? 22 : 36;
        ch.animate([{ transform: 'translateY(' + (dir < 0 ? -dist : dist) + '%)', opacity: fast ? 0.35 : 0 }, { transform: 'none', opacity: 1 }], { duration: fast ? 150 : DUR_3, easing: EASE_OUT });
      }
    }
  }
  function setText(el, t) { if (el.textContent !== t) el.textContent = t; }
  // Render a set of cards for one instant. conv = null (live) or { zone } (converting / scrubbing).
  function renderCards(cards, date, conv, dir) {
    cards.forEach(function (c, zone) {
      var q = c._q, p = parts(zone, date, HMS);
      var hour = +p.hour % 24, minute = +p.minute;
      var key = phaseKey(zone, date), night = isNight(zone, date);
      c.classList.toggle('is-night', night);
      var sky = skyOf(key, night);
      if (sky && c.dataset.sky !== sky) c.dataset.sky = sky; // kept when the warm layer fades out, so it fades rather than blinks
      c.classList.toggle('warm', !!sky);
      c.classList.toggle('converted', !!conv);
      c.classList.toggle('source', !!conv && conv.zone === zone);
      c.classList.toggle('working', hour >= 9 && hour < 18);
      var asleep = !!conv && (hour >= 22 || hour < 7);
      c.classList.toggle('asleep', asleep);
      q.moon.hidden = !asleep;
      setText(q.phase, PHASE[key]);
      var t = (p.hour === '24' ? '00' : p.hour) + ':' + p.minute;
      setChars(q.hm, t, dir);
      setText(q.sec, conv ? '' : p.second);
      var pv = ((hour * 60 + minute) / 1440).toFixed(4);
      if (q.p !== pv) { q.p = pv; q.track.style.setProperty('--p', pv); }
      var off = offsetMinutes(zone, date);
      setText(q.tz, abbr(zone, date));
      setText(q.utc, 'UTC' + formatOffset(off));
      var diff = dayDiff(zone, date, conv ? conv.zone : HOME);
      q.ds.hidden = !diff; setText(q.ds, dayMarker(diff));
      setText(q.rel, relLabel(zone, date)); q.rel.classList.toggle('home', zone === HOME);
      if (c.dataset.minute !== t || c.dataset.conv !== String(!!conv)) {
        c.dataset.minute = t; c.dataset.conv = String(!!conv);
        c.setAttribute('aria-label', [nameOf(zone), t, PHASE[key], T(night ? 'sun.down' : 'sun.up'), asleep ? T('card.asleep') : '', 'UTC' + formatOffset(off), dayMarker(diff)].filter(Boolean).join(', '));
        var ll = coordsOf(zone);
        if (ll) {
          var st = SUN.times(date, ll[0], ll[1]);
          c.title = st.polar === 'day' ? T('sun.noSet') : st.polar === 'night' ? T('sun.noRise') : T('sun.times', { rise: hm(zone, st.sunrise), set: hm(zone, st.sunset) });
        }
      }
    });
  }

  /* ---------------- 1. hero: the headline under the sky over your city, and the live app under it ---------------- */
  var hero = $('.hero'), nav = $('.nav'), sunEl = $('.sun'), rdWhere = $('#rdWhere');
  var heroW = 0, heroH = 0, lastHeroKey = '';
  function paintHero(force) {
    if (!hero) return; // content pages have no hero: nothing to paint
    var date = new Date(), t = hm(HOME, date);
    if (!force && t === lastHeroKey) return;
    lastHeroKey = t;
    var alt = SUN.altitude(date, HOME_LL[0], HOME_LL[1]);
    var dark = isDark(), night = alt < -1;
    var stops = night ? interp(SKY_NIGHT, alt) : interp(dark ? SKY_DARK_DAY : SKY_LIGHT, alt);
    var dim = night && dark ? 0.9 : 1, darkSky = night || dark;
    // sky and text colour change in the same frame (no transition), so contrast never dips mid-switch
    hero.style.setProperty('--sky-a', oklch(stops[0], dim));
    hero.style.setProperty('--sky-b', oklch(stops[1], dim));
    hero.style.setProperty('--sky-c', oklch(stops[2], dim));
    hero.classList.toggle('sky-dark', darkSky);
    nav.classList.toggle('on-dark', darkSky);
    if (heroW) {
      var st = SUN.times(date, HOME_LL[0], HOME_LL[1]);
      var frac = st.sunrise && st.sunset ? (date - st.sunrise) / (st.sunset - st.sunrise) : 0.5;
      frac = Math.max(-0.1, Math.min(1.1, frac));
      // the sun travels the sky above the app's window, from the left edge at sunrise to the right at sunset. Phones
      // keep it in the open corner by the place line, clear of the left-aligned words
      var narrow = heroW < 641, horizon = narrow ? 190 : heroH * 0.55, top = narrow ? 70 : heroH * 0.06;
      var x = narrow ? heroW * (0.74 + frac * 0.22) : heroW * (0.06 + frac * 0.88);
      var y = horizon - Math.max(-8, Math.min(70, alt)) / 70 * (horizon - top);
      sunEl.style.transform = 'translate(' + x.toFixed(0) + 'px,' + y.toFixed(0) + 'px)';
      sunEl.classList.toggle('dim', darkSky);
      sunEl.style.opacity = alt > -2 ? '1' : '0';
    }
    heroTop = okHex(stops[0], dim); syncThemeColor();
    var a = Math.round(alt);
    rdWhere.textContent = HOME_NAME + ' · ' + PHASE[sunPhase(date, HOME_LL, hourOf(HOME, date))] + ' · ' + T(a >= 0 ? 'where.up' : 'where.down', { n: Math.abs(a) });
  }
  if (hero) {
    if ('ResizeObserver' in window) new ResizeObserver(function (en) { var r = en[0].contentRect; heroW = r.width; heroH = r.height; paintHero(true); }).observe(hero);
    else { heroW = hero.clientWidth; heroH = hero.clientHeight; }
    themeListeners.push(function () { paintHero(true); });
    paintHero(true);
  }

  /* ---- 1b. Share, in the app window's bar: a link to the clocks on screen, on the home page, hash only ---- */
  // The app in the frame (site/app/, same origin) makes the hash (web/web.js, window.WCShareHash): its cities, and the
  // converted time while converting. The link is this page's own address plus that hash, which browsers never send to
  // a server; opening it shows those cities in the hero without touching the visitor's saved list.
  var shareBtn = $('#heroShare'), shareText = $('#heroShareText'), shareTimer = 0;
  if (shareBtn) {
    var shareSay = function (msg, done) {
      clearTimeout(shareTimer);
      shareText.textContent = msg; shareBtn.classList.toggle('is-done', !!done); announce(msg);
      shareTimer = setTimeout(function () { shareText.textContent = T('share'); shareBtn.classList.remove('is-done'); }, 2200);
    };
    shareBtn.addEventListener('click', function () {
      var f = $('#heroApp'), h = '';
      try { h = f && f.contentWindow && f.contentWindow.WCShareHash ? f.contentWindow.WCShareHash() : ''; } catch (e) { h = ''; }
      if (!h) { shareSay(T('share.first')); return; }
      var url = location.origin + I18N.prefix + '#' + h; // this page, in its language
      var ok = function () { shareSay(T('share.done'), true); };
      var legacy = function () {
        var ta = doc.createElement('textarea'); ta.value = url; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        doc.body.appendChild(ta); ta.select(); var done = false; try { done = doc.execCommand('copy'); } catch (e) { done = false; } ta.remove();
        shareBtn.focus({ preventScroll: true });
        if (done) ok(); else shareSay(T('share.fail'));
      };
      if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(url).then(ok, legacy); else legacy();
    });
  }

  /* ---------------- 2. the converter widget (interactive; built by initConverter as #demo nears the screen) ---------------- */
  var strip = $('#wcStrip'), elTime = $('#wcTime'), elSlider = $('#wcSlider'), elZone = $('#wcZone'),
    elClear = $('#wcClear'), elCopy = $('#wcCopy'), elHint = $('#wcHint'), wcEl = $('.wc'), stageEl = $('.stage');
  var convert = null; // { epoch, zone }
  var demoCards = new Map(), lastEpoch = Date.now(), demoVisible = false, convBuilt = false;

  function refreshHint() { elHint.textContent = convert ? atTime('hint.when', convert.zone, new Date(convert.epoch)) : ''; }
  function syncControls() {
    var on = !!convert;
    elClear.hidden = !on; elCopy.hidden = !on;
    var z = on ? convert.zone : (elZone.value || HOME), d = on ? new Date(convert.epoch) : new Date();
    var p = parts(z, d, { hourCycle: 'h23', hour: '2-digit', minute: '2-digit' });
    elSlider.value = String(Math.round(((+p.hour % 24) * 60 + +p.minute) / 15) * 15);
    if (doc.activeElement !== elTime && !auto.typing) elTime.value = on ? hm(z, d) : '';
    refreshHint();
  }
  function renderDemo(dir) {
    var date = new Date(convert ? convert.epoch : Date.now());
    renderCards(demoCards, date, convert, dir || 0);
    lastEpoch = date.getTime();
  }
  function setConvEpoch(ms, zone, quiet) {
    var dir = ms >= lastEpoch ? 1 : -1;
    convert = { epoch: ms, zone: zone || elZone.value || HOME };
    syncControls(); renderDemo(dir);
    if (!quiet) announce(elHint.textContent);
  }
  function backToNow(quiet) {
    convert = null; elTime.classList.remove('invalid'); elZone.value = HOME; syncControls(); renderDemo(1);
    if (!quiet) announce(T('say.now'));
  }
  function baseEpoch() { return convert ? convert.epoch : Math.round(Date.now() / STEP) * STEP; }
  function scrubBy(mins, quiet) { setConvEpoch(baseEpoch() + mins * MIN, null, quiet); }
  function convertFrom(zone) { elZone.value = zone; setConvEpoch(baseEpoch(), zone); elTime.focus({ preventScroll: true }); }
  function applyTyped(v, quiet) {
    v = v.trim();
    if (!v) { elTime.classList.remove('invalid'); if (convert) backToNow(quiet); return; }
    var t = parseTime(v);
    elTime.classList.toggle('invalid', !t);
    if (!t) { elHint.textContent = T('hint.invalid'); return; }
    var zone = elZone.value || HOME;
    setConvEpoch(atWall(zone, new Date(), t[0], t[1]), zone, quiet);
  }
  function zoneChanged(quiet) {
    if (!convert) { syncControls(); return; }
    var p = parts(convert.zone, new Date(convert.epoch), { hourCycle: 'h23', hour: '2-digit', minute: '2-digit' });
    var t = parseTime(elTime.value) || [+p.hour % 24, +p.minute];
    setConvEpoch(atWall(elZone.value, new Date(convert.epoch), t[0], t[1]), elZone.value, quiet);
  }

  function attachCardInput(c, zone) {
    c.tabIndex = 0;
    c.addEventListener('dblclick', function () { convertFrom(zone); });
    c.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); scrubBy(e.shiftKey ? 60 : 15); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); scrubBy(e.shiftKey ? -60 : -15); }
      else if (e.key === 'Enter') { e.preventDefault(); convertFrom(zone); }
      else if (e.key === 'Escape' && convert) { e.preventDefault(); backToNow(); }
    });
    var arc = c.querySelector('.arc'), dragging = false, arcRect = null;
    function at(e) {
      var r = arcRect;
      var mins = Math.min(1425, Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * 96) * 15);
      setConvEpoch(atWall(zone, new Date(baseEpoch()), Math.floor(mins / 60), mins % 60), elZone.value || HOME);
    }
    arc.addEventListener('pointerdown', function (e) { dragging = true; arcRect = arc.getBoundingClientRect(); arc.setPointerCapture(e.pointerId); at(e); e.preventDefault(); });
    arc.addEventListener('pointermove', function (e) { if (dragging) at(e); });
    arc.addEventListener('pointerup', function () { dragging = false; });
    arc.addEventListener('pointercancel', function () { dragging = false; });
  }
  // The wheel scrubs time only when the visitor means it: the mouse has moved onto the clocks and the page has come
  // to rest. Someone scrolling down the page with the pointer parked in its path keeps scrolling: no scroll trap.
  var wheelAcc = 0, wheelArmed = false, lastPageScroll = -1e9, lastScrub = -1e9;
  function onWheel(e) {
    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    var tNow = performance.now();
    if (tNow - lastScrub > 600 && (!wheelArmed || tNow - lastPageScroll < 350)) return; // let the page scroll
    lastScrub = tNow;
    e.preventDefault();
    stopForGood();
    var dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 100 : 1);
    if (Math.sign(dy) !== Math.sign(wheelAcc)) wheelAcc = 0;
    wheelAcc += dy;
    var steps = Math.trunc(wheelAcc / 100);
    if (!steps) return;
    wheelAcc -= steps * 100;
    scrubBy(steps * 15);
  }
  function copyLinesFor(date, refZone) {
    var lines = [atTime('copy.header', refZone, date)];
    ZONES.forEach(function (z) {
      var mk = dayMarker(dayDiff(z, date, refZone));
      lines.push(hm(z, date) + ' ' + nameOf(z) + ' · ' + fmtRead(z, { weekday: 'short', month: 'short', day: 'numeric' }).format(date) + (mk ? ' ' + mk : ''));
    });
    return lines;
  }
  function copyTimes() {
    if (!convert) return;
    var text = copyLinesFor(new Date(convert.epoch), convert.zone).join('\n');
    var done = function () { elHint.textContent = T('copied'); announce(T('say.copied')); setTimeout(refreshHint, 1500); };
    var legacy = function () {
      var ta = doc.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      doc.body.appendChild(ta); ta.select(); var ok = false; try { ok = doc.execCommand('copy'); } catch (e) { ok = false; } ta.remove(); if (ok) done();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, legacy); else legacy();
  }

  var auto = { run: 0, timers: [], stopped: false, hover: false, visible: false, typing: false };
  function initConverter() {
    if (convBuilt || !strip) return;
    convBuilt = true;
    ZONES.forEach(function (z) {
      var c = buildCard(z); attachCardInput(c, z); demoCards.set(z, c); strip.appendChild(c);
      var o = doc.createElement('option'); o.value = z; o.textContent = z === HOME ? T('local', { city: nameOf(z) }) : nameOf(z); elZone.appendChild(o);
    });
    elZone.value = HOME;
    strip.addEventListener('wheel', onWheel, { passive: false });
    strip.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse' && (e.movementX || e.movementY)) wheelArmed = true; }, { passive: true });
    strip.addEventListener('pointerleave', function () { wheelArmed = false; });
    elSlider.addEventListener('input', function () {
      var zone = elZone.value || HOME, mins = +elSlider.value;
      setConvEpoch(atWall(zone, new Date(baseEpoch()), Math.floor(mins / 60), mins % 60), zone);
    });
    elTime.addEventListener('input', function () { applyTyped(elTime.value); });
    // focusing the time selects it, so typing replaces the shown time instead of landing in the middle of it
    elTime.addEventListener('focus', function () { setTimeout(function () { if (doc.activeElement === elTime) elTime.select(); }, 0); });
    elTime.addEventListener('keydown', function (e) { if (e.key === 'Escape') { elTime.value = ''; backToNow(); } });
    elZone.addEventListener('change', function () { zoneChanged(); });
    elClear.addEventListener('click', function () { elTime.value = ''; backToNow(); });
    elCopy.addEventListener('click', copyTimes);
    syncControls();
    renderDemo(0);
    // the live clocks tick only while the widget is on screen
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) {
        demoVisible = en[0].isIntersecting;
        if (demoVisible && !convert) renderDemo(0);
      }, { rootMargin: '120px 0px' }).observe(wcEl);
    } else demoVisible = true;
  }
  // a page scroll disarms the wheel scrub (see onWheel); it also holds off the GPU warm-up below
  window.addEventListener('scroll', function () { lastPageScroll = performance.now(); }, { passive: true });

  /* ---- 2b. the converter plays itself: a scripted cursor types 3pm, switches city, scrubs, returns to now ---- */
  var ghost = $('#ghost');
  var mqTouch = matchMedia('(pointer: coarse)');
  function ghostToSlider() { // the slider thumb's centre, from its value (no layout reads beyond the one rect)
    if (!ghost) return;
    var s = stageEl.getBoundingClientRect(), r = elSlider.getBoundingClientRect(), f = +elSlider.value / 1425;
    var x = r.left - s.left + 10 + f * (r.width - 20), y = r.top - s.top + r.height * 0.5;
    ghost.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
  }
  var SRC = ZONES.indexOf('America/New_York') !== -1 && HOME !== 'America/New_York' ? 'America/New_York'
    : ZONES.filter(function (z) { return z !== HOME; })[0] || HOME;
  function clearAuto() {
    auto.run++; auto.timers.forEach(clearTimeout); auto.timers = []; auto.typing = false;
    if (ghost) { ghost.classList.remove('on', 'press', 'scrolling', 'drag'); ghost.style.transitionDuration = ''; }
    elTime.classList.remove('ghost-focus'); elZone.classList.remove('ghost-focus');
  }
  function ghostTo(el, fx, fy) {
    if (!ghost || !el) return;
    var s = stageEl.getBoundingClientRect(), r = el.getBoundingClientRect();
    var x = r.left - s.left + r.width * (fx == null ? 0.5 : fx), y = r.top - s.top + r.height * (fy == null ? 0.6 : fy);
    ghost.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
  }
  function press() {
    ghost.classList.remove('press');
    requestAnimationFrame(function () { ghost.classList.add('press'); });
    at(360, function () { ghost.classList.remove('press'); });
  }
  var at = function (ms, fn) { var id = auto.run; auto.timers.push(setTimeout(function () { if (id === auto.run) fn(); }, ms)); };
  function staticConverted() { // reduced motion: one calm converted state
    elZone.value = SRC; elTime.value = '3pm'; applyTyped('3pm', true);
  }
  function play() {
    clearAuto();
    if (auto.stopped || reduced() || !ghost) return;
    var t = 0, T = function (d) { t += d; return t; }, touch = mqTouch.matches && getComputedStyle(elSlider).display !== 'none';
    ghost.classList.toggle('touch', mqTouch.matches);
    elTime.value = ''; backToNow(true);
    var sw = stageEl.getBoundingClientRect();
    ghost.style.transition = 'none';
    ghost.style.transform = 'translate(' + (sw.width * 0.72).toFixed(0) + 'px,' + (sw.height + 30).toFixed(0) + 'px)';
    requestAnimationFrame(function () { ghost.style.transition = ''; ghost.classList.add('on'); });
    at(T(500), function () { ghostTo(elTime, 0.35); });
    at(T(900), function () { press(); elTime.classList.add('ghost-focus'); auto.typing = true; });
    ['3', '3p', '3pm'].forEach(function (s) { at(T(200), function () { elTime.value = s; applyTyped(s, true); }); });
    at(T(700), function () { auto.typing = false; elTime.classList.remove('ghost-focus'); ghostTo(elZone, 0.4); });
    at(T(900), function () { press(); elZone.classList.add('ghost-focus'); });
    at(T(450), function () { elZone.value = SRC; zoneChanged(true); });
    at(T(600), function () { elZone.classList.remove('ghost-focus'); });
    if (touch) { // phones: press the slider thumb and drag it; the hand follows the thumb
      at(T(1500), ghostToSlider);
      at(T(900), function () { press(); ghost.classList.add('drag'); ghost.style.transitionDuration = '150ms, 320ms'; });
      for (var j = 0; j < 28; j++) at(T(j < 4 ? 260 : 150), function () { scrubBy(15, true); ghostToSlider(); });
      at(T(300), function () { ghost.classList.remove('drag'); ghost.style.transitionDuration = ''; });
    } else {
      at(T(1500), function () { ghostTo(strip, 0.5, 0.55); });
      at(T(900), function () { ghost.classList.add('scrolling'); });
      for (var i = 0; i < 28; i++) at(T(i < 4 ? 260 : 150), function () { scrubBy(15, true); });
      at(T(300), function () { ghost.classList.remove('scrolling'); });
    }
    at(T(1600), function () { if (!elClear.hidden) ghostTo(elClear, 0.5); });
    at(T(900), function () { press(); });
    at(T(200), function () { auto.typing = false; elTime.value = ''; backToNow(true); });
    at(T(700), function () { var s = stageEl.getBoundingClientRect(); ghost.style.transform = 'translate(' + (s.width * 0.8).toFixed(0) + 'px,' + (s.height + 30).toFixed(0) + 'px)'; ghost.classList.remove('on'); });
    at(T(3200), function () { if (auto.visible && !auto.hover) play(); });
  }
  function stopForGood() { if (auto.stopped) return; clearAuto(); auto.stopped = true; }
  function initAutoplay() {
    if (!wcEl || auto.ready) return;
    auto.ready = true;
    // the autoplay stops for good on intent (a click, a key, a focus, a real scrub), not for a finger or wheel passing through
    ['keydown', 'focusin', 'input', 'click'].forEach(function (ev) { wcEl.addEventListener(ev, stopForGood, { passive: true, capture: true }); });
    wcEl.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'touch' || e.target.closest('.arc')) stopForGood(); }, { passive: true, capture: true });
    wcEl.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'mouse' || auto.stopped) return; auto.hover = true; clearAuto(); });
    wcEl.addEventListener('pointerleave', function (e) {
      if (e.pointerType !== 'mouse' || auto.stopped) return;
      auto.hover = false; at(2500, function () { if (auto.visible) play(); });
    });
    if (reduced()) staticConverted();
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) {
        var v = en[0].isIntersecting;
        if (v === auto.visible) return;
        auto.visible = v;
        if (auto.stopped || reduced()) return;
        if (v) { clearAuto(); at(700, play); }
        else { clearAuto(); if (convert) { elTime.value = ''; backToNow(true); } }
      }, { threshold: 0.5 }).observe(wcEl);
    }
  }

  /* ---- 2c. the converter page: add cities to the widget (up to 8 here; the app itself has no limit). Nothing is stored. ---- */
  var MAX_CITIES = 8;
  function initPicker() {
    var add = $('#wcAdd');
    if (!add || !convBuilt || add.dataset.ready) return;
    add.dataset.ready = '1';
    var prompt = add.options[0]; // "Add a city", and the note once the widget is full
    function fill() {
      while (add.options.length > 1) add.remove(1);
      Object.keys(CITIES).filter(function (z) { return !demoCards.has(z); })
        .sort(function (a, b) { return nameOf(a).localeCompare(nameOf(b), I18N.lang); })
        .forEach(function (z) { var o = doc.createElement('option'); o.value = z; o.textContent = nameOf(z); add.appendChild(o); });
      var full = demoCards.size >= MAX_CITIES;
      prompt.textContent = T(full ? 'add.full' : 'add.city');
      add.value = '';
      add.disabled = full;
    }
    function commit(leaving) {
      var z = add.value;
      pending = false;
      if (!z || demoCards.has(z) || demoCards.size >= MAX_CITIES) { add.value = ''; return; }
      var c = buildCard(z);
      attachCardInput(c, z); demoCards.set(z, c); strip.appendChild(c); ZONES.push(z); // Copy times lists it too, in card order
      var o = doc.createElement('option'); o.value = z; o.textContent = nameOf(z); elZone.appendChild(o);
      renderDemo(0); // at the time on show: now, or the converted time
      var full = demoCards.size >= MAX_CITIES;
      // the picker is about to be disabled: keep focus somewhere useful, unless focus is already on its way elsewhere
      // (a commit on blur), where taking it back would undo the Tab or click that moved it
      if (full && !leaving) c.focus({ preventScroll: true });
      fill();
      if (strip.scrollWidth > strip.clientWidth + 1) strip.scrollTo({ left: strip.scrollWidth, behavior: reduced() ? 'auto' : 'smooth' });
      announce(T('say.added', { city: nameOf(z), time: hm(z, new Date(lastEpoch)) }) + (full ? '. ' + T('add.full') : ''));
    }
    // A closed select changes its value on every arrow key in Chrome and Edge on Windows. Adding a city on each of those
    // would add a run of cities by accident, so a change made with the arrow keys or by typing waits for Enter, or for
    // focus to leave the picker. A mouse, touch or the open list adds at once.
    var pending = false, byKey = false;
    add.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { if (pending) { e.preventDefault(); commit(); } return; }
      byKey = !e.altKey && (/^(Arrow(Up|Down|Left|Right)|Page(Up|Down)|Home|End)$/.test(e.key) || (e.key.length === 1 && e.key !== ' '));
    });
    add.addEventListener('pointerdown', function () { byKey = false; });
    add.addEventListener('change', function () { if (byKey) pending = !!add.value; else commit(); });
    add.addEventListener('blur', function () { if (pending) commit(true); });
    fill();
  }

  /* ---------------- one clock for everything live ---------------- */
  var timer = 0;
  function tick() {
    paintHero(false);
    if (!convert && demoVisible) renderDemo(1);
    clearTimeout(timer);
    timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
  }
  tick();
  doc.addEventListener('visibilitychange', function () { if (!doc.hidden) tick(); });

  /* ---------------- scroll plumbing: one rAF per frame, cached geometry, no layout reads ---------------- */
  // resizeFns measure; one may return a function that writes, and every write runs after every read, so a re-measure
  // lays the page out once
  var scrollFns = [], resizeFns = [], raf = 0, scrolled = null, overDark = null, darkRanges = [];
  // the nav turns to night over the night band, the dusk (once its sky has darkened) and the footer. Home page only: a
  // content page's nav keeps its static "scrolled" look and its theme-color
  var darkEls = hero ? [[$('#privacy'), 0], [$('#download'), 0.16], [$('.footer'), 0]] : [];
  resizeFns.push(function () {
    darkRanges = darkEls.filter(function (d) { return d[0]; }).map(function (d) {
      var r = d[0].getBoundingClientRect(), t = r.top + window.scrollY;
      return [t + r.height * d[1], t + r.height];
    });
  });
  function frame() { raf = 0; frameAt(window.scrollY); }
  function frameAt(y) {
    if (hero) {
      var s = y > 24;
      if (s !== scrolled) { scrolled = s; nav.classList.toggle('scrolled', s); }
      var mid = y + 32, od = false;
      for (var k = 0; k < darkRanges.length; k++) if (mid >= darkRanges[k][0] && mid < darkRanges[k][1]) { od = true; break; }
      if (od !== overDark) { overDark = od; nav.classList.toggle('over-dark', od); }
      syncThemeColor();
    }
    for (var i = 0; i < scrollFns.length; i++) scrollFns[i](y);
  }
  var resizeRaf = 0;
  function remeasure() {
    resizeRaf = 0;
    var y = window.scrollY;
    resizeFns.map(function (fn) { return fn(); }).forEach(function (write) { if (write) write(); });
    frameAt(y);
  }
  // geometry is measured in the next frame, never inside the task that changed the page, so building a section costs
  // one layout pass (the one the frame does anyway) instead of a forced one
  function requestRemeasure() { if (hero && !resizeRaf) resizeRaf = requestAnimationFrame(remeasure); }
  if (hero) { // the scroll-driven parts (nav states, the map scene) live on the home page only
    window.addEventListener('scroll', function () { if (!raf) raf = requestAnimationFrame(frame); }, { passive: true });
    window.addEventListener('resize', requestRemeasure, { passive: true });
    if ('ResizeObserver' in window) new ResizeObserver(requestRemeasure).observe(doc.body);
    requestRemeasure();
  }

  /* ---------------- 3. scene: real land, a smooth terminator, night that slides with scroll ---------------- */
  // Subsolar point with the same formulas as sun.js (derived from SunCalc, BSD-2, see the notice in sun.js): the sun is
  // overhead at (declination, RA minus sidereal time).
  function subsolar(date) {
    var d = date.valueOf() / DAY - 0.5 + 2440588 - 2451545;
    var M = rad * (357.5291 + 0.98560028 * d);
    var C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    var L = M + C + rad * 102.9372 + Math.PI, e = rad * 23.4397;
    var dec = Math.asin(Math.sin(e) * Math.sin(L));
    var ra = Math.atan2(Math.sin(L) * Math.cos(e), Math.cos(L));
    var lng = ra - rad * (280.16 + 360.9856235 * d);
    return { dec: dec, lng: Math.atan2(Math.sin(lng), Math.cos(lng)) };
  }
  // Night below a given sun altitude is a spherical cap around the antisolar point. Trace its edge and project it
  // (x = longitude, y = 75 - latitude, the same frame as world-land.js), repeated across the 1440 degrees the layer spans.
  var X0 = -560, X1 = 920;
  function capPath(la, lo, r) {
    var P = [], s1 = Math.sin(la * rad), c1 = Math.cos(la * rad), sr = Math.sin(r * rad), cr = Math.cos(r * rad), prev = null;
    for (var i = 0; i < 360; i++) {
      var t = i * rad, sp = s1 * cr + c1 * sr * Math.cos(t), phi = Math.asin(sp);
      var lam = lo + Math.atan2(Math.sin(t) * sr * c1, cr - s1 * sp) / rad;
      if (prev !== null) { var d = lam - prev; lam = prev + d - 360 * Math.round(d / 360); }
      prev = lam; P.push([lam, phi / rad]);
    }
    var back = P[0][0] - prev; back -= 360 * Math.round(back / 360);
    var net = prev + back - P[0][0];
    var f = function (v) { return Math.round(v * 100) / 100; };
    var pt = function (p, k) { return f(p[0] + k * 360) + ' ' + f(75 - p[1]); };
    var out = '', k, i2;
    if (Math.abs(net) < 180) { // a closed blob (near the equinox): repeat it
      var mean = P.reduce(function (s, p) { return s + p[0]; }, 0) / P.length;
      for (k = -4; k <= 4; k++) {
        var m = mean + k * 360; if (m < X0 - 200 || m > X1 + 200) continue;
        out += 'M' + P.map(function (p) { return pt(p, k); }).join('L') + 'Z';
      }
      return out;
    }
    if (net < 0) P.reverse();
    var yPole = la < 0 ? 75 + 90 + 400 : 75 - 90 - 400; // close along the pole the cap contains, far off the map
    var kS = Math.floor((X0 - P[0][0]) / 360) - 1, kE = Math.ceil((X1 - P[0][0]) / 360) + 1, pts = [];
    for (k = kS; k <= kE; k++) for (i2 = 0; i2 < P.length; i2++) pts.push(pt(P[i2], k));
    var x0 = f(P[0][0] + kS * 360), x1 = f(P[P.length - 1][0] + kE * 360);
    return 'M' + pts.join('L') + 'L' + x1 + ' ' + yPole + 'L' + x0 + ' ' + yPole + 'Z';
  }

  var scene = $('#awake'), nightBox = $('#mapNight'), sceneBuilt = false;
  function initScene() {
    if (!scene || sceneBuilt) return;
    sceneBuilt = true;
    var mapEl = $('#map'), world = $('#mapWorld'), pinsBox = $('#mapPins'), rowsBox = $('#sceneRows');
    var beats = scene.querySelectorAll('.beat'), rulerFill = $('#rulerFill'), rulerMove = $('#rulerMove'), rulerLabel = $('#rulerLabel');
    var homeLng = HOME_LL[1], nightBase = 0;
    world.style.setProperty('--hx', ((homeLng + 180) / 360).toFixed(4));

    // land: three copies so the map can be centred on the visitor's longitude and still fill any width
    var LAND = window.WCWorldLand;
    if (LAND && LAND.d) {
      var lw = LAND.width, lh = LAND.height;
      var land = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
      land.setAttribute('class', 'map-land'); land.setAttribute('aria-hidden', 'true'); land.setAttribute('focusable', 'false');
      land.setAttribute('viewBox', -lw + ' 0 ' + lw * 3 + ' ' + lh); land.setAttribute('preserveAspectRatio', 'none');
      land.innerHTML = '<defs><path id="wcLand" d="' + LAND.d + '"/></defs><use href="#wcLand" x="' + -lw + '"/><use href="#wcLand"/><use href="#wcLand" x="' + lw + '"/>';
      world.insertBefore(land, nightBox);
    }

    // night: layered twilight caps (sunset, then every 3 degrees to astronomical night), lightly blurred once
    var LEVELS = [[-0.833, 0.24], [-3, 0.1], [-6, 0.1], [-9, 0.1], [-12, 0.09], [-15, 0.08], [-18, 0.08]];
    var buildNight = function (ms) {
      nightBase = ms;
      var s = subsolar(new Date(ms)), dec = s.dec / rad, sl = s.lng / rad;
      var out = '<svg viewBox="-540 0 1440 133" preserveAspectRatio="none" aria-hidden="true" focusable="false"><defs>' +
        '<filter id="twBlur" filterUnits="userSpaceOnUse" x="-565" y="-6" width="1490" height="145"><feGaussianBlur stdDeviation="0.8"/></filter>' +
        '<radialGradient id="sunGlow"><stop offset="0" stop-color="#fff7d6" stop-opacity=".95"/><stop offset=".3" stop-color="#ffe7a0" stop-opacity=".45"/><stop offset="1" stop-color="#ffe7a0" stop-opacity="0"/></radialGradient>' +
        '</defs><g fill="currentColor" filter="url(#twBlur)">';
      LEVELS.forEach(function (l) { out += '<path fill-opacity="' + l[1] + '" d="' + capPath(-dec, sl + 180, 90 + l[0]) + '"/>'; });
      out += '</g>';
      for (var k = -3; k <= 3; k++) {
        var x = sl + k * 360; if (x < X0 || x > X1) continue;
        out += '<circle cx="' + x.toFixed(2) + '" cy="' + (75 - dec).toFixed(2) + '" r="10" fill="url(#sunGlow)"/><circle cx="' + x.toFixed(2) + '" cy="' + (75 - dec).toFixed(2) + '" r="1.4" fill="#fff3bf"/>';
      }
      nightBox.innerHTML = out + '</svg>';
    };

    // pins: each city on the copy nearest the visitor, so the map reads outward from home
    var pins = ZONES.map(function (z) {
      var ll = coordsOf(z) || [0, 0];
      var rel = ((ll[1] - homeLng) % 360 + 540) % 360 - 180;
      var el = doc.createElement('span');
      el.className = 'pin' + (z === HOME ? ' home' : '');
      el.style.left = ((homeLng + rel + 180) / 360 * 100).toFixed(3) + '%';
      el.style.top = ((75 - ll[0]) / 133 * 100).toFixed(3) + '%';
      el.innerHTML = '<i class="pin-dot"></i><span class="pin-label"><b></b><span class="t"></span>' + MOON + '</span>';
      el.querySelector('b').textContent = nameOf(z);
      pinsBox.appendChild(el);
      return { z: z, el: el, t: el.querySelector('.t'), rel: rel, lat: ll[0], n: null, tt: '' };
    });
    pins.slice().sort(function (a, b) { return a.rel - b.rel; }).forEach(function (p, i, arr) {
      var nx = arr[i + 1];
      if (p.rel > 120 || (nx && nx.rel - p.rel < 52 && Math.abs(nx.lat - p.lat) < 22)) p.el.classList.add('flip');
    });

    // phones and portrait tablets: the same cities as rows (or a row of cards) under the map
    var mqRows = matchMedia('(max-width: 760px), (min-width: 761px) and (max-width: 1100px) and (orientation: portrait)'); // as in site.css
    var rows = ZONES.map(function (z) {
      var el = doc.createElement('div');
      el.className = 'srow' + (z === HOME ? ' home' : '');
      el.innerHTML = '<span class="srow-city"></span><span class="srow-phase"></span><span class="srow-time"></span>';
      el.querySelector('.srow-city').textContent = nameOf(z);
      rowsBox.appendChild(el);
      return { z: z, el: el, ph: el.querySelector('.srow-phase'), t: el.querySelector('.srow-time'), n: null };
    });

    var lastQ = -1, lastBeat = -1;
    var sceneStep = function (q) {
      var date = q ? new Date(nightBase + q * STEP) : new Date();
      pins.forEach(function (p) {
        var n = isNight(p.z, date), t = hm(p.z, date);
        if (n !== p.n) { p.n = n; p.el.classList.toggle('is-night', n); }
        if (t !== p.tt) { p.tt = t; p.t.textContent = t; }
      });
      if (mqRows.matches) rows.forEach(function (r) {
        var n = isNight(r.z, date);
        if (n !== r.n) { r.n = n; r.el.classList.toggle('is-night', n); }
        setText(r.t, hm(r.z, date)); setText(r.ph, PHASE[phaseKey(r.z, date)]);
      });
      rulerLabel.textContent = q ? hm(HOME, date) + ' · +' + fmtHours(q / 4) : T('ruler.now', { time: hm(HOME, date) });
      mapEl.setAttribute('aria-label', T('map.aria', { time: hm(HOME, date), city: HOME_NAME,
        list: ZONES.map(function (z) { return nameOf(z) + ' ' + hm(z, date) + ', ' + T(isNight(z, date) ? 'map.night' : 'map.day'); }).join('; ') }));
    };

    var sTop = 0, sSpan = 1, sceneOn = false;
    resizeFns.push(function () {
      var r = scene.getBoundingClientRect();
      sTop = r.top + window.scrollY; sSpan = Math.max(1, scene.offsetHeight - window.innerHeight);
      if (mqRows.matches) return function () { rows.forEach(function (r2) { r2.n = null; }); sceneStep(Math.max(0, lastQ)); };
    });
    scrollFns.push(function (y) {
      if (!sceneOn) return;
      var p = reduced() ? 0 : Math.max(0, Math.min(1, (y - sTop) / sSpan));
      if (!SDA && !reduced()) { // compositor-only writes; browsers with scroll-driven animations do this in CSS
        nightBox.style.transform = 'translate3d(' + (-p * 25).toFixed(3) + '%,0,0)';
        rulerFill.style.transform = 'scaleX(' + p.toFixed(4) + ')';
        rulerMove.style.transform = 'translate3d(' + (p * 100).toFixed(3) + '%,0,0)';
        rulerLabel.style.transform = 'translateX(calc(' + (-p * 100).toFixed(2) + '% + ' + (p * 28 - 14).toFixed(1) + 'px))';
      }
      var beat = p < 0.34 ? 0 : p < 0.67 ? 1 : 2;
      if (beat !== lastBeat) { lastBeat = beat; beats.forEach(function (b, i) { b.classList.toggle('on', i === beat); }); }
      var q = Math.round(p * 96);
      if (q !== lastQ) { lastQ = q; sceneStep(q); }
    });
    if ('IntersectionObserver' in window) new IntersectionObserver(function (en) { sceneOn = en[0].isIntersecting; if (sceneOn) frame(); }, { rootMargin: '200px 0px' }).observe(scene);
    else sceneOn = true;

    buildNight(Math.round(Date.now() / STEP) * STEP);
    sceneStep(0);
    // keep "now" honest if the page stays open: rebuild the night shape when it drifts, refresh the resting clocks
    setInterval(function () {
      if (lastQ > 0) return;
      if (Date.now() - nightBase > 10 * MIN) buildNight(Math.round(Date.now() / STEP) * STEP);
      sceneStep(0);
    }, 30000);
  }

  /* ---------------- 4. features: live mini demos, built by initFeatures as #features nears the screen ---------------- */
  var featuresBuilt = false;
  function initFeatures() {
    if (featuresBuilt) return;
    featuresBuilt = true;
    // the one layout read (the planner's width picks how many hours fit) comes before any of the writes below
    var plannerEl = $('#planner'), plannerW = plannerEl ? plannerEl.clientWidth : 0;

    /* ---------------- 4a. converter tile: a time gets typed, three cities answer ---------------- */
    var mconvCards = $('#mconvCards');
    if (mconvCards) {
      mconvCards.textContent = ''; // the placeholder cards in the HTML only held the tile's height until now
      var mz = [HOME].concat(ZONES.filter(function (z) { return z !== HOME; }).filter(function (z, i, a) { return i === 0 || i === a.length - 1; }));
      $('#mconvZone').textContent = HOME_NAME;
      var mc = mz.map(function (z) {
        var el = doc.createElement('div'); el.className = 'mcard';
        el.innerHTML = '<span class="mcard-city"></span><span class="mcard-time num"></span><span class="mcard-meta"><span class="mcard-phase"></span><span class="mcard-shift num"></span></span>';
        el.querySelector('.mcard-city').textContent = nameOf(z);
        mconvCards.appendChild(el);
        return { z: z, el: el };
      });
      var mText = $('#mconvText');
      var SEQ = I18N.seq, REST = SEQ[SEQ.length - 1]; // the app's own examples in the page's language; rests on the last
      mText.textContent = REST;
      var showConv = function (text) {
        var t = parseTime(text); if (!t) return;
        var d = new Date(atWall(HOME, new Date(), t[0], t[1]));
        mc.forEach(function (m) {
          var mn = isNight(m.z, d);
          m.el.classList.toggle('is-night', mn);
          m.el.dataset.sky = skyOf(phaseKey(m.z, d), mn);
          m.el.classList.toggle('source', m.z === HOME);
          setChars(m.el.querySelector('.mcard-time'), hm(m.z, d), 1);
          m.el.querySelector('.mcard-phase').textContent = PHASE[phaseKey(m.z, d)];
          m.el.querySelector('.mcard-shift').textContent = dayMarker(dayDiff(m.z, d, HOME));
        });
      };
      showConv(REST);
      var convTimer = 0, convRuns = 0;
      var typeLoop = function (i) {
        var word = SEQ[i % SEQ.length], k = 0;
        mText.textContent = '';
        (function step() {
          k++; mText.textContent = word.slice(0, k);
          if (k < word.length) { convTimer = setTimeout(step, 120); return; }
          showConv(word);
          if (i + 1 >= SEQ.length * 2) return; // two passes, then rest on the last one (3pm)
          convTimer = setTimeout(function () { typeLoop(i + 1); }, 1700);
        })();
      };
      onVisible($('.t-conv'), function (v) {
        clearTimeout(convTimer);
        if (v && !reduced() && convRuns < 3) { convRuns++; typeLoop(0); }
      });
    }

    /* ---------------- 4b. planner tile: the app's hour grid ---------------- */
    // Four cities, a window of 8 to 12 of your hours (as many as fit). Each cell is that city's own hour there:
    // blue while it is 09:00 to 18:00, slate while the sun is down. The overlap block and the selected hour line
    // are grid items in the same grid, so they can never drift from the cells.
    var planner = $('#planner');
    if (planner) {
      var homeOff = offsetMinutes(HOME, now0);
      var pz = [HOME].concat(ZONES.filter(function (z) { return z !== HOME; }).sort(function (a, b) { return Math.abs(offsetMinutes(a, now0) - homeOff) - Math.abs(offsetMinutes(b, now0) - homeOff); }).slice(0, 3))
        .sort(function (a, b) { return offsetMinutes(a, now0) - offsetMinutes(b, now0); });
      var dayStart = atWall(HOME, now0, 0, 0);
      var info = pz.map(function (z) {
        var out = [];
        for (var h = 0; h < 24; h++) {
          var e = new Date(dayStart + h * HOUR), L = hourOf(z, e);
          out.push({ L: L, work: L >= 9 && L < 18, night: isNight(z, new Date(e.getTime() + 30 * MIN)), wd: L === 0 ? fmtRead(z, { weekday: 'short' }).format(e) : '' });
        }
        return out;
      });
      var runS = -1, runE = -1, total2 = 0;
      for (var ph = 0; ph < 24; ph++) {
        var all = info.every(function (a) { return a[ph].work; });
        if (all) { total2++; if (runS < 0) runS = ph; if (runE < 0 || runE === ph) runE = ph + 1; }
      }
      var hh = function (h) { return String(h % 24).padStart(2, '0') + ':00'; };
      var nowH = hourOf(HOME, new Date());
      var sumText = total2 ? T('plan.sum', { n: total2, start: hh(runS), end: hh(runE) }) : T('plan.none');
      $('#plannerSum').textContent = sumText;
      $('#plannerTitle').textContent = T('plan.title', { city: HOME_NAME });
      planner.setAttribute('aria-label', total2 ? T('plan.aria', { cities: pz.map(nameOf).join(', '), n: total2, start: hh(runS), end: hh(runE), city: HOME_NAME })
        : T('plan.ariaNone', { cities: pz.map(nameOf).join(', ') }));
      var gridEl = $('#plannerGrid'), builtCols = 0;
      var mk = function (cls, area, text) { var d = doc.createElement('span'); d.className = cls; d.style.gridArea = area; if (text != null) d.textContent = text; gridEl.appendChild(d); return d; };
      var buildPlanner = function (w0) {
        var w = w0 || planner.clientWidth, cols = w < 330 ? 8 : w < 430 ? 10 : 12;
        if (cols === builtCols) return;
        builtCols = cols; gridEl.textContent = ''; gridEl.style.setProperty('--cols', cols);
        var center = total2 ? (runS + runE) / 2 : nowH + 0.5;
        var h0 = Math.max(0, Math.min(24 - cols, Math.round(center - cols / 2)));
        var sel = total2 ? runS : Math.max(h0, Math.min(h0 + cols - 1, nowH));
        pz.forEach(function (z, r) {
          mk('pname' + (z === HOME ? ' home' : ''), (r + 1) + ' / 1', nameOf(z));
          mk('ptime', (r + 1) + ' / 2', hm(z, new Date(dayStart + sel * HOUR)));
          for (var i = 0; i < cols; i++) {
            var c = info[r][h0 + i];
            var cell = mk('pc' + (c.work ? ' work' : c.night ? ' night' : '') + (!total2 && h0 + i === sel ? ' sel' : '') + (c.wd ? ' day0' : ''), (r + 1) + ' / ' + (3 + i), c.wd || String(c.L));
            cell.style.setProperty('--c', i);
          }
        });
        var rows = pz.length + 1;
        mk('psel', '1 / ' + (3 + sel - h0) + ' / ' + rows + ' / span 1');
        var a0 = Math.max(runS, h0), a1 = Math.min(runE, h0 + cols);
        if (total2 && a1 > a0) mk('pover', '1 / ' + (3 + a0 - h0) + ' / ' + rows + ' / ' + (3 + a1 - h0));
      };
      buildPlanner(plannerW);
      resizeFns.push(function () { var w = planner.clientWidth; return function () { buildPlanner(w); }; });
    }

    /* ---------------- 4c. pin tile: a small pinned strip ---------------- */
    var pinStrip = $('#pinStrip');
    if (pinStrip) {
      ZONES.slice(0, 3).forEach(function (z) {
        var d = new Date(), el = doc.createElement('span');
        el.className = 'pchip' + (isNight(z, d) ? ' is-night' : '');
        el.innerHTML = '<b></b><span class="num"></span>';
        el.querySelector('b').textContent = nameOf(z); el.querySelector('span').textContent = hm(z, d);
        pinStrip.insertBefore(el, pinStrip.lastElementChild);
      });
    }

    /* ---------------- 4d. copy tile ---------------- */
    var copyEl = $('#copyLines');
    if (copyEl) {
      var d15 = new Date(atWall(HOME, new Date(), 15, 0));
      copyEl.textContent = ''; // the six placeholder lines in the HTML only held the tile's height until now
      copyLinesFor(d15, HOME).forEach(function (l, i) { var p = doc.createElement('span'); p.textContent = l; p.style.setProperty('--i', i); if (!i) p.className = 'hd'; copyEl.appendChild(p); });
      var copyBtn = $('#copyBtnDemo'), copyTile = $('.t-copy'), copyRuns = 0, copyT = 0;
      var playCopy = function () {
        copyTile.classList.remove('copied'); copyBtn.classList.remove('press');
        copyT = setTimeout(function () { copyBtn.classList.add('press'); copyT = setTimeout(function () { copyTile.classList.add('copied'); copyBtn.classList.remove('press'); }, 260); }, 500);
      };
      if (reduced()) copyTile.classList.add('copied');
      onVisible(copyTile, function (v) { clearTimeout(copyT); if (v && !reduced() && copyRuns < 3) { copyRuns++; playCopy(); } else if (v) copyTile.classList.add('copied'); });
    }

    /* ---------------- 4e. label tile: London becomes Design team ---------------- */
    var labelText = $('#labelText');
    if (labelText) {
      var lz = ZONES.indexOf('Europe/London') !== -1 ? 'Europe/London' : ZONES[ZONES.length - 1];
      var lcity = nameOf(lz), LABEL = T('label.team'), nowL = new Date();
      labelText.textContent = lcity;
      $('#labelTime').textContent = hm(lz, nowL);
      $('#labelPhase').textContent = PHASE[phaseKey(lz, nowL)];
      $('#labelCard').classList.toggle('is-night', isNight(lz, nowL));
      var labT = 0, labRuns = 0;
      var retype = function () {
        var s = lcity;
        (function del() {
          s = s.slice(0, -1); labelText.textContent = s;
          if (s.length) { labT = setTimeout(del, 55); return; }
          var k = 0;
          (function add() { k++; labelText.textContent = LABEL.slice(0, k); if (k < LABEL.length) labT = setTimeout(add, 85); })();
        })();
      };
      onVisible($('.t-label'), function (v) {
        clearTimeout(labT);
        if (!v) return;
        if (reduced()) { labelText.textContent = LABEL; return; }
        if (labRuns < 3) { labRuns++; labelText.textContent = lcity; labT = setTimeout(retype, 900); }
      });
    }
    initTileHalo();
    initTileLoops();
  }
  function onVisible(el, fn, opts) {
    if (!('IntersectionObserver' in window)) { fn(true); return; }
    new IntersectionObserver(function (en) { fn(en[0].isIntersecting); }, opts || { threshold: 0.35 }).observe(el);
  }

  /* ---------------- magnetic buttons: fine pointers only, off under reduced motion ---------------- */
  // The rect is read once on enter (never per move); moves are coalesced to one style write per frame.
  var mqFine = matchMedia('(hover: hover) and (pointer: fine)');
  doc.querySelectorAll('.magnetic').forEach(function (b) {
    var r = null, px = 0, py = 0, mraf = 0;
    function paint() {
      mraf = 0; if (!r) return;
      var dx = px - (r.left + r.width / 2), dy = py - (r.top + r.height / 2);
      var cap = function (v, m) { return Math.max(-m, Math.min(m, v)); }; // lean, never wander into the next button
      b.style.setProperty('--mx', cap(dx * 0.14, 9).toFixed(1) + 'px');
      b.style.setProperty('--my', cap(dy * 0.28, 6).toFixed(1) + 'px');
      b.style.setProperty('--gx', (px - r.left).toFixed(0) + 'px');
      b.style.setProperty('--gy', (py - r.top).toFixed(0) + 'px');
    }
    b.addEventListener('pointerenter', function (e) {
      if (e.pointerType !== 'mouse' || !mqFine.matches || reduced()) return;
      var t = b.getBoundingClientRect(), mx = parseFloat(b.style.getPropertyValue('--mx')) || 0, my = parseFloat(b.style.getPropertyValue('--my')) || 0;
      r = { left: t.left - mx, top: t.top - my, width: t.width, height: t.height }; // measure the resting position
      b.classList.add('is-near'); px = e.clientX; py = e.clientY; paint();
    });
    b.addEventListener('pointermove', function (e) { if (!r) return; px = e.clientX; py = e.clientY; if (!mraf) mraf = requestAnimationFrame(paint); });
    b.addEventListener('pointerleave', function () {
      if (!r) return; r = null; cancelAnimationFrame(mraf); mraf = 0;
      b.classList.remove('is-near'); b.style.setProperty('--mx', '0px'); b.style.setProperty('--my', '0px');
    });
  });

  /* ---------------- tile halo: a soft light under a mouse pointer (transform and opacity only) ---------------- */
  function initTileHalo() {
    var hotTile = null, hotStale = false;
    window.addEventListener('scroll', function () { if (hotTile) hotStale = true; }, { passive: true });
    doc.querySelectorAll('.tile').forEach(function (t) {
      var g = doc.createElement('span'); g.className = 'tile-glow'; g.setAttribute('aria-hidden', 'true'); t.insertBefore(g, t.firstChild);
      var r = null, px = 0, py = 0, graf = 0;
      function paint() { graf = 0; if (!r) return; g.style.transform = 'translate3d(' + (px - r.left).toFixed(0) + 'px,' + (py - r.top).toFixed(0) + 'px,0)'; }
      t.addEventListener('pointerenter', function (e) {
        if (e.pointerType !== 'mouse' || !mqFine.matches || reduced()) return;
        r = t.getBoundingClientRect(); hotTile = t; hotStale = false; px = e.clientX; py = e.clientY; paint(); t.classList.add('is-hot');
      });
      t.addEventListener('pointermove', function (e) {
        if (!r) return;
        if (hotStale) { r = t.getBoundingClientRect(); hotStale = false; } // the page scrolled under the pointer: measure once more
        px = e.clientX; py = e.clientY; if (!graf) graf = requestAnimationFrame(paint);
      });
      t.addEventListener('pointerleave', function () { r = null; if (hotTile === t) hotTile = null; t.classList.remove('is-hot'); });
    });
  }

  /* ---------------- tiles on screen: idle loops (the typing caret) run only while visible ---------------- */
  function initTileLoops() {
    if ('IntersectionObserver' in window) {
      var tio = new IntersectionObserver(function (en) { en.forEach(function (e) { e.target.classList.toggle('in-view', e.isIntersecting); }); });
      doc.querySelectorAll('.tile').forEach(function (t) { tio.observe(t); });
    } else doc.querySelectorAll('.tile').forEach(function (t) { t.classList.add('in-view'); });
  }

  /* ---------------- reveal fallback where scroll-driven animation is missing (home page) ---------------- */
  if (!SDA && hero) {
    root.classList.add('no-sda');
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (en) { en.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -10% 0px' });
      doc.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });
    } else doc.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('in'); });
  }

  /* ---------------- the sections below the hero are built as they near the screen ---------------- */
  // At load only the hero runs. The converter, the map scene and the feature tiles are each built the first time their
  // section comes within one screen height of the viewport, one per task (sections already on screen first), so no
  // single task holds up the page; the scroll plumbing re-measures after each. A visitor landing mid-page (a link to
  // #features or #download, a reload, back or forward) gets every section above that spot built right here, before the
  // browser scrolls to it: building it later would grow the page above and leave them short of where they meant to be.
  // An in-page link (the hero's Other downloads) does the same in its click, before the browser starts scrolling.
  // Without IntersectionObserver everything is built at once. A content page (no hero) builds its converter right here,
  // in this task, because it sits near the top of the page: built later, its cards would push the page down (CLS).
  // The converter plays itself only where there is a scripted cursor (#ghost, home page); the tool page never types.
  var builders = [[strip && $('#demo'), function () { initConverter(); if (ghost) initAutoplay(); initPicker(); }], [scene, initScene], [$('#features'), initFeatures]]
    .filter(function (b) { return b[0]; });
  var lazyIO = null;
  function byId(hash) { try { return hash.length > 1 ? doc.getElementById(decodeURIComponent(hash.slice(1))) : null; } catch (e) { return null; } }
  // build every section that holds el or comes before it (all of them when el is true)
  function buildAbove(el) {
    var n = builders.length;
    builders = builders.filter(function (b) {
      var above = el === true || (!!el && (b[0] === el || b[0].contains(el) || !!(b[0].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)));
      if (above) { b[1](); if (lazyIO) lazyIO.unobserve(b[0]); }
      return !above;
    });
    if (builders.length !== n) requestRemeasure();
  }
  var navEntry = performance.getEntriesByType ? performance.getEntriesByType('navigation')[0] : null;
  var restoring = !!navEntry && (navEntry.type === 'reload' || navEntry.type === 'back_forward');
  buildAbove(restoring || byId(location.hash) || !hero);
  doc.addEventListener('click', function (e) {
    var a = builders.length && e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (a) buildAbove(byId(a.getAttribute('href')));
  }, true);
  // printing the page prints every section, built or not yet (the print stylesheet shows the converter and tiles)
  window.addEventListener('beforeprint', function () { buildAbove(true); });
  var buildQueue = [], building = false;
  function runBuilds() {
    var fn = buildQueue.shift();
    if (!fn) { building = false; return; }
    fn();
    requestRemeasure();
    setTimeout(runBuilds, 0);
  }
  if ('IntersectionObserver' in window) {
    lazyIO = new IntersectionObserver(function (en) {
      var vh = window.innerHeight;
      en.filter(function (e) { return e.isIntersecting; })
        .map(function (e) { var r = e.boundingClientRect; return [r.bottom > 0 && r.top < vh ? 0 : 1, e.target]; })
        .sort(function (a, b) { return a[0] - b[0]; })
        .forEach(function (x) {
          lazyIO.unobserve(x[1]);
          builders.forEach(function (b) { if (b[0] === x[1] && buildQueue.indexOf(b[1]) < 0) buildQueue.push(b[1]); });
        });
      if (buildQueue.length && !building) { building = true; setTimeout(runBuilds, 0); }
    }, { rootMargin: '100% 0px' });
    builders.forEach(function (b) { lazyIO.observe(b[0]); });
  } else builders.forEach(function (b) { b[1](); });

  /* ---------------- first visit: compile the GPU's shaders at idle, not on the first scroll ---------------- */
  // A fresh browser profile has no compiled GPU programs. The first time the frosted nav, the converter (its shadows,
  // sky gradients, slider and the cursor's drop shadow) and the map's softened night are drawn, the GPU compiles
  // programs for them, which stalled the first scroll by 100 to 200 ms each. So, once the hero has settled, each is
  // drawn once in view at 0.4% opacity (one 8-bit step at most, so nothing shows), one per idle slot, then removed.
  // Small steps, and never while the page is scrolling: a visitor who gets there first simply compiles as before.
  function unId(n) { n.removeAttribute('id'); n.querySelectorAll('[id]').forEach(function (e) { e.removeAttribute('id'); }); return n; }
  var warmSteps = [
    function () { var n = doc.createElement('div'); n.className = 'gpu-warm-nav'; return n; },
    function () { // one day card and one night card: sky gradients, card shadows, the arc
      if (!convBuilt) return null; // not built yet: skipped
      var w = doc.createElement('div'), cs = [].slice.call(strip.children);
      var isN = function (c) { return c.classList.contains('is-night'); };
      w.className = 'wc-strip';
      [cs.filter(function (c) { return !isN(c); })[0], cs.filter(isN)[0]].forEach(function (c) { if (c) w.appendChild(unId(c.cloneNode(true))); });
      return w;
    },
    function () { // the whole converter: its shadow, controls, slider and the cursor's drop shadow
      if (!stageEl || !convBuilt) return null;
      var s = unId(stageEl.cloneNode(true)); s.classList.remove('reveal');
      var g = s.querySelector('.ghost'); if (g) { g.classList.add('on'); g.style.transform = 'translate(40px,40px)'; }
      return s;
    },
    function () { // the map's softened night, through a small window (same scale, so the same blur)
      if (!nightBox || !nightBox.firstChild) return null; // the scene is not built yet
      var win = doc.createElement('div'), d = doc.createElement('div');
      win.style.cssText = 'position:absolute;left:0;top:0;width:160px;height:120px;overflow:hidden;color:var(--map-night)';
      d.style.cssText = 'width:' + nightBox.offsetWidth + 'px;height:' + nightBox.offsetHeight + 'px';
      d.innerHTML = nightBox.innerHTML.replace(/twBlur/g, 'twBlurW').replace(/sunGlow/g, 'sunGlowW');
      d.firstChild.style.cssText = 'width:100%;height:100%;max-width:none';
      win.appendChild(d);
      return win;
    },
  ];
  var warmBox = null;
  function warmNext() {
    if (!warmSteps.length) { if (warmBox) { warmBox.remove(); warmBox = null; } return; }
    if (doc.hidden) { doc.addEventListener('visibilitychange', warmNext, { once: true }); return; } // hidden tabs draw nothing
    if (performance.now() - lastPageScroll < 500) { setTimeout(function () { idle(warmNext); }, 400); return; } // wait for rest
    if (!warmBox) { warmBox = doc.createElement('div'); warmBox.className = 'gpu-warm'; warmBox.setAttribute('aria-hidden', 'true'); warmBox.inert = true; doc.body.appendChild(warmBox); }
    var el = warmSteps.shift()();
    if (!el) { warmNext(); return; }
    warmBox.appendChild(el);
    // two frames to paint and raster it, a little longer for the GPU to finish, then the next one when the page is idle
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      setTimeout(function () { el.remove(); idle(warmNext); }, 200);
    }); });
  }
  function idle(fn) { if ('requestIdleCallback' in window) requestIdleCallback(fn, { timeout: 800 }); else setTimeout(fn, 60); }
  function warmStart() { setTimeout(function () { idle(warmNext); }, 1500); } // after the hero's entrance
  if (hero) { // the home page's effects only; a content page has none of them near its top
    if (doc.readyState === 'complete') warmStart(); else window.addEventListener('load', warmStart, { once: true });
  }

  var yr = $('#year'); if (yr) yr.textContent = String(new Date().getFullYear());
})();
