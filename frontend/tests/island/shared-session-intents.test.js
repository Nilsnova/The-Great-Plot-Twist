// Unknown source attachments remain inert across navigation, without losing their original identity.
import {it,expect} from 'vitest';
import {createSessionIntents} from '../../src/island/shared-session-intents.js';
import {actorId,origin,metadata,sessionId,proof} from './shared-session-fixture.js';
function setup(){
 const rows=new Map();let count=0;
 const storage={getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,value),removeItem:key=>rows.delete(key)};
 const intents=createSessionIntents({storage,makeUid:()=>`original_uid_${++count}`,makeSessionId:()=>sessionId});
 return {intents,rows,count:()=>count};
}
const elsewhere=()=>({...origin(),islandOwner:'66666666-6666-4666-8666-666666666666',accountId:'77777777-7777-4777-8777-777777777777',runEpoch:'88888888-8888-4888-8888-888888888888'});
it('archives an unknown original attachment without replacing or replaying its body at the destination',()=>{
 const f=setup(),old=f.intents.begin(actorId,origin()),next=f.intents.begin(actorId,elsewhere());
 expect(next.origin).toEqual(elsewhere());expect(next.body.actionUid).not.toBe(old.body.actionUid);
 expect([...f.rows.values()].some(value=>JSON.parse(value).actionUid===old.body.actionUid)).toBe(true);
 expect(f.intents.begin(actorId,elsewhere())).toEqual(next);expect(f.count()).toBe(2);
});
it('restores the exact original attachment only when that source is selected again',()=>{
 const f=setup(),old=f.intents.begin(actorId,origin());f.intents.begin(actorId,elsewhere());
 expect(f.intents.begin(actorId,origin())).toEqual(old);expect(f.count()).toBe(2);
});
it('never resurrects a resolved archived attachment after a later definitive controller refusal',()=>{
 const f=setup(),old=f.intents.begin(actorId,origin());f.intents.begin(actorId,elsewhere());f.intents.begin(actorId,origin());
 f.intents.confirm(old,metadata());const reconnect=f.intents.begin(actorId,origin());f.intents.refuse(reconnect);
 expect(f.intents.begin(actorId,origin()).body.actionUid).not.toBe(old.body.actionUid);
});
it('persists a known departure exactly through retries and removes only its original descriptor',()=>{
 const f=setup(),opening=f.intents.begin(actorId,origin());f.intents.confirm(opening,metadata());
 const old=f.intents.depart(actorId);expect(f.intents.depart(actorId)).toEqual(old);
 expect(old).toMatchObject({actionUid:'original_uid_2',connectionGeneration:'9007199254740993',origin:origin()});
 expect(()=>f.intents.begin(actorId,elsewhere())).toThrow();
 f.intents.departed(old);expect(f.intents.read(actorId)).toBeNull();expect(f.intents.departure(actorId)).toBeNull();
 expect(f.intents.begin(actorId,elsewhere()).origin).toEqual(elsewhere());
});
it('never invents departure proof for an uncertain attachment',()=>{
 const f=setup();f.intents.begin(actorId,origin());expect(f.intents.depart(actorId)).toBeNull();expect(f.count()).toBe(1);
});
it('retains the original settings change and source proof until its own confirmation',()=>{
 const f=setup(),original=f.intents.changeSettings(proof(),{autoNext:false});
 expect(f.intents.changeSettings(proof(),{autoNext:true})).toEqual(original);expect(original.actionUid).toBe('original_uid_1');
 f.intents.changedSettings(original);expect(f.intents.changeSettings(proof(),{autoNext:true}).actionUid).toBe('original_uid_2');
});
it('retires only confirmed old-source local descriptors while preserving an unknown attachment',()=>{
 const f=setup(),opening=f.intents.begin(actorId,origin());f.intents.confirm(opening,metadata());f.intents.depart(actorId);f.intents.changeSettings(proof(),{autoNext:false});
 f.intents.retire(actorId,origin());expect(f.intents.read(actorId)).toBeNull();expect(f.intents.departure(actorId)).toBeNull();expect(f.intents.settings(actorId)).toBeNull();
 const unknown=f.intents.begin(actorId,origin());f.intents.retire(actorId,origin());expect(f.intents.begin(actorId,origin())).toEqual(unknown);
});
