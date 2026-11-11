// What the desk says about a question, a stake or the stake form, as plain text.
// Pure: no DOM, no network and no pool arithmetic. The only sum is "payout minus stake", for the words
// "14 more than your stake". Every other number comes from the server.
//
// Used by: questions-view.js, stakes-view.js, presenter-model.js, flow.js and the tests.

import { formatCoins } from '../../lib/coins.js';
import { MANIFOLD_PAUSED_LINE, SIGN_IN_LINE } from './messages.js';
import { closingLabel, formatLocalTime } from './time-labels.js';

const DEFAULT_LIMITS = { minStake: 1, maxStake: 50, dailyCap: 200, cutPercent: 5 };
const TOPICS = { weather: 'Weather', science: 'Science', technology: 'Technology', culture: 'Culture', sport: 'Sport' };
const REFUND_REASONS = {
  refund_void: 'the question was cancelled or unclear on Manifold',
  refund_no_winners: 'nobody picked the winning answer',
  refund_one_sided: 'everybody picked the same answer',
};

export const coinsText = amount => formatCoins(amount);
export const captainsText = count => `${count} ${count === 1 ? 'captain' : 'captains'}`;
export const sideName = side => String(side).toUpperCase();
export const topicText = topic => (Object.hasOwn(TOPICS, topic) ? TOPICS[topic] : 'General');

export function limitsFrom(rules) {
  const pick = key => (Number.isInteger(rules?.[key]) ? rules[key] : DEFAULT_LIMITS[key]);
  return { minStake: pick('minStake'), maxStake: pick('maxStake'), dailyCap: pick('dailyCap'), cutPercent: pick('cutPercent') };
}

// The server rounds down to two decimals. Rounding down again here means the screen can never promise more.
export function payoutText(value) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number)) return 'no stakes yet';
  return `about ${(Math.floor(number * 100 + 1e-6) / 100).toFixed(2)}`;
}

// One line per side. After the question is settled the "if it wins" sentence is left out: it is moot.
export function sideLine(side, { settled = false } = {}) {
  const name = sideName(side.side);
  if (!(side.coins > 0)) {
    return settled ? `Nobody picked ${name}.` : `Nobody has picked ${name} yet. If nobody does, everybody gets their coins back.`;
  }
  const stakes = `${name}: ${coinsText(side.coins)} from ${captainsText(side.players)}.`;
  return settled ? stakes : `${stakes} If ${name} wins, each coin brings back ${payoutText(side.payoutPerCoin)} coins.`;
}

export function poolLines(question) {
  const settled = question.status === 'settled';
  if (!(question.totalCoins > 0)) return [settled ? 'Nobody staked on this question.' : 'Nobody has staked on this question yet.'];
  return (Array.isArray(question.sides) ? question.sides : []).map(side => sideLine(side, { settled }));
}

export function hintLine(leftToday, dailyCap) {
  if (leftToday <= 0) return `You have reached today's limit of ${coinsText(dailyCap)}. Try again tomorrow.`;
  return `You can still stake ${coinsText(leftToday)} today.`;
}

export const todayLine = mine => `Today you staked ${coinsText(mine.stakedToday)} of ${coinsText(mine.dailyCap)}.`;
export const stakeSummary = stake => `Your stake: ${coinsText(stake.amount)} on ${sideName(stake.side)}`;
export const stakePlacedLine = stake => `Your stake is in: ${coinsText(stake.amount)} on ${sideName(stake.side)}.`;
export const stakeConfirmText = ({ side, amount }) =>
  `Stake ${coinsText(amount)} on ${sideName(side)}? You cannot change or take back a stake.`;

// The check before the stake is sent. It is a convenience: the server checks everything again.
export function checkStakeInput({ side, amountText, rules, leftToday }) {
  const refuse = (field, message) => ({ ok: false, field, message });
  const { minStake, maxStake, dailyCap } = limitsFrom(rules);
  if (side !== 'yes' && side !== 'no') return refuse('side', 'Pick YES or NO first.');
  const text = String(amountText ?? '').trim();
  if (text === '') return refuse('amount', 'Type how many coins you want to stake.');
  if (!/^-?\d+$/.test(text)) return refuse('amount', 'Use a whole number of coins, like 20.');
  const amount = Number(text);
  if (amount < minStake) return refuse('amount', `A stake must be at least ${coinsText(minStake)}.`);
  if (amount > maxStake) return refuse('amount', `You can stake at most ${coinsText(maxStake)} on one question.`);
  if (Number.isFinite(leftToday) && amount > leftToday) return refuse('amount', hintLine(leftToday, dailyCap));
  return { ok: true, side, amount };
}

