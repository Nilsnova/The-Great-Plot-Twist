// Real-browser proof of the steady case frame and server-authoritative light controls.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {openWorldBrowser} from './world-browser-tools.js';
const env=await openWorldBrowser({hmr:false}),{page}=env,out=process.env.CASE_REDESIGN_CAPTURE_DIR??'captures/case-redesign';
await mkdir(out,{recursive:true});const report={checked:new Date().toISOString(),checks:[],viewports:[]};
const check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};
const bounds=()=>page.locator('.case-modal[open]').evaluate(el=>{const r=el.getBoundingClientRect();return{width:r.width,height:r.height};});
const stable=(a,b)=>Math.abs(a.width-b.width)<1&&Math.abs(a.height-b.height)<1;
async function prepare(){await page.goto(env.url+'/case-lab.html?demo=1');await page.waitForFunction(()=>window.__caseLab);await page.evaluate(async()=>{const {adapter:a,screens}=window.__caseLab;await a.createCrew();await a.muster();a.dev.give('C1',1);a.dev.give('C2',2);await a.pin('C1');a.dev.pinForSeat('C2',2);await a.pair('C1','C2');await screens.open('finale');});}
async function night(){await page.evaluate(async()=>{const {adapter:a}=window.__caseLab;await a.buildLight('islet_signal_station');await a.callNightfall();await a.orderPartner(2,'man_light','keepers_lamp');await a.orderPartner(3,'man_light','harbor_light');await a.takePost('islet_signal_station');a.dev.advance(600);});}
try{
 for(const viewport of [{width:1280,height:720},{width:375,height:667},{width:320,height:568},{width:844,height:390}]){
  await page.setViewportSize(viewport);await prepare();const waiting=await bounds();
  check(await page.locator('.case-page-picker option').count()===10,`${viewport.width}: all ten pages remain reachable through one picker`);
  check(await page.locator('.case-light:not([hidden])').count()===1,`${viewport.width}: one light's controls are visible`);
  check(await page.locator('.case-compass').first().evaluate(c=>c.width===360&&c.height===360),`${viewport.width}: detailed 360px compass`);
  check(await page.locator('.case-bearing-chart canvas').evaluate(c=>c.width===896&&c.height===512),`${viewport.width}: detailed 896px chart`);
  await page.screenshot({path:`${out}/waiting-${viewport.width}.png`});
  await night();check(stable(waiting,await bounds()),`${viewport.width}: nightfall preserves frame size`);
  for(const id of ['keepers_lamp','harbor_light','islet_signal_station','ruin_light']){await page.locator(`[data-focus="light-tab-${id}"]`).click();check(await page.locator(`.case-light[data-light="${id}"]`).isVisible(),`${viewport.width}: ${id} selectable`);}
  await page.locator('[data-focus="light-tab-islet_signal_station"]').click();const range=page.locator('[data-focus="bearing-islet_signal_station"]');
  const compass=page.locator('.case-light:not([hidden]) .case-compass');await compass.scrollIntoViewIfNeeded();const dialBox=await compass.boundingBox();await page.mouse.click(dialBox.x+dialBox.width/2-.1,dialBox.y+1);
  check(await range.inputValue()==='0',`${viewport.width}: near-north pointer rounding stays in the valid 0–359 range`);
  await range.evaluate(el=>{el.value='180';el.dispatchEvent(new Event('input',{bubbles:true}));});await page.locator('[data-focus="lock-islet_signal_station"]').click();
  check(await page.evaluate(()=>!window.__caseLab.adapter.read().finale.lights.find(l=>l.id==='islet_signal_station').lock),`${viewport.width}: incorrect bearing never invents a lock`);
  check(await range.inputValue()==='180',`${viewport.width}: refusal preserves angle`);await page.evaluate(()=>window.__caseLab.adapter.dev.advance(5));await range.focus();await page.keyboard.press('ArrowRight');check(await range.inputValue()==='181',`${viewport.width}: native keyboard slider works`);
  await page.locator('.case-screen-content').evaluate(el=>el.scrollTop=0);await page.screenshot({path:`${out}/night-${viewport.width}.png`});
  await page.evaluate(()=>window.__caseLab.adapter.dev.advance(1200));check(stable(waiting,await bounds()),`${viewport.width}: dawn preserves frame size`);
  for(const screen of ['crew','board','search','partners','finale','accusation','reveal','relighting','rewards','log','hints']){
   await page.evaluate(screen=>window.__caseLab.screens.open(screen),screen);check(stable(waiting,await bounds()),`${viewport.width}: ${screen} preserves frame size`);
   check(await page.locator('.case-modal[open]').evaluate(el=>el.scrollWidth<=el.clientWidth+1&&[...el.querySelectorAll('.case-screen-content')].every(c=>c.scrollWidth<=c.clientWidth+1)),`${viewport.width}: ${screen} has no horizontal overflow`);
  }
  await page.evaluate(()=>window.__caseLab.screens.open('finale'));await page.locator('.case-screen-content').evaluate(el=>el.scrollTop=0);await page.screenshot({path:`${out}/dawn-${viewport.width}.png`});report.viewports.push({viewport,frame:waiting});
 }
 await page.setViewportSize({width:1280,height:720});await prepare();await night();const beforeSuccess=await bounds();
 await page.evaluate(async()=>{const {adapter:a}=window.__caseLab;const {lightLocations,rehearsalGlow}=await import('/src/adapter/fake/night.js'),{bearingBetween}=await import('/src/screens/beam-math.js');for(const light of lightLocations.slice(0,3))await a.aim(light.id,bearingBetween(light,rehearsalGlow));});
 check(stable(beforeSuccess,await bounds()),'Success preserves frame size');check(await page.getByRole('button',{name:'Board the schooner',exact:true}).isVisible(),'Only accepted success exposes the schooner action');await page.screenshot({path:out+'/night-success.png'});
 await page.evaluate(async()=>{window.__caseLab.screens.dispose();const {createUnavailableCaseAdapter}=await import('/src/adapter/unavailable.js'),{createCaseScreens}=await import('/src/screens/controller.js');window.__emptyScreens=createCaseScreens({container:document.body,adapter:createUnavailableCaseAdapter()});await window.__emptyScreens.open('finale');});
 check(await page.locator('.case-night-clock').count()===0,'Disconnected lights show no pretend clock');check(await page.getByRole('button',{name:'Open crew',exact:true}).isVisible(),'Disconnected lights offer one crew action');check(await page.locator('.case-compass').count()===0,'Disconnected lights show no unusable compass');await page.screenshot({path:out+'/night-disconnected.png'});
 check(!env.errors.length,'No browser errors');check(!env.external.length,'No external requests');console.log(JSON.stringify(report,null,2));
}finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await env.close();}
