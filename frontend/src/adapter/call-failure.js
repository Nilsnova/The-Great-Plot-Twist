// Transport failures have fixed public copy. Domain refusals keep the adapter's explanation.
const messages={
  offline:'You are offline. Your progress on this device is kept.',
  not_connected:'Service unavailable. Try again in a moment.',
  session_expired:'Session expired. Sign in again; your progress on this device is kept.',
  save_conflict:'This save changed on another device. Choose which copy to keep.',
  rate_limited:'Too many attempts. Try again in a moment.',
  feature_off:'This feature is unavailable. You can keep exploring.',
  forbidden:'This action is not available to this account.',
  internal_error:'The service could not complete this request. Please try again.',
};
export function intentFailure(error,{online=globalThis.navigator?.onLine!==false}={}){
  const status=error?.status??error?.response?.status;
  let reason=Object.hasOwn(messages,error?.reason)?error.reason:null;
  if(status===0)reason='offline';
  else if(status===401)reason='session_expired';
  else if(status===429)reason='rate_limited';
  else if(status===403)reason='forbidden';
  else if(status>=500)reason=status===503?'not_connected':'internal_error';
  if(!reason)reason=!online||(error instanceof TypeError&&/fetch|network|load failed/i.test(error.message))?'offline':'internal_error';
  const result={accepted:false,reason,message:messages[reason]};
  const seconds=error?.retryAfterSeconds;
  if(reason==='rate_limited'&&typeof seconds==='number'&&Number.isFinite(seconds)&&seconds>=0&&seconds<=86400)result.retryAfterSeconds=Math.ceil(seconds);
  return result;
}
export function normalizeIntentResult(result){
  if(result?.accepted)return result;
  if(Object.hasOwn(messages,result?.reason)||result?.status>=400)return {...intentFailure(result),view:result.view};
  return result;
}
