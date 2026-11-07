// The three things a player can send: a challenge, an answer, a withdraw or decline. Each gets one
// actionUid, kept until the server gives a definite answer (2xx or 4xx). After a network failure
// or a 5xx the outcome is unknown, so the intent is kept and retry() sends the SAME actionUid:
// a lost answer can never make two challenges. 409 already_applied means "done before": treated
// as done. The server decides every outcome; this file sends choices and ids, never a result.
// Used by: http-adapter.js. Tested through it in tests/duels-http.test.js.
import { duelPath } from './http-client.js';
import { messageFor } from './messages.js';
import { newActionUid } from './logic.js';
import {validDuelDetail} from './http-shapes.js';

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

export function createIntents({ client, store, poller, loadDetail, begin=()=>null, current=()=>true,
  blocked=()=>null }) {
  let pending = null; // the intent whose outcome is unknown, kept with its actionUid
  let active = null;
  const stale=()=>({ok:false,code:'unauthorized',message:messageFor('unauthorized'),view:store.read()});

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
    store.notify(answer.code,{status:answer.status,retryAfterSeconds:answer.retryAfterMs/1000});
    await poller.kick();
    return { ok: false, code: answer.code, message: messageFor(answer.code), view: store.read() };
  }

  async function perform(kind, args) {
    const ticket=begin();if(!current(ticket))return stale();
    const denial=blocked();if(denial)return {ok:false,code:denial,message:messageFor(denial),view:store.read()};
    if(active)return {ok:false,code:'busy',message:messageFor('too_many_requests'),view:store.read()};
    const flight={};active=flight;
    try{
    store.clearNotice();
    const isRepeat = pending?.kind === kind && JSON.stringify(pending.args) === JSON.stringify(args);
    const intent = isRepeat ? pending : { kind, args:structuredClone(args), uid: newActionUid(), needsRead: false };
    if (isRepeat && intent.needsRead) {
      // A closed or hidden panel cannot learn whether its old POST was applied. Read first,
      // then only an explicit activation may repeat the exact body and UID.
      await poller.kick();
      if (!current(ticket) || pending !== intent) return stale();
      const view = store.read(), failure = view.notice?.code;
      if (view.mode !== 'ready' || ['retrying','too_many_requests','feature_off','unauthorized'].includes(failure)) {
        return {ok:false,code:failure ?? 'database_unavailable',message:messageFor(failure ?? 'database_unavailable'),view};
      }
    }
    // Keep ownership before sending: pause may happen while the response is still held.
    pending = intent; intent.needsRead = true;
    const request = REQUESTS[kind](intent.args, intent.uid);
    const answer = await client.send('POST', request.path, { body: request.body });
    if(!current(ticket)||answer.stale)return stale();
    if(answer.ok&&!validDuelDetail(answer.data))return await lost(intent);
    const result=answer.ok?await succeeded(intent,answer.data):answer.code==='already_applied'?await alreadyDone(intent)
      :answer.network||answer.status>=500?await lost(intent):await refused(intent,answer);
    return current(ticket)?result:stale();
    }finally{if(active===flight)active=null;}
  }

  // Sends the unfinished intent again with its own actionUid, or returns null if there is none.
  const retry = () => (pending ? perform(pending.kind, pending.args) : null);

  return { perform, retry, hasPending:()=>pending!==null,
    pause(){if(pending)pending.needsRead=true;active=null;},reset(){pending=null;active=null;} };
}

// A refused action's safe wait survives readback and ordinary hiding, never a private owner reset.
export function createDuelCooldown(dataStore, now) {
  let held = null;
  const waiting = () => held !== null && held.retryUntil > now();
  const store = {...dataStore,
    clearNotice(codes) { if (!waiting()) dataStore.clearNotice(codes); },
    notify(code, extra = {}) {
      if (extra.status === 429) {
        const seconds = extra.retryAfterSeconds;
        const wait = Number.isFinite(seconds) && seconds >= 0 ? Math.min(300000, seconds * 1000) : 0;
        const retryUntil = Math.max(held?.retryUntil ?? 0, now() + wait);
        held = {status: 429, retryAfterSeconds: wait / 1000, retryUntil};
        dataStore.notify('too_many_requests', held);
      } else if (!waiting()) dataStore.notify(code, extra);
    },
  };
  return {store, waiting, clear() { held = null; },
    restore() { if (waiting()) dataStore.notify('too_many_requests', held); }};
}
