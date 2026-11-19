// Unknown source attachments remain inert across navigation, without losing their original identity.
import {it,expect} from 'vitest';
import {createSessionIntents} from '../../src/island/shared-session-intents.js';
import {actorId,origin,metadata,sessionId} from './shared-session-fixture.js';
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
