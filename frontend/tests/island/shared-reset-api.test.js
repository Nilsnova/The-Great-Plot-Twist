// A reset's original actor/code identity survives observing replacement context before its lost reply.
import {it,expect,vi} from 'vitest';
import {createSharedResetApi} from '../../src/island/shared-reset-api.js';
import {actorId,economy,origin} from './shared-session-fixture.js';
import {resetReply} from './shared-reset-fixture.js';
function fixture(rows=new Map()){
 let selected=economy(),actor=actorId,allowed=true,allocated=0;
 const transport={post:vi.fn(async(_path,body)=>({ok:true,data:resetReply(body)}))};
 const api=createSharedResetApi({transport,getEconomy:()=>selected,getActorId:()=>actor,getCode:()=> 'ISLE-K7Q2M',canReset:()=>allowed,
  storage:{getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,value),removeItem:key=>rows.delete(key)},makeUid:()=>`original_reset_uid_${++allocated}`});
 return {api,transport,rows,allocated:()=>allocated,setEconomy:value=>{selected=value;},setActor:value=>{actor=value;},setAllowed:value=>{allowed=value;}};
}
it('retains the original reset body through unknown401/reload and a newly observed account/epoch',async()=>{
 const f=fixture();f.transport.post.mockResolvedValue({ok:false,status:0});await f.api.reset('K7Q2M');const original=structuredClone(f.transport.post.mock.calls[0][1]);
 const next=fixture(f.rows);next.setEconomy({...economy(),accountId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',runEpoch:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'});next.setAllowed(false);
 next.transport.post.mockResolvedValueOnce({ok:false,status:401});await next.api.reset('ISLE-K7Q2M');expect(next.transport.post.mock.calls[0][1]).toEqual(original);
 const answer=await next.api.reset('ISLE-K7Q2M');expect(answer.ok).toBe(true);expect(next.transport.post.mock.calls[1][1]).toEqual(original);expect(next.allocated()).toBe(0);expect(next.rows.size).toBe(0);
 expect(original).toEqual({economy:{mode:'island_shared',version:1,islandOwner:actorId,runEpoch:origin().runEpoch},actionUid:'original_reset_uid_1',confirmCode:'ISLE-K7Q2M'});
 expect(answer.data.currentEconomy).toBeNull();
});
it.each(['projection','origin','effects','conservation','grant','replacement'])('keeps the original UID on malformed successful reset %s',async kind=>{
 const f=fixture();f.transport.post.mockImplementation(async(_path,body)=>{const data=resetReply(body);
  if(kind==='projection')data.currentEconomy=economy();if(kind==='origin')data.receipt.origin.accountId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  if(kind==='effects')data.receipt.result.effects.controlsRevoked=true;if(kind==='conservation')data.receipt.result.retiredTreasury.availableCoins='100';
  if(kind==='grant')data.receipt.result.startingCoins=200;if(kind==='replacement')data.receipt.result.newRunEpoch=origin().runEpoch;
  return {ok:true,data};});
 expect((await f.api.reset('K7Q2M')).ok).toBe(false);expect(f.api.pending('K7Q2M').body.actionUid).toBe('original_reset_uid_1');expect(f.allocated()).toBe(1);
});
it('accepts exact uncapped grant strings and never allocates a reset from unknown, member or unavailable state',async()=>{
 const f=fixture();f.transport.post.mockImplementation(async(_path,body)=>{const data=resetReply(body);data.receipt.result.startingCoins='1'+'0'.repeat(5000);return {ok:true,data};});
 expect((await f.api.reset('K7Q2M')).data.receipt.result.startingCoins).toHaveLength(5001);
 f.setEconomy(null);expect((await f.api.reset('K7Q2M')).ok).toBe(false);f.setEconomy({...economy(),islandOwner:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'});expect((await f.api.reset('K7Q2M')).ok).toBe(false);
 f.setEconomy(economy());f.setAllowed(false);expect((await f.api.reset('K7Q2M')).ok).toBe(false);expect(f.transport.post).toHaveBeenCalledOnce();
});
it('fences an actor change during a reset response without clearing its original intent',async()=>{
 const f=fixture();let release;f.transport.post.mockImplementation((_path,body)=>new Promise(resolve=>{release=()=>resolve({ok:true,data:resetReply(body)});}));
 const pending=f.api.reset('K7Q2M');await vi.waitFor(()=>expect(release).toBeTypeOf('function'));f.setActor('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');release();expect((await pending).ok).toBe(false);
 f.setActor(actorId);expect(f.api.pending('K7Q2M').body.actionUid).toBe('original_reset_uid_1');
});
it('refuses corrupt original retry storage without allocating a replacement UID or sending',async()=>{
 const f=fixture();f.rows.set(`plot_twist_native_reset_v1:${actorId}:K7Q2M`,'{broken');
 expect((await f.api.reset('K7Q2M')).code).toBe('reset_retry_unavailable');expect(f.allocated()).toBe(0);expect(f.transport.post).not.toHaveBeenCalled();
});
