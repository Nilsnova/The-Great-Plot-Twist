// Production native clock/revival orchestration with controlled clocks and synthetic trusted replies.
import {it,expect,vi} from 'vitest';
import {createIslandApi} from '../../src/island/api.js';
import {createSharedWaveApi} from '../../src/island/shared-wave-api.js';
import {createSharedRevivalApi} from '../../src/island/shared-revival-api.js';
import {createWaveFlow} from '../../src/island/wave-flow.js';
import {createWaveController} from '../../src/pirates/controller.js';
import {createNativeRevival} from '../../src/pirates/native-revival.js';
import {actorId,economy,origin,proof} from '../island/shared-session-fixture.js';
import {nativeWave,waveId,token} from '../island/shared-wave-fixture.js';
const base=Date.parse(nativeWave().serverNow),fallId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const storage=()=>{const rows=new Map();return {rows,getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,value),removeItem:key=>rows.delete(key)};};
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function waveApi(skew=6000){
 const data=nativeWave(),transport={get:vi.fn(async()=>({ok:true,data:structuredClone(data)})),post:vi.fn(async()=>({ok:true,data:structuredClone(data)}))};
 const shared=createSharedWaveApi({transport,getEconomy:economy,getActorId:()=>actorId,getProof:proof,storage:storage(),makeUid:()=> 'native_clock_bell_001'});
 const api=createIslandApi({transport,getEconomy:economy,getActorId:()=>actorId,sharedWaves:()=>shared,now:()=>base+skew});
 return {api,transport,data};
}
it.each(['startWave','currentWave','joinWave'])('applies the existing clock policy to native %s',async method=>{
 const f=waveApi();if(method==='joinWave')await f.api.currentWave();
 const answer=await f.api[method](method==='joinWave'?{waveId}:{where:'own'});
 expect(answer.ok).toBe(true);expect(answer.data.clockOffsetMs).toBe(-6000);
 expect(answer.data.initialSnapshot).not.toHaveProperty('clockOffsetMs');
});
it('hands the native arrival-time offset through the actual flow to the actual controller',async()=>{
 const {api}=waveApi(),controller=createWaveController({getSessionProof:proof,now:()=>base+6000,recoveryTransport:{readEvents:async()=>({headSeq:0,sealedThroughTick:0,events:[]}),sendInputs:async()=>({accepted:[]}),checkpoint:async()=>null,finishWave:async()=>null},
  createRenderer:()=>null,createHud:()=>null,setTimer:()=>1,clearTimer(){}});
 const flow=createWaveFlow({api,emit:event=>controller.start(event),hasRenderer:()=>true,now:()=>base+6000,setTimer:()=>1,clearTimer(){}});
 try{expect((await flow.ring()).ok).toBe(true);expect(controller.wave).not.toBeNull();expect(controller.wave.offset).toBe(-6000);}
 finally{flow.dispose();controller.dispose();}
});
it('leaves native null/refusal and clocks within the existing slack unchanged',async()=>{
 const f=waveApi(40);expect((await f.api.startWave()).data).not.toHaveProperty('clockOffsetMs');
 f.transport.get.mockResolvedValueOnce({ok:true,data:null});expect((await f.api.currentWave()).data).toBeNull();
 f.transport.get.mockResolvedValueOnce({ok:false,status:401});expect(await f.api.currentWave()).toMatchObject({ok:false,status:401});
});
it('waits out the original server hold after six-second clock drift using the same completion UID/body/proof',async()=>{
 let serverNow=base;const target={id:token,hp:0,down:true,downAt:.1},current={info:{waveId,initialSnapshot:{economy:origin()}},offset:0,revive:null};
 const starts=[],bodies=[],attemptedAt=[],holds=new Map(),saved=storage(),makeUid=vi.fn(()=> 'revival_clock_uid_001');
 const transport={post:vi.fn(async(_path,body)=>{
  bodies.push(structuredClone(body));attemptedAt.push(serverNow);
  if(!holds.has(body.holdId))return {ok:false,status:409,code:'hold_missing'};
  if(serverNow-holds.get(body.holdId)<2000)return {ok:false,status:409,code:'hold_incomplete'};
  return {ok:true,data:{status:'done',repeat:false,receipt:{receiptId:'ffffffff-ffff-4fff-8fff-ffffffffffff',actionUid:body.actionUid,action:'wave_revive',actorId,origin:origin(),
   result:{waveId,targetToken:token,fallId,holdId:body.holdId,downAtTick:2,eventSeq:10,reviveSeq:10,restoredHPUnits:500000}}}};
 })};
 const completion=createSharedRevivalApi({transport,getEconomy:economy,getActorId:()=>actorId,getProof:proof,storage:saved,makeUid});
 const send=vi.fn(async command=>{
  expect(command).toEqual({type:'captain_revive_hold_start',targetId:token,fallId});
  const holdId=`dddddddd-dddd-4ddd-8ddd-${String(starts.length+1).padStart(12,'0')}`;
  starts.push({holdId,startedAt:serverNow});holds.set(holdId,serverNow);
  return {ok:true,event:{payload:{hold:{holdId,startedAt:new Date(serverNow).toISOString(),requiredMs:2000,repeat:false}}}};
 });
 const sync=vi.fn(async()=>({ok:true,captains:{[token]:{hpUnits:0,downAtTick:2,fallId,reviveBasisSeq:0}}}));
 const ctl={wave:current,controls:()=>true,now:()=>serverNow+6000},revival=createNativeRevival(ctl,{sync,send,complete:intent=>completion.complete(intent)});
 revival.update(current,target,true);await flush();
 for(let elapsed=50;elapsed<=2250 && current.revive.stage!=='waiting_journal';elapsed+=50){serverNow=base+elapsed;revival.update(current,target,true);await flush();}
 expect({starts:starts.length,stage:current.revive.stage,hp:target.hp,down:target.down}).toEqual({starts:1,stage:'waiting_journal',hp:0,down:true});
 expect(serverNow-base).toBeGreaterThanOrEqual(2000);expect(bodies.length).toBeGreaterThan(1);expect(makeUid).toHaveBeenCalledOnce();
 expect(current.revive.startedAt).toBe(base);
 for(let i=1;i<attemptedAt.length;i++)expect(attemptedAt[i]-attemptedAt[i-1]).toBeGreaterThanOrEqual(400);
 for(const body of bodies)expect(body).toEqual(bodies[0]);
 expect(bodies[0]).toMatchObject({holdId:starts[0].holdId,actionUid:'revival_clock_uid_001',sessionId:proof().sessionId,connectionGeneration:proof().connectionGeneration});
 expect(saved.rows.size).toBe(0);expect(sync.mock.calls.length).toBeGreaterThan(bodies.length);
});
