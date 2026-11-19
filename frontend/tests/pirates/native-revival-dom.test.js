// Native Captain prompt projected through the actual HUD; this is component evidence, not source acceptance.
import {it,expect} from 'vitest';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {browserHarness} from '../g20-browser.js';
const browser=browserHarness();
it('shows free native revival without a personal price or wallet balance on a phone',async()=>{
 await browser.withPage(async page=>{
  await page.setViewportSize({width:375,height:812});
  await page.evaluate(async()=>{
   await window.g20Import('/src/ui/base.css');await window.g20Import('/src/ui/kit/kit.css');await window.g20Import('/src/pirates/pirates.css');
   const {createCaptainActions}=await window.g20Import('/src/pirates/controller-captain.js');
   const {createWaveHud}=await window.g20Import('/src/pirates/hud.js');
   document.body.style.background='#162b31';document.body.style.color='#fff';document.body.style.fontFamily='sans-serif';
   const actions=createCaptainActions({}),current={info:{nativeShared:true},revive:{share:.5}};
   window.hud=createWaveHud({container:document.body});window.hud.pause(null);window.hud.health(null);window.hud.musket(null);window.hud.prompt(actions.revivePrompt(current),true,.5);
  });
  expect(await page.locator('.pirate-prompt').textContent()).toContain('free');expect(await page.locator('.pirate-prompt').textContent()).not.toContain('🪙');
  if(process.env.MP_ECO_EVIDENCE_DIR){await mkdir(process.env.MP_ECO_EVIDENCE_DIR,{recursive:true});await page.screenshot({path:join(process.env.MP_ECO_EVIDENCE_DIR,'free-revival-phone.png')});}
  await page.evaluate(()=>window.hud.dispose());
 });
});
