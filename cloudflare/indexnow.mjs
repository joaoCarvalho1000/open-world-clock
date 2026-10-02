// Dry run by default. The postdeploy hook submits only after the public key is reachable.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const SITE=path.resolve(ROOT,'../site');
const ORIGIN='https://openworldclock.com';
const key=fs.readFileSync(path.join(ROOT,'indexnow-key.txt'),'utf8').trim();
if(!/^[a-f0-9]{32}$/.test(key)) throw new Error('Invalid IndexNow verification key');
const stateFile=path.join(ROOT,'.wrangler/seo-indexnow-state.json');
const previous=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):{};
const current={};
const urls=[...fs.readFileSync(path.join(SITE,'sitemap.xml'),'utf8').matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]);
for(const url of urls) {
  const u=new URL(url);if(u.origin!==ORIGIN) throw new Error('Unexpected sitemap host');
  const route=u.pathname.endsWith('/')?u.pathname+'index.html':u.pathname+'.html';
  current[url]=createHash('sha256').update(fs.readFileSync(path.join(SITE,route))).digest('hex');
}
const changed=Object.keys(current).filter(url=>current[url]!==previous[url]);
const deleted=Object.keys(previous).filter(url=>!(url in current));
const urlList=[...changed,...deleted];
console.log(`IndexNow: ${changed.length} changed/new, ${deleted.length} deleted URLs.`);
if(!process.argv.includes('--submit')) {
  console.log('Dry run. Use --submit after deployment; no request sent.');
} else if(urlList.length) {
  const keyLocation=ORIGIN+'/'+key+'.txt';
  const verification=await fetch(keyLocation,{signal:AbortSignal.timeout(15000)});
  if(!verification.ok||(await verification.text()).trim()!==key) throw new Error('Deployment must expose the correct verification file before notification.');
  const response=await fetch('https://api.indexnow.org/indexnow',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host:new URL(ORIGIN).host,key,keyLocation,urlList}),signal:AbortSignal.timeout(20000)});
  if(response.status===202) {
    console.log('IndexNow accepted the URLs; key validation is pending. Deployment succeeded. Rerun this hook later to confirm; the local manifest is unchanged.');
    process.exit(0);
  }
  if(response.status!==200) throw new Error(`IndexNow returned ${response.status}; notification failed. Deployment is unchanged; rerun this hook later.`);
  fs.mkdirSync(path.dirname(stateFile),{recursive:true});fs.writeFileSync(stateFile,JSON.stringify(current,null,2)+'\n');
  console.log('IndexNow received the URLs. Indexing is not guaranteed.');
}
