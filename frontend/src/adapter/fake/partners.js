// Fake NPC orders. Partners fetch/pin/man/wait; they never pair, accuse or offer hints.
import {routes,windowStatus,spotNames} from './routes.js';
import {routeStatus} from './search.js';
import {cardTitles} from './data.js';
import {cardOpen} from './board.js';
import {accept,refuse,playerSeat} from './state.js';
export function orderPartner(state,seat,order,target,{allowPaid=false}={}) {
  const member=state.crew?.seats.find(item=>item.seat===seat);
  if(state.crew?.status!=='active'||member?.kind!=='npc')return refuse('npc_required','Choose an NPC partner in your active crew.');
  if(!['search','fetch','pin','man_light','wait'].includes(order))return refuse('order_not_allowed','Partners cannot pair, accuse, aim or give hints.');
  if(state.jobs.some(job=>job.seat===seat&&!job.done))return refuse('busy','This partner is already on an errand.');
  let cardId=null,price=0,seconds=['pin','wait'].includes(order)?300:600;
  if(order==='pin'){if(!state.found[seat].includes(target))return refuse('card_not_held','That card is not in this partner’s satchel.');if(state.pins.some(pin=>pin.cardId===target&&pin.seat===seat))return refuse('already_pinned','This partner already pinned that card.');cardId=target;}
  if(order==='fetch'||order==='search'){
    if(order==='search'&&!Object.hasOwn(spotNames,target))return refuse('unknown_spot','That search spot is not registered.');
    if(order==='search'&&['home_driftline'].includes(target))return refuse('players_only','Partners have no home driftline.');
    const spotRoutes=routes.filter(route=>route.spot===target);
    cardId=order==='fetch'?target:(spotRoutes.find(route=>!state.found[seat].includes(route.cardId)&&routeStatus(state,route,seat,4,true).accepted)??spotRoutes.find(route=>!state.found[seat].includes(route.cardId))??spotRoutes[0])?.cardId;
    if(order==='fetch'&&!cardOpen(state,cardId))return refuse('lead_locked','That card is not an open lead yet.');
    if(cardId&&!cardOpen(state,cardId))cardId=null;
    if(order==='search'&&cardId&&!routes.some(route=>route.spot===target&&route.cardId===cardId&&!route.playersOnly))cardId=null;
    if(cardId&&state.found[seat].includes(cardId))return refuse('already_have','This card is already in the partner’s satchel.');
    if(cardId){const candidates=routes.filter(route=>route.cardId===cardId&&(order==='fetch'||route.spot===target)&&!route.playersOnly);
      const eligible=candidates.filter(route=>routeStatus(state,route,seat,4,allowPaid).accepted).sort((a,b)=>a.price-b.price);
      if(!eligible.length){const paid=candidates.find(route=>route.price&&routeStatus(state,route,seat,4,true).accepted),timed=candidates.filter(route=>route.window).map(route=>windowStatus(state.now,route.window,4).minutes);
        const failures=candidates.map(route=>routeStatus(state,route,seat,4,true));if(!paid&&failures.some(result=>result.reason==='no_coins'))return refuse('no_coins','The available shortcut needs more coins.');
        return {...refuse('locked_window',timed.length?`The partner can leave in ${Math.min(...timed)} minutes.`:'This partner cannot use an available free route.'),offer:paid?{seat,order,target,price:paid.price}:null};}
      price=eligible[0].price;}
  }
  if(order==='man_light'){
    if(state.night?.phase!=='night')return refuse('night_required','Call nightfall before sending a partner to a light.');
    if(!['keepers_lamp','harbor_light'].includes(target))return refuse('players_only','A player must take this light.');
    if(state.night.posts.some(post=>post.lightId===target&&post.seat!==seat))return refuse('post_taken','Another seat already holds that light.');
  }
  if(price>state.coins)return refuse('no_coins','There are not enough play coins.');state.coins-=price;
  state.duties=state.duties.filter(duty=>duty.seat!==seat);
  if(state.night){state.night.posts=state.night.posts.filter(post=>post.seat!==seat);state.night.locks=state.night.locks.filter(lock=>lock.seat!==seat);}
  if(order==='man_light')state.night.posts.push({seat,lightId:target,readyAt:state.now+seconds,reserved:true});
  state.jobs.push({id:++state.jobId,seat,order,target,cardId,price,orderedBy:playerSeat(state),orderedAt:state.now,readyAt:state.now+seconds,done:false});
  return accept(`${member.name} is on the way.`);
}
export function partnerView(state) {
  return (state.crew?.seats??[]).filter(seat=>seat.kind==='npc').map(seat=>{
    const job=state.jobs.filter(item=>item.seat===seat.seat).at(-1),duty=state.duties.find(item=>item.seat===seat.seat),busy=job&&!job.done;
    return {...seat,status:busy?(state.now-job.orderedAt<240?'Travelling':'Working'):duty?'On duty':'Idle',canOrder:!busy,cards:state.found[seat.seat].map(id=>({id,label:`${id} · ${cardTitles[id]}`})),
      job:job?{id:job.id,order:job.order,total:job.readyAt-job.orderedAt,remaining:Math.max(0,job.readyAt-state.now),done:job.done,report:job.report??'On the way…'}:null,
      orders:[{id:'fetch',label:'Fetch a card'},{id:'search',label:'Search a place'},{id:'pin',label:'Pin a held card'},{id:'man_light',label:'Man a public light'},{id:'wait',label:'Stand by'}],
      targets:{fetch:Object.entries(cardTitles).filter(([id])=>cardOpen(state,id)).map(([id,label])=>({id,label})),search:Object.entries(spotNames).filter(([id])=>id!=='home_driftline').map(([id,label])=>({id,label})),pin:state.found[seat.seat].map(id=>({id,label:cardTitles[id]})),man_light:[{id:'keepers_lamp',label:'Keeper’s lamp'},{id:'harbor_light',label:'Harbor Light'}],wait:[]}};
  });
}
