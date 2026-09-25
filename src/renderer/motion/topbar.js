// motion: topbar + converter
(() => {
  const M = window.WCMotion;
  const $ = (id) => document.getElementById(id);
  const dur = (v) => (M.reduced() ? 0 : M.ms(v));
  const EMPH = 'cubic-bezier(.32, .72, 0, 1)';
  const STD = 'cubic-bezier(.2, .8, .2, 1)';

  function hintFade() {
    const h = $('convHint');
    if (!h || M.reduced()) return;
    h.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: dur('--dur-2'), easing: STD });
  }

  M.on('convert', ({ on }) => {
    hintFade();
    if (!on || M.reduced()) return;
    ['convClear', 'btnCopy'].forEach((id, i) => {
      const b = $(id);
      if (!b || b.hidden || b.dataset.wcShown === '1') return;
      b.dataset.wcShown = '1';
      b.animate([{ opacity: 0, transform: 'translateX(-6px)' }, { opacity: 1, transform: 'none' }],
        { duration: dur('--dur-2'), easing: EMPH, delay: i * 40, fill: 'backwards' });
    });
  });
  // Reset the "already shown" marker once app.js hides them again.
  M.on('convert', ({ on }) => { if (!on) ['convClear', 'btnCopy'].forEach((id) => { const b = $(id); if (b) delete b.dataset.wcShown; }); });

  M.on('invalid', ({ input }) => {
    hintFade();
    const el = input || $('convTime');
    if (!el || M.reduced()) return;
    el.animate([
      { transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' },
      { transform: 'translateX(-3px)' }, { transform: 'translateX(2px)' }, { transform: 'translateX(0)' },
    ], { duration: 320, easing: 'ease-out' });
  });

  M.on('pin', ({ button }) => {
    const b = button || $('btnPin');
    const svg = b && b.querySelector('svg');
    if (!svg || M.reduced()) return;
    // Compose with the CSS resting rotation by animating the button's icon wrapper-free: use the individual `rotate`/`scale` props.
    svg.animate([{ rotate: '-20deg', scale: '.85' }, { rotate: '0deg', scale: '1' }],
      { duration: dur('--dur-3'), easing: 'cubic-bezier(.34, 1.56, .64, 1)' });
  });

  let copyTimer = null;
  M.on('copied', () => {
    hintFade();
    const b = $('btnCopy');
    if (!b || b.hidden) return;
    let check = b.querySelector('.wc-copy-check');
    if (!check) {
      const NS = 'http://www.w3.org/2000/svg';
      check = document.createElementNS(NS, 'svg');
      check.setAttribute('class', 'wc-copy-check');
      check.setAttribute('viewBox', '0 0 16 16');
      check.setAttribute('width', '16'); check.setAttribute('height', '16');
      check.setAttribute('aria-hidden', 'true'); check.setAttribute('focusable', 'false');
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', 'M3.5 8.5l3 3 6-7');
      p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor');
      p.setAttribute('stroke-width', '1.75'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
      check.appendChild(p);
      b.appendChild(check);
    }
    const icon = b.querySelector('svg:not(.wc-copy-check)');
    clearTimeout(copyTimer);
    b.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    const d = dur('--dur-2');
    const hold = 900;
    const total = d * 2 + hold;
    const inEnd = total ? d / total : 0, outStart = total ? (d + hold) / total : 1;
    check.animate([
      { opacity: 0, transform: 'scale(.6)', offset: 0 },
      { opacity: 1, transform: 'scale(1)', offset: inEnd, easing: 'linear' },
      { opacity: 1, transform: 'scale(1)', offset: outStart },
      { opacity: 0, transform: 'scale(.85)', offset: 1 },
    ], { duration: total, easing: EMPH });
    if (icon) icon.animate([
      { opacity: 1, transform: 'scale(1)', offset: 0 },
      { opacity: 0, transform: 'scale(.7)', offset: inEnd, easing: 'linear' },
      { opacity: 0, transform: 'scale(.7)', offset: outStart },
      { opacity: 1, transform: 'scale(1)', offset: 1 },
    ], { duration: total, easing: EMPH });
    // Remove the overlay afterwards so the button's children end as app.js left them.
    copyTimer = setTimeout(() => { if (check.isConnected) check.remove(); }, total + 50);
  });
})();
