// One actor-global Web Lock stays held for this document's entire controlling session lifetime.
import {uuid} from './shared-quotes.js';
export function createSessionTabLock({locks=globalThis.navigator?.locks}={}){
 let closed=false,epoch=0,owner=null,pending=null;
 function release(){
  epoch++;pending?.resolve(null);pending=null;
  const before=owner;owner=null;before?.finish();
 }
 return {
  acquire(actorId){
   release();
   if(closed || !uuid(actorId) || typeof locks?.request!=='function')return Promise.resolve(null);
   const ticket=epoch;
   return new Promise(resolve=>{
    pending={resolve,ticket};
    Promise.resolve().then(()=>locks.request(`plot_twist_controller:${actorId}`,{mode:'exclusive',ifAvailable:true},async lock=>{
     if(!lock || closed || epoch!==ticket){if(pending?.ticket===ticket){pending=null;resolve(null);}return;}
     let finish;const held=new Promise(done=>{finish=done;});
     const current={finish,ticket};owner=current;pending=null;
     resolve(Object.freeze({get current(){return !closed && owner===current && epoch===ticket;},release(){if(owner===current)release();}}));
     await held;if(owner===current)owner=null;
    })).catch(()=>{if(pending?.ticket===ticket){pending=null;resolve(null);}});
   });
  },
  release,dispose(){closed=true;release();},
 };
}
