// Owns title/pause focus and delegates play/continue. A2 can replace resume through the supplied hook.
import {createModal} from '../ui/kit/modal.js';
import {node} from '../ui/kit/dom.js';
import {hasLocalIntro,shellTransition} from './logic.js';
import {menuButton,pixelLogo} from './screens.js';
// Keep the same explanation on initial render and subsequent account updates.
const introNote=account=>account?.hasKit?'New game restarts the local intro. Captain and kit stay.':'Continue uses cloud when signed in, or the local intro.';
export function createShell(ctx) {
  let mode='title',returnTo='title',disposed=false,request=0,resumeControl=null,freshNote=null;
  const modal=createModal({title:'The Great Plot Twist',onClose(){if(mode==='playing'&&!ctx.hasOverlay())ctx.focus();},onCancel(){if(mode==='pause')play();else if(mode!=='title')back();}});
  modal.element.classList.add('shell-screen');
  function play() {mode='playing';modal.close();ctx.resetInput();ctx.onState(mode);ctx.focus();}
  function start(resume) {play();ctx.onPlay(resume);}
  function page(name) {returnTo=mode==='pause'?'pause':'title';show(name);}
  function back(){show(mode==='credits'?'settings':returnTo);}
  function show(next) {
    if(disposed)return;const token=++request;mode=shellTransition(mode,next);ctx.resetInput();ctx.onState(mode);
    modal.element.dataset.mode=mode;
    const body=node('div','shell-body'),nav=node('nav','shell-menu');nav.setAttribute('aria-label','Game menu');
    if(mode==='title') {
      modal.setTitle('The Great Plot Twist');body.append(pixelLogo(),node('p','shell-kicker','THE SALTREACH ISLES'),node('p','shell-copy','A quiet coast. An unfinished story.'));
      const fresh=menuButton('New game',()=>start(false)),resume=menuButton('Continue',()=>start(true));fresh.id='new-game';
      resumeControl=resume;resume.disabled=!(hasLocalIntro(ctx.readSave())||ctx.readAccount?.().canContinue);nav.append(fresh,resume,menuButton('Settings',()=>page('settings'),true));
      if(ctx.demo)nav.append(menuButton('Highlights tour',()=>{play();ctx.onDemo();},true));
      freshNote=node('p','shell-note',introNote(ctx.readAccount?.()));body.append(nav);if(ctx.accountSummary)body.append(ctx.accountSummary);body.append(freshNote);
    } else if(mode==='pause') {
      modal.setTitle('A moment ashore');nav.append(menuButton('Resume',play),menuButton('Settings',()=>page('settings'),true),menuButton('Return to title',()=>show('title'),true));if(ctx.openAccount)nav.append(menuButton('Account and saves',ctx.openAccount,true));body.append(nav);
    } else {
      modal.setTitle(mode==='credits'?'Made together':'Settings');
      if(mode==='credits')import('./credits.js').then(module=>{if(!disposed&&token===request)body.append(module.credits());});
      else {const loading=node('p','','Opening settings…');loading.setAttribute('role','status');body.append(loading);Promise.resolve(ctx.settingsView?.()).then(element=>{if(!disposed&&token===request&&mode==='settings'&&element)loading.replaceWith(element);}).catch(()=>{if(token===request)loading.textContent='Settings could not load. Go back and try again.';});}
      if(mode==='settings')body.append(menuButton('Credits',()=>show('credits'),true));
      body.append(menuButton('Back',back,true));
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
  return {setAccount(account){if(mode==='title'){if(resumeControl)resumeControl.disabled=!(hasLocalIntro(ctx.readSave())||account.canContinue);if(freshNote)freshNote.textContent=introNote(account);}},notice(text){const message=node('p','shell-note',text);message.setAttribute('role','alert');modal.body.append(message);},get mode(){return mode;},get blocked(){return mode!=='playing';},show,play,
    openSettings(){returnTo=mode==='playing'?'pause':mode;show('settings');},
    dispose(){disposed=true;window.removeEventListener('keydown',key,true);modal.dispose();}};
}
