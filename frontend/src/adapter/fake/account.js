// Local-only account and save-state stand-in. Nothing in this module contacts or stores credentials.
import {accept,refuse} from './state.js';

const SAMPLE_DATE='2026-11-05T12:00:00.000Z';
const localSaveLabel='No intro progress saved on this device';
const cloudSaveLabel='No cloud save';
const rerolledNames=['Captain Reed','Captain Wren','Captain Shoal'];
const sources=new Set(['keep_this_device','use_cloud']);

export function initialAccountState(){
  return {
    state:'signed_out',captainName:null,signInReadyAt:null,sessionExpiresAt:null,rerolled:false,rerollIndex:0,
    saveState:'idle',selectedSource:'auto',stableDate:SAMPLE_DATE,
    deviceSave:{state:'idle',label:localSaveLabel,updatedAt:null,kind:null,actions:null,place:null},
    cloudSave:{state:'idle',label:cloudSaveLabel,updatedAt:null,kind:null,actions:null,place:null},
  };
}

const accountOf=state=>state.account??initialAccountState();
const signedIn=state=>accountOf(state).state==='signed_in';
const sessionFailure=state=>accountOf(state).state==='expired'
  ?refuse('session_expired','Your session expired. Sign in again to manage this account.')
  :refuse('offline','Sign in to manage this account.');
const saved=source=>['saved','offline'].includes(source?.state)&&!!source?.kind;

function deviceSaveOf(state,account=accountOf(state)){
  if(account.deviceSave?.state!=='idle')return account.deviceSave;
  const profile=state.profile;
  if(!profile)return account.deviceSave;
  return {state:'saved',label:'Intro saved on this device',updatedAt:profile.updatedAt??account.stableDate??null,
    kind:'intro',actions:Array.isArray(profile.actions)?[...profile.actions]:null,place:profile.place??'lighthouse_isle'};
}

function cloudSaveOf(state,account=accountOf(state)){
  const source=account.cloudSave??{state:'idle',label:cloudSaveLabel,updatedAt:null};
  if(source.state==='saved'&&source.kind==='intro'&&!Array.isArray(source.actions)&&Array.isArray(state.profile?.actions))
    return {...source,actions:[...state.profile.actions]};
  return source;
}

function hasUsableDevice(state,account=accountOf(state)){return saved(deviceSaveOf(state,account));}
function hasUsableCloud(state,account=accountOf(state)){return signedIn(state)&&saved(cloudSaveOf(state,account));}
function isConflict(account){return account.saveState==='conflict';}

function selectedSource(state,account=accountOf(state)){
  if(account.selectedSource==='cloud'&&hasUsableCloud(state,account))return 'cloud';
  if(account.selectedSource==='device'&&hasUsableDevice(state,account))return 'device';
  if(hasUsableCloud(state,account))return 'cloud';
  if(hasUsableDevice(state,account))return 'device';
  return null;
}

export function accountView(state){
  const account=accountOf(state),device=deviceSaveOf(state,account),cloud=cloudSaveOf(state,account),conflict=isConflict(account);
  const source=conflict?null:selectedSource(state,account),chosen=source==='cloud'?cloud:source==='device'?device:null;
  const saveState=conflict?'conflict':account.saveState??chosen?.state??'idle';
  const name=String(account.captainName??state.captainName??'Captain Lantern');
  return {
    state:account.state??'signed_out',captainName:name,canReroll:account.state==='signed_in'&&!account.rerolled,
    hasKit:!!state.profile,canContinue:!conflict&&!!source,
    save:{state:saveState,source,label:conflict?'Choose which saved game to keep':chosen?.label??account.saveLabel??'No saved progress',
      updatedAt:chosen?.updatedAt??null,device:{state:device?.state??'idle',label:device?.label??localSaveLabel,updatedAt:device?.updatedAt??null},
      cloud:{state:cloud?.state??'idle',label:cloud?.label??cloudSaveLabel,updatedAt:cloud?.updatedAt??null}},
  };
}

export function settleAccount(state){
  const account=accountOf(state);let changed=false;
  if(account.state==='signing_in'&&Number.isFinite(account.signInReadyAt)&&state.lobbyNow>=account.signInReadyAt){
    account.state='signed_in';account.signInReadyAt=null;
    if(account.sessionExpiresAt==null)account.sessionExpiresAt=state.lobbyNow+3600;
    changed=true;
  }
  if(account.state==='signed_in'&&Number.isFinite(account.sessionExpiresAt)&&state.lobbyNow>=account.sessionExpiresAt){
    account.state='expired';account.signInReadyAt=null;account.sessionExpiresAt=null;account.selectedSource='auto';changed=true;
  }
  return changed;
}

