/* Open World Clock in the browser: the page around the app, which lives in the home page's hero (an iframe of /app/).
   Runs after app.js (a deferred script).
   - Share: the home page's Share button (site/assets/demo.js) asks window.WCShareHash() for the cities on screen (and
     the converted time, while converting) and copies https://openworldclock.com/#... The link keeps everything in the
     hash, which browsers never send to a server.
   - Shared links: the banner shown while one is open ("Save these cities" / "Show my cities"), and the converted time
     a link carries (#t=2026-09-24T15:00&z=America/New_York), applied once the app has started. The hash is the home
     page's (shim.js reads it through the frame), and a new one there (hashchange) opens the new cities.
   - The wheel scrubs the time only with intent: a page scrolling past the frame keeps scrolling (no scroll trap).
   - Help: how to move a city on a touch screen, and the free and open source line with a link to the code.
   - The world map (app.later.js and app.later.css), loaded after the page.
   - Touch reorder: touch and hold a card, then drag it (phones and tablets).
   - On phones the hero's frame takes the planner's height while it is open (rows plus hour scale).
   - A page language in the hash (#lang=pt, read by shim.js) survives clearing a shared link.
   - An offline service worker from an earlier version of /app/ is removed, with its caches.
   Talks to the app only through the DOM contract in CONTRACT.md (#convTime, #convDate, #convZone, #convClear, #btnMap,
   .card[data-zone], the card drag and drop and keydown handlers, wc:* events) and window.WCWeb (shim.js). Sends
   nothing anywhere. */
