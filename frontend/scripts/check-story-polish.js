// Inspect the actual intro in a DOM-only browser; no WebGL world or live service is opened.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';

const root=fileURLToPath(new URL('..',import.meta.url));
const story=await readFile(new URL('../../backend/content/story.json',import.meta.url),'utf8');
const captures=process.env.STORY_POLISH_CAPTURES??'/tmp/story-polish-checks';
await mkdir(captures,{recursive:true});
const server=await createServer({root,configFile:false,envDir:false,logLevel:'error',
  optimizeDeps:{noDiscovery:true,include:[]},server:{host:'127.0.0.1',port:0,hmr:false}});
await server.listen();
const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/usr/bin/chromium',
  headless:true,args:['--disable-gpu','--disable-software-rasterizer']});
const report={source:'actual intro controller, public story and production styles; DOM-only fixture',checks:[],views:[]};
const check=(okay,label)=>{assert.ok(okay,label);report.checks.push(label);};
const html=`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/src/ui/base.css"><link rel="stylesheet" href="/src/ui/kit/kit.css">
<link rel="stylesheet" href="/src/ui/intro.css"><link rel="stylesheet" href="/src/ui/devices.css">
<body style="font-family:system-ui;background:radial-gradient(at 50% 25%,#648675,#133137);height:100dvh">
<div aria-hidden="true" style="position:fixed;bottom:12px;left:12px;right:12px;padding:16px;background:#142e37">Look at the writing desk.</div>
<button id="open">Open story</button><script type="module" src="/fixture.js"></script></body></html>`;
const bootstrap=`import {createIntro} from '/src/story/intro.js';
import {setPreferences} from '/src/settings/preferences.js';setPreferences({textSpeed:0});
window.setTextSpeed=value=>setPreferences({textSpeed:value});
window.intro=createIntro({container:document.body,world:{busy:false,current:{id:'lighthouse_isle'}},on(){return()=>{}},emit(){}});
document.querySelector('#open').onclick=()=>window.intro.begin(false);window.ready=true;`;

async function open(viewport,reducedMotion='reduce'){
  const context=await browser.newContext({viewport,reducedMotion}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
    if(url.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:html});
    if(url.pathname==='/fixture.js')return route.fulfill({contentType:'text/javascript',body:bootstrap});
    if(url.pathname==='/api/content/intro-story')return route.fulfill({contentType:'application/json',body:story});
    if(url.pathname.startsWith('/api/'))return route.abort();return route.continue();
  });
  await page.goto(origin+'/fixture');await page.waitForFunction(()=>window.ready);
  await page.locator('#open').click();await page.locator('.intro-view').waitFor();
  return {context,page,errors};
}

async function measure(page,label,viewport){
  await page.screenshot({path:`${captures}/${label}-${viewport.width}x${viewport.height}.png`});
  const metrics=await page.evaluate(()=>{
    const box=element=>{const b=element.getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height};};
    const modal=document.querySelector('.intro-modal'),copy=document.querySelector('.kit-dialogue-text');
    const footer=document.querySelector('.intro-footer'),journal=document.querySelector('.intro-journal-body');
    const controls=[...modal.querySelectorAll('button,summary')].filter(e=>e.getClientRects().length&&!e.closest('.intro-journal-body'));
    return {modal:box(modal),background:getComputedStyle(modal).backgroundColor,footer:box(footer),journal:box(journal),
      dialogueVisibility:getComputedStyle(document.querySelector('.kit-dialogue')).visibility,
      text:{height:copy.clientHeight,scroll:copy.scrollHeight},horizontal:document.documentElement.scrollWidth>innerWidth,
      controls:controls.map(e=>({label:e.textContent,...box(e)}))};
  });
  const {modal}=metrics;
  check(modal.x>=0&&modal.y>=0&&modal.right<=viewport.width&&modal.bottom<=viewport.height&&!metrics.horizontal,`${label} fits ${viewport.width}x${viewport.height}`);
  check(metrics.controls.every(c=>c.height>=44&&c.x>=modal.x&&c.right<=modal.right&&c.y>=modal.y&&c.bottom<=modal.bottom),`${label} controls stay visible and at least 44px at ${viewport.width}`);
  if(label!=='journal')check(metrics.text.scroll<=metrics.text.height+1,`${label} shows its complete current passage at ${viewport.width}x${viewport.height}`);
  report.views.push({label,viewport,metrics});return metrics;
}

