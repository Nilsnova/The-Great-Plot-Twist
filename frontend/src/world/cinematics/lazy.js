// Fetches finale rendering only on demand; releases the loading lock before the shot starts.
import {cinematicNames} from './logic.js';
export function createLazyCinematics(ctx) {
  let controller=null,pending=null,disposed=false,generation=0;
  function cancelLoad(){if(!pending)return;clearTimeout(pending.timer);pending.resolve(false);pending=null;generation++;}
  function play(name,params={}) {
    if(disposed||pending||ctx.world.busy||!cinematicNames.includes(name))return Promise.resolve(false);
    if(controller)return controller.play(name,params);
    const token=++generation;ctx.resetInput?.();ctx.caption?.('Preparing the coastal scene · Escape to skip');
    return new Promise(resolve=>{
      pending={resolve,timer:setTimeout(cancelLoad,3000)};
      import('./controller.js').then(module=>{
        if(disposed||token!==generation)return;
        clearTimeout(pending.timer);pending=null;
        controller=module.createCinematics({...ctx,on:()=>()=>{}});
        resolve(controller.play(name,params));
      }).catch(()=>{if(token===generation)cancelLoad();});
    });
  }
  const key=event=>{if(pending&&event.code==='Escape'){event.preventDefault();event.stopImmediatePropagation();cancelLoad();ctx.resetInput?.();}};
  window.addEventListener('keydown',key,true);
  const stop=ctx.on('finale',event=>{if(cinematicNames.includes(event.stage))play(event.stage);});
  return {get active(){return !!pending||!!controller?.active;},play,
    skip(){cancelLoad();controller?.skip();ctx.resetInput?.();},update(dt,options){controller?.update(dt,options);},
    dispose(){if(disposed)return;disposed=true;window.removeEventListener('keydown',key,true);stop();cancelLoad();controller?.dispose();controller=null;}};
}
