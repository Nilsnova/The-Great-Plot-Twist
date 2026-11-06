// One memory-only adapter. Temporary rules live in fake/, never in a screen or transport.
import {bindCaseMethods,copyView} from '../contract.js';
import {initialCaseState,refuse} from './state.js';
import {completeIntro,createCrew,joinCrew,muster} from './arrival-crew.js';
import {pinCard,pairCards} from './board.js';
import {startSearch,inspectSpot} from './search.js';
import {orderPartner} from './partners.js';
import {settleJobs} from './settle.js';
import {buildLight,callNightfall,takePost,aim,settleNight} from './night.js';
import {boardSchooner,accuse,nextReveal} from './reveal.js';
import {claimLantern} from './relighting.js';
import {rehearse} from './rehearsal.js';
import {initialPresenceState,tickPresence,reportPosition,setEmote} from './presence.js';
import {initialAccountState,settleAccount,signIn,signOut,rerollName,deleteMyData,resolveSaveConflict,continueGame,syncAccountSave} from './account.js';
import {resetDeletedPlayer} from './account-reset.js';
import {faultReply} from './faults.js';
import {initialRewardState,settleRewards} from './rewards.js';
import {setSimulatedSeats,asSimulatedSeat} from './simulate.js';
import {recordPartnerEvent,previewTakeover,confirmTakeover} from './partner-life.js';
import {caseView} from './view.js';
import {initialBulletinState,setBulletinScenario} from './bulletin.js';

