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
  for(const [route,mode] of (process.argv.includes('--functional-only') ? [] : [['time-zone-converter','converter'],['meeting-planner','planner'],['world-map','map'],['world-time-now','now'],['utc-time','utc']])) {
    for(const width of (mode==='planner'?[320,360,390,430,1440]:[390,1440])) for(const theme of ['light','dark']) {
      const context=await browser.createBrowserContext(),page=await context.newPage();const errors=[];
      page.on('pageerror',err=>errors.push(err.message));
      page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
      await page.setViewport({width,height:1000,isMobile:width<600,hasTouch:width<600});
      await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:theme},{name:'prefers-reduced-motion',value:'reduce'}]);
      await page.evaluateOnNewDocument(()=>{
        window.metrics={cls:0,lcp:0};
        new PerformanceObserver(list=>{for(const e of list.getEntries()) if(!e.hadRecentInput)window.metrics.cls+=e.value;}).observe({type:'layout-shift',buffered:true});
        new PerformanceObserver(list=>{for(const e of list.getEntries())window.metrics.lcp=e.startTime;}).observe({type:'largest-contentful-paint',buffered:true});
      });
      const plannerHash=mode==='planner'?'#c=Europe/London,America/New_York,Asia/Kolkata,Asia/Kathmandu&z=Europe/London':'';
      await page.goto(`${server.url}/${route}${plannerHash}`,{waitUntil:'networkidle0'});
      await page.waitForSelector('.tool-window.is-ready',{timeout:25000});
      const frame=await (await page.$('#heroApp')).contentFrame();
      if(mode==='planner'||mode==='map')await frame.waitForSelector(`#${mode==='planner'?'btnPlanner':'btnMap'}[aria-pressed="true"]`);
      if(mode==='planner'&&width<600) {
        const labels=await frame.$$eval('.plan-cell > span',els=>els.map(el=>({
          text:el.textContent,visible:el.checkVisibility(),width:el.getBoundingClientRect().width,
          cellWidth:el.parentElement.clientWidth,height:el.getBoundingClientRect().height,cellHeight:el.parentElement.clientHeight,
        })));
        assert(labels.length>=48&&labels.length%24===0,'all city-hour labels exist');
        assert(labels.every(x=>x.text&&x.visible&&x.width>0&&x.width<=x.cellWidth&&x.height<=x.cellHeight),`${width} ${theme}: hour labels remain visible and fit their cells`);
        assert(labels.some(x=>/:30|:45/.test(x.text)),'fractional time-zone labels covered');
        const atEnd=await frame.evaluate(()=>{
          const body=document.querySelector('.plan-body');body.scrollLeft=body.scrollWidth;
          const bounds=body.getBoundingClientRect(),label=document.querySelector('.plan-label').getBoundingClientRect();
          const last=document.querySelector('.plan-row .plan-cell:last-child').getBoundingClientRect();
          return {scroll:body.scrollLeft,labelLeft:label.left-body.getBoundingClientRect().left,
            lastVisible:last.left>=bounds.left-1&&last.right<=bounds.right+1,pageOverflow:document.documentElement.scrollWidth>innerWidth};
        });
        assert(atEnd.scroll>0&&Math.abs(atEnd.labelLeft)<1&&atEnd.lastVisible&&!atEnd.pageOverflow,`${width}: later hours reachable, city label stays visible, no page overflow`);
        await frame.$eval('.plan-body',el=>{el.scrollLeft=0;});
      }
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,route+' page overflow');
      assert.deepEqual(errors,[],route+' console');
      await page.screenshot({path:path.join(out,`${route}-${width}-${theme}.png`)});
      results.push({route,width,theme,...await page.evaluate(()=>window.metrics)});
      await context.close();
    }
  }
  // A real touch swipe pans all city rows without selecting a slot; tapping still converts.
  // Include both clock formats and localized day-period labels, plus half/quarter-hour zones.
  for(const [language,hour12] of [['en',true],['pt',false],['es',true]]) {
    const mobileContext=await browser.createBrowserContext(),mobile=await mobileContext.newPage();
    await mobile.setViewport({width:360,height:1000,isMobile:true,hasTouch:true});
    await mobile.evaluateOnNewDocument(value=>localStorage.setItem('owc-app-settings',JSON.stringify({hour12:value,firstRun:false})),hour12);
    const route=language==='en'?'meeting-planner':`${language}/meeting-planner`;
    await mobile.goto(`${server.url}/${route}#c=Europe/London,Asia/Kolkata,Asia/Kathmandu`,{waitUntil:'networkidle0'});
    await mobile.waitForSelector('.is-ready');
    const app=await(await mobile.$('#heroApp')).contentFrame();
    await app.waitForSelector('.plan-row');
    await mobile.$eval('.tool-window',el=>el.scrollIntoView({block:'center'}));
    assert.equal(await app.evaluate(()=>document.documentElement.lang.slice(0,2)),language);
    assert.equal(await app.$eval('.app',el=>el.classList.contains('h12')),hour12);
    const readable=await app.$$eval('.plan-cell > span',els=>els.every(el=>el.checkVisibility()&&el.getBoundingClientRect().width<=el.parentElement.clientWidth));
    assert(readable,`${language}: all localized hour labels fit`);
    const frameBox=await(await mobile.$('#heroApp')).boundingBox();
    const row=await app.$eval('.plan-cells',el=>{const r=el.getBoundingClientRect();return {y:r.top+r.height/2};});
    const y=Math.round(frameBox.y+row.y),x=Math.round(frameBox.x+frameBox.width-36);
    const client=await mobile.createCDPSession();
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let step=1;step<=8;step++) {
      await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-step*24,y}]});
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await app.waitForFunction(()=>document.querySelector('.plan-body').scrollLeft>80);
    assert.equal(await app.$eval('#convClear',el=>el.hidden),true,`${language}: a swipe does not convert`);
    assert.equal(await app.$eval('#planner',el=>el.classList.contains('has-sel')),false,`${language}: a swipe does not select a slot`);
    // Let the browser finish its fling before testing a separate tap.
    await app.evaluate(async()=>{
      const body=document.querySelector('.plan-body');let previous=body.scrollLeft,stable=0;
      for(let tick=0;tick<180;tick++) {
        await new Promise(resolve=>requestAnimationFrame(resolve));
        stable=body.scrollLeft===previous?stable+1:0;previous=body.scrollLeft;
        if(stable>=8)return;
      }
      throw new Error('Planner swipe did not settle');
    });
    await app.$eval('.plan-body',el=>{el.scrollLeft=360;});
    const cell=await app.$('.plan-row .plan-cell[data-h="9"]');
    await cell.tap();
    await app.waitForFunction(()=>!document.getElementById('convClear').hidden&&document.querySelector('.plan-cell[data-h="9"]').classList.contains('sel'));
    await mobileContext.close();
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
  // World time now: the preset cities in clock mode, the visitor's own converter zone, and live table cells.
  await page.goto(`${server.url}/world-time-now`,{waitUntil:'networkidle0'});await page.waitForSelector('.is-ready');
  const now=await(await page.$('#heroApp')).contentFrame();
  assert.equal(await now.$$eval('.card[data-zone]',nodes=>nodes.length),5);
  assert.equal(await now.$eval('#btnPlanner',el=>el.getAttribute('aria-pressed'))==='true',false);
  assert.notEqual(await now.$eval('#convZone',el=>el.value),'America/Los_Angeles');
  const cells=await page.$$eval('[data-live-zone]',els=>els.map(el=>el.textContent));
  assert.equal(cells.length,34);assert(cells.every(t=>t&&t!=='--:--'),'live cells filled');
  assert.match(await page.$eval('[data-live-zone="Asia/Kolkata"][data-live="offset"]',el=>el.textContent),/^UTC\+5:30$/);
  // UTC: converting from UTC, so 14:00 UTC on a winter date reads 09:00 in New York.
  await page.goto(`${server.url}/es/utc-time`,{waitUntil:'networkidle0'});await page.waitForSelector('.is-ready');
  const utc=await(await page.$('#heroApp')).contentFrame();
  assert.equal(await utc.$eval('#convZone',el=>el.value),'UTC');
  await page.goto(`${server.url}/utc-time#c=UTC,America/New_York&t=2026-01-15T14:00&z=UTC`,{waitUntil:'networkidle0'});await page.waitForSelector('.is-ready');
  const winter=await(await page.$('#heroApp')).contentFrame();
  assert.match(await winter.$eval('[data-zone="America/New_York"]',el=>el.textContent),/9:00|09:00/);
  // A team preset further down the planner page opens those cities in the app and brings the tool into view.
  await page.goto(`${server.url}/meeting-planner`,{waitUntil:'networkidle0'});await page.waitForSelector('.is-ready');
  await page.$eval('#presets a[href*="Asia/Kolkata"][href*="Los_Angeles"]',a=>a.click());
  const preset=await(await page.$('#heroApp')).contentFrame();
  await preset.waitForFunction(()=>document.querySelectorAll('.plan-row').length===2);
  await page.waitForFunction(()=>Math.abs(document.querySelector('.tool-window').getBoundingClientRect().top)<120);
  // Optional accessibility pass on the search pages when axe-core sits next to puppeteer-core.
  const axePath=process.env.PUPPETEER_CORE&&path.resolve(process.env.PUPPETEER_CORE,'node_modules/axe-core/axe.min.js');
  if(axePath&&fs.existsSync(axePath)) await page.setBypassCSP(true);
  if(axePath&&fs.existsSync(axePath)) for(const route of ['meeting-planner','time-zone-converter','world-time-now','utc-time','pt/meeting-planner','es/utc-time']) {
    await page.goto(`${server.url}/${route}`,{waitUntil:'networkidle0'});await page.waitForSelector('.is-ready');
    await page.addScriptTag({path:axePath});
    const violations=await page.evaluate(async()=>(await axe.run(document,{runOnly:['wcag2a','wcag2aa'],exclude:[['#heroApp']]})).violations.map(v=>`${v.id}: ${v.nodes.map(n=>n.target.join(' ')).slice(0,3).join(', ')}`));
    assert.deepEqual(violations,[],route+' axe');
  }
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
