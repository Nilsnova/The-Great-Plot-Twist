// Only safe response metadata reaches request presentation; server error prose never reaches the screen.
import {ERROR_FALLBACKS,errorWords} from './words.js';
const copy={offline:'You are offline. Your progress on this device is kept.',
  session_expired:'Session expired. Sign in again; your progress on this device is kept.',
  rate_limited:'Too many attempts. Try again in a moment.',feature_off:'This feature is unavailable. You can keep exploring.',
  forbidden:'This action is not available to this account.',not_connected:'Service unavailable. Try again in a moment.',
  internal_error:'The service could not complete this request. Please try again.'};
export const safeStatus=value=>Number.isInteger(value)&&value>=0&&value<=599?value:undefined;
export function safeMarketAdapter(adapter){
  return Object.fromEntries(['board','portfolio','open','close'].map(name=>[name,async(...args)=>{
    const result=await adapter[name](...args);
    if(result?.ok===true)return result;
    const status=safeStatus(result?.status),seconds=result?.retryAfterSeconds;
    return {ok:false,code:Object.hasOwn(ERROR_FALLBACKS,result?.code)||result?.code==='forbidden'?result.code:'server_error',message:'',
      ...(status===undefined?{}:{status}),
      ...(Number.isFinite(seconds)&&seconds>=0&&seconds<=86400?{retryAfterSeconds:seconds}:{})};
  }]));
}
export function marketCallFailure(result={}){
  const status=safeStatus(result.status),code=result.code;
  let reason=status===0?'offline':status===401?'session_expired':status===403?'forbidden':status===429?'rate_limited'
    :status>=500?status===503?'not_connected':'internal_error':code==='feature_off'?'feature_off'
      :code==='network_error'?'offline':code==='unauthorized'?'session_expired':code==='too_many_requests'?'rate_limited':null;
  const business=Object.hasOwn(ERROR_FALLBACKS,code)&&!['server_error','bad_response','database_error','outcome_unknown'].includes(code);
  if(!reason)reason=business?code:'internal_error';
  const message=copy[reason]??(result.kind?result.message:errorWords({code,message:''}));
  return {accepted:false,reason,message:message||copy.internal_error,...(status===undefined?{}:{status}),
    ...(reason==='rate_limited'&&Number.isFinite(result.retryAfterSeconds)&&result.retryAfterSeconds>=0&&result.retryAfterSeconds<=86400?{retryAfterSeconds:result.retryAfterSeconds}:{})};
}