export function createFakeCaseAdapter({timeScale=1,allowBrowse=false,presenceCount=30,localActions=null}={}) {
  let isletBuilt=['plot_1'];
  function initial(){const next=initialCaseState();next.stations=isletBuilt.includes('islet_signal_station');next.bulletin=initialBulletinState();next.account=initialAccountState();next.rewardState=initialRewardState();next.presence=initialPresenceState({count:presenceCount});if(Array.isArray(localActions))next.account.deviceSave={state:'saved',label:'Intro saved on this device',updatedAt:null,kind:'intro',actions:[...localActions],place:'lighthouse_isle'};return next;}
  let state=initial(),disposed=false,lastSecond=-1,notice=null,presenceTime=0,nextFault=null;
  state.allowBrowse=allowBrowse;
  const listeners=new Set();
  const handlers={completeIntro,createCrew,joinCrew,muster,pin:pinCard,pair:pairCards,
    search:startSearch,inspectSpot,orderPartner,buildLight,callNightfall,takePost,aim,
    boardSchooner,accuse,nextReveal,claimLantern,signIn,signOut,rerollName,deleteMyData,resolveSaveConflict,continueGame,
    reportPosition:(state,sample)=>reportPosition(state.presence,sample),setEmote:(state,id)=>setEmote(state.presence,id)};

  function read(){return copyView({...caseView(state),notice});}
  function publish(){
    if(disposed)return;
    for(const listener of listeners)listener({type:'case_updated',view:read()});
  }
  function settle(){
    const jobs=settleJobs(state),night=settleNight(state),account=settleAccount(state);
    settleRewards(state);return jobs||night||account;
  }
  function dispatch(name,args){
    if(disposed)return Promise.resolve({...refuse('disposed','The rehearsal has ended.'),view:read()});
    settle();
    const previousName=state.captainName;
    let result;
    try{if(nextFault){result=faultReply(state,nextFault);nextFault=null;}else result=handlers[name]?.(state,...args)??refuse('not_ready','This local service is not ready yet.');}
    catch{result=refuse('invalid_request','That action could not be read. Please try again.');}
    if(name==='orderPartner')recordPartnerEvent(state,{seat:args[0],type:result.accepted?'order_accepted':'refusal',reason:result.reason,order:args[1]});
    if(result.accepted&&name==='deleteMyData')resetDeletedPlayer(state,initial,previousName);
    settle();
    const motion=['reportPosition','setEmote'].includes(name);
    if(result.accepted&&name==='reportPosition'&&state.profile)state.profile.place=args[0].place;
    const progress=['completeIntro','createCrew','joinCrew','muster','pin','pair','search','orderPartner','buildLight','callNightfall','takePost','aim','boardSchooner','accuse','nextReveal','claimLantern','reportPosition'];
    if(result.accepted&&progress.includes(name)&&state.account.saveState!=='conflict')syncAccountSave(state);
    if(result.accepted&&name==='signIn')state.presence.status='live';
    if(!motion||!result.accepted){notice={...result};state.revision++;}
    publish();
    return Promise.resolve({...result,view:read()});
  }
  function tick(dt){
    if(disposed)return;
    const seconds=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));
    state.lobbyNow+=seconds;state.worldNow+=seconds;
    let changed=settleAccount(state);
    if(state.crew?.status==='active'){
      state.now+=seconds*timeScale;
      changed=settle()||changed;
    }
    presenceTime+=seconds;
    const presenceDue=presenceTime>=.5;
    if(presenceDue){state.presence.now=Date.now()-presenceTime*1000;tickPresence(state.presence,presenceTime);presenceTime=0;}
    if(changed){state.revision++;notice={reason:null,message:state.lastReport};}
    if(changed||presenceDue||Math.floor(state.now)!==lastSecond){lastSecond=Math.floor(state.now);publish();}
  }
  const dev={
    setBulletin(scenario){if(disposed||!setBulletinScenario(state,scenario))return false;state.revision++;publish();return true;},
    setIsletBuilt(built){if(disposed||!Array.isArray(built))return;isletBuilt=[...built];state.stations=isletBuilt.includes('islet_signal_station');state.revision++;publish();},
    setBeam(id,degrees){if(disposed||!state.night||!Number.isFinite(degrees))return;state.night.bearings[id]=degrees;publish();},
    previewTakeover(kitId){return disposed?null:previewTakeover(state,kitId);},
    confirmTakeover(preview){if(disposed)return refuse('disposed','The rehearsal has ended.');const result=confirmTakeover(state,preview);state.revision++;publish();return result;},
    setSeats(seats){if(disposed)return;if(setSimulatedSeats(state,seats)){state.revision++;publish();}},
    peerIntent(seat,method,...args){if(disposed)return {...refuse('disposed','The rehearsal has ended.'),view:read()};settle();const result=asSimulatedSeat(state,seat,method,args,handlers);settle();state.revision++;publish();return {...result,view:read()};},
    advanceCase(seconds){if(disposed)return;state.now+=Math.max(0,seconds);if(settle())state.revision++;publish();},
    failNext(reason){nextFault=reason;},
    setAccount(patch){if(disposed)return;Object.assign(state.account,copyView(patch));state.revision++;publish();},
    setPresence(patch){if(disposed)return;Object.assign(state.presence,copyView(patch));publish();},
    rehearse(stage){if(disposed)return;rehearse(state,stage);notice=null;publish();},
    give(id,seat=1){
      if(disposed)return;
      if(!state.found[seat].includes(id))state.found[seat].push(id);
      state.revision++;publish();
    },
    pinForSeat(id,seat){
      if(disposed)return refuse('disposed','The rehearsal has ended.');
      const result=pinCard(state,id,seat,1);state.revision++;publish();return result;
    },
    advance(seconds){
      if(disposed)return;
      state.lobbyNow+=Math.max(0,seconds);state.worldNow+=Math.max(0,seconds);state.now+=Math.max(0,seconds);
      if(settle())state.revision++;publish();
    },
    reset(){if(disposed)return;const effectId=state.effectId;state=initial();state.effectId=effectId;state.allowBrowse=allowBrowse;notice=null;nextFault=null;presenceTime=0;publish();},
  };
  return bindCaseMethods({read,tick,dev,
    subscribe(listener){if(disposed)return()=>{};listeners.add(listener);return()=>listeners.delete(listener);},
    dispose(){disposed=true;listeners.clear();},
  },dispatch);
}
