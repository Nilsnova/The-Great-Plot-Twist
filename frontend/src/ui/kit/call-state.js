// Pure request presentation. The caller owns empty data, retry intent and authentication.
const retryReasons=new Set(['offline','not_connected','internal_error','rate_limited']);
export function createCallState({now=()=>performance.now()}={}){
  let phase='idle',message='',reason=null,deadline=0,retryable=false;
  function clear(){phase='idle';message='';reason=null;deadline=0;retryable=false;}
  function loading(){clear();phase='loading';message='Loading…';}
  function succeed({empty=false,message:text=''}={}){clear();phase=empty?'empty':'ready';message=empty?(text||'Nothing here yet.'):text;}
  function notice(text){clear();phase=text?'notice':'idle';message=text||'';}
  function fail(result,{retryable:allow=true}={}){
    clear();reason=result?.reason??'internal_error';message=result?.message||'The request could not be completed.';
    phase=reason==='offline'?'offline':reason==='session_expired'?'expired':reason==='rate_limited'?'rate_limited':'error';
    retryable=allow&&retryReasons.has(reason);
    if(phase==='rate_limited'){
      const value=result?.retryAfterSeconds;
      const seconds=typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=86400?Math.ceil(value):0;
      deadline=now()+seconds*1000;
    }
  }
  function read(){
    const remaining=phase==='rate_limited'?Math.max(0,Math.ceil((deadline-now())/1000)):0;
    const text=phase==='rate_limited'?(remaining?`Too many attempts. Try again in ${remaining} s.`:'Too many attempts. You can try again now.'):phase==='expired'?'Session expired. Sign in again.':message;
    return {phase,message:text,remaining,canRetry:retryable&&remaining===0,canSignIn:phase==='expired'};
  }
  return {clear,loading,succeed,notice,fail,read};
}
