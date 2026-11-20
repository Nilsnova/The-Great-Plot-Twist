// Exact endpoint quotes from coherent shared reads. Used by the API and card models.
import {localSpotId} from './spots.js';
export const decimal = value => typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value);
export const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
export const text = value => typeof value === 'string' && value.length > 0 && value.length <= 200;
const count = value => Number.isSafeInteger(value) && value >= 0;
const exact = (value, keys) => !!value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value,key));
const nullableText = value => value === null || text(value);
const fields = {
 build:['spot','kind','instanceId','expectedLevel','quotedCoins'],
 upgrade:['spot','kind','instanceId','expectedLevel','quotedCoins'],
 demolish:['spot','kind','instanceId','expectedLevel','quotedCoins'],
 research:['branch','tier','choice','change','expected','quotedCoins'],
 towerSkill:['spot','spec','expected','quotedCoins'],
 towerTree:['spot','path','tier','expected','quotedCoins'],wreck:['amount','quotedCoins'],
};
const targets = {build:['spot','kind'],upgrade:['spot'],demolish:['spot'],research:['branch','tier','choice','change'],
 towerSkill:['spot','spec'],towerTree:['spot','path','tier'],wreck:['amount']};
export const QUOTE_GROUPS = Object.freeze(Object.keys(fields));
export function isQuoteTarget(group,value) {
 if (!exact(value,targets[group] ?? [])) return false;
 if (group==='wreck') return count(value.amount) && value.amount>0;
 if (group==='research') return text(value.branch) && [1,2,3].includes(value.tier) && nullableText(value.choice) && typeof value.change==='boolean';
 if (!text(value.spot)) return false;
 if (group==='build') return text(value.kind);
 if (group==='towerSkill') return text(value.spec);
 if (group==='towerTree') return ['a','b'].includes(value.path) && [1,2,3].includes(value.tier);
 return true;
}
export function isQuotedIntent(group,intent) {
 if (!exact(intent,fields[group] ?? []) || !decimal(intent.quotedCoins)) return false;
 if (['build','upgrade','demolish'].includes(group)) return text(intent.spot) && text(intent.kind)
  && (group==='build' ? intent.instanceId===null && intent.expectedLevel===0 : uuid(intent.instanceId) && [1,2,3,4,5].includes(intent.expectedLevel));
 if (group==='wreck') return count(intent.amount) && intent.amount>0;
 const expected=intent.expected;
 if(group==='research') return isQuoteTarget(group,{branch:intent.branch,tier:intent.tier,choice:intent.choice,change:intent.change})
  && exact(expected,['tier','choice2','choice3','revision']) && [0,1,2,3].includes(expected.tier)
  && nullableText(expected.choice2) && nullableText(expected.choice3) && decimal(expected.revision);
 return text(intent.spot) && exact(expected,['instanceId','kind','level','spec','treeA','treeB','revision'])
  && uuid(expected.instanceId) && text(expected.kind) && [1,2,3,4,5].includes(expected.level)
  && nullableText(expected.spec) && [0,1,2,3].includes(expected.treeA) && [0,1,2,3].includes(expected.treeB) && decimal(expected.revision)
  && (group==='towerSkill' ? text(intent.spec) : ['a','b'].includes(intent.path) && [1,2,3].includes(intent.tier));
}
export function sameTarget(one,two) {
 return !!one && !!two && Object.keys(one).length===Object.keys(two).length && Object.keys(one).every(key =>
  key==='spot' ? localSpotId(one[key])===localSpotId(two[key]) : one[key]===two[key]);
}
export function isQuoteRow(group,row) {
 return exact(row,['target','intent','available','reason']) && isQuoteTarget(group,row.target)
  && typeof row.available==='boolean' && (row.reason===null || text(row.reason))
  && (row.intent===null ? !row.available : isQuotedIntent(group,row.intent)
   && Object.keys(row.target).every(key=>row.intent[key]===row.target[key]));
}
export const quoteFor = (snapshot,group,target) => snapshot?.quotesStale ? null
 : snapshot?.quotes?.[group]?.find(row=>sameTarget(row.target,target)) ?? null;
export const quoteReason = quote => !quote?.intent ? 'Quote unavailable. Reload the island.'
 : quote.available ? '' : ({insufficient_funds:'Not enough island coins.',wave_running:'Between waves only.',locked:'This offer is locked.',
 recovery_option_retired:'This option is unavailable.',admission_paused:'Island spending is paused.'}[quote.reason] ?? 'This offer is unavailable. Reload the island.');
