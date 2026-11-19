// Canonical wave HTTP and durable actor-owned bell/finish retries. No personal transport fallback.
import {ECONOMY_CAPABILITY_HEADERS} from '../online/api.js';
import {makeActionUid} from '../screens/islet/action-uid.js';
import {readEconomy,sameEconomyScope} from './economy-view.js';
import {islandCode,displayIslandCode} from './codes.js';
import {uuid} from './shared-quotes.js';
import {sessionAssertion,sessionOrigin,sessionUid,validSessionProof} from './shared-session-shapes.js';
import {readNativeWave,readNativeFinish} from './shared-wave-shapes.js';
import {validCheckpoint} from '../pirates/recovery-transport.js';
const options=Object.freeze({headers:ECONOMY_CAPABILITY_HEADERS});
const copy=value=>JSON.parse(JSON.stringify(value));
const failed=(code,message,status=409)=>({ok:false,status,code,message});
const uncertain=answer=>answer.status===0 || answer.status===401 || answer.status===429 || answer.status>=500;
const whereOf=value=>value==='own'?'own':islandCode(value)?displayIslandCode(value):null;
const validFinish=body=>body && Object.keys(body).every(key=>['waveId','waveProtocol','survived','shipsSunk','bonuses','rescued','walls','checkpoint','economy','sessionId','connectionGeneration'].includes(key))
 && uuid(body.waveId) && body.waveProtocol===2 && typeof body.survived==='boolean' && Number.isSafeInteger(body.shipsSunk) && body.shipsSunk>=0 && body.shipsSunk<=1000
 && validCheckpoint(body.checkpoint) && sessionUid(body.checkpoint.checkpointUid) && uuid(body.checkpoint.islandEpoch)
 && (body.rescued===undefined || typeof body.rescued==='boolean') && (body.bonuses===undefined || Array.isArray(body.bonuses) && new Set(body.bonuses).size===body.bonuses.length && body.bonuses.every(kind=>['galleon','finisher'].includes(kind)));
