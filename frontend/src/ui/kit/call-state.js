// Pure request presentation. The caller owns empty data, retry intent and authentication.
const retryReasons=new Set(['offline','not_connected','internal_error','rate_limited','too_many_tries']);
export const LOADING_DELAY_MS=300;
export const SLOW_READ_MS=5000;
export function createCallState({now=()=>performance.now()}={}){
  let phase='idle',message='',reason=null,deadline=0,retryable=false,started=0,reading=false;
  function clear(){phase='idle';message='';reason=null;deadline=0;retryable=false;started=0;reading=false;}
  function loading({read=false}={}){clear();phase='loading';started=now();reading=read;message='Loading…';}
  function succeed({empty=false,message:text=''}={}){clear();phase=empty?'empty':'ready';message=empty?(text||'Nothing here yet.'):text;}
  function notice(text){clear();phase=text?'notice':'idle';message=text||'';}
  function fail(result,{retryable:allow=true}={}){
    clear();reason=result?.reason??'internal_error';message=result?.message||'The request could not be completed.';
    phase=reason==='offline'?'offline':reason==='session_expired'?'expired':['rate_limited','too_many_tries'].includes(reason)?'rate_limited':'error';
    retryable=allow&&retryReasons.has(reason);
    if(phase==='rate_limited'){
      const value=result?.retryAfterSeconds;
      const seconds=typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=86400?Math.ceil(value):0;
      deadline=now()+seconds*1000;
    }
  }
  function setOnline(online){
    if(!online){fail({reason:'offline',message:'You are offline. Your progress on this device is kept.'});return;}
    if(phase==='offline'){clear();phase='online';retryable=true;message='Back online. You can try again now.';}
  }
  function read(){
    const elapsed=phase==='loading'?Math.max(0,now()-started):0;
    const slow=phase==='loading'&&reading&&elapsed>=SLOW_READ_MS;
    const remaining=phase==='rate_limited'?Math.max(0,Math.ceil((deadline-now())/1000)):0;
    const text=phase==='rate_limited'?(remaining?`Too many attempts. Try again in ${remaining} s.`:'Too many attempts. You can try again now.'):phase==='expired'?'Session expired. Sign in again; your progress on this device is kept.':slow?'The server is taking longer than expected. Your progress on this device is kept.':message;
    return {phase:slow?'slow':phase,message:text,reason,remaining,canRetry:retryable&&remaining===0,canSignIn:phase==='expired'||reason==='sign_in_required',
      visible:phase!=='loading'||elapsed>=LOADING_DELAY_MS,
      nextUpdate:phase==='loading'?(elapsed<LOADING_DELAY_MS?LOADING_DELAY_MS-elapsed:reading&&!slow?SLOW_READ_MS-elapsed:0):remaining>0?Math.min(1000,Math.max(1,deadline-now())):0};
  }
  return {clear,loading,succeed,notice,fail,setOnline,read};
}
