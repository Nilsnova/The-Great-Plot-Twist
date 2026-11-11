// The HTTP side of the market stall: "Up or down in 5 minutes?" (INTERFACES.md, the market stall, D034).
// The only file of the stall that names a route. It talks through the private request of
// online/market-policy.js (signed in, flag `market`), so it never holds a token itself.
//   const adapter = createCallsHttpAdapter({request});
//   await adapter.read();                                         // GET  /api/market/calls
//   await adapter.place({asset, direction, stake}, {uid});        // POST /api/market/calls
// Every call resolves and none throws: {ok: true, data} or {ok: false, code, message, status}.
// status 0 means no answer came at all. One uid belongs to one confirmed click; the same uid sent again
// answers the same call and charges nothing, so "Send again" after "We did not hear back" is safe.
// A POST whose outcome is not known (no answer, a 5xx other than 503 market_unavailable, an answer we
// cannot read) has the code "outcome_unknown".
import {makeActionUid} from '../screens/market/uid.js';

export const CALLS_PATH = '/api/market/calls';
// The only 503 of these routes that says nothing was done (the market files could not be read).
const NOTHING_DONE = new Set(['market_unavailable']);

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isCall = value => isObject(value) && typeof value.id === 'string' && typeof value.asset === 'string'
  && typeof value.status === 'string';
export const isBoard = value => isObject(value) && Array.isArray(value.assets) && Array.isArray(value.calls);

const failure = (code, status, message = '') => ({ok: false, code, message, status});
const unknown = status => failure('outcome_unknown', status);

function interpret(result, write) {
  if (!result || typeof result.ok !== 'boolean') return write ? unknown(0) : failure('bad_response', 0);
  const status = Number.isInteger(result.status) ? result.status : result.ok ? 200 : 0;
  if (result.ok) {
    if (write ? isCall(result.data) : isBoard(result.data)) return {ok: true, data: result.data};
    return write ? unknown(status) : failure('bad_response', status);
  }
  if (status === 0) return write ? unknown(0) : failure('network_error', 0);
  const code = status === 401 ? 'unauthorized' : status === 429 ? 'too_many_requests'
    : typeof result.code === 'string' && result.code ? result.code : status >= 500 ? 'server_error' : 'bad_response';
  if (write && status >= 500 && !(status === 503 && NOTHING_DONE.has(code))) return unknown(status);
  return failure(code, status, typeof result.message === 'string' ? result.message : '');
}

export function createCallsHttpAdapter({request, makeUid = makeActionUid} = {}) {
  async function call(options, write) {
    if (typeof request !== 'function') return failure('not_ready', 503);
    try { return interpret(await request(CALLS_PATH, options), write); }
    catch { return write ? unknown(0) : failure('network_error', 0); }
  }
  return {
    read: () => call({method: 'GET'}, false),
    place: ({asset, direction, stake} = {}, {uid} = {}) =>
      call({method: 'POST', body: {asset, direction, stake, actionUid: uid ?? makeUid()}}, true),
  };
}
