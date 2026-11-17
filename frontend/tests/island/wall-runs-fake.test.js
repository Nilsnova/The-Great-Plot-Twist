import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createFakeIslandApi, createFakeIslandTransport, createSharedFakeStore, readIslandCode} from '../../src/pirates/fake-api.js';
const cells = [{x:-4,z:-17.5},{x:-2,z:-17.5},{x:0,z:-17.5}];
async function setup({oldBuilt = false, shared = null} = {}) {
  const t=createFakeIslandTransport({coins:5000,version:2,flags:{wall_recovery:true,perimeter_walls:true},shared});await t.dev.setWaveBest(50);
  if(oldBuilt)for(let n=1;n<=12;n++)await t.api.build({spot:`wall_${n}`,kind:'wall',actionUid:`original-${n}`});
  expect((await t.post('/api/island/walls/enable',{})).ok).toBe(true);return t;
}
const quote = (t,c = cells) => t.post('/api/island/walls/quote',{cells:c});
const body = (q,actionUid='wall-run-1') => ({placements:q.placements,quotedTotal:q.totalCost,islandEpoch:q.islandEpoch,actionUid});
const own = async t => t.world.islands.get(readIslandCode((await t.api.island()).code));

describe('local fake perimeter construction', () => {
  it('keeps legacy metadata until owner admission and returns readonly hidden coordinates', async () => {
    const t=createFakeIslandTransport({coins:5000,flags:{perimeter_walls:true}});const before=(await t.get('/api/island')).data;
    expect(before.layout.wallRuleVersion).toBeUndefined();
    const island=await own(t);island.positions=new Map([['cannon_8',{x:-4,z:-17.5}]]);
    const enabled=await t.post('/api/island/walls/enable',{});
    expect(enabled.data.layout).toMatchObject({wallRuleVersion:1,wallCapacity:128,reservedPositions:{cannon_8:{x:-4,z:-17.5}}});
    expect(enabled.data.spots.filter(s=>s.kind==='wall')).toHaveLength(128);
    expect(enabled.data.spots.find(s=>s.id==='wall_13')).toMatchObject({built:false});
    expect(enabled.data.spots.some(s=>s.id==='cannon_8')).toBe(false);
    expect(await quote(t,[cells[0]])).toMatchObject({ok:false,code:'place_taken'});
  });
  it('pairs ordered cells with original IDs, charges once and keeps immutable receipts', async () => {
    const t=await setup(),q=(await quote(t)).data;
    expect(q).toMatchObject({unitCost:10,totalCost:30,remaining:125,wallRuleVersion:1,wallCapacity:128});
    expect(q.placements.map(p=>p.spot)).toEqual(['wall_1','wall_2','wall_3']);
    const first=await t.post('/api/island/walls/build',body(q));expect(first.data.island.coins).toBe(4970);
    first.data.receipt.placements[0].x=123;const retry=await t.post('/api/island/walls/build',body(q));
    expect(retry.data.receipt).toMatchObject({repeat:true,placements:q.placements});expect(retry.data.island.coins).toBe(4970);
    expect(await t.post('/api/island/walls/build',{...body(q),quotedTotal:31})).toMatchObject({code:'action_uid_reused'});
  });
  it('reconciles a timeout after commitment using the same identity and no second debit', async () => {
    const t=await setup(),q=(await quote(t)).data;t.dev.failNext('timeout');
    expect(await t.post('/api/island/walls/build',body(q))).toMatchObject({ok:false,code:'timeout'});
    expect((await t.post('/api/island/walls/build',body(q))).data).toMatchObject({receipt:{repeat:true},island:{coins:4970}});
  });
  it('rejects an invalid later cell, stale quote and insufficient funds without partial purchase', async () => {
    const t=await setup(),q=(await quote(t)).data;
    expect(await quote(t,[cells[0],{x:-2.5,z:-17.5}])).toMatchObject({ok:false});
    expect(await t.post('/api/island/walls/build',{...body(q),quotedTotal:29})).toMatchObject({code:'stale_wall_quote'});
    t.dev.setCoins(29);expect(await t.post('/api/island/walls/build',body(q))).toMatchObject({code:'insufficient_funds'});
    expect((await t.api.island()).spots.some(s=>s.built)).toBe(false);expect(t.dev.read().coins).toBe(29);
  });
  it.each([[],Array.from({length:33},()=>cells[0]),[{x:4.25,z:-19.5}],[{x:0,z:25}],[{x:0,z:2}],
    [{x:4,z:-19.5},{x:4,z:-19.5}]].map(draft=>({draft})))('refuses malformed, overlapping or unsupported draft $draft', async ({draft}) => {
    const t=await setup();expect((await quote(t,draft)).ok).toBe(false);expect(t.dev.read().coins).toBe(5000);
  });
  it('retains actual payer rounding, new-ID upgrades, repair and demolition refunds', async () => {
    const t=await setup({oldBuilt:true});t.dev.setCaptain(3);await t.api.pickRole({role:'engineer'});
    const q=(await quote(t,[cells[0]])).data;expect(q).toMatchObject({unitCost:9,totalCost:9});expect(q.placements[0].spot).toBe('wall_13');
    await t.post('/api/island/walls/build',body(q));const island=await own(t);
    island.walls=new Map([['wall_13',{health:0,damagedAt:Date.now()}]]);
    await expect(t.api.upgrade({spot:'wall_13',actionUid:'upgrade-1'})).rejects.toMatchObject({code:'needs_repair'});
    await t.api.repairWall({spot:'wall_13',actionUid:'repair-1'});await t.api.upgrade({spot:'wall_13',actionUid:'upgrade-2'});
    const paid=island.payments.get('wall_13');expect(paid.map(row=>row.coins)).toEqual([9,18]);
    expect((await t.api.demolishQuote({spot:'wall_13'})).refunds[0]).toMatchObject({coins:Math.floor(paid.reduce((sum,row)=>sum+row.coins,0)/2)});
    await t.api.demolish({spot:'wall_13',actionUid:'demolish-1'});expect(island.positions.has('wall_13')).toBe(false);
    const retry=await t.post('/api/island/walls/build',body(q));expect(retry.data.receipt.repeat).toBe(true);
    expect(retry.data.island.spots.find(s=>s.id==='wall_13').built).toBe(false);
  });
  it('refuses unpositioned new single-build and preserves monotonic policy on reset/retry', async () => {
    const t=await setup(),q=(await quote(t,[cells[0]])).data;await t.post('/api/island/walls/build',body(q));
    expect(await t.post('/api/island/build',{spot:'wall_13',kind:'wall',actionUid:'single-13'})).toMatchObject({code:'position_required'});
    const code=(await t.api.island()).code;await t.api.freshStart({confirmCode:code,actionUid:'reset-walls-1'});
    const retry=await t.post('/api/island/walls/build',body(q));expect(retry.data.island.coins).toBe(100);
    expect(retry.data.island.layout.wallCapacity).toBe(128);expect(retry.data.island.spots.some(s=>s.built)).toBe(false);
  });
  it('checks membership before receipt replay and owner permission before enabling', async () => {
    const t=await setup(),island=await own(t),guest=createFakeIslandApi({world:t.world,playerId:'guest',flags:{perimeter_walls:true}});
    await guest.joinGame({code:island.code,actionUid:'join-walls-1'});
    await expect(guest.enableWalls({code:island.code})).rejects.toMatchObject({code:'not_owner'});
    const q=await guest.quoteWalls({code:island.code,cells:[cells[0]]});t.world.players.get('guest').coins=1000;
    const b={...body(q,'guest-walls-1'),code:island.code};await guest.buildWalls(b);
    await guest.leaveGame({code:island.code});await expect(guest.buildWalls(b)).rejects.toMatchObject({code:'not_member'});
  });
  it('blocks enabling/quoting/construction during a real fake wave reservation', async () => {
    const t=await setup(),q=(await quote(t)).data;await t.api.startWave({where:'own',actionUid:'wave-wall-1'});
    expect(await t.post('/api/island/walls/enable',{})).toMatchObject({code:'wave_running'});
    expect(await quote(t)).toMatchObject({code:'wave_running'});
    expect(await t.post('/api/island/walls/build',body(q))).toMatchObject({code:'wave_running'});
  });
  it('persists paid new coordinates, policy and receipts through the shared fake store', async () => {
    const saved=new Map(),storage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)};
    const shared=createSharedFakeStore('wall-runs',{storage,locks:null}),t=await setup({shared});
    const q=(await quote(t)).data;t.dev.failNext('timeout');expect(await t.post('/api/island/walls/build',body(q))).toMatchObject({code:'timeout'});
    const reload=createFakeIslandTransport({shared,version:2,flags:{wall_recovery:true,perimeter_walls:true}}),again=await reload.post('/api/island/walls/build',body(q));
    expect(again.data).toMatchObject({receipt:{repeat:true},island:{coins:4970,layout:{wallRuleVersion:1,wallCapacity:128}}});
    expect(again.data.island.spots.find(s=>s.id==='wall_1')).toMatchObject({built:true,x:-4,z:-17.5});
  });
});

