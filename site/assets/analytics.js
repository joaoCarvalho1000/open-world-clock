/* Website analytics (the desktop and iPhone apps collect nothing). PostHog, set up to be anonymous and cheap:
   - Off unless assets/config.js has a real posthogKey and a posthogHost on this site's own origin (/ingest, proxied
     to PostHog by cloudflare/functions/ingest), so the browser never makes a third-party request.
   - Off entirely (nothing loads) under Do Not Track or Global Privacy Control, and on file://.
   - Off on every host but S.siteHost (openworldclock.com): localhost, 127.0.0.1, *.pages.dev previews and any other
     host load nothing, so local previews and test runs never send events to the production project.
   - cookieless_mode 'always' + memory persistence: no cookies, no localStorage or sessionStorage identifiers.
     PostHog counts visitors with a server-side hash whose salt rotates daily (enable "Cookieless server hash mode"
     in the PostHog project settings, or events are dropped).
   - No autocapture, session recording, surveys, heatmaps, flags or extra scripts. Only $pageview plus the events
     below, which never carry anything typed. URLs lose their query (except utm_*) and hash; referrers keep only
     their origin; $timezone is removed (the privacy page promises the demo's time zone never leaves the browser).
   - The SDK is requested only after the load event, at idle, so it can never delay the first paint or LCP.
   Events (keep site/README.md in sync): scroll_depth {depth}, section_view {section}, store_click {placement},
   installer_click {placement, version}, portable_click {placement, version}, converter_used {via}, faq_open {question},
   theme_toggle {theme}, kofi_click {location: floating, nav, footer or download} (any [data-kofi] element),
   language_switch {from, to, via: picker, menu, footer or suggestion}, github_click {placement, link: repo, issues,
   releases, license, profile or other}, hero_app_used {action} (the live app in the home page's hero, once per action
   per page; the list is HERO_ACTIONS below). Every event, $pageview included, carries page_lang (en, pt or es: the
   page's language, never the visitor's). */