async function journal(page,viewport){
  await page.locator('.intro-journal>summary').click();
  const metrics=await measure(page,'journal',viewport);
  check(metrics.journal.bottom<=metrics.footer.y-3,`Journal clears the footer at ${viewport.width}x${viewport.height}`);
  check(metrics.dialogueVisibility==='hidden',`Journal has no old passage controls underneath at ${viewport.width}`);
  await page.keyboard.press('Tab');await page.locator('.intro-journal-body').focus();
  check(await page.locator('.intro-journal-body').evaluate(e=>parseFloat(getComputedStyle(e).outlineWidth)>=2),`Journal keyboard focus remains visible at ${viewport.width}`);
  await page.keyboard.press('End');
  await page.waitForFunction(()=>{const e=document.querySelector('.intro-journal-body');return e.scrollTop>0||e.scrollHeight<=e.clientHeight;});
  check(await page.locator('.intro-journal-body').evaluate(e=>e.scrollTop>0||e.scrollHeight<=e.clientHeight),`Complete journal remains keyboard readable at ${viewport.width}`);
  await page.keyboard.press('Escape');
  check(await page.locator('.intro-modal').isVisible()&&await page.locator('.intro-journal').getAttribute('open')===null,`Journal Escape returns to the passage at ${viewport.width}`);
}

try{
  for(const viewport of [{width:320,height:568},{width:375,height:667},{width:844,height:390},{width:1280,height:720},{width:320,height:400}]){
    const env=await open(viewport);const {page}=env;
    try{
      const passage=await measure(page,'passage',viewport);
      check(!passage.background.startsWith('rgba('),`Story surface is opaque at ${viewport.width}`);
      const next=passage.controls.find(c=>c.label==='1. Continue');
      check(next&&passage.footer.y-next.bottom<=16,`Continue stays beside the footer at ${viewport.width}`);
      while(await page.locator('[data-choice="intro:next"]').count())await page.locator('[data-choice="intro:next"]').click();
      const choices=await measure(page,'choices',viewport);
      check(Math.abs(choices.modal.height-passage.modal.height)<1,`Outer passage and choices frame stays stable at ${viewport.width}`);
      check(choices.modal.height<=Math.min(viewport.width>600?330:420,viewport.height-16),`Compact story frame remains bounded at ${viewport.width}`);
      await journal(page,viewport);
      await page.locator('[data-choice="to_desk"]').click();
      while(await page.locator('[data-choice="intro:next"]').count())await page.locator('[data-choice="intro:next"]').click();
      const desk=await measure(page,'desk',viewport);
      check(Math.abs(desk.modal.height-passage.modal.height)<1,`Scene change keeps the fixed story frame at ${viewport.width}`);
      check(env.errors.length===0,`No browser errors at ${viewport.width}`);
    }finally{await env.context.close();}
  }
  const typed=await open({width:375,height:667},'no-preference');
  try{
    await typed.page.evaluate(()=>{window.setTextSpeed(1);window.intro.begin(false);});
    const reveal=typed.page.getByRole('button',{name:'Show full text',exact:true});
    await reveal.focus();await typed.page.keyboard.press('Enter');
    check(!await reveal.isVisible()&&(await typed.page.locator('.kit-dialogue-text').textContent()).length>50,'Show full text reveals the whole current passage');
    check((await typed.page.locator('.intro-page-count').textContent()).startsWith('1 / 2'),'Revealing full text never advances the passage');
  }finally{await typed.context.close();}
  console.log(JSON.stringify({checks:report.checks.length,captures},null,2));
}finally{await writeFile(`${captures}/report.json`,JSON.stringify(report,null,2));await browser.close();await server.close();}
