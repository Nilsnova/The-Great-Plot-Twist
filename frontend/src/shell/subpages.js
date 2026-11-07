// Compose menus only when opened, keeping pause/settings/report code out of the cold title.
import {node} from '../ui/kit/dom.js';
import {menuButton} from './screens.js';
export async function fillSubpage({mode,body,nav,ctx,isCurrent,play,page,show,back}){
  if(mode==='friends'){
    const solo=menuButton('Play solo',()=>{play();ctx.onPlay(false);});
    nav.append(solo,menuButton('Back',back,true));
    body.replaceChildren(node('p','shell-copy','Online crews are not connected in this build.'),
      node('p','shell-note','You can explore solo now. Your progress stays in this browser.'),nav);
  }else if(mode==='pause'){
    const {fillPauseMenu}=await import('./pause.js');if(!isCurrent())return;
    fillPauseMenu(nav,{play,page,show,openAccount:ctx.openAccount});body.replaceChildren(nav);
  }else if(mode==='credits'){
    const {credits}=await import('./credits.js');if(!isCurrent())return;
    body.replaceChildren(credits(),menuButton('Back',back,true));
  }else{
    const settings=await ctx.settingsView?.();if(!isCurrent())return;
    body.replaceChildren(...(settings?[settings]:[]),menuButton('Credits',()=>show('credits'),true));
    for(const [label,path] of [['How to play','help.html'],['Privacy','privacy.html']]){
      const link=document.createElement('a');link.className='kit-button kit-quiet';link.textContent=label;
      link.href=`${import.meta.env.BASE_URL}${path}`;link.target='_blank';link.rel='noopener noreferrer';body.append(link);
    }
    body.append(menuButton('Back',back,true));
  }
  body.querySelector('button,input,select,a')?.focus();
}
