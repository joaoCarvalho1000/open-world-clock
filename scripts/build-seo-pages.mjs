// Rebuild the curated search pages with the existing site chrome and app time-zone engine.
// No combinatorial routes, runtime API, or separate conversion algorithm.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { cities, pairs, pairSlug, copy, prefix, cityName, toolHtml, toolNav, worldCities, plannerPresets, zoneName, PLAN_DATE, nowZones, utcZones, escapeHtml as e, REVIEW_DATE } from '../cloudflare/seo-content.mjs';
import { applyChrome } from '../cloudflare/site-chrome.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');
const ORIGIN = 'https://openworldclock.com';
const ctx = { window: {}, Intl, Date, Map, Set, console };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'src/renderer/time.js'), 'utf8'), ctx);
const time = ctx.window.WCTime;
const file = (lang, slug) => path.join(SITE, lang === 'en' ? '' : lang, `${slug}.html`);
const section = (id, title, body) => `<section class="pg-sec cols" id="${id}" aria-labelledby="${id}-h"><div class="wrap"><div class="sec-head"><h2 id="${id}-h">${title}</h2></div><div class="sec-body prose">${body}</div></div></section>`;
const links = items => `<ul class="route-list">${items.map(([url,label])=>`<li><a href="${url}">${e(label)}<svg class="i" aria-hidden="true"><use href="#i-arrow"/></svg></a></li>`).join('')}</ul>`;
function wall(zone, source, ymd, h) {
  const [y,m,d] = ymd.split('-').map(Number);
  const date = new Date(time.zonedToEpoch(source, y,m,d,h,0));
  const p = time.parts(zone, date, {hourCycle:'h23',hour:'2-digit',minute:'2-digit'});
  return { hm:`${p.hour}:${p.minute}`, day: time.dayDiff(zone,date,source) };
}
function table(lang, a, b, rows) {
  const w=copy[lang], az=cities[a][0], bz=cities[b][0];
  return `<div class="tbl-wrap" tabindex="0" role="region" aria-label="${w.examples}"><table class="tbl seo-table"><thead><tr><th scope="col">${w.dateCol}</th><th scope="col">${cityName(a,lang)}</th><th scope="col">${cityName(b,lang)}</th></tr></thead><tbody>${rows.map(([ymd,h])=>{
    const result=wall(bz,az,ymd,h), source=wall(az,az,ymd,h);
    const date=new Intl.DateTimeFormat({en:'en-GB',pt:'pt-BR',es:'es'}[lang],{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(ymd+'T12:00:00Z'));
    return `<tr><th scope="row"><time datetime="${ymd}">${date}</time></th><td>${source.hm}</td><td>${result.hm}${result.day?` <span class="t">(${result.day>0?w.day:w.previous})</span>`:''}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}
