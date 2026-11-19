// Definitive controller refusal permits fresh fences; uncertain outcomes retain the original body.
import {it,expect,vi} from 'vitest';
import {createSharedRevivalApi} from '../../src/island/shared-revival-api.js';
import {actorId,economy,origin,proof} from './shared-session-fixture.js';
import {waveId,token} from './shared-wave-fixture.js';
const fallId='dddddddd-dddd-4ddd-8ddd-dddddddddddd',holdId='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',newHold='77777777-7777-4777-8777-777777777777';
const intent=()=>({origin:origin(),waveId,targetToken:token,fallId,holdId});
const reconnected=()=>({...proof(),sessionId:'66666666-6666-4666-8666-666666666666',connectionGeneration:String(BigInt(proof().connectionGeneration)+1n)});
function receipt(body){return {status:'done',repeat:false,receipt:{receiptId:'ffffffff-ffff-4fff-8fff-ffffffffffff',actionUid:body.actionUid,action:'wave_revive',actorId,origin:origin(),
 result:{waveId,targetToken:token,fallId,holdId:body.holdId,downAtTick:2,eventSeq:10,reviveSeq:10,restoredHPUnits:500000}}};}
function fixture(){
 let actor=actorId,selected=economy(),live=proof();const rows=new Map(),makeUid=vi.fn(()=> 'reconnect_revive_uid_001');
 const transport={post:vi.fn(async(_path,body)=>({ok:true,data:receipt(body)}))};
 const api=createSharedRevivalApi({transport,getEconomy:()=>selected,getActorId:()=>actor,getProof:()=>live,
  storage:{getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,value),removeItem:key=>rows.delete(key)},makeUid});
 return {api,transport,rows,makeUid,setActor:value=>{actor=value;},setProof:value=>{live=value;},setEconomy:value=>{selected=value;}};
}
it('refreshes a definitively refused old generation after legitimate same-actor reconnect with the original UID/fall',async()=>{
 const f=fixture();f.transport.post.mockImplementation(async(_path,body)=>body.sessionId===reconnected().sessionId && body.connectionGeneration===reconnected().connectionGeneration
  ?{ok:true,data:receipt(body)}:{ok:false,status:403,code:'not_controller'});
 expect((await f.api.complete(intent())).code).toBe('not_controller');const old=structuredClone(f.transport.post.mock.calls[0][1]);
 f.setProof(reconnected());expect((await f.api.complete({...intent(),holdId:newHold})).ok).toBe(true);
 const next=f.transport.post.mock.calls[1][1];expect(next).toEqual({...old,holdId:newHold,sessionId:reconnected().sessionId,connectionGeneration:reconnected().connectionGeneration});
 expect(f.makeUid).toHaveBeenCalledOnce();expect(f.rows.size).toBe(0);
});
it.each([[0,'not_controller'],[401,'not_controller'],[429,'not_controller'],[500,'not_controller'],[503,'not_controller'],[403,'not_member'],[403,'not_in_wave'],[403,'forbidden'],[409,'not_controller']])('retains the original body across %s/%s despite caller proof/hold changes',async(status,code)=>{
 const f=fixture();f.transport.post.mockResolvedValueOnce({ok:false,status,code});await f.api.complete(intent());const old=structuredClone(f.transport.post.mock.calls[0][1]);
 f.setProof(reconnected());expect((await f.api.complete({...intent(),holdId:newHold})).ok).toBe(true);
 expect(f.transport.post.mock.calls[1][1]).toEqual(old);expect(f.makeUid).toHaveBeenCalledOnce();
});
it.each(['missing-proof','replacement-origin'])('requires the original current origin and fresh controlling proof after a definitive refusal (%s)',async boundary=>{
 const f=fixture();f.transport.post.mockResolvedValueOnce({ok:false,status:403,code:'not_controller'});await f.api.complete(intent());const saved=[...f.rows.values()];
 if(boundary==='missing-proof')f.setProof(null);else{
  const next={...origin(),accountId:'88888888-8888-4888-8888-888888888888',runEpoch:'99999999-9999-4999-8999-999999999999'};
  f.setEconomy({...economy(),...next});f.setProof({...reconnected(),origin:next});
 }
 expect((await f.api.complete({...intent(),holdId:newHold})).code).toBe('session_context_required');
 expect(f.transport.post).toHaveBeenCalledOnce();expect(f.makeUid).toHaveBeenCalledOnce();expect([...f.rows.values()]).toEqual(saved);
});
it('does not reinterpret a response across an authenticated actor change as permission to refresh its old request',async()=>{
 const f=fixture();let release;f.transport.post.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
 const pending=f.api.complete(intent());await vi.waitFor(()=>expect(release).toBeTypeOf('function'));const old=structuredClone(f.transport.post.mock.calls[0][1]);
 f.setActor('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');release({ok:false,status:403,code:'not_controller'});
 expect((await pending).code).toBe('auth_context_changed');f.setActor(actorId);f.setProof(reconnected());
 expect((await f.api.complete({...intent(),holdId:newHold})).ok).toBe(true);expect(f.transport.post.mock.calls[1][1]).toEqual(old);
 expect(f.makeUid).toHaveBeenCalledOnce();
});
