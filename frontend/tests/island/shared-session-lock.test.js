// Actor-global document locks fence cloned retry storage before a controller proof is exposed.
import {it,expect} from 'vitest';
import {createSessionTabLock} from '../../src/island/shared-session-lock.js';
import {actorId} from './shared-session-fixture.js';
function locks(){
 const held=new Set();return {async request(name,_options,run){
  if(held.has(name))return run(null);held.add(name);try{return await run({name});}finally{held.delete(name);}
 }};
}
it('admits only one document for the actor across island selections',async()=>{
 const provider=locks(),first=createSessionTabLock({locks:provider}),second=createSessionTabLock({locks:provider});
 const a=await first.acquire(actorId);expect(a.current).toBe(true);expect(await second.acquire(actorId)).toBeNull();
 a.release();await Promise.resolve();const b=await second.acquire(actorId);expect(b.current).toBe(true);second.dispose();expect(b.current).toBe(false);
});
it('does not treat missing Web Locks as single-tab authority',async()=>{
 const lock=createSessionTabLock({locks:null});expect(await lock.acquire(actorId)).toBeNull();lock.dispose();
});
it('lets a different actor use a separate lock and stale release cannot revoke the newer actor',async()=>{
 const provider=locks(),lock=createSessionTabLock({locks:provider}),old=await lock.acquire(actorId);
 const current=await lock.acquire('66666666-6666-4666-8666-666666666666');old.release();
 expect(current.current).toBe(true);expect(old.current).toBe(false);lock.dispose();
});
it('cancels a pending acquisition when disposed, including a later callback',async()=>{
 let enter;const lock=createSessionTabLock({locks:{request:async(_name,_options,run)=>new Promise(resolve=>{enter=()=>resolve(run({}));})}});
 const pending=lock.acquire(actorId);lock.dispose();expect(await pending).toBeNull();await enter();expect(await lock.acquire(actorId)).toBeNull();
});
