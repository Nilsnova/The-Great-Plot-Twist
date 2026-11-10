// Small title-safe account summary. It does not import the account screen or any transport.
import './account.css';
import {node} from '../../ui/kit/dom.js';
import {createButton} from '../../ui/kit/button.js';
import {providerActions} from './providers.js';
import {createEmailCodeForm} from './email-code.js';

const accountOf=view=>view?.account??view??{};
const labels={signed_out:'Signed out',signing_in:'Signing in',signed_in:'Signed in',expired:'Session expired',error:'Account unavailable'};
export function createAccountSummary({send,openAccount}){
  const element=node('section','account-summary');element.setAttribute('aria-label','Account');
  const replayNote=node('p','shell-note');
  const status=node('p','account-summary-status'),name=node('strong'),actions=node('div','account-summary-actions');status.append(name);
  // The email code form lives outside the repainted actions, so typing and focus survive updates.
  const email=createEmailCodeForm({send,focusPrefix:'email'});element.append(status,actions,email.element,replayNote);
  let buttons=[];
  function button(label,onClick,focusKey,disabled=false){const component=createButton({label,onClick,disabled,variant:'quiet'});component.element.dataset.focus=focusKey;buttons.push(component);actions.append(component.element);}
  function update(view){
    const active=actions.contains(document.activeElement)?document.activeElement:null,focusKey=active?.dataset.focus??null;
    const account=accountOf(view),state=account.state??'signed_out';name.textContent=String(account.captainName??'Captain pending');
    status.setAttribute('role','status');status.setAttribute('aria-label',`${labels[state]??state} · ${name.textContent}`);
    status.replaceChildren(node('span','account-summary-state',labels[state]??state),document.createTextNode(' · '),name);
    replayNote.textContent=account.guest?'You are playing as a guest. Sign in to keep your progress.':'';replayNote.hidden=!account.guest;
    buttons.forEach(item=>item.dispose());buttons=[];actions.replaceChildren();
    button('Account',()=>openAccount?.(),'account');
    if(account.canSignIn!==false&&(state==='signed_out'||state==='expired'||state==='error'))for(const item of providerActions(account,{prefix:state==='expired'?'Sign in again with':'Sign in with',focus:'sign-in'}))button(item.label,()=>send?.('signIn',...item.args),item.focus);
    if(account.canSignIn!==false&&state==='signed_in'&&account.guest===true)for(const item of providerActions(account,{prefix:'Keep progress with',upgrade:true,focus:'upgrade'}))button(item.label,()=>send?.('signIn',...item.args),item.focus);
    email.update(account);
    if(account.signInMessage)actions.append(node('span','account-summary-note',account.signInMessage));
    if(focusKey){const replacement=[...actions.querySelectorAll('[data-focus]')].find(item=>item.dataset.focus===focusKey&&!item.disabled);
      (replacement??actions.querySelector('button:not(:disabled)'))?.focus({preventScroll:true});}
  }
  function dispose(){buttons.forEach(item=>item.dispose());buttons=[];email.dispose();element.remove();}
  return {element,update,dispose};
}
