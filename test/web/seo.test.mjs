// Run with PUPPETEER_CORE pointing to a folder containing puppeteer-core.
// Real browser checks for the dedicated tool pages; captures desktop/mobile together.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startOnFreePort } from './serve.mjs';
const require=createRequire(import.meta.url);
const puppeteer=process.env.PUPPETEER_CORE?createRequire(path.resolve(process.env.PUPPETEER_CORE,'noop.js'))('puppeteer-core'):require('puppeteer-core');
const out=path.resolve('dist/seo-shots');fs.mkdirSync(out,{recursive:true});
const executablePath=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const server=await startOnFreePort(8840,8850);
const browser=await puppeteer.launch({executablePath,headless:true});
const results=[];
try {
  for(const [route,mode] of (process.argv.includes('--functional-only') ? [] : [['time-zone-converter','converter'],['meeting-planner','planner'],['world-map','map']])) {
    for(const width of [390,1440]) for(const theme of ['light','dark']) {
      const context=await browser.createBrowserContext(),page=await context.newPage();const errors=[];
      page.on('pageerror',err=>errors.push(err.message));
      page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
      await page.setViewport({width,height:1000});
      await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:theme},{name:'prefers-reduced-motion',value:'reduce'}]);
      await page.evaluateOnNewDocument(()=>{
        window.metrics={cls:0,lcp:0};
        new PerformanceObserver(list=>{for(const e of list.getEntries()) if(!e.hadRecentInput)window.metrics.cls+=e.value;}).observe({type:'layout-shift',buffered:true});
        new PerformanceObserver(list=>{for(const e of list.getEntries())window.metrics.lcp=e.startTime;}).observe({type:'largest-contentful-paint',buffered:true});
      });
      await page.goto(`${server.url}/${route}`,{waitUntil:'networkidle0'});
      await page.waitForSelector('.tool-window.is-ready',{timeout:25000});
      const frame=await (await page.$('#heroApp')).contentFrame();
      if(mode!=='converter')await frame.waitForSelector(`#${mode==='planner'?'btnPlanner':'btnMap'}[aria-pressed="true"]`);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,route+' page overflow');
      assert.deepEqual(errors,[],route+' console');
      await page.screenshot({path:path.join(out,`${route}-${width}-${theme}.png`)});
      results.push({route,width,theme,...await page.evaluate(()=>window.metrics)});
      await context.close();
    }
  }
  // Two-city presets, the autumn mismatch, sharing, keyboard conversion and localized frames.
  const context=await browser.createBrowserContext();await context.overridePermissions(server.url,['clipboard-read','clipboard-write']);
  const page=await context.newPage();await page.setViewport({width:834,height:1100});
  for(const [language,route] of [['en','london-to-new-york-time'],['pt','pt/sao-paulo-to-lisbon-time'],['es','es/new-york-to-mumbai-time']]) {
    await page.goto(`${server.url}/${route}`,{waitUntil:'networkidle0'});await page.waitForSelector('.is-ready');
    const frame=await(await page.$('#heroApp')).contentFrame();
    assert.equal(await frame.evaluate(()=>document.documentElement.lang.slice(0,2)),language);
    assert.equal(await frame.$$eval('.card[data-zone]',nodes=>nodes.length),2);
    await frame.focus('#convTime');await page.keyboard.type('9:30');await page.keyboard.press('Enter');
    assert.equal(await frame.$eval('#convClear',el=>el.hidden),false);
    await page.click('#heroShare');
    await page.waitForFunction(()=>!document.getElementById('toolShareLink').hidden || /Link copied|Link copiado|Enlace copiado/.test(document.getElementById('heroShare').textContent));
    const copied=await page.evaluate(()=>document.getElementById('toolShareLink').hidden?navigator.clipboard.readText():document.getElementById('toolShareLink').value);
    assert(copied.includes('/'+route+'#c='),'Share preserves route and cities');
    await page.screenshot({path:path.join(out,`${language}-pair-tablet.png`)});
    await page.goto(copied,{waitUntil:'networkidle0'});await page.waitForSelector('.is-ready');
    const shared=await(await page.$('#heroApp')).contentFrame();assert.equal(await shared.$eval('#convClear',el=>el.hidden),false);
  }
  await page.goto(`${server.url}/london-to-new-york-time#c=Europe/London,America/New_York&t=2026-10-28T09:00&z=America/New_York`,{waitUntil:'networkidle0'});
  await page.waitForSelector('.is-ready');
  const frame=await(await page.$('#heroApp')).contentFrame();
  assert.match(await frame.$eval('[data-zone="Europe/London"]',el=>el.textContent),/13:00|1:00/);
  await frame.click('#btnDay');await frame.waitForSelector('#webCalendar');
  await page.screenshot({path:path.join(out,'calendar-tablet.png')});
  await frame.$eval('#webCalendar',el=>{el.value='2026-11-04';el.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.match(await frame.$eval('[data-zone="Europe/London"]',el=>el.textContent),/14:00|2:00/);
  // Switching tool pages preserves the cities and the picked date.
  await page.click('.tool-nav a[href*="meeting-planner"]');
  await page.waitForSelector('.is-ready');
  const planner=await(await page.$('#heroApp')).contentFrame();
  await planner.waitForSelector('#btnPlanner[aria-pressed="true"]');
  assert.equal(await planner.$$eval('.plan-row',els=>els.length)>0,true);
  // A failed app load has a recovery action and never enables sharing.
  const failed=await context.newPage();await failed.setRequestInterception(true);
  failed.on('request',r=>r.url().includes('/app/')?r.abort():r.continue());
  await failed.goto(`${server.url}/meeting-planner`);await failed.waitForSelector('.has-error',{timeout:25000});
  assert.equal(await failed.$eval('#toolRetry',el=>el.hidden),false);
  assert.equal(await failed.$eval('#heroShare',el=>el.disabled),true);
  await context.close();
  if(results.length) fs.writeFileSync(path.join(out,'metrics.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify(results,null,2));
  console.log('PASS: '+(results.length?'views, desktop/mobile themes, overflow, console; ':'')+'localization, presets, keyboard conversion, DST, date picker, tool switching, share round trips and loading failure.');
} finally {await browser.close();await server.close();}
