// Live accepted attacks retain visual feedback across stalls without replaying historical actions.
import {afterEach,expect,it,vi} from 'vitest';
import {createWaveController} from '../../src/pirates/controller.js';
import {poseOf} from '../../src/pirates/poses.js';
import {toMessage} from '../../src/pirates/sync.js';
import {createLiveAttackFeedback} from '../../src/pirates/live-attack-feedback.js';
const START=Date.UTC(2026,10,18,12);
afterEach(()=>vi.unstubAllGlobals());

async function setup(){
  let clock=START,place='home_islet';const events=[],listeners=new Map(),received=new Map(),drawn=[];
  const bus={on(type,fn){listeners.set(type,fn);return()=>listeners.delete(type);},emit(event){events.push(event);}};
  const player={x:0,z:0};
  const controller=createWaveController({bus,playerId:'me',place:'home_islet',now:()=>clock,
    world:{scene:{},container:{},player:{position:player},place:()=>place},
    room:{on(type,fn){received.set(type,fn);return()=>received.delete(type);},send(){}},
    createRenderer:()=>({events:items=>drawn.push(...items),update(){},setVisible(){},dispose(){}}),
    createHud:()=>null,createEventArt:()=>null,playCutscene:()=>null,setTimer:()=>0,clearTimer(){}});
  controller.start({waveId:'live-feedback',wave:3,seed:77,startsAt:new Date(START).toISOString(),weather:{kind:'calm',ships:1,fog:0},flagship:false});
  await Promise.resolve();await Promise.resolve();
  const advance=ms=>{clock+=ms;controller.update(ms/1000);};
  let target;
  for(let i=0;i<300&&!target;i++){
    advance(100);
    target=controller.state.ships.find(ship=>ship.hp>0&&Math.hypot(ship.x,ship.z)<22);
  }
  if(!target)throw new Error('Fixture found no eligible ship');
  const radius=Math.hypot(target.x,target.z);player.x=target.x*14/radius;player.z=target.z*14/radius;
  controller.autoBlade=false;
  return{controller,events,drawn,advance,target,player,listeners,received,travel:value=>{place=value;}};
}

it('shows an accepted live shot after a visible 1.8 second stall, with the existing lifetime',async()=>{
  const h=await setup();expect(h.controller.shoot(h.target.id)).toBe(true);h.advance(1800);
  expect(h.events.some(event=>event.type==='captain_fired'&&event.targetId===h.target.id)).toBe(true);
  expect(h.controller.pose('me')).toMatchObject({kind:'musket',age:0});
  h.advance(600);expect(h.controller.pose('me')).toBeNull();h.controller.dispose();
});

it('keeps historical scheduled shots out of the live feedback channel',async()=>{
  const h=await setup(),wave=h.controller.wave;
  wave.schedule.add({by:'me',seq:999,tick:wave.ticks+4,input:{type:'captain_shot',by:'me',targetId:h.target.id,level:1,weapon:'musket',x:h.player.x,z:h.player.z}},wave.ticks);
  h.advance(1800);
  expect(h.events.some(event=>event.type==='captain_fired')).toBe(true);
  expect(h.controller.pose('me')).toBeNull();h.controller.dispose();
});

it('keeps the newest accepted pose when an older live shot and newer fresh shot share one frame',async()=>{
  const h=await setup();expect(h.controller.shoot(h.target.id)).toBe(true);
  const wave=h.controller.wave;
  wave.schedule.add({by:'me',seq:999,tick:wave.ticks+30,input:{type:'captain_shot',by:'me',targetId:h.target.id,level:1,weapon:'musket',x:h.player.x,z:h.player.z+3}},wave.ticks);
  h.advance(1800);
  const accepted=h.events.filter(event=>event.type==='captain_fired');expect(accepted).toHaveLength(2);
  expect(h.controller.pose('me')).toMatchObject({...poseOf(accepted.at(-1)),age:0});h.controller.dispose();
});

it('does not promote a submitted shot that the simulation rejects',async()=>{
  const h=await setup();expect(h.controller.shoot(h.target.id)).toBe(true);
  h.controller.wave.sim.step(.05,[{type:'captain_shot',by:'me',targetId:h.target.id,level:1,weapon:'musket',x:h.player.x,z:h.player.z}]);
  h.advance(1800);
  expect(h.events.some(event=>event.type==='captain_fired')).toBe(false);
  expect(h.controller.pose('me')).toBeNull();h.controller.dispose();
});

it('drops pending feedback when the island is left or the page is hidden',async()=>{
  for(const hiding of [false,true]){
    const document=new EventTarget();document.hidden=false;vi.stubGlobal('document',document);
    const h=await setup();expect(h.controller.shoot(h.target.id)).toBe(true);
    if(hiding){document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));document.hidden=false;}
    else{h.travel('saltreach_harbor');h.advance(50);h.travel('home_islet');}
    h.advance(1800);expect(h.controller.pose('me')).toBeNull();h.controller.dispose();
  }
});

it('correlates a validated remote shot once despite duplicate room delivery',async()=>{
  const h=await setup(),wave=h.controller.wave;
  const input={type:'captain_shot',by:'friend',targetId:h.target.id,level:1,weapon:'musket',x:h.player.x,z:h.player.z};
  const message=toMessage(input,{by:'friend',seq:1,tick:wave.ticks+4,waveId:wave.info.waveId});
  h.received.get(message.type)(message.payload);h.received.get(message.type)(message.payload);
  h.advance(1800);
  expect(h.events.filter(event=>event.type==='captain_fired'&&event.by==='friend')).toHaveLength(1);
  expect(h.controller.pose('friend')).toMatchObject({kind:'musket',age:0});h.controller.dispose();
  expect(h.controller.pose('friend')).toBeNull();expect(h.received.size).toBe(0);
});

it('does not promote an ambiguous batch or replay a consumed live marker',()=>{
  const feedback=createLiveAttackFeedback(),live={type:'captain_shot',by:'me',targetId:'ship_1'};
  const old={...live},event={type:'captain_fired',by:'me',targetId:'ship_1'};
  feedback.note(live);expect(feedback.accepted([event],[old,live])).toEqual([]);
  expect(feedback.accepted([event],[live])).toEqual([]);
  feedback.note(live);expect(feedback.accepted([event],[live])).toEqual([event]);
  expect(feedback.accepted([event],[live])).toEqual([]);
  feedback.note(live);feedback.clear();expect(feedback.accepted([event],[live])).toEqual([]);
});
