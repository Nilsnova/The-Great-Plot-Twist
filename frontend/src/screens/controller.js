// One case modal. Views receive snapshots and intent callbacks, never a transport or game rules.
import './screens.css';
import {emit} from '../core/events.js';
import {getPreferences,setPreferences} from '../settings/preferences.js';
import {sendCaseIntent} from '../adapter/intent.js';
import {createServerCallState} from '../ui/kit/server-call-state.js';
import {createModal} from '../ui/kit/modal.js';
import {node,button} from './helpers.js';
import {syncIntentCooldown} from '../ui/kit/intent-cooldown.js';
import {createConnectionBanner} from '../ui/connection-banner.js';
import {createArrivalScreen} from './arrival.js';
import {createCrewScreen} from './crew.js';
const titles={arrival:'Keep your story',crew:'Your crew',board:'The Captain’s Table',search:'Search the coast',partners:'Partner orders',finale:'The Night of Three Lights',accusation:'Aboard the schooner',reveal:'The reveal',relighting:'The coast relit',rewards:'Your voyage',log:'Captain’s Log',hints:'What next?',bulletin:'Harbor bulletin'};
// Peer movement does not redraw hidden pages; changed account or crew display data clears them.
function privateScreenKey(view){
  const crew=view.crew,seats=Array.isArray(crew?.seats)?crew.seats:[];
  return JSON.stringify([view.mode,view.account?.state,view.account?.hasKit===true,
    crew?.code,crew?.status,crew?.mySeat,seats.map(seat=>[seat.seat,seat.kind,seat.name,
      seat.kit?.id,seat.kit?.name,seat.isYou,seat.archetype])]);
}
export function createCaseScreens(ctx) {
  const body=node('div','case-screen-body'),nav=node('nav','case-nav'),content=node('div','case-screen-content'),notice=node('p','case-notice');notice.setAttribute('role','status');nav.setAttribute('aria-label','Case screens');
  const modal=createModal({title:titles.crew,body,onCancel:close,onClose(){if(!ctx.hasOtherOverlay?.())ctx.focus?.();}});modal.element.classList.add('case-modal');
  let active=false,disposed=false,current='crew',view=ctx.adapter.read(),revision=-1,openRequest=0,busy=false,noticeAfterRevision=-1,localFailure=null;
  let lastIntent=null,callRequest=0,lastArrivalReceipt=null,lastArrivalRefusal=null,refusedFocus=null;
  let cachedPrivate=null,lastIsletFailure='',isletDisplayRequest=0,sendGeneration=0;
  const callClock=typeof ctx.now==='function'?ctx.now:Date.now;
  function isletCallOptions(name,result){
    const failure=view.finale?.isletFailure;
    if(name!=='buildLight'||result?.reason!=='rate_limited'||failure?.reason!=='rate_limited'
      ||!Number.isFinite(failure.retryUntil))return undefined;
    return {retryAfterMs:Math.min(86400000,Math.max(0,failure.retryUntil-callClock()))};
  }
  function heldIsletLimit(){
    const failure=view.finale?.isletFailure;
    return failure?.reason==='rate_limited'&&Number.isFinite(failure.retryUntil)
      &&failure.retryUntil>callClock()?failure:null;
  }
  const syncCooldown=()=>syncIntentCooldown(content,refusedFocus,call.read().remaining);
  const connection=createConnectionBanner({inline:true,send:(...args)=>sendCaseIntent(ctx.adapter,...args)});
  const call=createServerCallState({messageElement:notice,label:'case action',onRetry:()=>lastIntent&&send(...lastIntent),onSignIn:()=>send('signIn'),onChange:()=>syncCooldown()});body.append(nav,connection.element,call.element,content);
  const screens=new Map(),arrival=createArrivalScreen({navigate:open,onRetry:()=>lastArrivalReceipt&&send('completeIntro',lastArrivalReceipt),onSignIn:async()=>{const receipt=lastArrivalReceipt,claim=lastArrivalRefusal==='sign_in_required';const result=await send('signIn');if(result?.accepted&&result.view?.account?.state==='signed_in'){if(claim&&receipt&&receipt===lastArrivalReceipt)await send('completeIntro',receipt);else arrival.setResult({accepted:false,reason:'not_connected',message:'Signed in. Retry arrival confirmation.'});}}});
  screens.set('crew',createCrewScreen({send,navigate:open,openIslet:ctx.openIslet}));
  async function screen(name){if(name==='bulletin'){if(!screens.has(name)){const {createBulletinScreen}=await import('./bulletin/index.js');if(disposed)return null;screens.set(name,createBulletinScreen({send,navigate:open}));}return screens.get(name);}if(['rewards','log','hints'].includes(name)){if(!screens.has(name)){const module=name==='rewards'?await import('./rewards/index.js'):name==='log'?await import('./log/index.js'):await import('../shell/hints/index.js');if(disposed)return null;const component=(module.createRewardsScreen??module.createLogScreen??module.createHints)({send,navigate:open,preferences:getPreferences(),onPreferences:setPreferences});screens.set(name,component);}return screens.get(name);}if(name==='relighting'){if(!screens.has(name)){const {createRelightingScreen}=await import('./relighting.js');if(disposed)return null;screens.set(name,createRelightingScreen({send}));}return screens.get(name);}if(['accusation','reveal'].includes(name)){if(!screens.has(name)){const module=name==='reveal'?await import('./reveal.js'):await import('./accusation.js');if(disposed)return null;screens.set(name,(module.createRevealScreen??module.createAccusationScreen)({send,navigate:open}));}return screens.get(name);}if(name==='finale'){if(!screens.has(name)){const {createFinaleScreen}=await import('./finale.js');if(disposed)return null;screens.set(name,createFinaleScreen({send,navigate:open,openIslet:ctx.openIslet}));}return screens.get(name);}if(name==='arrival')return arrival;if(screens.has(name))return screens.get(name);if(['search','partners'].includes(name)){const module=name==='search'?await import('./search.js'):await import('./partners/index.js');if(disposed)return null;const view=(module.createSearchScreen??module.createPartnerLifeScreen)({send,navigate:open});screens.set(name,view);return view;}if(name==='board'){const {createBoardScreen}=await import('./board.js');if(disposed)return null;const board=createBoardScreen({send});screens.set(name,board);return board;}const unavailable={element:node('p','','This case screen is being prepared.'),update(){},tick(){},dispose(){this.element.remove();}};screens.set(name,unavailable);return unavailable;}
  function update(event){
    const previousAccount=view.account?.state,previousKit=view.account?.hasKit===true,previousMode=view.mode;
    view=event?.view??ctx.adapter.read();
    if((previousAccount==='signed_in'&&view.account?.state!=='signed_in')
      ||(previousKit&&view.account?.hasKit!==true)||previousMode!==view.mode){
      lastIsletFailure='';
      if(lastIntent?.[0]==='buildLight'){callRequest++;sendGeneration++;busy=false;lastIntent=null;localFailure=null;refusedFocus=null;call.clear();}
    }
    if(busy&&active&&current==='finale'&&lastIntent?.[0]==='buildLight'&&isletDisplayRequest===callRequest){
      const failure=view.finale?.isletFailure,stamp=failure?JSON.stringify(failure):'';
      if(failure&&stamp!==lastIsletFailure){
        lastIsletFailure=stamp;localFailure=failure;
        call.fail(failure,isletCallOptions('buildLight',failure));
      }else if(!failure&&view.finale?.islet?.built===true){
        lastIsletFailure='';localFailure=null;call.succeed({message:'Your signal station is built.'});
      }
    }
    const nextPrivate=privateScreenKey(view),clearCached=cachedPrivate!==null&&cachedPrivate!==nextPrivate;
    cachedPrivate=nextPrivate;
    if(clearCached)for(const [name,component] of screens)if(name!==current)component.update(view);
    connection.update(view);call.setSignInAllowed(view.account?.canSignIn!==false);if(active&&current==='bulletin'&&view.bulletin?.status==='off')close();arrival.update(view);ctx.onView?.(view);if(!busy&&localFailure?.reason==='session_expired'&&view.account.state==='signed_in'){localFailure=null;call.clear();}if(!busy&&!localFailure)call.showMessage(view.mode!=='unavailable'&&view.revision<=noticeAfterRevision?'':view.notice?.message??'');
    if(view.revision!==revision){revision=view.revision;screens.get(current)?.update(view);}if(active)screens.get(current)?.tick?.(view);syncCooldown();}
  async function send(name,...args){
    if(busy||disposed||(lastIntent?.[0]===name&&call.read().remaining>0))return;if(content.contains(document.activeElement))refusedFocus=document.activeElement?.dataset.focus??refusedFocus;busy=true;const token=++callRequest,owner=++sendGeneration;lastIntent=[name,...args];if(name==='buildLight')isletDisplayRequest=token;localFailure=null;lastIsletFailure='';call.loading({read:name==='buildLight'});if(name==='completeIntro')arrival.loading();
    try{
      const result=await sendCaseIntent(ctx.adapter,name,...args);if(disposed||token!==callRequest)return result;
      localFailure=result.accepted?null:result;update({view:result.view});
      if(token===callRequest){if(result.accepted)call.succeed();else call.fail(result,isletCallOptions(name,result));}
      if(name==='completeIntro'){lastArrivalRefusal=result.accepted?null:result.reason;arrival.setResult(result);}return result;
    }finally{if(owner===sendGeneration)busy=false;}
  }
  async function open(name='crew',params={}){const token=++openRequest;callRequest++;screens.get(current)?.close?.();const inspection=name==='search'&&params.spot?await send('inspectSpot',params.spot):null;if(disposed||token!==openRequest)return;current=name;const selected=await screen(name);if(disposed||token!==openRequest)return;active=true;localFailure=inspection&&!inspection.accepted?inspection:null;noticeAfterRevision=view.revision;
    const held=name==='finale'?heldIsletLimit():null;
    if(held){
      lastIntent=['buildLight','islet_signal_station'];refusedFocus='build-islet_signal_station';localFailure=held;
      call.fail(held,isletCallOptions('buildLight',held));
    }else if(localFailure)call.fail(localFailure);
    else call.showMessage(view.mode==='unavailable'?view.notice?.message:'');ctx.resetInput?.();modal.setTitle(titles[name]??'Case');
    const pages={crew:'Crew',board:'Board',search:'Search',partners:'Partners',finale:'Lights',accusation:'Schooner',relighting:'Coast',rewards:'Rewards',log:'Log',hints:'What next?'};
    nav.replaceChildren(...['crew','board','finale'].map(id=>{const item=button(pages[id],()=>open(id),{quiet:true,focus:`case-nav-${id}`});item.setAttribute('aria-current',id===name?'page':'false');return item;}));
    const picker=node('select','case-page-picker');picker.setAttribute('aria-label','Case page');
    for(const [id,label] of Object.entries(pages)){const option=node('option','',label);option.value=id;option.dataset.focus=`case-nav-${id}`;picker.append(option);}
    if(!Object.hasOwn(pages,name)){const option=node('option','',titles[name]??'Case');option.value=name;picker.prepend(option);}
    picker.value=name;picker.onchange=()=>open(picker.value);nav.append(picker);
    content.replaceChildren(selected.element);revision=view.revision;selected.setPreferences?.(getPreferences());selected.update(view);syncCooldown();if(name==='finale'&&busy&&lastIntent?.[0]==='buildLight')isletDisplayRequest=callRequest;modal.open(ctx.container);if(name==='bulletin')emit({type:'bulletin_opened'});const heading=modal.element.querySelector('h2');heading.tabIndex=-1;heading.focus({preventScroll:true});modal.element.scrollTop=0;content.scrollTop=0;}
  function close(){openRequest++;callRequest++;screens.get(current)?.close?.();active=false;localFailure=null;call.clear();ctx.resetInput?.();modal.close();}
  const stop=ctx.adapter.subscribe(update);update();
  return {get active(){return active;},get screenName(){return current;},get view(){return view;},open,close,send,arrival:arrival.element,
    async completeIntro(receipt){lastArrivalReceipt=receipt;await send('completeIntro',receipt);return arrival.element;},
    tick(dt){ctx.adapter.tick?.(dt);if(active)screens.get(current)?.tick?.(view);},
    dispose(){if(disposed)return;disposed=true;stop();close();for(const item of screens.values())item.dispose();arrival.dispose();call.dispose();connection.dispose();modal.dispose();}};
}
