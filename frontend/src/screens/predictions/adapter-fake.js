// The practice desk: a small fake of the server, for development and tests. Three made-up questions,
// stakes kept in memory and the same refusals as the real routes, in the same order. It is labelled
// "Practice desk: not real coins" on screen. It is never the source of truth.
//
// It is built as a fake `request` (it answers the same four routes in the same { ok, status, data } shape),
// so the real HTTP mapping in adapter-http.js runs on top of it. Only DEV with ?desk=local loads this file.
//
// Used by: adapter.js (development only) and the tests.

import { createHttpDeskAdapter } from './adapter-http.js';
import { perCoin, practiceQuestions, sideTotals, standInSplit, sum } from './fake-pool.js';
import { CREDIT_LINE, PLAY_MONEY_LINE } from './messages.js';
import { formatLocalTime } from './time-labels.js';
import { coinsText, sideName } from './view-model.js';

const RULES = { minStake: 1, maxStake: 50, dailyCap: 200, cutPercent: 5, cutOf: 'losing side', dayStarts: '00:00 Europe/Lisbon' };
const STAKE_ID = /^[A-Za-z0-9_-]{8,64}$/;
const NOT_ON_THE_LIST = 'That question is not on the prediction desk.';
const BAD_REQUEST = 'The request does not look right.';

const good = data => ({ ok: true, status: 200, data });
const refuse = (status, code, message) => ({ ok: false, status, code, message });
const iso = ms => new Date(ms).toISOString();

