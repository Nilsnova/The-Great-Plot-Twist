// A deadline that can be paused without counting hidden or explicitly paused time.
export function createPausableDeadline(durationMs,{onExpire,now=()=>performance.now(),setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=handle=>clearTimeout(handle)}={}){
  let remaining=Math.max(0,durationMs),startedAt=0,timer=null,disposed=false;
  function pause(){if(timer===null)return;clearTimer(timer);timer=null;remaining=Math.max(0,remaining-(now()-startedAt));}
  function resume(){if(disposed||timer!==null)return;startedAt=now();timer=setTimer(()=>{timer=null;remaining=0;if(!disposed)onExpire?.();},remaining);}
  function dispose(){if(disposed)return;pause();disposed=true;}
  return {pause,resume,dispose,get remaining(){return remaining;}};
}
