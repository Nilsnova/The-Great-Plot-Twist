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
 makeUid=makeActionUid,makeSessionId=()=>globalThis.crypto.randomUUID(),onState=()=>{},
 setTimer=(run,ms)=>setTimeout(run,ms),clearTimer=id=>clearTimeout(id)}={}){
 const tab=createSessionTabLock({locks}),intents=createSessionIntents({storage,makeUid,makeSessionId});
 let disposed=false,ticket=0,flight=null,pingFlight=null,timer=null,held=null,active=null,scope=null,snapshot=null;
 let state=Object.freeze({phase:'idle',message:''});
 const context=()=>{try{return {actorId:getActorId(),origin:sessionOrigin(readEconomy(getEconomy())),identity:getAuthGeneration()};}catch{return null;}};
 const current=captured=>{const now=context();return !disposed && !!captured?.origin && !!now && captured.actorId===now.actorId
  && Object.is(captured.identity,now.identity) && sameEconomyScope(captured.origin,now.origin);};
 const notify=(phase,message='')=>{state=Object.freeze({phase,message});try{onState({...state});}catch{/* A display cannot grant control. */}};
 const cancelTimer=()=>{if(timer!==null)clearTimer(timer);timer=null;};
 function schedule(captured){
  cancelTimer();if(!current(captured))return;
  timer=setTimer(()=>{timer=null;if(current(captured))void (active?heartbeat():open());},heartbeatMs);
 }
 function demote(phase,message){active=null;snapshot=null;held?.release();held=null;notify(phase,message);}
 function proof(){return active && held?.current && current(scope)?clone(active):null;}
 async function refresh(captured,mine,record){
  const answer=await api.read(record);
  if(mine!==ticket || !current(captured) || record && !held?.current)return failed('session_context_changed','The session selection changed.',0);
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
  let record;
  try{record=intents.begin(captured.actorId,captured.origin);}catch(error){demote('unavailable',error.message);return failed('session_retry_unavailable',error.message,503);}
  const answer=await api.attach(record);
  if(mine!==ticket || !current(captured) || !held?.current)return failed('session_context_changed','The session selection changed.',0);
  if(!answer.ok){
   if(answer.code==='stale_controller'){try{intents.refuse(record);}catch{/* No replacement is allocated here. */}}
   demote('unavailable',answer.message??'The controlling session could not attach.');schedule(captured);return answer;
  }
  const data=readSessionMetadata(answer.data);
  if(!data || !data.session.isController || data.session.sessionId!==record.body.sessionId){demote('unavailable','The stored attachment could not be verified.');return failed('unreadable','The stored attachment could not be verified.',502);}
  try{intents.confirm(record,data);}catch(error){demote('unavailable',error.message);return failed('session_retry_unavailable',error.message,503);}
  return refresh(captured,mine,{actorId:captured.actorId,origin:captured.origin,sessionId:data.session.sessionId,connectionGeneration:data.session.connectionGeneration});
 }
 function open(){
  if(flight)return flight;
  const captured=context();if(!current(captured) || !uuid(captured.actorId))return Promise.resolve(failed('economy_context_required','Read the selected island.'));
  if(proof())return heartbeat();
  const mine=++ticket;cancelTimer();pingFlight=null;scope=captured;
  const pending=start(captured,mine).catch(()=>{if(mine===ticket)demote('unavailable','The session request did not finish.');return failed('network_error','The session request did not finish.',0);});
  flight=pending.finally(()=>{if(flight===finished)flight=null;});const finished=flight;return flight;
 }
 async function sendHeartbeat(){
  const record=proof(),captured=scope,mine=ticket;
  if(!record)return failed('session_context_required','Read your current controlling session.');
  cancelTimer();const answer=await api.heartbeat(record);
  if(mine!==ticket || !current(captured) || !held?.current)return failed('session_context_changed','The session selection changed.',0);
  const data=answer.ok?readSessionMetadata(answer.data):null;
  if(!data || !data.session.isController || data.session.sessionId!==record.sessionId || data.session.connectionGeneration!==record.connectionGeneration)
   demote('unavailable',answer.message??'Reconnect to the current session.');
  else{snapshot=data;notify('controller');}
  schedule(captured);return answer;
 }
 function heartbeat(){
  if(pingFlight)return pingFlight;
  const pending=sendHeartbeat();
  const finished=pending.finally(()=>{if(pingFlight===finished)pingFlight=null;});pingFlight=finished;return finished;
 }
 async function disconnect(){
  const record=active;ticket++;cancelTimer();flight=null;pingFlight=null;demote('idle','');scope=null;
  return record?api.disconnect(record):{ok:true,data:null};
 }
 return {open,heartbeat,disconnect,proof,
  roomPlace:()=>snapshot && current(scope)?snapshot.session.place:null,
  get state(){return {...state};},
  get metadata(){return snapshot && current(scope)?clone(snapshot):null;},
  async dispose(){if(disposed)return;const closing=disconnect();disposed=true;tab.dispose();return closing;},
 };
}
