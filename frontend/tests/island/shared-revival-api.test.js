// Free completion retains one immutable fall intent through unknown outcome and refreshed source fences.
import {it,expect,vi} from 'vitest';
import {createSharedRevivalApi} from '../../src/island/shared-revival-api.js';
import {actorId,economy,origin,proof} from './shared-session-fixture.js';
import {waveId,token} from './shared-wave-fixture.js';
const fallId='dddddddd-dddd-4ddd-8ddd-dddddddddddd',holdId='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const intent=()=>({origin:origin(),waveId,targetToken:token,fallId,holdId});
function receipt(body){return {status:'done',repeat:true,receipt:{receiptId:'ffffffff-ffff-4fff-8fff-ffffffffffff',actionUid:body.actionUid,action:'wave_revive',actorId,origin:origin(),
 result:{waveId,targetToken:token,fallId,holdId:body.holdId,downAtTick:2,eventSeq:10,reviveSeq:10,restoredHPUnits:500000}}};}
function fixture(rows=new Map()){
 let selected=economy(),actor=actorId;const transport={post:vi.fn(async(_path,body)=>({ok:true,data:receipt(body)}))};
 const storage={getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,value),removeItem:key=>rows.delete(key)};
 const api=createSharedRevivalApi({transport,getEconomy:()=>selected,getActorId:()=>actor,getProof:()=>proof(),storage,makeUid:()=> 'free_revive_uid_001'});
 return {api,transport,rows,setEconomy:value=>{selected=value;},setActor:value=>{actor=value;}};
}
it('retains the exact original completion body after unknown401 even when a caller supplies a different hold',async()=>{
 const f=fixture();f.transport.post.mockResolvedValue({ok:false,status:0});await f.api.complete(intent());const original=structuredClone(f.transport.post.mock.calls[0][1]);
 const next=fixture(f.rows);next.transport.post.mockResolvedValueOnce({ok:false,status:401});await next.api.complete({...intent(),holdId:'11111111-1111-4111-8111-111111111111'});
 expect(next.transport.post.mock.calls[0][1]).toEqual(original);expect((await next.api.complete(intent())).ok).toBe(true);expect(next.rows.size).toBe(0);
 expect(next.transport.post.mock.calls[1][1]).toEqual(original);expect(original).not.toHaveProperty('hpUnits');expect(original.economy).not.toHaveProperty('accountId');
});
it('refreshes definitive hold/proof refusals with the same immutable completion UID and fall',async()=>{
 const f=fixture();f.transport.post.mockResolvedValueOnce({ok:false,status:409,code:'health_sync_required'});await f.api.complete(intent());
 const old=f.transport.post.mock.calls[0][1];await f.api.complete({...intent(),holdId:'11111111-1111-4111-8111-111111111111'});
 expect(f.transport.post.mock.calls[1][1]).toMatchObject({actionUid:old.actionUid,fallId:old.fallId,holdId:'11111111-1111-4111-8111-111111111111'});
});
it('retains pending identity on malformed successful facts and never exposes a journaled or HP patch shortcut',async()=>{
 const f=fixture();f.transport.post.mockImplementationOnce(async(_path,body)=>{const data=receipt(body);data.receipt.result.reviveSeq=11;return {ok:true,data};});
 expect((await f.api.complete(intent())).ok).toBe(false);expect(f.rows.size).toBe(1);
 const answer=await f.api.complete(intent());expect(answer.ok).toBe(true);expect(answer.data).not.toHaveProperty('journaled');expect(answer.data).not.toHaveProperty('hpUnits');
});
