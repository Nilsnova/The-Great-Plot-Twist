// Background title services and the shared ring owner start after the title's first paint.
import {startTitleInput} from './title-input.js';
import {rememberJoin} from '../front-door/logic.js';
import {loadFestivalModule} from './world-loader.js';
import {createConnectionBanner} from '../ui/connection-banner.js';
import {session as defaultSession} from '../online/session.js';
import {createArenaEntry} from '../online/arena-entry.js';
import {claimPanelEntry,releasePanelEntry} from '../online/panel-services.js';

export function startAfterPaint(ctx) {
  let disposed=false,entry=null,closed=false;
  // A projector QR (?join=K7QXM) opens the Join page with the code filled in, so a wrong or old
  // code gets its message and the player can type it again before the game starts.
  if(rememberJoin()&&ctx.shell?.()?.mode==='title')ctx.shell().show('join');
  const session=ctx.session??defaultSession;
  const arena=claimPanelEntry(session,'arena',()=>createArenaEntry({session,container:ctx.container,
    focus:ctx.focus,resetInput:()=>ctx.runtime?.()?.resetInput?.(),notify:ctx.caption,
    onSignIn:()=>{arena?.close();ctx.openAccount?.();}}));
  function releaseArena(){arena?.dispose();releasePanelEntry(session,'arena',arena);}
  const festivalEntry={
    get available(){return !closed&&entry?.available===true;},
    get active(){return !closed&&(entry?.active===true||arena?.active===true);},
    check:(...args)=>closed?false:entry?.check(...args)??false,
    open:(...args)=>closed?undefined:entry?.open(...args),
    close(){if(!closed){entry?.close();arena?.close();}},
    openAccount(){if(!closed)ctx.openAccount?.();},
    dispose(){if(closed)return;closed=true;entry?.dispose();entry=null;releaseArena();},
  };
  const dialogClosed=event=>{
    const element=event.target;
    if(!element?.open&&element?.matches?.('.duel-modal')
      &&ctx.container.querySelector('.duel-modal')===element&&arena?.pending)arena.close();
  };
  ctx.container.addEventListener('close',dialogClosed,true);
  const key=event=>{
    if(disposed||event.defaultPrevented||event.repeat||event.code!=='Escape'||!arena?.pending
      ||ctx.container.querySelector('.duel-modal[open]'))return;
    event.preventDefault();event.stopImmediatePropagation();arena.close();
    ctx.runtime?.()?.resetInput?.();ctx.focus?.();
  };
  window.addEventListener('keydown',key,true);
  const titleInput=startTitleInput({adapter:ctx.adapter,isLoading:ctx.isLoading,hasRuntime:()=>!!ctx.runtime()});
  const banner=createConnectionBanner({send:ctx.send});
  ctx.container.append(banner.element);banner.update(ctx.adapter.read());
  const stop=ctx.adapter.subscribe(event=>banner.update(event.view));
  const festivalReady=loadFestivalModule().then(module=>{
    if(disposed||ctx.isDisposed())return null;
    const next=module.createFestivalEntry({...ctx,openDuel:id=>void arena?.open(id)});
    if(disposed||closed||ctx.isDisposed()){next.dispose();return null;}
    entry=next;return festivalEntry;
  }).catch(()=>disposed?null:festivalEntry);
  return {festivalReady,dispose(){
    if(disposed)return;disposed=true;window.removeEventListener('keydown',key,true);
    ctx.container.removeEventListener('close',dialogClosed,true);
    stop();titleInput.dispose();banner.dispose();festivalEntry.dispose();releaseArena();
  }};
}
