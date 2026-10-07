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
// Two live tools with their own search task: the current time in many places, and UTC itself.
export const toolSlugs = ['world-time-now', 'utc-time'];
export const extraSlugs = [...pairs.map(pairSlug), ...toolSlugs, 'daylight-saving-meetings', 'always-on-top-world-clock', 'press'];
// Major cities for the live world-time table: one per region and rule set, not a ranking.
export const worldCities = [
  ['America/Los_Angeles', 'Los Angeles', 'Los Angeles', 'Los Ángeles'],
  ['America/Mexico_City', 'Mexico City', 'Cidade do México', 'Ciudad de México'],
  ['America/New_York', 'New York', 'Nova York', 'Nueva York'],
  ['America/Sao_Paulo', 'São Paulo', 'São Paulo', 'São Paulo'],
  ['America/Argentina/Buenos_Aires', 'Buenos Aires', 'Buenos Aires', 'Buenos Aires'],
  ['Europe/London', 'London', 'Londres', 'Londres'],
  ['Europe/Paris', 'Paris', 'Paris', 'París'],
  ['Africa/Lagos', 'Lagos', 'Lagos', 'Lagos'],
  ['Africa/Cairo', 'Cairo', 'Cairo', 'El Cairo'],
  ['Europe/Moscow', 'Moscow', 'Moscou', 'Moscú'],
  ['Asia/Dubai', 'Dubai', 'Dubai', 'Dubái'],
  ['Asia/Kolkata', 'Mumbai', 'Mumbai', 'Bombay'],
  ['Asia/Shanghai', 'Shanghai', 'Xangai', 'Shanghái'],
  ['Asia/Singapore', 'Singapore', 'Singapura', 'Singapur'],
  ['Asia/Tokyo', 'Tokyo', 'Tóquio', 'Tokio'],
  ['Australia/Sydney', 'Sydney', 'Sydney', 'Sídney'],
  ['Pacific/Auckland', 'Auckland', 'Auckland', 'Auckland']
];
// Planner presets for common team layouts. Overlap is computed at build time with the app's time engine.
export const PLAN_DATE = '2026-10-14';
export const plannerPresets = [
  [['America/New_York','Europe/London','Europe/Berlin'], 'US East + UK + Europe', 'EUA (leste) + Reino Unido + Europa', 'EE. UU. (este) + Reino Unido + Europa'],
  [['Europe/London','Europe/Berlin','Asia/Kolkata'], 'UK + Europe + India', 'Reino Unido + Europa + Índia', 'Reino Unido + Europa + India'],
  [['America/Los_Angeles','Asia/Kolkata'], 'US West + India', 'EUA (oeste) + Índia', 'EE. UU. (oeste) + India'],
  [['Europe/London','Asia/Singapore','Asia/Tokyo'], 'UK + Singapore + Japan', 'Reino Unido + Singapura + Japão', 'Reino Unido + Singapur + Japón'],
  [['America/New_York','America/Sao_Paulo','Asia/Singapore','Australia/Sydney'], 'Americas + Asia-Pacific', 'Américas + Ásia-Pacífico', 'América + Asia-Pacífico'],
  [['America/Sao_Paulo','Europe/Lisbon','Europe/Madrid'], 'Brazil + Portugal + Spain', 'Brasil + Portugal + Espanha', 'Brasil + Portugal + España']
];
export const zoneName = (zone, lang) => {
  const i = {en:1,pt:2,es:3}[lang];
  const row = worldCities.find(r => r[0] === zone) || Object.values(cities).map(c => [c[0], c[1], c[2], c[3]]).find(r => r[0] === zone);
  return row ? row[i] : ({'Europe/Madrid':['Madrid','Madri','Madrid']}[zone] || [zone.split('/').pop().replace(/_/g,' ')])[i-1] || zone;
};
export const nowZones = 'America/New_York,Europe/London,Asia/Kolkata,Asia/Tokyo,Australia/Sydney';
export const utcZones = 'UTC,America/New_York,Europe/London,Asia/Kolkata,Asia/Tokyo';
export const copy = {
  en: {
    presetH: 'Team presets', presetIntro: 'Each link opens the planner above with those cities. Overlap uses the default hours, 09:00 to 18:00, Monday to Friday, on Wednesday 14 October 2026. Change any city’s hours in the planner.',
    presetCols: ['Team', 'Shared working time'], overlap: (h, from, to, city) => `${h} · ${from} to ${to} (${city})`, none: (n, of) => `No shared hour; at most ${n} of ${of} cities working`, openIt: 'Open',
    fairH: 'When no hour works for everyone', fair: ['Use the hours when the most people are working, and say who is outside them. The planner’s Best line shows this.', 'Rotate the early or late slot between regions instead of always asking the same city.', 'See whether one office can shift its day, for example an 08:00 start. Change that city’s hours and the overlap updates.', 'Not everything needs a live call. A shared document or recorded update can cover the region that would be asleep.'],
    faqH: 'Questions', faq: [['How do I find a meeting time across 4 or more time zones?', 'Add every city, open the planner, and look for the outlined overlap. If there is none, the Best line shows the hours when the most cities are working.'], ['Does it handle daylight saving time?', 'Yes. Each day uses that day’s rules from the IANA time zone database, so the overlap can change in the weeks when regions change clocks on different dates.'], ['Can I send the result to my team?', 'Share clocks copies a link with the cities and the selected time. Copy times in the app puts every converted time on your clipboard.'], ['Is it free?', 'Yes. There is no account, and your cities are saved in your browser.']],
    now: 'World time now', utc: 'UTC time',
    nowTitle: 'Current Time Around the World : Major Cities Now', nowHead: 'What time is it around the world?',
    nowLead: 'Live local time, date and UTC offset in major cities. Add your own cities, or type a time to convert.',
    nowTable: 'Major cities right now', nowIntro: 'Times update live in your browser. Offsets and 2026 clock changes come from the IANA time zone database.',
    cols: ['City', 'Time zone', 'Local time', 'UTC offset', 'Clocks change in 2026'], noChange: 'No change', liveWait: 'Local times need JavaScript. Without it, the offsets shown are those of 1 October 2026.',
    nowCountryH: 'A country is not always one clock', nowCountry: 'The United States, Canada, Mexico, Brazil, Russia, Australia and Indonesia each use more than one time zone. Look up the city you mean, not just the country.',
    utcTitle: 'UTC Time Now & UTC to Local Time Converter', utcHead: 'UTC now, and in your time zone.',
    utcLead: 'See the current UTC time beside major cities. Type a UTC time to convert it to local time anywhere.',
    utcWhatH: 'What UTC is', utcWhat: 'Coordinated Universal Time (UTC) is the reference for the world’s civil time zones. It has no daylight saving time, so it never shifts. Local times are written as offsets from it, such as UTC−5 or UTC+5:30.',
    utcGmtH: 'UTC, GMT and London', utcGmt: 'In everyday use, GMT and UTC name the same time. London is not on UTC all year: it uses GMT (UTC+0) in winter and BST (UTC+1) in summer.',
    utcStampH: 'Reading a UTC timestamp', utcStamp: 'A trailing Z, as in 2026-01-15T14:00Z, means UTC. The same UTC time lands on different local hours when clocks change:',
    utcSources: 'Sources',
    home: 'Home', converter: 'Time zone converter', planner: 'Meeting planner', map: 'Day and night map',
    toolTitles: ['Time Zone Converter & Time Difference Calculator', 'Meeting Planner: Best Time Across Time Zones', 'Live Day and Night World Map'],
    toolHeads: ['One time. Every city.', 'Find a time that works for everyone.', 'See where the world is awake.'],
    toolLeads: ['Choose a city, enter a time, and compare. Every card shows its time difference from yours, with daylight saving and date changes handled.', 'Add your cities and set their working hours. See the best meeting time for everyone, then copy it.', 'Follow daylight around the globe. Pick a time to see the world at that moment.'],
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
    presetH: 'Equipes prontas', presetIntro: 'Cada link abre o planejador acima com essas cidades. A sobreposição usa o expediente padrão, 09:00 às 18:00, de segunda a sexta, na quarta-feira, 14 de outubro de 2026. Ajuste o horário de qualquer cidade no planejador.',
    presetCols: ['Equipe', 'Expediente em comum'], overlap: (h, from, to, city) => `${h} · ${from} às ${to} (${city})`, none: (n, of) => `Nenhum horário em comum; no máximo ${n} de ${of} cidades em expediente`, openIt: 'Abrir',
    fairH: 'Quando nenhum horário serve para todos', fair: ['Use as horas em que mais pessoas estão trabalhando e diga quem fica de fora. A linha Melhor horário do planejador mostra isso.', 'Alterne o horário cedo ou tarde entre as regiões, em vez de pedir sempre à mesma cidade.', 'Veja se um escritório pode mudar o expediente, por exemplo começando às 08:00. Mude o horário da cidade e a sobreposição se atualiza.', 'Nem tudo precisa de chamada ao vivo. Um documento compartilhado ou um vídeo gravado atende a região que estaria dormindo.'],
    faqH: 'Perguntas', faq: [['Como encontrar um horário de reunião para 4 ou mais fusos?', 'Adicione todas as cidades, abra o planejador e procure a sobreposição destacada. Se não houver, a linha Melhor horário mostra as horas em que mais cidades estão em expediente.'], ['Ele considera o horário de verão?', 'Sim. Cada dia usa as regras daquele dia da base de fusos horários IANA, então a sobreposição pode mudar nas semanas em que as regiões mudam os relógios em datas diferentes.'], ['Posso enviar o resultado para a equipe?', 'Compartilhar copia um link com as cidades e o horário escolhido. Copiar horários, no app, copia todos os horários convertidos.'], ['É grátis?', 'Sim. Não precisa de conta, e suas cidades ficam salvas no navegador.']],
    now: 'Hora mundial agora', utc: 'Hora UTC',
    nowTitle: 'Que Horas São no Mundo : Grandes Cidades Agora', nowHead: 'Que horas são no mundo agora?',
    nowLead: 'Hora local, data e diferença de UTC ao vivo em grandes cidades. Adicione suas cidades ou digite um horário para converter.',
    nowTable: 'Grandes cidades agora', nowIntro: 'Os horários se atualizam no seu navegador. Diferenças e mudanças de 2026 vêm da base de fusos horários IANA.',
    cols: ['Cidade', 'Fuso horário', 'Hora local', 'Diferença de UTC', 'Mudança de horário em 2026'], noChange: 'Sem mudança', liveWait: 'A hora local precisa de JavaScript. Sem ele, as diferenças mostradas são as de 1 de outubro de 2026.',
    nowCountryH: 'Um país nem sempre tem um só horário', nowCountry: 'Estados Unidos, Canadá, México, Brasil, Rússia, Austrália e Indonésia usam mais de um fuso horário. Procure a cidade, não só o país.',
    utcTitle: 'Hora UTC Agora e Conversor de UTC para Hora Local', utcHead: 'UTC agora e no seu fuso horário.',
    utcLead: 'Veja a hora UTC atual ao lado de grandes cidades. Digite um horário em UTC para convertê-lo para a hora local de qualquer lugar.',
    utcWhatH: 'O que é UTC', utcWhat: 'O Tempo Universal Coordenado (UTC) é a referência dos fusos horários civis do mundo. Não tem horário de verão, então nunca muda. As horas locais são escritas como diferenças dele, como UTC−3 ou UTC+5:30.',
    utcGmtH: 'UTC, GMT e Londres', utcGmt: 'No uso diário, GMT e UTC indicam o mesmo horário. Londres não fica em UTC o ano todo: usa GMT (UTC+0) no inverno e BST (UTC+1) no verão.',
    utcStampH: 'Como ler um horário em UTC', utcStamp: 'Um Z no fim, como em 2026-01-15T14:00Z, indica UTC. O mesmo horário UTC cai em horas locais diferentes quando os relógios mudam:',
    utcSources: 'Fontes',
    home: 'Início', converter: 'Conversor de fuso horário', planner: 'Planejador de reuniões', map: 'Mapa de dia e noite',
    toolTitles: ['Conversor de Fuso Horário e Diferença de Horário', 'Planejador de Reuniões: Melhor Horário entre Fusos', 'Mapa-múndi de Dia e Noite ao Vivo'],
    toolHeads: ['Um horário. Todas as cidades.', 'Encontre um horário bom para todos.', 'Veja onde o mundo está acordado.'],
    toolLeads: ['Escolha uma cidade, digite um horário e compare. Cada cartão mostra a diferença de horário para o seu, já com horário de verão e mudança de data.', 'Adicione as cidades e ajuste o expediente de cada uma. Veja o melhor horário de reunião para todos e copie o resultado.', 'Acompanhe o dia e a noite pelo planeta. Escolha um horário para ver o mundo naquele momento.'],
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
    presetH: 'Equipos listos', presetIntro: 'Cada enlace abre el planificador de arriba con esas ciudades. La coincidencia usa el horario por defecto, de 09:00 a 18:00, de lunes a viernes, el miércoles 14 de octubre de 2026. Cambia el horario de cualquier ciudad en el planificador.',
    presetCols: ['Equipo', 'Horario laboral en común'], overlap: (h, from, to, city) => `${h} · de ${from} a ${to} (${city})`, none: (n, of) => `Ninguna hora en común; como máximo ${n} de ${of} ciudades trabajando`, openIt: 'Abrir',
    fairH: 'Cuando ninguna hora sirve para todos', fair: ['Usa las horas en que más personas trabajan y di quién queda fuera. La línea Mejor opción del planificador lo muestra.', 'Alterna el horario temprano o tardío entre regiones, en vez de pedírselo siempre a la misma ciudad.', 'Mira si una oficina puede mover su jornada, por ejemplo empezar a las 08:00. Cambia el horario de esa ciudad y la coincidencia se actualiza.', 'No todo necesita una llamada en vivo. Un documento compartido o una actualización grabada sirve para la región que estaría durmiendo.'],
    faqH: 'Preguntas', faq: [['¿Cómo encuentro una hora de reunión para 4 o más zonas horarias?', 'Añade todas las ciudades, abre el planificador y busca la coincidencia marcada. Si no la hay, la línea Mejor opción muestra las horas en que más ciudades trabajan.'], ['¿Tiene en cuenta el horario de verano?', 'Sí. Cada día usa las reglas de ese día de la base de zonas horarias IANA, así que la coincidencia puede cambiar en las semanas en que las regiones cambian la hora en fechas distintas.'], ['¿Puedo enviar el resultado a mi equipo?', 'Compartir copia un enlace con las ciudades y la hora elegida. Copiar horas, en la app, copia todas las horas convertidas.'], ['¿Es gratis?', 'Sí. No necesitas cuenta y tus ciudades se guardan en tu navegador.']],
    now: 'Hora mundial ahora', utc: 'Hora UTC',
    nowTitle: 'Qué Hora Es en el Mundo : Grandes Ciudades Ahora', nowHead: '¿Qué hora es en el mundo ahora?',
    nowLead: 'Hora local, fecha y diferencia con UTC en vivo en grandes ciudades. Añade tus ciudades o escribe una hora para convertir.',
    nowTable: 'Grandes ciudades ahora', nowIntro: 'Las horas se actualizan en tu navegador. Las diferencias y los cambios de 2026 vienen de la base de zonas horarias IANA.',
    cols: ['Ciudad', 'Zona horaria', 'Hora local', 'Diferencia con UTC', 'Cambio de hora en 2026'], noChange: 'Sin cambio', liveWait: 'La hora local necesita JavaScript. Sin él, las diferencias mostradas son las del 1 de octubre de 2026.',
    nowCountryH: 'Un país no siempre tiene una sola hora', nowCountry: 'Estados Unidos, Canadá, México, Brasil, Rusia, Australia e Indonesia usan más de una zona horaria. Busca la ciudad, no solo el país.',
    utcTitle: 'Hora UTC Ahora y Convertidor de UTC a Hora Local', utcHead: 'UTC ahora y en tu zona horaria.',
    utcLead: 'Mira la hora UTC actual junto a grandes ciudades. Escribe una hora UTC para convertirla a la hora local de cualquier lugar.',
    utcWhatH: 'Qué es UTC', utcWhat: 'El Tiempo Universal Coordinado (UTC) es la referencia de las zonas horarias civiles del mundo. No tiene horario de verano, así que nunca cambia. Las horas locales se escriben como diferencias con él, como UTC−5 o UTC+5:30.',
    utcGmtH: 'UTC, GMT y Londres', utcGmt: 'En el uso diario, GMT y UTC indican la misma hora. Londres no está en UTC todo el año: usa GMT (UTC+0) en invierno y BST (UTC+1) en verano.',
    utcStampH: 'Cómo leer una hora en UTC', utcStamp: 'Una Z al final, como en 2026-01-15T14:00Z, indica UTC. La misma hora UTC cae en horas locales distintas cuando cambian los relojes:',
    utcSources: 'Fuentes',
    home: 'Inicio', converter: 'Convertidor de zona horaria', planner: 'Planificador de reuniones', map: 'Mapa de día y noche',
    toolTitles: ['Conversor de Horas: Qué Hora Es en Cada Ciudad', 'Planificador de Reuniones: Mejor Hora entre Zonas Horarias', 'Mapa Mundial de Día y Noche en Vivo'],
    toolHeads: ['Una hora. Todas las ciudades.', 'Encuentra una hora que les venga bien a todos.', 'Mira dónde el mundo está despierto.'],
    toolLeads: ['¿Qué hora son las 18:00 en México, Madrid o Buenos Aires? Escribe una hora, elige la ciudad y mira la hora en cada lugar, con el horario de verano incluido.', 'Añade las ciudades y ajusta sus horarios laborales. Mira la mejor hora de reunión para todos y copia el resultado.', 'Sigue el día y la noche por el planeta. Elige una hora para ver el mundo en ese momento.'],
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
// One tool switcher for every page that embeds the app, hand-written tool pages included.
export const toolNav = (lang, tool) => {
  const w = copy[lang], p = prefix(lang);
  const links = [['converter','time-zone-converter'],['planner','meeting-planner'],['now','world-time-now'],['utc','utc-time'],['map','world-map']];
  return `<nav class="tool-nav" aria-label="${w.related}">${links.map(([key,url])=>`<a href="${p}${url}"${tool===key?' aria-current="page"':''}>${w[key]}</a>`).join('')}</nav>`;
};
export function toolHtml(lang, tool, zones = '') {
  const w = copy[lang], p = prefix(lang);
  return `${toolNav(lang, tool)}
<div class="tool-window is-loading"><div class="app-win-bar"><span class="tool-status" id="toolStatus" role="status">${w.loading}</span><button class="app-win-share tool-retry" id="toolRetry" type="button" hidden>${w.retry}</button><button class="app-win-share" id="heroShare" type="button" disabled>${w.share}</button></div>
<iframe class="app-frame" id="heroApp" data-tool="${tool}" data-cities="${zones}" title="${w[tool]}" allow="clipboard-write"></iframe><input class="tool-share-link" id="toolShareLink" readonly hidden aria-label="${w.share}"></div>
<noscript><p class="pg-sub">${w.nojs}</p></noscript><div class="tool-after"><p>${w.hint}</p><a href="${p}download">${w.desktop}</a></div>`;
}
