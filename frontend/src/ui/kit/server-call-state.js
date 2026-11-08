// Accessible request status, with explicit actions only. No fetch, automatic retry or case rules.
import './server-call-state.css';
import {node} from './dom.js';
import {createCallState} from './call-state.js';
import {createProblemLink} from '../../diagnostics/report-link.js';

export function createServerCallState({messageElement,label='request',onRetry,onSignIn,
  reportLink,now,onChange=()=>{}}={}){
  const model=createCallState({now}),element=node('div','server-call');
  const message=messageElement??node('p'),announcement=node('span','server-call-announcement');
  message.removeAttribute('role');message.setAttribute('aria-live','off');
  announcement.setAttribute('role','status');announcement.setAttribute('aria-live','polite');
  announcement.setAttribute('aria-atomic','true');
  const report=reportLink===undefined?createProblemLink():reportLink;
  if(report&&!report.dataset.focus)report.dataset.focus='report-server-call';
  const actions=node('div','server-call-actions'),retry=node('button','kit-button','Retry');
  const signIn=node('button','kit-button','Sign in again');
  retry.type=signIn.type='button';retry.setAttribute('aria-label',`Retry ${label}`);
  retry.dataset.focus='retry-server-call';signIn.dataset.focus='sign-in-server-call';
  retry.onclick=()=>{if(model.read().canRetry)onRetry?.();};
  signIn.onclick=()=>{if(signInAllowed&&model.read().canSignIn)onSignIn?.();};
  actions.append(retry,signIn);if(report)actions.append(report);
  element.append(message,announcement,actions);
  let timer=null,disposed=false,lastAnnouncement='',lastState=null,signInAllowed=true;
  function stop(){if(timer!==null)clearTimeout(timer);timer=null;}
  function paint(tick=false){
    if(disposed)return;
    if(tick){timer=null;if(!element.isConnected||element.closest('dialog')?.open===false)return;}
    const state=model.read();element.dataset.state=state.visible?state.phase:'pending';
    if(message.textContent!==state.message)message.textContent=state.message;
    message.hidden=!state.message||!state.visible;
    retry.hidden=!onRetry||!['error','offline','online','rate_limited'].includes(state.phase)
      ||(!state.canRetry&&state.phase!=='rate_limited');
    retry.disabled=!state.canRetry;signIn.hidden=!onSignIn||!state.canSignIn||!signInAllowed;
    signIn.textContent=state.reason==='sign_in_required'?'Sign in with GitHub':'Sign in again';
    if(report)report.hidden=!['error','offline','expired','rate_limited','slow'].includes(state.phase);
    actions.hidden=retry.hidden&&signIn.hidden&&(!report||report.hidden);
    element.hidden=!state.visible||(!state.message&&actions.hidden);
    // The visible countdown changes each second; its live announcement changes only at either end.
    const announce=state.visible&&(!tick||state.phase!=='rate_limited'||lastState?.phase!=='rate_limited'
      ||(lastState.remaining>0&&state.remaining===0));
    if(announce&&lastAnnouncement!==state.message){
      announcement.textContent=state.message;lastAnnouncement=state.message;
    }
    if(!state.visible||!state.message){announcement.textContent='';lastAnnouncement='';}
    const changed=!!lastState&&(lastState.phase!==state.phase||lastState.remaining!==state.remaining);
    lastState=state;
    if(changed){try{onChange({...state});}catch{/* Presentation observers cannot stop a countdown. */}}
    stop();if(state.nextUpdate>0)timer=setTimeout(()=>paint(true),state.nextUpdate);
  }
  function change(method,...args){if(disposed)return;stop();model[method](...args);paint();}
  paint();
  return {element,read:model.read,get phase(){return model.read().phase;},
    refresh(){if(!disposed)paint();},
    loading:options=>change('loading',options),succeed:options=>change('succeed',options),
    showMessage:text=>change('notice',text),fail:(result,options)=>change('fail',result,options),
    setOnline:online=>change('setOnline',online),clear:()=>change('clear'),
    setSignInAllowed(value){
      const next=value!==false;if(next===signInAllowed)return;
      const focused=globalThis.document?.activeElement===signIn;
      signInAllowed=next;paint();
      if(focused&&signIn.hidden)(!retry.hidden&&!retry.disabled?retry:report&&!report.hidden?report:null)?.focus?.({preventScroll:true});
    },
    dispose(){disposed=true;stop();element.remove();}};
}
