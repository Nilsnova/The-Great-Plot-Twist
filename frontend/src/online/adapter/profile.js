// Account intents (captain name, delete my data) forward authoritative replies only.
import {validNameReply} from './profile-shapes.js';

export async function initializeAccountName(ctx) {
  if(!ctx.session.isSignedIn())return ctx.refuse('sign_in_required');
  const scope=ctx.store.scope();
  ctx.store.commit({nameStatus:'loading'});
  const result=await ctx.transport.change({route:'/api/me/name',kind:'me'});
  if(!ctx.store.isCurrent(scope))return ctx.refuse('session_expired');
  if(result.reply?.ok&&result.mapped.accepted){
    if(!validNameReply(result.reply.data)){ctx.store.commit({nameStatus:'unavailable'});return ctx.refuse('invalid_request');}
    const nameReply=result.reply.data;
    ctx.store.commit({nameReply,nameStatus:'ready',me:ctx.state.me?{...ctx.state.me,captainName:nameReply.captainName}:null});
  }else ctx.store.commit({nameStatus:'unavailable'});
  return result.mapped;
}

export function createProfileHandlers(ctx) {
  const {store, state, transport} = ctx;
  const current=scope=>store.isCurrent(scope)&&ctx.session.isSignedIn();
  const expired=()=>ctx.refuse(store.isClosed()?'disposed':'session_expired');
  async function rerollName() {
    const scope=store.scope();
    const result = await transport.change({route: '/api/me/name/reroll',
      body: {}, kind: 'me', actionUid: true});
    if(!current(scope))return expired();
    if (result.reply?.ok && result.mapped.accepted) {
      const nameReply = result.reply.data;
      if (!validNameReply(nameReply)) return ctx.refuse('invalid_request');
      store.commit({nameReply, me: state.me ? {...state.me, captainName:nameReply.captainName} : null});
    }
    if (result.mapped.accepted) {
      await transport.read('me');
      if(!current(scope))return expired();
      if(result.reply?.ok!==true)await initializeAccountName(ctx);
    } else if(result.mapped.reason==='name_reroll_used'&&state.nameReply){
      store.commit({nameReply:{...state.nameReply,rerollsLeft:0}});
    }
    return current(scope)?result.mapped:expired();
  }
  async function deleteMyData(confirmation) {
    if(confirmation?.confirm!==true)return ctx.refuse('confirmation_required');
    const scope=store.scope();
    const result = await transport.change({route: '/api/me', method: 'del',
      body: {confirm: true}, kind: 'me'});
    if(!current(scope))return expired();
    if (result.reply?.ok && result.mapped.accepted) {
      if (result.reply.data?.deleted !== true) return ctx.refuse('invalid_request');
      ctx.onDeleted?.();
      await ctx.signOut();
    }
    return result.mapped;
  }
  return {rerollName, deleteMyData};
}
