// Deterministic local-only presence. This module has no transport or account identity.
const kits=[['true_keeper','True Keeper'],['witness','Witness'],['informant','Informant'],['stranger','Stranger']];
const places=['lighthouse_isle','saltreach_harbor','home_islet','smugglers_cove','wreck_point','the_teeth'];
const spawns={lighthouse_isle:{x:-1,y:10},saltreach_harbor:{x:0,y:19},home_islet:{x:0,y:12},smugglers_cove:{x:0,y:12},wreck_point:{x:0,y:12},the_teeth:{x:0,y:12}};
const spawn={place:'lighthouse_isle',...spawns.lighthouse_isle};
export const emoteIds=['wave','cheer','point','lantern','shrug'];
const facings=['front','back','left','right'];
const answer=(accepted,reason,message)=>({accepted,reason,message});

export function initialPresenceState({count=30,now=Date.now()}={}){
  const start=Number.isFinite(now)?now:0;
  const peers=Array.from({length:Math.max(0,Math.min(30,Math.floor(count)))},(_,i)=>{
    const kit=kits[i%kits.length];
    return {id:`peer-${((0x9e3779b9^(i*2654435761))>>>0).toString(16)}`,name:`Captain ${['Shoal','Reed','North','Brine','Tern','Vale'][i%6]} ${i+1}`,
      kit:{id:kit[0],name:kit[1]},place:spawn.place,x:spawn.x+Math.sin(i*2.4)*1.8,y:spawn.y+Math.cos(i*1.7)*1.8,
      facing:facings[i%4],moving:i%5!==0,emote:null,isCrew:i<4,seat:i<4?i+1:null,
      phase:i*.71,active:true,at:start};
  });
  return {startedAt:start,now:start,sampledAt:start,place:spawn.place,x:spawn.x,y:spawn.y,facing:'front',moving:false,status:'live',hiddenCount:0,
    peers,localEmote:null,emoteCooldownUntil:0,rosterId:'crew-local'};
}

export function presenceView(state){
  const others=state.peers.filter(peer=>peer.active).map(({phase,active,seat,...peer})=>({...peer,kit:{...peer.kit},at:peer.at}));
  const crew=state.peers.filter(peer=>peer.isCrew).map(peer=>({id:`${state.rosterId}-${peer.seat}`,seat:peer.seat,name:peer.name,kit:{...peer.kit},online:peer.active,place:peer.place,isPartner:false}));
  const remaining=Math.max(0,state.emoteCooldownUntil-state.now);
  const localEmote=state.localEmote&&state.localEmote.until>state.now?{...state.localEmote}:null;
  return {status:state.status,place:state.place,others,hiddenCount:state.hiddenCount,crew,sampledAt:state.sampledAt,
    localEmote,canEmote:remaining<=0,cooldown:remaining,emotes:emoteIds.map(id=>({id,label:id[0].toUpperCase()+id.slice(1),available:remaining<=0}))};
}

export function tickPresence(state,dt){
  const seconds=Math.max(0,Math.min(5,Number.isFinite(dt)?dt:0));if(!seconds)return false;
  state.now+=seconds*1000;state.sampledAt=state.now;
  for(const peer of state.peers){
    const age=state.now-state.startedAt,cycle=Math.floor(age/12000);
    const offset=Number.parseInt(peer.id.slice(-2),16)||peer.id.length;
    peer.active=age<12000||((cycle+offset)%7!==0);
    peer.phase+=seconds*(.32+(peer.id.length%4)*.08);
    if(age>=24000)peer.place=places[Math.floor((age-24000)/30000+Number.parseInt(peer.id.slice(-2),16)%places.length)%places.length];
    const anchor=spawns[peer.place]??spawn,baseX=anchor.x+Math.sin(peer.phase*1.7)*1.2,baseY=anchor.y+Math.cos(peer.phase*1.3)*1.2;
    peer.x=baseX+Math.sin(peer.phase)*.6;peer.y=baseY+Math.cos(peer.phase*.73)*.6;
    peer.moving=Math.abs(Math.cos(peer.phase))>.16;peer.facing=facings[Math.floor((peer.phase+Math.PI)*2)%4];
    if(!peer.emote&&Math.floor(age/6500)%5===offset%5){peer.emote=emoteIds[(offset+cycle)%emoteIds.length];peer.emoteUntil=state.now+1800;}
    if(peer.emoteUntil<=state.now){peer.emote=null;peer.emoteUntil=0;}peer.at=state.now;
  }
  if(state.localEmote?.until<=state.now)state.localEmote=null;
  return true;
}

export function reportPosition(state,sample){
  const valid=sample&&typeof sample.place==='string'&&sample.place.length>0&&Number.isFinite(sample.x)&&Number.isFinite(sample.y)&&facings.includes(sample.facing)&&typeof sample.moving==='boolean';
  if(!valid)return answer(false,'invalid_position','That position could not be read.');
  Object.assign(state,{place:sample.place,x:sample.x,y:sample.y,facing:sample.facing,moving:sample.moving,sampledAt:state.now});
  return answer(true,null,'Position updated.');
}

export function setEmote(state,id){
  if(!emoteIds.includes(id))return answer(false,'invalid_emote','Choose one of the available emotes.');
  if(state.emoteCooldownUntil>state.now)return answer(false,'emote_cooldown','Wait before using another emote.');
  const until=state.now+1800;state.localEmote={id,until};state.emoteCooldownUntil=state.now+5000;
  return answer(true,null,'Emote shown.');
}
