// The three things a player can send: a challenge, an answer, a withdraw or decline. Each gets one
// actionUid, kept until the server gives a definite answer (2xx or 4xx). After a network failure
// or a 5xx the outcome is unknown, so the intent is kept and retry() sends the SAME actionUid:
// a lost answer can never make two challenges. 409 already_applied means "done before": treated
// as done. The server decides every outcome; this file sends choices and ids, never a result.
// Used by: http-adapter.js. Tested through it in tests/duels-http.test.js.
import { duelPath } from './http-client.js';
import { messageFor } from './messages.js';
import { newActionUid } from './logic.js';

// What each intent sends. The cancel route has no body and needs no uid.
const REQUESTS = {
  challenge({ opponentName, rounds, stake, signals }, actionUid) {
    const name = (opponentName ?? '').trim();
    const body = { rounds, stake, signals, actionUid };
    return { path: '/api/duels', body: name ? { opponentName: name, ...body } : body };
  },
  answer: ({ duelId, signals }, actionUid) => ({ path: `${duelPath(duelId)}/move`, body: { signals, actionUid } }),
  cancel: ({ duelId }) => ({ path: `${duelPath(duelId)}/cancel` }),
};

export function createIntents({ client, store, poller, loadDetail }) {
  let pending = null; // the intent whose outcome is unknown, kept with its actionUid

  function finish(intent) {
    if (pending === intent) pending = null;
    store.set({ canRetry: pending !== null });
  }

  async function succeeded(intent, data) {
    finish(intent);
    if (data?.duel) store.showDetail(data.duel);
    if (Number.isInteger(data?.coins)) store.set({ coins: data.coins });
    await poller.kick();
    return { ok: true, view: store.read() };
  }

  // The server says this exact action was done before: treat it as done and read again.
  async function alreadyDone(intent) {
    finish(intent);
    if (intent.kind === 'answer') await loadDetail(intent.args.duelId);
    await poller.kick();
    return { ok: true, view: store.read() };
  }

  // No answer, or a 5xx: the outcome is unknown. Keep the intent, read the list, offer "Try again".
  async function lost(intent) {
    pending = intent;
    store.set({ canRetry: true });
    store.notify('database_unavailable');
    await poller.kick();
    return { ok: false, code: 'database_unavailable', message: messageFor('database_unavailable'), view: store.read() };
  }

  // A definite refusal: nothing changed on the server. One plain sentence; the last view stays.
  async function refused(intent, answer) {
    finish(intent);
    if (answer.status === 401) store.set({ mode: 'signed_out' });
    store.notify(answer.code);
    await poller.kick();
    return { ok: false, code: answer.code, message: messageFor(answer.code), view: store.read() };
  }

  async function perform(kind, args) {
    store.clearNotice();
    const isRepeat = pending?.kind === kind && JSON.stringify(pending.args) === JSON.stringify(args);
    const intent = isRepeat ? pending : { kind, args, uid: newActionUid() };
    const request = REQUESTS[kind](args, intent.uid);
    const answer = await client.send('POST', request.path, { body: request.body });
    if (answer.ok) return succeeded(intent, answer.data);
    if (answer.code === 'already_applied') return alreadyDone(intent);
    if (answer.network || answer.status >= 500) return lost(intent);
    return refused(intent, answer);
  }

  // Sends the unfinished intent again with its own actionUid, or returns null if there is none.
  const retry = () => (pending ? perform(pending.kind, pending.args) : null);

  return { perform, retry };
}
