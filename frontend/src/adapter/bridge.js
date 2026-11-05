// One adapter and a cancellable lazy presentation host. No case rule or transport lives here.
import {caseScreenFor} from '../world/places/case-spots.js';
import {createUnavailableCaseAdapter} from './unavailable.js';
export function createCaseBridge(ctx) {
  let adapter=ctx.adapter??null,host=null,pending=null,disposed=false,loading=false,request=0,effectTask=Promise.resolve(),effectId=0;
  const status=document.createElement('p');status.className='case-loading';status.setAttribute('role','status');status.hidden=true;ctx.container.append(status);
  function onView(view){ctx.onView?.(view);const effects=(view.effects??[]).filter(item=>item.id>effectId);if(effects.length)effectId=Math.max(...effects.map(item=>item.id));if(!ctx.world?.cinematic)return;
    effectTask=effectTask.then(async()=>{const token=request,resume=host?.active?host.screenName:null;for(const item of effects){if(disposed||token!==request)return;host?.close();loading=false;status.hidden=true;await ctx.world.cinematic(item.name,item.params);}if(!disposed&&token===request&&resume&&effects.length)await host?.open(resume);}).catch(()=>{});
  }
  async function ensure(){
    if(host)return host;if(pending)return pending;
    pending=(async()=>{
      if(!adapter){const local=import.meta.env.DEV&&new URLSearchParams(location.search).get('case')==='local';adapter=local?(await import('./fake/index.js')).createFakeCaseAdapter():createUnavailableCaseAdapter();}
      const {createCaseScreens}=await import('../screens/controller.js');if(disposed){adapter.dispose?.();return null;}
      host=createCaseScreens({...ctx,adapter,onView});return host;
    })().catch(error=>{pending=null;throw error;});return pending;
  }
  function close(){request++;loading=false;status.hidden=true;host?.close();ctx.resetInput?.();}
  const key=event=>{if(loading&&event.code==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();ctx.focus?.();}};window.addEventListener('keydown',key,true);
  if(adapter)ctx.onView?.(adapter.read());
  return {get active(){return loading||!!host?.active;},get adapter(){return adapter;},
    async open(name,params){const token=++request;loading=true;status.hidden=false;status.textContent='Opening the case · Escape to cancel';ctx.resetInput?.();try{const view=await ensure();if(disposed||token!==request)return;ctx.beforeOpen?.();await view?.open(name,params);}catch{if(!disposed&&token===request){status.textContent='The case screen could not load. Try opening it again.';setTimeout(()=>{if(!disposed&&token===request)status.hidden=true;},4000);}}finally{if(token===request){loading=false;if(host?.active)status.hidden=true;}}},
    async completeIntro(receipt){try{const view=await ensure();if(!disposed){const element=await view?.completeIntro(receipt);if(element)ctx.onArrival?.(element);}}catch{if(!disposed){status.hidden=false;status.textContent='Your intro is saved locally. Open Crew to retry the case connection.';}}},
    tick(dt){host?.tick(dt);},
    interact(event){const target=caseScreenFor(event);if(target)return this.open(target.screen,{spot:target.spot});},close,
    dispose(){if(disposed)return;disposed=true;close();window.removeEventListener('keydown',key,true);status.remove();host?.dispose();adapter?.dispose?.();},
  };
}
