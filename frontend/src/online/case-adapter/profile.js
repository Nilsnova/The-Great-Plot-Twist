// Account intents forward accepted action logs and authoritative replies, never local kit rules.
import {validReplay} from './replay.js';
import {validIntroReply, validNameReply} from './profile-shapes.js';
export function createProfileHandlers(ctx) {
  const {store, state, transport} = ctx;
  async function completeIntro(receipt) {
    const result = await transport.change({route: '/api/intro/complete',
      body: {actions: [...receipt.actions]}, kind: 'me'});
    if (result.reply?.ok && result.mapped.accepted) {
      if (!validIntroReply(result.reply.data)) return ctx.refuse('invalid_request');
      store.commit({profile: result.reply.data});
      await transport.read('me');
    }
    return result.mapped;
  }
  async function rerollName() {
    const result = await transport.change({route: '/api/me/name/reroll',
      body: {}, kind: 'me', actionUid: true});
    if (result.reply?.ok && result.mapped.accepted) {
      const nameReply = result.reply.data;
      if (!validNameReply(nameReply)) return ctx.refuse('invalid_request');
      store.commit({nameReply, me: state.me ? {...state.me, captainName:nameReply.captainName} : null});
    }
    if (result.mapped.accepted) await transport.read('me');
    return result.mapped;
  }
  async function continueGame() {
    if (!ctx.session.isSignedIn()) {
      store.commit({continuation: {source: 'local', kind: 'intro', actions: null, place: 'lighthouse_isle'}});
      return ctx.accept('Your local intro is ready.');
    }
    if (state.saveState === 'conflict') return ctx.refuse('save_conflict');
    const scope = store.scope();
    const me = await transport.read('me');
    if (!me.mapped.accepted) return me.mapped;
    const saved = await transport.read('save');
    const missing = saved.reply?.status === 404 && saved.reply.code === 'player_not_set_up';
    if (!saved.mapped.accepted && !(missing && state.me?.kit)) return saved.mapped;
    if (!store.isCurrent(scope)) return ctx.refuse('session_expired');
    if (missing) store.commit({cloudSave: null});
    const data = state.cloudSave?.data;
    if (validReplay(data)) {
      store.commit({continuation: {source: 'cloud', kind: data.kind,
        actions: [...data.actions], place: data.kind === 'world' ? state.me?.place : 'lighthouse_isle'}});
    } else if (state.me?.kit) {
      store.commit({continuation: {source: 'cloud', kind: 'world', actions: [], place: state.me.place}});
    } else store.commit({continuation: {source: 'local', kind: 'intro', actions: null, place: 'lighthouse_isle'}});
    return ctx.accept('Your saved progress is ready.');
  }
  async function deleteMyData() {
    const result = await transport.change({route: '/api/me', method: 'del',
      body: {confirm: true}, kind: 'me'});
    if (result.reply?.ok && result.mapped.accepted) {
      if (result.reply.data?.deleted !== true) return ctx.refuse('invalid_request');
      await ctx.signOut();
    }
    return result.mapped;
  }
  return {completeIntro, rerollName, continueGame, deleteMyData,
    resolveSaveConflict: () => ctx.refuse('not_ready')};
}
