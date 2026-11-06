// Keep account presentation out of the first title paint while retaining its stable menu slot.
import '../screens/account/account.css';
import {node} from '../ui/kit/dom.js';
export function createLazyAccountSummary(ctx){
  const element=node('div','account-summary-host'),loading=node('p','account-summary-note','Reading account status…');loading.setAttribute('role','status');element.append(loading);
  let instance=null,latest=null,disposed=false;
  import('../screens/account/summary.js').then(({createAccountSummary})=>{if(disposed)return;instance=createAccountSummary(ctx);if(latest)instance.update(latest);element.replaceChildren(instance.element);}).catch(()=>{if(!disposed)loading.textContent='Account details could not load. Open Account and saves from the pause menu.';});
  return {element,update(view){latest=view;instance?.update(view);},dispose(){disposed=true;instance?.dispose();element.remove();}};
}
