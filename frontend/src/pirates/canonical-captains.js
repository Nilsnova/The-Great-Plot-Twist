// Report the complete retained party at one stored sealed prefix; learn IDs without replacing replay HP.
import {makeActionUid} from '../screens/islet/action-uid.js';
import {isParticipantToken} from './recovery-policy.js';
import {canonicalJson} from './controller-shared.js';
import {TICK_SECONDS} from './sync.js';
const failed=code=>({ok:false,code});
const count=value=>Number.isSafeInteger(value) && value>=0;
function reportFor(current,makeUid){
 const replay=current.recoveryReplay,throughTick=current.recoveryDriver.nextTick-1,party=current.state.party,tokens=current.info.initialSnapshot.participants.map(row=>row.participantToken);
 if(!replay.canAdvanceThrough(throughTick) || !Array.isArray(party)
  || party.length!==tokens.length || new Set(party.map(row=>row.id)).size!==tokens.length || tokens.some(token=>!party.some(row=>row.id===token)))return null;
 const captains={};
 for(const row of party){
  if(typeof row.withdrawn!=='boolean' || typeof row.down!=='boolean')return null;
  if(row.withdrawn)continue;
  if(!Number.isFinite(row.hp) || !Number.isFinite(row.maxHp) || row.maxHp<=0 || row.hp<0 || row.hp>row.maxHp || !count(row.reviveBasisSeq)
    || (row.down?!Number.isFinite(row.downAt):row.downAt!==null))return null;
  const hpUnits=Math.round(row.hp/row.maxHp*1000000),downAtTick=row.down?Math.round(row.downAt/TICK_SECONDS):null;
  if((hpUnits===0)!==(downAtTick!==null) || downAtTick!==null && (!count(downAtTick) || downAtTick>throughTick))return null;
  captains[row.id]={hpUnits,downAtTick,reviveBasisSeq:row.reviveBasisSeq};
 }
 if(!Object.keys(captains).length)return null;
 const previous=current.captainReportRequest;
 const identity={waveProtocol:2,throughTick,inputHeadSeq:replay.headSeq,captains};
 return previous && canonicalJson({...previous,checkpointUid:null})===canonicalJson({...identity,checkpointUid:null})?previous:{...identity,checkpointUid:makeUid()};
}
function accepted(answer,report){
 if(answer?.accepted!==true || typeof answer.repeated!=='boolean' || answer.throughTick!==report.throughTick || answer.inputHeadSeq!==report.inputHeadSeq
  || !answer.captains || Object.keys(answer.captains).length!==Object.keys(report.captains).length)return false;
 return Object.entries(report.captains).every(([token,fact])=>{
  const row=answer.captains[token];return row && ['hpUnits','downAtTick','reviveBasisSeq'].every(key=>row[key]===fact[key])
   && (fact.hpUnits===0?isParticipantToken(row.fallId):row.fallId===null);
 });
}
export function createCaptainSynchronizer({getCurrent,controls,flush,fetch,advance,send,makeUid=makeActionUid}={}){
 return function sync({refresh=true}={}){
  const current=getCurrent();
  if(!current?.info.initialSnapshot?.economy || !controls(current))return Promise.resolve(failed('session_context_required'));
  const valid=()=>getCurrent()===current && controls(current);
  if(current.captainSyncPromise){
   if(!refresh || current.captainSyncRefreshing)return current.captainSyncPromise;
   // Explicit revival needs the latest seal even if a periodic report is already in flight.
   return current.captainSyncPromise.then(()=>valid()?sync():failed('session_context_changed'));
  }
  current.captainSyncRefreshing=refresh;
  const running=(async()=>{
   if(refresh){
    if(!await flush(current) || !valid())return failed('input_sync_required');
    if(!await fetch(current) || !valid())return failed('health_sync_required');
    const seal=current.recoveryReplay.sealedThroughTick;
    if(!advance(current,seal) || current.recoveryDriver.nextTick!==seal+1)return failed('health_sync_required');
   }
   const report=reportFor(current,makeUid);if(!report)return failed('health_sync_required');
   current.captainReportRequest=report;
   let answer;try{answer=await send({waveId:current.info.waveId,report});}catch{return failed('network_error');}
   if(!valid())return failed('session_context_changed');
   if(!accepted(answer,report))return failed(answer?.code??'health_sync_required');
   current.captainFacts={throughTick:report.throughTick,inputHeadSeq:report.inputHeadSeq,captains:JSON.parse(JSON.stringify(answer.captains))};
   current.sim?.bindCaptainFalls?.(answer.captains,report.throughTick);
   return {ok:true,...JSON.parse(JSON.stringify(current.captainFacts))};
  })().finally(()=>{
   if(current.captainSyncPromise===running){current.captainSyncPromise=null;current.captainSyncRefreshing=false;}
  });
  current.captainSyncPromise=running;return running;
 };
}