it('rejects an uncommitted quote after reset even when the same cells and price are legal again', async () => {
  const t=await setup(),q=(await quote(t,[cells[0]])).data,code=(await t.api.island()).code;
  await t.api.freshStart({confirmCode:code,actionUid:'epoch-reset-1'});await t.dev.setWaveBest(50);
  const fresh=(await quote(t,[cells[0]])).data;expect(fresh.islandEpoch).not.toBe(q.islandEpoch);
  expect(await t.post('/api/island/walls/build',body(q))).toMatchObject({code:'stale_island_epoch'});
  expect((await t.api.island()).spots.some(row=>row.built)).toBe(false);expect(t.dev.read().coins).toBe(100);
});
it('accepts the new wall client capability without pretending to serve V1 recovery', async () => {
  const t=await setup(),started=await t.post('/api/waves/start',{where:'own',actionUid:'wall-client-1',waveProtocol:2,wallClientVersion:1});
  expect(started.ok).toBe(true);expect(started.data.waveProtocol).toBeUndefined();expect(started.data.initialSnapshot).toBeUndefined();
});

it('builds the independently measured 102-piece full perimeter in four bounded paid runs', async () => {
  const fixture=JSON.parse(readFileSync(new URL('../fixtures/perimeter-ring.json',import.meta.url),'utf8'));
  const ring=fixture.cells.map(([x,z])=>({x,z})),t=await setup();expect(ring).toHaveLength(102);
  for(let start=0;start<ring.length;start+=32){
    const q=await quote(t,ring.slice(start,start+32));expect(q.ok).toBe(true);
    const built=await t.post('/api/island/walls/build',body(q.data,`perimeter-${start}`));expect(built.ok).toBe(true);
  }
  const island=await t.api.island(),paid=island.spots.filter(row=>row.built);
  expect(paid).toHaveLength(102);expect(island.coins).toBe(3980);
  expect(paid.map(({x,z})=>({x,z}))).toEqual(ring);
  expect((await quote(t,[{x:-4,z:-17.5}])).data.remaining).toBe(25);
});