(function () {
  'use strict';
  var S = window.SITE || {};
  var nav = navigator;
  if (!S.posthogKey || S.posthogKey === 'POSTHOG_KEY' || !S.posthogHost) return;
  if (location.hostname !== S.siteHost) return; // production only: never localhost, 127.0.0.1 or a preview host
  if (!/^https?:$/.test(location.protocol)) return;
  var dnt = [nav.doNotTrack, window.doNotTrack, nav.msDoNotTrack].some(function (v) { return v === '1' || v === 'yes'; });
  if (dnt || nav.globalPrivacyControl === true) return;
  var api;
  try { api = new URL(S.posthogHost, location.href); } catch (e) { return; }
  if (api.origin !== location.origin) return; // same origin only, by design
  var apiHost = api.origin + api.pathname.replace(/\/+$/, '');

  var PAGE_LANG = String(document.documentElement.getAttribute('lang') || 'en').slice(0, 2).toLowerCase();
  var ph = null, queue = [];
  function track(name, props, beacon) {
    if (ph) ph.capture(name, props || {}, beacon ? { transport: 'sendBeacon' } : undefined);
    else queue.push([name, props || {}, beacon]);
  }

  // ---- privacy filter, run on every event before it is sent
  var KEEP_QUERY = /^utm_(source|medium|campaign|term|content)$/;
  function trimUrl(v) {
    try {
      var u = new URL(v), q = new URLSearchParams();
      u.searchParams.forEach(function (val, k) { if (KEEP_QUERY.test(k)) q.append(k, val); });
      var qs = q.toString();
      return u.origin + u.pathname + (qs ? '?' + qs : '');
    } catch (e) { return v; }
  }
  function originOnly(v) { try { return new URL(v).origin; } catch (e) { return v; } }
  function clean(obj) {
    if (!obj || typeof obj !== 'object') return;
    Object.keys(obj).forEach(function (k) {
      var v = obj[k];
      if (/timezone/i.test(k)) delete obj[k];
      else if (typeof v !== 'string' || v === '$direct') return;
      else if (/referrer$/i.test(k)) obj[k] = originOnly(v);
      else if (/(current_url|_url)$/i.test(k) && /^https?:/.test(v)) obj[k] = trimUrl(v);
    });
  }
  function beforeSend(ev) {
    if (!ev) return ev;
    clean(ev.properties);
    if (ev.properties) { clean(ev.properties.$set); clean(ev.properties.$set_once); }
    clean(ev.$set); clean(ev.$set_once);
    return ev;
  }

  var config = {
    api_host: apiHost,
    ui_host: S.posthogUi || 'https://us.posthog.com',
    defaults: '2026-05-30',
    cookieless_mode: 'always',
    persistence: 'memory',
    person_profiles: 'never',
    respect_dnt: true,
    capture_pageview: true, // one per page load; in-page #anchors are not pageviews
    capture_pageleave: false,
    autocapture: false,
    rageclick: false,
    capture_dead_clicks: false,
    capture_heatmaps: false,
    capture_performance: false,
    capture_exceptions: false,
    mask_all_text: true,
    mask_all_element_attributes: true,
    disable_session_recording: true,
    disable_surveys: true,
    advanced_disable_flags: true,
    disable_external_dependency_loading: true,
    before_send: beforeSend
  };

  function start() {
    if (ph) return;
    // the standard PostHog stub, trimmed to what we call: array.js replays _i (init) and the queued calls
    var stub = window.posthog = window.posthog || [];
    if (!stub.__SV) {
      stub._i = [[S.posthogKey, config, undefined]];
      stub.people = [];
      ['capture', 'register'].forEach(function (m) {
        stub[m] = function () { stub.push([m].concat(Array.prototype.slice.call(arguments))); };
      });
      stub.__SV = 1;
      // the page's language (en, pt or es, from <html lang>) on every event, $pageview included: a property of the page,
      // never of the visitor
      stub.register({ page_lang: PAGE_LANG });
    }
    ph = { capture: function (n, p, o) { (window.posthog.capture || function () {}).call(window.posthog, n, p, o); } };
    queue.forEach(function (e) { track(e[0], e[1], e[2]); });
    queue = [];
    var s = document.createElement('script');
    s.async = true;
    s.src = apiHost + '/static/array.js';
    document.head.appendChild(s);
  }
  function later() {
    if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 3000 });
    else setTimeout(start, 1200);
  }
  if (document.readyState === 'complete') later();
  else addEventListener('load', later, { once: true });

  // ---- events
  // a section's name: its id, else its first class other than the generic "section" (class="section compare" is
  // compare), else its tag. Never a later class: those are state that scripts add and remove (demo.js toggles sky-dark
  // on the hero with the time of day, the bar is "nav scrolled"), so the same button would get two names.
  function sectionName(sec) {
    if (sec.id) return sec.id;
    for (var i = 0; i < sec.classList.length; i++) if (sec.classList[i] !== 'section') return sec.classList[i];
    return sec.tagName.toLowerCase();
  }
  function placement(el) {
    var sec = el.closest('section, header, footer');
    return sec ? sectionName(sec) : 'page';
  }
  // the app version a download button fetches: read from its own file name (Open-World-Clock-1.3.0-setup.exe, which
  // config.js writes from SITE.version and the static HTML repeats), else SITE.version itself
  function versionOf(el) {
    var m = /Open-World-Clock-(\d+\.\d+\.\d+)-(?:setup|portable)\.exe/i.exec(el.getAttribute('href') || '');
    return m ? m[1] : String(S.version || '');
  }
  var LANGS = { en: 1, pt: 1, es: 1 };
  function langVia(el) {
    if (el.closest('.lang-menu')) return 'picker';   // the globe in the nav
    if (el.closest('.nav-menu')) return 'menu';      // the Menu's language links (narrow screens)
    if (el.closest('.lang-hint')) return 'suggestion'; // "Ver em português" on the English home page (i18n.js)
    if (el.closest('footer')) return 'footer';
    return placement(el);
  }
  // links to github.com (the repo, issues, releases, the license, the author): which kind, never the full address
  var GITHUB = /^https:\/\/(www\.)?github\.com(\/|$)/i;
  function githubLink(href) {
    var p = String(href).replace(GITHUB, '').split(/[?#]/)[0].split('/'); // [owner, repo, section, ...]
    if (!p[1]) return 'profile';
    if (!p[2]) return 'repo';
    if (p[2] === 'issues' || p[2] === 'releases') return p[2];
    if (/^license/i.test(p[p.length - 1])) return 'license';
    return 'other';
  }
  var NEXT_THEME = { system: 'light', light: 'dark', dark: 'system' };
  document.addEventListener('click', function (e) {
    if (!e.isTrusted || !e.target.closest) return;
    var k = e.target.closest('[data-kofi]');
    if (k) { track('kofi_click', { location: k.getAttribute('data-kofi') }, true); return; }
    var t = e.target.closest('[data-track]');
    if (t) {
      var name = t.getAttribute('data-track'), props = { placement: placement(t) };
      if (name === 'installer_click' || name === 'portable_click') props.version = versionOf(t);
      track(name, props, t.tagName === 'A');
      return;
    }
    // the language picker: the globe menu, the Menu's language links, the footer row and the home page's suggestion
    // (assets/i18n.js) are all plain a[data-lang] links; the page's own language (aria-current) is not a switch
    var l = e.target.closest('a[data-lang]');
    if (l) {
      var to = l.getAttribute('data-lang');
      if (LANGS[to] && to !== PAGE_LANG) track('language_switch', { from: PAGE_LANG, to: to, via: langVia(l) }, true);
      return;
    }
    var a = e.target.closest('a[href]');
    if (a && GITHUB.test(a.getAttribute('href'))) { track('github_click', { placement: placement(a), link: githubLink(a.getAttribute('href')) }, true); return; }
    if (e.target.closest('#heroShare')) { heroUse('share'); return; } // Share in the hero app window's bar (demo.js)
    if (e.target.closest('#themeBtn')) {
      // this listener runs in the capture phase, before theme.js's own click handler on the button changes
      // data-theme-pref (set on <html> by the inline <head> script and by theme.js), so it still holds the old choice
      var cur = document.documentElement.getAttribute('data-theme-pref') || 'system';
      track('theme_toggle', { theme: NEXT_THEME[cur] || 'system' });
    }
  }, true);

  // ---- the live app in the home page's hero (site/app/ in a same-origin frame, #heroApp): which of its parts a
  // visitor tries, as hero_app_used {action}, once per action per page. The app itself loads no analytics and knows
  // nothing of this: this page listens on the frame's document (same origin), so /app/ opened on its own (it goes to
  // / anyway) and every host but siteHost (the gate at the top) send nothing. Only trusted events count (isTrusted:
  // a real press, key, wheel or edit), so the app's startup, a shared link's cities and time, the idle Back to now
  // and any scripted .click() or dispatched event never do. Nothing typed or picked is sent: no city, time, name or
  // setting value, only the action's name from the fixed list below. The element ids are the app's DOM contract
  // (src/renderer/index.html and CONTRACT.md); a renamed id only stops its action from being counted.
  var HERO_ACTIONS = {
    add_city: 1,  // a city picked in the Add city search (a click on a result, or Enter with the results open)
    convert: 1,   // the converter: the time field, the slider, the date, the source city, Back to now, a digit on a card
    scrub: 1,     // the wheel on a card that left the app converting, a press on a card's day line, [ ] PgUp PgDn
    copy: 1,      // an item of the Copy menu (times, Discord, UTC, calendar) or the planner's Copy slot and .ics
    planner: 1,   // the planner button or Ctrl+P
    map: 1,       // the map button or Ctrl+M
    settings: 1,  // the settings button or Ctrl+Comma
    theme: 1,     // the Theme setting changed in the app's settings (the site's own button is theme_toggle)
    edit_city: 1, // a card's menu (its ... button, right click, Shift+F10), F2, Delete, Alt+Arrow or a card dragged
    help: 1,      // the help button
    share: 1      // Share in the app window's bar, on this page (copies a link to the clocks on screen)
  };
  var heroUsed = {};
  function heroUse(action) {
    if (!HERO_ACTIONS[action] || heroUsed[action]) return;
    heroUsed[action] = 1;
    track('hero_app_used', { action: action });
  }
  var heroFrame = document.querySelector('#heroApp'), hookedDoc = null;
  function hookHero() {
    var w, d;
    try {
      w = heroFrame.contentWindow; d = heroFrame.contentDocument;
      if (!d || !w || !/^\/app\//.test(w.location.pathname)) return; // about:blank before demo.js sets src
    } catch (e) { return; } // not same origin (never expected): leave it alone
    if (d === hookedDoc) return;
    hookedDoc = d;
    var byId = function (id) { return d.getElementById(id); };
    var CLICK = [['#zoneResults', 'add_city'], ['#btnDay', 'convert'], ['#dateChips', 'convert'], ['#convClear', 'convert'],
      ['#planCopy', 'copy'], ['#planIcs', 'copy'], ['#btnPlanner', 'planner'], ['#btnMap', 'map'], ['#btnSettings', 'settings'],
      ['.more', 'edit_city'], ['#btnHelp', 'help']];
    var FIELD = { convTime: 1, convSlider: 1, convDate: 1, convZone: 1 };
    var CTRL = { m: 'map', p: 'planner', ',': 'settings' };
    var CARD_KEY = { '[': 'scrub', ']': 'scrub', PageUp: 'scrub', PageDown: 'scrub', Enter: 'convert', F2: 'edit_city',
      Delete: 'edit_city', ContextMenu: 'edit_city' };
    var on = function (type, fn) {
      d.addEventListener(type, function (e) {
        if (!e.isTrusted || !e.target || !e.target.closest) return;
        try { fn(e, e.target); } catch (err) { /* never let counting break the app */ }
      }, { capture: true, passive: true });
    };
    on('click', function (e, el) {
      var g = el.closest('a[href]');
      if (g && GITHUB.test(g.getAttribute('href'))) { track('github_click', { placement: 'app', link: githubLink(g.getAttribute('href')) }, true); return; }
      if (el.closest('[role="menuitem"]') && el.closest('#copyMenu')) { heroUse('copy'); return; }
      for (var i = 0; i < CLICK.length; i++) if (el.closest(CLICK[i][0])) { heroUse(CLICK[i][1]); return; }
    });
    on('input', function (e, el) { if (FIELD[el.id]) heroUse('convert'); });
    on('change', function (e, el) { if (FIELD[el.id]) heroUse('convert'); else if (el.id === 'optTheme') heroUse('theme'); });
    on('keydown', function (e, el) {
      if (e.ctrlKey && !e.altKey && !e.metaKey && CTRL[String(e.key).toLowerCase()]) { heroUse(CTRL[String(e.key).toLowerCase()]); return; }
      if (el.id === 'zoneSearch' && e.key === 'Enter' && byId('zoneResults') && !byId('zoneResults').hidden) { heroUse('add_city'); return; }
      if (!el.classList || !el.classList.contains('card')) return; // the rest are a focused card's own keys (app.js onCardKey)
      if (/^[0-9]$/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) heroUse('convert');
      else if (e.altKey && /^Arrow/.test(e.key)) heroUse('edit_city');
      else if (e.shiftKey && e.key === 'F10') heroUse('edit_city');
      else if (CARD_KEY[e.key] && !e.altKey) heroUse(CARD_KEY[e.key]);
    });
    on('contextmenu', function (e, el) { if (el.closest('.card')) heroUse('edit_city'); });
    on('dragstart', function (e, el) { if (el.closest('.card')) heroUse('edit_city'); });
    on('pointerdown', function (e, el) { if (e.button === 0 && el.closest('.arc')) heroUse('scrub'); });
    // the wheel reaches this document only past web.js's intent gate (the mouse moved in the frame, the page at rest:
    // an unarmed wheel is stopped at the frame's window, before this listener), and it scrubs only when it lands on a
    // card and the strip has nothing to scroll to; so count it once the app shows a conversion right after, at a
    // time other than before (a wheel that only scrolled the strip changes neither the time field nor the date)
    on('wheel', function (e, el) {
      if (heroUsed.scrub || e.ctrlKey || e.shiftKey || !el.closest('.card') || el.closest('input')) return;
      var app = byId('app'), time = byId('convTime'), date = byId('convDate');
      if (!app || !time || !date) return;
      var was = app.classList.contains('converting') ? time.value + ' ' + date.value : null;
      setTimeout(function () {
        if (app.classList.contains('converting') && time.value + ' ' + date.value !== was) heroUse('scrub');
      }, 200); // the app applies a scrub on the next frame, or within 60 ms when frames stall
    });
  }
  if (heroFrame) {
    heroFrame.addEventListener('load', hookHero); // every load of the frame is a new document
    hookHero(); // in case it loaded before this script ran (demo.js sets its src only after this page's load event)
  }

  // the converter demo: once per page, and only on real intent (never the scripted autoplay, never the value typed)
  var wc = document.querySelector('.wc'), usedConverter = false;
  if (wc) {
    var VIA = { wcTime: 'type', wcSlider: 'slider', wcZone: 'city', wcCopy: 'copy', wcClear: 'back_to_now' };
    var onUse = function (e) {
      if (usedConverter || !e.isTrusted) return;
      var el = e.target.closest ? e.target.closest('[id]') : null;
      var via = el && VIA[el.id];
      if (!via && e.type === 'pointerdown' && e.pointerType === 'mouse') via = 'clocks';
      if (!via) return;
      usedConverter = true;
      track('converter_used', { via: via });
    };
    ['input', 'change', 'click', 'pointerdown'].forEach(function (ev) { wc.addEventListener(ev, onUse, { capture: true, passive: true }); });
  }

  // FAQ: <details> toggle does not bubble, but it does pass through the capture phase
  document.addEventListener('toggle', function (e) {
    var d = e.target;
    if (!d || d.tagName !== 'DETAILS' || !d.open || !d.closest('.faq-list')) return;
    var q = d.querySelector('summary');
    track('faq_open', { question: q ? q.textContent.trim().slice(0, 80) : '' });
  }, true);

  // scroll depth milestones, once each; the page height is cached so a scroll never forces a layout
  var marks = [25, 50, 75, 100], docH = 0, ticking = false;
  var measure = function () { docH = document.documentElement.scrollHeight; };
  var check = function () {
    ticking = false;
    if (!docH) measure();
    var pct = (scrollY + innerHeight) / docH * 100;
    while (marks.length && pct >= marks[0] - 1) track('scroll_depth', { depth: marks.shift() });
    if (!marks.length) removeEventListener('scroll', onScroll);
  };
  var onScroll = function () { if (!ticking) { ticking = true; requestAnimationFrame(check); } };
  addEventListener('scroll', onScroll, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(document.body);
  else addEventListener('resize', measure, { passive: true });

  // section views: once each, when half the section is on screen or it fills half the screen (tall sticky scenes)
  if ('IntersectionObserver' in window) {
    var seen = {};
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var vh = en.rootBounds ? en.rootBounds.height : innerHeight;
        if (en.intersectionRatio < 0.5 && en.intersectionRect.height < vh * 0.5) return;
        var el = en.target, name = sectionName(el);
        io.unobserve(el);
        if (seen[name]) return;
        seen[name] = 1;
        track('section_view', { section: name });
      });
    }, { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5] });
    document.querySelectorAll('main > section, body > footer').forEach(function (el) { io.observe(el); });
  }
})();
