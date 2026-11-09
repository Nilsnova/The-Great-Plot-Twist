// G29 C1: the cutscene player and the front door in real Chromium, with local art and fake audio.
import {expect,it} from 'vitest';
import {browserHarness} from './g20-browser.js';
const evaluate=browserHarness();

const script={version:1,scripts:[{id:'demo',title:'Demo scene',lines:[{id:'demo_01',text:'First line.',seconds:.35},{id:'demo_02',text:'Second line.',seconds:.35}]}]};
const shots={demo:[{from:0,to:0,sky:'night',layers:[{art:'pixel/lighthouse.png',className:'shot-lighthouse',depth:20}]},{from:1,to:1,sky:'dusk',layers:[]}]};

it('plays timed subtitles to the end and leaves no dialog behind',async()=>{
  const result=await evaluate(async({script,shots})=>{
    const {playCutscene}=await window.g20Import('/src/cutscenes/player.js');const seen=[],started=[];
    const player=playCutscene({id:'demo',data:script,scenes:shots,loadManifest:async()=>({}),
      createAudio:()=>({start:async timeline=>started.push(timeline.total),pause(){},resume(){},stop(){}})});
    const dialog=document.querySelector('dialog.cutscene');
    const observer=new MutationObserver(()=>{const text=dialog.querySelector('.cutscene-subtitle').textContent;if(seen.at(-1)!==text)seen.push(text);});
    seen.push(dialog.querySelector('.cutscene-subtitle').textContent);
    observer.observe(dialog.querySelector('.cutscene-subtitle'),{childList:true,characterData:true,subtree:true});
    const state={open:dialog.open,focus:document.activeElement?.textContent,label:document.getElementById(dialog.getAttribute('aria-labelledby'))?.textContent,
      live:dialog.querySelector('.cutscene-subtitle').getAttribute('aria-live'),images:dialog.querySelectorAll('img[alt=""]').length};
    const done=await player.done;observer.disconnect();
    return {...state,done,seen,started,left:document.querySelectorAll('dialog.cutscene').length,active:player.active};
  },{script,shots});
  expect(result).toMatchObject({open:true,focus:'Skip',label:'Demo scene',live:'polite',images:1,done:{status:'completed'},
    seen:['First line.','Second line.'],started:[.7],left:0,active:false});
});

it('skips with the button, with Escape and with a tap',async()=>{
  await evaluate.withPage(async page=>{
    for(const how of ['button','escape','tap']){
      const status=await page.evaluate(async({script,shots,how})=>{
        const {playCutscene}=await window.g20Import('/src/cutscenes/player.js');
        const data=structuredClone(script);data.scripts[0].lines.forEach(line=>{line.seconds=5;});
        window.player=playCutscene({id:'demo',data,scenes:shots,loadManifest:async()=>({}),createAudio:()=>({async start(){},pause(){},resume(){},stop(){}})});
        if(how==='button')document.querySelector('.cutscene-skip').click();
        if(how==='tap')document.querySelector('.cutscene-stage').click();
        return how==='escape'?null:(await window.player.done).status;
      },{script,shots,how});
      if(how==='escape'){await page.keyboard.press('Escape');expect((await page.evaluate(()=>window.player.done)).status).toBe('skipped');}
      else expect(status).toBe('skipped');
      expect(await page.locator('dialog.cutscene').count()).toBe(0);
    }
  });
});

it('holds still with reduced motion and honours large subtitles',async()=>{
  const result=await evaluate(async({script,shots})=>{
    const {playCutscene}=await window.g20Import('/src/cutscenes/player.js');
    const player=playCutscene({id:'demo',data:script,scenes:shots,reducedMotion:()=>true,preferences:()=>({subtitleSize:'large'}),
      loadManifest:async()=>({}),createAudio:()=>({async start(){},pause(){},resume(){},stop(){}})});
    await new Promise(resolve=>setTimeout(resolve,200));
    const dialog=document.querySelector('dialog.cutscene'),layer=dialog.querySelector('.cutscene-layer');
    const state={reduced:dialog.dataset.reducedMotion,large:dialog.classList.contains('cutscene-large'),transform:layer.style.transform,
      opacity:layer.parentElement.style.opacity,size:parseFloat(getComputedStyle(dialog.querySelector('.cutscene-subtitle')).fontSize)};
    player.skip();return state;
  },{script,shots});
  expect(result.reduced).toBe('true');expect(result.large).toBe(true);expect(result.transform).toBe('');expect(result.opacity).toBe('1');
  expect(result.size).toBeGreaterThanOrEqual(22);
});

