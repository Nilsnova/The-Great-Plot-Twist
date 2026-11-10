// Compose menus only when opened, keeping pause/settings/report code out of the cold title.
import {node} from '../ui/kit/dom.js';
import {menuButton} from './screens.js';
// Account and sign-in live in Settings. The summary follows account changes while shown.
async function accountSummary(ctx,section){
  try{
    const {createAccountSummary}=await import('../screens/account/summary.js');
    const summary=createAccountSummary({send:ctx.send,openAccount:ctx.openAccount}),first=ctx.adapter.read();summary.update(first);
    section.append(summary.element);
    // Repaint only when the account changes: case ticks must not replace the button a keyboard user is on.
    let last=JSON.stringify(first.account);
    const stop=ctx.adapter.subscribe(event=>{if(!summary.element.isConnected){stop();summary.dispose();return;}
      const key=JSON.stringify(event.view.account);if(key===last)return;last=key;summary.update(event.view);});
  }catch{if(ctx.openAccount)section.append(menuButton('Account',ctx.openAccount,true));}
}
export async function fillSubpage({mode,body,nav,ctx,isCurrent,play,page,show,back}){
  if(mode==='pause'){
    const {fillPauseMenu}=await import('./pause.js');if(!isCurrent())return;
    fillPauseMenu(nav,{play,page,show,openAccount:ctx.openAccount});body.replaceChildren(nav);
  }else if(mode==='credits'){
    const {credits}=await import('./credits.js');if(!isCurrent())return;
    body.replaceChildren(credits(),menuButton('Back',back,true));
  }else if(mode==='join'){
    const {fillJoinPage}=await import('./join.js');if(!isCurrent())return;
    fillJoinPage({body,nav,ctx,isCurrent,play,page,back});
  }else{
    const settings=await ctx.settingsView?.();if(!isCurrent())return;
    const story=node('section','shell-section');story.append(node('h3','','Intro'));
    if(ctx.onReplay)story.append(menuButton('Replay the intro',()=>{play();ctx.onReplay();},true));
    const account=node('section','shell-section');account.append(node('h3','','Account'));
    if(ctx.adapter)await accountSummary(ctx,account);
    else if(ctx.openAccount)account.append(menuButton('Account',ctx.openAccount,true));
    if(!isCurrent())return;
    body.replaceChildren(account,story,...(settings?[settings]:[]),menuButton('Credits',()=>show('credits'),true));
    for(const [label,path] of [['How to play','help.html'],['Privacy','privacy.html']]){
      const link=document.createElement('a');link.className='kit-button kit-quiet';link.textContent=label;
      link.href=`${import.meta.env.BASE_URL}${path}`;link.target='_blank';link.rel='noopener noreferrer';body.append(link);
    }
    const about=settings?.querySelector('.build-info');if(about){const section=node('section','shell-section');section.append(node('h3','','About'),about);body.append(section);}
    body.append(menuButton('Back',back,true));
  }
  if(mode==='credits'){
    const dialog=body.closest('dialog'),heading=dialog?.querySelector('.kit-heading');
    if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}
    body.closest('.kit-modal-body')?.scrollTo(0,0);if(dialog)dialog.scrollTop=0;
  }else body.querySelector('button,input,select,a')?.focus();
}
