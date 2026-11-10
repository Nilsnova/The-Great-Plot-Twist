// Local-only account stand-in. Nothing in this module contacts or stores credentials.
import {accept,refuse} from './state.js';

const rerolledNames=['Captain Reed','Captain Wren','Captain Shoal'];

export function initialAccountState(){
  return {state:'signed_out',captainName:null,signInReadyAt:null,sessionExpiresAt:null,rerolled:false,rerollIndex:0};
}

const accountOf=state=>state.account??initialAccountState();
const signedIn=state=>accountOf(state).state==='signed_in';
const sessionFailure=state=>accountOf(state).state==='expired'
  ?refuse('session_expired','Your session expired. Sign in again to manage this account.')
  :refuse('offline','Sign in to manage this account.');

export function accountView(state){
  const account=accountOf(state);
  return {state:account.state??'signed_out',captainName:String(account.captainName??state.captainName??'Captain Lantern'),
    canSignIn:true,signInMessage:'',connection:{state:'idle',message:'',reason:null},
    canReroll:account.state==='signed_in'&&!account.rerolled,namePending:false,canRetryName:false,
    guest:false,providers:['github']};
}

export function settleAccount(state){
  const account=accountOf(state);let changed=false;
  if(account.state==='signing_in'&&Number.isFinite(account.signInReadyAt)&&state.lobbyNow>=account.signInReadyAt){
    account.state='signed_in';account.signInReadyAt=null;
    if(account.sessionExpiresAt==null)account.sessionExpiresAt=state.lobbyNow+3600;
    changed=true;
  }
  if(account.state==='signed_in'&&Number.isFinite(account.sessionExpiresAt)&&state.lobbyNow>=account.sessionExpiresAt){
    account.state='expired';account.signInReadyAt=null;account.sessionExpiresAt=null;changed=true;
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
  const account=accountOf(state);account.state='signed_out';account.signInReadyAt=null;account.sessionExpiresAt=null;
  return accept('You are signed out.');
}

export function rerollName(state){
  if(!signedIn(state))return sessionFailure(state);
  const account=accountOf(state);if(account.rerolled)return refuse('name_reroll_used','Your one name change has already been used.');
  const next=rerolledNames[account.rerollIndex%rerolledNames.length];account.rerollIndex++;account.rerolled=true;account.captainName=next;state.captainName=next;
  return accept(`Your captain name is now ${next}.`);
}

export function deleteMyData(state,{confirm=false}={}){
  if(confirm!==true)return refuse('confirmation_required','Confirm that you want to delete all your player data.');
  if(!signedIn(state)&&accountOf(state).state!=='expired')return sessionFailure(state);
  state.coins=0;state.captainName='Captain Lantern';state.account=initialAccountState();
  return accept('Your local rehearsal player data was deleted.');
}
