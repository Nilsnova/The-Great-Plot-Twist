// Validate immutable domain effects independently of later island reads. Used by shared POST adapters.
import {sameEconomyScope} from './economy-view.js';
import {decimal,uuid} from './shared-quotes.js';
const actions={towerSkill:'specialise',towerTree:'tower_tree'};
const count=value=>Number.isSafeInteger(value) && value>=0;
export function isSharedReceipt(data,{snapshot,group,body}) {
 const receipt=data?.receipt, origin=receipt?.origin,result=receipt?.result;
 if(data?.status!=='done' || typeof data.repeat!=='boolean' || !uuid(receipt?.receiptId)
  || receipt.actionUid!==body.actionUid || receipt.action!==(actions[group]??group) || receipt.actorId!==snapshot.actorId
  || origin?.mode!=='island_shared' || origin.version!==1 || !sameEconomyScope(origin,snapshot.economy) || !result) return false;
 // Live projections are optional and cannot invalidate a proven immutable effect.
 if(!decimal(result.chargedCoins)) return false;
 if(group==='hire') return result.crew===body.crew && count(result.previousCount) && result.count===result.previousCount+1 && uuid(result.treasuryReceiptId);
 const price=body.quotedCoins;
 if(['build','upgrade','demolish'].includes(group)) return result.spot===body.spot && result.kind===body.kind && uuid(result.instanceId)
  && (group==='build' ? result.level===1 : group==='upgrade' ? result.level===body.expectedLevel+1 : result.level===body.expectedLevel)
  && (body.instanceId===null || result.instanceId===body.instanceId)
  && result.chargedCoins===(group==='demolish'?'0':price) && result.refundedCoins===(group==='demolish'?price:'0');
 if(group==='wreck') return BigInt(result.chargedCoins)<=BigInt(price) && count(result.wreckPaid);
 if(result.chargedCoins!==price) return false;
 if(group==='research') return result.research?.branch===body.branch && [1,2,3].includes(result.research.tier) && result.research.tier>=body.tier
  && (body.tier===1 || result.research[`choice${body.tier}`]===body.choice) && decimal(result.research.revision);
 if(group==='towerSkill' || group==='towerTree') {
  const building=result.building;
  return building?.spot===body.spot && building.instanceId===body.expected.instanceId && building.kind===body.expected.kind
   && (group==='towerSkill' ? building.spec===body.spec : building[body.path==='a'?'treeA':'treeB']===body.tier) && decimal(building.revision);
 }
 return group==='wreck' && count(result.wreckPaid);
}
