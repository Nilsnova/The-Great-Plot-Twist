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

export const ARSENAL_PATHS = Object.freeze({
  state: code => `/api/island/arsenal${code ? `?code=${encodeURIComponent(code)}` : ''}`,
  buy: '/api/island/arsenal/buy', take: '/api/island/arsenal/take', giveBack: '/api/island/arsenal/return',
});

export function createArsenalApi({transport, makeUid = makeActionUid} = {}) {
  const held = new Map();
  async function ask(send) {
    let result;
    try { result = await send(); } catch { result = {ok: false, status: 0, code: 'network_error', message: MESSAGES.network}; }
    if (!result?.ok) return readFailure(result);
    if (!readArsenal(result.data)) return {ok: false, status: 502, code: 'unreadable', message: MESSAGES.unreadable};
    return {ok: true, status: result.status ?? 200, data: result.data};
  }
  async function write(key, send) {
    const actionUid = held.get(key) ?? makeUid();
    held.set(key, actionUid);
    const answer = await ask(() => send(actionUid));
    if (answer.ok || !outcomeUnknown(answer)) held.delete(key);
    return answer;
  }
  const where = code => (code ? displayIslandCode(code) : '');
  const withCode = code => (where(code) ? {code: where(code)} : {});
  return {
    state: code => ask(() => transport.get(ARSENAL_PATHS.state(where(code)))),
    buy: ({weapon, code = null} = {}) => write(`buy:${where(code)}:${weapon}`,
      actionUid => transport.post(ARSENAL_PATHS.buy, {weapon, actionUid, ...withCode(code)})),
    take: ({copy, code = null} = {}) => write(`take:${where(code)}:${copy}`,
      actionUid => transport.post(ARSENAL_PATHS.take, {copy, actionUid, ...withCode(code)})),
    giveBack: ({code = null} = {}) => write(`return:${where(code)}`,
      actionUid => transport.post(ARSENAL_PATHS.giveBack, {actionUid, ...withCode(code)})),
  };
}
