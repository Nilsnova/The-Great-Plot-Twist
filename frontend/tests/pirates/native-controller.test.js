// Actual native controller replay remains read-only without fresh source control and uses frozen Captain stats.
import {it,expect,vi} from 'vitest';
import {createWaveController} from '../../src/pirates/controller.js';
import {nativeWave,token} from '../island/shared-wave-fixture.js';
import {proof} from '../island/shared-session-fixture.js';
function fixture(spectator=false){
 const info={...nativeWave(),nativeShared:true,spectator,controlSessionId:proof().sessionId};if(spectator){info.participantToken=null;info.lastActorCounter=null;info.controlSessionId=null;}
 let live=proof(),now=Date.parse(info.startsAt)+100;
 const transport={readEvents:vi.fn(async()=>({headSeq:0,sealedThroughTick:2,events:[]})),sendInputs:vi.fn(async()=>({accepted:[]})),checkpoint:vi.fn(),finishWave:vi.fn()};
 const controller=createWaveController({getSessionProof:()=>live,now:()=>now,recoveryPlayoutMs:0,recoveryTransport:transport,world:{player:{position:{x:0,z:0}},place:()=> 'home_islet'},place:'home_islet',
  captainLevel:()=>5,captainSkills:()=>['medic'],captainWeapon:()=> 'blunderbuss',createRenderer:()=>null,createHud:()=>null,setTimer:()=>({}),clearTimer:()=>{}});
 return {info,controller,transport,setProof:value=>{live=value;},setNow:value=>{now=value;}};
}
it('replays the full frozen native roster as spectator without any inputs, health or finish mutation',async()=>{
 const f=fixture(true);expect(f.controller.start(f.info)).toBeTruthy();f.controller.update(.05);await vi.waitFor(()=>expect(f.controller.wave.recoveryPolling).toBe(false));f.controller.update(.05);
 expect(f.controller.state.phase).toBe('running');
 expect(f.controller.state.party).toMatchObject([{id:token,present:true}]);expect(f.controller.fire('cannon_1','ship_1')).toBe(false);
 expect(f.transport.sendInputs).not.toHaveBeenCalled();expect(f.transport.checkpoint).not.toHaveBeenCalled();expect(f.transport.finishWave).not.toHaveBeenCalled();f.controller.dispose();
});
it('uses frozen personal loadout and revokes commands immediately when fresh control disappears',async()=>{
 const f=fixture();expect(f.controller.start(f.info)).toBeTruthy();expect(f.controller.captainStats.level).toBe(1);expect(f.controller.captainStats.weapon).toBe('musket');
 f.controller.update(.05);await vi.waitFor(()=>expect(f.controller.wave.recoveryPolling).toBe(false));f.controller.update(.05);expect(f.controller.state.phase).toBe('running');
 expect(f.controller.fire('cannon_1','ship_1')).toBe(true);f.setProof(null);
 expect(f.controller.fire('cannon_1','ship_1')).toBe(false);f.controller.dispose();
});
