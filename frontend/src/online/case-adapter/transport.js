// Read and change the own-origin API; recovery never guesses a game reward or advances a case.
import {validReadReply} from './read-shapes.js';
import {mapApiResult} from './reasons.js';
import {createUidFactory} from './uid.js';

const okay = () => ({accepted: true, reason: null, message: ''});
export function createAdapterTransport(ctx) {
  const {state, session, api, publicApi, store} = ctx;
  const pending = new Map();
  const reads = new Map();
  const readTokens = new Map();
  let readSequence = 0;
  const makeUid = createUidFactory({random: ctx.random, now: ctx.now});

  function apply(kind, data) {
    if (!data || typeof data !== 'object') return;
    if (kind === 'config') store.commit({config: structuredClone(data)});
    if (kind === 'me') store.commit({me: structuredClone(data), accountState: 'signed_in'});
    if (kind === 'crew') store.commit({crew: data.crew ?? null});
    if (kind === 'save') store.commit({cloudSave: structuredClone(data)});
  }

  async function readOnce(kind, {automatic = false, fresh = false} = {}, isLatest) {
    const publicRead = kind === 'config';
    if (store.isClosed()) return {mapped: ctx.refuse('disposed')};
    if (!publicRead && !session.isSignedIn()) return {mapped: ctx.refuse('sign_in_required')};
    const scope = store.scope();
    const finish = ctx.readMonitor?.begin(kind, {automatic, retry: () => kind === 'config' && ctx.refreshConfig
      ? ctx.refreshConfig({manual: true}) : ctx.retryRead ? ctx.retryRead(kind) : read(kind, {automatic: true})});
    const route = {config: '/api/config', me: '/api/me', crew: '/api/crews/me', save: '/api/save'}[kind];
    let reply;
    try { reply = await (publicRead ? publicApi : api).get(route); }
    catch { reply = {ok: false, status: 0}; }
    if (store.isClosed() || (!publicRead && !store.isCurrent(scope))) {
      const mapped = ctx.refuse(store.isClosed() ? 'disposed' : 'session_expired');
      finish?.({status: 401, mapped});
      return {mapped};
    }
    if (!isLatest()) return {stale: true, mapped: ctx.refuse('not_ready')};
    const mapped = reply.ok && !validReadReply(kind, reply.data)
      ? mapApiResult({ok:false,status:502,code:'database_error'})
      : mapApiResult(reply, {route, method: 'GET'});
    if (mapped.accepted) apply(kind, reply.data);
    else store.commit({notice: {reason: mapped.reason, message: mapped.message}});
    finish?.({status: reply.ok && !mapped.accepted ? 502 : reply.status, mapped});
    return {reply, mapped, ...(fresh ? {fresh: true} : {})};
  }

  function read(kind, options = {}) {
    const key = `${kind}:${kind === 'config' ? 'public' : store.scope()}`;
    if (reads.has(key) && options.fresh !== true) return reads.get(key);
    const token = ++readSequence;
    readTokens.set(key, token);
    const task = readOnce(kind, options, () => readTokens.get(key) === token).finally(() => { if (reads.get(key) === task) reads.delete(key); });
    reads.set(key, task);
    return task;
  }

  async function recover(kind, recovery, scope) {
    if (!store.isCurrent(scope) || !session.isSignedIn()) return;
    if (recovery === 'init_name') {
      const reply = await api.post('/api/me/name');
      if (store.isCurrent(scope) && reply.ok) store.commit({nameReply: reply.data});
      return;
    }
    if (kind) await (ctx.transport?.read ?? read)(kind, {fresh: true});
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
  return {read, change, clearPending() {
    // Account cleanup cannot supersede an anonymous config request still owned by the open adapter.
    const key='config:public',task=store.isClosed()?null:reads.get(key),token=readTokens.get(key);
    pending.clear();reads.clear();readTokens.clear();
    if(task&&token!==undefined){reads.set(key,task);readTokens.set(key,token);}
  }};
}
