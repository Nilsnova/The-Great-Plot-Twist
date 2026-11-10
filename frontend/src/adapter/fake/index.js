// One memory-only adapter for local rehearsal (?adapter=local in a dev build): a local account and
// simulated live captains. Temporary rules live in fake/, never in a screen or transport.
import {bindAdapterMethods,copyView} from '../contract.js';
import {refuse} from './state.js';
import {initialPresenceState,presenceView,tickPresence,reportPosition,setEmote} from './presence.js';
import {initialAccountState,accountView,settleAccount,signIn,signOut,rerollName,deleteMyData} from './account.js';
import {faultReply} from './faults.js';

export function createFakeAdapter({presenceCount=30}={}) {
  function initial(){return {revision:0,now:0,lobbyNow:0,captainName:'Captain Lantern',coins:null,account:initialAccountState(),presence:initialPresenceState({count:presenceCount})};}
  let state=initial(),disposed=false,notice=null,presenceTime=0,nextFault=null;
  const listeners=new Set();
  const handlers={signIn,signOut,rerollName,deleteMyData,
    reportPosition:(state,sample)=>reportPosition(state.presence,sample),setEmote:(state,id)=>setEmote(state.presence,id)};

  function read(){
    const account=accountView(state);
    return copyView({schema:1,mode:'local',revision:state.revision,now:state.now,account,
      captain:{name:account.captainName,coins:account.state==='signed_in'?state.coins:null},
      presence:presenceView(state.presence),notice});
  }
  function publish(){
    if(disposed)return;
    for(const listener of listeners)listener({type:'view_updated',view:read()});
  }
  function dispatch(name,args){
    if(disposed)return Promise.resolve({...refuse('disposed','The rehearsal has ended.'),view:read()});
    settleAccount(state);
    let result;
    try{if(nextFault){result=faultReply(state,nextFault);nextFault=null;}else result=handlers[name]?.(state,...args)??refuse('not_ready','This local service is not ready yet.');}
    catch{result=refuse('invalid_request','That action could not be read. Please try again.');}
    const motion=['reportPosition','setEmote'].includes(name);
    if(result.accepted&&name==='signIn')state.presence.status='live';
    if(!motion||!result.accepted){notice={...result};state.revision++;}
    publish();
    return Promise.resolve({...result,view:read()});
  }
  function tick(dt){
    if(disposed)return;
    const seconds=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));
    state.lobbyNow+=seconds;state.now+=seconds;
    const changed=settleAccount(state);
    if(changed&&state.account.state==='signed_in'&&state.coins===null)state.coins=100;
    presenceTime+=seconds;
    const presenceDue=presenceTime>=.5;
    if(presenceDue){state.presence.now=Date.now()-presenceTime*1000;tickPresence(state.presence,presenceTime);presenceTime=0;}
    if(changed)state.revision++;
    if(changed||presenceDue)publish();
  }
  const dev={
    failNext(reason){nextFault=reason;},
    setAccount(patch){if(disposed)return;Object.assign(state.account,copyView(patch));state.revision++;publish();},
    setPresence(patch){if(disposed)return;Object.assign(state.presence,copyView(patch));publish();},
    reset(){if(disposed)return;state=initial();notice=null;nextFault=null;presenceTime=0;publish();},
  };
  return bindAdapterMethods({read,tick,dev,
    subscribe(listener){if(disposed)return()=>{};listeners.add(listener);return()=>listeners.delete(listener);},
    dispose(){disposed=true;listeners.clear();},
  },dispatch);
}
