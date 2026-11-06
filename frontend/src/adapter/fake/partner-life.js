// Presentation-only NPC life projection and dev takeover helper; never a source of case gates.
import {kits,npcKitOrder} from './data.js';
import {places} from '../../world/places/registry.js';

const berth={place:'saltreach_harbor',x:0,y:19};
const lights={keepers_lamp:{place:'lighthouse_isle',x:12,y:-5.8,label:'Keeper’s lamp'},harbor_light:{place:'saltreach_harbor',x:9,y:10.6,label:'Harbor Light'}};
const spots={notice_board:{place:'saltreach_harbor',x:3,y:8.5},ferry_pier:{place:'saltreach_harbor',x:0,y:21},back_room:{place:'smugglers_cove',x:-8,y:1},low_tide_cave:{place:'smugglers_cove',x:9,y:5},salvage_yard:{place:'wreck_point',x:-7,y:0},yard_gate:{place:'wreck_point',x:-7,y:1.4},beach:{place:'wreck_point',x:8,y:9},keepers_post_room:{place:'saltreach_harbor',x:-4.1,y:7.8},harbor_office:{place:'saltreach_harbor',x:-8,y:10.3},market_hall:{place:'saltreach_harbor',x:-9,y:-2},signal_station:{place:'saltreach_harbor',x:21,y:-3},watchtower_ruin:{place:'the_teeth',x:-5,y:-3},reef:{place:'the_teeth',x:-8,y:9},jail:{place:'saltreach_harbor',x:-19,y:0},home_driftline:{place:'home_islet',x:0,y:18},satchel:berth};
const cardSpots={C1:'notice_board',C2:'satchel',C3:'satchel',C4:'back_room',C5:'salvage_yard',C6:'keepers_post_room',C7:'signal_station',C8:'watchtower_ruin'};
const refusalGroups={wrong_kit:'wrong_kit',light_not_for_partners:'wrong_kit',players_only:'wrong_kit',no_coins:'no_coins',locked_window:'locked_window',busy:'busy',already_have:'already_have',already_pinned:'already_have',no_lead:'not_ready',lead_locked:'not_ready',not_carrying:'not_ready',card_not_held:'not_ready',not_nightfall:'not_ready',night_required:'not_ready',light_taken:'not_ready',post_taken:'not_ready',unknown_spot:'not_ready'};
const refusalLines={wrong_kit:'I can’t take that on.',no_coins:'That needs more coins.',locked_window:'The route is not open yet.',busy:'I’m still on a task.',already_have:'I have that already.',not_ready:'That is not ready yet.'};
const orderLines={search:'I’m heading out to look.',fetch:'I’m heading out to fetch it.',pin:'I’ll put that on the board.',man_light:'I’ll take the light post.',wait:'Standing by.'};
const eventLines={arrived:'I’ve reached the spot.',found_card:'The item is ready to report.',found_nothing:'Nothing was there to bring back.',pinned_card:'The board is updated.',manning_light:'I’m on post at the light.',beam_locked:'The light is set.',case_solved:'Good work, Captain.',takeover:'Fair winds, Captain.'};
const archetypes=new Set(['deckhand','navigator','cook','salvager']);
const interp=(a,b,t)=>a+(b-a)*Math.max(0,Math.min(1,t));
const chartPoint=place=>({place,x:places[place]?.chart?.[0]??0,y:places[place]?.chart?.[1]??0});

function destination(job){
  if(job.targetLocation&&Number.isFinite(job.targetLocation.x)&&Number.isFinite(job.targetLocation.y))return job.targetLocation;
  if(job.order==='man_light')return lights[job.target]??berth;
  const spot=job.order==='search'?job.target:cardSpots[job.cardId??job.target]??'satchel';
  return spots[spot]??berth;
}
function lineGroup(event){return event.type==='refusal'?refusalGroups[event.reason]??'not_ready':event.group??event.type;}
function lineText(event,group){
  if(event.type==='refusal')return refusalLines[group]??refusalLines.not_ready;
  return eventLines[event.type]??orderLines[event.order]??'I’m ready when you are.';
}