export function settledLine({ outcome, settlement }) {
  if (settlement === 'refund_void' || outcome === 'void') {
    return 'Settled: the question was cancelled or unclear on Manifold, so everybody got their coins back.';
  }
  const name = sideName(outcome);
  if (settlement === 'refund_no_winners') return `Settled: ${name} won, but nobody had picked ${name}, so everybody got their coins back.`;
  if (settlement === 'refund_one_sided') return `Settled: ${name} won, but everybody had picked the same answer, so everybody got their coins back.`;
  return `Settled: ${name} won.`;
}

// Why the player cannot stake, or null when the stake form may show.
export function whyNotStaking(question, { signedIn }) {
  if (question.status === 'settled') return settledLine(question);
  if (question.status === 'closed') return 'Staking has closed.';
  if (question.manifold?.state === 'unknown') return MANIFOLD_PAUSED_LINE;
  // The server still shows the last good answer of Manifold when it cannot be reached, but a "stale" one older than
  // 15 minutes is too old to stake on: canStake is false although the question is open.
  if (!question.canStake) return question.source === 'stale' ? MANIFOLD_PAUSED_LINE : 'Staking has closed.';
  if (signedIn === false) return SIGN_IN_LINE;
  if (signedIn !== true) return 'Your stakes could not be loaded, so staking is paused. Try again in a moment.';
  return null;
}

// One line of "My stakes": how the stake ended, or where it stands.
export function stakeResultLine(stake, { closesAt, timeZone } = {}) {
  if (stake.result === 'won') {
    const gain = stake.payout - stake.amount;
    const more = gain > 0 ? `${gain} more than your stake` : 'the same as your stake';
    return `Won: ${coinsText(stake.payout)} back (${more})`;
  }
  if (stake.result === 'lost') return `Lost: ${sideName(stake.outcome)} won`;
  if (stake.result === 'refunded') {
    const reason = REFUND_REASONS[stake.settlement];
    return `Refunded: ${coinsText(stake.payout ?? stake.amount)} back${reason ? `, because ${reason}` : ''}`;
  }
  if (stake.status === 'closed') return 'Closed: waiting for the result';
  const when = closesAt ? formatLocalTime(closesAt, { timeZone }) : '';
  return when ? `Open: closes ${when}` : 'Open';
}

export function ruleLine(rules, { open = true } = {}) {
  const { cutPercent } = limitsFrom(rules);
  const rule = `The winners share the pool. ${cutPercent} % of the coins on the losing side leave the game.`;
  return open ? `${rule} Numbers change until staking closes.` : rule;
}

// "Staking closes ... (in 41 days)" only while the question is open. A question that closed early (Manifold
// closed or decided it) or was settled has its reason in the line "Staking has closed." or "Settled: ...".
function closingLine(question, now, timeZone) {
  const passed = Date.parse(question.closesAt) <= now;
  if (question.status !== 'open' && !passed) return null;
  return closingLabel(question.closesAt, now, { timeZone });
}

// Everything one question card shows. `placed` is a stake the server just confirmed but "mine" does not list yet.
export function cardModel(question, { rules, mine, signedIn, now, timeZone, placed = null }) {
  const own = mine?.stakes?.find(stake => stake.questionId === question.id) ?? placed;
  const blocked = whyNotStaking(question, { signedIn });
  const { minStake, maxStake, dailyCap } = limitsFrom(rules);
  const canShowForm = blocked === null && own === null;
  return {
    id: question.id,
    title: question.text,
    topic: topicText(question.topic),
    decidedBy: `Decided by: ${question.decidedBy}`,
    closing: closingLine(question, now, timeZone),
    poolLines: poolLines(question),
    rule: ruleLine(rules, { open: question.status === 'open' }),
    own: own ? { side: own.side, amount: own.amount } : null,
    yourStake: own ? stakeSummary(own) : null,
    blocked,
    form: canShowForm
      ? {
          legend: 'Your forecast',
          amountLabel: `Coins (${minStake} to ${maxStake})`,
          min: minStake,
          max: maxStake,
          hint: hintLine(mine?.leftToday ?? dailyCap, dailyCap),
        }
      : null,
  };
}
