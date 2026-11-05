// Owns title/pause focus and delegates play/continue. A2 can replace resume through the supplied hook.
import {createModal} from '../ui/kit/modal.js';
import {node} from '../ui/kit/dom.js';
import {hasLocalIntro,shellTransition} from './logic.js';
import {credits,menuButton,pixelLogo} from './screens.js';
export function createShell(ctx) {
  let mode='title',returnTo='title',disposed=false;
  const modal=createModal({title:'The Great Plot Twist',onCancel(){if(mode==='pause')play();else if(mode!=='title')show(returnTo);}});
  modal.element.classList.add('shell-screen');
  function play() {mode='playing';modal.close();ctx.resetInput();ctx.onState(mode);ctx.focus();}
  function start(resume) {play();ctx.onPlay(resume);}
  function page(name) {returnTo=mode==='pause'?'pause':'title';show(name);}
  function show(next) {
    if(disposed)return;mode=shellTransition(mode,next);ctx.resetInput();ctx.onState(mode);
    modal.element.dataset.mode=mode;
    const body=node('div','shell-body'),nav=node('nav','shell-menu');nav.setAttribute('aria-label','Game menu');
    if(mode==='title') {
      modal.setTitle('The Great Plot Twist');body.append(pixelLogo(),node('p','shell-kicker','THE SALTREACH ISLES'),node('p','shell-copy','A quiet coast. An unfinished story.'));
      const fresh=menuButton('New game',()=>start(false)),resume=menuButton('Continue',()=>start(true));fresh.id='new-game';
      resume.disabled=!hasLocalIntro(ctx.readSave());nav.append(fresh,resume,menuButton('Settings',()=>page('settings'),true),menuButton('Credits',()=>page('credits'),true));
      if(ctx.demo)nav.append(menuButton('Highlights tour',()=>{play();ctx.onDemo();},true));
      body.append(nav,node('p','shell-note','Continue uses this browser’s intro save.'));
    } else if(mode==='pause') {
      modal.setTitle('A moment ashore');nav.append(menuButton('Resume',play),menuButton('Settings',()=>page('settings'),true),menuButton('Credits',()=>page('credits'),true),menuButton('Return to title',()=>show('title'),true));body.append(nav);
    } else {
      modal.setTitle(mode==='credits'?'Made together':'Settings');body.append(mode==='credits'?credits():ctx.settingsView?.()??node('p','','Settings are being prepared.'),menuButton('Back',()=>show(returnTo),true));
    }
    modal.setContent(body);modal.open(ctx.container);body.querySelector('button,input,select,a')?.focus();
  }
  const key=event=>{
    if(event.code!=='Escape'||event.repeat||mode!=='playing'||ctx.hasOverlay())return;
    event.preventDefault();event.stopImmediatePropagation();show('pause');
  };
  window.addEventListener('keydown',key,true);show('title');
  return {get mode(){return mode;},get blocked(){return mode!=='playing';},show,play,
    openSettings(){returnTo=mode==='playing'?'pause':mode;show('settings');},
    dispose(){disposed=true;window.removeEventListener('keydown',key,true);modal.dispose();}};
}