export function recordPartnerEvent(state,event={}){
  const store=state.partnerLife??(state.partnerLife={events:[],nextId:0});
  const seat=Number(event.seat),partner=state.crew?.seats.find(member=>member.seat===seat),archetype=archetypes.has(partner?.archetype)?partner.archetype:kits[partner?.kitId]?.archetype??'deckhand';
  const type=event.type??(event.reason?'refusal':'order_accepted'),normalized={...event,seat,type};
  const group=lineGroup(normalized),entry={id:`partner-event-${++store.nextId}`,seat,type,group,reason:event.reason??null,text:lineText({...normalized,type},group),at:Number.isFinite(event.at)?event.at:state.now,order:event.order??null,portraitId:`crew-${archetype}-portrait`};
  store.events.push(entry);if(store.events.length>64)store.events.splice(0,store.events.length-64);return {...entry};
}

function partnerLife(state,seat){
  const member=state.crew.seats.find(item=>item.seat===seat),kit=kits[member.kitId],archetype=archetypes.has(member.archetype)?member.archetype:kit?.archetype??'deckhand';
  const job=[...(state.jobs??[])].reverse().find(item=>item.seat===seat),duty=state.duties?.find(item=>item.seat===seat),busy=job&&!job.done,elapsed=busy?Math.max(0,state.now-job.orderedAt):0;
  let status='idle',actor={place:berth.place,x:berth.x,y:berth.y,facing:'front',moving:false,archetype},travel=null,post=null,chartLine={from:chartPoint(berth.place),to:chartPoint(berth.place),progress:0,active:false,label:'At the harbor berth'};
  if(duty){const light=lights[duty.lightId]??berth;status='on_duty';actor={...actor,...light,facing:'front',moving:false};post={lightId:duty.lightId,label:light.label,readyAt:null,onDuty:true};chartLine={from:chartPoint(light.place),to:chartPoint(light.place),progress:1,active:false,label:`On post at ${light.label}`};}
  else if(busy){
    const target=destination(job),duration=Math.max(1,job.readyAt-job.orderedAt),movingOrder=['search','fetch','man_light'].includes(job.order);
    if(movingOrder){
      const outbound=job.order==='man_light'?duration:Math.min(240,duration*.4),workEnd=job.order==='man_light'?duration:Math.min(duration,outbound+120);
      const returning=job.order!=='man_light'&&elapsed>=workEnd;status=elapsed<outbound||returning?'travelling':'working';
      const progress=elapsed<outbound?elapsed/outbound:elapsed<workEnd?1:1-(elapsed-workEnd)/(duration-workEnd||1);
      const chartFrom=chartPoint(berth.place),chartTo=chartPoint(target.place);
      travel={from:{...berth},to:{...target},startedAt:job.orderedAt,arriveAt:job.orderedAt+outbound,readyAt:job.readyAt,remaining:Math.max(0,job.readyAt-state.now),progress:Math.max(0,Math.min(1,progress)),stage:elapsed<outbound?'outbound':elapsed<workEnd?'working':'returning'};
      chartLine={from:chartFrom,to:chartTo,progress:travel.progress,active:true,label:`${places[berth.place]?.name} to ${places[target.place]?.name}`};
      if(job.order==='man_light'){
        const t=Math.max(0,Math.min(1,elapsed/duration));actor={...actor,place:t>=1?target.place:berth.place,x:interp(berth.x,target.x,t),y:interp(berth.y,target.y,t),moving:t<1};
        post={lightId:job.target,label:target.label??'Light',readyAt:job.readyAt,onDuty:false};
      }else if(returning){const t=Math.max(0,Math.min(1,(elapsed-workEnd)/(duration-workEnd||1))),anchor=places[target.place]?.spawn??[0,12];actor={...actor,place:target.place,x:interp(target.x,anchor[0],t),y:interp(target.y,anchor[1],t),moving:true};}
      else if(elapsed>=outbound){actor={...actor,...target,moving:elapsed<workEnd};}
      else if(target.place===berth.place){actor={...actor,x:interp(berth.x,target.x,progress),y:interp(berth.y,target.y,progress),moving:true};}
      else {actor={...actor,x:interp(berth.x,0,progress),y:interp(berth.y,23,progress),moving:true};}
    }else {status='working';actor.moving=false;travel={from:{...berth},to:{...berth},startedAt:job.orderedAt,arriveAt:job.readyAt,readyAt:job.readyAt,remaining:Math.max(0,job.readyAt-state.now),progress:Math.min(1,elapsed/duration),stage:'working'};}
  }
  const events=(state.partnerLife?.events??[]).filter(item=>item.seat===seat),event=events.at(-1)??null,refusal=[...events].reverse().find(item=>item.type==='refusal')??null;
  return {status,actor,travel,post,portraitId:`crew-${archetype}-portrait`,chartLine,event:event?{...event}:null,refusal:refusal?{...refusal}:null};
}

