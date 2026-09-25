// motion: time
(() => {
  const M = window.WCMotion;
  const active = new WeakMap(); // card -> { finish }
  const fades = new WeakMap(); // .hm -> { anim, at }: the last crossfade and when that .hm last changed
  const FADE_GAP = 300; // ms: a .hm that changes again sooner than this shows plain digits (continuous scrubbing)

  function finishActive(card) {
    const a = active.get(card);
    if (a) a.finish();
  }

  // Converted times: a short dip that ends at the element's own opacity (asleep cards stay dimmed). One animation per
  // .hm at most, and none while it keeps changing (scrubbing), so the digits never blink.
  function crossfade(hm) {
    const now = performance.now();
    const prev = fades.get(hm);
    if (prev && prev.anim) { try { prev.anim.cancel(); } catch (_) {} }
    const recent = prev && now - prev.at < FADE_GAP;
    const rec = { anim: null, at: now };
    fades.set(hm, rec);
    if (recent) return;
    rec.anim = hm.animate([{ opacity: 0.4, offset: 0 }], { duration: M.ms('--dur-2'), easing: M.css('--ease-standard', 'ease') });
    rec.anim.onfinish = () => { if (rec.anim) rec.anim = null; };
  }

  // Reads for one digit roll (layout and computed style), taken for every card before any overlay is added.
  function measure(card, hm, from, to) {
    const host = hm.parentElement;
    if (!host) return null;
    const cs = getComputedStyle(hm);
    return {
      card, hm, host, from, to, left: hm.offsetLeft, top: hm.offsetTop,
      color: cs.color, fontSize: cs.fontSize, fontWeight: cs.fontWeight, letterSpacing: cs.letterSpacing, lineHeight: cs.lineHeight,
    };
  }

  function perDigit(m) {
    const { card, hm, host, from, to } = m;
    const dur = M.ms('--dur-3');
    const ease = M.css('--ease-emphasized', 'ease-out');

    const fx = document.createElement('span');
    fx.className = 'digit-fx';
    fx.setAttribute('aria-hidden', 'true');
    fx.style.left = m.left + 'px';
    fx.style.top = m.top + 'px';
    fx.style.color = m.color;
    fx.style.fontSize = m.fontSize;
    fx.style.fontWeight = m.fontWeight;
    fx.style.letterSpacing = m.letterSpacing;
    fx.style.lineHeight = m.lineHeight;

    // Only the digits that changed get their own boxes and animations (on a minute tick, usually just the last one);
    // each run of unchanged characters is one plain text node.
    const anims = [];
    let same = '';
    for (let i = 0; i < to.length; i++) {
      if (from[i] === to[i]) { same += to[i]; continue; }
      if (same) { fx.appendChild(document.createTextNode(same)); same = ''; }
      const c = document.createElement('span');
      c.className = 'dfx-c';
      const n = document.createElement('span');
      n.textContent = to[i];
      const o = document.createElement('span');
      o.className = 'dfx-old';
      o.textContent = from[i];
      c.append(n, o);
      fx.appendChild(c);
      anims.push(o.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-30%)', opacity: 0 }],
        { duration: dur, easing: ease, fill: 'forwards' }));
      anims.push(n.animate([{ transform: 'translateY(30%)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
        { duration: dur, easing: ease, fill: 'backwards' }));
    }
    if (!anims.length) return;
    if (same) fx.appendChild(document.createTextNode(same));

    host.appendChild(fx);
    hm.style.opacity = '0';
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      anims.forEach((a) => { try { a.cancel(); } catch (_) {} });
      fx.remove();
      hm.style.opacity = ''; // no opacity transition on .hm (topbar.css): the real digits are back at once, no fade up
      if (active.get(card) && active.get(card).finish === finish) active.delete(card);
    };
    active.set(card, { finish });
    Promise.all(anims.map((a) => a.finished)).then(finish, finish);
    setTimeout(finish, dur + 100); // safety net
  }

  // app.js sets the text synchronously and fires one time-change per card; the animations start in one microtask
  // (still before paint): first every read, then every write, so a minute tick or a scrub step costs one layout, not
  // one per card.
  let queue = [];
  function flush() {
    const items = queue;
    queue = [];
    const byCard = new Map(); // a card that changed twice in one task rolls from its first to its last time
    for (const d of items) {
      const prev = byCard.get(d.card);
      byCard.set(d.card, prev ? { ...d, from: prev.from } : d);
    }
    for (const card of byCard.keys()) finishActive(card);
    if (M.reduced()) return;
    const fadeList = [], rolls = [];
    for (const { card, from, to, converting } of byCard.values()) {
      const hm = card.querySelector('.hm');
      if (!hm) continue;
      if (converting || !from || !to || String(from).length !== String(to).length || !card.isConnected || !hm.offsetParent) { fadeList.push(hm); continue; }
      const m = measure(card, hm, String(from), String(to));
      if (m) rolls.push(m);
    }
    fadeList.forEach(crossfade);
    rolls.forEach(perDigit);
  }

  M.on('time-change', (d) => {
    if (!d.card) return;
    if (!queue.length) queueMicrotask(() => { try { flush(); } catch (err) { console.warn('motion time-change', err); } });
    queue.push(d);
  });

  // A card rebuilt or removed mid-animation: drop any orphaned overlays.
  M.on('zones-before', () => {
    document.querySelectorAll('.card').forEach(finishActive);
  });
})();
