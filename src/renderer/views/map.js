// World map view: land outline, live day/night terminator, sun, and one dot per clock zone.
// API: window.WCMap = { mount(container, api), update(state), unmount() }
//   api   = { setSource(zone), labelOf(zone), onHover(zoneOrNull) }
//   state = { zones, localZone, date, converting, sourceZone, hour12, lang, locale }
// update() is called every tick; it only touches the DOM when something visible changed.
// Pure helpers are exposed on window.WCMap._internals for unit tests (no DOM at load time).
(function () {
  'use strict';
  const rad = Math.PI / 180;
  const NS = 'http://www.w3.org/2000/svg';

  // ---------- solar geometry (same formulas as sun.js, so night/day agrees with WCSun.isDay; SunCalc-derived, BSD-2, see the notice in sun.js) ----------
  const DAY_MS = 86400000;
  const J1970 = 2440588;
  const J2000 = 2451545;
  const OBLIQ = rad * 23.4397;
  const SUNSET_ALT = -0.833; // degrees; WCSun uses the same threshold
  const TWI_HI = 0.5; // shading starts just before sunset...
  const TWI_CIVIL = -6; // ...reaches ~half strength at the end of civil twilight...
  const TWI_LO = -12; // ...and is full night at nautical dusk.

  const wrapLng = (lng) => ((((lng + 180) % 360) + 360) % 360) - 180;

  // Subsolar point (where the sun is at the zenith) for an instant: { lat, lng } in degrees.
  function subsolar(date) {
    const d = date.valueOf() / DAY_MS - 0.5 + J1970 - J2000;
    const M = rad * (357.5291 + 0.98560028 * d);
    const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    const L = M + C + rad * 102.9372 + Math.PI;
    const dec = Math.asin(Math.sin(OBLIQ) * Math.sin(L));
    const ra = Math.atan2(Math.sin(L) * Math.cos(OBLIQ), Math.cos(L));
    const theta = rad * (280.16 + 360.9856235 * d); // Greenwich sidereal angle
    return { lat: dec / rad, lng: wrapLng((ra - theta) / rad) };
  }

  // Sun altitude (degrees) at lat/lng given a subsolar point.
  function altitude(lat, lng, ss) {
    const p = lat * rad, dec = ss.lat * rad;
    const s = Math.sin(p) * Math.sin(dec) + Math.cos(p) * Math.cos(dec) * Math.cos((lng - ss.lng) * rad);
    return Math.asin(Math.max(-1, Math.min(1, s))) / rad;
  }
  const isNight = (date, lat, lng) => altitude(lat, lng, subsolar(date)) <= SUNSET_ALT;

  const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  // 0 = full day, 1 = full night, with a soft civil-twilight band in between.
  function nightAlpha(alt) {
    if (alt >= TWI_HI) return 0;
    if (alt <= TWI_LO) return 1;
    if (alt >= TWI_CIVIL) return 0.5 * smooth((TWI_HI - alt) / (TWI_HI - TWI_CIVIL));
    return 0.5 + 0.5 * smooth((TWI_CIVIL - alt) / (TWI_CIVIL - TWI_LO));
  }

  // Latitude of the terminator for a longitude (handy for tests and debugging).
  function terminatorLat(lng, ss) {
    const dec = (Math.abs(ss.lat) < 1e-6 ? 1e-6 : ss.lat) * rad;
    return Math.atan(-Math.cos((lng - ss.lng) * rad) / Math.tan(dec)) / rad;
  }

  // ---------- geometry ----------
  function coordsOf(zone, win) {
    const w = win || (typeof window !== 'undefined' ? window : {});
    const m = w.ZONE_META && w.ZONE_META[zone];
    if (m && Number.isFinite(m.lat) && Number.isFinite(m.lng)) return { lat: m.lat, lng: m.lng };
    const c = w.ZONE_COORDS && w.ZONE_COORDS[zone];
    if (Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1])) return { lat: c[0], lng: c[1] };
    return null;
  }

  // Longitude to put at the middle of the view: opposite the widest empty gap between cities,
  // so the map seam never cuts through a group of cities.
  function pickCenter(lngs) {
    const xs = (lngs || []).filter(Number.isFinite).map(wrapLng).sort((a, b) => a - b);
    if (!xs.length) return 10;
    if (xs.length === 1) return xs[0];
    let best = -1, seam = 180;
    for (let i = 0; i < xs.length; i++) {
      const a = xs[i], b = i + 1 < xs.length ? xs[i + 1] : xs[0] + 360;
      if (b - a > best) { best = b - a; seam = (a + b) / 2; }
    }
    return wrapLng(seam + 180);
  }

  // Map frame for a container: px per degree (sx, sy), visible latitude window, content width, x of lng -180.
  // Wide short strips: the latitude window shrinks to the cities (70..133 deg) and x may stretch up to 35%;
  // any width left over shows the wrapped world (faded) on both sides.
  // Narrow tall views (vertical layout): the content is wider than the container and scrolls horizontally.
  const STRETCH = 1.35;
  function viewport(W, H, pts, bounds) {
    const N = (bounds && bounds.north) || 75, S = (bounds && bounds.south) || -58;
    const full = N - S, pad = Math.min(16, H * 0.1); // pills sit left/right of dots, so little vertical pad is needed
    const lats = (pts || []).map((p) => p.lat);
    const span = lats.length ? Math.max(1, Math.max(...lats) - Math.min(...lats)) : full;
    let sy = Math.min(H / 70, (H - 2 * pad) / span);
    sy = Math.max(sy, H / full);
    // too narrow to show the whole world anyway (vertical layout): show every latitude and scroll sideways
    if (W / 360 < sy) sy = Math.max(H / full, W / 360);
    const Lv = H / sy;
    const mid = lats.length ? (Math.max(...lats) + Math.min(...lats)) / 2 : (N + S) / 2;
    const top = Math.min(N, Math.max(S + Lv, mid + Lv / 2));
    const sx = Math.min(Math.max(W / 360, sy), sy * STRETCH);
    const worldW = 360 * sx;
    const Cw = Math.max(W, worldW);
    const centerLng = pickCenter((pts || []).map((p) => p.lng));
    const x0 = Cw / 2 - (centerLng + 180) * sx;
    return { W, H, sx, sy, top, worldW, Cw, x0, centerLng, scroll: worldW > W + 0.5, north: N, south: S };
  }

  function project(vp, lat, lng) {
    let x = vp.x0 + (lng + 180) * vp.sx;
    const lo = vp.Cw / 2 - vp.worldW / 2;
    x = lo + ((((x - lo) % vp.worldW) + vp.worldW) % vp.worldW);
    return { x, y: (vp.top - lat) * vp.sy };
  }
  function unproject(vp, x, y) {
    return { lat: vp.top - y / vp.sy, lng: wrapLng((x - vp.x0) / vp.sx - 180) };
  }

  // Greedy label placement. items: [{ x, y, w, h }] in priority order.
  // Returns [{ side: 'r'|'l'|'t'|'b'|'tr'|'tl'|'br'|'bl'|null, dx, dy, fallback }]: dx/dy offset the pill's top-left
  // from the dot. Sides are tried in order; the diagonals rescue dots near an edge or a neighbour.
  const GAP = 8, DOT = 5;
  const SIDES = ['r', 'l', 't', 'b', 'tr', 'tl', 'br', 'bl'];
  function offsetFor(side, w, h) {
    const d = GAP * 0.7;
    if (side === 'r') return { dx: GAP, dy: -h / 2 };
    if (side === 'l') return { dx: -GAP - w, dy: -h / 2 };
    if (side === 't') return { dx: -w / 2, dy: -GAP - h };
    if (side === 'tr') return { dx: d, dy: -d - h };
    if (side === 'tl') return { dx: -d - w, dy: -d - h };
    if (side === 'br') return { dx: d, dy: d };
    if (side === 'bl') return { dx: -d - w, dy: d };
    return { dx: -w / 2, dy: GAP };
  }
  function placeLabels(items, bounds) {
    const B = bounds || { x: 0, y: 0, w: Infinity, h: Infinity };
    const taken = items.map((it) => ({ x: it.x - DOT, y: it.y - DOT, w: DOT * 2, h: DOT * 2 }));
    const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const inside = (r) => r.x >= B.x + 2 && r.y >= B.y + 2 && r.x + r.w <= B.x + B.w - 2 && r.y + r.h <= B.y + B.h - 2;
    return items.map((it, i) => {
      let fallback = null;
      for (const side of SIDES) {
        const o = offsetFor(side, it.w, it.h);
        const r = { x: it.x + o.dx - 2, y: it.y + o.dy - 1, w: it.w + 4, h: it.h + 2 };
        if (!inside(r)) continue;
        if (!fallback) fallback = { side, dx: o.dx, dy: o.dy };
        if (taken.some((t, j) => j !== i && hit(r, t))) continue;
        taken.push(r);
        return { side, dx: o.dx, dy: o.dy, fallback: null };
      }
      // Hidden (shown on hover/focus). Keep that hover position inside the map so it is never cut off.
      let f = fallback;
      if (!f) {
        const o = offsetFor(it.x > B.x + B.w / 2 ? 'l' : 'r', it.w, it.h);
        const cx = Math.max(B.x + 2, Math.min(it.x + o.dx, B.x + B.w - it.w - 2));
        const cy = Math.max(B.y + 2, Math.min(it.y + o.dy, B.y + B.h - it.h - 2));
        f = { side: 'r', dx: Number.isFinite(cx) ? cx - it.x : o.dx, dy: Number.isFinite(cy) ? cy - it.y : o.dy };
      }
      return { side: null, dx: f.dx, dy: f.dy, fallback: f.side };
    });
  }

  // ---------- time formatting ----------
  const fmtCache = new Map();
  function formatTime(zone, date, hour12, locale) {
    const key = zone + '|' + (hour12 ? 1 : 0) + '|' + (locale || '');
    let f = fmtCache.get(key);
    if (!f) {
      const opts = hour12 ? { hour: 'numeric', minute: '2-digit', hour12: true } : { hourCycle: 'h23', hour: '2-digit', minute: '2-digit' };
      opts.timeZone = zone;
      try { f = new Intl.DateTimeFormat(locale || undefined, opts); } catch { f = new Intl.DateTimeFormat('en-US', opts); }
      if (fmtCache.size > 400) fmtCache.clear();
      fmtCache.set(key, f);
    }
    return f.format(date);
  }
  const cityName = (zone) => {
    const m = typeof window !== 'undefined' && window.ZONE_META && window.ZONE_META[zone];
    return (m && m.city) || String(zone).split('/').pop().replace(/_/g, ' ');
  };

  // ---------- view ----------
  let V = null; // mounted view state
  let seq = 0;

  const el = (tag, cls, parent) => { const n = document.createElement(tag); if (cls) n.className = cls; if (parent) parent.appendChild(n); return n; };
  const svg = (tag, attrs, parent) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; };
  const reduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

  function mount(container, api) {
    if (V) unmount();
    if (!container) return;
    const land = window.WCWorldLand || { width: 3600, height: 1330, north: 75, south: -58, d: '' };
    const id = 'wcmap-land-' + (++seq);
    const root = el('div', 'wc-map instant');
    // No role/label here: the #mapView container carries the translated label.
    const scroller = el('div', 'map-scroll', root);
    const content = el('div', 'map-content', scroller);
    const svgEl = svg('svg', { class: 'map-land', 'aria-hidden': 'true', focusable: 'false' }, content);
    const defs = svg('defs', {}, svgEl);
    svg('path', { id, d: land.d }, defs);
    const copies = svg('g', { class: 'map-copies' }, svgEl);
    const equator = svg('line', { class: 'map-equator', x1: 0, x2: 0, y1: 0, y2: 0, 'vector-effect': 'non-scaling-stroke' }, svgEl);
    const glow = el('div', 'map-glow', content);
    const nightA = el('canvas', 'map-night on', content);
    const nightB = el('canvas', 'map-night', content);
    const sun = el('div', 'map-sun', content);
    const cities = el('div', 'map-cities', content);
    container.appendChild(root);

    V = {
      container, api: api || {}, land, id, root, scroller, content, svgEl, copies, equator, glow, sun, cities,
      canvases: [nightA, nightB], front: 0,
      nodes: new Map(), // zone -> { btn, dot, pill, name, time, name$, time$, w, h, x, y, cls }
      state: null, vp: null, geoKey: '', zonesKey: '', ss: null, drawnSs: null, sunKey: '', needLabels: true,
      nightColor: '', hover: null, raf: 0, instantTimer: 0,
    };

    cities.addEventListener('click', onClick);
    cities.addEventListener('mouseover', onOver);
    cities.addEventListener('mouseout', onOut);
    cities.addEventListener('focusin', onOver);
    cities.addEventListener('focusout', onOut);
    scroller.addEventListener('wheel', onWheel, { passive: false });

    V.ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => schedule(true)) : null;
    if (V.ro) V.ro.observe(root);
    V.mo = typeof MutationObserver === 'function' ? new MutationObserver(() => { if (V) { V.nightColor = ''; schedule(false); } }) : null;
    if (V.mo) V.mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    try {
      V.mq = window.matchMedia('(prefers-color-scheme: dark)');
      V.onScheme = () => { if (V) { V.nightColor = ''; schedule(false); } };
      V.mq.addEventListener('change', V.onScheme);
    } catch { V.mq = null; }
    requestAnimationFrame(() => { if (V && V.root === root) root.classList.remove('instant'); });
  }

  function unmount() {
    if (!V) return;
    const v = V;
    V = null;
    if (v.ro) v.ro.disconnect();
    if (v.mo) v.mo.disconnect();
    if (v.mq && v.onScheme) v.mq.removeEventListener('change', v.onScheme);
    cancelAnimationFrame(v.raf);
    clearTimeout(v.instantTimer);
    if (v.hover && v.api.onHover) { try { v.api.onHover(null); } catch { /* ignore */ } }
    v.root.remove();
  }

  // Re-render outside update() (resize, theme change). Resizes skip transitions so nothing swims.
  function schedule(resized) {
    if (!V) return;
    if (resized) {
      V.root.classList.add('instant');
      clearTimeout(V.instantTimer);
      V.instantTimer = setTimeout(() => V && V.root.classList.remove('instant'), 180);
    }
    if (V.raf) return;
    V.raf = requestAnimationFrame(() => { if (!V) return; V.raf = 0; if (V.state) render(); });
  }

  const cityOf = (t) => (t && t.closest ? t.closest('.map-city') : null);
  function onClick(e) {
    const b = cityOf(e.target);
    if (!b || !V) return;
    e.preventDefault();
    if (V.api.setSource) V.api.setSource(b.dataset.zone);
  }
  function setHover(zone) {
    if (!V || V.hover === zone) return;
    if (V.hover && V.nodes.get(V.hover)) V.nodes.get(V.hover).btn.classList.remove('is-hover');
    V.hover = zone;
    if (zone && V.nodes.get(zone)) V.nodes.get(zone).btn.classList.add('is-hover');
    V.root.classList.toggle('hovering', !!zone);
    if (V.api.onHover) { try { V.api.onHover(zone); } catch (err) { console.warn('map hover', err); } }
  }
  function onOver(e) { const b = cityOf(e.target); if (b) setHover(b.dataset.zone); }
  function onOut(e) {
    const b = cityOf(e.target);
    if (!b) return;
    const to = cityOf(e.relatedTarget);
    if (to === b) return;
    if (e.type === 'focusout' && V && V.root.contains(document.activeElement) && cityOf(document.activeElement)) return;
    setHover(to ? to.dataset.zone : null);
  }
  function onWheel(e) {
    if (!V || !V.vp || !V.vp.scroll) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { V.scroller.scrollLeft += e.deltaY; e.preventDefault(); }
  }

  function update(state) {
    if (!V || !state) return;
    V.state = state;
    render();
  }

  function render() {
    const v = V, st = v.state;
    const W = v.root.clientWidth, H = v.root.clientHeight;
    if (!W || !H) return; // hidden; ResizeObserver re-renders when shown
    const date = st.date instanceof Date ? st.date : new Date(st.date != null ? st.date : Date.now());
    if (!Number.isFinite(date.getTime())) return;
    const zones = Array.isArray(st.zones) ? st.zones : [];
    const locale = st.locale || st.lang || undefined;

    // 1. city nodes (only rebuilt when the zone list changes)
    const zonesKey = zones.join('|');
    if (zonesKey !== v.zonesKey) { syncNodes(zones); v.zonesKey = zonesKey; v.needLabels = true; }
    const pts = [];
    for (const z of zones) { const n = v.nodes.get(z); if (n && n.c) pts.push(n.c); }

    // 2. frame
    const geoKey = [W, H, pts.map((p) => p.lat + ',' + p.lng).join(';')].join('|');
    let geoChanged = false;
    if (geoKey !== v.geoKey) {
      const prevScroll = v.vp && v.vp.scroll;
      v.vp = viewport(W, H, pts, v.land);
      v.geoKey = geoKey;
      geoChanged = true;
      layoutFrame(prevScroll !== v.vp.scroll || !prevScroll);
    }
    const vp = v.vp;

    // 3. sun + night shading
    const ss = subsolar(date);
    // Only converter jumps glide; the live minute step jumps (no 700 ms transform transition every minute).
    placeSun(ss, geoChanged || !st.converting);
    if (!v.nightColor) { readColors(); v.drawnSs = null; }
    const moved = v.drawnSs ? Math.max(Math.abs(wrapLng(ss.lng - v.drawnSs.lng)), Math.abs(ss.lat - v.drawnSs.lat)) : Infinity;
    if (geoChanged || moved > 0.05) drawNight(ss, !geoChanged && moved > 1.5 && moved !== Infinity);

    // 4. per-city text + classes
    const home = st.localZone, src = st.converting ? st.sourceZone : null;
    let textChanged = false;
    for (const z of zones) {
      const n = v.nodes.get(z);
      if (!n || !n.c) continue;
      let label = '';
      try { label = v.api.labelOf ? v.api.labelOf(z) : ''; } catch { label = ''; }
      label = label || cityName(z);
      const time = formatTime(z, date, !!st.hour12, locale);
      if (label !== n.name$) { n.name.textContent = label; n.name$ = label; textChanged = true; }
      if (time !== n.time$) { n.time.textContent = time; n.time$ = time; textChanged = true; }
      const night = altitude(n.c.lat, n.c.lng, ss) <= SUNSET_ALT;
      const cls = (z === home ? 'H' : '') + (z === src ? 'S' : '') + (night ? 'N' : '');
      if (cls !== n.cls) {
        n.btn.classList.toggle('home', z === home);
        n.btn.classList.toggle('source', z === src);
        n.btn.classList.toggle('is-night', night);
        if (cls.replace('N', '') !== n.cls.replace('N', '')) v.needLabels = true; // priority changed
        n.cls = cls;
      }
      if (textChanged || n.aria !== label + time) { n.btn.setAttribute('aria-label', label + ', ' + time); n.aria = label + time; }
      if (geoChanged) {
        const p = project(vp, n.c.lat, n.c.lng);
        n.x = p.x; n.y = p.y;
        n.btn.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
      }
    }

    // 5. labels (measure only after text or frame changes)
    if (textChanged || geoChanged || v.needLabels) layoutLabels(zones, home, src);
  }

  function syncNodes(zones) {
    const v = V;
    const keep = new Set(zones);
    for (const [z, n] of v.nodes) if (!keep.has(z)) { n.btn.remove(); v.nodes.delete(z); if (v.hover === z) setHover(null); }
    for (const z of zones) {
      if (v.nodes.has(z)) continue;
      const btn = el('button', 'map-city');
      btn.type = 'button';
      btn.dataset.zone = z;
      btn.tabIndex = 0;
      const dot = el('span', 'map-dot', btn);
      const pill = el('span', 'map-pill', btn);
      const name = el('span', 'map-name', pill);
      const time = el('span', 'map-time', pill);
      const c = coordsOf(z);
      if (!c) btn.hidden = true;
      v.nodes.set(z, { btn, dot, pill, name, time, name$: '', time$: '', c, cls: '', w: 0, h: 0, x: 0, y: 0, side: '' });
    }
    // DOM order = tab order = zones order
    for (const z of zones) v.cities.appendChild(v.nodes.get(z).btn);
  }

  function layoutFrame(recenter) {
    const v = V, vp = v.vp, L = v.land;
    v.root.classList.toggle('is-scroll', vp.scroll);
    v.content.style.width = vp.Cw + 'px';
    v.content.style.height = vp.H + 'px';
    v.svgEl.setAttribute('viewBox', `0 0 ${vp.Cw.toFixed(1)} ${vp.H.toFixed(1)}`);
    v.svgEl.setAttribute('width', vp.Cw.toFixed(1));
    v.svgEl.setAttribute('height', vp.H.toFixed(1));
    const upd = L.width / 360;
    const kx = vp.sx / upd, ky = vp.sy / upd;
    const ty = (vp.top - L.north) * vp.sy;
    const first = Math.floor(-vp.x0 / vp.worldW), last = Math.ceil((vp.Cw - vp.x0) / vp.worldW) - 1;
    while (v.copies.firstChild) v.copies.firstChild.remove();
    for (let k = first; k <= last; k++) {
      svg('use', { href: '#' + v.id, transform: `translate(${(vp.x0 + k * vp.worldW).toFixed(2)} ${ty.toFixed(2)}) scale(${kx.toFixed(5)} ${ky.toFixed(5)})` }, v.copies);
    }
    // wrapped copies beyond the primary world fade out, so the repeat reads as "the globe continues"
    const lo = (vp.Cw - vp.worldW) / 2;
    const mask = lo > 4 ? `linear-gradient(90deg, rgb(0 0 0 / 0.28) 0px, #000 ${lo.toFixed(0)}px, #000 ${(vp.Cw - lo).toFixed(0)}px, rgb(0 0 0 / 0.28) ${vp.Cw.toFixed(0)}px)` : '';
    v.svgEl.style.webkitMaskImage = mask;
    v.svgEl.style.maskImage = mask;
    const ye = (vp.top * vp.sy).toFixed(1);
    v.equator.setAttribute('x2', vp.Cw.toFixed(1));
    v.equator.setAttribute('y1', ye);
    v.equator.setAttribute('y2', ye);
    const r = Math.max(vp.sx, vp.sy) * 80;
    v.glow.style.width = v.glow.style.height = (2 * r).toFixed(0) + 'px';
    v.glow.style.marginLeft = v.glow.style.marginTop = (-r).toFixed(0) + 'px';
    for (const c of v.canvases) { c.style.width = vp.Cw + 'px'; c.style.height = vp.H + 'px'; }
    if (recenter && vp.scroll) {
      // start with the home city in the middle (falls back to the middle of the cities)
      const hn = v.state && v.nodes.get(v.state.localZone);
      const hx = hn && hn.c ? project(vp, hn.c.lat, hn.c.lng).x : vp.Cw / 2;
      v.scroller.scrollLeft = Math.max(0, Math.min(vp.Cw - vp.W, hx - vp.W / 2));
    }
    v.needLabels = true;
  }

  function placeSun(ss, instant) {
    const v = V, vp = v.vp;
    const lat = Math.max(vp.top - vp.H / vp.sy + 1, Math.min(vp.top - 1, ss.lat));
    const p = project(vp, lat, ss.lng);
    const key = p.x.toFixed(1) + ',' + p.y.toFixed(1);
    if (key === v.sunKey) return;
    // a jump across the seam (or a resize) must not slide across the whole map
    const jump = v.sunPos && Math.abs(p.x - v.sunPos.x) > vp.worldW / 3;
    if (jump || instant) { v.sun.classList.add('no-anim'); v.glow.classList.add('no-anim'); }
    const t = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    v.sun.style.transform = t;
    v.glow.style.transform = t;
    if (jump || instant) {
      void v.sun.offsetWidth; // commit the jump before re-enabling transitions
      v.sun.classList.remove('no-anim');
      v.glow.classList.remove('no-anim');
    }
    v.sunKey = key;
    v.sunPos = p;
  }

  function readColors() {
    const cs = getComputedStyle(V.root);
    V.nightColor = cs.getPropertyValue('--map-night').trim() || 'rgb(20, 30, 70)';
    const a = parseFloat(cs.getPropertyValue('--map-night-alpha'));
    V.nightMax = Number.isFinite(a) ? a : 0.55;
  }

  const CELL = 5; // CSS px per shading sample; the browser's bilinear upscale keeps the edge soft
  function drawNight(ss, crossfade) {
    const v = V, vp = v.vp;
    const fade = crossfade && !reduced();
    const idx = fade ? 1 - v.front : v.front;
    const cv = v.canvases[idx];
    const cw = Math.max(2, Math.ceil(vp.Cw / CELL) + 1), ch = Math.max(2, Math.ceil(vp.H / CELL) + 1);
    if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(cw, ch);
    const data = img.data;
    const sd = Math.sin(ss.lat * rad), cd = Math.cos(ss.lat * rad);
    const cosH = new Float32Array(cw);
    // sample centres are spread so the first/last samples land on the content edges
    const fx = vp.Cw / (cw - 1), fy = vp.H / (ch - 1);
    for (let i = 0; i < cw; i++) cosH[i] = Math.cos(((i * fx - vp.x0) / vp.sx - 180 - ss.lng) * rad);
    const maxA = 255 * v.nightMax;
    for (let j = 0; j < ch; j++) {
      const lat = (vp.top - (j * fy) / vp.sy) * rad;
      const a = Math.sin(lat) * sd, b = Math.cos(lat) * cd;
      let o = j * cw * 4 + 3;
      for (let i = 0; i < cw; i++, o += 4) {
        const alt = Math.asin(Math.max(-1, Math.min(1, a + b * cosH[i]))) / rad;
        data[o] = maxA * nightAlpha(alt);
      }
    }
    ctx.globalCompositeOperation = 'copy';
    ctx.putImageData(img, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = v.nightColor;
    ctx.fillRect(0, 0, cw, ch);
    ctx.globalCompositeOperation = 'source-over';
    // canvas pixels are sample points; stretch so sample i sits at x = i * fx
    cv.style.width = (cw * fx).toFixed(1) + 'px';
    cv.style.height = (ch * fy).toFixed(1) + 'px';
    cv.style.transform = `translate(${(-fx / 2).toFixed(2)}px, ${(-fy / 2).toFixed(2)}px)`;
    if (fade) {
      v.canvases[idx].classList.add('on');
      v.canvases[1 - idx].classList.remove('on');
      v.front = idx;
    }
    v.drawnSs = ss;
  }

  function layoutLabels(zones, home, src) {
    const v = V, vp = v.vp;
    const list = zones.map((z) => v.nodes.get(z)).filter((n) => n && n.c);
    // measure (one read pass after all writes)
    for (const n of list) { n.w = n.pill.offsetWidth; n.h = n.pill.offsetHeight; }
    if (list.some((n) => !n.w)) return; // not laid out yet
    const rank = (n) => (n.btn.dataset.zone === home ? 0 : n.btn.dataset.zone === src ? 1 : 2);
    const order = list.map((n, i) => ({ n, i })).sort((a, b) => rank(a.n) - rank(b.n) || a.i - b.i).map((o) => o.n);
    const bounds = vp.scroll ? { x: 0, y: 0, w: vp.Cw, h: vp.H } : { x: 0, y: 0, w: vp.W, h: vp.H };
    const res = placeLabels(order.map((n) => ({ x: n.x, y: n.y, w: n.w, h: n.h })), bounds);
    order.forEach((n, k) => {
      const r = res[k];
      const side = r.side || 'off';
      if (side !== n.side) {
        n.btn.classList.remove(...SIDES.map((s) => 'at-' + s), 'at-off');
        n.btn.classList.add('at-' + side);
        n.side = side;
      }
      n.pill.style.transform = `translate(${r.dx.toFixed(1)}px, ${r.dy.toFixed(1)}px)`;
    });
    v.needLabels = false;
  }

  const api = {
    mount, update, unmount,
    _internals: { subsolar, altitude, isNight, nightAlpha, terminatorLat, coordsOf, pickCenter, viewport, project, unproject, placeLabels, formatTime, wrapLng, SUNSET_ALT },
  };
  if (typeof window !== 'undefined') window.WCMap = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
