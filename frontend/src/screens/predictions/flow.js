// What happens after a click on Confirm: which step of the form comes next, what the notice says,
// and whether the stake id is kept for a retry. Pure, so Vitest can test it without a browser.
//
// The rule for the stake id: it is made once, when the player confirms. If the answer is lost (no
// network, a timeout, a server error) the same stake is sent again with the same id, and the server
// counts it once. After any clear answer the id is dropped, so the next confirmed click is a new stake.
//
// Used by: questions-view.js, presenter-view.js and the tests.

import { CLOSED_LINE, SIGN_IN_LINE, refusalText, serverMessage } from './messages.js';
import { receiptText } from './presenter-model.js';
import { settledLine, stakePlacedLine } from './view-model.js';
import {cancelledStake} from './g9-policy.js';
import {predictionRetryUntil} from './adapter-http.js';

const STAKE_NO_ANSWER =
  'We did not get an answer from the server, so your stake may or may not have gone through. Press Confirm to try again. It counts only once.';
const SETTLE_NO_ANSWER =
  'We did not get an answer from the server, so the settlement may or may not have gone through. Press Confirm to try again. A pool settles only once.';

function stakePlacedText(receipt) {
  if (!receipt?.side || !Number.isInteger(receipt.amount)) return 'Your stake is in.';
  return stakePlacedLine(receipt);
}

// The receipt of a settlement. The numbers come from the server; a missing one leaves its sentence out.
function settledNoticeText(receipt) {
  if (!receipt || typeof receipt !== 'object') return 'The question is settled.';
  const counted = [receipt.paidPlayers, receipt.paidCoins, receipt.cutCoins].every(Number.isInteger);
  return counted ? `${settledLine(receipt)} ${receiptText(receipt)}` : settledLine(receipt);
}

// The answer to "what now?" for one reply. `step` is the part of the form to show: the plain form or the confirm.
function next(reply, { noAnswer, placed, alreadyDone }) {
  const goBack = { done: false, step: 'edit', keepId: false, refresh: true, notice: refusalText(reply) };
  switch (reply.kind) {
    case 'ok':
      return { done: true, step: 'edit', keepId: false, refresh: true, notice: placed(reply.data) };
    case 'done':
      return { ...goBack, done: true, notice: serverMessage(reply.message) ?? alreadyDone };
    case 'wait':
      return { ...goBack, step: 'confirm', keepId: true };
    case 'unknown':
      return { ...goBack, step: 'confirm', keepId: true, notice: noAnswer };
    case 'signin':
      return { ...goBack, notice: SIGN_IN_LINE };
    case 'closed':
      return { ...goBack, notice: CLOSED_LINE };
    default:
      return goBack;
  }
}

export const afterStake = reply =>
  next(reply, { noAnswer: STAKE_NO_ANSWER, placed: stakePlacedText, alreadyDone: 'This stake was already placed.' });

export function afterSettle(reply) {
  const result = next(reply, {
    noAnswer: SETTLE_NO_ANSWER,
    placed: settledNoticeText,
    alreadyDone: 'This question was settled already.',
  });
  const { keepId, ...withoutId } = result;
  return withoutId;
}

