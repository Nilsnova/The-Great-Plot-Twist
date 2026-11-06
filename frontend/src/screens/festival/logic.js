// Display-only festival time and the explicit, network-free rehearsal switch.
export function isFestivalRehearsal(search='') {
  const query=new URLSearchParams(search);
  return query.get('demo')==='1' && query.get('festival')==='1';
}
export function remainingSeconds(festival,receivedAt,now=Date.now()) {
  return Math.max(0, Math.ceil((festival?.remainingSeconds??0)-Math.max(0,now-receivedAt)/1000));
}
export function countdown(seconds) {
  const safe=Math.max(0,Math.ceil(seconds));
  return `${Math.floor(safe/3600)}h ${String(Math.floor(safe%3600/60)).padStart(2,'0')}m ${String(safe%60).padStart(2,'0')}s`;
}
export function checkedFestival(value) {
  if(!value || !['waiting','active','ended'].includes(value.phase) ||
    !Number.isFinite(value.remainingSeconds) || value.remainingSeconds<0 ||
    !Number.isFinite(Date.parse(value.serverTime)) || !Array.isArray(value.lamps) || value.lamps.length>12 ||
    !value.ring || typeof value.ring.available!=='boolean' || typeof value.ring.queued!=='boolean' ||
    !(value.ring.duelId===null || typeof value.ring.duelId==='string')) return null;
  for(const lamp of value.lamps) {
    if(!/^festival_lamp_(0[1-9]|1[0-2])$/.test(lamp.id) || typeof lamp.label!=='string' ||
      !['lit','claimed','claimedByMe'].every(key=>typeof lamp[key]==='boolean'))return null;
  }
  if(new Set(value.lamps.map(lamp=>lamp.id)).size!==value.lamps.length)return null;
  return structuredClone(value);
}
export const words={
 feature_off:'The festival is not open on this coast yet.',unauthorized:'Sign in through Account to reserve lamps or join the ring.',
 festival_waiting:'The festival begins when the coast is first relit.',festival_ended:'The 48-hour lantern festival has ended.',
 festival_closed:'The festival is not active now.',lamp_claimed:'Another captain reserved that lamp. Choose another.',
 claimed:'Another captain reserved that lamp. Choose another.',already_claimed:'This lamp is already yours.',
 lamp_occupied:'Another captain reserved that lamp. Choose another.',in_duel:'Finish your current Lantern Duel before joining the ring.',not_queued:'You are not waiting in the ring.',festival_busy:'The ring changed while you joined. Please try again.',not_enough_oil:'Choose three signals within the lantern oil allowance.',
 arena_off:'The Keepers’ Ring is closed while Lantern Duels is switched off.',already_queued:'You are already waiting in the ring.',
 too_many_requests:'Please wait before trying again.',invalid_signals:'Choose three signals within the lantern oil allowance.',
 network_error:'The answer did not arrive. Retry the same action to confirm it safely.',timeout:'The answer did not arrive. Retry the same action to confirm it safely.',
};
export const errorText=code=>words[code]??'The festival could not answer. Refresh and try again.';
