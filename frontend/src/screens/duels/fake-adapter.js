// The practice adapter (?arena=local, development only): the same surface as the HTTP adapter,
// backed by the in-memory practice ring. A stand-in rival answers the player's challenge about
// 6 seconds later, with a seeded random sequence, so the whole panel can be tried with no server.
// Nothing is saved and nothing leaves the page. Pass rivalDelayMs: null to keep the rival silent.
// Used by: index.js (development only) and the tests.
import { seededRandom } from '../../core/math.js';
import { createRing, FAKE_SEED } from './fake-ring.js';
import { createViewStore } from './view-store.js';
import { decidedMessage, messageFor } from './messages.js';
import { newActionUid, otherCaptainName } from './logic.js';

export const RIVAL_DELAY_MS = 6000;

export function createFakeAdapter({ now = Date.now, seed = FAKE_SEED, rivalDelayMs = RIVAL_DELAY_MS } = {}) {
  const ring = createRing({ now, random: seededRandom(seed) });
  const store = createViewStore({ mode: 'practice' });
  const timers = new Set();
  let disposed = false;

  // A challenge the rival has just decided gets its reveal ready, as a poll would on the server.
  function announce(summary) {
    const result = ring.detail(summary.id);
    if (!result.ok) return;
    store.showDetail(result.duel);
    store.notify('decided', { message: decidedMessage(otherCaptainName(summary) ?? 'the other captain'), duelId: summary.id });
  }

  function readRing() {
    const { decided } = store.applyList(ring.list(), { nowMs: now(), mode: 'practice' });
    decided.forEach(announce);
  }

  function scheduleRival(id) {
    if (rivalDelayMs === null) return;
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (!disposed && ring.rivalAnswers(id)) readRing();
    }, rivalDelayMs);
    timers.add(timer);
  }

  // Every intent ends the same way: show the duel or the refusal, read the lists, answer.
  function finish(result) {
    if (result.ok) store.showDetail(result.duel);
    else store.notify(result.code);
    readRing();
    return Promise.resolve(result.ok ? { ok: true, view: store.read() } : { ok: false, code: result.code, message: messageFor(result.code), view: store.read() });
  }

  async function challenge(input) {
    store.clearNotice();
    const result = ring.challenge({ ...input, actionUid: newActionUid() });
    if (result.ok) scheduleRival(result.duel.id);
    return finish(result);
  }

  async function answer(duelId, signals) {
    store.clearNotice();
    return finish(ring.answer(duelId, signals, newActionUid()));
  }

  async function cancel(duelId) {
    store.clearNotice();
    return finish(ring.cancel(duelId));
  }

  async function select(duelId) {
    store.clearNotice();
    return finish(ring.detail(duelId));
  }

  async function refresh() {
    readRing();
    return { ok: true, view: store.read() };
  }

  readRing();
  return {
    read: store.read,
    subscribe: store.subscribe,
    refresh, challenge, answer, cancel, select,
    retry: refresh, // the practice ring never loses an answer, so there is nothing to resend
    setVisible(isVisible) {
      if (isVisible) readRing();
      return Promise.resolve();
    },
    dispose() {
      disposed = true;
      timers.forEach(clearTimeout);
      timers.clear();
      store.dispose();
    },
  };
}
