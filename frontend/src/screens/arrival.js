// Referee arrival card. Every ending, kit, item, coin and place comes from the adapter view.
import {createServerCallState} from '../ui/kit/server-call-state.js';
import {formatCoins} from '../ui/kit/logic.js';
import {node,button,facts} from './helpers.js';
export function createArrivalScreen({navigate,onRetry,onSignIn}) {
  const element=node('section','case-arrival');element.setAttribute('aria-label','Your arrival profile');
  const call=createServerCallState({label:'arrival confirmation',onRetry,onSignIn});
  const eyebrow=node('p','case-eyebrow'),heading=node('h3'),kitName=node('strong');
  const details=facts([['Kit item',''],['Start place',''],['Starting coins','']]);
  const values=[...details.querySelectorAll('dd')],inventory=node('ul'),log=node('aside','case-log-card');
  const logTitle=node('h4'),logText=node('p');log.append(logTitle,logText,node('small','','Lead only · cannot be pinned'));
  const crew=button('Find your crew',()=>navigate('crew'),{focus:'arrival-crew'}),caption=node('p','case-caption');
  for(const part of [kitName,details,inventory,log,crew])part.hidden=true;
  element.append(eyebrow,heading,kitName,crew,details,inventory,log,caption,call.element);
  let focusFrame=null,signature=null,itemsSignature=null,owner=null,rendered=false,disposed=false;
  const text=value=>String(value??'');
  const setText=(part,value)=>{if(part.textContent!==value)part.textContent=value;};
  const visible=()=>element.isConnected&&element.closest('dialog')?.open!==false
    &&!element.closest('[hidden],[inert]')&&!!element.getClientRects().length;
  const canFocus=()=>!disposed&&visible()&&!document.querySelector('.account-modal[open]');
  const available=part=>part?.isConnected&&!part.disabled&&!part.closest('[hidden],[inert]')&&!!part.getClientRects().length;
  function resume(){const next=visible();if(next&&!rendered)call.refresh();rendered=next;}
  const observer=new MutationObserver(records=>{
    if(!disposed&&records.some(record=>record.target===owner||record.target.contains(element)))resume();
  });
  function observeOwner(){
    const next=element.closest('dialog');
    if(next!==owner){observer.disconnect();owner=next;rendered=false;
      if(owner)observer.observe(owner,{attributes:true,subtree:true,attributeFilter:['open','hidden','inert']});}
    resume();
  }
  function focusAction(){
    if(!canFocus())return;
    const target=['sign-in-server-call','retry-server-call','report-server-call']
      .map(key=>call.element.querySelector(`[data-focus="${key}"]`)).find(available)??(available(crew)?crew:null);
    if(target)target.focus({preventScroll:true});else{heading.tabIndex=-1;heading.focus({preventScroll:true});}
  }
  function cancelFocus(){if(focusFrame!==null)cancelAnimationFrame(focusFrame);focusFrame=null;}
  function setResult(result){
    if(disposed)return;cancelFocus();
    if(result.accepted){call.succeed();return;}
    call.fail(result);
    if(typeof requestAnimationFrame==='function')focusFrame=requestAnimationFrame(()=>{
      focusFrame=null;if(disposed)return;observeOwner();focusAction();
    });
  }
  return {element,loading(){if(disposed)return;cancelFocus();observeOwner();call.loading();},setResult,update(view){
    if(disposed)return;observeOwner();
    const arrival=view.arrival,allowed=view.account?.canSignIn!==false;
    const kit=arrival.kit?{name:text(arrival.kit.name),item:text(arrival.kit.item),place:text(arrival.kit.startLabel),
      coins:formatCoins(arrival.coins),items:arrival.items.map(text),
      log:arrival.logCard?{title:text(arrival.logCard.title),message:text(arrival.logCard.message)}:null}:null;
    const model={ending:text(arrival.endingLabel),title:text(arrival.title),kit,allowed,
      caption:text(arrival.status!=='ready'&&!allowed?(view.account?.signInMessage||'Sign-in opens later. Your progress on this device is kept.'):arrival.message)};
    call.setSignInAllowed(allowed);
    const next=JSON.stringify(model);if(next===signature)return;signature=next;
    const focused=element.contains(document.activeElement);
    setText(eyebrow,model.ending);setText(heading,model.title);setText(caption,model.caption);
    kitName.className=kit?'case-kit-name':'';
    for(const part of [kitName,details,inventory,crew])part.hidden=!kit;
    log.hidden=!kit?.log;
    if(kit){
      setText(kitName,kit.name);[kit.item,kit.place,kit.coins].forEach((value,index)=>setText(values[index],value));
      const items=JSON.stringify(kit.items);
      if(items!==itemsSignature){itemsSignature=items;inventory.replaceChildren(...kit.items.map(item=>node('li','',item)));}
      if(kit.log){setText(logTitle,kit.log.title);setText(logText,kit.log.message);}
    }else{
      setText(kitName,'');values.forEach(part=>setText(part,''));inventory.replaceChildren();itemsSignature=null;
    }
    if(!kit?.log){setText(logTitle,'');setText(logText,'');}
    if(focused&&(!element.contains(document.activeElement)||!available(document.activeElement)))focusAction();
  },tick(){if(!disposed)observeOwner();},dispose(){if(disposed)return;disposed=true;cancelFocus();observer.disconnect();
    signature=itemsSignature=null;call.dispose();element.remove();}};
}
