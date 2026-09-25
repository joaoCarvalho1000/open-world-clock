// motion: settings
(() => {
  const M = window.WCMotion;
  if (!M) return;
  let raf = 0;
  let anims = [];
  let clone = null;
  const cssVar = (n, f) => M.css(n, f);

  const cancelAll = () => {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    anims.forEach((a) => { try { a.cancel(); } catch (_) {} });
    anims = [];
  };
  const dropClone = () => { if (clone) { clone.remove(); clone = null; } };

  function open(panel) {
    cancelAll();
    dropClone();
    if (M.reduced()) return;
    const dur = M.ms('--dur-3');
    if (!dur) return;
    const ease = cssVar('--ease-emphasized', 'ease-out');
    const kids = Array.from(panel.children).filter((c) => !c.hidden);
    // Hide the first frame (painted while the window resizes), then animate on the next frame.
    panel.style.opacity = '0';
    raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        raf = 0;
        panel.style.opacity = '';
        panel.classList.add('wc-sheet-anim');
        anims.push(panel.animate(
          [{ opacity: 0, transform: 'translateY(12px) scale(.985)' }, { opacity: 1, transform: 'none' }],
          { duration: dur, easing: ease, fill: 'backwards' }));
        kids.forEach((k, i) => {
          anims.push(k.animate(
            [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
            { duration: dur, easing: ease, delay: 40 * (i + 1), fill: 'backwards' }));
        });
        const mine = anims.slice();
        Promise.all(mine.map((a) => a.finished)).catch(() => {}).then(() => {
          if (anims[0] === mine[0]) panel.classList.remove('wc-sheet-anim');
        });
      });
    });
  }

  function close(panel) {
    cancelAll();
    panel.style.opacity = '';
    panel.classList.remove('wc-sheet-anim');
    dropClone();
    if (M.reduced() || panel.hidden || !panel.parentNode) return;
    const dur = M.ms('--dur-2');
    if (!dur) return;
    const scroll = panel.scrollTop;
    const c = panel.cloneNode(true);
    c.removeAttribute('id');
    c.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    c.querySelectorAll('[for]').forEach((n) => n.removeAttribute('for'));
    c.removeAttribute('role');
    c.removeAttribute('aria-labelledby');
    c.setAttribute('aria-hidden', 'true');
    c.inert = true;
    c.classList.add('wc-sheet-clone');
    panel.parentNode.insertBefore(c, panel.nextSibling);
    c.scrollTop = scroll;
    clone = c;
    const a = c.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(6px) scale(.99)' }],
      { duration: dur, easing: cssVar('--ease-exit', 'ease-in'), fill: 'forwards' });
    const done = () => { if (clone === c) clone = null; c.remove(); };
    a.finished.then(done, done);
  }

  M.on('panel', (d) => {
    const panel = d.panel || document.getElementById('settingsPanel');
    if (!panel) return;
    if (d.open) open(panel); else close(panel);
  });
})();
