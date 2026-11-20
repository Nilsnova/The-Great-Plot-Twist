// Shared-island cards use server quotes, never bundled prices. Used by card-model.js.
import {BUILDINGS,CREW,CREW_IDS,statLine,maxLevel} from './td-rules.js';
import {BRANCH_BY_ID,SPECS,optionName,optionLine} from '../campaign/tech.js';
import {ROLES as HOUSE_ROLES} from '../campaign/houses.js';
import {stepLine} from './tree-model.js';
import {TOWER_TREES} from '../pirates/tower-trees.js';
import {cardFunds,exactCoinText,readEconomy} from './economy-view.js';
import {quoteFor,quoteReason} from './shared-quotes.js';
import {localSpotId} from './spots.js';
const price = quote => exactCoinText(quote?.intent?.quotedCoins);
const reason = (quote,battle,busy) => battle ? 'Between waves only.' : quoteReason(quote);
const actionState = (quote,battle,busy) => ({disabled:!!busy || battle || !quote?.intent || !quote.available,reason:reason(quote,battle,busy)});
const rowsFor=(snapshot,group,spot)=>snapshot?.quotesStale ? [] : (snapshot?.quotes?.[group]??[]).filter(row=>localSpotId(row.target.spot)===spot);
export function sharedBuildCard({spotId,kind,slot,spot,busy=false,message='',battle=false,economy,sharedSnapshot:snapshot,treePicked=null}={}) {
 if (!readEconomy(economy)) snapshot=null;
 const built=spot?.built===true,standing=built?spot.kind:kind??spot?.kind,info=BUILDINGS[standing],level=built?spot.level:0;
 const model={spotId,slot,title:info?.name??'Tower spot',purpose:info?.line??'Choose a building.',mode:'info',built,kind:standing,
  level,spec:spot?.spec??null,maxLevel:maxLevel(standing),pips:[],stats:built?statLine(standing,level):'',choices:[],cost:'',button:'',disabled:true,
  reason:'',upgrade:null,soon:'',message,busy,skills:null,locked:false,coins:cardFunds(economy).line,
  owner:'Paid from the island treasury',hire:false,demolish:null,move:null,tree:null};
 if(!spot) {model.reason='The island is still loading.';return model;}
 if(!built) {
  const kinds=spot.kinds??[];
  if(kinds.length>1 || slot==='tower') {
   model.mode='choose';model.title='Tower spot';
   model.choices=kinds.map(kind=>{const quote=quoteFor(snapshot,'build',{spot:spotId,kind});return {kind,name:BUILDINGS[kind]?.name??kind,
    line:BUILDINGS[kind]?.line??'',price:price(quote),...actionState(quote,battle,busy),busy:busy===kind};});
  } else {
   const quote=quoteFor(snapshot,'build',{spot:spotId,kind:standing});
   Object.assign(model,{mode:'build',cost:price(quote),button:busy?'Building…':`Build · ${price(quote)}`,...actionState(quote,battle,busy)});
  }
  return model;
 }
 model.pips=Array.from({length:model.maxLevel},(_,index)=>index<level);
 const demolish=quoteFor(snapshot,'demolish',{spot:spotId});
 model.demolish={label:'Tear down',...actionState(demolish,battle,busy)};
 const skills=rowsFor(snapshot,'towerSkill',spotId);
 if(skills.length) model.skills={line:'Applies to this building.',choices:skills.map(quote=>{
  const id=quote.target.spec,info=SPECS[id]??HOUSE_ROLES[id];return {id,name:info?.name??id,line:info?.line??'',active:spot.spec===id,
   price:price(quote),...actionState(quote,battle,busy),busy:busy===`spec:${id}`};})};
 const upgrade=quoteFor(snapshot,'upgrade',{spot:spotId});
 model.mode=upgrade?'upgrade':'info';model.upgradePrice=price(upgrade);
 model.upgrade=upgrade?{label:`Level ${level+1} · ${price(upgrade)}`,stats:statLine(standing,level,level+1)}:null;
 model.button=upgrade?(busy?'Upgrading…':`Upgrade · ${price(upgrade)}`):'';
 Object.assign(model,actionState(upgrade,battle,busy));
 if(!upgrade && level>=model.maxLevel) model.reason='Highest level reached.';
 if(TOWER_TREES[standing]) model.tree=sharedTowerTree({snapshot,spotId,spot,upgrade,busy,battle,picked:treePicked});
 return model;
}
function sharedTowerTree({snapshot,spotId,spot,upgrade,busy,battle,picked}) {
 const info=TOWER_TREES[spot.kind],top=maxLevel(spot.kind);
 const trunk={id:'level',icon:'★',name:`Level ${spot.level}`,cost:spot.level<top?price(upgrade):'',
  state:spot.level>=top?'learned':upgrade?.available?'ready':'locked',label:`Level ${spot.level}`};
 const nodes=['a','b'].flatMap(path=>[1,2,3].map(tier=>{
  const quote=quoteFor(snapshot,'towerTree',{spot:spotId,path,tier}),known=(spot.tree?.[path]??spot[path==='a'?'treeA':'treeB']??0)>=tier;
  return {id:`${path}${tier}`,path,tier,icon:info[path].icon,name:`${info[path].name} ${'I'.repeat(tier)}`,cost:known?'':price(quote),
   state:known?'learned':quote?.available?'ready':'locked',label:`${info[path].name} ${tier}`,quote};
 }));
 const pick=[trunk,...nodes].find(row=>row.id===picked)??(spot.level<top?trunk:nodes.find(row=>row.state==='ready')??nodes[0]);
 const quote=pick===trunk?upgrade:pick.quote,learned=pick.state==='learned';
 const detail={id:pick.id,icon:pick.icon,state:pick.state,name:pick.name,sub:learned?'Bought':price(quote),line:pick===trunk?statLine(spot.kind,spot.level,Math.min(top,spot.level+1)):stepLine(spot.kind,pick.path,pick.tier-1,pick.tier),
  reason:learned?'':reason(quote,battle,busy),button:learned?'Bought':`${pick===trunk?'Upgrade':'Buy'} · ${price(quote)}`,
  disabled:learned||actionState(quote,battle,busy).disabled,busy:!!busy,
  action:learned?null:pick===trunk?{type:'upgrade'}:{type:'tree',path:pick.path,tier:pick.tier}};
 return {kind:spot.kind,title:`${BUILDINGS[spot.kind].name} tree`,tiers:[{tier:1,fork:false,nodes:[trunk]},
  ...[1,2,3].map(tier=>({tier:tier+1,fork:true,nodes:nodes.filter(row=>row.tier===tier)}))],picked:pick.id,detail,message:'',flag:''};
}
export function sharedCrewCard({crew={},busy=null,message='',battle=false,economy,sharedSnapshot:snapshot}={}) {
 if (!readEconomy(economy)) snapshot=null;
 const rows=CREW_IDS.map(id=>{
  const offer=snapshot?.quotesStale?null:snapshot?.crewOffers?.find(row=>row.crew===id),info=CREW[id],owned=crew[id]??0;
  const unavailable=id==='carpenter',full=!!offer&&owned>=offer.maxCount;
  return {id,name:info.name,line:unavailable?'':info.line,price:unavailable?'':exactCoinText(offer?.priceCoins),
   owned:offer?`${owned}/${offer.maxCount}`:`${owned} retained`,icon:info.icon,
   button:busy===id?'Hiring…':unavailable?'Unavailable':full?'Full':'Hire',
   disabled:unavailable||!!busy||battle||!offer?.available,
   reason:unavailable?'New Carpenter hires are unavailable.':battle?'Between waves only.':!offer?'Offer unavailable. Reload the island.':offer.available?'':offer.reason==='insufficient_funds'?'Not enough island coins.':'This offer is unavailable.'};
 });
 return {title:'Crew',lead:'They help this island in every wave.',rows,soon:'',message,coins:cardFunds(economy).line};
}
export function sharedTechCard({sharedSnapshot:snapshot,economy,busy=null,message='',battle=false,recoveryVersion=0}={}) {
 if (!readEconomy(economy)) snapshot=null;
 const rows=snapshot?.quotesStale?[]:snapshot?.quotes?.research??[];
 const branches=(snapshot?.research??[]).map(state=>{
  const info=BRANCH_BY_ID[state.branch];
  const tiers=[1,2,3].map(tier=>({tier,state:state.tier>=tier?'done':'next',fork:tier>1,reason:'',nodes:rows.filter(row=>row.target.branch===state.branch&&row.target.tier===tier).map(quote=>{
   const {choice,change}=quote.target,name=tier===1?'Tower skills':optionName(choice);
   const chosen=tier===1?state.tier>=1:state[`choice${tier}`]===choice;
   return {id:choice??`${state.branch}-1`,name,line:choice?optionLine(choice):info?.name??state.branch,
    state:chosen?'chosen':quote.available?'open':'locked',note:'',button:chosen?null:{label:`${change?'Change':'Research'} · ${price(quote)}`,
     aria:`${name} ${price(quote)}`,...actionState(quote,battle,busy),action:quote.target}};
  })}));
  return {branch:state.branch,name:info?.name??state.branch,short:BUILDINGS[state.branch]?.name??state.branch,tier:state.tier,
   folded:state.tier>0,summary:`${info?.name??state.branch} · tier ${state.tier} of 3`,prices:[],tiers,next:false};
 });
 return {title:'Tech hub',recoveryVersion,open:true,next:null,line:'Research for the whole island.',branches,message,coins:cardFunds(economy).line};
}
export function sharedWreckCard({sharedSnapshot:snapshot,economy,busy=null,message='',battle=false}={}) {
 if (!readEconomy(economy)) snapshot=null;
 const paid=snapshot?.wreck?.paidCoins,goal=snapshot?.wreck?.goalCoins,valid=typeof paid==='string'&&typeof goal==='string';
 const done=valid&&BigInt(paid)>=BigInt(goal),percent=valid?Number((BigInt(paid)*100n/BigInt(goal))>100n?100n:BigInt(paid)*100n/BigInt(goal)):0;
 const gifts=(snapshot?.quotesStale?[]:snapshot?.quotes?.wreck??[]).map(quote=>({amount:quote.target.amount,
  label:busy===quote.target.amount?'Paying…':`Give ${price(quote)}`,...actionState(quote,battle,busy)}));
 return {title:'The wreck',open:true,done,paid,goal,percent,progress:`${exactCoinText(paid)} of ${exactCoinText(goal)}`,
  line:done?'Her hull is whole again, thanks to the whole crew.':'Repair the island wreck together.',gifts,message,coins:cardFunds(economy).line,
  sail:{open:false,note:'Ship activities are unavailable.',wave:snapshot?.waveBest??0,games:[]}};
}
export function sharedDemolitionCard({quote,busy=false,message=''}) {
 const offer=quote.quote,intent=offer?.intent,info=BUILDINGS[intent?.kind];
 return {title:`Tear down this ${info?.name??'building'}?`,question:intent?`Tear down this ${info?.name??'building'} (level ${intent.expectedLevel})?`:'Quote unavailable.',
  lines:intent?[`The island treasury receives ${price(offer)}.`]:[],refunds:[],button:busy?'Tearing down…':'Tear down',
  ...actionState(offer,false,busy),keep:'Keep it',message,note:'The server credits the island treasury.',after:'The spot is empty again.'};
}
