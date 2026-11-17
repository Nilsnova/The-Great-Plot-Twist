// Full perimeter read DTOs must reach the client while unsupported or duplicate identities refuse.
import {describe,expect,it} from 'vitest';
import {createIslandApi,isWalls,isStructureRecovery} from '../../src/island/api.js';
import {structureRecoveryAppearance} from '../../src/island/world.js';
const uuid=n=>`12345678-1234-4234-8234-${n.toString(16).padStart(12,'0')}`;
const walls=()=>Array.from({length:128},(_,i)=>({spot:`wall_${i+1}`,level:1,health:50,recoversAt:'2026-11-17T12:02:00Z',repairCost:10}));
const recovery=()=>({serverNow:'2026-11-17T12:00:00Z',islandEpoch:uuid(1000),revision:4,recoveryVersion:1,waveProtocol:2,
  displayPhase:'between_waves',repairWindow:'between_waves',waveId:null,remainingPaidUses:null,
  structures:[...walls().map(row=>({spot:row.spot,kind:'wall'})),...Array.from({length:11},(_,i)=>({spot:`cannon_${i+1}`,kind:['cannon','mortar','harpoon','culverin','swivel'][i%5]}))]
    .map((row,i)=>({...row,instanceId:uuid(i+1),level:1,hpUnits:i===127?0:500_000,maxHP:60,rateUnitsPerSecond:1_666.67,estimatedFreeSeconds:300,fixedPrice:10,repairSeq:0}))});
const client=data=>createIslandApi({transport:{get:async()=>({ok:true,data}),post:async()=>({ok:true,data})}});

describe('complete bounded perimeter health reads',()=>{
  it.each([12,50,51,102,128])('accepts %i canonical wall health rows through the actual client read',async count=>{
    const data={coins:500,walls:walls().slice(0,count)};expect(isWalls(data)).toBe(true);
    expect((await client(data).walls()).data.walls).toEqual(data.walls);
  });
  it.each([12,50,51,102,139])('accepts %i canonical V1 rows through the actual client read',async count=>{
    const data=recovery();data.structures=data.structures.slice(0,count);expect(isStructureRecovery(data)).toBe(true);
    expect((await client(data).structureRecovery()).data.structures).toEqual(data.structures);
  });
  it('passes the last paid wall from a complete API read to the real world appearance rule',async()=>{
    const data=recovery(),answer=await client(data).structureRecovery(),row=answer.data.structures.find(row=>row.spot==='wall_128');
    expect(structureRecoveryAppearance({id:'wall_128',kind:'wall',level:1,built:true},row,answer.data))
      .toEqual({look:'broken',frame:'island-wall-l1-broken',suppressPips:false});
  });
  it.each(['wall_0','wall_01','wall_129','wall_128\n','cannon_1','pp_wall_1'])('refuses noncanonical wall health identity %j',async spot=>{
    const data={coins:500,walls:[{...walls()[0],spot}]};expect(isWalls(data)).toBe(false);
    expect(await client(data).walls()).toMatchObject({ok:false,code:'unreadable'});
  });
  it.each([{level:0},{level:6},{level:1.5},{health:-1},{health:101},{health:1.5},{recoversAt:'later'},{repairCost:-1}])('refuses malformed wall health %j',fields=>{
    expect(isWalls({coins:500,walls:[{...walls()[0],...fields}]})).toBe(false);
  });
  it('refuses duplicate walls and the 129th response row',()=>{
    const all=walls();expect(isWalls({coins:500,walls:[all[0],all[0]]})).toBe(false);
    expect(isWalls({coins:500,walls:[...all,{...all[0],spot:'wall_129'}]})).toBe(false);
  });
  it.each([{spot:'wall_129'},{spot:'wall_01'},{spot:'wall_128\n'},{spot:'cannon_12',kind:'cannon'},{spot:'house_1',kind:'cannon'},
    {spot:'tower_1',kind:'cannon'},{spot:'pp_tower_1',kind:'cannon'},{kind:'cannon'},{spot:'cannon_11',kind:'wall'},
    {level:6},{hpUnits:1.5},{maxHP:Infinity},{rateUnitsPerSecond:-1},{instanceId:uuid(1)+'\n'}])('refuses malformed recovery row %j',fields=>{
    const data=recovery();data.structures=[{...data.structures[0],...fields}];expect(isStructureRecovery(data)).toBe(false);
  });
  it('refuses duplicate canonical spots, duplicate instances and the 140th response row',()=>{
    const data=recovery(),first=data.structures[0];
    expect(isStructureRecovery({...data,structures:[first,{...first,instanceId:uuid(300)}]})).toBe(false);
    expect(isStructureRecovery({...data,structures:[first,{...first,spot:'wall_2'}]})).toBe(false);
    expect(isStructureRecovery({...data,structures:[...data.structures,{...first,instanceId:uuid(300)}]})).toBe(false);
  });
  it('preserves known tower aliases and rejects a duplicate normalized tower identity',async()=>{
    const data=recovery(),tower={...data.structures[128],spot:'tower_s1'};data.structures=[tower];
    expect(isStructureRecovery(data)).toBe(true);expect((await client(data).structureRecovery()).data.structures[0].spot).toBe('cannon_1');
    expect(isStructureRecovery({...data,structures:[tower,{...tower,spot:'cannon_1',instanceId:uuid(400)}]})).toBe(false);
  });
  it('rejects UUID aliases and unsupported protocol/window metadata',()=>{
    const data=recovery();
    for(const fields of [{islandEpoch:uuid(1000)+'\n'},{waveProtocol:1},{recoveryVersion:2},{repairWindow:'reserved_wave'},{displayPhase:'unknown'}])
      expect(isStructureRecovery({...data,...fields})).toBe(false);
    const row={...data.structures[0],instanceId:'abcdef12-1234-4234-8234-123456789abc'};
    expect(isStructureRecovery({...data,structures:[row,{...row,spot:'wall_2',instanceId:row.instanceId.toUpperCase()}]})).toBe(false);
  });
  it('keeps a complete current state attached to a repair refusal',async()=>{
    const data=recovery(),api=createIslandApi({transport:{get:async()=>null,post:async()=>({ok:false,status:409,data:{error:{code:'stale_recovery_quote',message:'Refresh.'},currentState:data,coins:87}})}});
    const row=data.structures[127],answer=await api.repairStructure({quote:{spot:row.spot,instanceId:row.instanceId,expectedEpoch:data.islandEpoch,
      expectedWindow:'between_waves',expectedLevel:1,expectedRepairSeq:0,quotedPrice:10,waveProtocol:2}});
    expect(answer).toMatchObject({ok:false,code:'stale_recovery_quote',coins:87});expect(answer.currentState.structures).toHaveLength(139);
  });
});
