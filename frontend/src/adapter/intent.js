// One safe boundary for presentation callers; it never decides game outcomes.
import {noteIntentOutcome,noteAdapterView} from '../diagnostics/runtime.js';
import {intentFailure,normalizeIntentResult} from './call-failure.js';
export {intentFailure};
export async function sendCaseIntent(adapter,name,...args){
  let result;
  try{result=normalizeIntentResult(await adapter[name](...args));}
  catch(error){result={...intentFailure(error),view:adapter.read()};}
  noteAdapterView(result.view);
  noteIntentOutcome(name,result);
  return result;
}
