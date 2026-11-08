// Lazy account modal. It owns presentation and sends only adapter intents.
import {createServerCallState} from '../ui/kit/server-call-state.js';
import {createModal} from '../ui/kit/modal.js';
import {node} from '../ui/kit/dom.js';
import {sendCaseIntent} from '../adapter/intent.js';
export function createAccountHost({container,adapter,focus,onContinue}){
  let modal=null,screen=null,request=0,disposed=false,active=false,lastKey='';
  let retryExternal=null;
  const external=createServerCallState({messageElement:node('p','account-result'),label:'previous request',onRetry:()=>retryExternal?.(),onSignIn:()=>screen?.signIn()});
  const syncSignIn=view=>external.setSignInAllowed(view?.account?.canSignIn!==false);
  async function send(name,...args){
    external.clear();const result=await sendCaseIntent(adapter,name,...args);
    if(!disposed){syncSignIn(result.view);screen?.update(result.view);}return result;
  }
  function update(view){
    if(disposed)return;syncSignIn(view);
    if(view?.account?.state==='expired')external.clear();
    const key=JSON.stringify(view.account);
    if(key===lastKey)return;lastKey=key;screen?.update(view);
  }
  function close(){request++;active=false;screen?.close();external.clear();modal?.close();focus?.();}
  function notice(result,retry){
    if(!modal||disposed||!active)return;retryExternal=retry??null;
    syncSignIn(adapter.read());
    if(result?.reason==='session_expired'&&screen?.showExpiry){external.clear();retryExternal=null;screen.showExpiry();return;}
    if(typeof result==='string')external.showMessage(result);else external.fail(result,{retryable:!!retry});
    modal.body.append(external.element);
  }
  async function open(){
    if(disposed)return;
    const token=++request;active=true;
    if(!modal)modal=createModal({title:'Your captain',body:node('p','','Opening account…'),onCancel:close,onClose:()=>{active=false;focus?.();}});
    modal.element.classList.add('account-modal');modal.open(container);
    try{
      const {createAccountScreen}=await import('../screens/account/index.js');
      if(disposed||token!==request)return;
      if(!screen)screen=createAccountScreen({send,navigate(name,result){if(name==='continue'){close();onContinue?.(result);}}});
      const view=adapter.read();syncSignIn(view);modal.setContent(screen.element);screen.update(view);
      const expired=view.account?.state==='expired'?screen.element.querySelector('[data-focus="account-sign-in"]:not(:disabled)'):null;
      expired?.scrollIntoView({block:'nearest',inline:'nearest'});
      (expired??modal.element.querySelector('.kit-modal-header button'))?.focus({preventScroll:true});
      if(!expired){modal.body.scrollTop=0;modal.element.scrollTop=0;}
    }catch{if(!disposed&&token===request)notice('The account panel could not load. Close it and try again.');}
  }
  return {get active(){return active;},open,close,update,notice,
    dispose(){if(disposed)return;disposed=true;close();screen?.dispose();external.dispose();modal?.dispose();}};
}
