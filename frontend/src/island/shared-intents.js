// Preserve complete uncertain shared requests across retries and reloads. Used by the island API.
import {islandCode} from './codes.js';
import {economyContext,readEconomy} from './economy-view.js';
import {isQuotedIntent,isQuoteTarget,uuid,text} from './shared-quotes.js';
const STORAGE_KEY='plot_twist_shared_intents_v1';
const copy=value=>JSON.parse(JSON.stringify(value));
const scopeOf = snapshot => [snapshot.actorId,snapshot.economy.islandOwner,snapshot.economy.accountId,snapshot.economy.runEpoch];
const keyOf=(snapshot,group,target)=>JSON.stringify([...scopeOf(snapshot),group,Object.keys(target).sort().map(key=>[key,target[key]])]);
export function createSharedIntents({storage=null,makeUid}={}) {
 let records={}, unreadable=false;
 try { const saved=JSON.parse(storage?.getItem(STORAGE_KEY)??'{}');
  if(saved && typeof saved==='object' && !Array.isArray(saved)) records=saved;
  else unreadable=true;
 } catch { unreadable=true; }
 const save=()=>{try{storage?.setItem(STORAGE_KEY,JSON.stringify(records));}catch{/* In-memory retries remain available. */}};
 function valid(record,snapshot,group,target) {
  if(!record || JSON.stringify(record.scope)!==JSON.stringify(scopeOf(snapshot)) || record.group!==group
   || JSON.stringify(record.target)!==JSON.stringify(target) || !text(record.body?.actionUid)) return false;
  const {actionUid,economy,code,...intent}=record.body;
  if(JSON.stringify(economy)!==JSON.stringify(economyContext(snapshot.economy))) return false;
  if(code!==undefined && islandCode(code)!==islandCode(snapshot.code)) return false;
  return group==='hire' ? Object.keys(intent).length===1 && intent.crew===target.crew : isQuotedIntent(group,intent);
 }
 return Object.freeze({
  pending(snapshot,group,target) {
   if(!uuid(snapshot?.actorId) || !readEconomy(snapshot?.economy)) return null;
   const record=records[keyOf(snapshot,group,target)];
   return valid(record,snapshot,group,target) ? copy(record.body) : null;
  },
  begin(snapshot,group,target,intent,code=null) {
   if(unreadable) return null;
   if(!uuid(snapshot?.actorId) || !readEconomy(snapshot?.economy)) return null;
   const existing=this.pending(snapshot,group,target); if(existing) return existing;
   if(records[keyOf(snapshot,group,target)]) return null;
   if(group==='hire' ? !['gunner','guard','lookout'].includes(intent?.crew) : !isQuoteTarget(group,target) || !isQuotedIntent(group,intent)) return null;
   const body={...copy(intent),economy:economyContext(snapshot.economy),actionUid:makeUid(),...(code?{code}: {})};
   records[keyOf(snapshot,group,target)]={scope:scopeOf(snapshot),group,target:copy(target),body};save();return copy(body);
  },
  finish(snapshot,group,target,actionUid) {const key=keyOf(snapshot,group,target);if(records[key]?.body?.actionUid===actionUid){delete records[key];save();}},
 });
}
