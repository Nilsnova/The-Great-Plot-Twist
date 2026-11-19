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
