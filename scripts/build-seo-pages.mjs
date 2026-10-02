// Rebuild the curated search pages with the existing site chrome and app time-zone engine.
// No combinatorial routes, runtime API, or separate conversion algorithm.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { cities, pairs, pairSlug, copy, prefix, cityName, toolHtml, escapeHtml as e, REVIEW_DATE } from '../cloudflare/seo-content.mjs';
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
function generate(lang,slug,title,heading,description,body,tool='',zones='') {
  const w=copy[lang],p=prefix(lang),url=ORIGIN+p+slug;
  let html=fs.readFileSync(file(lang,'meeting-planner'),'utf8');
  html=html.replace(/<title>.*?<\/title>/,`<title>${e(title)} | Open World Clock</title>`)
    .replace(/(<meta (?:name="description"|property="og:description"|name="twitter:description") content=")[^"]*"/g,`$1${e(description)}"`)
    .replace(/(<meta (?:property="og:title"|name="twitter:title") content=")[^"]*"/g,`$1${e(title)}"`)
    .replace(/<main[\s\S]*?<\/main>/,`<main id="main" class="pg"><section class="pg-hero" aria-labelledby="h1"><div class="wrap"><nav class="crumbs" aria-label="${w.home}"><ol><li><a href="${p}">${w.home}</a></li><li><span aria-current="page">${e(title)}</span></li></ol></nav><h1 id="h1">${e(heading)}</h1><p class="pg-lede">${e(description)}</p>${tool?toolHtml(lang,tool,zones):''}</div></section>${body}<section class="cta-band"><div class="wrap"><h2 class="pg-h2">${w.desktop}</h2><p class="pg-sub">${w.pinNote}</p><p class="more"><a class="btn btn-primary" href="${p}download">${w.windows}</a></p></div></section></main>`);
  const page = {'@type':'WebPage','@id':url+'#page',url,name:title,description,inLanguage:{en:'en',pt:'pt-BR',es:'es-419'}[lang],datePublished:REVIEW_DATE,dateModified:REVIEW_DATE,isPartOf:{'@id':ORIGIN+p+'#website'},author:{'@type':'Person',name:'João Carvalho',url:'https://github.com/joaoCarvalho1000'}};
  const graph=[page,{'@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:w.home,item:ORIGIN+p},{'@type':'ListItem',position:2,name:title,item:url}]}];
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
    const routes=slug==='time-zone-converter'?pairs.map(pair=>[p+pairSlug(pair),w.pairHead(...pair.map(k=>cityName(k,lang)))]):[[p+'daylight-saving-meetings',w.dstTitle],[p+'always-on-top-world-clock',w.pinTitle],[p+'time-zone-converter',w.converter]];
    const block='<!-- seo-discovery -->'+section('explore',slug==='time-zone-converter'?w.routes:w.guides,links(routes))+'<!-- /seo-discovery -->\n';
    html=html.replace(/<section class="cta-band"/,block+'<section class="cta-band"');fs.writeFileSync(f,html);
  }
}
console.log('Built 39 curated pages and tool discovery links in three languages.');
