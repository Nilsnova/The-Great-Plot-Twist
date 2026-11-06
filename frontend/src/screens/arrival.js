// Referee arrival card. Every ending, kit, item, coin and place comes from the adapter view.
import {createServerCallState} from '../ui/kit/server-call-state.js';
import {formatCoins} from '../ui/kit/logic.js';
import {node,button,facts} from './helpers.js';
export function createArrivalScreen({navigate,onRetry,onSignIn}) {
  const element=node('section','case-arrival');element.setAttribute('aria-label','Your arrival profile');
  const call=createServerCallState({label:'arrival confirmation',onRetry,onSignIn});
  let focusFrame=null;
  function cancelFocus(){if(focusFrame!==null)cancelAnimationFrame(focusFrame);focusFrame=null;}
  function setResult(result){
    cancelFocus();
    if(result.accepted){call.succeed();return;}
    call.fail(result);
    if(typeof requestAnimationFrame==='function')focusFrame=requestAnimationFrame(()=>{
      focusFrame=null;
      if(!element.isConnected||document.querySelector('.account-modal[open]')||element.closest('dialog')?.open===false)return;
      const state=call.read(),key=state.canSignIn?'sign-in-server-call':state.canRetry?'retry-server-call':'report-server-call';
      const target=call.element.querySelector(`[data-focus="${key}"]`);
      (target&&!target.hidden&&!target.closest('[hidden]')?target:call.element.querySelector('.problem-report:not([hidden])'))?.focus({preventScroll:true});
    });
  }
  return {element,loading(){cancelFocus();call.loading();},setResult,update(view){
    const arrival=view.arrival,signInAllowed=view.account?.canSignIn!==false;call.setSignInAllowed(signInAllowed);element.replaceChildren(node('p','case-eyebrow',arrival.endingLabel),node('h3','',arrival.title));
    if(arrival.kit){element.append(node('strong','case-kit-name',arrival.kit.name),facts([['Kit item',arrival.kit.item],['Start place',arrival.kit.startLabel],['Starting coins',formatCoins(arrival.coins)]]));
      const inventory=node('ul');for(const item of arrival.items)inventory.append(node('li','',item));element.append(inventory);
      if(arrival.logCard){const log=node('aside','case-log-card');log.append(node('h4','',arrival.logCard.title),node('p','',arrival.logCard.message),node('small','','Lead only · cannot be pinned'));element.append(log);}
      element.append(button('Find your crew',()=>navigate('crew'),{focus:'arrival-crew'}));}
    element.append(node('p','case-caption',arrival.status!=='ready'&&!signInAllowed?(view.account?.signInMessage||'Sign-in opens later. Your progress on this device is kept.'):arrival.message),call.element);
  },tick(){},dispose(){cancelFocus();call.dispose();element.remove();}};
}
