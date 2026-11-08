// One delayed hint at a time, with dismissal delegated to the existing device preferences.
import {dismissHint,normalizeHintPreferences} from './logic.js';
import {onboardingHints} from './onboarding-logic.js';

export function createOnboardingState({preferences={},onPreferences,delaySeconds=2}={}) {
  let prefs=normalizeHintPreferences(preferences),candidates=[],candidate=null,elapsed=0,blocked=false;
  const delay=Number.isFinite(delaySeconds)?Math.max(0,Math.min(10,delaySeconds)):2;
  function choose(){
    const next=prefs.hintsEnabled?candidates.find(item=>!prefs.dismissedHints.includes(item.id))??null:null;
    if(next?.id!==candidate?.id||next?.action!==candidate?.action)elapsed=0;
    candidate=next;
  }
  const read=()=>!blocked&&candidate&&elapsed>=delay?{...candidate}:null;
  return {
    read,get preferences(){return {...prefs,dismissedHints:[...prefs.dismissedHints]};},
    update(view,context){candidates=onboardingHints(view,context);choose();return read();},
    setPreferences(value){prefs=normalizeHintPreferences(value);choose();return read();},
    tick(delta,{blocked:pause=false}={}){
      blocked=pause===true;
      if(blocked)elapsed=0;
      else if(candidate&&Number.isFinite(delta)&&delta>0)elapsed=Math.min(delay,elapsed+Math.min(delta,.25));
      return read();
    },
    dismiss(){
      const current=read();if(!current)return false;
      prefs=dismissHint(prefs,current.id);
      choose();
      try{onPreferences?.({...prefs,dismissedHints:[...prefs.dismissedHints]});}catch{/* Keep this session's dismissal if device storage is unavailable. */}
      return true;
    },
  };
}
