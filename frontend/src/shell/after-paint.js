// Background title services start after the title's first paint: the projector join link, title
// input and the connection banner.
import {startTitleInput} from './title-input.js';
import {rememberJoin} from '../front-door/logic.js';
import {createConnectionBanner} from '../ui/connection-banner.js';

export function startAfterPaint(ctx) {
  let disposed=false;
  // A projector QR (?join=K7QXM) opens the Join page with the code filled in, so a wrong or old
  // code gets its message and the player can type it again before the game starts.
  if(rememberJoin()&&ctx.shell?.()?.mode==='title')ctx.shell().show('join');
  const titleInput=startTitleInput({adapter:ctx.adapter,isLoading:ctx.isLoading,hasRuntime:()=>!!ctx.runtime()});
  const banner=createConnectionBanner({send:ctx.send});
  ctx.container.append(banner.element);banner.update(ctx.adapter.read());
  const stop=ctx.adapter.subscribe(event=>banner.update(event.view));
  return {dispose(){
    if(disposed)return;disposed=true;
    stop();titleInput.dispose();banner.dispose();
  }};
}
