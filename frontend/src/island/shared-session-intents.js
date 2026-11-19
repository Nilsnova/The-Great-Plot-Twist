// Persist original attach identity before sending; storage contains no token or permission grant.
import {sessionOrigin,sessionAssertion,sessionUid,positiveGeneration,validSessionProof} from './shared-session-shapes.js';
import {sameEconomyScope} from './economy-view.js';
import {uuid,decimal} from './shared-quotes.js';
const prefix='plot_twist_canonical_session_v1:';
const clone=value=>JSON.parse(JSON.stringify(value));
export function createSessionIntents({storage,makeUid,makeSessionId}={}){
 const key=actor=>`${prefix}${actor}`;
 const leaveKey=actor=>`${prefix}leave:${actor}`;
 const settingsKey=actor=>`${prefix}settings:${actor}`;
 const inertKey=(actor,origin)=>`${prefix}inert:${actor}:${origin.islandOwner}:${origin.accountId}:${origin.runEpoch}`;
 function readAt(actor,name){
  if(!storage || !uuid(actor))throw new Error('Session retry storage is unavailable.');
  const raw=storage.getItem(name);if(raw===null)return null;
  const saved=JSON.parse(raw);
  if(saved?.actorId!==actor || !sessionOrigin(saved.origin) || !uuid(saved.sessionId)
   || (saved.phase==='attach' ? !decimal(saved.expectedGeneration) || !sessionUid(saved.actionUid)
    : saved.phase!=='known' || !positiveGeneration(saved.connectionGeneration)))throw new Error('Session retry storage could not be read.');
  return saved;
 }
 const read=actor=>readAt(actor,key(actor));
 const save=record=>{storage.setItem(key(record.actorId),JSON.stringify(record));return clone(record);};
 function departure(actor){
  if(!storage || !uuid(actor))throw new Error('Session retry storage is unavailable.');
  const raw=storage.getItem(leaveKey(actor));if(raw===null)return null;
  const saved=JSON.parse(raw);
  if(!validSessionProof(saved) || saved.actorId!==actor || !sessionUid(saved.actionUid))throw new Error('The original departure could not be read.');
  return saved;
 }
 const settingNames=['breakPaused','autoNext','countdownSeconds'];
 const validSettings=record=>validSessionProof(record) && sessionUid(record.actionUid)
  && Object.keys(record).every(key=>['actorId','origin','sessionId','connectionGeneration','actionUid',...settingNames].includes(key))
  && settingNames.some(key=>Object.hasOwn(record,key)) && settingNames.every(key=>!Object.hasOwn(record,key)
    || (key==='countdownSeconds'?Number.isInteger(record[key]) && record[key]>=0 && record[key]<=60:typeof record[key]==='boolean'));
 function settings(actor){
  if(!storage || !uuid(actor))throw new Error('Session retry storage is unavailable.');
  const raw=storage.getItem(settingsKey(actor));if(raw===null)return null;
  const saved=JSON.parse(raw);if(saved.actorId!==actor || !validSettings(saved))throw new Error('The original settings request could not be read.');return saved;
 }
 function attachRecord(saved){return {actorId:saved.actorId,origin:sessionOrigin(saved.origin),body:{
  economy:sessionAssertion(saved.origin),sessionId:saved.sessionId,expectedGeneration:saved.expectedGeneration,actionUid:saved.actionUid,
 }};}
 return {
  read,
  departure,
  settings,
  retire(actor,origin){
   if(!sessionOrigin(origin))throw new Error('Read the confirmed original run.');
   const saved=read(actor),leaving=departure(actor),changing=settings(actor);
   if(saved?.phase==='known' && sameEconomyScope(saved.origin,origin))storage.removeItem(key(actor));
   if(leaving && sameEconomyScope(leaving.origin,origin))storage.removeItem(leaveKey(actor));
   if(changing && sameEconomyScope(changing.origin,origin))storage.removeItem(settingsKey(actor));
  },
  changeSettings(proof,changes){
   const saved=settings(proof?.actorId);if(saved)return clone(saved);
   if(!changes || typeof changes!=='object' || Array.isArray(changes) || !Object.keys(changes).length || Object.keys(changes).some(key=>!settingNames.includes(key)))throw new Error('Choose valid session settings.');
   const record={...clone(proof),...clone(changes??{}),actionUid:makeUid()};
   if(!validSettings(record))throw new Error('Choose valid session settings.');
   storage.setItem(settingsKey(record.actorId),JSON.stringify(record));return clone(record);
  },
  changedSettings(record){
   const saved=settings(record.actorId);if(saved && JSON.stringify(saved)===JSON.stringify(record))storage.removeItem(settingsKey(record.actorId));
  },
  depart(actor){
   const pending=departure(actor);if(pending)return clone(pending);
   const saved=read(actor);if(saved?.phase!=='known')return null;
   const {phase:_,...proof}=saved,record={...proof,actionUid:makeUid()};
   if(!validSessionProof(record) || !sessionUid(record.actionUid))throw new Error('The departure could not be saved.');
   storage.setItem(leaveKey(actor),JSON.stringify(record));return clone(record);
  },
  departed(record){
   const pending=departure(record.actorId);
   if(!pending || pending.actionUid!==record.actionUid || pending.sessionId!==record.sessionId
    || pending.connectionGeneration!==record.connectionGeneration || !sameEconomyScope(pending.origin,record.origin))throw new Error('The original departure changed.');
   const saved=read(record.actorId);
   if(saved?.phase==='known' && saved.sessionId===record.sessionId && saved.connectionGeneration===record.connectionGeneration
    && sameEconomyScope(saved.origin,record.origin))storage.removeItem(key(record.actorId));
   storage.removeItem(leaveKey(record.actorId));
  },
  begin(actorId,origin){
   if(departure(actorId))throw new Error('Confirm the original departure before attaching.');
   let previous=read(actorId);
   if(!sessionOrigin(origin))throw new Error('Read the selected session origin.');
   if(previous && !sameEconomyScope(previous.origin,origin)){
    if(previous.phase!=='attach')throw new Error('Leave the original controlling session before changing islands.');
    const name=inertKey(actorId,previous.origin),inert=readAt(actorId,name);
    if(inert && (inert.phase!=='attach' || inert.actionUid!==previous.actionUid || inert.sessionId!==previous.sessionId
      || inert.expectedGeneration!==previous.expectedGeneration))throw new Error('The original attachment retry changed.');
    storage.setItem(name,JSON.stringify(previous));storage.removeItem(key(actorId));previous=null;
   }
   if(!previous){
    const inert=readAt(actorId,inertKey(actorId,origin));
    if(inert){if(inert.phase!=='attach')throw new Error('The retained attachment could not be read.');previous=save(inert);}
   }
   if(previous?.phase==='attach')return attachRecord(previous);
   const saved={actorId,origin:sessionOrigin(origin),sessionId:previous?.sessionId??makeSessionId(),
    expectedGeneration:previous?.connectionGeneration??'0',actionUid:makeUid(),phase:'attach'};
   if(!uuid(saved.sessionId) || !sessionUid(saved.actionUid))throw new Error('The session request could not be saved.');
   return attachRecord(save(saved));
  },
  confirm(record,metadata){
   const previous=read(record.actorId),session=metadata.session;
   if(previous?.phase!=='attach' || previous.actionUid!==record.body.actionUid || session.sessionId!==previous.sessionId
    || !sameEconomyScope(metadata.economy,previous.origin) || !positiveGeneration(session.connectionGeneration))throw new Error('The original session request changed.');
   const name=inertKey(record.actorId,record.origin),inert=readAt(record.actorId,name);
   if(inert?.phase==='attach' && inert.actionUid===record.body.actionUid)storage.removeItem(name);
   return save({actorId:previous.actorId,origin:previous.origin,sessionId:previous.sessionId,
    connectionGeneration:session.connectionGeneration,phase:'known'});
  },
  refuse(record){
   const previous=read(record.actorId);
   if(previous?.phase==='attach' && previous.actionUid===record.body.actionUid)storage.removeItem(key(record.actorId));
  },
 };
}