export function createDeskFlow({adapter, readBeforeRetry = false, capture = () => null,
  isCurrent = () => true, allowSettle = true, validateReceipt = false} = {}) {
  const pending = new Map();
  const inFlight = new Map();
  let disposed = false, retryAt = 0, rateReply = null;
  const current = ticket => !disposed && isCurrent(ticket);
  function holdRetry(reply) {
    if (disposed || reply?.kind !== 'wait') return retryAt;
    const until = predictionRetryUntil(reply);
    if (until > retryAt) { retryAt = until; rateReply = reply; }
    return retryAt;
  }
  const waiting = () => ({reply: rateReply, ...afterStake(rateReply), refresh: false});


  // The same question, side and amount after a lost answer is the same stake, so it keeps its id.
  function attemptFor({ questionId, side, amount }) {
    const old = pending.get(questionId);
    if (old && old.side === side && old.amount === amount) return old;
    const attempt = { questionId, side, amount, stakeId: adapter.makeStakeId(), needsRead: false };
    pending.set(questionId, attempt);
    return attempt;
  }

  async function stake(ask, ticket) {
      if (!current(ticket)) return cancelledStake();
      if (retryAt > Date.now()) return waiting();
      const previous = pending.get(ask.questionId);
      if (readBeforeRetry && previous?.needsRead) {
        // A player may retry only after an authoritative read. This read never sends a stake.
        let mine;
        try { mine = await adapter.mine(); } catch { mine = {kind: 'unknown', status: 0}; }
        if (!disposed && pending.get(ask.questionId) === previous) holdRetry(mine);
        if (!current(ticket)) return cancelledStake();
        if (mine.kind !== 'ok' || !Array.isArray(mine.data?.stakes)) {
          const reply = mine.kind === 'ok' ? {kind: 'unknown', status: 200} : mine;
          return {reply, ...afterStake(reply), keepId: true, ...(reply.kind === 'wait' ? {refresh: false} : {})};
        }
        const own = mine.data.stakes.find(item => item?.questionId === ask.questionId);
        if (own) {
          if (!['yes', 'no'].includes(own.side) || !Number.isSafeInteger(own.amount) || own.amount < 1) {
            const reply = {kind: 'unknown', status: 200, code: 'bad_answer'};
            return {reply, ...afterStake(reply), keepId: true};
          }
          pending.delete(ask.questionId);
          const data = {questionId: own.questionId, side: own.side, amount: own.amount};
          const reply = {kind: 'done', alreadyApplied: true, data, message: 'This stake was already placed.'};
          return {reply, ...afterStake(reply)};
        }
      }
      if (!current(ticket)) return cancelledStake();
      const attempt = attemptFor(ask), { questionId, side, amount, stakeId } = attempt;
      // Closing before the response makes this attempt uncertain too. A later manual repeat reads first.
      attempt.needsRead = true;
      let reply;
      try { reply = await adapter.stake({ questionId, side, amount, stakeId }); }
      catch { reply = {kind: 'unknown', status: 0}; }
      if (!disposed && pending.get(questionId) === attempt) holdRetry(reply);
      if (!current(ticket)) return cancelledStake();
      if (!reply || !['ok', 'done', 'closed', 'signin', 'wait', 'refused', 'unknown'].includes(reply.kind)) {
        reply = {kind: 'unknown', status: 200, code: 'bad_answer'};
      }
      if (validateReceipt && reply.kind === 'ok' && (reply.data?.questionId !== questionId
        || reply.data.side !== side || reply.data.amount !== amount)) {
        reply = {kind: 'unknown', status: 200, code: 'bad_answer'};
      }
      const result = afterStake(reply);
      if (pending.get(questionId) === attempt) {
        if (!result.keepId) pending.delete(questionId);
        else attempt.needsRead = reply.kind === 'unknown';
      }
      return {reply, ...result, ...(reply.kind === 'wait' ? {refresh: false} : {})};
  }

  return {
    get retryUntil() { return retryAt; }, holdRetry,
    stake(ask) {
      const key = JSON.stringify([ask.questionId, ask.side, ask.amount]);
      if (inFlight.has(key)) return inFlight.get(key);
      const ticket = capture();
      const task = Promise.resolve().then(() => stake(ask, ticket)).finally(() => {
        if (inFlight.get(key) === task) inFlight.delete(key);
      });
      inFlight.set(key, task);
      return task;
    },
    async settle({ questionId, outcome }) {
      const ticket = capture();
      if (!allowSettle || !current(ticket)) return cancelledStake();
      const reply = await adapter.settle({ questionId, outcome });
      if (!current(ticket)) return cancelledStake();
      return { reply, ...afterSettle(reply) };
    },
    pause() { for (const attempt of pending.values()) attempt.needsRead = true; inFlight.clear(); },
    dispose() { disposed = true; retryAt = 0; rateReply = null; pending.clear(); inFlight.clear(); },
  };
}
