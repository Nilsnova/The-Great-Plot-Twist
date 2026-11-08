// Rehearses the complete timed tour with every API unavailable, then skips/cancels it.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openWorldBrowser,measure} from './world-browser-tools.js';
const fast=process.env.DEMO_FAST==='1';
const publicReads=new Set(['/api/config','/api/weather']);
const env=await openWorldBrowser(),{page}=env,report={checked:new Date().toISOString(),checks:[],requests:[]};
const check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};
try {
  await page.unroute('**/api/weather');await page.route('**/api/**',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"offline rehearsal"}'}));
  page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/'))report.requests.push({path:new URL(request.url()).pathname,method:request.method(),authorized:!!request.headers().authorization});});
  await page.addInitScript(()=>{const journal='{"version":1,"actions":["to_desk"]}';localStorage.setItem('plot_twist_intro_moves_v1',journal);window.__journalBefore=journal;window.__journalWrites=0;const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='plot_twist_intro_moves_v1')window.__journalWrites++;return original.call(this,key,value);};});
  await page.goto(env.url+'/?demo=1');await page.getByRole('button',{name:'Highlights tour',exact:true}).click();await page.waitForFunction(()=>window.__island?.demo.active);
  await page.evaluate(()=>{window.__tourSteps=[];window.__introEnded=[];window.__island.on('intro_ended',event=>window.__introEnded.push(event));const panel=document.querySelector('.presenter-panel'),record=()=>{if(!window.__island.demo.active)return;const title=panel.querySelector('.kit-heading').textContent;if(window.__tourSteps.at(-1)!==title)window.__tourSteps.push(title);};record();new MutationObserver(record).observe(panel.querySelector('.kit-heading'),{childList:true,subtree:true,characterData:true});});
  check(await page.locator('.intro-modal[open] .intro-view').isVisible(),'Bundled original intro slice opens while the API returns 503');
  if(fast){report.timedRunSkipped=true;await page.evaluate(()=>window.__island.demo.stop());}
  else {
  const start=Date.now();await page.waitForFunction(()=>!window.__island.demo.active,{},{timeout:210000});report.durationMs=Date.now()-start;
  report.steps=await page.evaluate(()=>window.__tourSteps);check(report.durationMs>=120000&&report.durationMs<=210000,'Automatic highlights finish within the 3.5-minute class limit');
  check(report.steps.length===9&&report.steps.some(title=>title.includes('signal station'))&&report.steps.some(title=>title.includes('Three Lights')),'Timed tour reaches intro, arrival, islet build, sailing, Harbor, board, weather, lights and Relighting');
  check(await page.evaluate(()=>window.__journalWrites===0&&localStorage.getItem('plot_twist_intro_moves_v1')===window.__journalBefore&&window.__introEnded.length===0),'The entire rehearsal preserves the player journal and emits no intro completion');
  check(report.requests.every(request=>request.method==='GET'&&publicReads.has(request.path)&&!request.authorized),'Only anonymous best-effort config and weather GETs are attempted; no backend writes or intro API dependency');
  check(await page.evaluate(()=>window.__island.world.current.id==='lighthouse_isle'&&!window.__island.world.relit),'Tour restores the departure place and does not unlock Relighting');report.after=await measure(page);await page.screenshot({path:'captures/20261105_G5-Demo-Finished.png'});
  }
  await page.getByRole('button',{name:'Start highlights tour',exact:true}).click();
  report.skipTimesMs=[];for(let i=0;i<9;i++){const skipStart=Date.now();const step=await page.evaluate(()=>window.__island.demo.step);await page.keyboard.press('Space');await page.waitForFunction(step=>!window.__island.demo.active||(!window.__island.demo.changing&&window.__island.demo.step!==step),step);report.skipTimesMs.push(Date.now()-skipStart);}
  await page.waitForFunction(()=>!window.__island.demo.active);check(report.skipTimesMs.every(ms=>ms<2000),'One large key promptly skips every tour step, including a pending cinematic');
  await page.getByRole('button',{name:'Start highlights tour',exact:true}).click();await page.keyboard.press('Space');await page.waitForFunction(()=>window.__island.demo.step==='arrival'&&!window.__island.demo.changing);await page.keyboard.press('Space');
  await page.locator('.sailing[open]').waitFor();const stopStart=Date.now();await page.evaluate(()=>Promise.all([window.__island.demo.stop(),window.__island.demo.stop()]));report.stopDuringPassageMs=Date.now()-stopStart;
  check(await page.evaluate(()=>!window.__island.demo.active&&!window.__island.world.busy&&window.__island.world.current.id==='lighthouse_isle'),'Repeated End during a passage settles once and restores the island');
  check(await page.evaluate(()=>window.__journalWrites===0&&window.__introEnded.length===0),'Skipping and cancelling also preserve player progress');
  report.expectedOfflineErrors=env.errors.filter(message=>message.includes('503'));check(env.errors.every(message=>message.includes('503'))&&env.external.length===0,'Only expected 503 diagnostics occur; no JavaScript/WebGL errors or external assets');console.log(JSON.stringify(report,null,2));
} finally {await writeFile(fast?'captures/20261105_G5-Demo-Skip-Checks.json':'captures/20261105_G5-Demo-Checks.json',JSON.stringify(report,null,2));await env.close();}
