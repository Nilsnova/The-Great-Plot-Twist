// Session transport never upgrades a stored attach projection into current controller authority.
import {describe,it,expect,vi} from 'vitest';
import {createSharedSessionApi} from '../../src/island/shared-session-api.js';
import {readSessionMetadata} from '../../src/island/shared-session-shapes.js';
import {actorId,sessionId,economy,metadata,proof,attachRecord,assertion,controlReceipt} from './shared-session-fixture.js';
const options={headers:{'X-Island-Economy-Version':'1'}};
function setup(){
 let actor=actorId,selected=economy(),reply=metadata();const transport={get:vi.fn(async()=>({ok:true,data:reply})),post:vi.fn(async()=>({ok:true,data:reply}))};
 const api=createSharedSessionApi({transport,getActorId:()=>actor,getEconomy:()=>selected});
 return {api,transport,setActor:value=>{actor=value;},setEconomy:value=>{selected=value;},setReply:value=>{reply=value;}};
}
describe('canonical session metadata',()=>{
 it('retains exact generation and nonce topic without coercion',()=>{
  const read=readSessionMetadata(metadata());expect(read.session.connectionGeneration).toBe('9007199254740993');
  expect(read.session.place).toBe('isle_k7q2m_0123456789abcdef01234567');expect(readSessionMetadata(metadata(false))).not.toBeNull();
 });
 it.each([
  ['connectionGeneration',1],['connectionGeneration','01'],['isController','true'],['isSpectator',true],
  ['place','isle_k7q2m'],['place','isle_k7q2m_0123456789abcdef0123456g'],['countdownSeconds','10'],['countdownSeconds',61],
  ['topicGeneration',2],['leaderId','unknown'],['graceUntil','tomorrow'],
 ])('refuses malformed session %s=%j',(field,value)=>{const data=metadata();data.session[field]=value;expect(readSessionMetadata(data)).toBeNull();});
 it('refuses spectator disclosure of another controller identity',()=>{const data=metadata(false);data.session.sessionId=sessionId;expect(readSessionMetadata(data)).toBeNull();});
});
describe('canonical session HTTP',()=>{
 it('uses only a caller-held proof for current GET and carries the negotiated capability',async()=>{
  const f=setup();expect((await f.api.read(proof())).ok).toBe(true);
  expect(f.transport.get).toHaveBeenCalledExactlyOnceWith(`/api/island/session?islandOwner=${actorId}&runEpoch=${economy().runEpoch}&sessionId=${sessionId}&connectionGeneration=9007199254740993`,options);
 });
 it('reads spectators without any stored proof and rejects unrequested controller disclosure',async()=>{
  const f=setup();expect((await f.api.read()).code).toBe('unreadable');f.setReply(metadata(false));
  expect((await f.api.read()).ok).toBe(true);expect(f.transport.get.mock.calls[1][0]).not.toContain('sessionId');
 });
 it('accepts an actor-owned historical attachment after epoch change without a fresh control claim',async()=>{
  const f=setup(),record=attachRecord();f.setEconomy({...economy(),runEpoch:'66666666-6666-4666-8666-666666666666'});
  expect((await f.api.attach(record)).ok).toBe(true);expect(f.transport.post).toHaveBeenCalledExactlyOnceWith('/api/island/session/attach',record.body,options);
  expect(f.transport.get).not.toHaveBeenCalled();expect((await f.api.read(proof())).ok).toBe(false);
 });
 it('accepts equivalent JSON assertion key order without changing the original request',async()=>{
  const f=setup(),record=attachRecord(),old=record.body.economy;record.body.economy={runEpoch:old.runEpoch,islandOwner:old.islandOwner,version:old.version,mode:old.mode};
  expect((await f.api.attach(record)).ok).toBe(true);expect(f.transport.post.mock.calls[0][1]).toEqual(record.body);
 });
 it('rejects another actor or malformed attach request before dispatch',async()=>{
  const f=setup(),record=attachRecord();record.actorId='66666666-6666-4666-8666-666666666666';
  expect((await f.api.attach(record)).ok).toBe(false);record.actorId=actorId;record.body.accountId=economy().accountId;
  expect((await f.api.attach(record)).ok).toBe(false);expect(f.transport.post).not.toHaveBeenCalled();
 });
 it('does not accept another session generation from the fresh GET',async()=>{
  const f=setup(),data=metadata();data.session.connectionGeneration='9007199254740994';f.setReply(data);
  expect((await f.api.read(proof())).code).toBe('unreadable');
 });
 it('sends frozen proof for heartbeat/disconnect and keeps old-origin disconnect after navigation',async()=>{
  const f=setup();expect((await f.api.heartbeat(proof())).ok).toBe(true);
  expect(f.transport.post.mock.calls[0]).toEqual(['/api/island/session/heartbeat',{economy:assertion(),sessionId,connectionGeneration:'9007199254740993'},options]);
  f.setEconomy({...economy(),runEpoch:'66666666-6666-4666-8666-666666666666'});f.setReply(metadata(false));
  expect((await f.api.disconnect(proof())).ok).toBe(true);
  expect(f.transport.post.mock.calls[1][1].economy.runEpoch).toBe(economy().runEpoch);
 });
 it('refuses to heartbeat an old origin after navigation',async()=>{
  const f=setup();f.setEconomy({...economy(),runEpoch:'66666666-6666-4666-8666-666666666666'});
  expect((await f.api.heartbeat(proof())).ok).toBe(false);expect(f.transport.post).not.toHaveBeenCalled();
 });
 it('rejects an actor switch during an otherwise successful read',async()=>{
  const f=setup();let release;f.transport.get.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
  const reading=f.api.read(proof());f.setActor('66666666-6666-4666-8666-666666666666');release({ok:true,data:metadata()});
  expect((await reading).status).toBe(0);
 });
 it('validates common leave/settings historical receipts independently of nullable live projections',async()=>{
  const f=setup(),record={...proof(),actionUid:'leave_original_001'};
  f.setReply(controlReceipt('session_leave',record));expect((await f.api.leave(record)).ok).toBe(true);
  f.setReply(controlReceipt('session_settings',record));expect((await f.api.settings({...record,breakPaused:true})).ok).toBe(true);
  const bad=controlReceipt('session_leave',record);bad.receipt.actorId='66666666-6666-4666-8666-666666666666';f.setReply(bad);
  expect((await f.api.leave(record)).code).toBe('unreadable');
 });
});
