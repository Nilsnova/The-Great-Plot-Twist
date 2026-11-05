// Fake-only search eligibility, explicit paid consent, prices and case-clock jobs.
import {routes,spotNames,windowStatus} from './routes.js';
import {cardTitles,kits} from './data.js';
import {cardOpen} from './board.js';
import {accept,refuse,playerSeat} from './state.js';
export function routeStatus(state,route,seat=playerSeat(state),arrivalMinutes=0,allowPaid=false) {
  const member=state.crew?.seats.find(item=>item.seat===seat),kitId=member?.kitId??state.profile?.kitId;
  if(!cardOpen(state,route.cardId))return refuse('lead_locked','This lead has not opened yet.');
  if(route.playersOnly&&member?.kind==='npc')return refuse('players_only','That route needs a player.');
  if(route.kit&&route.kit!==kitId)return refuse('wrong_kit','This route needs a different kit.');
  if(route.readLog&&!state.profile?.readLog)return refuse('log_required','This route needs Elena’s log entry.');
  if(route.worldCrate&&!state.beachCrate)return refuse('world_route_unavailable','No sealed crate has washed up here.');
  if(route.requiresShare)return refuse('share_route_unavailable','The shareholder route awaits the Exchange adapter. Other routes stay available.');
  if(route.price&&!allowPaid)return refuse('payment_confirmation_required',`This shortcut costs ${route.price} coins.`);
  const window=windowStatus(state.now,route.window,arrivalMinutes);if(!window.open)return {...refuse('locked_window',`Opens in ${window.minutes} minutes.`),minutes:window.minutes};
  if(route.price>state.coins)return refuse('no_coins','There are not enough play coins for this shortcut.');return accept('Ready to search.');
}
export function inspectSpot(state,id) {if(!Object.hasOwn(spotNames,id))return refuse('unknown_spot','That search spot is not registered.');state.activeSpot=id;return accept(spotNames[id]);}
export function startSearch(state,routeId,{paidConfirmed=false}={}) {
  if(state.crew?.status!=='active')return refuse('crew_required','Muster the crew before searching.');
  const route=routes.find(item=>item.id===routeId);if(!route||route.spot!==state.activeSpot)return refuse('wrong_spot','Open this search spot before starting its route.');
  const seat=playerSeat(state);if(state.found[seat].includes(route.cardId))return refuse('already_have','This card is already in your journal.');
  if(state.jobs.some(job=>!job.done&&job.seat===seat))return refuse('busy','Finish your current search first.');
  const allowed=routeStatus(state,route,seat,0,paidConfirmed);if(!allowed.accepted)return allowed;
  state.coins-=route.price;state.jobs.push({id:++state.jobId,seat,order:'search',cardId:route.cardId,spot:route.spot,orderedAt:state.now,readyAt:state.now+route.seconds,done:false,price:route.price});
  return accept(route.seconds?`Searching for ${cardTitles[route.cardId]}. You can leave while the timer runs.`:`${cardTitles[route.cardId]} found.`);
}
export function searchView(state) {
  const seat=playerSeat(state),member=state.crew?.seats.find(item=>item.seat===seat),busy=state.jobs.some(job=>!job.done&&job.seat===seat);
  return {activeSpot:state.activeSpot,label:spotNames[state.activeSpot],allowSpotPicker:state.allowBrowse,clockLabel:`Case minute ${Math.floor(state.now/60)}`,
    spots:Object.entries(spotNames).map(([id,label])=>({id,label})),routes:routes.filter(route=>route.spot===state.activeSpot).map(route=>{
      const status=routeStatus(state,route,seat,0,true),held=state.found[seat].includes(route.cardId),available=state.crew?.status==='active'&&!busy&&!held&&status.accepted;
      return {...route,title:cardOpen(state,route.cardId)?cardTitles[route.cardId]:'Unexplored lead',canStart:available,statusText:held?'Already in your journal':busy?'A search is already running':status.message,waitMinutes:status.minutes??0,kitName:route.kit?kits[route.kit].name:null};
    }),jobs:state.jobs.filter(job=>job.seat===seat).map(job=>({id:job.id,title:cardTitles[job.cardId]??'Search',total:job.readyAt-job.orderedAt,remaining:Math.max(0,job.readyAt-state.now),done:job.done,report:job.report??'Searching…'}))};
}
