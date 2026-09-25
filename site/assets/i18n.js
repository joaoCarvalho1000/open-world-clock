/* The website's languages: English (/), Brazilian Portuguese (/pt/) and Spanish (/es/), the same three as the app.
   - The page's language is its <html lang> (en, pt-BR or es-419). Every page is static HTML written in its language; this
     file only holds the words the scripts write at run time (demo.js, theme.js), in the app's own terms
     (src/renderer/i18n.js), and the city names that differ in Portuguese and Spanish (ZONE_I18N in
     src/renderer/zones.js, copied as it is; keep the two in step).
   - The language picker (nav, Menu and footer) is plain links to the same page in the other languages. A click on one
     remembers the choice in localStorage ('wc-lang': en, pt or es), the only other thing the site stores besides the
     theme. Nothing is ever redirected automatically.
   - On the English home page only: a visitor whose browser prefers Portuguese or Spanish (or who chose it before), and
     who has not chosen English, sees a small suggestion ("Ver em português" / "Ver en español") that can be closed.
     Closing it counts as choosing English, so it does not come back. It is position: fixed, so it moves nothing (CLS 0).
   Loaded on every page right after config.js, before the other scripts. Nothing here talks to the network. */
(function () {
  'use strict';
  var root = document.documentElement;
  var KEY = 'wc-lang';
  var lang = String(root.getAttribute('lang') || 'en').slice(0, 2).toLowerCase();
  if (lang !== 'pt' && lang !== 'es') lang = 'en';

  var STR = {
    en: {
      'phase.night': 'Night', 'phase.dawn': 'Dawn', 'phase.morning': 'Morning', 'phase.midday': 'Midday',
      'phase.afternoon': 'Afternoon', 'phase.golden': 'Golden', 'phase.dusk': 'Dusk',
      'day.plus1': '+1 day', 'day.plusN': '+{n} days', 'day.minus1': '−1 day', 'day.minusN': '−{n} days',
      'card.home': 'Home', 'rel.local': 'Local', 'card.asleep': 'likely asleep',
      'sun.up': 'sun up', 'sun.down': 'sun down',
      'sun.times': 'Sunrise {rise} · Sunset {set}', 'sun.noSet': 'Sun doesn’t set today', 'sun.noRise': 'Sun doesn’t rise today',
      'where.up': 'sun {n}° up', 'where.down': 'sun {n}° down',
      'share': 'Share', 'share.first': 'Add a city first', 'share.done': 'Link copied', 'share.fail': 'Could not copy the link',
      'hint.when': 'When it is {time} in {city}', 'hint.invalid': 'Type a time like 9, 9:30, 930 or 3pm',
      'copy.header': 'When it is {time} in {city}:', 'copied': 'Copied', 'say.copied': 'Copied to clipboard',
      'say.now': 'Showing the current time', 'local': '{city} (local)',
      'add.city': 'Add a city', 'add.full': 'Up to 8 cities here. The app has no limit.', 'say.added': '{city} added, {time}',
      'ruler.now': 'Now · {time}', 'map.aria': 'World map of daylight at {time} {city} time: {list}.', 'map.day': 'day', 'map.night': 'night',
      'plan.sum': '{n} h overlap · {start} to {end}', 'plan.none': 'No overlap', 'plan.title': 'Hours in {city} · Today',
      'plan.aria': 'Meeting planner demo for {cities}, working 09:00 to 18:00 local: {n} hours of overlap, {start} to {end} {city} time.',
      'plan.ariaNone': 'Meeting planner demo for {cities}, working 09:00 to 18:00 local: no overlap today.',
      'label.team': 'Design team',
      'theme.system': 'match Windows', 'theme.light': 'light', 'theme.dark': 'dark',
      'theme.aria': 'Theme: {cur}. Switch to {next}.', 'theme.title': 'Theme: {cur}',
      'link.done': 'Link copied', 'link.manual': 'Copy this link: {url}'
    },
    pt: {
      'phase.night': 'Noite', 'phase.dawn': 'Amanhecer', 'phase.morning': 'Manhã', 'phase.midday': 'Meio-dia',
      'phase.afternoon': 'Tarde', 'phase.golden': 'Fim de tarde', 'phase.dusk': 'Anoitecer',
      'day.plus1': '+1 dia', 'day.plusN': '+{n} dias', 'day.minus1': '−1 dia', 'day.minusN': '−{n} dias',
      'card.home': 'Aqui', 'rel.local': 'Local', 'card.asleep': 'provavelmente dormindo',
      'sun.up': 'sol acima do horizonte', 'sun.down': 'sol abaixo do horizonte',
      'sun.times': 'Nascer do sol {rise} · Pôr do sol {set}', 'sun.noSet': 'O sol não se põe hoje', 'sun.noRise': 'O sol não nasce hoje',
      'where.up': 'sol {n}° acima do horizonte', 'where.down': 'sol {n}° abaixo do horizonte',
      'share': 'Compartilhar', 'share.first': 'Adicione uma cidade antes', 'share.done': 'Link copiado', 'share.fail': 'Não foi possível copiar o link',
      'hint.when': 'Às {time} em {city}', 'hint.invalid': 'Digite um horário como 9, 9:30, 15h ou 15h30',
      'copy.header': 'Às {time} em {city}:', 'copied': 'Copiado', 'say.copied': 'Copiado para a área de transferência',
      'say.now': 'Mostrando o horário atual', 'local': '{city} (local)',
      'add.city': 'Adicionar uma cidade', 'add.full': 'Aqui cabem até 8 cidades. No app, quantas você quiser.', 'say.added': '{city} entrou na lista, {time}',
      'ruler.now': 'Agora · {time}', 'map.aria': 'Mapa-múndi com o dia e a noite às {time}, no horário de {city}: {list}.', 'map.day': 'dia', 'map.night': 'noite',
      'plan.sum': '{n} h em comum · {start} às {end}', 'plan.none': 'Sem horário em comum', 'plan.title': 'Horário de {city} · Hoje',
      'plan.aria': 'Demonstração do planejador de reuniões com {cities}, expediente das 09:00 às 18:00 no horário local: {n} horas em comum, das {start} às {end} no horário de {city}.',
      'plan.ariaNone': 'Demonstração do planejador de reuniões com {cities}, expediente das 09:00 às 18:00 no horário local: nenhum horário em comum hoje.',
      'label.team': 'Equipe de design',
      'theme.system': 'igual ao Windows', 'theme.light': 'claro', 'theme.dark': 'escuro',
      'theme.aria': 'Tema: {cur}. Mudar para {next}.', 'theme.title': 'Tema: {cur}',
      'link.done': 'Link copiado', 'link.manual': 'Copie este link: {url}'
    },
    es: {
      'phase.night': 'Noche', 'phase.dawn': 'Amanecer', 'phase.morning': 'Mañana', 'phase.midday': 'Mediodía',
      'phase.afternoon': 'Tarde', 'phase.golden': 'Atardecer', 'phase.dusk': 'Anochecer',
      'day.plus1': '+1 día', 'day.plusN': '+{n} días', 'day.minus1': '−1 día', 'day.minusN': '−{n} días',
      'card.home': 'Aquí', 'rel.local': 'Local', 'card.asleep': 'probablemente durmiendo',
      'sun.up': 'sol sobre el horizonte', 'sun.down': 'sol bajo el horizonte',
      'sun.times': 'Salida del sol {rise} · Puesta del sol {set}', 'sun.noSet': 'Hoy el sol no se pone', 'sun.noRise': 'Hoy el sol no sale',
      'where.up': 'sol a {n}° de altura', 'where.down': 'sol {n}° bajo el horizonte',
      'share': 'Compartir', 'share.first': 'Primero agrega una ciudad', 'share.done': 'Enlace copiado', 'share.fail': 'No se pudo copiar el enlace',
      'hint.when': 'A las {time} en {city}', 'hint.invalid': 'Escribe una hora como 9, 9:30, 930 o 3pm',
      'copy.header': 'A las {time} en {city}:', 'copied': 'Copiado', 'say.copied': 'Se copió al portapapeles',
      'say.now': 'De vuelta a la hora actual', 'local': '{city} (local)',
      'add.city': 'Agregar una ciudad', 'add.full': 'Aquí caben hasta 8 ciudades. En la app, todas las que quieras.', 'say.added': 'Se agregó {city}, {time}',
      'ruler.now': 'Ahora · {time}', 'map.aria': 'Mapa mundial con el día y la noche a las {time}, hora de {city}: {list}.', 'map.day': 'día', 'map.night': 'noche',
      'plan.sum': '{n} h en común · {start} a {end}', 'plan.none': 'Sin horas en común', 'plan.title': 'Horas en {city} · Hoy',
      'plan.aria': 'Demostración del planificador de reuniones con {cities}, horario laboral de 09:00 a 18:00 en hora local: {n} horas en común, de {start} a {end}, hora de {city}.',
      'plan.ariaNone': 'Demostración del planificador de reuniones con {cities}, horario laboral de 09:00 a 18:00 en hora local: ninguna hora en común hoy.',
      'label.team': 'Equipo de diseño',
      'theme.system': 'como Windows', 'theme.light': 'claro', 'theme.dark': 'oscuro',
      'theme.aria': 'Tema: {cur}. Cambiar a {next}.', 'theme.title': 'Tema: {cur}',
      'link.done': 'Enlace copiado', 'link.manual': 'Copia este enlace: {url}'
    }
  };
  // times the feature tile types, in the app's own examples for each language (conv.placeholder, tip.chip1)
  var SEQ = { en: ['9:30', '15h30', '7am', '3pm'], pt: ['9:30', '15h30', '7h', '15h'], es: ['9:30', '15h30', '7am', '3pm'] };

  // City names that differ in Portuguese / Spanish: ZONE_I18N from src/renderer/zones.js (everything else keeps its name)
  var CITY = {
    pt: {
      'Europe/Lisbon': 'Lisboa', 'Europe/London': 'Londres', 'Europe/Berlin': 'Berlim', 'Europe/Amsterdam': 'Amsterdã', 'Europe/Brussels': 'Bruxelas',
      'Europe/Zurich': 'Zurique', 'Europe/Rome': 'Roma', 'Europe/Vienna': 'Viena', 'Europe/Prague': 'Praga', 'Europe/Warsaw': 'Varsóvia',
      'Europe/Stockholm': 'Estocolmo', 'Europe/Copenhagen': 'Copenhague', 'Europe/Helsinki': 'Helsinque', 'Europe/Athens': 'Atenas',
      'Europe/Istanbul': 'Istambul', 'Europe/Kyiv': 'Kiev', 'Europe/Moscow': 'Moscou', 'Europe/Bucharest': 'Bucareste',
      'Africa/Johannesburg': 'Joanesburgo', 'Asia/Riyadh': 'Riad', 'Asia/Tehran': 'Teerã', 'Asia/Dhaka': 'Daca', 'Asia/Jakarta': 'Jacarta',
      'Asia/Singapore': 'Singapura', 'Asia/Ho_Chi_Minh': 'Cidade de Ho Chi Minh', 'Asia/Shanghai': 'Xangai', 'Asia/Seoul': 'Seul',
      'Asia/Tokyo': 'Tóquio', 'America/Mexico_City': 'Cidade do México', 'America/New_York': 'Nova York', 'Atlantic/Azores': 'Açores'
    },
    es: {
      'Europe/Lisbon': 'Lisboa', 'Europe/London': 'Londres', 'Europe/Berlin': 'Berlín', 'Europe/Amsterdam': 'Ámsterdam', 'Europe/Brussels': 'Bruselas',
      'Europe/Zurich': 'Zúrich', 'Europe/Rome': 'Roma', 'Europe/Vienna': 'Viena', 'Europe/Prague': 'Praga', 'Europe/Warsaw': 'Varsovia',
      'Europe/Stockholm': 'Estocolmo', 'Europe/Copenhagen': 'Copenhague', 'Europe/Athens': 'Atenas', 'Europe/Istanbul': 'Estambul',
      'Europe/Kyiv': 'Kiev', 'Europe/Moscow': 'Moscú', 'Europe/Bucharest': 'Bucarest', 'Africa/Cairo': 'El Cairo',
      'Africa/Johannesburg': 'Johannesburgo', 'Asia/Dubai': 'Dubái', 'Asia/Riyadh': 'Riad', 'Asia/Tehran': 'Teherán', 'Asia/Kolkata': 'Bombay',
      'Asia/Dhaka': 'Daca', 'Asia/Jakarta': 'Yakarta', 'Asia/Singapore': 'Singapur', 'Asia/Ho_Chi_Minh': 'Ciudad Ho Chi Minh',
      'Asia/Shanghai': 'Shanghái', 'Asia/Taipei': 'Taipéi', 'Asia/Seoul': 'Seúl', 'Asia/Tokyo': 'Tokio', 'Australia/Sydney': 'Sídney',
      'America/Mexico_City': 'Ciudad de México', 'America/New_York': 'Nueva York'
    }
  };
  var LOCALE = { en: 'en-US', pt: 'pt-BR', es: 'es-419' }; // as the app formats dates (LOCALES in src/renderer/i18n.js)
  var PREFIX = { en: '/', pt: '/pt/', es: '/es/' };

  function t(key, vars) {
    var d = STR[lang], s = key in d ? d[key] : (key in STR.en ? STR.en[key] : key);
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return k in vars ? String(vars[k]) : m; });
    return s;
  }
  // "/pt/features" -> "features", "/" -> ""
  function slug(path) { return String(path || '/').replace(/^\/(pt|es)(\/|$)/, '/').replace(/^\//, ''); }

  window.SITE_I18N = {
    lang: lang,
    locale: LOCALE[lang],
    t: t,
    seq: SEQ[lang],
    city: function (zone, name) { return (CITY[lang] && CITY[lang][zone]) || name; },
    // this page's address in another language (or in its own): '/pt/download', '/es/', '/features'
    href: function (to, path) { return PREFIX[to] + slug(path == null ? location.pathname : path); },
    prefix: PREFIX[lang]
  };

  var store = {
    get: function () { try { return localStorage.getItem(KEY); } catch (e) { return null; } },
    set: function (v) { try { localStorage.setItem(KEY, v); } catch (e) { /* storage blocked: the link still works */ } }
  };
  // any language link (nav, Menu, footer, the suggestion) remembers the choice
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[data-lang]') : null;
    if (a) store.set(a.getAttribute('data-lang'));
  }, true);

  // ---- the English home page's suggestion, for Portuguese and Spanish browsers ----
  if (lang !== 'en' || !document.querySelector('main > .hero')) return;
  var chosen = store.get();
  var want = chosen;
  if (!want) {
    var list = [];
    try { list = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]) || []; } catch (e) { list = []; }
    for (var i = 0; i < list.length; i++) {
      var l = String(list[i] || '').slice(0, 2).toLowerCase();
      if (l === 'en' || l === 'pt' || l === 'es') { want = l; break; }
    }
  }
  if (want !== 'pt' && want !== 'es') return;
  var WORDS = {
    pt: { go: 'Ver em português', close: 'Fechar', region: 'Idioma', tag: 'pt-BR' },
    es: { go: 'Ver en español', close: 'Cerrar', region: 'Idioma', tag: 'es-419' }
  }[want];
  function show() {
    var box = document.createElement('div');
    box.className = 'lang-hint';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', WORDS.region);
    box.setAttribute('lang', WORDS.tag);
    var a = document.createElement('a');
    a.href = PREFIX[want] + (/^#(c|t)=/.test(location.hash) ? location.hash : ''); // shared cities travel along
    a.hreflang = WORDS.tag;
    a.setAttribute('data-lang', want);
    a.innerHTML = '<svg class="i" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.4 5.2 3.4 8.5s-1 6.1-3.4 8.5c-2.4-2.4-3.4-5.2-3.4-8.5s1-6.1 3.4-8.5Z"/></svg>';
    a.appendChild(document.createTextNode(WORDS.go));
    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'lang-hint-x';
    x.setAttribute('aria-label', WORDS.close);
    x.innerHTML = '<svg class="i" aria-hidden="true" viewBox="0 0 24 24"><path d="M7 7l10 10M17 7 7 17"/></svg>';
    x.addEventListener('click', function () {
      store.set('en');
      box.remove();
    });
    box.appendChild(a);
    box.appendChild(x);
    document.body.appendChild(box);
  }
  // after the load event, at idle: never in the way of the first paint
  var later = function () { if ('requestIdleCallback' in window) requestIdleCallback(show, { timeout: 2000 }); else setTimeout(show, 800); };
  if (document.readyState === 'complete') later(); else addEventListener('load', later, { once: true });
})();