(() => {
  'use strict';
  const W = window.WCWeb;
  if (!W) return;
  const $ = (id) => document.getElementById(id);
  const pad2 = (n) => String(n).padStart(2, '0');

  // ---------- strings (the app's own come from i18n.js; these follow its language) ----------
  const STR = {
    en: {
      'shared.region': 'Shared cities',
      'shared.text': 'Showing shared cities. Your saved list is unchanged.',
      'shared.save': 'Save these cities',
      'shared.mine': 'Show my cities',
      'shared.saved': 'Saved. These are now your cities.',
      'free': 'Free and open source. No account, no ads.',
      'free.title': 'Source code on GitHub',
      'touch.tip': 'Touch and hold a city, then drag it to a new place. Let go without moving to open its menu.',
    },
    pt: {
      'shared.region': 'Cidades compartilhadas',
      'shared.text': 'Você está vendo cidades compartilhadas. Sua lista salva continua igual.',
      'shared.save': 'Salvar estas cidades',
      'shared.mine': 'Mostrar minhas cidades',
      'shared.saved': 'Cidades salvas. Agora esta é a sua lista.',
      'free': 'Grátis e de código aberto. Sem cadastro, sem anúncios.',
      'free.title': 'Código-fonte no GitHub',
      'touch.tip': 'Toque e segure uma cidade e arraste para outro lugar. Para abrir o menu dela, solte sem arrastar.',
    },
    es: {
      'shared.region': 'Ciudades compartidas',
      'shared.text': 'Estás viendo ciudades compartidas. Tu lista guardada sigue igual.',
      'shared.save': 'Guardar estas ciudades',
      'shared.mine': 'Mostrar mis ciudades',
      'shared.saved': 'Listo. Ahora estas son tus ciudades.',
      'free': 'Gratis y de código abierto. Sin cuenta, sin anuncios.',
      'free.title': 'Código fuente en GitHub',
      'touch.tip': 'Mantén presionada una ciudad y arrástrala a otro lugar. Suéltala sin moverla para abrir su menú.',
    },
  };
  const lang = () => (window.WCI18N && STR[window.WCI18N.lang] ? window.WCI18N.lang : 'en');
  const t = (k) => STR[lang()][k] || STR.en[k] || k;
  // Only what changed is written: rewriting the same text would lay the page out again while it starts.
  function applyStrings() {
    document.querySelectorAll('[data-web]').forEach((n) => { const s = t(n.dataset.web); if (n.textContent !== s) n.textContent = s; });
    document.querySelectorAll('[data-web-aria]').forEach((n) => { const s = t(n.dataset.webAria); if (n.getAttribute('aria-label') !== s) n.setAttribute('aria-label', s); });
    document.querySelectorAll('[data-web-title]').forEach((n) => { const s = t(n.dataset.webTitle); if (n.title !== s) n.title = s; });
  }
  // Help (the app's "?" popover): on touch screens, how to move a city; and, for everyone, the free and open source
  // line from the top bar (which has no room for it on phones). Added next to the app's own lists, which app.js
  // rebuilds by themselves (renderTip), so these stay.
  {
    const tipText = $('tipText'), keys = $('helpKeys');
    const make = (tag, cls, key) => { const n = document.createElement(tag); n.className = cls; n.dataset.web = key; n.textContent = t(key); return n; };
    if (tipText) {
      const touch = document.createElement('span');
      touch.className = 'tip-text web-touch-tip';
      touch.append(make('span', 'chip', 'touch.tip'));
      tipText.after(touch);
    }
    if (keys) {
      const p = document.createElement('p');
      p.className = 'web-help-free';
      const a = make('a', 'web-free-link', 'free');
      a.href = 'https://github.com/joaoCarvalho1000/open-world-clock';
      a.target = '_blank';
      a.rel = 'noopener';
      a.dataset.webTitle = 'free.title';
      a.title = t('free.title');
      p.append(a);
      keys.after(p);
    }
  }
  // app.js sets <html lang> whenever its language changes (applyStatic).
  new MutationObserver(applyStrings).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  applyStrings();

  // ---------- status toast (role=status, so screen readers hear it) ----------
  const toastEl = $('webToast');
  let toastTimer = 0;
  function toast(msg) {
    clearTimeout(toastTimer);
    toastEl.textContent = '';
    toastEl.classList.remove('on');
    // a fresh text node each time, so the same message twice is announced twice
    requestAnimationFrame(() => {
      toastEl.textContent = msg;
      toastEl.classList.add('on');
      toastTimer = setTimeout(() => { toastEl.classList.remove('on'); }, 2400);
    });
  }

  // ---------- share (the home page's Share button calls window.WCShareHash) ----------
  function todayIn(zone) {
    const p = window.WCTime.parts(zone, new Date(), { year: 'numeric', month: '2-digit', day: '2-digit' });
    return `${p.year}-${p.month}-${p.day}`;
  }
  // The conversion on screen, { ymd, h, mi, zone }, or null when the clocks show the current time.
  function currentConversion() {
    if (!$('convClear') || $('convClear').hidden) return null;
    const p = window.WCTime.parseTime($('convTime').value);
    const zone = $('convZone').value;
    if (!p || !zone) return null;
    return { ymd: $('convDate').value || todayIn(zone), h: p[0], mi: p[1], zone };
  }
  // The hash for a link to the clocks on screen ('c=...&t=...&z=...'), or '' when there is no city.
  window.WCShareHash = () => {
    const s = W.settings();
    return s.zones.length ? W.buildShare(s.zones, currentConversion()) : '';
  };

  // ---------- shared links ----------
  // The link's hash goes from this page and from the home page around it (its own anchors, like #download, stay). A
  // page language in either hash (#lang=pt, shim.js) stays.
  const keepLang = (hash) => { const l = W.langFrom(hash); return l ? `#lang=${l}` : ''; };
  const clearHash = () => {
    if (location.hash) history.replaceState(history.state, '', location.pathname + location.search + keepLang(location.hash));
    try {
      const h = window.parent !== window ? window.parent : null;
      if (h && W.parseShare(h.location.hash)) h.history.replaceState(h.history.state, '', h.location.pathname + h.location.search + keepLang(h.location.hash));
    } catch { /* not the home page */ }
  };
  $('webSave').addEventListener('click', () => {
    if (!W.saveShared()) return;
    clearHash();
    toast(t('shared.saved'));
    const add = $('zoneSearch');
    if (add) add.focus({ preventScroll: true });
  });
  $('webMine').addEventListener('click', () => {
    clearHash();
    // a converted time from the link goes too: back to the saved cities, showing now
    const time = $('convTime');
    if (time && time.value) { time.value = ''; time.dispatchEvent(new Event('input', { bubbles: true })); }
    if (!W.leaveShared()) { location.reload(); return; }
    const add = $('zoneSearch');
    if (add) add.focus({ preventScroll: true });
  });

  // A link's converted time: the app's own converter fields, then one input event (applyConvert reads them).
  function applyTime(p) {
    const zoneSel = $('convZone'), date = $('convDate'), time = $('convTime');
    if (!zoneSel || !date || !time) return;
    const options = [...zoneSel.options].map((o) => o.value);
    const zone = p.z && options.includes(p.z) ? p.z : (p.zones.find((z) => options.includes(z)) || zoneSel.value);
    if (zone && zoneSel.value !== zone) { zoneSel.value = zone; zoneSel.dispatchEvent(new Event('change', { bubbles: true })); }
    date.value = p.t.ymd;
    delete date.dataset.auto; // a picked day, not "today"
    const s = W.settings();
    time.value = s.hour12 ? `${p.t.h % 12 || 12}:${pad2(p.t.mi)} ${p.t.h < 12 ? 'AM' : 'PM'}` : `${pad2(p.t.h)}:${pad2(p.t.mi)}`;
    time.dispatchEvent(new Event('input', { bubbles: true }));
  }
  W.whenBooted(() => {
    const p = W.parseShare(W.shareHash());
    if (p && p.t) applyTime(p);
  });
  // A new link pasted into the address bar: the home page's (the usual case) or this page's own.
  const onHash = (hash) => {
    const p = W.parseShare(hash);
    if (!p) return;
    if (p.zones.length) W.enterShared(p.zones);
    W.whenBooted(() => { if (p.t) applyTime(p); });
  };
  window.addEventListener('hashchange', () => onHash(location.hash));
  try { if (window.parent !== window) window.parent.addEventListener('hashchange', () => onHash(window.parent.location.hash)); } catch { /* not the home page */ }

  // ---------- the world map, after the first paint ----------
  // scripts/build-web.mjs puts the map (views/world-land.js, views/map.js, views/map.css) in app.later.js and
  // app.later.css, off the path to the first paint. They load once the page has loaded, at idle; a press on the map
  // button (or Ctrl+M) before then waits for them and presses it again. app.js reaches the map only through
  // window.WCMap, so it never knows the difference.
  let later = null, laterFailed = false;
  function loadLater() {
    if (later) return later;
    const load = (el) => new Promise((resolve) => { el.onload = () => resolve(true); el.onerror = () => resolve(false); });
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'app.later.css';
    const js = document.createElement('script');
    js.src = 'app.later.js';
    const done = Promise.all([load(css), load(js)]);
    // the map's styles keep their place in the cascade: before web.css, as in the Windows app's page
    const webCss = document.querySelector('link[href="web.css"]');
    if (webCss) webCss.before(css); else document.head.append(css);
    document.head.append(js);
    later = done.then(([a, b]) => {
      const ok = a && b && !!window.WCMap;
      if (!ok) { later = null; laterFailed = true; css.remove(); js.remove(); }
      return ok;
    });
    return later;
  }
  let mapAsked = false; // a press is waiting for the map: more presses meanwhile do not open and close it again
  document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('#btnMap') : null;
    if (!btn || (!mapAsked && (window.WCMap || laterFailed))) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (mapAsked) return;
    mapAsked = true;
    loadLater().then(() => { mapAsked = false; btn.click(); });
  }, true);
  {
    const idle = (fn) => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 300));
    const start = () => idle(() => { loadLater(); });
    if (document.readyState === 'complete') start(); else window.addEventListener('load', start, { once: true });
  }

  // ---------- touch reorder ----------
  // The app moves cards with a mouse drag (HTML drag and drop), Alt+Arrow keys and the card menu. Phones and tablets
  // get the drag too: touch and hold a card (HOLD_MS) until it lifts, then drag it; the other cards make room as it
  // passes. Letting go of a lifted card without moving opens its menu, as a long press did before. Pointer events,
  // touch and pen only (a mouse keeps the app's own drag). The drop goes through the app's own drop handler, so the
  // saved order, the move animation and the screen reader message ("Tokyo moved to position 2") are the app's.
  // Reduced motion: no lift, and the cards jump to their places instead of sliding. Escape cancels a drag.
  const strip = $('strip');
  const HOLD_MS = 380, SLOP = 10, EDGE = 44, MAX_SCROLL = 14;
  const NO_LIFT = '.arc, .more, input, button, select, textarea, a, [contenteditable]';
  const reducedMotion = () => (window.WCMotion ? window.WCMotion.reduced() : matchMedia('(prefers-reduced-motion: reduce)').matches);
  let press = null; // { id, card, x, y, timer }: a finger resting on a card, not lifted yet
  let drag = null; // a lifted card: see lift()
  let eatTouchEnd = false; // the touch that lifted a card ends without the click and mouse events a tap would send
  const px = (n) => `${Math.round(n * 10) / 10}px`;

  function cancelPress() { if (press) { clearTimeout(press.timer); press = null; } }
  function cardList() { return [...strip.querySelectorAll('.card[data-zone]')]; }
  function axisOf() {
    const app = $('app');
    if (app && app.classList.contains('layout-vertical')) return 'y';
    return strip.classList.contains('rows') ? 'xy' : 'x';
  }

  function lift() {
    const { id, card, x, y } = press;
    press = null;
    const cards = cardList();
    if (!card.isConnected || cards.length < 2 || document.querySelector('#strip input.rename')) return;
    const sr = strip.getBoundingClientRect();
    // every card's place in the strip's scrolled content, so auto scroll can move under the finger
    const slots = cards.map((c) => {
      const r = c.getBoundingClientRect();
      return { x: r.left - sr.left + strip.scrollLeft, y: r.top - sr.top + strip.scrollTop, w: r.width, h: r.height };
    });
    const from = cards.indexOf(card);
    drag = { id, card, cards, slots, from, to: from, zones: cards.map((c) => c.dataset.zone), x, y, x0: x, y0: y,
      sl0: strip.scrollLeft, st0: strip.scrollTop, axis: axisOf(), moved: false, raf: 0 };
    eatTouchEnd = true;
    document.documentElement.classList.add('web-reordering');
    card.classList.add('web-lifted');
  }

  function preview() {
    const order = drag.zones.filter((z) => z !== drag.card.dataset.zone);
    order.splice(drag.to, 0, drag.card.dataset.zone);
    drag.cards.forEach((c, i) => {
      if (c === drag.card) return;
      const a = drag.slots[i], b = drag.slots[order.indexOf(c.dataset.zone)];
      c.style.translate = a === b ? '' : `${px(b.x - a.x)} ${px(b.y - a.y)}`;
    });
  }

  function frame() {
    if (!drag) return;
    drag.raf = 0;
    const sr = strip.getBoundingClientRect();
    const { axis } = drag;
    // near an edge of a list that scrolls, scroll it (faster closer to the edge)
    const speed = (p, lo, hi) => (p < lo + EDGE ? -1 + (p - lo) / EDGE : p > hi - EDGE ? 1 - (hi - p) / EDGE : 0);
    let vx = axis === 'y' ? 0 : speed(drag.x, sr.left, sr.right);
    let vy = axis === 'x' ? 0 : speed(drag.y, sr.top, sr.bottom);
    vx = Math.round(Math.max(-1, Math.min(1, vx)) * MAX_SCROLL);
    vy = Math.round(Math.max(-1, Math.min(1, vy)) * MAX_SCROLL);
    const sl = strip.scrollLeft, st = strip.scrollTop;
    if (vx || vy) strip.scrollBy({ left: vx, top: vy, behavior: 'instant' });
    const scrolled = strip.scrollLeft !== sl || strip.scrollTop !== st;
    const dsl = strip.scrollLeft - drag.sl0, dst = strip.scrollTop - drag.st0;
    const dx = axis === 'y' ? 0 : drag.x - drag.x0 + dsl;
    const dy = axis === 'x' ? 0 : drag.y - drag.y0 + dst;
    drag.card.style.translate = `${px(dx)} ${px(dy)}`;
    // the slot nearest the finger (along the list's direction) is where the card goes
    const cx = drag.x - sr.left + strip.scrollLeft, cy = drag.y - sr.top + strip.scrollTop;
    let best = drag.to, bestD = Infinity;
    drag.slots.forEach((s, i) => {
      const ex = s.x + s.w / 2 - cx, ey = s.y + s.h / 2 - cy;
      const d = axis === 'x' ? Math.abs(ex) : axis === 'y' ? Math.abs(ey) : ex * ex + ey * ey;
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best !== drag.to) { drag.to = best; preview(); }
    if (scrolled) drag.raf = requestAnimationFrame(frame);
  }

  // Put every card back where it was (no move) or hand the move to the app.
  function finish(commit) {
    const d = drag;
    drag = null;
    cancelAnimationFrame(d.raf);
    const root = document.documentElement;
    const clear = () => { d.card.classList.remove('web-lifted'); for (const c of d.cards) c.style.translate = ''; };
    const same = d.card.isConnected && JSON.stringify(cardList().map((c) => c.dataset.zone)) === JSON.stringify(d.zones);
    if (!commit || !same || d.to === d.from) {
      // every card slides back (web-reordering keeps the slide for a moment; with reduced motion it is 0 ms)
      clear();
      setTimeout(() => { if (!drag) root.classList.remove('web-reordering'); }, reducedMotion() ? 0 : 400);
      // held and let go without moving: the card menu, where a long press opened it before
      if (commit && same && !d.moved) {
        d.card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: d.x, clientY: d.y }));
      }
      return;
    }
    // app.js records the cards' places when the order changes (for the move animation) while the cards are still
    // where the finger left them; the offsets go right after, so the cards slide from there to their new places.
    root.classList.remove('web-reordering');
    const onBefore = () => {
      for (const c of d.cards) c.style.transition = 'none';
      clear();
      requestAnimationFrame(() => { for (const c of d.cards) c.style.transition = ''; });
    };
    document.addEventListener('wc:zones-before', onBefore, { once: true });
    const target = d.cards[d.to];
    const before = d.to < d.from;
    if (!dropOn(d.card, target, before)) moveByKeys(d.card.dataset.zone, d.to - d.from);
    document.removeEventListener('wc:zones-before', onBefore);
    clear();
  }
  // The app's own drop handler: dragstart on the moved card, dragover and drop on the card it lands next to.
  function dropOn(card, target, before) {
    let dt;
    try { dt = new DataTransfer(); } catch { return false; }
    const fire = (el, type) => {
      const r = el.getBoundingClientRect();
      const x = before ? r.left + 1 : r.right - 1, y = before ? r.top + 1 : r.bottom - 1;
      let ev;
      try { ev = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y }); } catch { return false; }
      el.dispatchEvent(ev);
      return true;
    };
    const zone = card.dataset.zone;
    if (!fire(card, 'dragstart')) return false;
    if (!card.classList.contains('dragging')) return false; // the app did not take it
    fire(target, 'dragover');
    fire(target, 'drop');
    const again = strip.querySelector(`.card[data-zone="${CSS.escape(zone)}"]`) || card;
    fire(again, 'dragend');
    if (card !== again) card.classList.remove('dragging');
    return true;
  }
  // Fallback for browsers without DragEvent: the app's Alt+Arrow keys on the card, one step at a time.
  function moveByKeys(zone, steps) {
    const key = steps < 0 ? 'ArrowLeft' : 'ArrowRight';
    for (let i = 0; i < Math.abs(steps); i++) {
      const c = strip.querySelector(`.card[data-zone="${CSS.escape(zone)}"]`);
      if (!c) return;
      c.dispatchEvent(new KeyboardEvent('keydown', { key, altKey: true, bubbles: true, cancelable: true }));
    }
  }

  if (strip) {
    strip.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || !e.isPrimary || drag) return;
      cancelPress();
      eatTouchEnd = false;
      const card = e.target.closest('.card[data-zone]');
      if (!card || e.target.closest(NO_LIFT) || strip.querySelectorAll('.card[data-zone]').length < 2) return;
      press = { id: e.pointerId, card, x: e.clientX, y: e.clientY, timer: setTimeout(lift, HOLD_MS) };
    });
    document.addEventListener('pointermove', (e) => {
      if (press && e.pointerId === press.id) {
        if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > SLOP) cancelPress(); // a scroll or a swipe
        return;
      }
      if (!drag || e.pointerId !== drag.id) return;
      drag.x = e.clientX; drag.y = e.clientY;
      if (!drag.moved && Math.hypot(drag.x - drag.x0, drag.y - drag.y0) > SLOP) drag.moved = true;
      if (!drag.raf) drag.raf = requestAnimationFrame(frame);
    });
    const end = (e) => {
      if (press && e.pointerId === press.id) cancelPress();
      if (drag && e.pointerId === drag.id) finish(e.type === 'pointerup');
    };
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
    // While a card is lifted the finger drags it, not the list; a touch that lifted a card sends no click at the end.
    strip.addEventListener('touchmove', (e) => { if (drag && e.cancelable) e.preventDefault(); }, { passive: false });
    strip.addEventListener('touchend', (e) => { if (eatTouchEnd && e.cancelable) e.preventDefault(); eatTouchEnd = false; }, { passive: false });
    strip.addEventListener('scroll', () => { if (press) cancelPress(); }, { passive: true });
    // A long press would open the card menu (contextmenu) or start the browser's own drag: not while holding or dragging.
    const hold = (e) => { if (e.isTrusted && (press || drag)) { e.preventDefault(); e.stopPropagation(); } };
    document.addEventListener('contextmenu', hold, true);
    document.addEventListener('dragstart', hold, true);
    document.addEventListener('keydown', (e) => { if (drag && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } }, true);
    window.addEventListener('blur', () => { cancelPress(); if (drag) finish(false); });
  }

  // ---------- wheel: scrub only with intent ----------
  // The app scrubs the time (or scrolls the strip) with the wheel. In the home page's hero, a visitor scrolling the page
  // with the pointer parked in the frame's path would get stuck on it. So the wheel reaches the app only once the mouse
  // has moved inside the frame and the page has come to rest; until then it passes on and the page scrolls. A scrub in
  // progress keeps going (600 ms between notches). Same rule as the home page's old converter demo.
  {
    let armed = false, lastPageScroll = -1e9, lastUse = -1e9;
    window.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && (e.movementX || e.movementY)) armed = true; }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => { armed = false; });
    try { if (window.parent !== window) window.parent.addEventListener('scroll', () => { lastPageScroll = performance.now(); armed = false; }, { passive: true }); } catch { /* not the home page */ }
    window.addEventListener('wheel', (e) => {
      if (window.parent === window || e.ctrlKey) return;
      const now = performance.now();
      if (now - lastUse > 600 && (!armed || now - lastPageScroll < 350)) { e.stopImmediatePropagation(); return; } // the page scrolls
      lastUse = now;
    }, { capture: true, passive: true });
  }

  // ---------- the hero's frame fits the planner on phones ----------
  // The home page gives the frame a fixed height before anything loads (site.css --frame-h, so the page never moves).
  // On phones (the vertical layout) the planner's rows and hour scale end well before that and left the bottom of the
  // frame empty. While the planner is open there, the frame takes the planner's natural height (the body's
  // scrollHeight, so another city or a new head line grows it again), never more than --frame-h: the inline height
  // is min(var(--frame-h), Npx), resolved by the home page. Closing the planner or leaving the vertical layout gives
  // the frame its CSS height back. The change follows a press, so it is no layout shift against the page.
  {
    const app = $('app'), planner = $('planner'), body = $('planBody');
    let host = null;
    try { host = window.frameElement; } catch { /* not the home page */ }
    let queued = false;
    const fit = () => {
      queued = false;
      const on = app.classList.contains('planner-on') && app.classList.contains('layout-vertical') && !planner.hidden;
      let want = '';
      if (on) {
        const pad = parseFloat(getComputedStyle(planner).paddingBottom) || 0;
        want = `min(var(--frame-h), ${Math.ceil(body.getBoundingClientRect().top + body.scrollHeight + pad)}px)`;
      }
      if (host.style.height !== want) host.style.height = want;
    };
    const queue = () => { if (!queued) { queued = true; requestAnimationFrame(fit); } };
    if (host && app && planner && body && window.ResizeObserver) {
      const ro = new ResizeObserver(queue);
      const watch = () => { ro.disconnect(); ro.observe(body); for (const n of body.children) ro.observe(n); const head = planner.querySelector('.plan-head'); if (head) ro.observe(head); };
      watch();
      new MutationObserver(() => { watch(); queue(); }).observe(body, { childList: true });
      new MutationObserver(queue).observe(app, { attributes: true, attributeFilter: ['class'] });
      new MutationObserver(queue).observe(planner, { attributes: true, attributeFilter: ['hidden'] });
      window.addEventListener('resize', queue);
    }
  }

  // ---------- no more offline copy ----------
  // Earlier versions installed a service worker for /app/ (owc-app-* caches). The app now lives only in the home page's
  // hero, so any such worker is removed, with its caches, and the page is always the one on the server.
  if ('serviceWorker' in navigator && navigator.serviceWorker.getRegistrations) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const r of regs) if (/\/app\/$/.test(r.scope)) r.unregister();
    }, () => {});
    if (window.caches && caches.keys) caches.keys().then((keys) => keys.filter((k) => k.startsWith('owc-app-')).forEach((k) => caches.delete(k)), () => {});
  }
})();
