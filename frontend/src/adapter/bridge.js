// Lazy presentation bridge. The caller owns one adapter; Claude can inject the real transport later.
import {createUnavailableCaseAdapter} from './unavailable.js';
export function createCaseBridge(ctx) {
  let adapter=ctx.adapter??null,host=null,pending=null,disposed=false,loading=false,stop=null;
  async function ensure() {
    if(host)return host;if(pending)return pending;loading=true;
    pending=(async()=>{
      if(!adapter){const local=import.meta.env.DEV&&new URLSearchParams(location.search).get('case')==='local';adapter=local?(await import('./fake/index.js')).createFakeCaseAdapter():createUnavailableCaseAdapter();}
      const {createCaseScreens}=await import('../screens/controller.js');if(disposed){adapter.dispose?.();return null;}
      host=createCaseScreens({...ctx,adapter,beforeOpen:ctx.beforeOpen});ctx.onView?.(adapter.read());return host;
    })().finally(()=>{loading=false;});return pending;
  }
  if(adapter)ctx.onView?.(adapter.read());
  return {get active(){return loading||!!host?.active;},get adapter(){return adapter;},
    async open(name,params){const view=await ensure();if(!disposed){ctx.beforeOpen?.();await view?.open(name,params);}},
    async completeIntro(receipt){const view=await ensure();if(!disposed){const element=await view?.completeIntro(receipt);if(element)ctx.onArrival?.(element);}},
    tick(dt){host?.tick(dt);},
    async useAdapter(next){host?.dispose();adapter?.dispose?.();adapter=next;host=null;pending=null;await ensure();},
    close(){host?.close();},
    dispose(){if(disposed)return;disposed=true;stop?.();host?.dispose();adapter?.dispose?.();},
  };
}
