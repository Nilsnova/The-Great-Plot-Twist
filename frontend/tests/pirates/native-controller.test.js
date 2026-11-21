// Actual native controller replay remains read-only without fresh source control and uses frozen Captain stats.
import {it,expect,vi} from 'vitest';
import {createWaveController} from '../../src/pirates/controller.js';
import {nativeWave,token} from '../island/shared-wave-fixture.js';
import {proof,economy} from '../island/shared-session-fixture.js';
function fixture(spectator=false,extra={}){
 const info={...nativeWave(),nativeShared:true,spectator,controlSessionId:proof().sessionId};if(spectator){info.participantToken=null;info.lastActorCounter=null;info.controlSessionId=null;}
 let live=proof(),now=Date.parse(info.startsAt)+100;
 const transport={readEvents:vi.fn(async()=>({headSeq:0,sealedThroughTick:2,events:[]})),sendInputs:vi.fn(async()=>({accepted:[]})),checkpoint:vi.fn(),finishWave:vi.fn()};
 const controller=createWaveController({getSessionProof:()=>live,now:()=>now,recoveryPlayoutMs:0,recoveryTransport:transport,world:{player:{position:{x:0,z:0}},place:()=> 'home_islet'},place:'home_islet',
  captainLevel:()=>5,captainSkills:()=>['medic'],captainWeapon:()=> 'blunderbuss',createRenderer:()=>null,createHud:()=>null,setTimer:()=>({}),clearTimer:()=>{},...extra});
 return {info,controller,transport,setProof:value=>{live=value;},setNow:value=>{now=value;},getNow:()=>now};
}
it('reports native Captain health without jumping over the regular wave playout',async()=>{
 const f=fixture(false,{recoveryPlayoutMs:1000,world:{place:()=> 'home_islet'}}), start=Date.parse(f.info.startsAt);
 f.transport.readEvents.mockImplementation(async()=>({headSeq:0,sealedThroughTick:Math.max(-1,Math.floor((f.getNow()-start-100)/50)-1),events:[]}));
 f.transport.captains=vi.fn(async({report})=>({accepted:true,repeated:false,throughTick:report.throughTick,
  inputHeadSeq:report.inputHeadSeq,captains:Object.fromEntries(Object.entries(report.captains).map(([id,row])=>[id,{...row,fallId:null}]))}));
 f.setNow(start-1200);
 expect(f.controller.start({...f.info,clockOffsetMs:0})).toBeTruthy();
 try{
  let maxStep=0,previous=0;
  for(let elapsed=-1200;elapsed<=11000;elapsed+=16){
   f.setNow(start+elapsed);
   f.controller.update(.016);
   for(let settle=0;settle<12;settle++)await Promise.resolve();
   const {ticks}=f.controller.wave;
   if(elapsed>=1800)maxStep=Math.max(maxStep,ticks-previous);
   previous=ticks;
  }
  expect(f.transport.captains.mock.calls.length).toBeGreaterThanOrEqual(3);
  expect(f.controller.wave.ticks).toBeGreaterThan(190);
  expect(maxStep).toBe(1);
 }finally{f.controller.dispose();}
});
it('replays the full frozen native roster as spectator without any inputs, health or finish mutation',async()=>{
 const f=fixture(true);expect(f.controller.start(f.info)).toBeTruthy();f.controller.update(.05);await vi.waitFor(()=>expect(f.controller.wave.recoveryPolling).toBe(false));f.controller.update(.05);
 expect(f.controller.state.phase).toBe('running');
 expect(f.controller.state.party).toMatchObject([{id:token,present:true}]);expect(f.controller.fire('cannon_1','ship_1')).toBe(false);
 expect(f.transport.sendInputs).not.toHaveBeenCalled();expect(f.transport.checkpoint).not.toHaveBeenCalled();expect(f.transport.finishWave).not.toHaveBeenCalled();f.controller.dispose();
});
it('uses server auto settings without a local bell timer or legacy pause authority',async()=>{
 let manages=true;const set=vi.fn(async()=>({ok:true})),save=vi.fn(),next=vi.fn(async()=>({ok:true}));
 const f=fixture(false,{getSessionSettings:()=>({canManage:manages,autoNext:true,breakPaused:false}),setSessionSettings:set,loadAuto:()=>true,saveAuto:save,startNextWave:next,holdBreak:()=>({paused:true})});
 f.controller.start(f.info);const current=f.controller.wave;current.done=true;current.result={survived:true,shipsSunk:1};current.answer={};current.recoveryFinishAnswered=true;current.pause={until:0,ready:false,requested:false};
 f.controller.update(.05);expect(next).not.toHaveBeenCalled();f.controller.setAuto(false);expect(set).toHaveBeenCalledExactlyOnceWith({autoNext:false});expect(save).not.toHaveBeenCalled();expect(f.controller.auto).toBe(true);
 expect(f.controller.next()).toBe(true);await Promise.resolve();expect(next).toHaveBeenCalledOnce();manages=false;f.controller.setAuto(true);expect(set).toHaveBeenCalledOnce();f.controller.dispose();
});
it('stops only a proven replacement native origin, preserving unknown context as read-only',()=>{
 const f=fixture();f.controller.start(f.info);expect(f.controller.stopIfOriginChanged(null)).toBe(false);expect(f.controller.wave).not.toBeNull();
 expect(f.controller.stopIfOriginChanged({...economy(),accountId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',runEpoch:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'})).toBe(true);expect(f.controller.wave).toBeNull();f.controller.dispose();
});
it('uses frozen personal loadout and revokes commands immediately when fresh control disappears',async()=>{
 const f=fixture();expect(f.controller.start(f.info)).toBeTruthy();expect(f.controller.captainStats.level).toBe(1);expect(f.controller.captainStats.weapon).toBe('musket');
 f.controller.update(.05);await vi.waitFor(()=>expect(f.controller.wave.recoveryPolling).toBe(false));f.controller.update(.05);expect(f.controller.state.phase).toBe('running');
 expect(f.controller.fire('cannon_1','ship_1')).toBe(true);f.setProof(null);
 expect(f.controller.fire('cannon_1','ship_1')).toBe(false);f.controller.dispose();
});
it('promotes a verified frozen participant without restarting its damaged replay or counters',async()=>{
 const f=fixture(true);f.controller.start(f.info);const current=f.controller.wave;
 f.controller.update(.05);await vi.waitFor(()=>expect(current.recoveryPolling).toBe(false));f.controller.update(.05);
 const sim=current.sim,replay=current.recoveryReplay,state=current.state,ticks=current.ticks;
 const next={...nativeWave(),nativeShared:true,spectator:false,controlSessionId:proof().sessionId,lastActorCounter:17};
 expect(f.controller.start(next)).toBe(current);expect(current.sim).toBe(sim);expect(current.recoveryReplay).toBe(replay);
 expect(current.state).toBe(state);expect(current.ticks).toBe(ticks);expect(current.actorCounter).toBe(17);
 expect(current.info).toMatchObject({spectator:false,participantToken:token});expect(f.controller.fire('cannon_1','ship_1')).toBe(true);
 f.controller.start({...next,lastActorCounter:3});expect(current.actorCounter).toBeGreaterThanOrEqual(17);expect(current.sim).toBe(sim);f.controller.dispose();
});
it.each(['no-proof','other-session','other-origin','other-snapshot','outside-roster'])('keeps the replay read-only with %s during promotion',async boundary=>{
 const f=fixture(true);f.controller.start(f.info);const current=f.controller.wave,next={...nativeWave(),nativeShared:true,spectator:false,controlSessionId:proof().sessionId};
 if(boundary==='no-proof')f.setProof(null);
 if(boundary==='other-session')next.controlSessionId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 if(boundary==='other-origin')f.setProof({...proof(),origin:{...proof().origin,runEpoch:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'}});
 if(boundary==='other-snapshot'){next.initialSnapshot=structuredClone(next.initialSnapshot);next.initialSnapshot.configVersion++;}
 if(boundary==='outside-roster')next.participantToken='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 f.controller.start(next);expect(f.controller.wave).toBe(current);expect(current.info.spectator).toBe(true);
 expect(f.controller.fire('cannon_1','ship_1')).toBe(false);expect(f.transport.sendInputs).not.toHaveBeenCalled();f.controller.dispose();
});
