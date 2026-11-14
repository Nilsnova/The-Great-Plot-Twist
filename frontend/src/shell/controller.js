// Owns title/pause focus. Play and Join are the title's two actions; main.js decides what Play starts. A2 can replace resume through the supplied hook.
import {createModal} from '../ui/kit/modal.js';
import {node} from '../ui/kit/dom.js';
import {shellTransition} from './logic.js';
import {menuButton,titleEmblem} from './screens.js';
export function createShell(ctx) {
  let mode='title',returnTo='title',disposed=false,request=0;
  const modal=createModal({title:'The Great Plot Twist',onClose(){if(mode==='playing'&&!ctx.hasOverlay())ctx.focus();},onCancel(){if(mode==='pause')play();else if(mode!=='title')back();}});
  modal.element.classList.add('shell-screen');
  function play() {request++;mode='playing';modal.close();ctx.resetInput();ctx.onState(mode);ctx.focus();}
  function start(resume) {play();ctx.onPlay(resume);}
  function page(name) {returnTo=mode==='pause'?'pause':'title';show(name);}
  function back(){show(mode==='credits'?'settings':returnTo);}
  function show(next) {
    if(disposed)return;const token=++request;mode=shellTransition(mode,next);ctx.resetInput();ctx.onState(mode);
    modal.element.dataset.mode=mode;
    const body=node('div','shell-body'),nav=node('nav','shell-menu');nav.setAttribute('aria-label','Game menu');
    if(mode==='title') {
      modal.setTitle('The Great Plot Twist');body.append(titleEmblem(),node('p','shell-kicker','BUILD · TRADE · DEFEND'),node('p','shell-copy','Build your island, trade at the harbor and hold the coast against the pirates.'));
      const go=menuButton('Play',()=>{play();ctx.onStart?.();});go.id='play';nav.append(go,menuButton('Join',()=>page('join'),true));
      const more=menuButton('Settings',()=>page('settings'),true);more.classList.add('shell-more');body.append(nav,more);
    } else {
      modal.setTitle(({pause:'A moment ashore',credits:'Made together',join:'Join',invite:'Join your friend'})[mode]??'Settings');
      const loading=node('p','','Loading…');loading.setAttribute('role','status');body.append(loading);
      const isCurrent=()=>!disposed&&token===request;
      import('./subpages.js').then(({fillSubpage})=>{if(isCurrent())return fillSubpage({mode,body,nav,ctx,isCurrent,play,page,show,back});})
        .catch(()=>{if(isCurrent())body.replaceChildren(menuButton(mode==='pause'?'Resume':'Back',mode==='pause'?play:back));});
    }
    modal.setContent(body);modal.open(ctx.container);body.querySelector('button,input,select,a')?.focus();
  }
  const key=event=>{
    if(event.code!=='Escape'||event.repeat||mode!=='playing')return;
    if(ctx.onEscape?.()){event.preventDefault();event.stopImmediatePropagation();return;}
    if(ctx.hasOverlay())return;
    event.preventDefault();event.stopImmediatePropagation();show('pause');
  };
  window.addEventListener('keydown',key,true);show('title');
  return {notice(text){const message=node('p','shell-note',text);message.setAttribute('role','alert');modal.body.append(message);},get mode(){return mode;},get blocked(){return mode!=='playing';},show,play,
    openSettings(){returnTo=mode==='playing'?'pause':mode;show('settings');},
    dispose(){disposed=true;window.removeEventListener('keydown',key,true);modal.dispose();}};
}
