// Background title services and private account navigation start only after the first paint.
import {startTitleInput} from './title-input.js';
import {loadFestivalModule} from './world-loader.js';
import {createConnectionBanner} from '../ui/connection-banner.js';

export function startAfterPaint(ctx) {
  let disposed=false,entry=null,closed=false;
  const festivalEntry={
    get available(){return !closed&&entry?.available===true;},
    get active(){return !closed&&entry?.active===true;},
    check:(...args)=>closed?false:entry?.check(...args)??false,
    open:(...args)=>closed?undefined:entry?.open(...args),
    close(){if(!closed)entry?.close();},
    openAccount(){if(!closed)ctx.openAccount?.();},
    dispose(){if(closed)return;closed=true;entry?.dispose();entry=null;},
  };
  const titleInput=startTitleInput({adapter:ctx.adapter,isLoading:ctx.isLoading,hasRuntime:()=>!!ctx.runtime()});
  const banner=createConnectionBanner({send:ctx.send});
  ctx.container.append(banner.element);banner.update(ctx.adapter.read());
  const stop=ctx.adapter.subscribe(event=>banner.update(event.view));
  const festivalReady=loadFestivalModule().then(module=>{
    if(disposed||ctx.isDisposed())return null;
    const next=module.createFestivalEntry(ctx);
    if(disposed||closed||ctx.isDisposed()){next.dispose();return null;}
    entry=next;return festivalEntry;
  }).catch(()=>disposed?null:festivalEntry);
  return {festivalReady,dispose(){
    if(disposed)return;disposed=true;stop();titleInput.dispose();banner.dispose();festivalEntry.dispose();
  }};
}
