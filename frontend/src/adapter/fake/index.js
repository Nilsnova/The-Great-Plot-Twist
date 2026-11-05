// One memory-only adapter. All temporary game rules live under fake/, never in a screen.
import {bindCaseMethods,copyView} from '../contract.js';
import {initialCaseState,refuse} from './state.js';
import {completeIntro,createCrew,joinCrew,muster} from './arrival-crew.js';
import {caseView} from './view.js';
export function createFakeCaseAdapter({timeScale=1}={}) {
  let state=initialCaseState(),disposed=false,lastSecond=-1,notice=null;
  const listeners=new Set(),handlers={completeIntro,createCrew,joinCrew,muster};
  function read(){return copyView({...caseView(state),notice});}
  function publish(){const event={type:'case_updated',view:read()};for(const listener of listeners)listener(event);}
  function dispatch(name,args){if(disposed)return Promise.resolve({accepted:false,reason:'disposed',message:'The rehearsal has ended.',view:read()});const result=handlers[name]?.(state,...args)??refuse('not_ready','This part of the local case is not ready yet.');notice={reason:result.reason,message:result.message};state.revision++;publish();return Promise.resolve({...result,view:read()});}
  const adapter={read,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    tick(dt){if(disposed||state.crew?.status!=='active')return;state.now+=Math.max(0,Math.min(.1,dt))*timeScale;if(Math.floor(state.now)!==lastSecond){lastSecond=Math.floor(state.now);publish();}},
    dispose(){disposed=true;listeners.clear();},
    dev:{advance(seconds){state.now+=Math.max(0,seconds);publish();},reset(){state=initialCaseState();notice=null;publish();}},
  };
  return bindCaseMethods(adapter,dispatch);
}
