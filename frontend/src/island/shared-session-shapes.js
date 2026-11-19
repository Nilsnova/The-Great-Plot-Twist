// Strict canonical session metadata and common operation facts, independent of controller admission.
import {readEconomy,sameEconomyScope} from './economy-view.js';
import {uuid,decimal} from './shared-quotes.js';
export const sessionUid=value=>typeof value==='string' && /^[A-Za-z0-9_-]{8,64}$/.test(value) && !/^(fx_|sys_)/.test(value);
export const positiveGeneration=value=>decimal(value) && value!=='0';
export const sessionOrigin=value=>value?.mode==='island_shared' && value.version===1
 && ['islandOwner','accountId','runEpoch'].every(key=>uuid(value[key]))
 ? Object.freeze(Object.fromEntries(['mode','version','islandOwner','accountId','runEpoch'].map(key=>[key,value[key]]))) : null;
export const sessionAssertion=value=>({mode:'island_shared',version:1,islandOwner:value.islandOwner,runEpoch:value.runEpoch});
export const validSessionProof=value=>uuid(value?.actorId) && !!sessionOrigin(value.origin)
 && uuid(value.sessionId) && positiveGeneration(value.connectionGeneration);
const countdown=value=>Number.isInteger(value) && value>=0 && value<=60;
export function readSessionMetadata(value){
 const economy=readEconomy(value?.economy),session=value?.session;
 if(value?.status!=='done' || !economy || !session || typeof session.isController!=='boolean'
  || session.isSpectator!==!session.isController || typeof session.breakPaused!=='boolean' || typeof session.autoNext!=='boolean'
  || !countdown(session.countdownSeconds) || !positiveGeneration(session.topicGeneration)
  || (session.leaderId!==null && !uuid(session.leaderId))
  || (session.graceUntil!==null && (typeof session.graceUntil!=='string' || !Number.isFinite(Date.parse(session.graceUntil))))
  || typeof session.place!=='string' || !/^isle_[abcdefghjkmnpqrstuvwxyz23456789]{5}_[0-9a-f]{24}$/.test(session.place)) return null;
 if(session.isController ? !uuid(session.sessionId) || !positiveGeneration(session.connectionGeneration)
  : session.sessionId!==null || session.connectionGeneration!==null) return null;
 return Object.freeze({status:'done',economy,session:Object.freeze({...session})});
}
export function validSessionReceipt(value,record,action){
 const receipt=value?.receipt,result=receipt?.result;
 if(value?.status!=='done' || typeof value.repeat!=='boolean' || !uuid(receipt?.receiptId)
  || receipt.actionUid!==record.actionUid || receipt.action!==action || receipt.actorId!==record.actorId
  || !sessionOrigin(receipt.origin) || !sameEconomyScope(receipt.origin,record.origin) || !result) return false;
 if(action==='session_leave') return result.connectionGeneration===record.connectionGeneration;
 return typeof result.breakPaused==='boolean' && typeof result.autoNext==='boolean' && countdown(result.countdownSeconds)
  && ['breakPaused','autoNext','countdownSeconds'].every(key=>record[key]===undefined || record[key]===result[key]);
}
