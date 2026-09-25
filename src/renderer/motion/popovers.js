// motion: popovers (search results #zoneResults + card menu #cardMenu)
(() => {
  const M = window.WCMotion;
  if (!M) return;
  const EMPH = 'cubic-bezier(.32, .72, 0, 1)';
  const EXIT = 'cubic-bezier(.4, 0, 1, 1)';
  const cssVar = (v, fb) => M.css(v, fb);

  M.on('results', ({ open, list }) => {
    if (!open || !list || M.reduced()) return;
    const d = M.ms('--dur-2');
    if (!d) return;
    const ease = cssVar('--ease-emphasized', EMPH);
    list.style.transformOrigin = 'top center';
    list.animate(
      [{ opacity: 0, transform: 'translateY(-4px) scale(.97)' }, { opacity: 1, transform: 'none' }],
      { duration: d, easing: ease }
    );
    Array.from(list.children).slice(0, 8).forEach((li, i) => {
      li.animate([{ opacity: 0 }, { opacity: 1 }],
        { duration: d, delay: 40 + i * 12, easing: ease, fill: 'backwards' });
    });
  });

  let ghost = null;
  M.on('menu', ({ open, menu, anchor }) => {
    if (!menu) return;
    if (ghost) { ghost.remove(); ghost = null; }
    if (M.reduced()) return;
    if (open) {
      const d = M.ms('--dur-2');
      if (!d) return;
      let origin = 'top right';
      if (anchor) {
        const a = anchor.getBoundingClientRect(), m = menu.getBoundingClientRect();
        const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
        const ox = Math.max(0, Math.min(m.width, ax - m.left));
        const oy = ay < m.top + m.height / 2 ? 0 : m.height;
        origin = `${ox}px ${oy}px`;
      } else {
        origin = 'top left'; // context menu: opens from pointer at its top-left
      }
      menu.style.transformOrigin = origin;
      menu.animate(
        [{ opacity: 0, transform: 'scale(.95)' }, { opacity: 1, transform: 'none' }],
        { duration: d, easing: cssVar('--ease-emphasized', EMPH) }
      );
      return;
    }
    // closing: menu is hidden synchronously right after this event, so exit on a clone
    if (menu.hidden) return;
    const d = M.ms('--dur-1');
    if (!d) return;
    const r = menu.getBoundingClientRect();
    const c = menu.cloneNode(true);
    c.removeAttribute('id');
    c.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    c.querySelectorAll('[data-act]').forEach((n) => n.removeAttribute('data-act'));
    c.removeAttribute('data-act');
    c.setAttribute('aria-hidden', 'true');
    c.removeAttribute('role');
    c.querySelectorAll('[role]').forEach((n) => n.removeAttribute('role'));
    c.querySelectorAll('button').forEach((b) => { b.tabIndex = -1; });
    c.classList.add('wc-menu-ghost');
    c.hidden = false;
    Object.assign(c.style, { left: r.left + 'px', top: r.top + 'px', margin: '0', transformOrigin: menu.style.transformOrigin || 'top right' });
    document.body.appendChild(c);
    ghost = c;
    const anim = c.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.96)' }],
      { duration: d, easing: cssVar('--ease-exit', EXIT), fill: 'forwards' }
    );
    const done = () => { c.remove(); if (ghost === c) ghost = null; };
    anim.onfinish = done; anim.oncancel = done;
    setTimeout(done, d + 200);
  });
})();
