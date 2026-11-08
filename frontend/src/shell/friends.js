// An explicit Friends visit offers one useful next step without starting sign-in or gameplay itself.
import './friends.css';
import {node} from '../ui/kit/dom.js';
import {menuButton} from './screens.js';
import {hasLocalIntro} from './logic.js';
import {friendsPlan} from './friends-logic.js';

export function fillFriendsPage({body,nav,ctx,isCurrent,play,back}){
  const card=node('section','friends-guide'),title=node('h3'),copy=node('p','shell-copy'),steps=node('ol','friends-steps');
  const help=node('details','friends-help');help.append(node('summary','','How it works'),steps);
  const read=()=>friendsPlan(ctx.readAccount?.(),hasLocalIntro(ctx.readSave?.()));
  let plan=read(),busy=false;
  copy.setAttribute('role','status');
  for(const text of ['Sign in','Finish your island story','Start or join a crew'])steps.append(node('li','',text));
  const primary=menuButton(plan.label,async()=>{
    if(!isCurrent()||busy)return;plan=read();refresh();
    if(plan.action==='account'){
      busy=true;primary.disabled=true;
      try{await ctx.openAccount?.();}finally{busy=false;if(isCurrent()){primary.disabled=false;refresh();}}
    }else{play();ctx.onPlay?.(plan.resume,undefined,plan.action==='crew');}
  });
  const solo=menuButton('Start a new solo story',()=>{if(!isCurrent())return;play();ctx.onPlay?.(false);},true);
  function refresh(){
    if(!isCurrent())return;plan=read();
    if(title.textContent!==plan.title)title.textContent=plan.title;
    if(copy.textContent!==plan.body)copy.textContent=plan.body;
    if(primary.textContent!==plan.label)primary.textContent=plan.label;
  }
  card.append(title,copy);help.append(solo);nav.append(primary,menuButton('Back',back,true));body.replaceChildren(card,nav,help);
  body.addEventListener('focusin',refresh);refresh();
}
