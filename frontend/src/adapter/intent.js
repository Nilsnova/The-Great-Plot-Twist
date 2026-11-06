// One safe boundary for presentation callers; it never decides game outcomes.
import {intentFailure,normalizeIntentResult} from './call-failure.js';
export {intentFailure};
export async function sendCaseIntent(adapter,name,...args){
  try{return normalizeIntentResult(await adapter[name](...args));}
  catch(error){return {...intentFailure(error),view:adapter.read()};}
}
