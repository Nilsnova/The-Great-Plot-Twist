// Projects actual crew seats into the fake's public presence view; never exposes a login identity.
import {presenceView} from './presence.js';
import {kits} from './data.js';
export function crewPresenceView(state){
  const view=presenceView(state.presence),seats=state.crew?.seats??[];
  const peers=state.presence.peers;
  view.others=view.others.map(peer=>{
    const seat=peers.find(item=>item.id===peer.id)?.seat;
    const member=seats.find(item=>item.seat===seat&&item.kind==='player'&&!item.isYou);
    return {...peer,isCrew:!!member,...(member?{name:member.name,kit:{id:member.kitId,name:kits[member.kitId].name}}:{})};
  });
  view.crew=seats.map(member=>{
    const peer=peers.find(item=>item.seat===member.seat);
    return {id:member.isYou?'local-captain':member.kind==='npc'?`partner-${member.seat}`:peer?.id??`seat-${member.seat}`,
      seat:member.seat,name:member.name,kit:member.kitId?{id:member.kitId,name:kits[member.kitId].name}:null,
      online:member.isYou||member.kind==='player'&&!!peer?.active,
      place:member.isYou?view.place:member.place??peer?.place??null,isPartner:member.kind==='npc'};
  });
  return view;
}
