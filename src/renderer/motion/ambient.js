// motion: ambient: tip chips entrance, tip dismiss (ghost + FLIP strip), map and planner entrance, layout crossfade.
(() => {
  const M = window.WCMotion;
  const $ = (id) => document.getElementById(id);
  const css = (v) => M.css(v);

  // Tip chips: fade + rise, staggered, trailing the cards.
  M.on('boot', () => {
    const tip = $('tip');
    if (!tip || tip.hidden || M.reduced()) return;
    const rise = css('--rise') || '8px';
    tip.querySelectorAll('.chip').forEach((chip, i) => {
      chip.animate(
        [{ opacity: 0, transform: `translateY(${rise})` }, { opacity: 1, transform: 'none' }],
        { duration: M.ms('--dur-3'), delay: 200 + i * 40, easing: css('--ease-emphasized'), fill: 'backwards' }
      );
    });
  });

  // Tip dismiss: ghost fades in place while the strip slides up into the freed space.
  M.on('tip-dismiss', ({ tip }) => {
    const strip = $('strip');
    if (!tip || !strip || M.reduced()) return;
    const r = tip.getBoundingClientRect();
    const oldTop = strip.getBoundingClientRect().top;
    const ghost = tip.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    ghost.hidden = false;
    ghost.setAttribute('aria-hidden', 'true');
    ghost.setAttribute('inert', '');
    ghost.classList.add('tip-ghost');
    Object.assign(ghost.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    document.body.appendChild(ghost);
    const kill = () => ghost.remove();
    const a = ghost.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.98)' }],
      { duration: M.ms('--dur-2'), easing: css('--ease-exit'), fill: 'forwards' }
    );
    a.onfinish = kill; a.oncancel = kill;
    setTimeout(kill, M.ms('--dur-2') + 400);
    requestAnimationFrame(() => {
      const dy = oldTop - strip.getBoundingClientRect().top;
      if (Math.abs(dy) < 0.5) return;
      strip.animate(
        [{ transform: `translateY(${dy}px)` }, { transform: 'none' }],
        { duration: M.ms('--dur-3'), easing: css('--ease-emphasized') }
      );
    });
  });

  // Map and planner open with the same short entrance as the other surfaces (fade and rise, no fill, so nothing stays
  // on the element); closing both brings the cards back the same way, unless the layout crossfade is already on them.
  const enter = (el) => {
    if (!el || el.hidden || M.reduced()) return;
    el.animate(
      [{ opacity: 0, transform: `translateY(${css('--rise') || '8px'})` }, { opacity: 1, transform: 'none' }],
      { duration: M.ms('--dur-3'), easing: css('--ease-emphasized') }
    );
  };
  const back = () => {
    const app = $('app'), strip = $('strip');
    if (!app || !strip || app.classList.contains('planner-on') || app.classList.contains('map-on') || strip.getAnimations().length) return;
    enter(strip);
  };
  M.on('planner', ({ on, planner }) => (on ? enter(planner) : back()));
  M.on('map', ({ on, map }) => (on ? enter(map) : back()));

  // Layout switch: quick fade out, then settle back in with a hint of scale.
  let fadeOut = null, fadeIn = null, safety = 0;
  M.on('layout', () => {
    const strip = $('strip');
    if (!strip || M.reduced()) return;
    if (fadeOut) fadeOut.cancel();
    if (fadeIn) fadeIn.cancel();
    clearTimeout(safety);
    const restore = () => { if (fadeOut) { fadeOut.cancel(); fadeOut = null; } };
    const cur = parseFloat(getComputedStyle(strip).opacity) || 1;
    fadeOut = strip.animate([{ opacity: cur }, { opacity: 0 }],
      { duration: M.ms('--dur-1'), easing: css('--ease-exit'), fill: 'forwards' });
    fadeOut.onfinish = () => requestAnimationFrame(() => {
      restore();
      fadeIn = strip.animate(
        [{ opacity: 0, transform: 'scale(.99)' }, { opacity: 1, transform: 'none' }],
        { duration: M.ms('--dur-3'), easing: css('--ease-emphasized') }
      );
    });
    // Guarantee: the strip is never left invisible.
    safety = setTimeout(restore, M.ms('--dur-1') + 400);
  });
})();