export function createSharedWaveApi({transport,getEconomy,getActorId,getProof,onEconomy=()=>{},storage,makeUid=makeActionUid,allowLegacy=()=>false}={}){
 const waves=new Map();
 const selected=()=>{try{return readEconomy(getEconomy());}catch{return null;}};
 const actor=()=>{try{return getActorId();}catch{return null;}};
 const live=()=>{try{const proof=getProof();return validSessionProof(proof) && proof.actorId===actor() && sameEconomyScope(proof.origin,selected())?proof:null;}catch{return null;}};
 const key=(kind,actorId,target)=>`plot_twist_native_wave_v1:${kind}:${actorId}:${target}`;
 function pending(kind,actorId,target){
  if(!storage || !uuid(actorId))throw new Error('Durable wave retry storage is unavailable.');
  const raw=storage.getItem(key(kind,actorId,target));if(raw===null)return null;
  const record=JSON.parse(raw),body=record?.body;
  if(record.actorId!==actorId || !validSessionProof(record) || !body || body.waveProtocol!==2
   || ['mode','version','islandOwner','runEpoch'].some(name=>body.economy?.[name]!==sessionAssertion(record.origin)[name])
   || body.sessionId!==record.sessionId || body.connectionGeneration!==record.connectionGeneration
   || (kind==='start'?body.where!==target || !sessionUid(body.actionUid):body.waveId!==target || !validFinish(body)))throw new Error('The original wave request could not be read.');
  return record;
 }
 const save=(kind,target,record)=>{storage.setItem(key(kind,record.actorId,target),JSON.stringify(record));return record;};
 const clear=(kind,target,record)=>{const previous=pending(kind,record.actorId,target);if(previous && JSON.stringify(previous)===JSON.stringify(record))storage.removeItem(key(kind,record.actorId,target));};
 async function ask(send,record,parse){
  if(record.actorId!==actor())return failed('auth_context_changed','The signed-in player changed.',0);
  let answer;try{answer=await send();}catch{return failed('network_error','The wave request did not finish. Retry it.',0);}
  if(record.actorId!==actor())return failed('auth_context_changed','The signed-in player changed.',0);
  if(!answer?.ok)return {...answer,ok:false,status:Number.isInteger(answer?.status)?answer.status:0};
  const data=parse(answer.data);if(!data)return failed('unreadable','The wave response could not be verified.',502);
  const now=selected();
  if(data.economy && sameEconomyScope(record.origin,now) && (now.revision!==data.economy.revision
   || JSON.stringify(now.treasury)!==JSON.stringify(data.economy.treasury)))onEconomy(data.economy,record.origin);
  return {...answer,data};
 }
 const bodyProof=proof=>({economy:sessionAssertion(proof.origin),sessionId:proof.sessionId,connectionGeneration:proof.connectionGeneration});
 function remember(data){if(data && !data.historical)waves.set(data.waveId,{origin:sessionOrigin(data.initialSnapshot.economy),actorId:actor()});}
 async function currentWave({where='own'}={}){
  const target=whereOf(where),origin=sessionOrigin(selected()),actorId=actor(),proof=live();
  if(!target || !origin || !uuid(actorId))return failed('economy_context_required','Read the selected island.');
  const record={actorId,origin,...(proof?{sessionId:proof.sessionId,connectionGeneration:proof.connectionGeneration}:{})};
  const query=new URLSearchParams({where:target,waveProtocol:'2'});if(proof){query.set('sessionId',proof.sessionId);query.set('connectionGeneration',proof.connectionGeneration);}
  const answer=await ask(()=>transport.get(`/api/waves/current?${query}`,options),record,data=>data===null?{empty:true}:readNativeWave(data,record));
  if(!sameEconomyScope(origin,selected()))return failed('economy_context_changed','The selected island changed.',0);
  if(answer.ok){if(answer.data.empty)return {...answer,data:null};remember(answer.data);}return answer;
 }
 async function startWave({where='own'}={}){
  const target=whereOf(where),actorId=actor();if(!target)return failed('validation_error','Choose a valid island.',422);
  let record;
  try{record=pending('start',actorId,target);if(!record){const proof=live();if(!proof)return failed('session_context_required','Connect your controlling Captain session.');
   const actionUid=makeUid();if(!sessionUid(actionUid))throw new Error('The bell identity could not be saved.');
   record=save('start',target,{...copy(proof),body:{where:target,actionUid,waveProtocol:2,...bodyProof(proof)}});}}
  catch(error){return failed('wave_retry_unavailable',error.message,503);}
  const answer=await ask(()=>transport.post('/api/waves/start',copy(record.body),options),record,data=>readNativeWave(data,record));
  if(answer.ok || !uncertain(answer)){try{clear('start',target,record);}catch{return failed('wave_retry_unavailable','The confirmed bell could not be saved.',503);}}
  if(answer.ok){remember(answer.data);if(!answer.data.historical && !sameEconomyScope(record.origin,selected()))return {...answer,ignored:true};}return answer;
 }
 async function joinWave({waveId}={}){
  const known=waves.get(waveId),proof=live();if(!known || !proof || known.actorId!==actor() || !sameEconomyScope(known.origin,proof.origin))return failed('session_context_required','Read the current wave and controlling session.');
  return ask(()=>transport.post('/api/waves/join',{waveId,waveProtocol:2,...bodyProof(proof)},options),proof,data=>readNativeWave(data,proof));
 }
 async function finishWave(body){
  const actorId=actor(),waveId=body?.waveId;let record;
  if(!uuid(waveId))return failed('validation_error','Choose the original wave.',422);
  try{record=pending('finish',actorId,waveId);if(!record){const known=waves.get(waveId),proof=live();
   if(!known || !proof || known.actorId!==actorId || !sameEconomyScope(known.origin,proof.origin))return failed('session_context_required','Read the original controlling wave.');
   if(!validFinish(body))return failed('validation_error','Use the accepted wave checkpoint.',422);
   record=save('finish',waveId,{...copy(proof),body:{...copy(body),waveProtocol:2,...bodyProof(proof)}});}}
  catch(error){return failed('wave_retry_unavailable',error.message,503);}
  const answer=await ask(()=>transport.post('/api/waves/finish',copy(record.body),options),record,data=>readNativeFinish(data,record,waveId));
  if(answer.ok || !uncertain(answer)){try{clear('finish',waveId,record);}catch{return failed('wave_retry_unavailable','The confirmed finish could not be saved.',503);}}return answer;
 }
 function recoveryTransport(legacy=transport){
  return {
   async get(path,extra){
    const match=/^\/api\/waves\/([^/]+)\/events\?/.exec(path),known=match?waves.get(match[1]):null;
    if(!match)return legacy.get(path,extra);
    if(!known){return allowLegacy()?legacy.get(path,extra):failed('wave_context_required','Read the original shared wave.');}
    if(known.actorId!==actor() || !sameEconomyScope(known.origin,selected()))return failed('wave_context_changed','Read the selected wave.',0);
    const proof=live(),query=new URLSearchParams(path.slice(path.indexOf('?')+1));
    query.set('islandOwner',known.origin.islandOwner);query.set('runEpoch',known.origin.runEpoch);
    if(proof){query.set('sessionId',proof.sessionId);query.set('connectionGeneration',proof.connectionGeneration);}
    const record={...known,...proof};
    const answer=await ask(()=>transport.get(`${path.slice(0,path.indexOf('?'))}?${query}`,options),record,data=>data && typeof data==='object'?data:null);
    return sameEconomyScope(known.origin,selected())?answer:failed('wave_context_changed','The selected wave changed.',0);
   },
   async post(path,body,extra){
    if(path==='/api/waves/finish'){
     let retained=false;try{retained=!!pending('finish',actor(),body?.waveId);}catch{return failed('wave_retry_unavailable','The original finish could not be read.',503);}
     if(waves.has(body?.waveId) || retained || selected())return finishWave(body);
     return allowLegacy()?legacy.post(path,body,extra):failed('wave_context_required','Read the original shared wave.');
    }
    const match=/^\/api\/waves\/([^/]+)\/(inputs|health|captains)$/.exec(path),known=match?waves.get(match[1]):null;
    if(!match)return legacy.post(path,body,extra);
    if(!known)return allowLegacy()?legacy.post(path,body,extra):failed('wave_context_required','Read the original shared wave.');
    const proof=live();if(!proof || known.actorId!==actor() || !sameEconomyScope(known.origin,proof.origin))return failed('session_context_required','Reconnect the original controlling wave.');
    if(body?.waveProtocol!==2 || match[2]==='inputs' && (!Array.isArray(body.inputs) || body.inputs.some(row=>row.command?.type==='captain_revive' || row.command?.type==='captain_move' && Object.hasOwn(row.command,'away'))))
     return failed('validation_error','Use canonical session commands.',422);
    const answer=await ask(()=>transport.post(path,{...copy(body),...bodyProof(proof)},options),proof,data=>data && typeof data==='object'?data:null);
    return sameEconomyScope(known.origin,selected())?answer:failed('wave_context_changed','The selected wave changed.',0);
   },
  };
 }
 return {currentWave,startWave,joinWave,finishWave,
  recoveryTransport,
  async retryFinishes(){
   const results=[],actorId=actor();if(!uuid(actorId) || typeof storage?.key!=='function')return results;
   const prefix=key('finish',actorId,'');
   const keys=Array.from({length:storage.length},(_,index)=>storage.key(index)).filter(name=>typeof name==='string' && name.startsWith(prefix));
   for(const name of keys){if(actor()!==actorId)break;const waveId=name.slice(prefix.length);
    try{const record=pending('finish',actorId,waveId);if(record)results.push(await finishWave(record.body));}
    catch{results.push(failed('wave_retry_unavailable','The original finish could not be read.',503));}
   }return results;
  },
  waveOrigin:waveId=>{const known=waves.get(waveId);return known?.actorId===actor()?sessionOrigin(known.origin):null;},
 };
}
