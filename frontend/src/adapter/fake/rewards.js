// Fake-only, idempotent rewards. No screen computes an award or writes a ledger.
import {playerSeat} from './state.js';
export function initialRewardState(){return {ledger:[],refs:[],balance:0,deductions:[],contributors:[],frozen:null,festivalBadge:false};}
const owned=state=>state.rewardState??=initialRewardState();
export const solveShare=(deductions,finaleRole)=>Math.min(800,400+100*Math.max(0,Math.min(4,deductions))+(finaleRole?100:0));
export function coinEntry(state,amount,reason,label,ref){
  const rewards=owned(state);if(rewards.refs.includes(ref))return false;
  rewards.refs.push(ref);state.coins+=amount;
  rewards.ledger.push({id:ref,amount,reason,label,at:state.now});rewards.balance=state.coins;return true;
}
export function creditCard(state,id){return coinEntry(state,50,'clue_reward','First pin of a card',`false_light:card:${id}`);}
export function creditDeduction(state,id,pins){
  const rewards=owned(state),mine=playerSeat(state);
  for(const pin of pins){const credited=pin.orderedBy??pin.seat;if(!rewards.contributors.includes(credited))rewards.contributors.push(credited);}
  if(pins.some(pin=>pin.seat===mine||pin.orderedBy===mine)){
    if(!rewards.deductions.includes(id))rewards.deductions.push(id);
    return coinEntry(state,200,'mystery_reward','Took part in a deduction',`false_light:deduction:${id}`);
  }return false;
}
export function settleRewards(state){
  const rewards=owned(state),mine=playerSeat(state);
  for(const pin of state.pins){const seat=pin.orderedBy??pin.seat;if(!rewards.contributors.includes(seat))rewards.contributors.push(seat);}
  for(const lock of state.schooner?(state.night?.locks??[]):[]){const seat=lock.aimedBy??lock.seat;if(!rewards.contributors.includes(seat))rewards.contributors.push(seat);if(seat===mine)rewards.finaleRole=true;}
  if(state.solved&&!rewards.frozen){
    rewards.frozen=[...new Set([...rewards.contributors,...(rewards.accusedBy?[rewards.accusedBy]:[])])];
    if(rewards.frozen.includes(mine))coinEntry(state,solveShare(rewards.deductions.length,rewards.finaleRole||rewards.accusedBy===mine),'mystery_reward','Your share of the solved case','false_light:solve');
    state.wall=state.crew.seats.filter(seat=>seat.kind==='player'&&rewards.frozen.includes(seat.seat)).map((seat,index)=>({name:seat.name,order:index+1}));
  }
  if(state.coins!==rewards.balance){const amount=state.coins-rewards.balance;
    rewards.ledger.push({id:`local:${rewards.ledger.length}`,amount,reason:amount>0?'kit_grant':'case_cost',label:amount>0?'Arrival kit coins':'Search, travel or light materials',at:state.now});rewards.balance=state.coins;
  }
}
export function rewardsView(state){
  const rewards=owned(state),done=state.solved&&state.revealIndex>=(state.profile?.readLog?9:8);
  const keepsakes=[['relighter','Relighter','A title for helping relight the coast.'],['keepers_star','Keeper’s Star','Your home is marked on every chart.'],['recovered_lens','Recovered lighthouse lens','A keepsake. It cannot be traded.'],['wall','Wall of Lights','Your captain name on the harbor wall.']];
  return {balance:state.profile?state.coins:null,recent:rewards.ledger.slice(-5).reverse(),ledger:[...rewards.ledger].reverse(),
    keepsakes:keepsakes.map(([id,title,description])=>({id,title,description,owned:done})),
    epilogue:done?[{id:'kit',text:'[revealed by the server]'},...(state.profile.readLog?[{id:'log',text:'[revealed by the server]'}]:[])]:[],
    wallEntry:state.wall.find(entry=>entry.name===state.captainName)??null,festivalBadge:rewards.festivalBadge,
    contributors:(rewards.frozen??rewards.contributors).filter(id=>state.crew?.seats.some(seat=>seat.seat===id&&seat.kind==='player'))};
}
