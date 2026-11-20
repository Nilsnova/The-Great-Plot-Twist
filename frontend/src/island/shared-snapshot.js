// Strict coherent shared-island reads and presentation aliases. Used by the island API.
import {readEconomy} from './economy-view.js';
import {readPersonalCaptain} from './economy-captain.js';
import {decimal,uuid,text,QUOTE_GROUPS,isQuoteRow} from './shared-quotes.js';
import {campaignOf} from '../campaign/index.js';
const count = value => Number.isSafeInteger(value) && value >= 0;
const arrayOf = (value,predicate) => Array.isArray(value) && value.every(predicate);
const nullableText = value => value===null || text(value);
const crewIds=['gunner','guard','lookout','carpenter'];
const isCrew = value => !!value && crewIds.every(key=>count(value[key]));
const isSpot = row => !!row && text(row.id) && text(row.kind) && arrayOf(row.kinds,text)
 && typeof row.built==='boolean' && [0,1,2,3,4,5].includes(row.level)
 && (row.built ? uuid(row.instanceId) && row.level>0 : row.instanceId===null && row.level===0)
 && nullableText(row.spec) && [0,1,2,3].includes(row.treeA) && [0,1,2,3].includes(row.treeB) && decimal(row.revision)
 && Number.isFinite(row.x) && Number.isFinite(row.z)
 && (row.hpUnits===null || count(row.hpUnits) && row.hpUnits<=1000000)
 && (row.maxHP===null || Number.isFinite(row.maxHP) && row.maxHP>0);
const isResearch = row => !!row && text(row.branch) && [0,1,2,3].includes(row.tier)
 && nullableText(row.choice2) && nullableText(row.choice3) && decimal(row.revision) && decimal(row.coinsPaid);
const isOffer = row => !!row && crewIds.includes(row.crew) && count(row.count) && decimal(row.priceCoins)
 && count(row.maxCount) && count(row.unlockWave) && typeof row.available==='boolean' && (row.reason===null || text(row.reason));
function isPersonal(value) {
 if(value===null) return true;
 const skills=value?.skills;
 return !!readPersonalCaptain(value?.captain) && !!skills && count(skills.points) && count(skills.spent) && count(skills.earned)
  && skills.points+skills.spent===skills.earned && arrayOf(skills.known,text);
}
export function readSharedSnapshot(value) {
 if(value?.snapshotVersion!==1 || !uuid(value.actorId) || !text(value.code) || typeof value.ownerName!=='string'
  || !readEconomy(value.economy) || !['active','paused'].includes(value.admissionState)
  || !count(value.waveBest) || !count(value.flags) || !count(value.nextWave) || value.nextWave<1
  || !isCrew(value.crew) || !arrayOf(value.crewOffers,isOffer) || !isPersonal(value.personalCaptain)
  || !arrayOf(value.spots,isSpot) || !arrayOf(value.research,isResearch)
  || !decimal(value.wreck?.paidCoins) || !decimal(value.wreck?.goalCoins) || BigInt(value.wreck.goalCoins)<=0n
  || ![1,2].includes(value.layout?.version) || !Number.isFinite(value.layout.grid) || value.layout.grid<=0 || value.layout.movable!==false
  || ![0,1].includes(value.recoveryVersion) || ![1,2].includes(value.waveProtocol)
  || typeof value.serverNow!=='string' || !Number.isFinite(Date.parse(value.serverNow))) return null;
 for(const group of QUOTE_GROUPS) {
  const rows=value.quotes?.[group];
  if(!arrayOf(rows,row=>isQuoteRow(group,row)) || rows.some((row,index)=>rows.slice(0,index).some(old=>JSON.stringify(old.target)===JSON.stringify(row.target)))) return null;
  if(value.admissionState!=='active' && rows.some(row=>row.available)) return null;
 }
 for(const key of ['arsenal','session','move','repair','reset','market','match']) {
  const capability=value.capabilities?.[key];
  if(typeof capability?.available!=='boolean' || (capability.available ? capability.reason!==null : !text(capability.reason))) return null;
 }
 return value;
}
export const declaresSharedSnapshot = value => !!value && Object.hasOwn(value,'snapshotVersion');
export function sharedPresentation(value) {
 const personal=value.personalCaptain;
 return {...value,quotesStale:false,spots:value.spots.map(row=>({...row,tree:{a:row.treeA,b:row.treeB}})),
  ...(personal ? {captain:personal.captain,skills:personal.skills} : {})};
}
export function islandCampaign(value) {
 const campaign=campaignOf(value);
 if(value?.snapshotVersion!==1) return campaign;
 const branches=value.research;
 return {...campaign,research:{done:new Set(branches.filter(row=>row.tier>0).map(row=>row.branch)),branches,
  tiers:Object.fromEntries(branches.map(row=>[row.branch,{tier:row.tier,tier2:row.choice2,tier3:row.choice3}]))},
  wreck:{paid:value.wreck.paidCoins,goal:value.wreck.goalCoins,gifts:(value.quotes?.wreck??[]).map(row=>row.target.amount)}};
}
export function readSharedDemolition(value) {
 return value?.quoteVersion===1 && uuid(value.actorId) && !!readEconomy(value.economy) && isQuoteRow('demolish',value.quote) ? value : null;
}
