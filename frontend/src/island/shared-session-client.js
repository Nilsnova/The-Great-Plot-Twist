// Document-held canonical session lifecycle; only a fresh read plus an exclusive lock exposes proof.
import {makeActionUid} from '../screens/islet/action-uid.js';
import {readEconomy,sameEconomyScope} from './economy-view.js';
import {uuid} from './shared-quotes.js';
import {readSessionMetadata,sessionOrigin} from './shared-session-shapes.js';
import {createSessionIntents} from './shared-session-intents.js';
import {createSessionTabLock} from './shared-session-lock.js';
const failed=(code,message,status=409)=>({ok:false,status,code,message});
const clone=value=>JSON.parse(JSON.stringify(value));
const heartbeatMs=5000;
export function createSharedSessionClient({api,getEconomy,getActorId,getAuthGeneration=()=>0,storage,locks=globalThis.navigator?.locks,
 makeUid=makeActionUid,makeSessionId=()=>globalThis.crypto.randomUUID(),onState=()=>{},onAttached=async()=>{},
 setTimer=(run,ms)=>setTimeout(run,ms),clearTimer=id=>clearTimeout(id)}={}){
 const tab=createSessionTabLock({locks}),intents=createSessionIntents({storage,makeUid,makeSessionId});
 let disposed=false,ticket=0,flight=null,flightScope=null,pingFlight=null,settingsFlight=null,settingsScope=null,timer=null,held=null,active=null,scope=null,snapshot=null;
 let state=Object.freeze({phase:'idle',message:''});
 const context=()=>{try{return {actorId:getActorId(),origin:sessionOrigin(readEconomy(getEconomy())),identity:getAuthGeneration()};}catch{return null;}};
 const current=captured=>{const now=context();return !disposed && !!captured?.origin && !!now && captured.actorId===now.actorId
  && Object.is(captured.identity,now.identity) && sameEconomyScope(captured.origin,now.origin);};
 const notify=(phase,message='')=>{state=Object.freeze({phase,message});try{onState({...state});}catch{/* A display cannot grant control. */}};
 const cancelTimer=()=>{if(timer!==null)clearTimer(timer);timer=null;};
 function schedule(captured){
  cancelTimer();if(!current(captured) || settingsFlight && captured===settingsScope)return;
  timer=setTimer(()=>{timer=null;
   if(current(captured))void (active?heartbeat():open());
   else if(scope===captured)abandon(held,ticket);
  },heartbeatMs);
 }
 function demote(phase,message){active=null;snapshot=null;held?.release();held=null;notify(phase,message);}
 function abandon(lock,mine){
  lock?.release();
  if(mine===ticket && held===lock){cancelTimer();active=null;snapshot=null;held=null;scope=null;notify('unavailable','The session selection changed.');}
  return failed('session_context_changed','The session selection changed.',0);
 }
 function proof(){return active && held?.current && current(scope)?clone(active):null;}
 async function refresh(captured,mine,record){
  const lock=held;
  const answer=await api.read(record);
  if(mine!==ticket || !current(captured) || record && !lock?.current)return abandon(lock,mine);
  const data=answer.ok?readSessionMetadata(answer.data):null;
  if(!data){demote('unavailable',answer.message??'The current session could not be read.');schedule(captured);return answer.ok?failed('unreadable','The current session could not be verified.',502):answer;}
  scope=captured;snapshot=data;
  if(record && data.session.isController && data.session.sessionId===record.sessionId && data.session.connectionGeneration===record.connectionGeneration){
   active=record;notify('controller');
  }else{active=null;held?.release();held=null;notify('spectator');}
  schedule(captured);return answer;
 }
 async function start(captured,mine){
  notify('connecting');active=null;snapshot=null;
  const lock=await tab.acquire(captured.actorId);
  if(mine!==ticket || !current(captured)){lock?.release();return failed('session_context_changed','The session selection changed.',0);}
  held=lock;
  if(!lock)return refresh(captured,mine,null);
  try{
   const saved=intents.read(captured.actorId);
   if(intents.departure(captured.actorId) || saved?.phase==='known' && !sameEconomyScope(saved.origin,captured.origin)){
    const answer=await depart(captured.actorId,captured.origin);
    if(mine!==ticket || !current(captured) || !lock.current)return abandon(lock,mine);
    if(!answer.ok){demote('waiting','Confirming departure from your previous session. Retry shortly.');schedule(captured);return answer;}
   }
  }catch(error){demote('unavailable',error.message);return failed('session_retry_unavailable',error.message,503);}
  let record;
  try{record=intents.begin(captured.actorId,captured.origin);}catch(error){demote('unavailable',error.message);return failed('session_retry_unavailable',error.message,503);}
  const answer=await api.attach(record);
  if(mine!==ticket || !current(captured) || !lock?.current)return abandon(lock,mine);
  if(!answer.ok){
   if(answer.code==='stale_controller'){try{intents.refuse(record);}catch{/* No replacement is allocated here. */}}
   const waiting=answer.code==='controller_held';
   demote(waiting?'waiting':'unavailable',waiting?'Waiting for your previous session. Close another controlling tab or retry shortly.':answer.message??'The controlling session could not attach.');
   schedule(captured);return answer;
  }
  const data=readSessionMetadata(answer.data);
  if(!data || !data.session.isController || data.session.sessionId!==record.body.sessionId){demote('unavailable','The stored attachment could not be verified.');return failed('unreadable','The stored attachment could not be verified.',502);}
  try{intents.confirm(record,data);}catch(error){demote('unavailable',error.message);return failed('session_retry_unavailable',error.message,503);}
  const fresh=await refresh(captured,mine,{actorId:captured.actorId,origin:captured.origin,sessionId:data.session.sessionId,connectionGeneration:data.session.connectionGeneration});
  if(fresh.ok && proof()){
   try{await onAttached(proof());}catch{/* Domain hydration cannot grant control or replace a confirmed session. */}
   if(mine!==ticket || !current(captured) || !lock.current)return abandon(lock,mine);
  }
  return fresh;
 }
 function open(){
  const captured=context();if(!current(captured) || !uuid(captured.actorId))return Promise.resolve(failed('economy_context_required','Read the selected island.'));
  if(flight){
   if(flightScope?.actorId===captured.actorId&&Object.is(flightScope.identity,captured.identity)&&sameEconomyScope(flightScope.origin,captured.origin))return flight;
   return flight.then(()=>current(captured)?open():failed('session_context_changed','The session selection changed.',0));
  }
  if(proof())return heartbeat();
  const mine=++ticket;cancelTimer();pingFlight=null;scope=captured;flightScope=captured;
  const pending=start(captured,mine).catch(()=>{if(mine===ticket)demote('unavailable','The session request did not finish.');return failed('network_error','The session request did not finish.',0);});
  flight=pending.finally(()=>{if(flight===finished){flight=null;flightScope=null;}});const finished=flight;return flight;
 }
 async function sendHeartbeat(){
  const record=proof(),captured=scope,mine=ticket,lock=held;
  if(!record)return failed('session_context_required','Read your current controlling session.');
  cancelTimer();const answer=await api.heartbeat(record);
  if(mine!==ticket || !current(captured) || !lock?.current)return abandon(lock,mine);
  const data=answer.ok?readSessionMetadata(answer.data):null;
  if(!data || !data.session.isController || data.session.sessionId!==record.sessionId || data.session.connectionGeneration!==record.connectionGeneration)
   demote('unavailable',answer.message??'Reconnect to the current session.');
  else{snapshot=data;notify('controller');}
  schedule(captured);return answer;
 }
 function heartbeat(){
  if(settingsFlight && scope===settingsScope)return settingsFlight;
  if(pingFlight)return pingFlight;
  const pending=sendHeartbeat();
  const finished=pending.finally(()=>{if(pingFlight===finished)pingFlight=null;});pingFlight=finished;return finished;
 }
 function settings(changes){
  if(settingsFlight)return settingsFlight;
  const captured=scope,mine=ticket,actorId=context()?.actorId;let record;
  try{
   record=intents.settings(actorId);
   if(!record){const original=proof();if(!original)return Promise.resolve(failed('session_context_required','Read your current controlling session.'));record=intents.changeSettings(original,changes);}
  }catch(error){return Promise.resolve(failed('session_retry_unavailable',error.message,503));}
  const prior=pingFlight;settingsScope=captured;cancelTimer();
  const pending=(async()=>{
   if(prior)await prior;
   let answer;try{answer=await api.settings(record);}catch{return failed('network_error','The settings change did not finish. Retry it.',0);}
   if(answer.ok || answer.status===409 && answer.code==='stale_controller')intents.changedSettings(record);
   if(mine!==ticket || !current(captured))return answer;
   if(answer.ok && proof())await refresh(captured,mine,proof());
   else if(answer.status===401)demote('unavailable','Sign in again to confirm the original settings change.');
   else notify(active?'controller':'unavailable',answer.ok?'':answer.message??'The settings change is not confirmed. Retry it.');
   return answer;
  })().catch(()=>failed('session_retry_unavailable','The original settings change could not be saved.',503));
  const finished=pending.finally(()=>{if(settingsFlight===finished){settingsFlight=null;settingsScope=null;if(current(scope))schedule(scope);}});
  settingsFlight=finished;return finished;
 }
 async function depart(actor,replacement=null){
  const record=intents.depart(actor);if(!record)return {ok:true,data:null};
  let answer;try{answer=await api.leave(record);}catch{return failed('network_error','The departure did not finish. Retry it.',0);}
  const stale=answer.status===409 && answer.code==='stale_controller';
  const retired=answer.status===409 && answer.code==='economy_epoch_mismatch' && replacement && context()?.actorId===record.actorId
    && record.origin.islandOwner===replacement.islandOwner && record.origin.accountId!==replacement.accountId && record.origin.runEpoch!==replacement.runEpoch;
  if(retired){intents.retire(record.actorId,record.origin);return {ok:true,data:null,retired:true};}
  if(answer.ok || stale)intents.departed(record);
  if(stale)return {ok:true,data:null,retired:true}; // The obsolete generation grants no present control.
  return answer;
 }
 async function leave(){
  const captured=scope,owned=held?.current;
  // Allocate departure only while this document owns the original known session.
  let record;
  try{if(owned && captured)record=intents.depart(captured.actorId);}catch(error){
   await disconnect();return failed('session_retry_unavailable',error.message,503);
  }
  ticket++;cancelTimer();flight=null;pingFlight=null;demote('idle','');scope=null;
  if(!record)return {ok:true,data:null};
  try{return await depart(record.actorId);}catch(error){return failed('session_retry_unavailable',error.message,503);}
 }
 async function disconnect(){
  const record=active;ticket++;cancelTimer();flight=null;pingFlight=null;demote('idle','');scope=null;
  return record?api.disconnect(record):{ok:true,data:null};
 }
 function retireOrigin(origin){
  const actorId=context()?.actorId;if(!uuid(actorId))return false;
  try{intents.retire(actorId,origin);}catch{return false;}
  if(sameEconomyScope(scope?.origin,origin)){
   ticket++;cancelTimer();flight=null;pingFlight=null;demote('idle','');scope=null;
  }
  return true;
 }
 return {open,heartbeat,disconnect,leave,settings,retireOrigin,proof,
  roomPlace:()=>snapshot && current(scope)?snapshot.session.place:null,
  get state(){return {...state};},
  get updating(){return settingsFlight!==null;},
  get metadata(){return snapshot && current(scope)?clone(snapshot):null;},
  async dispose(){if(disposed)return;const closing=disconnect();disposed=true;tab.dispose();return closing;},
 };
}
