// A single safe error boundary for presentation callers. No transport or outcome rule lives here.
const messages={
  offline:'You are offline. Your progress on this device is kept.',
  not_connected:'Service unavailable. Try again in a moment.',
  session_expired:'Sign in again; your progress on this device is kept.',
  save_conflict:'This save changed on another device. Choose which copy to keep.',
  rate_limited:'Too many requests. Wait a moment, then try again.',
  feature_off:'This feature is unavailable. You can keep exploring.',
};
export function intentFailure(error){
  const reason=Object.hasOwn(messages,error?.reason)?error.reason:'offline';
  return {accepted:false,reason,message:messages[reason]??'That action could not be completed. Please try again.'};
}
export async function sendCaseIntent(adapter,name,...args){
  try{return await adapter[name](...args);}
  catch(error){return {...intentFailure(error),view:adapter.read()};}
}
