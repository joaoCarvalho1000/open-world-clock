/* Theme toggle: system -> light -> dark. The choice is stored in localStorage (wc-theme; the language picker in
   assets/i18n.js stores wc-lang, and nothing else is stored). Its words come from assets/i18n.js, in the page's language.
   Dispatches "wc:theme" on document whenever the effective theme may have changed.
   Colours switch in one frame (no transitions), so text and its background never pass through a low-contrast mix.
   Where the View Transitions API exists (and motion is welcome), the new theme opens as a circle from the button:
   both themes are snapshots, so every pixel is always fully one theme or the other.
   Also here, as small page helpers every page loads: the ways out of the Menu and the language picker, the Copy buttons ([data-copy]), the phones
   only Share the link button, and the right-edge fade on tables and commands that scroll sideways. */
(function () {
  'use strict';
  var root = document.documentElement;
  var KEY = 'wc-theme';
  var NEXT = { system: 'light', light: 'dark', dark: 'system' };
  var I18N = window.SITE_I18N, T = I18N ? I18N.t : function (k) { return k; };
  var LABEL = { system: T('theme.system'), light: T('theme.light'), dark: T('theme.dark') }; // in the page's language (assets/i18n.js)
  var btn = document.getElementById('themeBtn');
  var mqDark = matchMedia('(prefers-color-scheme: dark)');
  var mqReduced = matchMedia('(prefers-reduced-motion: reduce)');
  var fire = function () {
    root.classList.add('theme-switch');
    document.dispatchEvent(new CustomEvent('wc:theme'));
    requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.remove('theme-switch'); }); });
  };
  function effective() { var t = root.getAttribute('data-theme'); return t || (mqDark.matches ? 'dark' : 'light'); }
  function label() {
    if (!btn) return;
    var p = root.getAttribute('data-theme-pref') || 'system';
    btn.setAttribute('aria-label', T('theme.aria', { cur: LABEL[p], next: LABEL[NEXT[p]] }));
    btn.title = T('theme.title', { cur: LABEL[p] });
  }
  function apply(pref) {
    root.classList.add('theme-switch');
    root.setAttribute('data-theme-pref', pref);
    if (pref === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', pref);
    label(); fire();
  }
  function set(pref) {
    try { if (pref === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, pref); } catch (e) { /* storage blocked: still switch for this visit */ }
    var before = effective(), after = pref === 'system' ? (mqDark.matches ? 'dark' : 'light') : pref;
    if (before === after || !document.startViewTransition || mqReduced.matches || !btn) { apply(pref); return; }
    var r = btn.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    var rad = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    var vt = document.startViewTransition(function () { apply(pref); });
    vt.ready.then(function () {
      root.animate({ clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + rad + 'px at ' + x + 'px ' + y + 'px)'] },
        { duration: 720, easing: 'cubic-bezier(.65, 0, .35, 1)', pseudoElement: '::view-transition-new(root)' });
    }).catch(function () {});
  }
  if (btn) btn.addEventListener('click', function () { set(NEXT[root.getAttribute('data-theme-pref') || 'system']); });

  // Copy buttons ([data-copy], the winget command on /download) and Share the link (.share-link, phones only, shown by
  // the .not-windows class the inline <head> script sets). The clipboard is written only on a click; nothing is stored or sent, and there is no analytics event,
  // so the privacy page's list of measured controls stays true. #announce, where the page has one, tells screen readers.
  var say = function (msg) {
    var el = document.getElementById('announce');
    if (el) el.textContent = msg;
  };
  // the button's own words change for 1.5 s, then come back
  var flash = function (el, words) {
    var span = el.querySelector('span') || el;
    if (!el.hasAttribute('data-label')) el.setAttribute('data-label', span.textContent);
    span.textContent = words;
    clearTimeout(el._wcReset);
    el._wcReset = setTimeout(function () { span.textContent = el.getAttribute('data-label'); }, 1500);
  };
  function copyText(text, ok, fail) {
    var legacy = function () {
      var ta = document.createElement('textarea'), done = false;
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { done = document.execCommand('copy'); } catch (e) { done = false; }
      ta.remove();
      if (done) ok(); else fail();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, legacy);
    else legacy();
  }
  // comparison tables and commands that scroll sideways on phones: .at-end drops the fade on the right edge
  // (pages.css) once the end is in view, or when everything fits and there is nothing to scroll
  [].forEach.call(document.querySelectorAll('.tbl-wrap, .cmd code'), function (w) {
    if (w.classList.contains('tbl-wrap') && !w.querySelector('.tbl-compare')) return;
    var raf = 0;
    var check = function () { raf = 0; w.classList.toggle('at-end', w.scrollLeft + w.clientWidth >= w.scrollWidth - 2); };
    var soon = function () { if (!raf) raf = requestAnimationFrame(check); };
    w.addEventListener('scroll', soon, { passive: true });
    if ('ResizeObserver' in window) new ResizeObserver(soon).observe(w); else { addEventListener('resize', soon, { passive: true }); check(); }
  });

  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-copy], .share-link') : null;
    if (!t) return;
    if (t.hasAttribute('data-copy')) {
      copyText(t.getAttribute('data-copy'), function () { flash(t, T('copied')); say(T('say.copied')); }, function () {
        // no clipboard at all: select the command instead, ready for Ctrl+C
        var code = t.parentNode && t.parentNode.querySelector('code');
        if (!code || !window.getSelection) return;
        var r = document.createRange(); r.selectNodeContents(code);
        var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
      });
      return;
    }
    var url = 'https://openworldclock.com' + (I18N ? I18N.prefix : '/') + 'download'; // the download page in this page's language
    if (navigator.share) {
      navigator.share({ title: 'Open World Clock', url: url }).catch(function () { /* share sheet closed: nothing to do */ });
      return;
    }
    copyText(url, function () { flash(t, T('link.done')); say(T('link.done')); }, function () { say(T('link.manual', { url: url })); });
  });
  mqDark.addEventListener('change', fire);
  label();

  // The page Menu and the language picker (<details class="nav-menu"> and <details class="lang-menu"> in the bar) open
  // and close without script; this only adds the usual
  // ways out: Escape (focus goes back to the Menu button), a press anywhere outside it, and focus leaving it (Tab past
  // its last link). The outside press listens for pointerdown, not click: iOS Safari may send no click at all for a tap
  // on plain text, which left the panel open over the page.
  var menus = [].slice.call(document.querySelectorAll('.nav-menu, .lang-menu'));
  if (menus.length) {
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      menus.forEach(function (m) {
        if (!m.open) return;
        var inside = m.contains(document.activeElement);
        m.open = false;
        if (inside) m.querySelector('summary').focus();
      });
    });
    document.addEventListener('pointerdown', function (e) {
      menus.forEach(function (m) { if (m.open && !m.contains(e.target)) m.open = false; });
    }, { capture: true, passive: true });
    menus.forEach(function (m) {
      m.addEventListener('focusout', function (e) {
        var to = e.relatedTarget; // null when focus leaves the page or lands on nothing: leave the menu as it is
        if (m.open && to && !m.contains(to)) m.open = false;
      });
    });
  }
})();
