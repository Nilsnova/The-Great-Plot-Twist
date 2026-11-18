import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {readPerimeterDemo,canonicalWallId} from '../../src/pirates/perimeter-demo.js';
import {createFakeIslandTransport,createSharedFakeStore} from '../../src/pirates/fake-api.js';
import {createWaveController,readWaveInfo} from '../../src/pirates/controller.js';
import {isWave,wallHealthBody} from '../../src/island/api.js';
import {CONFIG,createWave} from '../../src/pirates/sim.js';
import {healthReport} from '../../src/pirates/wall-health.js';
const epoch='12345678-1234-4234-8234-123456789abc';
const INFO={waveId:'local-demo',wave:8,seed:15838,startsAt:'2026-11-17T12:00:00Z',weather:{kind:'calm',ships:1,fog:0},flagship:false,rules:['pathing']};
const CREW={gunner:0,carpenter:0,lookout:0,guard:0};
const demo=()=>({version:1,waveId:INFO.waveId,wave:INFO.wave,seed:INFO.seed,startsAt:INFO.startsAt,islandEpoch:epoch,pathing:true,perimeterWalls:true,
  defenses:[{id:'wall_128',kind:'wall',level:1,x:-18.5,z:0,health:100}],crew:{...CREW}});

describe('bounded explicit local perimeter inputs',()=>{
  it('clones/freezes inputs and keeps ordinary absent-demo legacy answers unchanged',()=>{
    const raw=demo(),parsed=readPerimeterDemo(raw,INFO);raw.defenses[0].x=10;raw.crew.carpenter=2;
    expect(parsed.defenses[0].x).toBe(-18.5);expect(parsed.crew.carpenter).toBe(0);expect(Object.isFrozen(parsed.defenses[0])).toBe(true);
    expect(isWave(INFO)).toBe(true);expect(readWaveInfo(INFO).perimeterDemo).toBeUndefined();
  });
  it.each([{version:2},{pathing:false},{perimeterWalls:false},{seed:1},{waveId:'other'},{startsAt:'2026-11-17T13:00:00Z'},
    {crew:{...CREW,guard:4}},{defenses:Array(143).fill({})},{islandEpoch:epoch+'\n'},{extra:true}])('rejects malformed provided demo %j without fallback',fields=>{
    const raw={...INFO,perimeterDemo:{...demo(),...fields}};expect(isWave(raw)).toBe(false);expect(readWaveInfo(raw)).toBeNull();
  });
  it.each([{id:'wall_129'},{id:'wall_013'},{id:'wall_128\n'},{x:1.25},{z:Infinity},{level:0},{kind:'cannon'}])('rejects malformed defense %j',fields=>{
    const raw=demo();raw.defenses[0]={...raw.defenses[0],...fields};expect(readPerimeterDemo(raw,INFO)).toBeNull();
  });
  it('rejects duplicate IDs, unsupported production mixing and missing pathing rule',()=>{
    const raw=demo();raw.defenses.push({...raw.defenses[0]});expect(readPerimeterDemo(raw,INFO)).toBeNull();
    expect(readPerimeterDemo(demo(),{...INFO,recoveryVersion:1,waveProtocol:2})).toBeNull();
    expect(isWave({...INFO,rules:[],perimeterDemo:demo()})).toBe(false);
    expect(isWave({...INFO,rules:'pathing',perimeterDemo:demo()})).toBe(false);
  });
  it('retains canonical first/last health report IDs and refuses aliases/out-of-range IDs',()=>{
    const all=Object.fromEntries(Array.from({length:128},(_,i)=>[`wall_${i+1}`,99]));
    expect(Object.keys(wallHealthBody(all))).toHaveLength(128);
    for(const id of ['wall_0','wall_01','wall_129','wall_128\n'])expect(canonicalWallId(id)).toBe(false);
  });
  it('uses frozen defenses and crew instead of later getters or overriding ordinary sim options',async()=>{
    let current=[{id:'wall_1',kind:'wall',level:5,x:4,z:6}];
    const c=createWaveController({listen:false,world:{},now:()=>Date.parse(INFO.startsAt),getDefenses:()=>current,getCrew:()=>({carpenter:2}),
      createRenderer:()=>({setVisible(){},update(){},events(){},dispose(){}}),createHud:()=>({setVisible(){},countdown(){},bar(){},prompt(){},dispose(){}}),
      simOptions:{defenses:[],crew:{carpenter:2},pathing:false,perimeterWalls:false},loadAuto:()=>false});
    const made=c.start({...INFO,perimeterDemo:demo()});expect(made).toBeTruthy();
    expect(made.defenses[0]).toMatchObject({id:'wall_128',x:-18.5,z:0,level:1});current=[];
    expect(made.sim.state().walls).toHaveLength(1);expect(made.info.perimeterDemo.crew.carpenter).toBe(0);
    expect(c.start({...INFO,waveId:'malformed',perimeterDemo:null})).toBeNull();c.dispose();await Promise.resolve();
  });
});

