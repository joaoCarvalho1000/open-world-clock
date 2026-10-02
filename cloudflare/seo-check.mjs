// Search deployment gate. --write-sitemap publishes only canonical HTML pages,
// with truthful modification dates and reciprocal language alternates.
import fs from 'node:fs';
import path from 'node:path';
import { PAGES, LANGS, TAG, ORIGIN, SITE_DIR, PREFIX, fileOf } from './site-chrome.mjs';
const url = (lang,slug) => ORIGIN+PREFIX[lang]+slug;
const attr = (tag,key) => (tag.match(new RegExp(`\\b${key}="([^"]*)"`))||[])[1];
const old = fs.readFileSync(path.join(SITE_DIR,'sitemap.xml'),'utf8');
const dates = new Map([...old.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(m=>[(m[1].match(/<loc>(.*?)<\/loc>/)||[])[1],(m[1].match(/<lastmod>(.*?)<\/lastmod>/)||[])[1]]));
const errors=[], pages=[], titles=new Set(), descriptions=new Set();
for(const lang of LANGS) for(const slug of PAGES.filter(s=>s!=='404')) {
  const file=fileOf(lang,slug),html=fs.readFileSync(file,'utf8'),canonical=url(lang,slug);
  const fail=message=>errors.push(`${canonical}: ${message}`);
  const title=(html.match(/<title>(.*?)<\/title>/)||[])[1];
  const description=attr((html.match(/<meta name="description"[^>]*>/)||[])[0]||'','content');
  if(!title||titles.has(title)) fail('missing or duplicate title'); titles.add(title);
  if(!description||descriptions.has(description)) fail('missing or duplicate description');descriptions.add(description);
  if((html.match(/<h1\b/g)||[]).length!==1) fail('expected one H1');
  if(attr((html.match(/<link rel="canonical"[^>]*>/)||[])[0]||'','href')!==canonical) fail('canonical mismatch');
  if(/<meta[^>]*name="robots"[^>]*content="[^"]*noindex/.test(html)) fail('public page is noindex');
  for(const other of LANGS) if(!html.includes(`hreflang="${TAG[other]}" href="${url(other,slug)}"`)) fail('missing language alternate '+other);
  let modified=dates.get(canonical);
  for(const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { const data=JSON.parse(m[1]);for(const node of data['@graph']||[data]) if(node.dateModified) modified=node.dateModified; }
    catch { fail('invalid JSON-LD'); }
  }
  if(modified && (!/^\d{4}-\d{2}-\d{2}$/.test(modified)||modified>new Date().toISOString().slice(0,10))) fail('invalid lastmod');
  for(const m of html.matchAll(/<(?:a|img|script|link)\b[^>]*>/g)) {
    const target=attr(m[0],/^<(?:img|script)/.test(m[0])?'src':'href');
    if(!target || !target.startsWith('/') || target.startsWith('//')) continue;
    const local=path.join(SITE_DIR,new URL(target,ORIGIN).pathname);
    if(![local,local+'.html',path.join(local,'index.html')].some(p=>fs.existsSync(p))) fail('missing local target '+target);
  }
  pages.push({lang,slug,canonical,modified});
}
const xml=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${pages.map(p=>`  <url>\n    <loc>${p.canonical}</loc>${p.modified?`\n    <lastmod>${p.modified}</lastmod>`:''}\n${[...LANGS,'x-default'].map(lang=>`    <xhtml:link rel="alternate" hreflang="${TAG[lang]||lang}" href="${url(lang==='x-default'?'en':lang,p.slug)}"/>`).join('\n')}\n  </url>`).join('\n')}\n</urlset>\n`;
if(process.argv.includes('--write-sitemap')&&!errors.length) fs.writeFileSync(path.join(SITE_DIR,'sitemap.xml'),xml);
else if(old.replace(/\r\n/g,'\n')!==xml) errors.push('sitemap differs; run node cloudflare/seo-check.mjs --write-sitemap');
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}
else console.log(`SEO: ${pages.length} canonical pages; titles, descriptions, H1, alternates, schema, links and sitemap OK.`);
