// The arsenal's server calls (T40, D042): GET /api/island/arsenal and POST .../buy, .../take, .../return
// (backend/server/routes/arsenal.py). The same answer shape and failure shape as api.js. A write carries one
// click id (actionUid); when its outcome is unknown (no answer, a timeout, a 5xx) the id is kept and the next
// try of the same action sends it again, so the server never buys or moves twice. Any clear answer drops it.
//   const api = createArsenalApi({transport});
//   await api.state(code)                 // code: a friend's game (ISLE-XXXXX), or null for your own island
//   await api.buy({weapon, code}) / api.take({copy, code}) / api.giveBack({code})
import {makeActionUid} from '../screens/islet/action-uid.js';
import {MESSAGES, outcomeUnknown, readFailure} from './api.js';
import {displayIslandCode} from './codes.js';
import {readArsenal} from './arsenal-model.js';
import {ECONOMY_CAPABILITY_HEADERS} from '../online/api.js';
import {arsenalOrigin, isArsenalEconomy, isArsenalLegacyContext, readArsenalReceipt, readSharedArsenal} from './arsenal-shared-state.js';
import {defaultArsenalPendingStore, pendingArsenalIntent} from './arsenal-pending.js';

export const ARSENAL_PATHS = Object.freeze({
  state: code => `/api/island/arsenal${code ? `?code=${encodeURIComponent(code)}` : ''}`,
  buy: '/api/island/arsenal/buy', take: '/api/island/arsenal/take', giveBack: '/api/island/arsenal/return',
});

export function createArsenalApi(options = {}) {
  const {transport, makeUid = makeActionUid, getEconomy,
    getActorId = () => null, pendingStore = defaultArsenalPendingStore()} = options;
  const legacyFactory = !('getEconomy' in options);
  const selectedEconomy = () => typeof getEconomy === 'function' ? getEconomy() : null;
  const held = new Map();
  const knownShared = new Set(), capability = {headers: ECONOMY_CAPABILITY_HEADERS};
  async function ask(send, valid = readArsenal) {
    let result;
    try { result = await send(); } catch { result = {ok: false, status: 0, code: 'network_error', message: MESSAGES.network}; }
    if (!result?.ok) return readFailure(result);
    if (!valid(result.data)) return {ok: false, status: 502, code: 'unreadable', message: MESSAGES.unreadable};
    return {ok: true, status: result.status ?? 200, data: result.data};
  }
  async function write(key, send) {
    const actionUid = held.get(key) ?? makeUid();
    held.set(key, actionUid);
    const answer = await ask(() => send(actionUid));
    if (answer.ok || (!outcomeUnknown(answer) && answer.status !== 429)) held.delete(key);
    return answer;
  }
  const where = code => (code ? displayIslandCode(code) : '');
  const withCode = code => (where(code) ? {code: where(code)} : {});
  const blocked = () => ({ok: false, status: 409, code: 'economy_context_required', message: 'Wait for your island to load and try again.'});
  async function change(kind, values, code) {
    const economy = selectedEconomy(), actor = getActorId();
    if (legacyFactory || isArsenalLegacyContext(economy)) {
      if (knownShared.has(`${actor}:${where(code)}`)) return blocked();
      const key = `${kind}:${where(code)}:${values.weapon ?? values.copy ?? ''}`;
      return write(key, actionUid => transport.post(ARSENAL_PATHS[kind], {
        ...(kind === 'giveBack' ? {} : {[(kind === 'buy' ? 'weapon' : 'copy')]: kind === 'buy' ? values.weapon : values.copy}),
        actionUid, ...withCode(code),
      }));
    }
    if (!isArsenalEconomy(economy)) return blocked();
    if (kind !== 'buy' && (typeof values.copy !== 'string' || typeof values.holderGeneration !== 'string')) return blocked();
    const body = {...(kind === 'buy' ? {weapon: values.weapon} : {copy: values.copy, holderGeneration: values.holderGeneration}),
      economy: {mode: economy.mode, version: economy.version, islandOwner: economy.islandOwner, runEpoch: economy.runEpoch}};
    const pending = pendingArsenalIntent(pendingStore, actor, economy, kind, body, makeUid);
    if (!pending) return {ok: false, status: 0, code: 'action_not_saved', message: 'This action could not be saved. Try again.'};
    const action = {buy: 'arsenal_buy', take: 'arsenal_withdraw', giveBack: 'arsenal_return'}[kind];
    const answer = await ask(() => transport.post(ARSENAL_PATHS[kind], pending.body, capability), value => {
      if (!readArsenalReceipt(value, actor, pending.origin, pending.body.actionUid) || value.receipt.action !== action) return false;
      const effect = value.receipt.result;
      return kind === 'buy' ? effect.weapon === pending.body.weapon : effect.copyId === pending.body.copy
        && BigInt(effect.holderGeneration) === BigInt(pending.body.holderGeneration) + 1n;
    });
    if (answer.ok || (!outcomeUnknown(answer) && answer.status !== 429)) {
      try { pendingStore.removeItem(pending.key); } catch { /* A retained UID can only replay its original effect. */ }
    }
    if (!answer.ok) return answer;
    return {...answer, data: answer.data.arsenal, receipt: answer.data.receipt, repeat: answer.data.repeat,
      economy: answer.data.currentEconomy, expectedOrigin: pending.origin};
  }
  return {
    state: async code => {
      const economy = selectedEconomy(), expectedOrigin = isArsenalEconomy(economy) ? arsenalOrigin(economy) : null;
      const actor = getActorId();
      const answer = await ask(() => transport.get(ARSENAL_PATHS.state(where(code)), capability));
      if (answer.ok && economy?.mode === 'island_shared' && !readSharedArsenal(answer.data)) return {ok: false, status: 502, code: 'unreadable', message: MESSAGES.unreadable};
      if (answer.ok && readSharedArsenal(answer.data)) knownShared.add(`${actor}:${where(code)}`);
      return {...answer, expectedOrigin};
    },
    buy: ({weapon, code = null} = {}) => change('buy', {weapon}, code),
    take: ({copy, holderGeneration, code = null} = {}) => change('take', {copy, holderGeneration}, code),
    giveBack: ({copy, holderGeneration, code = null} = {}) => change('giveBack', {copy, holderGeneration}, code),
  };
}