export function createFakeRequest({ now = Date.now, coins = 1000, dailyCap = RULES.dailyCap, host = true } = {}) {
  const rules = { ...RULES, dailyCap };
  const questions = practiceQuestions(now());
  const usedStakeIds = new Set();
  let balance = coins;

  const statusOf = q => (q.settled ? 'settled' : now() >= q.closesAt ? 'closed' : 'open');
  const yourStakeOn = q => q.stakes.find(stake => stake.who === 'you');
  const yourStakes = () => questions.flatMap(q => q.stakes.filter(s => s.who === 'you').map(stake => ({ q, stake })));
  const stakedToday = () => yourStakes().reduce((total, { stake }) => total + stake.amount, 0);
  const leftToday = () => Math.max(0, dailyCap - stakedToday());

  function sidesOf(q) {
    return ['yes', 'no'].map(side => ({
      side,
      label: side === 'yes' ? 'Yes' : 'No',
      ...sideTotals(q.stakes, side),
      payoutPerCoin: perCoin(q.stakes, side),
    }));
  }

  function questionView(q) {
    const status = statusOf(q);
    return {
      id: q.id,
      text: q.text,
      topic: q.topic,
      decidedBy: 'the presenter, by hand. This is a practice question.',
      closesAt: iso(q.closesAt),
      status,
      canStake: status === 'open',
      outcome: q.settled?.outcome ?? null,
      settlement: q.settled?.settlement ?? null,
      settledAt: q.settled?.settledAt ?? null,
      manifold: { state: status === 'open' ? 'open' : 'closed', decidedAs: null, decidedAt: null },
      sides: sidesOf(q),
      totalCoins: sum(q.stakes),
      source: 'cache',
      fetchedAt: iso(now()),
    };
  }

  function stakeRow({ q, stake }) {
    const { settled } = q;
    let result = null;
    if (settled) result = settled.settlement !== 'winners' ? 'refunded' : stake.payout > 0 ? 'won' : 'lost';
    return {
      questionId: q.id,
      text: q.text,
      side: stake.side,
      amount: stake.amount,
      placedAt: stake.placedAt,
      status: statusOf(q),
      result,
      payout: settled ? stake.payout : null,
      settlement: settled?.settlement ?? null,
      outcome: settled?.outcome ?? null,
      settledAt: settled?.settledAt ?? null,
    };
  }

  function mine() {
    const stakes = yourStakes().map(stakeRow).sort((a, b) => b.placedAt.localeCompare(a.placedAt));
    return good({ coins: balance, stakedToday: stakedToday(), leftToday: leftToday(), dailyCap, host, stakes });
  }

  // The checks run in the order of the real route: repeat, question, amount, closing, the database rules.
  function stake(body) {
    const { questionId, side, amount, stakeId } = body ?? {};
    const wellFormed = typeof questionId === 'string' && (side === 'yes' || side === 'no') && Number.isInteger(amount);
    if (!wellFormed || !STAKE_ID.test(stakeId ?? '')) return refuse(422, 'validation_error', BAD_REQUEST);
    if (usedStakeIds.has(stakeId)) return refuse(409, 'already_applied', 'This stake was already placed.');
    const q = questions.find(item => item.id === questionId);
    if (!q) return refuse(404, 'no_such_question', NOT_ON_THE_LIST);
    if (amount < rules.minStake) return refuse(422, 'stake_too_small', `A stake must be at least ${coinsText(rules.minStake)}.`);
    if (amount > rules.maxStake) {
      return refuse(422, 'stake_too_big', `You can stake at most ${coinsText(rules.maxStake)} on one question.`);
    }
    if (statusOf(q) !== 'open') return refuse(409, 'pool_closed', 'Staking on this question has closed.');
    const before = yourStakeOn(q);
    if (before) {
      const what = `${coinsText(before.amount)} on ${sideName(before.side)}`;
      return refuse(409, 'already_staked', `You already staked ${what} for this question. One stake per question.`);
    }
    if (amount > leftToday()) {
      const cap = `You can stake at most ${coinsText(dailyCap)} a day at the desk.`;
      return refuse(409, 'daily_stake_cap', `${cap} You can still stake ${coinsText(leftToday())} today.`);
    }
    if (amount > balance) return refuse(409, 'insufficient_funds', 'You do not have enough coins for that stake.');

    balance -= amount;
    usedStakeIds.add(stakeId);
    q.stakes.push({ who: 'you', side, amount, placedAt: iso(now()), payout: null });
    const receipt = { questionId, side, amount, coins: balance, stakedToday: stakedToday(), leftToday: leftToday() };
    return good({ ...receipt, sides: sidesOf(q), totalCoins: sum(q.stakes) });
  }

  function settle(body) {
    if (!host) return refuse(403, 'forbidden', 'Only a host can do this.');
    const { questionId, outcome } = body ?? {};
    if (typeof questionId !== 'string' || !['yes', 'no', 'void'].includes(outcome)) {
      return refuse(422, 'validation_error', BAD_REQUEST);
    }
    const q = questions.find(item => item.id === questionId);
    if (!q) return refuse(404, 'no_such_question', NOT_ON_THE_LIST);
    if (q.settled) {
      const how = q.settled.outcome === 'void' ? 'everybody got their coins back' : `${sideName(q.settled.outcome)} won`;
      return refuse(409, 'already_applied', `This question was settled already: ${how}.`);
    }
    if (outcome !== 'void' && statusOf(q) === 'open') {
      const until = formatLocalTime(iso(q.closesAt), { timeZone: 'UTC' });
      return refuse(409, 'pool_open', `Staking is open until ${until}. Settle it after that, or void it.`);
    }

    const split = standInSplit(q.stakes, outcome);
    q.stakes.forEach((item, index) => { item.payout = split.payouts[index]; });
    q.stakes.filter(item => item.who === 'you').forEach(item => { balance += item.payout; });
    const settledAt = iso(now());
    q.settled = { outcome, settlement: split.settlement, settledAt };
    const { paidPlayers, paidCoins, cutCoins } = split;
    return good({ questionId, outcome, settlement: split.settlement, settledAt, paidPlayers, paidCoins, cutCoins });
  }

  function list() {
    return good({ questions: questions.map(questionView), rules, attribution: CREDIT_LINE, playMoney: PLAY_MONEY_LINE });
  }

  return {
    get: async path => (path === '/api/predictions/mine' ? mine() : list()),
    post: async (path, body) => (path === '/api/predictions/stake' ? stake(body) : settle(body)),
  };
}

export function createFakeDeskAdapter(options) {
  return { ...createHttpDeskAdapter({ request: createFakeRequest(options) }), label: 'Practice desk: not real coins' };
}
