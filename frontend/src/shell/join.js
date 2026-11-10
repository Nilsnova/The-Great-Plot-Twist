// Join: enter the class code (HARBOR-K7QXM), or scan the QR on the projector. Loaded
// only when opened. A class code is checked by the server before the game starts (POST /api/demo/join
// through the adapter); a wrong or old code shows a plain message and the player types it again. The
// code lives only in sessionStorage, so it ends with the tab.
import './join.css';
import {node,uniqueId} from '../ui/kit/dom.js';
import {menuButton} from './screens.js';
import {joinTarget,displayCode,readJoinCode,forgetJoinCode,JOIN_KEY} from '../front-door/logic.js';

const INVALID='This class code is not valid. Ask the presenter for the current code.';
const REHEARSAL_CODE='TESTS'; // class-demo/harbor.js shows it in a rehearsal (?demo=1); never sent

function remember(key,value){try{sessionStorage.setItem(key,value);return true;}catch{return false;}}
function session(){try{return sessionStorage;}catch{return null;}}

export function fillJoinPage({body,nav,ctx,isCurrent,play,back}){
  const form=node('form','join-form'),label=node('label','preference'),input=node('input'),status=node('p','shell-note');
  const id=uniqueId('join-code');input.id=id;label.htmlFor=id;input.autocomplete='off';input.autocapitalize='characters';
  input.spellcheck=false;input.maxLength=24;input.inputMode='text';input.name='code';
  label.append(node('span','','Code'),input);status.setAttribute('role','status');
  const invited=readJoinCode(session());
  const copy=node('p','shell-copy',invited?'You are invited to the class harbor. Press Join to start.'
    :'Enter the code you were given.');
  const hint=node('p','shell-note','In class? Scan the QR on the projector with your phone camera, or type the class code shown there.');
  if(invited)input.value=displayCode(invited);
  const join=menuButton('Join',()=>{});join.type='submit';
  let busy=false;
  function refuse(text){status.textContent=text;input.focus();input.select?.();}
  async function joinClass(code){
    const rehearsal=ctx.demo===true&&code===REHEARSAL_CODE;
    const adapter=ctx.adapter;
    // Rehearsal and local play: nothing to check on a server; the class harbor still opens.
    if(rehearsal||adapter?.read?.().mode!=='online'){remember(JOIN_KEY,code);play();ctx.onStart?.();return;}
    busy=true;join.disabled=true;status.textContent='Checking the class code…';
    let result;
    try{result=await adapter.signIn({guest:true,code});}catch{result={accepted:false,reason:'not_connected'};}
    busy=false;join.disabled=false;
    if(!isCurrent())return;
    if(result?.accepted){remember(JOIN_KEY,code);play();ctx.onStart?.();return;}
    if(result?.reason==='class_code_invalid'){forgetJoinCode(session());refuse(INVALID);return;}
    refuse(result?.message||'Joining did not work. Try again in a moment.');
  }
  form.addEventListener('submit',event=>{
    event.preventDefault();if(!isCurrent()||busy)return;
    const target=joinTarget(input.value);
    if(!target){refuse('Codes use letters and numbers only. Check the code and try again.');return;}
    if(target.kind==='class'&&target.code){void joinClass(target.code);return;}
    // Crew codes left with the mystery (10 Nov); only the class code joins for now.
    refuse(INVALID);
  });
  form.append(copy,label,status,join);nav.append(menuButton('Back',back,true));
  body.replaceChildren(form,hint,nav);input.focus();
}
