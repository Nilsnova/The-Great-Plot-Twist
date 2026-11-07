// Pure online projection. Unimplemented case sections retain the disconnected adapter's safe defaults.
import {createUnavailableCaseAdapter} from '../../adapter/unavailable.js';
import {mapAccount,mapArrival} from './account-view.js';
import {mapCrew} from './crew-view.js';
import {crewPermissions} from './crew-permissions.js';

function emptyView(){
  const adapter=createUnavailableCaseAdapter();
  const view=adapter.read();
  adapter.dispose();
  return view;
}

function continuationView(value){
  if(!value||!['local','cloud'].includes(value.source))return null;
  return {source:value.source,kind:value.kind==='world'?'world':'intro',
    actions:Array.isArray(value.actions)?value.actions.filter(action=>typeof action==='string'):null,
    place:typeof value.place==='string'?value.place:null};
}

function walletView(rows,balance,empty,status){
  const ledger=(Array.isArray(rows)?rows:[]).filter(row=>Number.isFinite(row.amount)).map((row,index)=>{
    const reason=typeof row.reason==='string'&&/^[a-z_]+$/.test(row.reason)?row.reason:'coin_change';
    return {id:`wallet-row-${index}`,amount:row.amount,reason,label:reason.replaceAll('_',' '),
      at:row.at??row.created_at??null};
  });
  return {...empty,balance,ledger,recent:ledger.slice(0,5),status:status??'ready'};
}


export function composeRealView(state={}){
  const view=emptyView();
  const account=mapAccount(state);
  const crew=mapCrew(state);
  const coins=account.state==='signed_in'&&Number.isFinite(state.me?.coins)?state.me.coins:null;
  return {...view,schema:1,mode:'online',revision:state.revision??0,now:state.now??0,account,crew,
    captain:{name:account.captainName??'Captain pending',coins,save:account.save},arrival:mapArrival(state),
    permissions:crewPermissions(state,account),continuation:continuationView(state.continuation),
    rewards:walletView(state.rewardsRows,coins,view.rewards,state.rewardsStatus),
    notice:state.notice?{reason:state.notice.reason??null,message:state.notice.message??''}:null};
}

export {mapAccount,mapArrival,mapCrew};
