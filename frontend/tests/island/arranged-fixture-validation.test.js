import {expect,it} from 'vitest';
import {createFakeIslandTransport} from '../../src/pirates/fake-api.js';
import {createIslandApi} from '../../src/island/api.js';
import {createWallBuilderApi} from '../../src/island/wall-builder-api.js';
import ring from '../fixtures/perimeter-ring.json';
import court from '../fixtures/reference-court.json';
it('validates the proposed arranged view through real local move/quote/payment contracts',async()=>{
 const t=createFakeIslandTransport({coins:8000,version:2,flags:{wall_recovery:true,perimeter_walls:true}});t.dev.setWaveBest(40);
 const api=createIslandApi({transport:t}),walls=createWallBuilderApi({transport:t}),report={moves:[],quotes:[]};let uid=0;
 for(const [spot,kind] of [['cannon_1','cannon'],['cannon_2','mortar'],['cannon_3','cannon'],['cannon_4','harpoon'],['tower_1','watchtower'],['house_1','house'],['house_2','house']])expect((await api.build({spot,kind})).ok).toBe(true);
 expect((await walls.enableWalls()).ok).toBe(true);
 async function buy(cells){const q=await walls.quoteWalls({cells});report.quotes.push(q);if(!q.ok)return q;return walls.buildWalls({placements:q.data.placements,quotedTotal:q.data.totalCost,islandEpoch:q.data.islandEpoch,actionUid:`arranged-build-${++uid}`});}
 for(let n=0;n<ring.cells.length;n+=32)expect((await buy(ring.cells.slice(n,n+32).map(([x,z])=>({x,z})))).ok).toBe(true);
 expect((await api.upgrade({spot:'wall_1'})).ok).toBe(true);
 for(const [spot,x,z] of court.moves)report.moves.push({spot,x,z,answer:await api.move({spot,x,z})});
 const cells=court.cells.map(([x,z])=>({x,z}));
 const inner=await buy(cells);report.inner=inner;
 if(inner.ok)for(const row of inner.data.receipt.placements)for(let level=2;level<=3;level++)expect((await api.upgrade({spot:row.spot})).ok).toBe(true);
 const current=(await api.getIsland()).data;report.result={coins:current.coins,walls:current.spots.filter(s=>s.built&&s.kind==='wall').length};
 expect(report.moves.map(m=>({spot:m.spot,ok:m.answer.ok,code:m.answer.code}))).toEqual(['cannon_1','cannon_2','cannon_3','cannon_4'].map(spot=>({spot,ok:true,code:undefined})));
 expect(inner.ok,inner.message).toBe(true);expect(report.result).toEqual({coins:5190,walls:123});
});
