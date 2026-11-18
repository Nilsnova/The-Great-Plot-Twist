// Correlate legacy live inputs with accepted attacks for poses, independently of history freshness.
// Used by the wave controller; never changes an input or simulation event.
const EVENTS={captain_shot:'captain_fired',captain_strike:'captain_struck'};
export function createLiveAttackFeedback(){
  let pending=new WeakSet();
  return{
    note(input){if(EVENTS[input?.type])pending.add(input);},
    accepted(events,inputs){
      const attacks=inputs.filter(input=>EVENTS[input.type]);
      const live=attacks.filter(input=>pending.delete(input));
      // Ambiguous same-actor inputs stay on the ordinary freshness path. Never credit a rejected input
      // with another input's accepted event, including duplicate/replayed shots at the same target.
      return events.filter(event=>live.some(input=>event.by===input.by&&event.type===EVENTS[input.type]
        &&attacks.filter(other=>other.by===input.by&&other.type===input.type).length===1));
    },
    clear(){pending=new WeakSet();},
  };
}
