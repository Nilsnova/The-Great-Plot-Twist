import '../../ui/open-panels.css';
import '../../ui/settings-polish.css';
// Account presentation. All state and decisions arrive through supplied view data.
import './account.css';
import './screen.css';
import {node} from '../helpers.js';
import {createServerCallState} from '../../ui/kit/server-call-state.js';
import {intentFailure} from '../../adapter/intent.js';
import {createButton} from '../../ui/kit/button.js';
import {syncIntentCooldown} from '../../ui/kit/intent-cooldown.js';
import {createConnectionBanner} from '../../ui/connection-banner.js';
import {providerActions} from './providers.js';
import {createEmailCodeForm} from './email-code.js';

const accountStates={signed_out:'Signed out',signing_in:'Signing in',signed_in:'Signed in',expired:'Session expired',error:'Account error'};
const accountOf=view=>view?.account??view??{};
function stateLabel(value,labels){return labels[value]??(String(value??'').replaceAll('_',' ')||'Unknown');}

export function createAccountScreen({send}){
  const element=node('section','account-screen');element.setAttribute('aria-label','Account');
  let view={},feedback='',busy=false,deleteArmed=false,buttons=[],lastIntent=null,disposed=false,request=0,expiryAttention=false;
  const connection=createConnectionBanner({inline:true,send:(...args)=>send?.(...args)});
  // Made once: each render moves the same form, so a typed address or code is kept.
  const email=createEmailCodeForm({send,focusPrefix:'account-email'});
  let refusedFocus=null;
  const syncCooldown=()=>syncIntentCooldown(element,refusedFocus,call.read().remaining);
  const call=createServerCallState({messageElement:node('p','account-feedback'),label:'account action',onRetry:()=>lastIntent&&invoke(...lastIntent),onChange:()=>syncCooldown()});
  function action(parent,label,method,args=[],focus,disabled=false){
    const component=createButton({label,disabled,onClick:()=>invoke(method,...args)});if(focus)component.element.dataset.focus=focus;
    component.element.dataset.intent=method;buttons.push(component);parent.append(component.element);return component.element;
  }
  function clearButtons(){buttons.forEach(item=>item.dispose());buttons=[];}
  function render(){
    const account=accountOf(view),name=String(account.captainName??'Captain pending'),state=account.state??'signed_out';
    if(state==='signed_out')deleteArmed=false;
    clearButtons();element.replaceChildren(node('h3','','Account'));
    element.append(node('p','account-status',`${stateLabel(state,accountStates)} · ${name}`));
    if(state==='expired'){
      const banner=node('p','account-banner','Your session expired. Sign in again to keep playing online.');banner.setAttribute('role','alert');banner.dataset.state=state;element.append(banner);
    }else if(state==='error'){
      const banner=node('p','account-banner','The account service could not complete the last request. Try again in a moment.');banner.setAttribute('role','alert');banner.dataset.state=state;element.append(banner);
    }else if(state==='signing_in')element.append(node('p','account-banner','Sign-in is in progress.'));

    if(account.signInMessage)element.append(node('p','account-banner',account.signInMessage));

    const actions=node('div','account-actions');
    if(account.canSignIn!==false&&(state==='signed_out'||state==='expired'||state==='error'))for(const item of providerActions(account,{prefix:state==='expired'?'Sign in again with':'Sign in with'}))action(actions,item.label,'signIn',item.args,item.focus,busy);
    if(state==='signing_in')action(actions,'Signing in…','signIn',[],'account-sign-in',true);
    if(state==='signed_in'){
      if(account.guest===true){
        actions.append(node('p','account-muted','You are playing as a guest. Sign in to keep your progress on any device.'));
        if(account.canSignIn!==false)for(const item of providerActions(account,{prefix:'Keep progress with',upgrade:true,focus:'account-upgrade'}))action(actions,item.label,'signIn',item.args,item.focus,busy);
      }
      action(actions,'Sign out','signOut',[],'account-sign-out',busy);
      if(account.canReroll)action(actions,'Change captain name once','rerollName',[],'account-reroll',busy);
      else if(account.namePending){actions.append(node('p','account-muted','Captain setup is not ready yet.'));if(account.canRetryName)action(actions,'Retry captain setup','signIn',[],'account-name-setup',busy);}
      else actions.append(node('p','account-muted','Your captain name change has been used.'));
    }
    element.append(actions);email.update(account);element.append(email.element);
    if(state==='signed_in'||state==='expired'){
      if(deleteArmed){
        const confirm=node('section','account-delete-confirm');confirm.setAttribute('aria-labelledby','account-delete-title');
        const heading=node('h4','','Delete all your player data?');heading.id='account-delete-title';
        const description=node('p','','This removes your account data, captain name, coins, islet buildings and ledger history. This cannot be undone.');description.id='account-delete-description';confirm.append(heading,description);
        const controls=node('div','account-actions');const confirmButton=action(controls,'Confirm deletion','deleteMyData',[{confirm:true}],'account-delete-confirm',busy);confirmButton.setAttribute('aria-describedby',description.id);
        const cancel=createButton({label:'Keep my data',variant:'quiet',onClick:()=>{deleteArmed=false;feedback='';focusKey='account-delete';refresh();}});
        cancel.element.dataset.focus='account-delete-cancel';buttons.push(cancel);controls.append(cancel.element);confirm.append(controls);element.append(confirm);
      }else action(actions,'Delete my data','armDelete',[],'account-delete',busy);
    }
    if(feedback){const status=node('p','account-feedback',feedback);status.setAttribute('role','status');element.append(status);}
    connection.update(view);element.append(connection.element,call.element);syncCooldown();restoreRequestedFocus();
  }
  let focusKey=null;
  function restoreRequestedFocus(){
    if(!focusKey)return;
    if(element.closest('dialog')?.open===false){focusKey=null;return;}
    const target=[...element.querySelectorAll('[data-focus]')].find(item=>item.dataset.focus===focusKey);
    if(target?.disabled&&busy)return;
    if(!target&&busy)return;
    const available=item=>item&&!item.disabled&&!item.closest('[hidden]');
    const next=available(target)?target:[...element.querySelectorAll('button,input,select')].find(available);
    next?.focus({preventScroll:true});
    if(focusKey==='account-delete-confirm')element.querySelector('.account-delete-confirm')?.scrollIntoView?.({block:'start'});
    focusKey=null;
  }
  async function invoke(method,...args){
    if(method==='armDelete'){deleteArmed=true;feedback='Review the full deletion notice and press Confirm deletion to continue.';focusKey='account-delete-confirm';refresh();return;}
    if(busy||disposed||(lastIntent?.[0]===method&&call.read().remaining>0))return;
    const source=document.activeElement;refusedFocus=source?.dataset.intent===method?source.dataset.focus:[...element.querySelectorAll('[data-intent]')].find(item=>item.dataset.intent===method)?.dataset.focus??refusedFocus;
    busy=true;const token=++request;feedback='';expiryAttention=false;lastIntent=[method,...args];call.loading();refresh();
    try{const result=await send?.(method,...args);if(disposed||token!==request)return;if(result?.accepted)call.succeed({message:result.message});else call.fail(result??intentFailure());if(result?.accepted&&method==='deleteMyData')deleteArmed=false;}
    catch(error){if(!disposed&&token===request)call.fail(intentFailure(error));}
    finally{busy=false;if(!disposed)refresh();}
  }
  function refresh(){
    if(!focusKey&&element.contains(document.activeElement))focusKey=document.activeElement.dataset.focus??null;
    render();
  }
  function showExpiry(){
    if(disposed)return;expiryAttention=true;feedback='';
    call.fail(intentFailure({status:401}),{retryable:false});
  }
  function update(next){
    const previous=accountOf(view).state;view=next??{};const state=accountOf(view).state;
    if(state==='signed_out')deleteArmed=false;
    if(state==='expired'&&(previous!=='expired'||call.phase==='idle'))showExpiry();
    else if(state!=='expired'&&expiryAttention){expiryAttention=false;call.clear();}
    refresh();
  }
  refresh();
  return {element,update,signIn:()=>invoke('signIn'),showExpiry(){showExpiry();refresh();},tick(){},close(){request++;expiryAttention=false;call.clear();},dispose(){disposed=true;call.dispose();connection.dispose();clearButtons();email.dispose();element.remove();}};
}
