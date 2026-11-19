// Original owner/code reset intent survives a newly observed epoch; receipts never adopt replacement funds.
import {ECONOMY_CAPABILITY_HEADERS} from '../online/api.js';
import {makeActionUid} from '../screens/islet/action-uid.js';
import {readEconomy,sameEconomyScope} from './economy-view.js';
import {decimal,uuid} from './shared-quotes.js';
import {nativeOrigin} from './shared-wave-shapes.js';
import {sessionAssertion,sessionUid} from './shared-session-shapes.js';
import {islandCode,displayIslandCode} from './codes.js';
const options=Object.freeze({headers:ECONOMY_CAPABILITY_HEADERS});
const failed=(code,message,status=409)=>({ok:false,status,code,message});
const copy=value=>JSON.parse(JSON.stringify(value));
const effects=['buildingsCleared','researchCleared','layoutCleared','healthCleared','wallRecordsCleared','copiesCleared','historicalMovesRetained','controlsRevoked','wavesClosed'];
const resultKeys=['newAccountId','newRunEpoch','retiredTreasury','startingCoins','grantReceiptId','grantPolicyVersion','effects'];
const exact=(value,keys)=>value && typeof value==='object' && !Array.isArray(value) && Object.keys(value).length===keys.length && keys.every(key=>Object.hasOwn(value,key));
function validRecord(record){
 const body=record?.body,origin=nativeOrigin(record?.origin),economy=readEconomy(record?.economyAtIntent);
 return uuid(record?.actorId) && origin && economy && sameEconomyScope(economy,origin) && record.actorId===origin.islandOwner
  && record.code===displayIslandCode(record.code) && exact(body,['economy','actionUid','confirmCode']) && sessionUid(body.actionUid)
  && body.confirmCode===record.code && exact(body.economy,['mode','version','islandOwner','runEpoch'])
  && Object.entries(sessionAssertion(origin)).every(([key,value])=>body.economy[key]===value);
}
function validReply(value,record){
 const receipt=value?.receipt,result=receipt?.result,money=result?.retiredTreasury;
 return value?.status==='done' && typeof value.repeat==='boolean' && value.currentEconomy===null && uuid(receipt?.receiptId)
  && receipt.action==='reset' && receipt.actorId===record.actorId && receipt.actionUid===record.body.actionUid
  && !!nativeOrigin(receipt.origin) && sameEconomyScope(receipt.origin,record.origin) && exact(result,resultKeys)
  && uuid(result.newAccountId) && result.newAccountId!==record.origin.accountId && uuid(result.newRunEpoch) && result.newRunEpoch!==record.origin.runEpoch
  && exact(money,['balanceCoins','committedCoins','availableCoins','revision']) && Object.values(money).every(decimal)
  && BigInt(money.balanceCoins)-BigInt(money.committedCoins)===BigInt(money.availableCoins)
  && decimal(result.startingCoins) && uuid(result.grantReceiptId) && typeof result.grantPolicyVersion==='string' && result.grantPolicyVersion.length>0 && result.grantPolicyVersion.length<=80
  && exact(result.effects,effects) && Object.values(result.effects).every(count=>Number.isSafeInteger(count) && count>=0);
}
export function createSharedResetApi({transport,getEconomy,getActorId,getCode,canReset=()=>false,storage,makeUid=makeActionUid}={}){
 const actor=()=>{try{return getActorId();}catch{return null;}};
 const key=(actorId,code)=>`plot_twist_native_reset_v1:${actorId}:${islandCode(code)}`;
 function pending(code){
  const actorId=actor();if(!uuid(actorId) || !islandCode(code))return null;
  if(!storage || !['getItem','setItem','removeItem'].every(method=>typeof storage[method]==='function'))throw new Error('Reset retry storage is unavailable.');
  const raw=storage.getItem(key(actorId,code));if(raw===null)return null;
  const record=JSON.parse(raw);if(!validRecord(record) || record.actorId!==actorId || record.code!==displayIslandCode(code))throw new Error('The original reset request could not be read.');
  return record;
 }
 return {
  pending,
  async reset(confirmCode){
   const actorId=actor(),code=displayIslandCode(confirmCode);
   if(!uuid(actorId) || !islandCode(confirmCode))return failed('reset_context_required','Read your own island and confirm its code.');
   let record;
   try{
    record=pending(code);
    if(!record){
     const economy=readEconomy(getEconomy());
     if(!economy || economy.islandOwner!==actorId || islandCode(getCode())!==islandCode(code) || canReset()!==true)
      return failed('economy_context_required','Read your own supported shared island before resetting it.');
     record={actorId,code,origin:nativeOrigin(Object.fromEntries(['mode','version','islandOwner','accountId','runEpoch'].map(key=>[key,economy[key]]))),economyAtIntent:economy,
      body:{economy:sessionAssertion(economy),actionUid:makeUid(),confirmCode:code}};
     if(!validRecord(record))throw new Error('The original reset request could not be saved.');storage.setItem(key(actorId,code),JSON.stringify(record));
    }
   }catch(error){return failed('reset_retry_unavailable',error.message,503);}
   let answer;try{answer=await transport.post('/api/island/fresh-start',copy(record.body),options);}catch{return failed('network_error','The reset is not confirmed. Retry the original request.',0);}
   if(actor()!==actorId)return failed('auth_context_changed','The signed-in player changed.',0);
   if(answer?.ok && !validReply(answer.data,record))return failed('unreadable','The original reset receipt could not be verified.',502);
   const refused=answer && ['wrong_code','not_owner','economy_epoch_mismatch','economy_path_unavailable','wave_running'].includes(answer.code) && [400,403,409].includes(answer.status);
   if(answer?.ok || refused){
    try{const saved=pending(code);if(saved && JSON.stringify(saved)===JSON.stringify(record))storage.removeItem(key(actorId,code));}
    catch{return failed('reset_retry_unavailable','The original reset confirmation could not be saved.',503);}
   }
   return answer?.ok?answer:{...answer,ok:false,status:Number.isInteger(answer?.status)?answer.status:0};
  },
 };
}
