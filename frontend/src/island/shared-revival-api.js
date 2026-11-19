// Durable free-revival completion facts. A receipt never patches simulated HP or grants session control.
import {ECONOMY_CAPABILITY_HEADERS} from '../online/api.js';
import {makeActionUid} from '../screens/islet/action-uid.js';
import {readEconomy,sameEconomyScope} from './economy-view.js';
import {uuid} from './shared-quotes.js';
import {nativeOrigin} from './shared-wave-shapes.js';
import {sessionAssertion,sessionUid,validSessionProof} from './shared-session-shapes.js';
const options=Object.freeze({headers:ECONOMY_CAPABILITY_HEADERS});
const copy=value=>JSON.parse(JSON.stringify(value));
const failed=(code,message,status=409)=>({ok:false,status,code,message});
const refreshCodes=new Set(['health_sync_required','hold_incomplete','hold_invalidated','hold_missing','stale_controller','reconnect_required']);
const count=value=>Number.isSafeInteger(value) && value>=0;
const fields=['economy','actionUid','waveId','targetToken','fallId','holdId','sessionId','connectionGeneration'];
function validRecord(record){
 const body=record?.body;
 return !!nativeOrigin(record?.origin) && typeof record.refreshable==='boolean' && validSessionProof({...record,...body})
  && body && Object.keys(body).length===fields.length && fields.every(key=>Object.hasOwn(body,key))
  && sessionUid(body.actionUid) && ['waveId','targetToken','fallId','holdId'].every(key=>uuid(body[key]))
  && Object.keys(body.economy??{}).length===4 && Object.entries(sessionAssertion(record.origin)).every(([key,value])=>body.economy[key]===value);
}
function validReply(value,record){
 const receipt=value?.receipt,result=receipt?.result,body=record.body;
 return value?.status==='done' && typeof value.repeat==='boolean' && uuid(receipt?.receiptId) && receipt.action==='wave_revive'
  && receipt.actorId===record.actorId && receipt.actionUid===body.actionUid && !!nativeOrigin(receipt.origin) && sameEconomyScope(receipt.origin,record.origin)
  && result && ['waveId','targetToken','fallId','holdId'].every(key=>result[key]===body[key])
  && count(result.downAtTick) && result.downAtTick<=18000 && count(result.eventSeq) && result.eventSeq>0 && result.eventSeq===result.reviveSeq
  && count(result.restoredHPUnits) && result.restoredHPUnits>0 && result.restoredHPUnits<=1000000;
}
export function createSharedRevivalApi({transport,getEconomy,getActorId,getProof,storage,makeUid=makeActionUid}={}){
 const actor=()=>{try{return getActorId();}catch{return null;}};
 const key=(actorId,intent)=>`plot_twist_native_revive_v1:${actorId}:${intent.origin.accountId}:${intent.origin.runEpoch}:${intent.waveId}:${intent.targetToken}:${intent.fallId}`;
 function read(name){
  if(!storage || !['getItem','setItem','removeItem'].every(method=>typeof storage[method]==='function'))throw new Error('Revival retry storage is unavailable.');
  const raw=storage.getItem(name);if(raw===null)return null;
  const record=JSON.parse(raw);if(!validRecord(record))throw new Error('The original revival request could not be read.');return record;
 }
 async function send(name,record){
  if(record.actorId!==actor())return failed('auth_context_changed','The signed-in player changed.',0);
  let answer;try{answer=await transport.post('/api/island/revive',copy(record.body),options);}catch{return failed('network_error','The revival request did not finish. Retry it.',0);}
  if(record.actorId!==actor())return failed('auth_context_changed','The signed-in player changed.',0);
  if(answer?.ok && !validReply(answer.data,record))return failed('unreadable','The revival receipt could not be verified.',502);
  try{
   const saved=read(name);
   if(saved && JSON.stringify(saved)===JSON.stringify(record)){
    if(answer?.ok)storage.removeItem(name);
    else if((answer?.status===409 && refreshCodes.has(answer.code))
      || (answer?.status===403 && answer.code==='not_controller'))storage.setItem(name,JSON.stringify({...record,refreshable:true}));
   }
  }catch{return failed('revival_retry_unavailable','The original revival could not be saved.',503);}
  return answer?.ok?answer:{...answer,ok:false,status:Number.isInteger(answer?.status)?answer.status:0};
 }
 return {
  async complete(intent){
   const actorId=actor();if(!uuid(actorId) || !nativeOrigin(intent?.origin) || !['waveId','targetToken','fallId','holdId'].every(field=>uuid(intent[field])))
    return failed('revival_context_required','Read the original fallen Captain.');
   const name=key(actorId,intent);let record;
   try{
    record=read(name);
    if(record && (record.actorId!==actorId || !sameEconomyScope(record.origin,intent.origin)
      || ['waveId','targetToken','fallId'].some(field=>record.body[field]!==intent[field])))throw new Error('The original revival identity changed.');
    if(!record || record.refreshable){
     const proof=getProof(),economy=readEconomy(getEconomy());
     if(!validSessionProof(proof) || proof.actorId!==actorId || !sameEconomyScope(proof.origin,intent.origin) || !sameEconomyScope(economy,intent.origin))
      return failed('session_context_required','Reconnect the original controlling wave.');
     const body={economy:sessionAssertion(intent.origin),actionUid:record?.body.actionUid??makeUid(),
      waveId:intent.waveId,targetToken:intent.targetToken,fallId:intent.fallId,holdId:intent.holdId,sessionId:proof.sessionId,connectionGeneration:proof.connectionGeneration};
     record={actorId,origin:nativeOrigin(intent.origin),body,refreshable:false};
     if(!validRecord(record))throw new Error('The revival request could not be saved.');storage.setItem(name,JSON.stringify(record));
    }
   }catch(error){return failed('revival_retry_unavailable',error.message,503);}
   return send(name,record);
  },
  async retryPending(){
   const actorId=actor(),results=[];if(!uuid(actorId) || typeof storage?.key!=='function')return results;
   const prefix=`plot_twist_native_revive_v1:${actorId}:`,names=Array.from({length:storage.length},(_,index)=>storage.key(index)).filter(name=>name?.startsWith(prefix));
   for(const name of names){if(actor()!==actorId)break;try{const record=read(name);if(record && !record.refreshable)results.push(await send(name,record));}catch{results.push(failed('revival_retry_unavailable','The original revival could not be read.',503));}}
   return results;
  },
 };
}
