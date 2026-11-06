// Development-only simulated human seats. No server or screen imports these helpers.
import {routes} from './routes.js';
import {initialRewardState} from './rewards.js';
import {kits} from './data.js';
import {refuse} from './state.js';
export function setSimulatedSeats(state,seats){
  if(!state.crew||!Array.isArray(seats))return false;
  for(const incoming of seats){const member=state.crew.seats.find(member=>member.seat===incoming.seat&&!member.isYou);
    if(!member||!kits[incoming.kitId])continue;
    Object.assign(member,{kind:'player',name:String(incoming.name??`Captain ${incoming.seat}`),kitId:incoming.kitId,archetype:undefined});
    if(incoming.kitId==='witness'&&!state.found[member.seat].includes('C2'))state.found[member.seat].push('C2');
  }return true;
}
export function asSimulatedSeat(state,seat,method,args,handlers){
  if(!['search','pin','takePost','aim'].includes(method))return refuse('invalid_request','That rehearsal action is not supported.');
  const member=state.crew?.seats.find(member=>member.seat===seat&&member.kind==='player');
  if(!member||member.isYou)return refuse('invalid_request','Choose another human seat.');
  const flags=state.crew.seats.map(item=>item.isYou),local={coins:state.coins,rewardState:state.rewardState,creditedCards:state.creditedCards,activeSpot:state.activeSpot};
  const wallet=(state.simulatedWallets??={})[seat]??={coins:kits[member.kitId].coins,rewardState:initialRewardState(),creditedCards:[]};
  Object.assign(state,wallet);
  if(method==='search')state.activeSpot=routes.find(route=>route.id===args[0])?.spot??state.activeSpot;
  try{state.crew.seats.forEach(item=>{item.isYou=item===member;});return handlers[method](state,...args);}
  finally{state.simulatedWallets[seat]={coins:state.coins,rewardState:state.rewardState,creditedCards:state.creditedCards};Object.assign(state,local);state.crew.seats.forEach((item,index)=>{item.isYou=flags[index];});}
}
