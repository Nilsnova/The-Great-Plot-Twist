// The real bell flow and bus must retain the declared local inputs before the actual wave controller starts.
import {afterEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createWaveFlow} from '../../src/island/wave-flow.js';
import {createIslandApi} from '../../src/island/api.js';
import {WAVE_STARTED} from '../../src/island/wave-hooks.js';
import * as bus from '../../src/core/events.js';
import {createFakeIslandTransport,createSharedFakeStore} from '../../src/pirates/fake-api.js';
import {createWaveController} from '../../src/pirates/controller.js';
import * as simulation from '../../src/pirates/sim.js';
const NOW=Date.parse('2026-11-17T12:00:00Z'),cleanup=[];
const timers={setTimer:()=>({}),clearTimer:()=>{}};
function attach(api,options={}){
  const controller=createWaveController({bus,world:{},now:()=>NOW,loadAuto:()=>false,...timers,
    getDefenses:()=>[{id:'wall_1',kind:'wall',level:5,x:0,z:0}],getCrew:()=>({carpenter:2}),
    createRenderer:()=>null,createHud:()=>null,simOptions:{pathing:false,perimeterWalls:false},...options});
  const flow=createWaveFlow({api,emit:bus.emit,now:()=>NOW,hasRenderer:()=>true,...timers,
    defensesOf:()=>[{id:'wall_1',kind:'wall',level:5,x:0,z:0}]});
  cleanup.push(()=>{flow.dispose();controller.dispose();});return{flow,controller};
}
afterEach(()=>{cleanup.splice(0).reverse().forEach(stop=>stop());vi.restoreAllMocks();});

describe('frozen perimeter inputs across normal bell events',()=>{
  it('pays for102walls, rings through the real API/flow/bus/controller and rejoins the same frozen simulation',async()=>{
    const calls=vi.spyOn(simulation,'createWave'),saved=new Map();
    const shared=createSharedFakeStore('perimeter-flow',{storage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)},locks:null});
    const options={shared,version:2,now:()=>NOW,flags:{wall_recovery:true,perimeter_walls:true}};
    const transport=createFakeIslandTransport({...options,coins:5000});await transport.dev.setWaveBest(7);
    expect((await transport.post('/api/island/walls/enable',{})).ok).toBe(true);
    const cells=JSON.parse(readFileSync(new URL('../fixtures/perimeter-scenery-ring.json',import.meta.url),'utf8')).cells.map(([x,z])=>({x,z}));
    for(let start=0;start<cells.length;start+=32){
      const q=await transport.post('/api/island/walls/quote',{cells:cells.slice(start,start+32)});expect(q.ok).toBe(true);
      const built=await transport.post('/api/island/walls/build',{placements:q.data.placements,quotedTotal:q.data.totalCost,islandEpoch:q.data.islandEpoch,actionUid:`flow-ring-${start}`});
      expect(built.ok).toBe(true);
    }
    const api=createIslandApi({transport,waveProtocol:()=>2}),first=attach(api);
    expect((await first.flow.ring('own')).ok).toBe(true);
    const live=first.controller.wave,frozen=structuredClone(first.flow.current.wave.perimeterDemo);
    expect(live.info.perimeterDemo).toMatchObject({version:1,pathing:true,perimeterWalls:true});expect(live.defenses).toEqual(frozen.defenses);
    expect(live.sim.state().walls).toHaveLength(102);expect(live.sim.state().crew.carpenter).toBe(0);
    expect(calls.mock.calls[0][0]).toMatchObject({pathing:true,perimeterWalls:true,crew:frozen.crew});
    first.flow.current.wave.perimeterDemo.defenses[0].x=123;
    expect(live.info.perimeterDemo.defenses[0].x).toBe(frozen.defenses[0].x);expect(Object.isFrozen(live.info.perimeterDemo.defenses[0])).toBe(true);
    const initial=live.sim.state();first.flow.dispose();first.controller.dispose();
    const replay=attach(createIslandApi({transport:createFakeIslandTransport(options),waveProtocol:()=>2}),{getDefenses:()=>[],getCrew:()=>({carpenter:2})});
    expect((await replay.flow.look('own')).ok).toBe(true);expect(replay.controller.wave).toBeNull();
    expect(replay.flow.current.wave.perimeterDemo).toEqual(frozen);expect((await replay.flow.join('own')).ok).toBe(true);
    expect(replay.controller.wave.info.perimeterDemo).toEqual(frozen);expect(replay.controller.wave.defenses).toEqual(frozen.defenses);
    expect(replay.controller.wave.sim.state()).toEqual(initial);expect(calls.mock.calls[1][0]).toMatchObject({pathing:true,perimeterWalls:true});
    for(let tick=0;tick<20;tick++){
      expect(replay.controller.wave.sim.step(.1)).toEqual(live.sim.step(.1));
      expect(replay.controller.wave.sim.state()).toEqual(live.sim.state());
    }
    replay.flow.dispose();replay.controller.dispose();
    const raced=attach(createIslandApi({transport:createFakeIslandTransport(options),waveProtocol:()=>2}));
    expect((await raced.flow.ring('own',{joinRunning:true})).ok).toBe(true);
    expect(raced.controller.wave.info.perimeterDemo).toEqual(frozen);expect(raced.controller.wave.defenses).toHaveLength(102);
    expect(calls.mock.calls[2][0]).toMatchObject({pathing:true,perimeterWalls:true});
  });
  it.each([null,false,0,'bad',{}, {version:2}])('forwards supplied malformed demo %j to strict rejection rather than legacy fallback',async perimeterDemo=>{
    const wave={waveId:'bad-demo',wave:1,seed:42,startsAt:new Date(NOW).toISOString(),weather:{kind:'calm'},flagship:false,rules:['pathing'],perimeterDemo};
    const events=[],stop=bus.on(WAVE_STARTED,event=>events.push(event));cleanup.push(stop);
    const pair=attach({startWave:async()=>({ok:true,data:wave})});await pair.flow.ring('own');
    expect(events).toHaveLength(1);expect(Object.hasOwn(events[0],'perimeterDemo')).toBe(true);expect(events[0].perimeterDemo).toEqual(perimeterDemo);
    expect(pair.controller.wave).toBeNull();
  });
});
