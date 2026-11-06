// Accessible request status, with explicit actions only. No fetch, automatic retry or case rules.
import './server-call-state.css';
import {node} from './dom.js';
import {createCallState} from './call-state.js';
export function createServerCallState({messageElement,label='request',onRetry,onSignIn,reportLink=null,now}={}){
  const model=createCallState({now}),element=node('div','server-call'),message=messageElement??node('p');
  message.removeAttribute('role');element.setAttribute('aria-atomic','true');
  const actions=node('div','server-call-actions'),retry=node('button','kit-button','Retry'),signIn=node('button','kit-button','Sign in again');
  retry.type=signIn.type='button';retry.setAttribute('aria-label',`Retry ${label}`);retry.dataset.focus='retry-server-call';
  signIn.dataset.focus='sign-in-server-call';retry.onclick=()=>{if(model.read().canRetry)onRetry?.();};signIn.onclick=()=>onSignIn?.();
  actions.append(retry,signIn);if(reportLink)actions.append(reportLink);element.append(message,actions);let timer=null,disposed=false;
  function stop(){if(timer!==null)clearTimeout(timer);timer=null;}
  function paint(tick=false){
    if(disposed)return;if(tick){timer=null;if(!element.isConnected||element.closest('dialog')?.open===false)return;}const state=model.read();element.dataset.state=state.phase;
    element.setAttribute('role',['error','offline','expired'].includes(state.phase)?'alert':'status');
    if(message.textContent!==state.message)message.textContent=state.message;
    message.hidden=!state.message;retry.hidden=!onRetry||!['error','offline','rate_limited'].includes(state.phase)||(!state.canRetry&&state.phase!=='rate_limited');
    retry.disabled=!state.canRetry;signIn.hidden=!onSignIn||!state.canSignIn;if(reportLink)reportLink.hidden=!['error','offline','expired','rate_limited'].includes(state.phase);actions.hidden=retry.hidden&&signIn.hidden&&(!reportLink||reportLink.hidden);
    element.hidden=!state.message&&actions.hidden;
    if(state.phase==='rate_limited'&&state.remaining>0){if(timer===null)timer=setTimeout(()=>paint(true),1000);}else stop();
  }
  function change(method,...args){if(disposed)return;model[method](...args);paint();}
  paint();return {element,get phase(){return model.read().phase;},loading:()=>change('loading'),succeed:options=>change('succeed',options),showMessage:text=>change('notice',text),fail:(result,options)=>change('fail',result,options),clear:()=>change('clear'),dispose(){disposed=true;stop();element.remove();}};
}