const LOCALE = {en:'en-GB',pt:'pt-BR',es:'es'};
const fmtDate = (lang, ymd) => new Intl.DateTimeFormat(LOCALE[lang],{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(ymd+'T12:00:00Z'));
const utcLabel = (zone, date) => 'UTC'+(time.offsetMinutes(zone,date)?time.formatOffset(time.offsetMinutes(zone,date)):'');
// The days in 2026 when a zone's offset changes, from the same IANA data the app uses (sampled daily at 12:00 UTC,
// which lands every 2026 change on its local calendar day).
function changes(zone) {
  const out=[];let prev=time.offsetMinutes(zone,new Date(Date.UTC(2025,11,31,12)));
  for(let d=0;d<366;d++){const date=new Date(Date.UTC(2026,0,1+d,12)),o=time.offsetMinutes(zone,date);if(o!==prev)out.push(date.toISOString().slice(0,10));prev=o;}
  return out;
}
const cityOf = (row, lang) => row[{en:1,pt:2,es:3}[lang]];
function worldTable(lang) {
  const w=copy[lang],ref=new Date(REVIEW_DATE+'T12:00:00Z');
  return `<div class="tbl-wrap" tabindex="0" role="region" aria-label="${w.nowTable}"><table class="tbl seo-table live-table"><thead><tr>${w.cols.map(c=>`<th scope="col">${c}</th>`).join('')}</tr></thead><tbody>${worldCities.map(row=>{
    const zone=row[0],ch=changes(zone);
    return `<tr><th scope="row">${e(cityOf(row,lang))}</th><td><code>${zone}</code></td><td data-live-zone="${zone}" data-live="time">--:--</td><td data-live-zone="${zone}" data-live="offset">${utcLabel(zone,ref)}</td><td>${ch.length?ch.map(d=>`<time datetime="${d}">${fmtDate(lang,d)}</time>`).join(', '):w.noChange}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}
function utcTable(lang) {
  const w=copy[lang],days=['2026-01-15','2026-07-15'];
  return `<div class="tbl-wrap" tabindex="0" role="region" aria-label="${w.utcStampH}"><table class="tbl seo-table"><thead><tr><th scope="col">${w.cols[0]}</th>${days.map(d=>`<th scope="col"><code>${d}T14:00Z</code></th>`).join('')}</tr></thead><tbody>${worldCities.filter(r=>utcZones.includes(r[0])||['America/Sao_Paulo','Australia/Sydney','Europe/Paris'].includes(r[0])).map(row=>`<tr><th scope="row">${e(cityOf(row,lang))}</th>${days.map(ymd=>{
    const r=wall(row[0],'UTC',ymd,14),date=new Date(ymd+'T14:00:00Z');
    return `<td>${r.hm} <span class="t">${utcLabel(row[0],date)}${r.day?`, ${r.day>0?w.day:w.previous}`:''}</span></td>`;
  }).join('')}</tr>`).join('')}</tbody></table></div>`;
}
// The planner's rule on default hours (09:00 to 18:00 local, Monday to Friday), in 15-minute steps across the first
// city's day. Returns the longest block when every city works, else the largest number of cities working at once.
function overlap(zones, ymd) {
  const [y,m,d]=ymd.split('-').map(Number), start=time.zonedToEpoch(zones[0],y,m,d,0,0), slots=[];
  for(let i=0;i<96;i++){
    const at=new Date(start+i*900000);
    slots.push(zones.filter(z=>{const q=time.parts(z,at,{hourCycle:'h23',hour:'2-digit',weekday:'short'});return +q.hour>=9&&+q.hour<18&&!/Sat|Sun/.test(q.weekday);}).length);
  }
  const hm=i=>{const q=time.parts(zones[0],new Date(start+i*900000),{hourCycle:'h23',hour:'2-digit',minute:'2-digit'});return `${q.hour}:${q.minute}`;};
  let best=null;
  for(let i=0;i<96;i++) if(slots[i]===zones.length){let j=i;while(j<96&&slots[j]===zones.length)j++;if(!best||j-i>best[1]-best[0])best=[i,j];i=j;}
  if(!best) return {max:Math.max(...slots)};
  const mins=(best[1]-best[0])*15;
  return {from:hm(best[0]),to:best[1]===96?'24:00':hm(best[1]),h:`${Math.floor(mins/60)} h${mins%60?' '+mins%60+' min':''}`};
}
function plannerGuide(lang) {
  const w=copy[lang],p=prefix(lang),i={en:1,pt:2,es:3}[lang];
  const rows=plannerPresets.map(row=>{
    const zones=row[0],r=overlap(zones,PLAN_DATE),names=zones.map(z=>zoneName(z,lang)).join(', ');
    const result=r.from?w.overlap(r.h,r.from,r.to,zoneName(zones[0],lang)):w.none(r.max,zones.length);
    return `<tr><th scope="row"><a href="${p}meeting-planner#c=${zones.join(',')}">${e(row[i])}</a><br><span class="t">${e(names)}</span></th><td>${e(result)}</td></tr>`;
  }).join('');
  return section('presets',w.presetH,`<p>${w.presetIntro}</p><div class="tbl-wrap" tabindex="0" role="region" aria-label="${w.presetH}"><table class="tbl seo-table"><thead><tr><th scope="col">${w.presetCols[0]}</th><th scope="col">${w.presetCols[1]}</th></tr></thead><tbody>${rows}</tbody></table></div>`)
    +section('fair',w.fairH,`<ul class="steps">${w.fair.map(t=>`<li>${e(t)}</li>`).join('')}</ul>`)
    +section('questions',w.faqH,w.faq.map(([q,a])=>`<h3>${e(q)}</h3><p>${e(a)}</p>`).join(''));
}
function generate(lang,slug,title,heading,description,body,tool='',zones='') {
  const editorial = path.join(ROOT, 'cloudflare', 'editorial', lang, slug);
  let modified = REVIEW_DATE;
  let editorialSchema = [];
  if (fs.existsSync(editorial + '.json')) {
    const metadata = JSON.parse(fs.readFileSync(editorial + '.json', 'utf8'));
    title = metadata.title;
    description = metadata.description;
    modified = metadata.modified || REVIEW_DATE;
    editorialSchema = metadata.schema || [];
  }
  const w=copy[lang],p=prefix(lang),url=ORIGIN+p+slug,crumb={now:w.now,utc:w.utc}[tool]||title;
  let html=fs.readFileSync(file(lang,'meeting-planner'),'utf8');
  html=html.replace(/<title>.*?<\/title>/,`<title>${e(title)} | Open World Clock</title>`)
    .replace(/(<meta (?:name="description"|property="og:description"|name="twitter:description") content=")[^"]*"/g,`$1${e(description)}"`)
    .replace(/(<meta (?:property="og:title"|name="twitter:title") content=")[^"]*"/g,`$1${e(title)}"`)
    .replace(/<main[\s\S]*?<\/main>/,`<main id="main" class="pg"><section class="pg-hero" aria-labelledby="h1"><div class="wrap"><nav class="crumbs" aria-label="${w.home}"><ol><li><a href="${p}">${w.home}</a></li><li><span aria-current="page">${e(crumb)}</span></li></ol></nav><h1 id="h1">${e(heading)}</h1><p class="pg-lede">${e(description)}</p>${tool?toolHtml(lang,tool,zones):''}</div></section>${body}<section class="cta-band"><div class="wrap"><h2 class="pg-h2">${w.desktop}</h2><p class="pg-sub">${w.pinNote}</p><p class="more"><a class="btn btn-primary" href="${p}download">${w.windows}</a></p></div></section></main>`);
  if (fs.existsSync(editorial + '.html')) html = html.replace(/<main[\s\S]*?<\/main>/, fs.readFileSync(editorial + '.html', 'utf8').trim());
  const page = {'@type':'WebPage','@id':url+'#page',url,name:title,description,inLanguage:{en:'en',pt:'pt-BR',es:'es-419'}[lang],datePublished:REVIEW_DATE,dateModified:modified,isPartOf:{'@id':ORIGIN+p+'#website'},author:{'@type':'Person',name:'João Carvalho',url:'https://github.com/joaoCarvalho1000'}};
  const graph=[page,{'@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:w.home,item:ORIGIN+p},{'@type':'ListItem',position:2,name:title,item:url}]}];
  graph.push(...editorialSchema);
  if(tool) graph.push({'@type':'WebApplication','@id':url+'#tool',name:title,url,applicationCategory:'UtilitiesApplication',operatingSystem:'Web browser',isAccessibleForFree:true,offers:{'@type':'Offer',price:'0',priceCurrency:'USD'}});
  html=html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/,`<script type="application/ld+json">\n${JSON.stringify({'@context':'https://schema.org','@graph':graph},null,2)}\n</script>`);
  if(!tool) html=html.replace(/<script src="\/assets\/tool-page.js[^\"]*" defer><\/script>\n?/,'');
  html=applyChrome(html,lang,slug);
  fs.writeFileSync(file(lang,slug),html);
}
for(const lang of ['en','pt','es']) {
  const w=copy[lang],p=prefix(lang);
  for(const pair of pairs) {
    const [a,b]=pair,an=cityName(a,lang),bn=cityName(b,lang),slug=pairSlug(pair);
    const zones=[cities[a][0],cities[b][0]].join(',');
    const body=section('examples',w.examples,`<p>${w.date}</p>${table(lang,a,b,[9,12,15,18].map(h=>[REVIEW_DATE,h]))}`)
      +section('seasonal',w.season,`<p>${w.seasonIntro}</p>${table(lang,a,b,['2026-01-15','2026-03-20','2026-07-15','2026-10-28','2026-11-04'].map(d=>[d,9]))}<p class="seo-date">${w.calendar}</p><p class="seo-date">${w.source}</p>`)
      +section('related',w.related,links([[p+'meeting-planner#c='+zones,w.planner],[p+'daylight-saving-meetings',w.dstTitle],...pairs.filter(x=>x!==pair&&(x.includes(a)||x.includes(b))).slice(0,3).map(x=>[p+pairSlug(x),w.pairHead(...x.map(k=>cityName(k,lang)))]) ]));
    generate(lang,slug,w.pairTitle(an,bn),w.pairHead(an,bn),w.pairLead(an,bn),body,'converter',zones);
  }
  generate(lang,'world-time-now',w.nowTitle,w.nowHead,w.nowLead,
    section('cities',w.nowTable,`<p>${w.nowIntro}</p>${worldTable(lang)}<noscript><p class="seo-date">${w.liveWait}</p></noscript><p class="seo-date">${w.source}</p>`)
    +section('countries',w.nowCountryH,`<p>${w.nowCountry}</p>`)
    +section('related',w.related,links([[p+'meeting-planner#c='+nowZones,w.planner],[p+'utc-time',w.utcTitle],[p+'time-zone-converter',w.converter],[p+'world-map',w.map]])),'now',nowZones);
  generate(lang,'utc-time',w.utcTitle,w.utcHead,w.utcLead,
    section('stamps',w.utcStampH,`<p>${w.utcStamp}</p>${utcTable(lang)}<p class="seo-date">${w.source}</p>`)
    +section('what',w.utcWhatH,`<p>${w.utcWhat}</p>`)
    +section('gmt',w.utcGmtH,`<p>${w.utcGmt}</p>`)
    +section('sources',w.utcSources,links([['https://www.nist.gov/pml/time-and-frequency-division/time-realization/utc','NIST: UTC'],['https://www.iana.org/time-zones','IANA: Time Zone Database']]))
    +section('related',w.related,links([[p+'world-time-now',w.nowTitle],[p+'time-zone-converter',w.converter],[p+'meeting-planner',w.planner]])),'utc',utcZones);
  generate(lang,'daylight-saving-meetings',w.dstTitle,w.dst,w.dstLead,
    section('dates','2026',`<p>${w.dstBody}</p>${table(lang,'new-york','london',['2026-03-04','2026-03-20','2026-04-01','2026-10-21','2026-10-28','2026-11-04'].map(d=>[d,9]))}<p class="seo-date">${w.calendar}</p>`)
    +section('plan',w.dstLink,`<ol class="steps">${w.dstSteps.map(s=>`<li>${s}</li>`).join('')}</ol><p class="more"><a href="${p}meeting-planner#c=Europe/London,America/New_York">${w.dstLink}</a></p><p class="seo-date">${w.source}</p><p class="more"><a href="https://www.gov.uk/when-do-the-clocks-change">UK Government: clock changes</a></p><p class="more"><a href="https://www.nist.gov/pml/time-and-frequency-division/popular-links/daylight-saving-time-dst">NIST: daylight saving time</a></p>`));
  generate(lang,'always-on-top-world-clock',w.pinTitle,w.pin,w.pinLead,
    section('setup',w.windows,`<ol class="steps">${w.pinSteps.map(s=>`<li>${s}</li>`).join('')}</ol><p class="more"><a href="${p}download">${w.desktop}</a></p><p>${w.pinNote}</p>`)
    +section('preview',w.desktop,`<figure class="shot"><img src="/assets/img/strip-light.webp" width="1331" height="289" alt="${w.screenshot}" loading="lazy" decoding="async"></figure>`)
    +section('related',w.related,links([[p+'multiple-time-zones-windows',w.windows],[p+'time-zone-converter',w.converter],[p+'meeting-planner',w.planner]])));
  generate(lang,'press',w.pressTitle,w.press,w.pressLead,
    section('facts',w.facts,`<p>${w.factsBody}</p><p class="more"><a href="https://github.com/joaoCarvalho1000/open-world-clock">GitHub · MIT</a></p><p class="more"><a href="${p}privacy">${lang==='en'?'Privacy':lang==='pt'?'Privacidade':'Privacidad'}</a></p>`)
    +section('assets',w.assets,`<figure class="shot"><img src="/assets/img/strip-light.webp" width="1331" height="289" alt="${w.screenshot}" loading="lazy" decoding="async"></figure>`+links([['/assets/img/strip-light.webp','WebP: '+w.screenshot],['/assets/img/strip-dark.webp',lang==='en'?'Dark theme':lang==='pt'?'Tema escuro':'Tema oscuro'],['/assets/logo.svg','Logo · SVG'],['/assets/icon-512.png','Logo · PNG']]))
    +section('contact',w.pressContact,`<p class="more"><a href="${p}support">${w.support}</a></p>`));
  // Curated links on the tool pages give every new comparison an ordinary crawlable entry point.
  for(const slug of ['time-zone-converter','meeting-planner','world-map']) {
    const f=file(lang,slug);let html=fs.readFileSync(f,'utf8').replace(/<!-- seo-discovery -->[\s\S]*?<!-- \/seo-discovery -->\n?/g,'');
    const routes=slug==='time-zone-converter'?pairs.map(pair=>[p+pairSlug(pair),w.pairHead(...pair.map(k=>cityName(k,lang)))]):[[p+'world-time-now',w.nowTitle],[p+'utc-time',w.utcTitle],[p+'daylight-saving-meetings',w.dstTitle],[p+'always-on-top-world-clock',w.pinTitle]];
    const block='<!-- seo-discovery -->'+section('explore',slug==='time-zone-converter'?w.routes:w.guides,links(routes))+'<!-- /seo-discovery -->\n';
    html=html.replace(/<section class="cta-band"/,block+'<section class="cta-band"');
    html=html.replace(/<!-- planner-guide -->[\s\S]*?<!-- \/planner-guide -->\n?/g,'');
    if(slug==='meeting-planner') html=html.replace(/<section class="pg-sec" id="more"/,'<!-- planner-guide -->'+plannerGuide(lang)+'<!-- /planner-guide -->\n<section class="pg-sec" id="more"');
    html=html.replace(/<nav class="tool-nav"[\s\S]*?<\/nav>/,toolNav(lang,{'time-zone-converter':'converter','meeting-planner':'planner','world-map':'map'}[slug]));
    fs.writeFileSync(f,html);
  }
}
console.log('Built 45 curated pages and tool discovery links in three languages.');
