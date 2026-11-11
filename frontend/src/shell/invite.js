// The friend's landing (docs/TOWER-DEFENSE.md §6): someone opened a ?visit=ISLE-K7Q2M link. One clear
// screen, no class code: Join as guest (anonymous sign-in, POST /api/island/invite/join through the
// adapter, then Play sails to the island) or, second, Sign in with GitHub. A signed-in player only
// presses Join. Loaded only when shown; the island code lives in sessionStorage (codes.js).
import './join.css';
import {node} from '../ui/kit/dom.js';
import {menuButton} from './screens.js';
import {displayIslandCode,readVisit,storeVisit,forgetVisit} from '../island/codes.js';
import {forgetJoinCode} from '../front-door/logic.js';

function session(){try{return sessionStorage;}catch{return null;}}
// What the screen says, as plain data (tests read it without a DOM).
export function inviteLanding({code,ownerName='',signedIn=false}={}){
  const owner=typeof ownerName==='string'&&ownerName.trim()?ownerName.trim():'Your friend';
  return {title:`${owner} invites you to defend their island`,code:displayIslandCode(code),
    line:'Pirates are coming. Sail over and fight the waves together.',
    join:signedIn?'Join':'Join as guest',github:signedIn?'':'Sign in with GitHub',
    note:signedIn?'':'A guest needs no account. You can link GitHub later and keep your coins.'};
}

// Whose island it is, before sign-in. The live server has no public lookup yet, so the screen says "Your
// friend"; with ?islands=fake in a dev build the fake's friend island (ISLE-FR3ND) answers.
export async function lookupOwner(code){
  if(!import.meta.env.DEV||new URLSearchParams(globalThis.location?.search??'').get('islands')!=='fake'||!code)return '';
  try{const {FAKE_FRIEND}=await import('../pirates/fake-api.js');return code===FAKE_FRIEND.code?FAKE_FRIEND.ownerName:'';}catch{return '';}
}

export function fillInvitePage({body,nav,ctx,isCurrent,play,back,ownerName=''}){
  const code=readVisit();
  const adapter=ctx.adapter,view=adapter?.read?.(),online=view?.mode==='online',signedIn=view?.account?.state==='signed_in';
  const copy=inviteLanding({code,ownerName:ownerName||ctx.inviteOwner?.(code)||'',signedIn});
  const status=node('p','shell-note');status.setAttribute('role','status');
  const wrap=node('div','invite-landing');
  wrap.append(node('h3','invite-title',copy.title),node('p','invite-code',copy.code),node('p','shell-copy',copy.line));
  let busy=false;
  const start=()=>{forgetJoinCode(session());storeVisit(code);play();ctx.onStart?.();};
  const join=menuButton(copy.join,async()=>{
    if(busy||!isCurrent())return;
    if(!code){status.textContent='This link has no island code. Ask your friend to send it again.';return;}
    // Local play (and ?islands=fake in a dev build): nothing to sign in; the game sails to the island.
    const fake=import.meta.env.DEV&&new URLSearchParams(globalThis.location?.search??'').get('islands')==='fake';
    if(!online||signedIn||fake){start();return;}
    busy=true;join.disabled=true;status.textContent='Signing you in as a guest…';
    let result;
    try{result=await adapter.signIn({guest:true,island:displayIslandCode(code)});}catch{result={accepted:false,reason:'not_connected'};}
    busy=false;join.disabled=false;
    if(!isCurrent())return;
    if(result?.accepted){start();return;}
    if(result?.reason==='no_such_island')forgetVisit();
    status.textContent=result?.message||'Joining did not work. Check your internet and try again.';
  });
  join.classList.add('invite-join');wrap.append(join);
  if(copy.github&&online){
    const github=menuButton(copy.github,async()=>{
      if(busy||!isCurrent())return;storeVisit(code);status.textContent='Opening GitHub…';
      let result;try{result=await adapter.signIn({provider:'github'});}catch{result=null;}
      if(isCurrent()&&result&&result.accepted===false)status.textContent=result.message||'GitHub sign-in did not open. Try Join as guest.';
    },true);
    wrap.append(github);
  }
  if(copy.note)wrap.append(node('p','shell-note',copy.note));
  wrap.append(status);
  nav.append(menuButton('Not now',()=>{forgetVisit();back();},true));
  body.replaceChildren(wrap,nav);join.focus();
}
