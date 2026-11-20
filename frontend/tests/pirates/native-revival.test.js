// Actual hold orchestration flushes native Captain facts and waits for the committed journal restore.
import {it,expect,vi} from 'vitest';
import {createNativeRevival} from '../../src/pirates/native-revival.js';
import {origin} from '../island/shared-session-fixture.js';
import {waveId,token} from '../island/shared-wave-fixture.js';
const fallId='cccccccc-cccc-4ccc-8ccc-cccccccccccc',holdId='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
function fixture(){
 let clock=1000;const target={id:token,hp:0,down:true,downAt:.1},current={info:{waveId,initialSnapshot:{economy:origin()}},state:{party:[target]},offset:0,revive:null};
 const order=[],sync=vi.fn(async()=>{order.push('report');return {ok:true,captains:{[token]:{hpUnits:0,downAtTick:2,fallId,reviveBasisSeq:0}}};});
 const send=vi.fn(async command=>{order.push(command.type);return {ok:true,event:{payload:{hold:{holdId,startedAt:new Date(1000).toISOString(),requiredMs:2000,repeat:false}}}};});
 const complete=vi.fn(async()=>{order.push('complete');return {ok:true,data:{}};});const ctl={wave:current,controls:()=>true,now:()=>clock};
 const revival=createNativeRevival(ctl,{sync,send,complete});return {revival,current,target,ctl,order,sync,send,complete,setNow:value=>{clock=value;}};
}
it('reports both sides before start and completion, sends no elapsed/HP proof and waits for journal HP',async()=>{
 const f=fixture();f.revival.update(f.current,f.target,true);await vi.waitFor(()=>expect(f.current.revive?.stage).toBe('holding'));
 f.setNow(3001);f.revival.update(f.current,f.target,true);await vi.waitFor(()=>expect(f.complete).toHaveBeenCalledOnce());
 expect(f.order).toEqual(['report','captain_revive_hold_start','report','complete']);expect(f.complete.mock.calls[0][0]).toEqual({origin:origin(),waveId,targetToken:token,fallId,holdId});
 expect(f.current.revive.stage).toBe('waiting_journal');expect(f.target.hp).toBe(0);expect(f.target.down).toBe(true);
});
it('orders a late cancelled start before cancellation and never lets its old cancellation touch a newer hold',async()=>{
 const f=fixture();let started,cancelled;
 f.send.mockImplementationOnce(()=>new Promise(resolve=>{started=resolve;})).mockImplementationOnce(()=>new Promise(resolve=>{cancelled=resolve;}));
 f.revival.update(f.current,f.target,true);await vi.waitFor(()=>expect(started).toBeTypeOf('function'));f.revival.update(f.current,null,false);
 started({ok:true,event:{payload:{hold:{holdId,startedAt:new Date(1000).toISOString(),requiredMs:2000,repeat:false}}}});
 await vi.waitFor(()=>expect(cancelled).toBeTypeOf('function'));f.revival.update(f.current,f.target,true);expect(f.send).toHaveBeenCalledTimes(2);
 cancelled({ok:true,event:{payload:{cancelled:true}}});await vi.waitFor(()=>expect(f.current.revive).toBeNull());f.revival.update(f.current,f.target,true);
 await vi.waitFor(()=>expect(f.send).toHaveBeenCalledTimes(3));expect(f.send.mock.calls.map(row=>row[0].type)).toEqual(['captain_revive_hold_start','captain_revive_hold_cancel','captain_revive_hold_start']);
});
it('retries completion after strict health sync with the same immutable fall and no local restore',async()=>{
 const f=fixture();f.complete.mockResolvedValueOnce({ok:false,status:409,code:'health_sync_required'});
 f.revival.update(f.current,f.target,true);await vi.waitFor(()=>expect(f.current.revive?.stage).toBe('holding'));f.setNow(3001);f.revival.update(f.current,f.target,true);
 await vi.waitFor(()=>expect(f.complete).toHaveBeenCalledOnce());f.setNow(3501);f.revival.update(f.current,f.target,true);await vi.waitFor(()=>expect(f.complete).toHaveBeenCalledTimes(2));
 expect(f.complete.mock.calls[1][0]).toEqual(f.complete.mock.calls[0][0]);expect(f.target.hp).toBe(0);
});
it.each(['hold_invalidated','hold_missing'])('starts a new ordered interval after definitive %s',async code=>{
 const f=fixture();f.complete.mockResolvedValueOnce({ok:false,status:409,code});
 f.revival.update(f.current,f.target,true);await vi.waitFor(()=>expect(f.current.revive?.stage).toBe('holding'));f.setNow(3001);f.revival.update(f.current,f.target,true);
 await vi.waitFor(()=>expect(f.complete).toHaveBeenCalledOnce());expect(f.current.revive.stage).toBe('starting');expect(f.current.revive.holdId).toBeNull();expect(f.current.revive.share).toBe(0);
 f.setNow(3501);f.revival.update(f.current,f.target,true);await vi.waitFor(()=>expect(f.send).toHaveBeenCalledTimes(2));expect(f.send.mock.calls[1][0]).toEqual(f.send.mock.calls[0][0]);expect(f.target.hp).toBe(0);
});
