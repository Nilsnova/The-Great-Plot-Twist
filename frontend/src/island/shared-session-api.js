// Authenticated canonical session HTTP; historical operation projections never grant current control.
import {ECONOMY_CAPABILITY_HEADERS} from '../online/api.js';
import {readEconomy,sameEconomyScope} from './economy-view.js';
import {uuid,decimal} from './shared-quotes.js';
import {readSessionMetadata,sessionOrigin,sessionAssertion,sessionUid,validSessionProof,validSessionReceipt} from './shared-session-shapes.js';
const options=Object.freeze({headers:ECONOMY_CAPABILITY_HEADERS});
const failed=(code,message,status=409)=>({ok:false,status,code,message});
const clone=value=>JSON.parse(JSON.stringify(value));
const exact=(value,keys)=>!!value && typeof value==='object' && !Array.isArray(value)
 && Object.keys(value).length===keys.length && keys.every(key=>Object.hasOwn(value,key));
export function createSharedSessionApi({transport,getEconomy,getActorId}={}){
 if(typeof transport?.get!=='function' || typeof transport?.post!=='function' || typeof getEconomy!=='function' || typeof getActorId!=='function')
  throw new TypeError('Canonical sessions require authenticated transport and current actor/economy callbacks.');
 const actor=()=>{try{return getActorId();}catch{return null;}};
 const selected=()=>{try{return readEconomy(getEconomy());}catch{return null;}};
 const owns=record=>uuid(actor()) && record?.actorId===actor() && !!sessionOrigin(record.origin);
 const current=record=>owns(record) && sameEconomyScope(record.origin,selected());
 async function ask(send,valid,expectedActor){
  if(!uuid(expectedActor) || expectedActor!==actor())return failed('economy_context_required','Read this island with the signed-in player.');
  let answer;try{answer=await send();}catch{return failed('network_error','The request did not finish. Retry it.',0);}
  if(actor()!==expectedActor)return failed('auth_context_changed','The signed-in player changed.',0);
  if(!answer?.ok)return {...answer,ok:false,status:Number.isInteger(answer?.status)?answer.status:0};
  if(!valid(answer.data))return failed('unreadable','The session response could not be verified.',502);
  return {ok:true,status:answer.status??200,data:answer.data};
 }
 function proofBody(record){return {economy:sessionAssertion(record.origin),sessionId:record.sessionId,connectionGeneration:record.connectionGeneration};}
 const matches=(data,record)=>{
  const value=readSessionMetadata(data);return !!value && sameEconomyScope(value.economy,record.origin)
   && (!value.session.isController || value.session.sessionId===record.sessionId && value.session.connectionGeneration===record.connectionGeneration);
 };
 async function proofChange(kind,record,live){
  if(!validSessionProof(record) || !(live?current(record):owns(record)))return failed('economy_context_required','Read the current controlling session.');
  const answer=await ask(()=>transport.post(`/api/island/session/${kind}`,proofBody(record),options),data=>matches(data,record),record.actorId);
  if(live && !current(record))return failed('economy_context_changed','The selected island changed.',0);
  return answer;
 }
 async function operation(kind,record){
  if(!validSessionProof(record) || !owns(record) || !sessionUid(record.actionUid))return failed('economy_context_required','Read the current controlling session.');
  const body={...proofBody(record),actionUid:record.actionUid};
  if(kind==='settings'){
   if(!current(record))return failed('economy_context_required','Read the selected session.');
   const keys=['breakPaused','autoNext','countdownSeconds'].filter(key=>record[key]!==undefined);
   if(!keys.length || keys.some(key=>key==='countdownSeconds'? !Number.isInteger(record[key]) || record[key]<0 || record[key]>60 : typeof record[key]!=='boolean'))
    return failed('validation_error','Choose valid session settings.',422);
   for(const key of keys)body[key]=record[key];
  }
  const answer=await ask(()=>transport.post(`/api/island/session/${kind}`,body,options),data=>validSessionReceipt(data,record,`session_${kind}`),record.actorId);
  return answer.ok?{...answer,data:{...answer.data,economy:null,session:null}}:answer;
 }
 return {
  async read(proof=null){
   const origin=sessionOrigin(selected()),expectedActor=actor();
   if(!origin || !uuid(expectedActor) || proof && (!validSessionProof(proof) || !current(proof)))return failed('economy_context_required','Read the selected island.');
   const query=new URLSearchParams({islandOwner:origin.islandOwner,runEpoch:origin.runEpoch});
   if(proof){query.set('sessionId',proof.sessionId);query.set('connectionGeneration',proof.connectionGeneration);}
   const answer=await ask(()=>transport.get(`/api/island/session?${query}`,options),data=>{
    const value=readSessionMetadata(data);return !!value && sameEconomyScope(value.economy,origin)
     && (proof?matches(data,proof):!value.session.isController);
   },expectedActor);
   if(!sameEconomyScope(origin,selected()))return failed('economy_context_changed','The selected island changed.',0);
   return answer;
  },
  async attach(record){
   const body=record?.body;
   if(!owns(record) || !exact(body,['economy','sessionId','expectedGeneration','actionUid'])
    || !exact(body.economy,['mode','version','islandOwner','runEpoch']) || !uuid(body.sessionId) || !decimal(body.expectedGeneration)
    || !sessionUid(body.actionUid) || ['mode','version','islandOwner','runEpoch'].some(key=>body.economy[key]!==sessionAssertion(record.origin)[key]))return failed('economy_context_required','Read the original session request.');
   return ask(()=>transport.post('/api/island/session/attach',clone(body),options),data=>{
    const value=readSessionMetadata(data);return !!value && sameEconomyScope(value.economy,record.origin) && value.session.isController && value.session.sessionId===body.sessionId;
   },record.actorId);
  },
  heartbeat:record=>proofChange('heartbeat',record,true),
  disconnect:record=>proofChange('disconnect',record,false),
  leave:record=>operation('leave',record),settings:record=>operation('settings',record),
 };
}
