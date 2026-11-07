// The HTTP adapter: the four calls of the desk, and the one place where an answer of the server is
// turned into a "reply" the rest of the desk understands. No DOM.
//
//   const adapter = createHttpDeskAdapter({ request });      // request has get(path, options) and post(path, body)
//   const reply = await adapter.stake({ questionId, side, amount, stakeId });
//
// Every call answers with one reply, and `kind` says what to do:
//   ok       { data }                             a good answer
//   done     { alreadyApplied, code, message }    409 already_applied: the action was done before, so it counts as done
//   closed   { message }                          404 feature_off: the desk is switched off
//   signin   { message }                          401: ask the player to sign in
//   wait     { code, seconds, message }           429: wait, then press Confirm again (nothing changed)
//   refused  { status, code, message }            a clear "no" (403, 404, 409, 422, and a 503 that changed nothing)
//   unknown  { status, code, message }            no answer or a server error: the outcome is not known, a retry
//                                                 with the same stake id is safe
//
// Used by: adapter.js, adapter-fake.js, flow.js (through the adapter) and the tests.

import { CLOSED_LINE, GENERIC_LINE, SIGN_IN_LINE, waitText, sentenceFor } from './messages.js';

// A 503 with one of these codes is sent before any coin could move, so the outcome is known: nothing happened.
const NOTHING_CHANGED = new Set(['predictions_unavailable', 'source_unavailable', 'database_not_configured']);
const retryDeadlines = new WeakMap();
// Private receipt-clock metadata survives asynchronous parallel reads without adding public reply fields.
export function predictionRetryUntil(reply) {
  if (!reply || typeof reply !== 'object' || reply.kind !== 'wait') return 0;
  if (!retryDeadlines.has(reply)) {
    const seconds = reply.seconds;
    const valid = typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0 && seconds <= 86400;
    retryDeadlines.set(reply, valid ? Date.now() + Math.ceil(seconds) * 1000 : 0);
  }
  return retryDeadlines.get(reply);
}


export function replyFrom(result) {
  if (result.ok) return { kind: 'ok', data: result.data };
  const { status, code, message } = result;
  if (status === 404 && ['feature_off', 'not_found'].includes(code)) return { kind: 'closed', message: CLOSED_LINE };
  if (status === 401) return { kind: 'signin', message: SIGN_IN_LINE };
  if (status === 429) {
    const seconds = result.retryAfterSeconds ?? null;
    const reply = {kind: 'wait', code, seconds, message: waitText(seconds)};
    predictionRetryUntil(reply); return reply;
  }
  if (status === 409 && code === 'already_applied') return { kind: 'done', alreadyApplied: true, code, message };
  const transport = status === 0 || (status >= 500 && status <= 599);
  const lostAnswer = status === 0 || (status >= 500 && !(status === 503 && NOTHING_CHANGED.has(code)));
  return {kind: lostAnswer ? 'unknown' : 'refused', status, code, message: transport ? sentenceFor(code) : message};
}

// A good status with an answer that is not the list or "mine" (an empty body, a web page from a server that
// does not know the route) must not reach the screen. It counts as an answer that did not come through.
const isList = data => Array.isArray(data?.questions);
const isMine = data => Array.isArray(data?.stakes) && Number.isInteger(data?.coins);

function checked(reply, isValid) {
  if (reply.kind !== 'ok' || isValid(reply.data)) return reply;
  return { kind: 'unknown', status: 200, code: 'bad_answer', message: GENERIC_LINE };
}

// A stake id is 8 to 64 characters from letters, digits, hyphen and underscore. A UUID fits.
export function makeStakeId() {
  const { crypto } = globalThis;
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof crypto?.getRandomValues === 'function') crypto.getRandomValues(bytes);
  else bytes.forEach((_, index) => { bytes[index] = Math.floor(Math.random() * 256); });
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function createHttpDeskAdapter({request, publicGet = path => request.get(path, {anonymous: true})}) {
  return {
    label: null,
    makeStakeId,
    list: async () => checked(replyFrom(await publicGet('/api/predictions')), isList),
    mine: async () => checked(replyFrom(await request.get('/api/predictions/mine')), isMine),
    stake: async ({ questionId, side, amount, stakeId }) =>
      replyFrom(await request.post('/api/predictions/stake', { questionId, side, amount, stakeId })),
    settle: async ({ questionId, outcome }) =>
      replyFrom(await request.post('/api/predictions/settle', { questionId, outcome })),
  };
}