export function partnerLifeView(state){
  if(!state.crew)return [];
  return state.crew.seats.filter(seat=>seat.kind==='npc').map(seat=>({seat:seat.seat,life:partnerLife(state,seat.seat)}));
}

export function previewTakeover(state,kitId){
  if(!state.crew||state.crew.status!=='active')return {accepted:false,reason:'crew_not_active',message:'The crew is not ready for a seat change.'};
  if(!kits[kitId])return {accepted:false,reason:'kit_required',message:'The friend needs a kit before taking a seat.'};
  const partners=state.crew.seats.filter(seat=>seat.kind==='npc');if(!partners.length)return {accepted:false,reason:'partner_missing',message:'There is no partner seat to take over.'};
  const lastKit=[...npcKitOrder].reverse().find(id=>partners.some(partner=>partner.kitId===id));
  const seat=partners.find(item=>item.kitId===kitId)??partners.find(item=>item.kitId===lastKit);
  if(!seat)return {accepted:false,reason:'partner_missing',message:'There is no partner seat to take over.'};
  return {accepted:true,message:'Review the partner seat before confirming.',preview:{seat:seat.seat,partnerName:seat.name,partnerKitId:seat.kitId,friendKitId:kitId,friendArchetype:kits[kitId].archetype}};
}

export function confirmTakeover(state,preview){
  const choice=preview?.preview??preview;if(!choice)return {accepted:false,reason:'preview_required',message:'Review the seat preview first.'};
  const current=previewTakeover(state,choice.friendKitId);if(!current.accepted||current.preview.seat!==choice.seat)return {accepted:false,reason:'preview_stale',message:'The partner seats changed. Review the preview again.'};
  const seat=state.crew.seats.find(item=>item.seat===choice.seat);if(!seat||seat.kind!=='npc')return {accepted:false,reason:'partner_missing',message:'There is no partner in that seat now.'};
  seat.farewell=recordPartnerEvent(state,{seat:seat.seat,type:'takeover'}).text;
  const card=kits[choice.friendKitId].card,held=state.found[seat.seat]??(state.found[seat.seat]=[]);
  if(card&&!held.includes(card)&&!state.pins.some(pin=>pin.cardId===card))held.push(card);
  seat.kind='player';seat.name=`Captain ${choice.friendKitId.replaceAll('_',' ')}`;seat.kitId=choice.friendKitId;seat.archetype=kits[choice.friendKitId].archetype;seat.takeover=true;
  state.duties=(state.duties??[]).filter(duty=>duty.seat!==seat.seat);
  if(state.night){state.night.posts=state.night.posts.filter(post=>post.seat!==seat.seat);state.night.locks=state.night.locks.filter(lock=>lock.seat!==seat.seat);}
  for(const job of state.jobs??[])if(job.seat===seat.seat&&!job.done&&job.order==='man_light')job.partnerDeparted=true;
  return {accepted:true,reason:null,message:'The friend took the seat. The partner’s satchel and running work stay with it.',seat:seat.seat,kitId:choice.friendKitId};
}
