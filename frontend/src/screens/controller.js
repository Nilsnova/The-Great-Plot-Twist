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
  let active=false,disposed=false,current='crew',view=ctx.adapter.read(),revision=-1,arrivalRevision=-1,openRequest=0,busy=false;
  const screens=new Map(),arrival=createArrivalScreen({navigate:open});
  screens.set('crew',createCrewScreen({send,navigate:open}));
  async function screen(name){if(['accusation','reveal'].includes(name)){if(!screens.has(name)){const module=name==='reveal'?await import('./reveal.js'):await import('./accusation.js');screens.set(name,(module.createRevealScreen??module.createAccusationScreen)({send,navigate:open}));}return screens.get(name);}if(name==='finale'){if(!screens.has(name)){const {createFinaleScreen}=await import('./finale.js');screens.set(name,createFinaleScreen({send,navigate:open}));}return screens.get(name);}if(name==='arrival')return arrival;if(screens.has(name))return screens.get(name);if(['search','partners'].includes(name)){const module=name==='search'?await import('./search.js'):await import('./partners.js');const view=(module.createSearchScreen??module.createPartnersScreen)({send});screens.set(name,view);return view;}if(name==='board'){const {createBoardScreen}=await import('./board.js');const board=createBoardScreen({send});screens.set(name,board);return board;}const unavailable={element:node('p','','This case screen is being prepared.'),update(){},tick(){},dispose(){this.element.remove();}};screens.set(name,unavailable);return unavailable;}
  function update(event){view=event?.view??ctx.adapter.read();if(view.revision!==arrivalRevision){arrivalRevision=view.revision;arrival.update(view);}ctx.onView?.(view);notice.textContent=view.notice?.message??'';notice.hidden=!notice.textContent;
    if(active&&view.revision!==revision){revision=view.revision;screens.get(current)?.update(view);}screens.get(current)?.tick?.(view);}
  async function send(name,...args){if(busy)return;busy=true;try{const result=await ctx.adapter[name](...args);if(disposed)return result;update({view:result.view});return result;}catch{notice.hidden=false;notice.textContent='The case service could not answer. Your screen is unchanged. Please try again.';}finally{busy=false;}}
  async function open(name='crew',params={}){const token=++openRequest;if(name==='search'&&params.spot)await send('inspectSpot',params.spot);if(disposed||token!==openRequest)return;current=name;const selected=await screen(name);if(disposed||token!==openRequest)return;active=true;ctx.resetInput?.();modal.setTitle(titles[name]??'Case');
    nav.replaceChildren(...['crew','board','search','partners','finale','accusation','relighting'].map(id=>button(({crew:'Crew',board:'Board',search:'Search',partners:'Partners',finale:'Night',accusation:'Schooner',relighting:'Coast'})[id],()=>open(id),{quiet:true,focus:`case-nav-${id}`})));
    content.replaceChildren(selected.element);revision=view.revision;selected.update(view);modal.open(ctx.container);content.querySelector('button:not(:disabled),input,select')?.focus();}
  function close(){openRequest++;active=false;ctx.resetInput?.();modal.close();}
  const stop=ctx.adapter.subscribe(update);update();
  return {get active(){return active;},get screenName(){return current;},get view(){return view;},open,close,send,arrival:arrival.element,
    async completeIntro(receipt){await send('completeIntro',receipt);return arrival.element;},
    tick(dt){ctx.adapter.tick?.(dt);screens.get(current)?.tick?.(view);},
    dispose(){if(disposed)return;disposed=true;stop();close();for(const item of screens.values())item.dispose();arrival.dispose();modal.dispose();}};
}
