// T5: recorded local island journey and before/after evidence, without a live account.
import assert from 'node:assert/strict';
const phase = process.argv[2] ?? 'after';
import {mkdir} from 'node:fs/promises';
import {openWorldBrowser,settle} from './world-browser-tools.js';
const env=await openWorldBrowser({hmr:false});
try {
 const {page}=env;
 await page.goto(env.url+'/?islands=fake'); await page.locator('#play').click();
 for(let n=0;n<18;n++){
  await page.waitForFunction(()=>document.querySelector('dialog[open]')||window.__island?.world.current?.id==='home_islet');
  for(const label of ['Skip','Got it','Create a game','Start']) {
   const b=page.getByRole('button',{name:label,exact:true}); if(await b.isVisible()){await b.click();break;}
  }
  if(await page.evaluate(()=>window.__island?.island?.island&&!document.querySelector('dialog[open]')))break;
  await page.waitForTimeout(400);
 }
 await page.waitForFunction(()=>window.__island?.island?.island);
 await page.evaluate(async()=>{const i=window.__island.island;i.dev.setWaveBest(25);await i.load();i.ui.close();});
 for(let n=0;n<30;n++){await page.waitForTimeout(300);for(const label of ['Skip','Got it','Start']){const b=page.getByRole('button',{name:label,exact:true});if(await b.isVisible()){await b.click();break;}}}
 await page.evaluate(()=>window.__island.island.ui.close());await page.waitForTimeout(500);
 if(await page.locator('dialog[open]').count())throw new Error('Dialog still covers baseline');
 if(phase==='after'){
  const state=await page.evaluate(()=>{const p=window.__island.world.current;return {wave:p.group.getObjectByName('island-best-wave')?.userData.wave,statue:p.group.getObjectByName('island-wave-25')?.visible};});
  assert.deepEqual(state,{wave:25,statue:true});
 }
 await mkdir('../docs/evidence/t5',{recursive:true});
 for(const [width,height] of [[1280,720],[375,812]]){
  await page.setViewportSize({width,height});await settle(page);
  await page.screenshot({path:`../docs/evidence/t5/${phase}-${width}.png`});
 }
 console.log(`T5 ${phase}: captured 1280×720 and 375×812 at best wave 25.`);
 if(phase==='after'){
  for(const houses of [1,2]){
   const scale=await page.evaluate(async houses=>{
    const i=window.__island.island;i.dev.setCoins(500);await i.load();
    await i.build(`house_${houses}`,'house');i.ui.close();
    return window.__island.world.current.group.children.find(o=>o.userData.asset==='oak').scale.x;
   },houses);
   assert.equal(scale,houses===1?1.1:1.2);
   for(const [width,height] of [[1280,720],[375,812]]){
    await page.setViewportSize({width,height});await settle(page);
    await page.screenshot({path:`../docs/evidence/t5/after-${houses}-house-${width}.png`});
   }
  }
  console.log('T5 house builds: tree scale 1.1 with one house, 1.2 with two houses.');
  await page.route('**/t5-rank-preview',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'}));
  await page.goto(env.url+'/t5-rank-preview');
  await page.evaluate(async()=>{
   const {paint}=await import('/src/art/paint.js');
   const {drawWaveBadge,waveRank}=await import('/src/art/milestones.js');
   document.body.replaceChildren();
   document.body.style.cssText='margin:0;padding:24px;display:grid;grid-template-columns:repeat(6,1fr);gap:16px;background:#173d45;color:#fff2ce;font:18px sans-serif';
   for(const wave of [0,1,10,20,30,40,50,60,70,80,90,100]){
    const card=document.createElement('div');card.style.cssText='display:grid;justify-items:center;padding:12px;background:#24525a;border:2px solid #b89752;border-radius:12px';
    const canvas=paint(c=>drawWaveBadge(c,wave),[64,80],3);canvas.style.width='128px';canvas.style.height='160px';
    const label=document.createElement('span');label.textContent=waveRank(wave).name;
    card.append(canvas,label);document.body.append(card);
   }
  });
  await page.setViewportSize({width:1280,height:510});
  await page.screenshot({path:'../docs/evidence/t5/ranks.png'});
 }
} finally {await env.close();}
