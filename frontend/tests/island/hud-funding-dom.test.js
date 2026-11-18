// The actual game funding adapter must survive unknown/shared/legacy account transitions. Used by browser regression tests.
import {expect,it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const evaluate=browserHarness();

it('keeps unknown shared funds closed, displays an authorized legacy actor and returns to exact shared funds',async()=>{
 const result=await evaluate(async()=>{
  const {createIsland}=await window.g20Import('/src/island/index.js');
  const {createHud}=await window.g20Import('/src/ui/hud.js');
  const {createIslandHudFunding}=await window.g20Import('/src/island/hud-funding.js');
  const {sharedFixture}=await window.g20Import('/tests/island/shared-core-fixture.js');
  const {personalReply}=await window.g20Import('/tests/island/economy-fixture.js');
  const {createFakeIslandTransport}=await window.g20Import('/src/pirates/fake-api.js');
  const {on,emit}=await window.g20Import('/src/core/events.js');
  const hud=createHud(document.body,{start(){},focus(){},menu(){},hasIsland:()=>false},{storage:null});hud.start();
  const onCoins=createIslandHudFunding(hud),text=()=>document.querySelector('.hud-coins').textContent;
  const base=createFakeIslandTransport();base.dev.setCoins(9000);base.dev.setWaveBest(9);
  const snapshot=sharedFixture();let generation=1,changed,shared=true;
  const transport={get:async path=>{
   if(path==='/api/captain')return shared?{ok:true,data:personalReply()}:{ok:false,status:409,code:'captain_not_initialized'};
   if(path==='/api/island'&&shared)return {ok:true,data:snapshot};
   const answer=await base.get(path);return path==='/api/island'&&answer.ok?{...answer,data:{...answer.data,code:'ISLE-FR3ND'}}:answer;
  },post:(path,body)=>base.post(path,body)};
  const island=createIsland({container:document.body,emit,on,mode:'fake',transport,storage:null,visitStorage:null,menu:()=>()=>{},settings:()=>()=>{},authGeneration:()=>generation,onAuthGenerationChange:listener=>{changed=listener;return()=>{};},onCoins});
  await island.load();const initial=text();
  generation=2;shared=false;changed();
  onCoins(77777,{});hud.setCaptain({account:{state:'signed_in'},captain:{coins:88888}});
  const unknown={text:text(),coins:hud.coins,own:island.island};
  await island.load();const legacy={text:text(),coins:hud.coins,code:island.island.code,ownCoins:island.island.coins};
  onCoins(9010,{legacyIsland:true});const laterLegacy={text:text(),coins:hud.coins};
  generation=3;shared=true;changed();await island.load();
  onCoins(99999,{});hud.setCoins(99999);
  const returned={text:text(),coins:hud.coins,available:island.island.economy.treasury.availableCoins};
  island.dispose();hud.dispose();return {initial,unknown,legacy,laterLegacy,returned};
 });
 expect(result.initial).toContain('Island treasury');expect(result.initial).toContain('9,007,199,254,741,000');
 expect(result.unknown.own).toBeNull();expect(result.unknown.coins).toBeNull();expect(result.unknown.text).toContain('Reload');
 expect(result.unknown.text).not.toMatch(/77,777|88,888/);
 expect(result.legacy).toMatchObject({coins:9000,code:'ISLE-FR3ND',ownCoins:9000});expect(result.legacy.text).toContain('9,000');expect(result.legacy.text).not.toContain('Island treasury');
 expect(result.laterLegacy.coins).toBe(9010);expect(result.returned.text).toContain('Island treasury');expect(result.returned.text).toContain('9,007,199,254,741,000');
 expect(result.returned.text).not.toContain('99,999');expect(result.returned.available).toBe('9007199254741000');
});