export function signIn(state){
  const account=accountOf(state);
  if(account.state==='signed_in')return accept('You are already signed in.');
  if(account.state==='signing_in')return refuse('busy','Sign-in is already in progress.');
  account.state='signing_in';account.signInReadyAt=(Number.isFinite(state.lobbyNow)?state.lobbyNow:0)+0.5;
  return accept('Local sign-in started. It will finish shortly.');
}

export function signOut(state){
  const account=accountOf(state);account.state='signed_out';account.signInReadyAt=null;account.sessionExpiresAt=null;account.selectedSource='auto';
  return accept('You are signed out. This device’s accepted intro progress is still available.');
}

// Project accepted fake progress into a displayable cloud-save summary without storage or I/O.
export function syncAccountSave(state){
  if(!state.profile)return false;
  const account=accountOf(state),profile=state.profile;
  account.cloudSave={state:'saved',label:'Cloud progress saved',updatedAt:account.stableDate??SAMPLE_DATE,
    kind:profile.kitId?'world':'intro',actions:Array.isArray(profile.actions)?[...profile.actions]:null,
    place:profile.place??'lighthouse_isle'};
  if(account.saveState!=='conflict'){
    account.saveState='saved';account.saveLabel='Cloud progress saved';
  }
  return true;
}

export function rerollName(state){
  if(!signedIn(state))return sessionFailure(state);
  const account=accountOf(state);if(account.rerolled)return refuse('name_reroll_used','Your one name change has already been used.');
  const next=rerolledNames[account.rerollIndex%rerolledNames.length];account.rerollIndex++;account.rerolled=true;account.captainName=next;state.captainName=next;
  const seat=state.crew?.seats?.find(item=>item.isYou);if(seat)seat.name=next;
  return accept(`Your captain name is now ${next}.`);
}

function continuationFor(source,save){
  const actions=Array.isArray(save.actions)?[...save.actions]:null;
  return {source:source==='device'?'local':'cloud',kind:save.kind,actions,place:save.place??'lighthouse_isle'};
}

export function resolveSaveConflict(state,choice){
  const account=accountOf(state);if(!signedIn(state))return sessionFailure(state);
  if(!sources.has(choice))return refuse('unsupported_choice','Choose either this device or the cloud save.');
  if(!isConflict(account))return refuse('save_conflict','There is no saved-game conflict to resolve.');
  const source=choice==='use_cloud'?'cloud':'device',save=source==='cloud'?cloudSaveOf(state,account):deviceSaveOf(state,account);
  if(!saved(save))return refuse('save_unavailable','That saved game is not available. Choose the other copy.');
  account.selectedSource=source;account.saveState=save.state;account.saveLabel=save.label;
  return accept(source==='cloud'?'The cloud save is selected.':'The save on this device is selected.');
}

export function continueGame(state){
  const account=accountOf(state);if(isConflict(account))return refuse('save_conflict','Choose which saved game to keep before continuing.');
  const source=selectedSource(state,account);if(!source)return refuse('save_unavailable','There is no saved game to continue.');
  const save=source==='cloud'?cloudSaveOf(state,account):deviceSaveOf(state,account);
  if(!saved(save))return refuse('save_unavailable','That saved game is not available.');
  const continuation=continuationFor(source,save);state.continuation=continuation;
  return accept(source==='cloud'?'The cloud game is ready to continue.':'This device’s game is ready to continue.');
}

function passCrewLeadership(state,ownSeat){
  const crew=state.crew;if(!crew)return;
  const seats=crew.seats??[],next=seats.filter(seat=>seat.kind==='player'&&!seat.isYou&&seat.seat!==ownSeat)
    .sort((a,b)=>a.seat-b.seat);
  const following=next.find(seat=>seat.seat>ownSeat)??next[0]??null;
  crew.leaderSeat=following?.seat??null;
  const owned=seats.find(seat=>seat.seat===ownSeat);
  if(owned)Object.assign(owned,{kind:'open',name:'Open seat',kitId:null,isYou:false});
}

export function deleteMyData(state,{confirm=false}={}){
  if(confirm!==true)return refuse('confirmation_required','Confirm that you want to delete all your player data.');
  if(!signedIn(state)&&accountOf(state).state!=='expired')return sessionFailure(state);
  const ownSeat=state.crew?.seats?.find(seat=>seat.isYou)?.seat??1;
  passCrewLeadership(state,ownSeat);
  if(state.found)state.found[ownSeat]=[];
  if(Array.isArray(state.pins))state.pins=state.pins.filter(pin=>pin.seat!==ownSeat);
  if(Array.isArray(state.creditedCards))state.creditedCards=[];
  state.profile=null;state.coins=0;state.captainName='Captain Lantern';state.continuation=null;
  state.account=initialAccountState();
  return accept('Your local rehearsal player data was deleted. Other crew members and shared case progress remain.');
}
