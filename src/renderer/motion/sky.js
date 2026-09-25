// motion: sky: card gradients that follow the real sun altitude.
// Loads after sun.js and _shared.js, before app.js. Only adds the `sky-on` class and --sky-* custom
// properties; never touches classes, text, ids or hidden that app.js sets.
//
// Which moment a card shows:
//   1. card[data-epoch] (UTC epoch milliseconds) when present;
//   2. otherwise Date.now(), unless the card is `.converted` (converter active, instant unknown here),
//      in which case the phase comes from app.js's data-phase instead.
// Light versus dark stops always follow app.js's `.is-night` class, so text contrast matches the
// existing --day-fg / --night-fg colours even if the altitude estimate disagrees.
(function () {
  const M = window.WCMotion;
  const PHASES = ['night', 'twilight', 'dawn', 'day', 'golden', 'dusk'];
  const state = new WeakMap(); // card -> { phase, anim }
  let strip = null;
  let raf = 0;

  function coordsOf(zone) {
    const m = window.ZONE_META && window.ZONE_META[zone];
    if (m && typeof m.lat === 'number' && typeof m.lng === 'number') return [m.lat, m.lng];
    const c = window.ZONE_COORDS && window.ZONE_COORDS[zone];
    return Array.isArray(c) && c.length === 2 ? c : null;
  }

  function epochOf(card) {
    const raw = card.getAttribute('data-epoch');
    if (raw !== null && raw !== '') {
      const n = Number(raw);
      if (Number.isFinite(n)) return n;
    }
    return card.classList.contains('converted') ? null : Date.now();
  }

  // Fallback when the instant is unknown: map app.js's phase key onto the matching family.
  function phaseFromKey(key, night) {
    switch (key) {
      case 'night': return 'night';
      case 'dawn': return night ? 'twilight' : 'dawn';
      case 'dusk': return night ? 'dusk' : 'golden';
      case 'golden': return night ? 'dusk' : 'golden';
      default: return night ? 'night' : 'day';
    }
  }

  function phaseOf(card) {
    const night = card.classList.contains('is-night');
    const ll = coordsOf(card.dataset.zone);
    const epoch = epochOf(card);
    const S = window.WCSun;
    if (!ll || epoch === null || !S) return phaseFromKey(card.dataset.phase, night);
    const alt = S.altitude(new Date(epoch), ll[0], ll[1]);
    const rising = S.altitude(new Date(epoch + 600000), ll[0], ll[1]) > alt;
    if (night) {
      if (alt < -12) return 'night';
      if (alt < -4 || rising) return 'twilight';
      return 'dusk';
    }
    if (rising) return alt <= 6 ? 'dawn' : 'day';
    return alt <= 10 ? 'golden' : 'day';
  }

  const ref = (phase, stop) => `var(--sky-${phase}-${stop})`;

  function crossfade(card, st, from) {
    // Still fading from an earlier phase (scrubbing through dawn or dusk): apply() already swapped the gradient
    // variables, so that fade simply ends on the new phase instead of a second one starting on top of it.
    if (st.anim && st.anim.playState === 'running') return;
    if (st.anim) { try { st.anim.cancel(); } catch (e) { /* ignore */ } st.anim = null; }
    if (M.reduced() || typeof card.animate !== 'function') return;
    const dur = M.ms('--dur-4'); // cached token (motion/_shared.js)
    if (!dur) return;
    card.style.setProperty('--sky-pa', ref(from, 'a'));
    card.style.setProperty('--sky-pb', ref(from, 'b'));
    try {
      st.anim = card.animate({ opacity: [1, 0] }, { duration: dur, easing: 'cubic-bezier(.2, .8, .2, 1)', pseudoElement: '::after' });
      st.anim.onfinish = () => { st.anim = null; };
    } catch (e) { st.anim = null; } // pseudoElement unsupported: plain swap
  }

  function apply(card) {
    const phase = phaseOf(card);
    if (PHASES.indexOf(phase) < 0) return;
    let st = state.get(card);
    if (!st) { st = { phase: null, anim: null }; state.set(card, st); }
    if (st.phase === phase && card.classList.contains('sky-on')) return;
    const prev = st.phase;
    st.phase = phase;
    card.style.setProperty('--sky-a', ref(phase, 'a'));
    card.style.setProperty('--sky-b', ref(phase, 'b'));
    if (!card.classList.contains('sky-on')) card.classList.add('sky-on');
    else if (prev && prev !== phase) crossfade(card, st, prev);
  }

  function update() {
    raf = 0;
    const root = strip || document.querySelector('.strip') || document;
    for (const card of root.querySelectorAll('.card[data-zone]')) {
      try { apply(card); } catch (e) { console.warn('motion sky', e); }
    }
  }

  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(update);
  }

  // No timer of its own: app.js writes each card's data-epoch (now to the minute, or the converted instant) on every
  // render and toggles is-night / converted, and the observers below follow those. The minute tick and a return to the
  // window re-render the cards, so the sky keeps up without waking every minute (or second) here.
  // Two observers: cards added or removed (direct children of the strip only), and card attributes anywhere below it.
  // Neither sees the per-second text updates inside the cards, so no mutation records are queued on every tick.
  const cardsObserver = new MutationObserver(() => schedule());
  const attrObserver = new MutationObserver((list) => {
    for (const m of list) {
      const t = m.target;
      if (t.classList && t.classList.contains('card') && t.hasAttribute('data-zone')) {
        const st = state.get(t);
        if (!st || m.attributeName === 'data-epoch' || m.oldValue === null
          || m.oldValue.split(/\s+/).includes('is-night') !== t.classList.contains('is-night')
          || m.oldValue.split(/\s+/).includes('converted') !== t.classList.contains('converted')) { schedule(); return; }
      }
    }
  });

  function watch(el) {
    if (!el || el === strip) return;
    strip = el;
    cardsObserver.disconnect();
    attrObserver.disconnect();
    cardsObserver.observe(el, { childList: true });
    attrObserver.observe(el, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['class', 'data-epoch'] });
  }

  M.on('boot', (d) => { watch(d.strip || document.querySelector('.strip')); schedule(); });
  M.on('zones-after', schedule);
  M.on('convert', schedule);
  M.on('time-change', schedule);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(); });
  document.addEventListener('DOMContentLoaded', () => { watch(document.querySelector('.strip')); schedule(); });

  window.WCSky = { refresh: schedule, phaseOf };
})();
