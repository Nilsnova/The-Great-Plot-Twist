// One memory-only adapter. All temporary game rules live under fake/, never in a screen.
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
import {caseView} from './view.js';
export function createFakeCaseAdapter({timeScale=1,allowBrowse=false}={}) {
  let state=initialCaseState(),disposed=false,lastSecond=-1,notice=null;
  state.allowBrowse=allowBrowse;
  const listeners=new Set(),handlers={completeIntro,createCrew,joinCrew,muster,pin:pinCard,pair:pairCards,search:startSearch,inspectSpot,orderPartner,buildLight,callNightfall,takePost,aim,boardSchooner,accuse,nextReveal,claimLantern};
  function read(){return copyView({...caseView(state),notice});}
  function publish(){const event={type:'case_updated',view:read()};for(const listener of listeners)listener(event);}
  function dispatch(name,args){if(disposed)return Promise.resolve({accepted:false,reason:'disposed',message:'The rehearsal has ended.',view:read()});settleJobs(state);settleNight(state);const result=handlers[name]?.(state,...args)??refuse('not_ready','This part of the local case is not ready yet.');settleJobs(state);settleNight(state);notice={...result};state.revision++;publish();return Promise.resolve({...result,view:read()});}
  const adapter={read,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    tick(dt){if(disposed||state.crew?.status!=='active')return;state.now+=Math.max(0,Math.min(.1,dt))*timeScale;if(settleJobs(state)|settleNight(state)){state.revision++;notice={reason:null,message:state.lastReport};}if(Math.floor(state.now)!==lastSecond){lastSecond=Math.floor(state.now);publish();}},
    dispose(){disposed=true;listeners.clear();},
    dev:{give(id,seat=1){if(!state.found[seat].includes(id))state.found[seat].push(id);state.revision++;publish();},pinForSeat(id,seat){const result=pinCard(state,id,seat,1);state.revision++;publish();return result;},advance(seconds){state.now+=Math.max(0,seconds);if(settleJobs(state)|settleNight(state))state.revision++;publish();},reset(){state=initialCaseState();state.allowBrowse=allowBrowse;notice=null;publish();}},
  };
  return bindCaseMethods(adapter,dispatch);
}
