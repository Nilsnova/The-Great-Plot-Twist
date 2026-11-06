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

export function createDeskFlow({ adapter }) {
  const pending = new Map();

  // The same question, side and amount after a lost answer is the same stake, so it keeps its id.
  function attemptFor({ questionId, side, amount }) {
    const old = pending.get(questionId);
    if (old && old.side === side && old.amount === amount) return old;
    const attempt = { questionId, side, amount, stakeId: adapter.makeStakeId() };
    pending.set(questionId, attempt);
    return attempt;
  }

  return {
    async stake(ask) {
      const { questionId, side, amount, stakeId } = attemptFor(ask);
      const reply = await adapter.stake({ questionId, side, amount, stakeId });
      const result = afterStake(reply);
      if (!result.keepId) pending.delete(questionId);
      return { reply, ...result };
    },
    async settle({ questionId, outcome }) {
      const reply = await adapter.settle({ questionId, outcome });
      return { reply, ...afterSettle(reply) };
    },
  };
}
