/* Dedicated tools use the shipped app, including its DST rules and saved-city controls.
   The parent keeps the searchable HTML; shared city/time values stay in the URL hash. */
(function () {
  'use strict';
  var frame = document.getElementById('heroApp');
  if (!frame || !frame.dataset.tool) return;
  var shell = frame.closest('.tool-window');
  var status = document.getElementById('toolStatus');
  var retry = document.getElementById('toolRetry');
  var share = document.getElementById('heroShare');
  var lang = document.documentElement.lang.slice(0, 2);
  var words = {
    en: ['Loading your clocks…', 'The clocks couldn’t load. Try again.', 'Share clocks', 'Link copied', 'Copy this link', 'Live clocks'],
    pt: ['Carregando os relógios…', 'Não foi possível carregar. Tente novamente.', 'Compartilhar', 'Link copiado', 'Copie este link', 'Relógios ao vivo'],
    es: ['Cargando los relojes…', 'No se pudieron cargar. Inténtalo de nuevo.', 'Compartir', 'Enlace copiado', 'Copia este enlace', 'Relojes en vivo']
  }[lang] || ['Loading your clocks…', 'The clocks couldn’t load. Try again.', 'Share clocks', 'Link copied', 'Copy this link', 'Live clocks'];
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
    var params = new URLSearchParams(location.hash.slice(1));
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
        var id = frame.dataset.tool === 'planner' ? 'btnPlanner' : frame.dataset.tool === 'map' ? 'btnMap' : '';
        var button = id && w.document.getElementById(id);
        if (button && button.getAttribute('aria-pressed') !== 'true') button.click();
        if (!location.hash && frame.dataset.cities) {
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
      if (!hash) return;
      var url = location.origin + location.pathname + '#' + hash;
      try {
        await navigator.clipboard.writeText(url);
        share.textContent = words[3];
        clearTimeout(messageTimer);
        messageTimer = setTimeout(function () { share.textContent = words[2]; }, 2400);
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
