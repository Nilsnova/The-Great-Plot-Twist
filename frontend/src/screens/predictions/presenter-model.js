// The words and the choices of the presenter tab: what Manifold says, which settle buttons are possible,
// what a click will do and what the receipt says. Pure, so Vitest can test it.
// The server still checks every settlement; these rules only follow the public fields of the list.
//
// Used by: presenter-view.js, flow.js and the tests.

import { captainsText, coinsText, sideName } from './view-model.js';
import { formatLocalTime, timeOfDay } from './time-labels.js';

const LABELS = { yes: 'Settle YES', no: 'Settle NO', void: 'Void' };

export const settleLabel = outcome => LABELS[outcome];

export function manifoldLine(manifold, options = {}) {
  const state = manifold?.state;
  if (state === 'open') return 'Manifold: open';
  if (state === 'closed') return 'Manifold: closed, waiting';
  if (state !== 'decided') return 'Manifold: cannot be reached';
  const at = timeOfDay(manifold.decidedAt, options);
  const what = manifold.decidedAs === 'void' ? 'decided as void (cancelled or unclear)' : `decided ${sideName(manifold.decidedAs)}`;
  return at ? `Manifold: ${what} at ${at}` : `Manifold: ${what}`;
}

export function poolLine(question, options = {}) {
  const total = `${coinsText(question.totalCoins)} in total.`;
  if (question.status === 'settled') {
    const result = question.outcome === 'void' ? 'Everybody got their coins back.' : `${sideName(question.outcome)} won.`;
    return `Our pool: settled. ${result} ${total}`;
  }
  if (question.status === 'closed') return `Our pool: closed, waiting for the result. ${total}`;
  return `Our pool: open until ${formatLocalTime(question.closesAt, options)}. ${total}`;
}

// Which buttons work: YES and NO only after closing (and only the side Manifold decided), Void until it is settled.
export function settleOptions(question, options = {}) {
  if (question.status === 'settled') return { yes: false, no: false, void: false, hint: 'This question is settled.' };
  if (question.status !== 'closed') {
    const when = formatLocalTime(question.closesAt, options);
    return { yes: false, no: false, void: true, hint: `Settle YES or NO after staking closes (${when}). Void works at any time.` };
  }
  const decided = question.manifold?.state === 'decided' ? question.manifold.decidedAs : null;
  if (decided === 'yes' || decided === 'no') {
    const name = sideName(decided);
    return { yes: decided === 'yes', no: decided === 'no', void: true, hint: `Manifold decided ${name}. Settle it as ${name}, or void it.` };
  }
  if (decided === 'void') {
    return { yes: false, no: false, void: true, hint: 'Manifold decided this as void, so only Void is possible.' };
  }
  return { yes: true, no: true, void: true, hint: null };
}

export function settleConfirmText(outcome) {
  if (outcome === 'void') return 'Void: everybody gets their coins back. This cannot be undone.';
  const name = sideName(outcome);
  return `Settle as ${name}: the captains who picked ${name} share the pool. This cannot be undone.`;
}

export const receiptText = ({ paidPlayers, paidCoins, cutCoins }) =>
  `Paid ${captainsText(paidPlayers)} ${coinsText(paidCoins)}. ${coinsText(cutCoins)} left the game.`;
