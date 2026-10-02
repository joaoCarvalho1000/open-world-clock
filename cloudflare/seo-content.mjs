// Editorially selected routes, not every possible city combination.
export const REVIEW_DATE = '2026-10-01';
export const cities = {
  london: ['Europe/London', 'London', 'Londres', 'Londres'],
  'new-york': ['America/New_York', 'New York', 'Nova York', 'Nueva York'],
  'sao-paulo': ['America/Sao_Paulo', 'São Paulo', 'São Paulo', 'São Paulo'],
  lisbon: ['Europe/Lisbon', 'Lisbon', 'Lisboa', 'Lisboa'],
  mumbai: ['Asia/Kolkata', 'Mumbai', 'Mumbai', 'Bombay'],
  singapore: ['Asia/Singapore', 'Singapore', 'Singapura', 'Singapur'],
  tokyo: ['Asia/Tokyo', 'Tokyo', 'Tóquio', 'Tokio'],
  'los-angeles': ['America/Los_Angeles', 'Los Angeles', 'Los Angeles', 'Los Ángeles'],
  sydney: ['Australia/Sydney', 'Sydney', 'Sydney', 'Sídney'],
  berlin: ['Europe/Berlin', 'Berlin', 'Berlim', 'Berlín']
};
export const pairs = [
  ['london', 'new-york'], ['sao-paulo', 'lisbon'], ['new-york', 'mumbai'],
  ['london', 'singapore'], ['new-york', 'tokyo'], ['los-angeles', 'london'],
  ['sydney', 'london'], ['berlin', 'new-york'], ['sao-paulo', 'new-york'], ['lisbon', 'tokyo']
];
export const pairSlug = ([a, b]) => `${a}-to-${b}-time`;
export const extraSlugs = [...pairs.map(pairSlug), 'daylight-saving-meetings', 'always-on-top-world-clock', 'press'];
export const copy = {
  en: {
    home: 'Home', converter: 'Time zone converter', planner: 'Meeting planner', map: 'Day and night map',
    toolTitles: ['Time Zone Converter : Compare Cities & Dates', 'Meeting Planner Across Time Zones', 'Live Day and Night World Map'],
    toolHeads: ['One time. Every city.', 'Find a time that works for everyone.', 'See where the world is awake.'],
    toolLeads: ['Choose a city, enter a time, and compare. Daylight saving and date changes are handled for you.', 'Add your cities and set their working hours. Find the overlap, then copy the meeting time.', 'Follow daylight around the globe. Pick a time to see the world at that moment.'],
    loading: 'Loading your clocks…', retry: 'Try again', share: 'Share clocks',
    hint: 'Free to use. No account. Your saved cities stay yours.',
    desktop: 'Keep it on your Windows desktop', nojs: 'Turn on JavaScript to use the live tool. The examples below work without it.',
    routes: 'Start with two cities', related: 'Keep exploring', examples: 'A few times to compare',
    date: 'Examples for 1 October 2026. Select another date in the converter above.',
    difference: 'The difference changes with the date', season: 'Seasonal time differences',
    seasonIntro: 'The same local hour can land differently as clocks change. These examples use 09:00 in the first city.',
    dateCol: 'Date in source city', day: 'next day', previous: 'previous day',
    source: 'Time zone rules come from the browser’s IANA data. Keep your browser updated. Abbreviations can be ambiguous; use the city and date.',
    pairLead: (a,b) => `Compare ${a} and ${b}, choose a date, and share the result. Open the planner to find shared working hours.`,
    pairTitle: (a,b) => `${a} to ${b} Time Converter`,
    pairHead: (a,b) => `${a} to ${b}`, calendar: 'Dates matter. These are worked examples, not a fixed year-round offset.',
    dst: 'When the clocks change, your meetings can too.',
    dstTitle: 'US & Europe Daylight Saving: Meeting Times in 2026',
    dstLead: 'London and New York change clocks on different Sundays. Check the gap before you send a recurring invite.',
    dstBody: 'In 2026, London turns its clocks back on 25 October. New York follows on 1 November. Between those changes, London is four hours ahead instead of five. In spring, New York changes on 8 March and London on 29 March.',
    dstSteps: ['Choose the meeting’s date, not just its hour.', 'Check every city on the call. Not every country changes clocks.', 'For a recurring meeting, decide which city’s local time should stay fixed.'],
    dstLink: 'Check the meeting planner', pin: 'Your cities, always in view.', pinTitle: 'Always-on-Top World Clock for Windows 11 & 10',
    pinLead: 'Keep other time zones beside your work. A free Windows clock you can pin above your other windows.',
    pinSteps: ['Install Open World Clock from Microsoft Store.', 'Add the cities you follow, then select the pin in the top bar.', 'Choose a strip, compact bar or vertical column. Unpin it whenever you want.'],
    pinNote: 'The browser tool is handy for a quick check. Staying above other apps is a feature of the Windows desktop app.',
    press: 'A small clock for a connected world.', pressTitle: 'Open World Clock : Press & Product Facts',
    pressLead: 'Free, open-source world clocks, a time zone converter, a meeting planner and a day/night map. Available for Windows and in the browser.',
    facts: 'The short version', factsBody: 'Made by João Carvalho. MIT licensed. The Windows app works offline, with no account, ads or telemetry. The website uses privacy-conscious analytics; the browser app saves settings locally.',
    assets: 'Screenshots and logo', pressContact: 'Questions or a review copy?', support: 'Contact the creator',
    screenshot: 'Open World Clock in its light desktop layout', windows: 'For Windows', guides: 'Useful guides'
  },
  pt: {
    home: 'Início', converter: 'Conversor de fuso horário', planner: 'Planejador de reuniões', map: 'Mapa de dia e noite',
    toolTitles: ['Conversor de Fuso Horário : Cidades e Datas', 'Planejador de Reuniões entre Fusos Horários', 'Mapa-múndi de Dia e Noite ao Vivo'],
    toolHeads: ['Um horário. Todas as cidades.', 'Encontre um horário bom para todos.', 'Veja onde o mundo está acordado.'],
    toolLeads: ['Escolha uma cidade, digite um horário e compare. As mudanças de data e de horário de verão já entram na conta.', 'Adicione as cidades e ajuste o expediente de cada uma. Encontre um horário em comum e copie o resultado.', 'Acompanhe o dia e a noite pelo planeta. Escolha um horário para ver o mundo naquele momento.'],
    loading: 'Carregando os relógios…', retry: 'Tentar novamente', share: 'Compartilhar', hint: 'Grátis, sem conta. Suas cidades salvas continuam suas.',
    desktop: 'Tenha no seu desktop Windows', nojs: 'Ative o JavaScript para usar a ferramenta. Os exemplos abaixo funcionam sem ele.',
    routes: 'Comece com duas cidades', related: 'Continue explorando', examples: 'Alguns horários para comparar', date: 'Exemplos de 1 de outubro de 2026. Escolha outra data no conversor acima.',
    difference: 'A diferença depende da data', season: 'Diferenças ao longo do ano', seasonIntro: 'O mesmo horário local pode mudar de correspondência quando os relógios mudam. Os exemplos partem das 09:00 na primeira cidade.',
    dateCol: 'Data na cidade de origem', day: 'dia seguinte', previous: 'dia anterior', source: 'As regras de fuso vêm dos dados IANA do navegador. Mantenha-o atualizado. Abreviações podem ser ambíguas; prefira a cidade e a data.',
    pairLead: (a,b) => `Compare ${a} e ${b}, escolha a data e compartilhe o resultado. Abra o planejador para encontrar um expediente em comum.`,
    pairTitle: (a,b) => `Horário de ${a} para ${b} : Conversor`, pairHead: (a,b) => `${a} e ${b}`, calendar: 'A data importa. São exemplos calculados, não uma diferença fixa para o ano todo.',
    dst: 'Os relógios mudam. Suas reuniões também podem mudar.', dstTitle: 'Horário de Verão nos EUA e Europa: Reuniões em 2026',
    dstLead: 'Londres e Nova York mudam os relógios em domingos diferentes. Confira a diferença antes de marcar uma reunião recorrente.',
    dstBody: 'Em 2026, Londres atrasa os relógios em 25 de outubro. Nova York faz o mesmo em 1 de novembro. Nesse intervalo, Londres fica quatro horas à frente, em vez de cinco. Em março, Nova York muda no dia 8 e Londres no dia 29.',
    dstSteps: ['Escolha a data da reunião, além do horário.', 'Confira cada cidade da chamada. Nem todo país muda os relógios.', 'Em reuniões recorrentes, defina qual cidade deve manter o horário local.'], dstLink: 'Conferir no planejador',
    pin: 'Suas cidades, sempre à vista.', pinTitle: 'Relógio Mundial Sempre Visível para Windows 11 e 10', pinLead: 'Deixe os fusos perto do seu trabalho. Um relógio grátis para Windows que fica acima das outras janelas.',
    pinSteps: ['Instale o Open World Clock pela Microsoft Store.', 'Adicione suas cidades e selecione o alfinete na barra superior.', 'Escolha uma faixa, barra compacta ou coluna vertical. Desafixe quando quiser.'],
    pinNote: 'A versão no navegador é prática para uma consulta. Ficar acima de outros aplicativos é um recurso da versão para Windows.',
    press: 'Um pequeno relógio para um mundo conectado.', pressTitle: 'Open World Clock : Imprensa e Informações', pressLead: 'Relógios mundiais, conversor de fuso horário, planejador e mapa de dia e noite. Grátis, de código aberto, para Windows e navegador.',
    facts: 'Em poucas palavras', factsBody: 'Criado por João Carvalho. Licença MIT. O aplicativo Windows funciona offline, sem conta, anúncios ou telemetria. O site usa métricas com respeito à privacidade; o app no navegador salva as preferências localmente.',
    assets: 'Imagens e logo', pressContact: 'Quer conhecer ou apresentar o projeto?', support: 'Fale com o criador', screenshot: 'Open World Clock no layout claro para desktop', windows: 'Para Windows', guides: 'Guias úteis'
  },
  es: {
    home: 'Inicio', converter: 'Convertidor de zona horaria', planner: 'Planificador de reuniones', map: 'Mapa de día y noche',
    toolTitles: ['Convertidor de Zonas Horarias : Ciudades y Fechas', 'Planificador de Reuniones entre Zonas Horarias', 'Mapa Mundial de Día y Noche en Vivo'],
    toolHeads: ['Una hora. Todas las ciudades.', 'Encuentra una hora que les venga bien a todos.', 'Mira dónde el mundo está despierto.'],
    toolLeads: ['Elige una ciudad, escribe una hora y compara. Los cambios de fecha y de horario de verano ya están incluidos.', 'Añade las ciudades y ajusta sus horarios laborales. Encuentra las horas en común y copia el resultado.', 'Sigue el día y la noche por el planeta. Elige una hora para ver el mundo en ese momento.'],
    loading: 'Cargando los relojes…', retry: 'Volver a intentar', share: 'Compartir', hint: 'Gratis y sin cuenta. Tus ciudades guardadas siguen siendo tuyas.', desktop: 'Tenlo en tu escritorio Windows', nojs: 'Activa JavaScript para usar la herramienta. Los ejemplos de abajo funcionan sin él.',
    routes: 'Empieza con dos ciudades', related: 'Sigue explorando', examples: 'Algunas horas para comparar', date: 'Ejemplos del 1 de octubre de 2026. Elige otra fecha en el convertidor.',
    difference: 'La diferencia depende de la fecha', season: 'Diferencias a lo largo del año', seasonIntro: 'La misma hora local puede corresponder a otra cuando cambian los relojes. Los ejemplos parten de las 09:00 en la primera ciudad.',
    dateCol: 'Fecha en la ciudad de origen', day: 'día siguiente', previous: 'día anterior', source: 'Las reglas horarias vienen de los datos IANA del navegador. Mantenlo actualizado. Las abreviaturas pueden ser ambiguas; usa la ciudad y la fecha.',
    pairLead: (a,b) => `Compara ${a} y ${b}, elige una fecha y comparte el resultado. Abre el planificador para encontrar horas laborales en común.`,
    pairTitle: (a,b) => `Hora de ${a} a ${b} : Convertidor`, pairHead: (a,b) => `${a} y ${b}`, calendar: 'La fecha importa. Son ejemplos calculados, no una diferencia fija para todo el año.',
    dst: 'Cambian los relojes. Tus reuniones también pueden cambiar.', dstTitle: 'Horario de Verano en EE. UU. y Europa: Reuniones de 2026',
    dstLead: 'Londres y Nueva York cambian la hora en domingos distintos. Revisa la diferencia antes de programar una reunión recurrente.',
    dstBody: 'En 2026, Londres atrasa los relojes el 25 de octubre. Nueva York lo hace el 1 de noviembre. Entre esos cambios, Londres está cuatro horas por delante, en vez de cinco. En marzo, Nueva York cambia el día 8 y Londres el 29.',
    dstSteps: ['Elige la fecha de la reunión, además de la hora.', 'Comprueba cada ciudad de la llamada. No todos los países cambian la hora.', 'Para reuniones recurrentes, decide qué ciudad debe mantener su hora local.'], dstLink: 'Comprobar en el planificador',
    pin: 'Tus ciudades, siempre a la vista.', pinTitle: 'Reloj Mundial Siempre Visible para Windows 11 y 10', pinLead: 'Ten otras zonas horarias junto a tu trabajo. Un reloj gratis para Windows que puedes fijar sobre las demás ventanas.',
    pinSteps: ['Instala Open World Clock desde Microsoft Store.', 'Añade tus ciudades y selecciona la chincheta de la barra superior.', 'Elige una franja, barra compacta o columna vertical. Desfíjalo cuando quieras.'], pinNote: 'La versión web sirve para una consulta rápida. Mantenerse sobre otras aplicaciones es una función de la app para Windows.',
    press: 'Un pequeño reloj para un mundo conectado.', pressTitle: 'Open World Clock : Prensa e Información', pressLead: 'Relojes mundiales, convertidor de zonas horarias, planificador y mapa de día y noche. Gratis, de código abierto, para Windows y navegador.',
    facts: 'En pocas palabras', factsBody: 'Creado por João Carvalho. Licencia MIT. La app de Windows funciona sin conexión, sin cuenta, anuncios ni telemetría. El sitio usa métricas respetuosas con la privacidad; la app web guarda las preferencias localmente.',
    assets: 'Imágenes y logo', pressContact: '¿Quieres conocer o presentar el proyecto?', support: 'Contacta con el creador', screenshot: 'Open World Clock en su diseño claro de escritorio', windows: 'Para Windows', guides: 'Guías útiles'
  }
};
export const prefix = lang => lang === 'en' ? '/' : `/${lang}/`;
export const cityName = (key, lang) => cities[key][{en:1,pt:2,es:3}[lang]];
export const escapeHtml = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function toolHtml(lang, tool, zones = '') {
  const w = copy[lang], p = prefix(lang);
  const links = [['converter','time-zone-converter'],['planner','meeting-planner'],['map','world-map']];
  return `<nav class="tool-nav" aria-label="${w.related}">${links.map(([key,url])=>`<a href="${p}${url}"${tool===key?' aria-current="page"':''}>${w[key]}</a>`).join('')}</nav>
<div class="tool-window is-loading"><div class="app-win-bar"><span class="tool-status" id="toolStatus" role="status">${w.loading}</span><button class="app-win-share tool-retry" id="toolRetry" type="button" hidden>${w.retry}</button><button class="app-win-share" id="heroShare" type="button" disabled>${w.share}</button></div>
<iframe class="app-frame" id="heroApp" data-tool="${tool}" data-cities="${zones}" title="${w[tool]}" allow="clipboard-write"></iframe><input class="tool-share-link" id="toolShareLink" readonly hidden aria-label="${w.share}"></div>
<noscript><p class="pg-sub">${w.nojs}</p></noscript><div class="tool-after"><p>${w.hint}</p><a href="${p}download">${w.desktop}</a></div>`;
}
