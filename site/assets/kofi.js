/* Ko-fi support button. Privacy and speed first: nothing from Ko-fi loads with the page.
   - Our own button (#kofiFab, styled like Ko-fi's) fades in after the load event, at idle, and only once the hero has
     scrolled out of its corner, so it never competes with the hero for LCP; it is position: fixed, so it never moves
     anything (CLS 0).
   - Only a click loads Ko-fi's overlay script, draws its widget and opens its panel. Our button then opens and closes
     that panel; Ko-fi's own floating button stays hidden (site.css), and its panel sits just above ours.
   - If the script fails, is blocked, or the panel is not ready within 3 s, ko-fi.com opens in a new tab instead, and
     from then on the button is a plain link. Modified clicks (new tab, new window) are always a plain link.
   - The CSP in site/_headers allows exactly what the overlay needs after the click: the script
     (storage.ko-fi.com/cdn/scripts/overlay-widget.js), its two stylesheets (storage.ko-fi.com/cdn/scripts/) and
     the panel frame (ko-fi.com). The config below turns off its button image and its Google Fonts, so neither is
     requested.
   - The Support button in the nav (.nav-kofi, data-kofi="nav", on every page from 760px wide) works the same way: its
     click loads the overlay and opens the panel, which then hangs under the nav at the right (html.kofi-at-nav,
     site.css) instead of above the floating button. From 760px the floating button is hidden (site.css), so the nav
     button is the one way in there; phones keep the floating button.
   - Analytics: analytics.js sends kofi_click {location} for every [data-kofi] click (nothing when analytics is off). */
