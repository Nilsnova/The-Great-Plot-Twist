// Chooses the adapter the desk talks to.
//   * In development with ?desk=local in the address: the practice desk, a fake that never calls a server.
//   * Everywhere else: the real server, through a request supplied by the game's composition hook.
//
// The practice desk is loaded with a dynamic import inside a development-only branch, so the production
// build drops it: it is not in the files players download (tests/predictions/adapter-choice.test.js
// checks the guard, and the build can be searched for the label "Practice desk").
//
// Uses the shared in-memory account session through the A2 API client.
//
// Used by: desk.js and the tests.

import { createHttpDeskAdapter, makeStakeId } from './adapter-http.js';
import {predictionEnabled} from './g9-policy.js';
import {CLOSED_LINE, GENERIC_LINE, SIGN_IN_LINE} from './messages.js';

export async function createDeskAdapter({search = globalThis.location?.search ?? '', request, getFlags,
  getIdentity = () => null} = {}) {
  const wantsPractice = new URLSearchParams(search).get('desk') === 'local';
  if (import.meta.env.DEV && wantsPractice) {
    const practice = await import('./adapter-fake.js');
    return Object.assign(practice.createFakeDeskAdapter(), {practice: true});
  }
  const available = request && ['get', 'post', 'publicGet'].every(key => typeof request[key] === 'function');
  if (new URLSearchParams(search).get('demo') === '1' || !available || !predictionEnabled(getFlags)) {
    const closed = async () => ({kind: 'closed', message: CLOSED_LINE});
    return {label: null, makeStakeId, list: closed, mine: closed, stake: closed, settle: closed};
  }
  const http = createHttpDeskAdapter({request, publicGet: request.publicGet.bind(request)});
  const identity = () => { try { return getIdentity(); } catch { return null; } };
  const signin = () => ({kind: 'signin', message: SIGN_IN_LINE});
  const closed = () => ({kind: 'closed', message: CLOSED_LINE});
  async function privateCall(method, body) {
    const before = identity();
    if (before == null) return signin();
    if (!predictionEnabled(getFlags)) return closed();
    let result;
    try { result = await http[method](body); }
    catch { result = {kind: 'unknown', status: 0, message: GENERIC_LINE}; }
    if (!Object.is(identity(), before)) return signin();
    return predictionEnabled(getFlags) ? result : closed();
  }
  return {...http,
    list: async () => predictionEnabled(getFlags) ? http.list() : closed(),
    mine: () => privateCall('mine'), stake: body => privateCall('stake', body),
    settle: async () => ({kind: 'refused', status: 403, code: 'forbidden',
      message: 'This action is not available to this account.'}),
  };
}