it('fills a voice slot only when the manifest lists it, and stays silent otherwise',async()=>{
  const result=await evaluate(async()=>{
    const {createCutsceneAudio}=await window.g20Import('/src/cutscenes/audio.js');
    const {loadVoiceManifest}=await window.g20Import('/src/cutscenes/player.js');
    const {buildTimeline}=await window.g20Import('/src/cutscenes/timeline.js');
    const requests=[];const fetchImpl=async path=>{requests.push(path);return {ok:false,status:404};};
    const missing=await loadVoiceManifest({fetchImpl});
    const listed=await loadVoiceManifest({fetchImpl:async()=>({ok:true,json:async()=>({version:1,lines:{demo_01:{file:'demo_01.mp3',seconds:.3}}})})});
    const timeline=buildTimeline({id:'demo',lines:[{id:'demo_01',text:'A',seconds:1},{id:'demo_02',text:'B',seconds:1}]},listed);
    const audio=createCutsceneAudio({fetchImpl,preferences:()=>({master:0,music:0,voice:0})});
    await audio.start(timeline);audio.stop(0);
    return {missing,listed,requests};
  });
  expect(result.missing).toEqual({});
  expect(result.listed).toEqual({demo_01:{file:'demo_01.mp3',seconds:.3}});
  expect(result.requests.some(path=>path.endsWith('audio/voice/manifest.json'))).toBe(true);
  expect(result.requests.filter(path=>path.includes('demo_0'))).toEqual([expect.stringMatching(/audio\/voice\/demo_01\.mp3$/)]);
});

it('runs lore, harbor and one goal card once, then goes straight to the harbor',async()=>{
  await evaluate.withPage(async page=>{
    await page.evaluate(async()=>{
      const {createFrontDoor}=await window.g20Import('/src/front-door/index.js');window.log=[];
      const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
      window.game={begin:async(...args)=>window.log.push(['begin',...args])};
      window.adapter={read:()=>({mode:'online',account:{state:'signed_out'}}),signIn:async options=>{window.log.push(['signIn',options]);return {accepted:false,reason:'demo_closed'};}};
      window.door=createFrontDoor({container:document.body,storage,focus:()=>window.log.push(['focus']),
        loadPlayer:async()=>({playCutscene:({id})=>{window.log.push(['cutscene',id]);let done;const promise=new Promise(resolve=>{done=resolve;});window.finishCutscene=()=>done({status:'completed'});return {done:promise,skip(){done({status:'skipped'});},dispose(){}};}})});
      window.first=window.door.run({loadGame:async()=>window.game,adapter:window.adapter});
    });
    await page.waitForFunction(()=>window.log.some(([name])=>name==='cutscene'));
    expect(await page.evaluate(()=>window.door.active)).toBe(true);
    await page.evaluate(()=>window.finishCutscene());
    await page.locator('.goal-card[open]').waitFor();
    expect(await page.locator('.goal-card h2').textContent()).toBe('Your goal');
    expect(await page.locator('.goal-card dt').allTextContents()).toEqual(['Move','Interact']);
    expect(await page.evaluate(()=>document.activeElement.textContent)).toBe('Got it');
    expect(await page.evaluate(()=>window.door.handleEscape())).toBe(true);
    expect(await page.evaluate(async()=>{await window.first;return window.log;})).toEqual([
      ['signIn',{guest:true}],['cutscene','lore_intro'],['begin',false,{kind:'world',place:'saltreach_harbor'}],['focus']]);
    expect(await page.locator('.goal-card').count()).toBe(0);
    const second=await page.evaluate(async()=>{window.log=[];await window.door.run({loadGame:async()=>window.game,adapter:window.adapter});return window.log;});
    expect(second).toEqual([['signIn',{guest:true}],['begin',false,{kind:'world',place:'saltreach_harbor'}],['focus']]);
    expect(await page.evaluate(()=>window.door.active)).toBe(false);
  });
});
