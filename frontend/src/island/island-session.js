// Bind the document-held canonical session to the selected, visible island; no second context store.
import {readEconomy,sameEconomyScope} from './economy-view.js';
import {createSharedSessionApi} from './shared-session-api.js';
import {createSharedSessionClient} from './shared-session-client.js';
import {uuid} from './shared-quotes.js';
import {sessionOrigin} from './shared-session-shapes.js';

export function createIslandSession(isl,{client=null,windowTarget=globalThis,documentTarget=globalThis.document}={}){
 let disposed=false,suspended=false,accepted=null,reconcileQueued=false;
 const selected=()=>!disposed && !suspended && documentTarget?.hidden!==true && !isl.disposed && isl.mode!=='fake' && isl.isOnIsland()
  && !!readEconomy(isl.getEconomy()) && isl.domainAvailable('session');
 const control=client??createSharedSessionClient({
  api:createSharedSessionApi({transport:isl.islandTransport,getEconomy:isl.getEconomy,getActorId:isl.getActorId}),
  getEconomy:()=>selected()?isl.getEconomy():null,getActorId:isl.getActorId,getAuthGeneration:isl.authGeneration,storage:isl.storage,
  onAttached:async proof=>{
   const actor=isl.getActorId(),identity=isl.authGeneration(),selection=isl.selectionGeneration,visit=isl.visitCode;
   const guard=()=>selected() && actor===proof.actorId && actor===isl.getActorId() && Object.is(identity,isl.authGeneration())
    && selection===isl.selectionGeneration && visit===isl.visitCode && sameEconomyScope(readEconomy(isl.getEconomy()),proof.origin)
    && control.proof()?.sessionId===proof.sessionId && control.proof()?.connectionGeneration===proof.connectionGeneration;
   if(!guard())return;
   await Promise.all([isl.reloadOwn({guard}),...(isl.visiting?[isl.reloadVisit({guard})]:[])]);
   if(guard()){
    isl.applyWorld();isl.refreshCard();
    await isl.flow?.refreshControl?.(isl.where(),{guard});
   }
  },
  onState:state=>{isl.refreshCard?.();if(['controller','spectator'].includes(state.phase)){
   void isl.sharedWaves?.retryFinishes();void isl.sharedRevival?.retryPending();
  }},
 });
 async function ensure(){
  if(!selected()){await control.leave();return {ok:false,status:409,code:'session_context_required',message:'Read the selected island before controlling its Captain.'};}
  return control.open();
 }
 const capture=()=>{
  try{const actorId=isl.getActorId?.();return selected()&&uuid(actorId)?{actorId,identity:isl.authGeneration?.(),origin:sessionOrigin(readEconomy(isl.getEconomy()))}:null;}catch{return null;}
 };
 const same=(a,b)=>a&&b&&a.actorId===b.actorId&&Object.is(a.identity,b.identity)&&sameEconomyScope(a.origin,b.origin);
 function reconcile(){
  const next=capture();if(!next){accepted=null;return;}if(same(accepted,next))return;
  accepted=next;if(reconcileQueued)return;reconcileQueued=true;
  // Reads may be attachment hydration: never await a session flight from them.
  void Promise.resolve().then(()=>{
   reconcileQueued=false;if(!same(accepted,capture())){accepted=null;return;}void ensure().catch(()=>{});
  });
 }
 const blur=()=>{suspended=true;void control.disconnect();};
 const focus=()=>{suspended=false;if(selected())void ensure();};
 const visibility=()=>{if(documentTarget.hidden)blur();else focus();};
 windowTarget?.addEventListener?.('blur',blur);
 windowTarget?.addEventListener?.('focus',focus);
 windowTarget?.addEventListener?.('pagehide',blur);
 documentTarget?.addEventListener?.('visibilitychange',visibility);
 return {
  ensure,reconcile,leave:()=>control.leave(),disconnect:blur,settings:changes=>control.settings(changes),retireOrigin:origin=>control.retireOrigin(origin),
  proof:()=>selected()?control.proof():null,
  roomPlace:()=>selected()?control.roomPlace():null,
  get state(){return control.state;},get metadata(){return selected()?control.metadata:null;},
  get updating(){return control.updating;},
  get settingsView(){
   const meta=selected()?control.metadata?.session:null;
   return meta?{...meta,canManage:!!control.proof() && meta.leaderId===isl.getActorId() && !control.updating}:null;
  },
  dispose(){
   if(disposed)return;disposed=true;
   windowTarget?.removeEventListener?.('blur',blur);windowTarget?.removeEventListener?.('focus',focus);windowTarget?.removeEventListener?.('pagehide',blur);
   documentTarget?.removeEventListener?.('visibilitychange',visibility);void control.dispose();
  },
 };
}
