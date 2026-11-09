// Join: enter a crew code, or scan the QR on the projector. Loaded only when opened.
import {node,uniqueId} from '../ui/kit/dom.js';
import {menuButton} from './screens.js';
import {joinTarget,JOIN_KEY} from '../front-door/logic.js';

function remember(key,value){try{sessionStorage.setItem(key,value);return true;}catch{return false;}}
function recall(key){try{return sessionStorage.getItem(key);}catch{return null;}}

export function fillJoinPage({body,nav,ctx,isCurrent,play,page,back}){
  const form=node('form','join-form'),label=node('label','preference'),input=node('input'),status=node('p','shell-note');
  const id=uniqueId('join-code');input.id=id;label.htmlFor=id;input.autocomplete='off';input.autocapitalize='characters';
  input.spellcheck=false;input.maxLength=24;input.inputMode='text';input.name='code';
  label.append(node('span','','Code'),input);status.setAttribute('role','status');
  const invited=recall(JOIN_KEY)==='harbor';
  const copy=node('p','shell-copy',invited?'You are invited to the class harbor. Press Join to start.'
    :'Enter the code you were given.');
  const hint=node('p','shell-note','In class? Scan the QR on the projector with your phone camera.');
  if(invited)input.value='HARBOR';
  const join=menuButton('Join',()=>{});join.type='submit';
  form.addEventListener('submit',event=>{
    event.preventDefault();if(!isCurrent())return;
    const target=joinTarget(input.value);
    if(!target){status.textContent='Codes use letters and numbers only. Check the code and try again.';input.focus();return;}
    if(target.kind==='harbor'){remember(JOIN_KEY,'harbor');play();ctx.onStart?.();return;}
    // A crew code goes through the existing friends and crew flow for now.
    remember('plot_twist_crew_code_v1',target.code);page('friends');
  });
  form.append(copy,label,status,join);nav.append(menuButton('Back',back,true));
  body.replaceChildren(form,hint,nav);input.focus();
}
