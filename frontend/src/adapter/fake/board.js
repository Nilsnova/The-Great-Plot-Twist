// Fake-only card ownership, pin credit, deduction gates and distinct-seat validation.
import {creditCard,creditDeduction} from './rewards.js';
import {cardTitles,deductionData,suspectTitles} from './data.js';
import {accept,refuse,playerSeat} from './state.js';
export function cardOpen(state,id) {
  if(!Object.hasOwn(cardTitles,id))return false;
  if(['C5','C6'].includes(id))return state.deductions.includes('D2');
  if(id==='C8')return state.deductions.includes('D3');return true;
}
export function pinCard(state,id,seat=playerSeat(state),orderedBy=null) {
  if(state.crew?.status!=='active')return refuse('crew_required','Muster the crew first.');
  if(!(state.found[seat]??[]).includes(id))return refuse('card_not_held','That seat does not hold this card.');
  if(state.pins.some(pin=>pin.cardId===id&&pin.seat===seat))return refuse('already_pinned','This seat already pinned that card.');
  state.pins.push({cardId:id,seat,orderedBy,id:`pin-${state.pins.length+1}`,at:Date.now()});
  if((seat===playerSeat(state)||orderedBy===playerSeat(state))&&!state.creditedCards.includes(id)){state.creditedCards.push(id);creditCard(state,id);}
  return accept(`${cardTitles[id]} pinned by seat ${seat}.`);
}
export function pairCards(state,a,b) {
  if(state.crew?.status!=='active')return refuse('crew_required','Muster the crew first.');
  if(state.now<state.pairWaitUntil)return refuse('pair_cooldown','Wait before trying another pair.');
  const first=state.pins.filter(pin=>pin.cardId===a),second=state.pins.filter(pin=>pin.cardId===b);
  if(!first.length||!second.length)return refuse('not_pinned','Pin both cards before pairing them.');
  if(!first.some(one=>second.some(two=>one.seat!==two.seat)))return refuse('different_seats_required','One seat pinned both cards. A different seat must pin one of them too.');
  const deduction=deductionData.find(item=>item.cards.includes(a)&&item.cards.includes(b)&&a!==b);
  if(!deduction){state.pairWaitUntil=state.now+30;return refuse('wrong_pair','These two cards do not fit together. Try again in 30 seconds.');}
  if(state.deductions.includes(deduction.id))return refuse('already_deduced','That deduction is already on the board.');
  state.deductions.push(deduction.id);
  creditDeduction(state,deduction.id,[...first,...second]);
  return accept(`${deduction.id} · ${deduction.title} formed. ${deduction.opens.join(', ')} opened.`);
}
export function boardView(state) {
  const held=new Set([...Object.values(state.found).flat(),...state.pins.map(pin=>pin.cardId)]),viewer=playerSeat(state);
  const deductions=deductionData.map(item=>({...item,complete:state.deductions.includes(item.id),finding:'Finding recorded.',clearedTitles:item.clears.map(id=>suspectTitles[id])}));
  return {pinHighlights:state.pins.map(pin=>({id:pin.id??`${pin.cardId}-${pin.seat}`,cardId:pin.cardId,seat:pin.seat,at:pin.at??0})),cards:[...held].sort().map(id=>{
    const pins=state.pins.filter(pin=>pin.cardId===id),used=deductions.some(item=>item.complete&&item.cards.includes(id));
    return {id,title:cardTitles[id],body:null,state:used?'used':pins.length?'pinned':'new',
      holders:Object.entries(state.found).filter(([,cards])=>cards.includes(id)).map(([seat])=>({seat:Number(seat),label:`Seat ${seat}`})),
      pinnedBy:pins.map(pin=>({seat:pin.seat,label:`Seat ${pin.seat}`})),canPin:state.crew?.status==='active'&&state.found[viewer].includes(id)&&!pins.some(pin=>pin.seat===viewer),canPair:!!pins.length};
  }),deductions,suspects:Object.entries(suspectTitles).map(([id,title])=>({id,title,cleared:deductions.some(item=>item.complete&&item.clears.includes(id)),clearedBy:deductions.find(item=>item.complete&&item.clears.includes(id))?.id??null})),
    canPair:state.crew?.status==='active'&&state.now>=state.pairWaitUntil,pairWait:Math.max(0,state.pairWaitUntil-state.now),pairHelp:'Pair two pinned cards. Two different seats must have pinned them.',logLead:!!state.profile?.readLog};
}
