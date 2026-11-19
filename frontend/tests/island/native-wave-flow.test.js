// Historical bells cannot launch an obsolete fighter; verified spectator reads need no join mutation.
import {it,expect,vi} from 'vitest';
import {createWaveFlow} from '../../src/island/wave-flow.js';
import {nativeWave} from './shared-wave-fixture.js';
it('confirms a historical bell and reads current context without emitting an old start',async()=>{
 const data={...nativeWave(),historical:true,repeat:true,economy:null,session:null,participantToken:null,lastActorCounter:null},emit=vi.fn();
 const api={startWave:vi.fn(async()=>({ok:true,data})),currentWave:vi.fn(async()=>({ok:true,data:null}))};
 const flow=createWaveFlow({api,emit});expect((await flow.ring('own')).ignored).toBe(true);expect(api.currentWave).toHaveBeenCalledOnce();expect(emit).not.toHaveBeenCalled();expect(flow.current).toBeNull();flow.dispose();
});
it('starts an accepted current native spectator replay without a mutating join or actor token',async()=>{
 const data=nativeWave();data.session={...data.session,isController:false,isSpectator:true,sessionId:null,connectionGeneration:null};data.participantToken=null;data.lastActorCounter=null;
 const api={currentWave:vi.fn(async()=>({ok:true,data})),joinWave:vi.fn()},emit=vi.fn();
 const flow=createWaveFlow({api,emit,prepare:async()=>{},setTimer:()=>1,clearTimer(){}});await flow.look('own');await flow.join('own');
 expect(api.joinWave).not.toHaveBeenCalled();expect(emit).toHaveBeenCalledWith(expect.objectContaining({nativeShared:true,spectator:true,controlSessionId:null}));
 expect(emit.mock.calls[0][0]).not.toHaveProperty('participantToken');flow.dispose();
});
it('refreshes an already rendered spectator only from a fresh same-frozen-wave controller projection',async()=>{
 const controller=nativeWave(),spectator=structuredClone(controller);
 spectator.session={...spectator.session,isController:false,isSpectator:true,sessionId:null,connectionGeneration:null};
 spectator.participantToken=null;spectator.lastActorCounter=null;
 const api={currentWave:vi.fn().mockResolvedValueOnce({ok:true,data:spectator}).mockResolvedValue({ok:true,data:controller}),joinWave:vi.fn()},events=[];
 const flow=createWaveFlow({api,emit:event=>events.push(event),setTimer:()=>1,clearTimer(){}});
 await flow.look('own');await flow.join('own');expect(events[0].spectator).toBe(true);
 await flow.refreshControl('own');expect(events).toHaveLength(2);expect(events[1]).toMatchObject({spectator:false,participantToken:controller.participantToken,controlSessionId:controller.session.sessionId});
 expect(flow.current.wave.initialSnapshot).toEqual(spectator.initialSnapshot);
 await flow.refreshControl('own');expect(events).toHaveLength(2);expect(api.currentWave).toHaveBeenCalledTimes(2);expect(api.joinWave).not.toHaveBeenCalled();flow.dispose();
});
it.each(['late-spectator','changed-snapshot','reset-during-read','control-lost-during-read'])('does not promote %s from a session refresh',async boundary=>{
 const spectator=nativeWave();spectator.session={...spectator.session,isController:false,isSpectator:true,sessionId:null,connectionGeneration:null};spectator.participantToken=null;spectator.lastActorCounter=null;
 let release;const events=[],api={currentWave:vi.fn().mockResolvedValueOnce({ok:true,data:spectator}).mockImplementation(()=>new Promise(resolve=>{release=resolve;}))};
 const flow=createWaveFlow({api,emit:event=>events.push(event),setTimer:()=>1,clearTimer(){}});await flow.look('own');await flow.join('own');
 let attached=true;const pending=flow.refreshControl('own',{guard:()=>attached}),next=boundary==='late-spectator'?spectator:nativeWave();
 if(boundary==='changed-snapshot')next.initialSnapshot.seed++;
 if(boundary==='control-lost-during-read')attached=false;
 if(boundary==='reset-during-read')flow.reset();release({ok:true,data:next});await pending;
 expect(events).toHaveLength(1);
 if(boundary==='control-lost-during-read'){
  attached=true;api.currentWave.mockResolvedValueOnce({ok:true,data:nativeWave()});
  await flow.refreshControl('own',{guard:()=>attached});expect(events).toHaveLength(2);expect(events[1].spectator).toBe(false);
 }
 flow.dispose();
});
