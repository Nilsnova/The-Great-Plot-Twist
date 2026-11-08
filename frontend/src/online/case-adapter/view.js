// Pure online projection. Unimplemented case sections retain the disconnected adapter's safe defaults.
import {createUnavailableCaseAdapter} from '../../adapter/unavailable.js';
import {mapAccount,mapArrival} from './account-view.js';
import {mapCrew} from './crew-view.js';
import {crewPermissions} from './crew-permissions.js';
import {projectIsletDisplay} from './islet-view.js';
import {caseReasons} from '../../adapter/reasons.js';
import {bulletinObservations} from './bulletin-view.js';
import {projectCase} from './case-view.js';

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


function isletFailureView(failure, signedIn){
  if(!signedIn||failure?.accepted!==false||!caseReasons.includes(failure.reason))return null;
  const view={reason:failure.reason,message:typeof failure.message==='string'?failure.message:''};
  if(Number.isInteger(failure.status)&&failure.status>=0&&failure.status<=599)view.status=failure.status;
  const seconds=failure.retryAfterSeconds;
  if(Number.isFinite(seconds)&&seconds>=0&&seconds<=86400)view.retryAfterSeconds=Math.ceil(seconds);
  // Like presence cooldowns, this client deadline controls presentation only; it grants no outcome.
  if(failure.reason==='rate_limited'&&Number.isFinite(failure.retryAt)&&failure.retryAt>=0&&failure.retryAt<=Number.MAX_SAFE_INTEGER)view.retryUntil=failure.retryAt;
  return view;
}

export function composeRealView(state={}){
  const view=emptyView();
  const account=mapAccount(state);
  const bulletin=state.config?.flags?.bulletin===true&&state.bulletin
    ?structuredClone(state.bulletin):view.bulletin;
  const crew=mapCrew(state);
  const islet=projectIsletDisplay(state.isletSnapshot,{signedIn:account.state==='signed_in',crew});
  const presenceView=state.presence??view.presence;
  const coins=account.state==='signed_in'&&Number.isFinite(state.me?.coins)?state.me.coins:null;
  const connected=state.config?.flags?.case===true;
  const earned=connected?projectCase(account.state==='signed_in'?state.case:null,
    {...state.casePresentation,world:state.worldSnapshot,elapsed:state.caseElapsed??0}):
    {now:state.now??0,board:view.board,search:view.search,partners:view.partners,finale:view.finale,
      accusation:view.accusation,reveal:view.reveal,world:view.world,rewards:{},log:{}};
  return {...view,schema:1,mode:'online',revision:state.revision??0,account,
    now:earned.now,board:earned.board,search:earned.search,partners:earned.partners,
    accusation:earned.accusation,reveal:earned.reveal,world:earned.world,effects:connected&&account.state==='signed_in'?state.effects??[]:[],
    crew:{...crew,isletReminder:islet.reminder,...(connected&&account.state==='signed_in'
      ?{caseReady:state.caseLoaded===true?state.case!==null:null}:{})},
    finale:{...view.finale,...earned.finale,islet:islet.station,isletFailure:isletFailureView(state.isletFailure,account.state==='signed_in')},
    captain:{name:account.captainName??'Captain pending',coins,save:account.save},arrival:mapArrival(state),
    permissions:crewPermissions(state,account),presence:presenceView,continuation:continuationView(state.continuation),
    rewards:{...walletView(state.rewardsRows,coins,view.rewards,state.rewardsStatus),...earned.rewards},
    bulletin,log:{...view.log,...earned.log,observations:bulletinObservations(bulletin)},
    notice:state.notice?{reason:state.notice.reason??null,message:state.notice.message??''}:null};
}

export {mapAccount,mapArrival,mapCrew};
