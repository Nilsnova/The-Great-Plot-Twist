// Compose menus only when opened, keeping pause/settings/report code out of the cold title.
import {menuButton} from './screens.js';
export async function fillSubpage({mode,body,nav,ctx,isCurrent,play,page,show,back}){
  if(mode==='pause'){
    const {fillPauseMenu}=await import('./pause.js');if(!isCurrent())return;
    fillPauseMenu(nav,{play,page,show,openAccount:ctx.openAccount});body.replaceChildren(nav);
  }else if(mode==='credits'){
    const {credits}=await import('./credits.js');if(!isCurrent())return;
    body.replaceChildren(credits(),menuButton('Back',back,true));
  }else{
    const settings=await ctx.settingsView?.();if(!isCurrent())return;
    body.replaceChildren(...(settings?[settings]:[]),menuButton('Credits',()=>show('credits'),true),menuButton('Back',back,true));
  }
  body.querySelector('button,input,select,a')?.focus();
}
