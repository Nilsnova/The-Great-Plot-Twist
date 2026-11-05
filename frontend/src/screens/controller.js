// One case modal. Views receive snapshots and intent callbacks, never a transport or game rules.
import './screens.css';
import {createModal} from '../ui/kit/modal.js';
import {node,button} from './helpers.js';
import {createArrivalScreen} from './arrival.js';
import {createCrewScreen} from './crew.js';
const titles={arrival:'Keep your story',crew:'Your crew',board:'The Captain’s Table',search:'Search the coast',partners:'Partner orders',finale:'The Night of Three Lights',accusation:'Aboard the schooner',reveal:'The reveal',relighting:'The coast relit'};
export function createCaseScreens(ctx) {
  const body=node('div','case-screen-body'),nav=node('nav','case-nav'),content=node('div','case-screen-content'),notice=node('p','case-notice');notice.setAttribute('role','status');nav.setAttribute('aria-label','Case screens');body.append(nav,notice,content);
  const modal=createModal({title:titles.crew,body,onCancel:close,onClose(){if(!ctx.hasOtherOverlay?.())ctx.focus?.();}});modal.element.classList.add('case-modal');
  let active=false,disposed=false,current='crew',view=ctx.adapter.read(),revision=-1,busy=false;
  const screens=new Map(),arrival=createArrivalScreen({navigate:open});
  screens.set('crew',createCrewScreen({send,navigate:open}));
  async function screen(name){if(name==='arrival')return arrival;if(screens.has(name))return screens.get(name);const unavailable={element:node('p','','This case screen is being prepared.'),update(){},tick(){},dispose(){this.element.remove();}};screens.set(name,unavailable);return unavailable;}
  function update(event){view=event?.view??ctx.adapter.read();if(view.revision!==revision||revision===-1)arrival.update(view);ctx.onView?.(view);notice.textContent=view.notice?.message??'';notice.hidden=!notice.textContent;
    if(active&&view.revision!==revision){revision=view.revision;screens.get(current)?.update(view);}screens.get(current)?.tick?.(view);}
  async function send(name,...args){if(busy)return;busy=true;try{const result=await ctx.adapter[name](...args);update({view:result.view});return result;}catch{notice.hidden=false;notice.textContent='The case service could not answer. Your screen is unchanged. Please try again.';}finally{busy=false;}}
  async function open(name='crew'){if(disposed)return;current=name;const selected=await screen(name);if(disposed)return;active=true;ctx.resetInput?.();modal.setTitle(titles[name]??'Case');
    nav.replaceChildren(...['crew','board','search','partners','finale','accusation','relighting'].map(id=>button(titles[id],()=>open(id),{quiet:true,focus:`case-nav-${id}`})));
    content.replaceChildren(selected.element);revision=view.revision;selected.update(view);modal.open(ctx.container);content.querySelector('button:not(:disabled),input,select')?.focus();}
  function close(){active=false;ctx.resetInput?.();modal.close();}
  const stop=ctx.adapter.subscribe(update);update();
  return {get active(){return active;},get view(){return view;},open,close,send,arrival:arrival.element,
    async completeIntro(receipt){await send('completeIntro',receipt);return arrival.element;},
    tick(dt){ctx.adapter.tick?.(dt);screens.get(current)?.tick?.(view);},
    dispose(){if(disposed)return;disposed=true;stop();close();for(const item of screens.values())item.dispose();arrival.dispose();modal.dispose();}};
}
