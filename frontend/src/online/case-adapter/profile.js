// Account intents forward accepted action logs and authoritative replies, never local kit rules.
import {validReplay} from './replay.js';
import {validIntroReply, validNameReply} from './profile-shapes.js';
import {replaySaveData} from './saves.js';
import {refreshAccountRewards} from './rewards.js';

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
  async function completeIntro(receipt) {
    const scope=store.scope();
    const result = await transport.change({route: '/api/intro/complete',
      body: {actions: [...receipt.actions]}, kind: 'me'});
    if (result.reply?.ok && result.mapped.accepted) {
      if (!validIntroReply(result.reply.data)) return ctx.refuse('invalid_request');
      store.commit({profile: result.reply.data});
      await transport.read('me');
      if(!store.isCurrent(scope))return ctx.refuse('session_expired');
      await ctx.saves?.stageReplay({kind:'world',actions:[...receipt.actions],
        place:result.reply.data.kit.startPlace},{immediate:true});
      await refreshAccountRewards(ctx);
    }
    return result.mapped;
  }
  async function rerollName() {
    const scope=store.scope();
    const result = await transport.change({route: '/api/me/name/reroll',
      body: {}, kind: 'me', actionUid: true});
    if (result.reply?.ok && result.mapped.accepted) {
      const nameReply = result.reply.data;
      if (!validNameReply(nameReply)) return ctx.refuse('invalid_request');
      store.commit({nameReply, me: state.me ? {...state.me, captainName:nameReply.captainName} : null});
    }
    if (result.mapped.accepted) {
      await transport.read('me');
      if(!store.isCurrent(scope))return ctx.refuse('session_expired');
      if(result.reply?.ok!==true)await initializeAccountName(ctx);
    } else if(result.mapped.reason==='name_reroll_used'&&state.nameReply){
      store.commit({nameReply:{...state.nameReply,rerollsLeft:0}});
    }
    return result.mapped;
  }
  async function continueGame() {
    if (!ctx.session.isSignedIn()) {
      store.commit({continuation: {source: 'local', kind: 'intro', actions: null, place: 'lighthouse_isle'}});
      return ctx.accept('Your local intro is ready.');
    }
    const started = store.scope();
    await ctx.readMonitor?.retryFailed();
    if (!store.isCurrent(started)) return ctx.refuse('session_expired');
    await ctx.waitForSave?.();
    if (!store.isCurrent(started)) return ctx.refuse('session_expired');
    if (state.saveState === 'conflict') return ctx.refuse('save_conflict');
    const scope = store.scope();
    const me = await transport.read('me');
    if (!me.mapped.accepted) return me.mapped;
    const saved = await transport.read('save');
    const missing = saved.reply?.status === 404 && saved.reply.code === 'player_not_set_up';
    if (!saved.mapped.accepted && !(missing && state.me?.kit)) return saved.mapped;
    if (!store.isCurrent(scope)) return ctx.refuse('session_expired');
    if (saved.mapped.accepted) {
      const reconciled = ctx.saves?.reconcile?.();
      if (reconciled && !reconciled.accepted) return reconciled;
    }
    if (missing) store.commit({cloudSave: null});
    const data = replaySaveData(state.cloudSave?.data);
    if (validReplay(data)) {
      const kind=data.kind==='world'&&state.me?.kit?'world':'intro';
      store.commit({continuation: {source: 'cloud', kind,
        actions: [...data.actions], place: kind === 'world' ? data.place : 'lighthouse_isle'}});
    } else if (state.me?.kit) {
      store.commit({continuation: {source: 'cloud', kind: 'world', actions: [], place: state.me.place}});
    } else store.commit({continuation: {source: 'local', kind: 'intro', actions: null, place: 'lighthouse_isle'}});
    return ctx.accept('Your saved progress is ready.');
  }
  async function deleteMyData(confirmation) {
    if(confirmation?.confirm!==true)return ctx.refuse('confirmation_required');
    const result = await transport.change({route: '/api/me', method: 'del',
      body: {confirm: true}, kind: 'me'});
    if (result.reply?.ok && result.mapped.accepted) {
      if (result.reply.data?.deleted !== true) return ctx.refuse('invalid_request');
      ctx.onDeleted?.();
      await ctx.signOut();
    }
    return result.mapped;
  }
  return {completeIntro, rerollName, continueGame, deleteMyData,
    resolveSaveConflict: choice => ctx.saves?.resolve(choice)??ctx.refuse('not_ready')};
}
