// Persist original attach identity before sending; storage contains no token or permission grant.
import {sessionOrigin,sessionAssertion,sessionUid,positiveGeneration} from './shared-session-shapes.js';
import {sameEconomyScope} from './economy-view.js';
import {uuid,decimal} from './shared-quotes.js';
const prefix='plot_twist_canonical_session_v1:';
const clone=value=>JSON.parse(JSON.stringify(value));
export function createSessionIntents({storage,makeUid,makeSessionId}={}){
 const key=actor=>`${prefix}${actor}`;
 function read(actor){
  if(!storage || !uuid(actor))throw new Error('Session retry storage is unavailable.');
  const raw=storage.getItem(key(actor));if(raw===null)return null;
  const saved=JSON.parse(raw);
  if(saved?.actorId!==actor || !sessionOrigin(saved.origin) || !uuid(saved.sessionId)
   || (saved.phase==='attach' ? !decimal(saved.expectedGeneration) || !sessionUid(saved.actionUid)
    : saved.phase!=='known' || !positiveGeneration(saved.connectionGeneration)))throw new Error('Session retry storage could not be read.');
  return saved;
 }
 const save=record=>{storage.setItem(key(record.actorId),JSON.stringify(record));return clone(record);};
 function attachRecord(saved){return {actorId:saved.actorId,origin:sessionOrigin(saved.origin),body:{
  economy:sessionAssertion(saved.origin),sessionId:saved.sessionId,expectedGeneration:saved.expectedGeneration,actionUid:saved.actionUid,
 }};}
 return {
  read,
  begin(actorId,origin){
   const previous=read(actorId);
   if(!sessionOrigin(origin) || previous && !sameEconomyScope(previous.origin,origin))throw new Error('Leave the original controlling session before changing islands.');
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
   return save({actorId:previous.actorId,origin:previous.origin,sessionId:previous.sessionId,
    connectionGeneration:session.connectionGeneration,phase:'known'});
  },
  refuse(record){
   const previous=read(record.actorId);
   if(previous?.phase==='attach' && previous.actionUid===record.body.actionUid)storage.removeItem(key(record.actorId));
  },
 };
}
