// The real sound-caption view must share a fixed intro frame without hiding its story or footer.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
const root=new URL('..',import.meta.url).pathname;
const story=await readFile(new URL('../../backend/content/story.json',import.meta.url),'utf8');
const folder=process.env.INTRO_CAPTION_CAPTURES??'/tmp/intro-caption-checks';
await mkdir(folder,{recursive:true});
const server=await createServer({root,configFile:false,envDir:false,logLevel:'error',
  optimizeDeps:{noDiscovery:true,include:[]},server:{host:'127.0.0.1',port:0,hmr:false}});
await server.listen();const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/usr/bin/chromium',
  headless:true,args:['--disable-gpu','--disable-software-rasterizer']});
const cue='Paper rustles on the harbor bulletin board';
const report={checks:[],failures:[],views:[]};
const check=(okay,label)=>{report.checks.push(label);if(!okay)report.failures.push(label);};
const html=`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/src/ui/base.css"><link rel="stylesheet" href="/src/ui/kit/kit.css">
<link rel="stylesheet" href="/src/ui/intro.css"><link rel="stylesheet" href="/src/ui/shell.css">
<link rel="stylesheet" href="/src/ui/devices.css"><body style="background:#173c35">
<button id="open">Open story</button><script type="module" src="/fixture.js"></script></body></html>`;
const boot=`import {createIntro} from '/src/story/intro.js';
import {setPreferences} from '/src/settings/preferences.js';import createCaptionsView from '/src/audio/captions-view.js';
setPreferences({textSpeed:0});window.intro=createIntro({container:document.body,world:{busy:false,current:{id:'lighthouse_isle'}},on(){return()=>{}},emit(){}});
window.captions=createCaptionsView(document.body);document.querySelector('#open').onclick=()=>window.intro.begin(false);window.ready=true;`;

async function measure(page,width,stage){
  const metrics=await page.evaluate(()=>{
    const box=e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height};};
    const modal=document.querySelector('.intro-modal'),caption=modal.querySelector('.sound-caption');
    const text=modal.querySelector('.kit-dialogue-text'),copy=modal.querySelector('.kit-dialogue-copy');
    const journal=modal.querySelector('.intro-journal-body');
    return {frame:box(modal),caption:{...box(caption),hidden:caption.hidden,font:parseFloat(getComputedStyle(caption).fontSize)},
      header:box(modal.querySelector('.kit-modal-header')),body:box(modal.querySelector('.kit-modal-body')),
      footer:box(modal.querySelector('.intro-footer')),copy:box(copy),
      text:{...box(text),scroll:text.scrollHeight,client:text.clientHeight},
      journal:{...box(journal),scroll:journal.scrollHeight,client:journal.clientHeight}};
  });
  const within=box=>box.top>=metrics.frame.top&&box.bottom<=metrics.frame.bottom+1;
  check(!metrics.caption.hidden&&metrics.caption.font>=18&&within(metrics.caption),`${stage}: complete important caption stays visible at ${width}`);
  check(within(metrics.header)&&within(metrics.body)&&within(metrics.footer),`${stage}: header, body and footer stay inside the fixed frame at ${width}`);
  check(metrics.caption.bottom<=metrics.body.top+1&&metrics.header.bottom<=metrics.caption.top+1,`${stage}: caption has its own row at ${width}`);
  if(stage==='caption')check(metrics.text.scroll<=metrics.text.client+1&&metrics.text.top>=metrics.copy.top-1&&metrics.text.bottom<=metrics.copy.bottom+1,
    `The whole current passage remains visible with its caption at ${width}`);
  if(stage==='journal')check(metrics.journal.bottom<=metrics.footer.top-3,`Journal clears its footer with a caption at ${width}`);
  report.views.push({width,stage,metrics});
  await page.screenshot({path:`${folder}/${stage}-${width}.png`});return metrics;
}

async function open(viewport){
  const context=await browser.newContext({viewport,reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{
    const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();
    if(u.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:html});
    if(u.pathname==='/fixture.js')return route.fulfill({contentType:'text/javascript',body:boot});
    if(u.pathname==='/api/content/intro-story')return route.fulfill({contentType:'application/json',body:story});
    if(u.pathname.startsWith('/api/'))return route.abort();return route.continue();
  });
  await page.goto(origin+'/fixture');await page.waitForFunction(()=>window.ready);
  await page.locator('#open').click();await page.locator('.intro-view').waitFor();
  while(await page.locator('[data-choice="intro:next"]').count())await page.locator('[data-choice="intro:next"]').click();
  return {context,page,errors};
}

try{
  for(const viewport of [{width:320,height:400},{width:375,height:667},{width:844,height:390}]){
    const env=await open(viewport);const {page}=env;
    try{
      const height=await page.locator('.intro-modal').evaluate(e=>e.getBoundingClientRect().height);
      await page.evaluate(cue=>window.captions.show(cue),cue);const first=await measure(page,viewport.width,'caption');
      check(Math.abs(first.frame.height-height)<1,`Caption preserves the fixed frame at ${viewport.width}`);
      for(const choice of await page.locator('[data-choice]').all()){
        await choice.focus();await choice.scrollIntoViewIfNeeded();
        check(await choice.evaluate(e=>{const b=e.getBoundingClientRect(),copy=e.closest('.kit-dialogue-copy').getBoundingClientRect();return b.height>=44&&b.top>=copy.top-1&&b.bottom<=copy.bottom+1;}),
          `Every choice remains reachable with a 44px target at ${viewport.width}`);
      }
      await page.evaluate(cue=>window.captions.show(cue),cue);await measure(page,viewport.width,'choices-scrolled');
      await page.locator('.intro-journal>summary').click();await page.evaluate(cue=>window.captions.show(cue),cue);
      await measure(page,viewport.width,'journal');await page.locator('.intro-journal-body').focus();await page.keyboard.press('End');
      await page.waitForFunction(()=>{const e=document.querySelector('.intro-journal-body');return e.scrollTop>0||e.scrollHeight<=e.clientHeight;});
      check(await page.locator('.sound-caption').isVisible(),`Important caption survives keyboard journal scrolling at ${viewport.width}`);
      check(env.errors.length===0,`No browser errors at ${viewport.width}`);
    }finally{await env.context.close();}
  }
  assert.equal(report.failures.length,0,report.failures.join('\n'));
  console.log(JSON.stringify({checks:report.checks.length,folder},null,2));
}finally{await writeFile(`${folder}/report.json`,JSON.stringify(report,null,2));await browser.close();await server.close();}
