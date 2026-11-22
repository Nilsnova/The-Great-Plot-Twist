// Exact stored-prefix Captain reports learn only server fall identity; they never replace simulated HP.
import {it,expect,vi} from 'vitest';
import {createCaptainSynchronizer} from '../../src/pirates/canonical-captains.js';
import {nativeWave,token} from '../island/shared-wave-fixture.js';
const acceptedReport=report=>({accepted:true,repeated:false,throughTick:report.throughTick,inputHeadSeq:report.inputHeadSeq,
 captains:Object.fromEntries(Object.entries(report.captains).map(([key,value])=>[key,{...value,fallId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'}]))});
function fixture(){
 const order=[],current={info:nativeWave(),state:{party:[{id:token,hp:0,maxHp:100,down:true,downAt:.1,withdrawn:false,reviveBasisSeq:0}]},
  recoveryReplay:{canAdvanceThrough(tick){return tick>=0 && tick<=this.sealedThroughTick;},sealedThroughTick:2,headSeq:3},recoveryDriver:{nextTick:3}};
 const send=vi.fn(async({report})=>{order.push('report');return acceptedReport(report);});
 const advance=vi.fn(()=>{order.push('replay');return true;});
 const sync=createCaptainSynchronizer({getCurrent:()=>current,controls:()=>true,flush:async()=>{order.push('flush');return true;},fetch:async()=>{order.push('fetch');return true;},
  advance,send,makeUid:vi.fn().mockReturnValueOnce('captain_report_uid_001').mockReturnValue('captain_report_uid_002')});
 return {current,order,send,sync,advance};
}
it('flushes, fetches and replays before reporting the full retained roster and accepting a server fall ID',async()=>{
 const f=fixture();expect((await f.sync()).ok).toBe(true);expect(f.order).toEqual(['flush','fetch','replay','report']);
 expect(f.send.mock.calls[0][0].report).toEqual({waveProtocol:2,checkpointUid:'captain_report_uid_001',throughTick:2,inputHeadSeq:3,
  captains:{[token]:{hpUnits:0,downAtTick:2,reviveBasisSeq:0}}});expect(f.current.captainFacts.captains[token].fallId).toBe('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
 expect(f.current.state.party[0].hp).toBe(0);
});
it('rejects a successful-looking altered HP/prefix response without changing local HP or fall identity',async()=>{
 const f=fixture();f.send.mockResolvedValue({accepted:true,repeated:false,throughTick:2,inputHeadSeq:3,captains:{[token]:{hpUnits:1000000,downAtTick:null,reviveBasisSeq:0,fallId:null}}});
 expect((await f.sync()).ok).toBe(false);expect(f.current.captainFacts).toBeUndefined();expect(f.current.state.party[0].hp).toBe(0);
});
it('refuses incomplete replay or a missing retained Captain before sending any report',async()=>{
 const f=fixture();f.current.recoveryDriver.nextTick=2;expect((await f.sync()).ok).toBe(false);expect(f.send).not.toHaveBeenCalled();
 f.current.recoveryDriver.nextTick=3;f.current.state.party=[];expect((await f.sync()).ok).toBe(false);expect(f.send).not.toHaveBeenCalled();
});
it('reports the played prefix without flushing, fetching or advancing to the newest seal',async()=>{
 const f=fixture();f.current.recoveryReplay.sealedThroughTick=20;
 expect((await f.sync({refresh:false})).ok).toBe(true);
 expect(f.order).toEqual(['report']);
 expect(f.send.mock.calls[0][0].report).toMatchObject({throughTick:2,inputHeadSeq:3});
 expect(f.current.recoveryDriver.nextTick).toBe(3);
});
it('refreshes the seal for an explicit revival after an in-flight periodic report',async()=>{
 const f=fixture();let finishReport;
 f.current.recoveryReplay.sealedThroughTick=20;
 f.send.mockImplementationOnce(({report})=>new Promise(resolve=>{finishReport=()=>resolve(acceptedReport(report));}));
 f.advance.mockImplementation((_current,tick)=>{f.order.push('replay');f.current.recoveryDriver.nextTick=tick+1;return true;});
 const periodic=f.sync({refresh:false}),revival=f.sync(),secondRevival=f.sync();
 expect(f.send).toHaveBeenCalledOnce();expect(f.advance).not.toHaveBeenCalled();
 finishReport();
 expect(await periodic).toMatchObject({ok:true,throughTick:2});
 expect(await revival).toMatchObject({ok:true,throughTick:20});
 expect(await secondRevival).toMatchObject({ok:true,throughTick:20});
 expect(f.order).toEqual(['flush','fetch','replay','report']);
 expect(f.send).toHaveBeenCalledTimes(2);
});
