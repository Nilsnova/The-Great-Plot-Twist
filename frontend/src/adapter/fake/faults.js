// One-shot, local transport refusals for rehearsals. No HTTP request or credential is involved.
import {refuse} from './state.js';
const messages={
  offline:'The connection is offline. You can keep playing on this device.',
  not_connected:'This service is not connected yet. Try again in a moment.',
  session_expired:'Sign in again to keep playing online.',
  rate_limited:'Too many requests. Wait a moment, then try again.',
  feature_off:'This feature is not available yet. The rest of the game is still playable.',
};
export function faultReply(state,reason){
  if(reason==='session_expired'){state.account.state='expired';state.account.sessionExpiresAt=null;}
  if(reason==='offline')state.presence.status='offline';
  if(reason==='not_connected')state.presence.status='reconnecting';
  return {...refuse(reason,messages[reason]??'That action could not be completed. Please try again.'),...(reason==='rate_limited'?{retryAfterSeconds:4}:{})};
}
