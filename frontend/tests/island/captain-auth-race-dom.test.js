// Personal UI applications need their own auth fence after promise continuations. Used by island regression tests.
import {expect,it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const evaluate=browserHarness();

it('handles insufficient legacy Captain funds without throwing or changing the island',async()=>{
 const result=await evaluate(async()=>{
  const {createIsland}=await window.g20Import('/src/island/index.js');
  const {createFakeIslandTransport}=await window.g20Import('/src/pirates/fake-api.js');
  const {on,emit}=await window.g20Import('/src/core/events.js');
  const transport=createFakeIslandTransport();transport.dev.setCoins(0);transport.dev.setWaveBest(9);
  const island=createIsland({container:document.body,emit,on,mode:'fake',transport,storage:null,visitStorage:null,menu:()=>()=>{},settings:()=>()=>{}});
  await island.load();island.openCaptain();let failure=null;
  try{await island.upgradeCaptain();}catch(error){failure=`${error.name}: ${error.message}`;}
  const result={failure,coins:island.island.coins,level:island.island.captain.level,text:document.querySelector('.island-card[open]').textContent};
  island.dispose();return result;
 });
 expect(result.failure).toBeNull();expect(result.coins).toBe(0);expect(result.level).toBe(1);
 expect(result.text).toContain('Not enough');
});

it.each(['learnSkill','takeRole','respecCaptain','upgradeCaptain'].flatMap(action=>['success','failure'].map(outcome=>[action,outcome])))(
 'ignores %s %s after the API check when identity changes before the UI continuation',async (action,outcome)=>{
 const result=await evaluate(async ({action,outcome})=>{
  const {createIsland}=await window.g20Import('/src/island/index.js');
  const {createFakeIslandTransport}=await window.g20Import('/src/pirates/fake-api.js');
  const {personalReply,personalCaptain}=await window.g20Import('/tests/island/economy-fixture.js');
  const {on,emit}=await window.g20Import('/src/core/events.js');
  const base=createFakeIslandTransport();base.dev.setCoins(9000);base.dev.setWaveBest(9);
  const legacyReply=(await base.get('/api/island')).data;legacyReply.captain={...legacyReply.captain,level:2};
  let generation=1,changed,cleared=null,island;
  const events=[],stopEvents=['captain_skill_learned','captain_role_picked','captain_respec','captain_upgraded'].map(type=>on(type,event=>events.push(event)));
  const transport={get:path=>path==='/api/captain'&&action!=='upgradeCaptain'?Promise.resolve({ok:true,data:personalReply()}):base.get(path),
   post:(path,body)=>{
    if(!path.startsWith('/api/captain/')&&path!=='/api/island/captain')return base.post(path,body);
    // ask() sees generation1; the UI continuation runs after the nested identity-change microtask.
    queueMicrotask(()=>queueMicrotask(()=>{generation=2;changed();cleared=island.island;}));
    if(outcome==='failure')return Promise.resolve({ok:false,status:422,code:'validation_error',message:'Old Captain failure.'});
    if(action==='upgradeCaptain')return Promise.resolve({ok:true,data:legacyReply});
    return Promise.resolve({ok:true,data:personalReply({captain:personalCaptain({revision:'2',role:null,canRespec:false}),skills:{points:4,earned:4,spent:0,known:[]}})});
   }};
  island=createIsland({container:document.body,emit,on,mode:'fake',transport,storage:null,visitStorage:null,menu:()=>()=>{},settings:()=>()=>{},authGeneration:()=>generation,onAuthGenerationChange:listener=>{changed=listener;return()=>{};}});
  await island.load();
  if(action==='respecCaptain')await island.respecCaptain();
  await island[action](action==='learnSkill'?'steady_aim':action==='takeRole'?'medic':undefined);
  island.openCaptain();
  const result={cleared,after:island.island,generation,events:events.length,toast:island.ui.toastText,text:document.querySelector('.island-card[open]').textContent};
  island.dispose();for(const stop of stopEvents)stop();return result;
 },{action,outcome});
 expect(result.text).not.toContain('Old Captain failure.');
 expect(result.cleared).toBeNull();expect(result.generation).toBe(2);expect(result.after).toBeNull();
 expect(result.events).toBe(0);expect(result.toast??'').not.toMatch(/New skill|You are|Skills reset|Captain level/);
});
