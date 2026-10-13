/* Dedicated tools use the shipped app, including its DST rules and saved-city controls.
   The parent keeps the searchable HTML; shared city/time values stay in the URL hash. */
(function () {
  'use strict';
  // Live cells in the page's own HTML (world time now): local time and the current UTC offset, from the browser's
  // IANA data. The served HTML keeps the offsets of the page's review date for crawlers and no-JS readers.
  var live = document.querySelectorAll('[data-live-zone]');
  if (live.length) {
    var tag = document.documentElement.lang || 'en';
    var tick = function () {
      var now = new Date();
      live.forEach(function (cell) {
        var zone = cell.dataset.liveZone;
        try {
          if (cell.dataset.live === 'time') {
            cell.textContent = new Intl.DateTimeFormat(tag, { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(now);
          } else {
            var name = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts(now)
              .filter(function (p) { return p.type === 'timeZoneName'; })[0].value;
            cell.textContent = name.replace('GMT', 'UTC');
          }
        } catch (e) { /* An unknown zone in an old browser keeps the served value. */ }
      });
      setTimeout(tick, 60000 - now.getSeconds() * 1000 - now.getMilliseconds() + 50);
    };
    tick();
  }
  // On a phone the tool switcher is one scrolling row: keep the current tool in view.
  var current = document.querySelector('.tool-nav [aria-current]');
  if (current && current.offsetLeft + current.offsetWidth > current.parentNode.clientWidth) {
    current.parentNode.scrollLeft = current.offsetLeft - 16;
  }
  var frame = document.getElementById('heroApp');
  if (!frame || !frame.dataset.tool) return;
  var shell = frame.closest('.tool-window');
  var status = document.getElementById('toolStatus');
  var retry = document.getElementById('toolRetry');
  var share = document.getElementById('heroShare');
  var lang = document.documentElement.lang.slice(0, 2);
  var words = {
    en: ['Loading your clocks…', 'The clocks couldn’t load. Try again.', 'Share clocks', 'Link copied', 'Copying was blocked. Copy this link', 'Live clocks', 'Share meeting', 'Share time', 'Share cities'],
    pt: ['Carregando os relógios…', 'Não foi possível carregar. Tente novamente.', 'Compartilhar', 'Link copiado', 'A cópia foi bloqueada. Copie este link', 'Relógios ao vivo', 'Compartilhar reunião', 'Compartilhar horário', 'Compartilhar cidades'],
    es: ['Cargando los relojes…', 'No se pudieron cargar. Inténtalo de nuevo.', 'Compartir', 'Enlace copiado', 'Se bloqueó la copia. Copia este enlace', 'Relojes en vivo', 'Compartir reunión', 'Compartir hora', 'Compartir ciudades']
  }[lang] || ['Loading your clocks…', 'The clocks couldn’t load. Try again.', 'Share clocks', 'Link copied', 'Copying was blocked. Copy this link', 'Live clocks', 'Share meeting', 'Share time', 'Share cities'];
  // The Share label says what a press shares (the app's WCShareKind): the selected meeting, the converted time or the cities.
  function shareLabel() {
    var k = ''; try { k = frame.contentWindow.WCShareKind ? frame.contentWindow.WCShareKind() : ''; } catch (e) { k = ''; }
    return k === 'meeting' ? words[6] : k === 'time' ? words[7] : k === 'cities' ? words[8] : words[2];
  }
  function syncShare() { if (!messageTimer) share.textContent = shareLabel(); }
  var timer, messageTimer, generation = 0;
  function fail() {
    shell.classList.remove('is-loading');
    shell.classList.add('has-error');
    status.textContent = words[1];
    retry.hidden = false;
    share.disabled = true;
  }
  function start() {
    generation++;
    clearTimeout(timer);
    shell.classList.add('is-loading');
    shell.classList.remove('has-error', 'is-ready');
    status.textContent = words[0];
    retry.hidden = true;
    share.disabled = true;
    var raw = location.hash.slice(1);
    // A meeting link (version 2: v, s or e) goes to the app exactly as it came, so a bad one stays bad there (no repeated
    // key collapsed, no oversized value dropped into a plausible cities-only link). The app reads the same hash here too.
    if (/(^|&)(v|s|e)=/.test(raw)) {
      frame.src = '/app/#' + raw + (/(^|&)lang=/.test(raw) ? '' : '&lang=' + lang);
      timer = setTimeout(fail, 20000);
      return;
    }
    var params = new URLSearchParams(raw);
    var hash = new URLSearchParams();
    ['c', 't', 'z'].forEach(function (key) {
      var value = params.get(key);
      if (value && value.length < 3500) hash.set(key, value);
    });
    if (!hash.has('c') && frame.dataset.cities) hash.set('c', frame.dataset.cities);
    hash.set('lang', lang);
    // buildShare/parseShare use literal IANA names, not URLSearchParams' encoded slash.
    frame.src = '/app/#' + hash.toString().replace(/%2F/gi, '/').replace(/%2C/gi, ',').replace(/%3A/gi, ':');
    timer = setTimeout(fail, 20000);
  }
  frame.addEventListener('load', function () {
    var run = generation;
    try {
      var w = frame.contentWindow;
      if (!w.WCWeb || !w.WCShareHash) { fail(); return; }
      w.WCWeb.whenBooted(function () {
        if (run !== generation) return;
        var tool = frame.dataset.tool;
        var id = tool === 'planner' ? 'btnPlanner' : tool === 'map' ? 'btnMap' : '';
        var button = id && w.document.getElementById(id);
        if (button && button.getAttribute('aria-pressed') !== 'true') button.click();
        // Converting from the first city suits a pair or UTC; "world time now" keeps the visitor's own zone.
        if (!location.hash && frame.dataset.cities && tool !== 'now') {
          var source = w.document.getElementById('convZone');
          source.value = frame.dataset.cities.split(',')[0];
          source.dispatchEvent(new w.Event('change', { bubbles: true }));
        }
        clearTimeout(timer);
        shell.classList.remove('is-loading', 'has-error');
        shell.classList.add('is-ready');
        status.textContent = words[5];
        retry.hidden = true;
        share.disabled = false;
      });
    } catch (e) { fail(); }
  });
  // A preset link further down the page (#c=...) opens in the app (web.js follows the hash): bring the tool into view.
  window.addEventListener('hashchange', function () {
    if (/(^#|&)c=/.test(location.hash)) shell.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  });
  retry.addEventListener('click', function () { frame.removeAttribute('src'); start(); });
  document.querySelectorAll('.tool-nav a').forEach(function (link) {
    link.addEventListener('click', function () {
      try {
        var hash = frame.contentWindow.WCShareHash();
        if (hash) link.hash = hash;
      } catch (e) { /* The plain HTML link still works before the app loads. */ }
    });
  });
  share.addEventListener('click', async function () {
    try {
      var hash = frame.contentWindow.WCShareHash();
      if (!hash) {
        // the time field holds an error: show it for a moment instead of sharing the cities without the time
        var why = frame.contentWindow.WCShareBlocked ? frame.contentWindow.WCShareBlocked() : '';
        if (why) {
          share.textContent = why;
          clearTimeout(messageTimer);
          messageTimer = setTimeout(function () { messageTimer = 0; share.textContent = shareLabel(); }, 2400);
        }
        return;
      }
      var url = location.origin + location.pathname + '#' + hash;
      try {
        await navigator.clipboard.writeText(url);
        share.textContent = words[3];
        clearTimeout(messageTimer);
        messageTimer = setTimeout(function () { messageTimer = 0; share.textContent = shareLabel(); }, 2400);
      } catch (e) {
        var field = document.getElementById('toolShareLink');
        field.hidden = false;
        field.value = url;
        field.setAttribute('aria-label', words[4]);
        field.focus(); field.select();
      }
    } catch (e) { fail(); }
  });
  // Paint the heading before loading the app, with a stable, reserved frame.
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
})();
