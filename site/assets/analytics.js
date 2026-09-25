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
   installer_click {placement}, portable_click {placement}, converter_used {via}, faq_open {question},
   theme_toggle {theme}, kofi_click {location: floating, nav, footer or download} (any [data-kofi] element). Every event,
   $pageview included, carries page_lang (en, pt or es: the page's language, never the visitor's). */
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
  function placement(el) {
    var sec = el.closest('section, header, footer');
    if (!sec) return 'page';
    return sec.id || sec.classList[sec.classList.length - 1] || sec.tagName.toLowerCase();
  }
  var NEXT_THEME = { system: 'light', light: 'dark', dark: 'system' };
  document.addEventListener('click', function (e) {
    if (!e.isTrusted || !e.target.closest) return;
    var k = e.target.closest('[data-kofi]');
    if (k) { track('kofi_click', { location: k.getAttribute('data-kofi') }, true); return; }
    var t = e.target.closest('[data-track]');
    if (t) { track(t.getAttribute('data-track'), { placement: placement(t) }, t.tagName === 'A'); return; }
    if (e.target.closest('#themeBtn')) {
      var cur = document.documentElement.getAttribute('data-theme-pref') || 'system';
      track('theme_toggle', { theme: NEXT_THEME[cur] || 'system' });
    }
  }, true);

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
        var el = en.target, name = el.id || el.classList[el.classList.length - 1] || el.tagName.toLowerCase();
        io.unobserve(el);
        if (seen[name]) return;
        seen[name] = 1;
        track('section_view', { section: name });
      });
    }, { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5] });
    document.querySelectorAll('main > section, body > footer').forEach(function (el) { io.observe(el); });
  }
})();
