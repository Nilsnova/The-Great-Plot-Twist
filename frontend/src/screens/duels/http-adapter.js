// The HTTP adapter: how the duel screen talks to the server. It reads GET /api/config once per
// opening, then polls GET /api/duels on the schedule in poll.js, and hands the three intents
// (challenge, answer, cancel) to http-intents.js. The server decides every outcome (D003): the
// browser sends signals and ids, never a result, a winner or an amount. The sign-in token comes
// from getToken(); until package A2 there is none, and the panel then says how to sign in.
// Used by: index.js. Tested in tests/duels-http.test.js.
import { createClient, duelPath } from './http-client.js';
import { createIntents } from './http-intents.js';
import { createPoller } from './poll.js';
import { createViewStore } from './view-store.js';
import { decidedMessage, messageFor } from './messages.js';
import { otherCaptainName } from './logic.js';

const PASSING_NOTICES = ['retrying', 'too_many_requests']; // failures that a good list read clears

export function createHttpAdapter({ fetchImpl = globalThis.fetch, getToken = () => null, now = Date.now } = {}) {
  const store = createViewStore({ mode: 'loading' });
  const client = createClient({ fetchImpl, getToken });
  const poller = createPoller({ ask, now, onMode: polling => store.set({ polling }) });
  const intents = createIntents({ client, store, poller, loadDetail });
  let flagChecked = false;

  const closed = () => {
    store.set({ mode: 'closed' });
    store.notify('feature_off');
    return { halt: true };
  };
  const signedOut = () => {
    store.set({ mode: 'signed_out' });
    store.notify('unauthorized');
    return { halt: true };
  };

  // A poll failed: keep the last view, say so, and let the poller wait longer.
  function pollFailed(answer) {
    if (answer.status === 429) {
      store.notify('too_many_requests');
      return { retryAfterMs: answer.retryAfterMs };
    }
    if (store.read().mode === 'loading') store.set({ mode: 'unavailable' });
    store.notify('retrying');
    return { failed: true };
  }

  async function loadDetail(duelId) {
    const answer = await client.send('GET', duelPath(duelId));
    if (answer.ok) store.showDetail(answer.data.duel);
    return answer;
  }

  // A challenge this player waited on is decided: fetch its reveal and tell them.
  async function loadDecided(summary) {
    const answer = await loadDetail(summary.id);
    if (!answer.ok) return;
    const name = otherCaptainName(summary) ?? 'the other captain';
    store.notify('decided', { message: decidedMessage(name), duelId: summary.id });
  }

  async function takeList(data) {
    store.clearNotice(PASSING_NOTICES);
    const { changed, decided } = store.applyList(data, { nowMs: now(), mode: 'ready' });
    for (const summary of decided) await loadDecided(summary);
    return { changed };
  }

  // One poll: the flag once per opening, then the list. The poller reads the result.
  async function ask() {
    if (!flagChecked) {
      const config = await client.send('GET', '/api/config', { auth: false });
      if (!config.ok) return pollFailed(config);
      flagChecked = true;
      if (!config.data?.flags?.arena) return closed();
    }
    const answer = await client.send('GET', '/api/duels');
    if (answer.ok) return takeList(answer.data);
    if (answer.status === 401) return signedOut();
    if (answer.code === 'feature_off') return closed();
    return pollFailed(answer);
  }

  async function select(duelId) {
    store.clearNotice();
    const answer = await loadDetail(duelId);
    if (answer.ok) return { ok: true, view: store.read() };
    store.notify(answer.code);
    return { ok: false, code: answer.code, message: messageFor(answer.code), view: store.read() };
  }

  async function refresh() {
    await poller.kick();
    return { ok: true, view: store.read() };
  }

  return {
    read: store.read,
    subscribe: store.subscribe,
    refresh,
    challenge: args => intents.perform('challenge', args),
    answer: (duelId, signals) => intents.perform('answer', { duelId, signals }),
    cancel: duelId => intents.perform('cancel', { duelId }),
    select,
    retry: () => intents.retry() ?? refresh(),
    setVisible(isVisible) {
      if (isVisible) flagChecked = false; // /api/config is read once per opening
      return poller.setVisible(isVisible);
    },
    dispose() {
      poller.dispose();
      store.dispose();
    },
  };
}
