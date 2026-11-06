// One-shot, local transport refusals for rehearsals. No HTTP request or credential is involved.
import {refuse} from './state.js';
const messages={
  offline:'The connection is offline. Your progress on this device is kept.',
  not_connected:'This service is not connected yet. Try again in a moment.',
  session_expired:'Sign in again; your progress on this device is kept.',
  save_conflict:'This save changed on another device. Choose which copy to keep.',
  rate_limited:'Too many requests. Wait a moment, then try again.',
  feature_off:'This feature is not available yet. The rest of the game is still playable.',
};
export function faultReply(state,reason){
  if(reason==='session_expired'){state.account.state='expired';state.account.sessionExpiresAt=null;}
  if(reason==='offline'){state.account.saveState='offline';state.presence.status='offline';}
  if(reason==='not_connected')state.presence.status='reconnecting';
  if(reason==='save_conflict'){
    const empty={state:'saved',label:'Local rehearsal copy',kind:'intro',actions:[],place:'lighthouse_isle',updatedAt:state.account.stableDate};
    if(state.account.deviceSave.state==='idle')state.account.deviceSave={...empty};
    if(state.account.cloudSave.state==='idle')state.account.cloudSave={...empty,label:'Cloud rehearsal copy'};
    state.account.saveState='conflict';
  }
  return {...refuse(reason,messages[reason]??'That action could not be completed. Please try again.'),...(reason==='rate_limited'?{retryAfterSeconds:4}:{})};
}
