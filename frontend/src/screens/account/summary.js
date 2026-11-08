// Small title-safe account summary. It does not import the account screen or any transport.
import './account.css';
import {node} from '../../ui/kit/dom.js';
import {createButton} from '../../ui/kit/button.js';

const accountOf=view=>view?.account??view??{};
const labels={signed_out:'Signed out',signing_in:'Signing in',signed_in:'Signed in',expired:'Session expired',error:'Account unavailable'};
const saveStates={idle:'No save',saving:'Saving',saved:'Saved',offline:'Offline copy',conflict:'Conflict'};
export function createAccountSummary({send,openAccount,onContinue}){
  const element=node('section','account-summary');element.setAttribute('aria-label','Account and saved game');
  const replayNote=node('p','shell-note');
  const status=node('p','account-summary-status'),saveStatus=node('p','account-summary-note'),name=node('strong'),actions=node('div','account-summary-actions');status.append(name);element.append(status,saveStatus,actions,replayNote);
  let buttons=[];
  function button(label,onClick,focusKey,disabled=false){const component=createButton({label,onClick,disabled,variant:'quiet'});component.element.dataset.focus=focusKey;buttons.push(component);actions.append(component.element);}
  function update(view){
    const active=actions.contains(document.activeElement)?document.activeElement:null,focusKey=active?.dataset.focus??null;
    const account=accountOf(view),state=account.state??'signed_out';name.textContent=String(account.captainName??'Captain pending');
    status.setAttribute('role','status');status.setAttribute('aria-label',`${labels[state]??state} · ${name.textContent}`);
    status.replaceChildren(node('span','account-summary-state',labels[state]??state),document.createTextNode(' · '),name);
    replayNote.textContent=account.hasKit?'New game restarts the local intro. Captain and kit stay.'
      :'Continue uses cloud when signed in, or the local intro.';
    const save=account.save??{};saveStatus.textContent=`${saveStates[save.state]??'Save status'} · ${save.label??'No saved progress'}`;
    buttons.forEach(item=>item.dispose());buttons=[];actions.replaceChildren();
    button('Account and saves',()=>openAccount?.(),'account');
    if(account.canSignIn!==false&&(state==='signed_out'||state==='expired'||state==='error'))button(state==='expired'?'Sign in again with GitHub':'Sign in with GitHub',()=>send?.('signIn'),'sign-in');
    if(account.signInMessage)actions.append(node('span','account-summary-note',account.signInMessage));
    if(account.canContinue){
      if(onContinue)button(account.save?.source==='cloud'?'Continue from cloud':'Continue',async()=>{const result=await send?.('continueGame');if(result?.accepted)onContinue(result);},'continue');
    }else if(account.save?.state!=='conflict')actions.append(node('span','account-summary-note','No saved game'));
    if(account.save?.state==='conflict')actions.append(node('span','account-summary-note','Choose a save in Account and saves'));
    if(focusKey){const replacement=[...actions.querySelectorAll('[data-focus]')].find(item=>item.dataset.focus===focusKey&&!item.disabled);
      (replacement??actions.querySelector('button:not(:disabled)'))?.focus({preventScroll:true});}
  }
  function dispose(){buttons.forEach(item=>item.dispose());buttons=[];element.remove();}
  return {element,update,dispose};
}
