// What the fortune teller shows, from GET /api/predictions and /api/predictions/mine (through the
// prediction desk's adapter replies). Pure: no DOM, no fetch. Win estimates are display only.
import {offeredStakes, poolGain} from './stakes.js';
import {FORTUNE, MY_STAKES, POOL, refundedText, resultText} from './words.js';

const list = value => (Array.isArray(value) ? value : []);
export const sideLabel = side => (side === 'yes' ? FORTUNE.yes : side === 'no' ? FORTUNE.no : String(side));

export function fortuneHint(question, side, stake, cutPercent) {
  const mine = list(question.sides).find(entry => entry.side === side)?.coins ?? 0;
  const gain = poolGain({stake, mine, total: question.totalCoins ?? 0, cutPercent});
  return gain > 0 ? POOL.win(gain) : POOL.lonely(stake);
}

export function fortuneStakeState(stake) {
  if (stake.result === 'won') { const gain = (stake.payout ?? stake.amount) - stake.amount; return {text: resultText(gain), tone: 'good', gain}; }
  if (stake.result === 'lost') return {text: resultText(-stake.amount), tone: 'bad', gain: -stake.amount};
  if (stake.result === 'refunded') return {text: refundedText(stake.payout ?? stake.amount), tone: 'info', gain: 0};
  return {text: MY_STAKES.waiting, tone: 'info', gain: null};
}

// listReply and mineReply are desk replies: {kind: 'ok', data} | {kind: 'closed' | 'signin' | ...}.
export function fortuneView({listReply = null, mineReply = null} = {}) {
  if (!listReply) return {state: 'loading', questions: [], mine: []};
  if (listReply.kind === 'closed') return {state: 'closed', line: FORTUNE.closed, questions: [], mine: []};
  if (listReply.kind !== 'ok') return {state: 'unavailable', line: FORTUNE.unavailable, questions: [], mine: []};
  const rules = listReply.data.rules ?? {}, stakes = offeredStakes(rules);
  const signedIn = mineReply?.kind === 'ok';
  const own = signedIn ? list(mineReply.data.stakes) : [];
  const questions = list(listReply.data.questions)
    .filter(question => question.canStake === true || own.some(stake => stake.questionId === question.id && !stake.result))
    .map(question => {
      const taken = own.find(stake => stake.questionId === question.id);
      return {id: question.id, text: question.text, taken: taken ? FORTUNE.yourAnswer(sideLabel(taken.side), taken.amount) : null,
        sides: list(question.sides).map(entry => ({id: entry.side, label: sideLabel(entry.side)})),
        canStake: question.canStake === true && signedIn && !taken && stakes.length > 0, stakes,
        hint: (side, stake) => fortuneHint(question, side, stake, rules.cutPercent ?? 0)};
    });
  const rows = own.map(stake => {
    const state = fortuneStakeState(stake);
    return {id: stake.questionId, tone: state.tone, settled: Boolean(stake.result),
      text: MY_STAKES.row(stake.amount, sideLabel(stake.side), stake.text, state.text)};
  });
  return {state: questions.length ? 'open' : 'empty', line: questions.length ? null : FORTUNE.empty, questions, mine: rows, signedIn,
    signInNeeded: mineReply?.kind === 'signin' || !mineReply};
}
