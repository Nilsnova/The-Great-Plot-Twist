// Lazy account modal. It owns presentation and sends only adapter intents.
import {createServerCallState} from '../ui/kit/server-call-state.js';
import {createModal} from '../ui/kit/modal.js';
import {node} from '../ui/kit/dom.js';
import {sendCaseIntent} from '../adapter/intent.js';
export function createAccountHost({container,adapter,focus,onContinue}){
  let modal=null,screen=null,request=0,disposed=false,active=false,lastKey='';
  let retryExternal=null;
  const external=createServerCallState({messageElement:node('p','account-result'),label:'previous request',onRetry:()=>retryExternal?.(),onSignIn:()=>screen?.signIn()});
  async function send(name,...args){
    external.clear();const result=await sendCaseIntent(adapter,name,...args);
    if(!disposed)screen?.update(result.view);return result;
  }
  function update(view){
    const key=JSON.stringify(view.account);
    if(key===lastKey)return;lastKey=key;screen?.update(view);
  }
  function close(){request++;active=false;screen?.close();external.clear();modal?.close();focus?.();}
  function notice(result,retry){
    if(!modal||disposed||!active)return;retryExternal=retry??null;
    if(typeof result==='string')external.showMessage(result);else external.fail(result,{retryable:!!retry});
    modal.body.append(external.element);
  }
  async function open(){
    const token=++request;active=true;
    if(!modal)modal=createModal({title:'Your captain',body:node('p','','Opening account…'),onCancel:close,onClose:()=>{active=false;focus?.();}});
    modal.element.classList.add('account-modal');modal.open(container);
    try{
      const {createAccountScreen}=await import('../screens/account/index.js');
      if(disposed||token!==request)return;
      if(!screen)screen=createAccountScreen({send,navigate(name,result){if(name==='continue'){close();onContinue?.(result);}}});
      modal.setContent(screen.element);screen.update(adapter.read());
      screen.element.querySelector('button:not(:disabled)')?.focus();
    }catch{if(!disposed&&token===request)notice('The account panel could not load. Close it and try again.');}
  }
  return {get active(){return active;},open,close,update,notice,
    dispose(){if(disposed)return;disposed=true;close();screen?.dispose();external.dispose();modal?.dispose();}};
}
