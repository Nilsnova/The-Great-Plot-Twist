// Monotonic elapsed time that never counts time spent in a hidden document.
export function createVisibleClock({now=()=>performance.now(),visibilityTarget=globalThis.document}={}){
  let previous=null,disposed=false;
  const visible=()=>!visibilityTarget?.hidden;
  function reset(){previous=!disposed&&visible()?now():null;}
  function onVisibilityChange(){reset();}
  visibilityTarget?.addEventListener?.('visibilitychange',onVisibilityChange);
  reset();
  return {readDeltaSeconds(){
    if(disposed||!visible()){previous=null;return 0;}
    const current=now();
    if(previous===null){previous=current;return 0;}
    const delta=Math.max(0,(current-previous)/1000);previous=current;return delta;
  },reset,
  dispose(){if(disposed)return;disposed=true;previous=null;visibilityTarget?.removeEventListener?.('visibilitychange',onVisibilityChange);}};
}
