// Read and change the own-origin API; recovery never guesses a game reward or advances a case.
import {validReadReply} from './read-shapes.js';
import {mapApiResult} from './reasons.js';
import {createUidFactory} from './uid.js';

const okay = () => ({accepted: true, reason: null, message: ''});
export function createAdapterTransport(ctx) {
  const {state, session, api, publicApi, store} = ctx;
  const pending = new Map();
  const makeUid = createUidFactory({random: ctx.random, now: ctx.now});

  function apply(kind, data) {
    if (!data || typeof data !== 'object') return;
    if (kind === 'config') store.commit({config: structuredClone(data)});
    if (kind === 'me') store.commit({me: structuredClone(data), accountState: 'signed_in'});
    if (kind === 'crew') store.commit({crew: data.crew ?? null});
    if (kind === 'save') store.commit({cloudSave: structuredClone(data)});
  }

  async function read(kind) {
    const publicRead = kind === 'config';
    if (store.isClosed()) return {mapped: ctx.refuse('disposed')};
    if (!publicRead && !session.isSignedIn()) return {mapped: ctx.refuse('sign_in_required')};
    const scope = store.scope();
    const route = {config: '/api/config', me: '/api/me', crew: '/api/crews/me', save: '/api/save'}[kind];
    let reply;
    try { reply = await (publicRead ? publicApi : api).get(route); }
    catch { reply = {ok: false, status: 0}; }
    if (store.isClosed() || (!publicRead && !store.isCurrent(scope))) {
      return {mapped: ctx.refuse(store.isClosed() ? 'disposed' : 'session_expired')};
    }
    const mapped = reply.ok && !validReadReply(kind, reply.data)
      ? mapApiResult({ok:false,status:502,code:'database_error'})
      : mapApiResult(reply, {route, method: 'GET'});
    if (mapped.accepted) apply(kind, reply.data);
    else store.commit({notice: {reason: mapped.reason, message: mapped.message}});
    return {reply, mapped};
  }

  async function recover(kind, recovery, scope) {
    if (!store.isCurrent(scope) || !session.isSignedIn()) return;
    if (recovery === 'init_name') {
      const reply = await api.post('/api/me/name');
      if (store.isCurrent(scope) && reply.ok) store.commit({nameReply: reply.data});
      return;
    }
    if (kind) await read(kind);
  }

  async function change({route, body, kind, method = 'post', actionUid = false}) {
    const scope = store.scope();
    const key = `${method}:${route}:${JSON.stringify(body)}`;
    const uid = actionUid ? pending.get(key) ?? makeUid() : null;
    if (uid) pending.set(key, uid);
    const payload = uid ? {...body, actionUid: uid} : body;
    const send = () => api[method](route, payload);
    let reply = await send();
    let mapped = mapApiResult(reply, {route, method: method.toUpperCase()});
    if (['unknown_outcome', 'retry_once', 'init_name'].includes(mapped.recovery)) {
      await recover(kind, mapped.recovery, scope);
      if (store.isCurrent(scope) && session.isSignedIn() && route !== '/api/save') {
        reply = await send();
        mapped = mapApiResult(reply, {route, method: method.toUpperCase()});
      }
    }
    if (!store.isCurrent(scope)) return {mapped: ctx.refuse(store.isClosed() ? 'disposed' : 'session_expired')};
    if (mapped.recovery === 'reread') await recover(kind, mapped.recovery, scope);
    if (!store.isCurrent(scope)) return {mapped: ctx.refuse(store.isClosed() ? 'disposed' : 'session_expired')};
    if (mapped.recovery !== 'unknown_outcome') pending.delete(key);
    return {reply, mapped: mapped ?? okay()};
  }
  return {read, change, clearPending: () => pending.clear()};
}