it('freezes, reloads, fights and finishes the paid102-piece ring as an explicitly legacy local demo',async()=>{
  const saved=new Map(),storage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)},shared=createSharedFakeStore('perimeter-demo',{storage,locks:null});
  let clock=Date.parse(INFO.startsAt);const options={shared,version:2,now:()=>clock,flags:{wall_recovery:true,perimeter_walls:true}};
  const t=createFakeIslandTransport({...options,coins:5000});await t.dev.setWaveBest(7);await t.post('/api/island/walls/enable',{});
  const ring=JSON.parse(readFileSync(new URL('../fixtures/perimeter-scenery-ring.json',import.meta.url),'utf8')).cells.map(([x,z])=>({x,z}));
  for(let start=0;start<ring.length;start+=32){const q=(await t.post('/api/island/walls/quote',{cells:ring.slice(start,start+32)})).data;
    expect((await t.post('/api/island/walls/build',{placements:q.placements,quotedTotal:q.totalCost,islandEpoch:q.islandEpoch,actionUid:`ring-${start}-build`})).ok).toBe(true);}
  const started=await t.post('/api/waves/start',{where:'own',actionUid:'ring-wave-1',waveProtocol:2,wallClientVersion:1});expect(started.ok).toBe(true);
  expect(started.data.waveProtocol).toBeUndefined();expect(started.data.recoveryVersion).toBeUndefined();expect(isWave(started.data)).toBe(true);
  const frozen=structuredClone(started.data.perimeterDemo);expect(frozen.defenses).toHaveLength(102);
  started.data.perimeterDemo.defenses[0].x=123;const reload=createFakeIslandTransport(options),current=(await reload.get('/api/waves/current?where=own')).data;
  expect(current.perimeterDemo).toEqual(frozen);expect((await reload.api.joinWave({waveId:current.waveId})).perimeterDemo).toEqual(frozen);
  const sim=createWave({seed:current.seed,wave:current.wave,weather:current.weather,defenses:frozen.defenses,crew:frozen.crew,pathing:true,perimeterWalls:true,countdown:0});
  clock=Date.parse(current.startsAt);let landed=0,breaches=0;const positions=new Map(frozen.defenses.map(w=>[w.id,w]));
  for(let tick=0;tick<4000&&!sim.done;tick++){
    const events=sim.step(CONFIG.tick);clock+=CONFIG.tick*1000;
    const standing=sim.state().walls.filter(w=>w.hp>0).map(w=>positions.get(w.id));
    for(const event of events){if(event.type==='boarder_landed'){landed++;expect(standing.some(w=>Math.abs(event.x-w.x)<.98&&Math.abs(event.z-w.z)<.98)).toBe(false);}
      if(event.type==='wall_damaged'&&event.broken)breaches++;}
  }
  expect(sim.done).toBe(true);expect(landed).toBeGreaterThan(0);expect(breaches).toBeGreaterThan(0);
  const walls=healthReport(sim.state().walls);expect(Object.keys(walls)).toHaveLength(102);
  const result=sim.result(),finished=await reload.post('/api/waves/finish',{waveId:current.waveId,survived:result.survived,shipsSunk:result.shipsSunk,walls});
  expect(finished.ok).toBe(true);expect((await reload.get('/api/waves/current?where=own')).data).toBeNull();
});
it('pauses new offers without hiding owned pieces or blocking committed receipt reconciliation',async()=>{
  const flags={perimeter_walls:true},t=createFakeIslandTransport({coins:1000,flags});await t.post('/api/island/walls/enable',{});
  const q=(await t.post('/api/island/walls/quote',{cells:[{x:4,z:-19.5}]})).data,b={placements:q.placements,quotedTotal:q.totalCost,islandEpoch:q.islandEpoch,actionUid:'pause-build-1'};
  await t.post('/api/island/walls/build',b);flags.perimeter_walls=false;
  expect((await t.post('/api/island/walls/build',b)).data.receipt.repeat).toBe(true);
  expect(await t.post('/api/island/walls/quote',{cells:[{x:-4,z:-17.5}]})).toMatchObject({code:'feature_off'});
  expect((await t.api.island()).spots.find(row=>row.id==='wall_1').built).toBe(true);
  expect(await createFakeIslandTransport().post('/api/island/walls/enable',{})).toMatchObject({code:'feature_off'});
});
