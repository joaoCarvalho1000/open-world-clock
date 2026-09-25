// motion: cards
(() => {
  const M = window.WCMotion;
  if (!M) return;
  const strip = () => document.getElementById('strip');
  const cards = () => { const s = strip(); return s ? [...s.querySelectorAll('.card[data-zone]')] : []; };
  const ease = (name) => M.css(name, 'ease');

  // Boot stagger
  const s0 = strip();
  if (s0 && !M.reduced()) s0.classList.add('wc-cards-booting');
  M.on('boot', (d) => {
    const s = d.strip || strip();
    if (!s) return;
    const list = cards();
    s.classList.remove('wc-cards-booting');
    if (M.reduced()) return;
    const dur = M.ms('--dur-3'), st = M.ms('--stagger'), rise = M.ms('--rise'), e = ease('--ease-emphasized');
    list.forEach((c, i) => c.animate(
      [{ opacity: 0, transform: `translateY(${rise}px)` }, { opacity: 1, transform: 'none' }],
      { duration: dur, delay: i * st, easing: e, fill: 'backwards' }));
  });
  // Safety: never leave cards hidden if boot never fires.
  setTimeout(() => { const s = strip(); if (s) s.classList.remove('wc-cards-booting'); }, 1500);

  // FLIP on zone changes
  let rects = null, ghosts = [];
  M.on('zones-before', () => {
    rects = new Map();
    ghosts.forEach((g) => g.remove()); ghosts = [];
    for (const c of cards()) rects.set(c.dataset.zone, c.getBoundingClientRect());
  });
  // Clone leaving cards in zones-before (they're gone by zones-after).
  M.on('zones-before', (d) => {
    const to = new Set(d.to || []);
    for (const c of cards()) {
      const z = c.dataset.zone;
      if (to.has(z)) continue;
      const r = rects.get(z);
      const g = c.cloneNode(true);
      for (const n of [g, ...g.querySelectorAll('*')]) { n.removeAttribute('data-zone'); n.removeAttribute('id'); }
      g.classList.remove('dragging', 'drop-before', 'drop-after');
      g.classList.add('card-ghost');
      g.setAttribute('aria-hidden', 'true');
      g.removeAttribute('tabindex'); g.removeAttribute('draggable');
      Object.assign(g.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px',
        height: r.height + 'px', minWidth: '0', maxWidth: 'none', pointerEvents: 'none', transformOrigin: 'center' });
      (c.closest('.app') || document.body).appendChild(g);
      ghosts.push(g);
    }
  });
  M.on('zones-after', (d) => {
    const before = rects || new Map(); rects = null;
    const from = new Set(d.from || []);
    const reduced = M.reduced();
    const dur3 = M.ms('--dur-3'), dur2 = M.ms('--dur-2');
    const eEmph = ease('--ease-emphasized'), eExit = ease('--ease-exit');
    // Leaving ghosts
    const gs = ghosts; ghosts = [];
    for (const g of gs) {
      if (reduced || !dur2) { g.remove(); continue; }
      const a = g.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.94)' }],
        { duration: dur2, easing: eExit, fill: 'forwards' });
      a.onfinish = a.oncancel = () => g.remove();
      setTimeout(() => g.remove(), dur2 + 200);
    }
    if (reduced) {
      const added = cards().find((c) => !from.has(c.dataset.zone));
      if (added && from.size) reveal(added, true);
      return;
    }
    for (const c of cards()) {
      const z = c.dataset.zone, r0 = before.get(z);
      if (r0) {
        const r1 = c.getBoundingClientRect();
        const dx = r0.left - r1.left, dy = r0.top - r1.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
        c.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
          { duration: dur3, easing: eEmph });
      } else if (!from.has(z) && from.size) {

        const a = c.animate([{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }],
          { duration: dur3, easing: eEmph, fill: 'backwards' });
        a.onfinish = () => reveal(c, false);
      }
    }
  });

  function reveal(card, instant) {
    const s = strip();
    if (!s || !card.isConnected) return;
    const sr = s.getBoundingClientRect(), cr = card.getBoundingClientRect();
    const vertical = s.scrollHeight > s.clientHeight + 1 && s.scrollWidth <= s.clientWidth + 1;
    const behavior = instant || M.reduced() ? 'auto' : 'smooth';
    const pad = 16;
    if (vertical) {
      let dy = 0;
      if (cr.bottom > sr.bottom - pad) dy = cr.bottom - sr.bottom + pad;
      else if (cr.top < sr.top + pad) dy = cr.top - sr.top - pad;
      if (dy) s.scrollTo({ top: s.scrollTop + dy, behavior });
    } else {
      let dx = 0;
      if (cr.right > sr.right - pad) dx = cr.right - sr.right + pad;
      else if (cr.left < sr.left + pad) dx = cr.left - sr.left - pad;
      if (dx) s.scrollTo({ left: s.scrollLeft + dx, behavior });
    }
  }
})();
