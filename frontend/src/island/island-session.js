// Bind the document-held canonical session to the selected, visible island; no second context store.
import {readEconomy} from './economy-view.js';
import {createSharedSessionApi} from './shared-session-api.js';
import {createSharedSessionClient} from './shared-session-client.js';

export function createIslandSession(isl,{client=null,windowTarget=globalThis,documentTarget=globalThis.document}={}){
 let disposed=false,suspended=false;
 const selected=()=>!disposed && !suspended && documentTarget?.hidden!==true && !isl.disposed && isl.mode!=='fake' && isl.isOnIsland()
  && !!readEconomy(isl.getEconomy()) && isl.domainAvailable('session');
 const control=client??createSharedSessionClient({
  api:createSharedSessionApi({transport:isl.islandTransport,getEconomy:isl.getEconomy,getActorId:isl.getActorId}),
  getEconomy:()=>selected()?isl.getEconomy():null,getActorId:isl.getActorId,getAuthGeneration:isl.authGeneration,storage:isl.storage,
  onState:()=>isl.refreshCard?.(),
 });
 async function ensure(){
  if(!selected()){await control.leave();return {ok:false,status:409,code:'session_context_required',message:'Read the selected island before controlling its Captain.'};}
  return control.open();
 }
 const blur=()=>{suspended=true;void control.disconnect();};
 const focus=()=>{suspended=false;if(selected())void ensure();};
 const visibility=()=>{if(documentTarget.hidden)blur();else focus();};
 windowTarget?.addEventListener?.('blur',blur);
 windowTarget?.addEventListener?.('focus',focus);
 windowTarget?.addEventListener?.('pagehide',blur);
 documentTarget?.addEventListener?.('visibilitychange',visibility);
 return {
  ensure,leave:()=>control.leave(),disconnect:blur,
  proof:()=>selected()?control.proof():null,
  roomPlace:()=>selected()?control.roomPlace():null,
  get state(){return control.state;},get metadata(){return selected()?control.metadata:null;},
  dispose(){
   if(disposed)return;disposed=true;
   windowTarget?.removeEventListener?.('blur',blur);windowTarget?.removeEventListener?.('focus',focus);windowTarget?.removeEventListener?.('pagehide',blur);
   documentTarget?.removeEventListener?.('visibilitychange',visibility);void control.dispose();
  },
 };
}
