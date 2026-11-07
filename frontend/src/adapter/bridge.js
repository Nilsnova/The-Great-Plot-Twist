// One adapter and a cancellable lazy presentation host. No case rule or transport lives here.
import {caseScreenFor} from '../world/places/case-spots.js';
import {createUnavailableCaseAdapter} from './unavailable.js';
export function createCaseBridge(ctx) {
  const ownsAdapter=!ctx.adapter;
  let adapter=ctx.adapter??null,host=null,pending=null,disposed=false,loading=false,opening=null,request=0,effectTask=Promise.resolve(),effectId=0,stop=null;
  const status=document.createElement('p');status.className='case-loading';status.setAttribute('role','status');status.hidden=true;ctx.container.append(status);
  // Queue new server-requested shots so view delivery stays responsive and effects keep their order.
  function onView(view) {
    ctx.onView?.(view);
    if(view.bulletin?.status==='off'&&opening?.name==='bulletin'&&opening.token===request){clearOpening();ctx.resetInput?.();}
    const effects = (view.effects ?? []).filter(item => item.id > effectId);
    if (effects.length) effectId = Math.max(...effects.map(item => item.id));
    if (!ctx.world?.cinematic) return;

    effectTask = effectTask.then(async () => {
      const token = request;
      const screenToResume = host?.active ? host.screenName : null;
      for (const effect of effects) {
        if (disposed || token !== request) return;
        host?.close();
        loading = false;
        status.hidden = true;
        await ctx.world.cinematic(effect.name, effect.params);
      }
      if (!disposed && token === request && screenToResume && effects.length) {
        await host?.open(screenToResume);
      }
    }).catch(() => {});
  }
  function connect(){if(!adapter||stop)return;stop=adapter.subscribe(event=>onView(event.view));onView(adapter.read());}
  // Build the host on first use so title startup stays free of panel code.
  async function ensure(){
    if (host) return host;
    if (pending) return pending;

    pending = (async () => {
      if (!adapter) {
        const localRehearsal = import.meta.env.DEV && new URLSearchParams(location.search).get('case') === 'local';
        adapter = localRehearsal
          ? (await import('./fake/index.js')).createFakeCaseAdapter()
          : createUnavailableCaseAdapter();
      }
      connect();
      const { createCaseScreens } = await import('../screens/controller.js');
      if (disposed) {
        if (ownsAdapter) adapter.dispose?.();
        return null;
      }
      host = createCaseScreens({ ...ctx, adapter, onView: null });
      return host;
    })().catch(error => {
      pending = null;
      throw error;
    });
    return pending;
  }
  function clearOpening(){request++;opening=null;loading=false;status.hidden=true;}
  function close(){clearOpening();host?.close();ctx.resetInput?.();}
  const key=event=>{if(loading&&event.code==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();ctx.focus?.();}};window.addEventListener('keydown',key,true);
  if(adapter)connect();
  return {get active(){return loading||!!host?.active;},get adapter(){return adapter;},
    // Token each open so Escape or a newer request can invalidate a pending import.
    async open(name, params) {
      if(disposed||(name==='bulletin'&&adapter?.read().bulletin?.status==='off'))return;
      const token = ++request;
      opening = {name,token};
      loading = true;
      status.hidden = false;
      status.textContent = 'Opening the case · Escape to cancel';
      ctx.resetInput?.();
      let failed = false;
      try {
        const view = await ensure();
        if (disposed || token !== request) return;
        if(name==='bulletin'&&adapter.read().bulletin?.status==='off')return;
        ctx.beforeOpen?.();
        if (disposed || token !== request) return;
        await view?.open(name, params);
      } catch {
        if (!disposed && token === request) {
          failed = true;
          status.textContent = 'The case screen could not load. Try opening it again.';
          setTimeout(() => {
            if (!disposed && token === request) status.hidden = true;
          }, 4000);
        }
      } finally {
        if (token === request) {
          opening = null;
          loading = false;
          if (!failed) status.hidden = true;
        }
      }
    },
    async completeIntro(receipt){try{const view=await ensure();if(!disposed){const element=await view?.completeIntro(receipt);if(element)ctx.onArrival?.(element,adapter.read());}}catch{if(!disposed){status.hidden=false;status.textContent='Your intro is saved locally. Open Crew to retry the case connection.';}}},
    tick(dt){if(host)host.tick(dt);else adapter?.tick?.(dt);},
    interact(event){const target=caseScreenFor(event);if(target)return this.open(target.screen,{spot:target.spot});},close,
    dispose(){if(disposed)return;disposed=true;close();window.removeEventListener('keydown',key,true);status.remove();stop?.();host?.dispose();if(ownsAdapter)adapter?.dispose?.();},
  };
}