(function () {
  'use strict';
  var PAGE = 'joaothecarvalho';
  var PAGE_URL = 'https://ko-fi.com/' + PAGE;
  var SRC = 'https://storage.ko-fi.com/cdn/scripts/overlay-widget.js';
  var TIMEOUT = 3000;
  var BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
  var fab = document.getElementById('kofiFab');
  var navBtns = [].slice.call(document.querySelectorAll('.nav-kofi'));
  var triggers = (fab ? [fab] : []).concat(navBtns);
  if (!triggers.length) return;
  var opener = triggers[0]; // the button that opened the panel last: busy state and focus return go to it

  if (fab) {
    // appear once the page has loaded and gone idle
    var show = function () { fab.classList.add('is-ready'); };
    var later = function () {
      if ('requestIdleCallback' in window) requestIdleCallback(show, { timeout: 2000 });
      else setTimeout(show, 800);
    };
    if (document.readyState === 'complete') later();
    else addEventListener('load', later, { once: true });

    // step aside while the hero (or a content page's header), the download section or the footer reaches the bottom of
    // the screen: the hero's headline and Store button sit in those corners, and the download section and footer have
    // their own Ko-fi link
    var spots = document.querySelectorAll('main > .hero, main > .pg-hero, #download, body > footer');
    if (spots.length && 'IntersectionObserver' in window) {
      var inView = [];
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { inView[[].indexOf.call(spots, en.target)] = en.isIntersecting; });
        fab.classList.toggle('is-tucked', inView.indexOf(true) >= 0);
      }, { rootMargin: '-85% 0px 0px 0px' }); // only the bottom 15% of the screen, where the button sits
      [].forEach.call(spots, function (el) { io.observe(el); });
    }

    // every page, below 1400px (where the button would sit over the text): it steps away (.is-away) once you have
    // scrolled down more than 8px, and comes back after you scroll up more than 24px or reach the end of the page. One
    // passive listener, at most one update per frame, and the scroll path reads only scrollY: the page height is cached
    // when the page or the window changes size. It never hides an open panel's button (site.css checks aria-expanded too).
    // Keyboard focus is unaffected: while away the button is visibility: hidden, so Tab skips it until it comes back.
    if (window.matchMedia) {
      var mqAway = matchMedia('(max-width: 1399px)');
      var lastY = scrollY, turnY = lastY, goingDown = true, bottomY = Infinity, awayRaf = 0;
      var away = function (on) { if (fab.classList.contains('is-away') !== on) fab.classList.toggle('is-away', on); };
      var measure = function () { bottomY = document.documentElement.scrollHeight - innerHeight; };
      var step = function () {
        awayRaf = 0;
        var y = scrollY;
        if (!mqAway.matches) { away(false); lastY = turnY = y; return; }
        if (y !== lastY && (y > lastY) !== goingDown) { goingDown = y > lastY; turnY = lastY; } // direction changed here
        lastY = y;
        if (y >= bottomY - 2) away(false);
        else if (goingDown && y - turnY > 8) { if (fab.getAttribute('aria-expanded') !== 'true') away(true); }
        else if (!goingDown && turnY - y > 24) away(false);
      };
      addEventListener('scroll', function () { if (!awayRaf) awayRaf = requestAnimationFrame(step); }, { passive: true });
      addEventListener('resize', measure, { passive: true });
      if ('ResizeObserver' in window) new ResizeObserver(measure).observe(document.body);
      else measure();
      var mqOff = function () { if (!mqAway.matches) away(false); };
      if (mqAway.addEventListener) mqAway.addEventListener('change', mqOff);
    }
  } // fab

  var state = 'idle', timer = 0, kofiBtn = null;
  var busy = function (on) { triggers.forEach(function (b) { if (on && b === opener) b.setAttribute('aria-busy', 'true'); else b.removeAttribute('aria-busy'); }); };

  function openTab() {
    var w = window.open(PAGE_URL, '_blank');
    if (w) { try { w.opener = null; } catch (e) { /* cross-origin already */ } }
    else location.href = PAGE_URL; // popup blocked: go there in this tab rather than do nothing
  }
  function fail() {
    if (state !== 'loading') return;
    state = 'failed';
    clearTimeout(timer);
    busy(false);
    openTab();
  }

  // Ko-fi draws a desktop and a phone variant and hides one with a device-width media query: use the one shown
  function shownButton() {
    var wraps = document.querySelectorAll('.floatingchat-container-wrap, .floatingchat-container-wrap-mobi');
    for (var i = 0; i < wraps.length; i++) {
      if (getComputedStyle(wraps[i]).display === 'none') continue;
      var f = wraps[i].querySelector('iframe'), d = f && f.contentDocument;
      var b = d && d.querySelector('.floatingchat-donate-button');
      if (b) return b;
    }
    return null;
  }
  // Ko-fi ignores a close for the first second after its panel opens (it blocks its own button for 1000 ms), so a close
  // asked for sooner (Escape, or a second click straight away) waits for that second to pass instead of being lost
  var openedAt = 0, closeTimer = 0;
  var isOpen = function () { return kofiBtn.classList.contains('open'); };
  function sync() {
    if (isOpen() && opener.getAttribute('aria-expanded') !== 'true') openedAt = Date.now();
    triggers.forEach(function (b) { b.setAttribute('aria-expanded', isOpen() ? 'true' : 'false'); });
  }
  function closePanel() {
    if (closeTimer || !isOpen()) return;
    var wait = openedAt + 1100 - Date.now();
    if (wait <= 0) { kofiBtn.click(); return; }
    closeTimer = setTimeout(function () { closeTimer = 0; if (isOpen()) kofiBtn.click(); }, wait);
  }
  function toggle() {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = 0; return; } // pressed again while a close waits: stay open
    if (isOpen()) closePanel(); else kofiBtn.click();
  }

  function whenReady() {
    // the panel's size and place come from Ko-fi's wrapper stylesheet, so wait for it before opening
    var link = document.querySelector('link[href$="floating-chat-wrapper.css"]');
    if (!link) { fail(); return; }
    link.addEventListener('error', fail);
    (function tick() {
      if (state !== 'loading') return;
      var b = link.sheet && shownButton();
      if (!b) { setTimeout(tick, 50); return; }
      clearTimeout(timer);
      state = 'ready';
      busy(false);
      kofiBtn = b;
      new MutationObserver(sync).observe(b, { attributes: true, attributeFilter: ['class'] });
      toggle();
    })();
  }

  function load() {
    state = 'loading';
    busy(true);
    timer = setTimeout(fail, TIMEOUT);
    var s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.onerror = fail;
    s.onload = function () {
      if (state !== 'loading') return;
      try {
        window.kofiWidgetOverlay.draw(PAGE, {
          'type': 'floating-chat',
          'floating-chat.donateButton.text': 'Support me',
          'floating-chat.donateButton.background-color': '#00b9fe',
          'floating-chat.donateButton.text-color': '#fff',
          'floating-chat.donatebutton.image': BLANK, // hidden anyway; saves a request
          'floating-chat.stylesheets': '[]'           // no Google Fonts
        });
      } catch (e) { fail(); return; }
      whenReady();
    };
    document.head.appendChild(s);
  }

  triggers.forEach(function (b) {
    b.addEventListener('click', function (e) {
      if (state === 'failed' || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // plain link
      e.preventDefault();
      // the panel opens next to the button that asked for it: under the nav, or above the floating button
      if (state !== 'ready' || !isOpen()) { opener = b; document.documentElement.classList.toggle('kofi-at-nav', b !== fab); }
      if (state === 'idle') load();
      else if (state === 'ready') toggle();
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || state !== 'ready' || opener.getAttribute('aria-expanded') !== 'true') return;
    closePanel();
    opener.focus();
  });
})();
