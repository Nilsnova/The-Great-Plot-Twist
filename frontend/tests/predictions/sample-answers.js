// Made-up server answers in the shape of the prediction desk contract (docs/INTERFACES.md).
// Test data only: nothing here is a real pool, a real player or a real Manifold reading.
// Used by: the tests in this folder.

export const RULES = {
  minStake: 1,
  maxStake: 50,
  dailyCap: 200,
  cutPercent: 5,
  cutOf: 'losing side',
  dayStarts: '00:00 Europe/Lisbon',
};

export const CREDIT = 'Questions and results: Manifold Markets (manifold.markets), a play-money forecasting site.';
export const PLAY_MONEY = 'Forecasting with play coins. Play money: no cash value. It cannot be bought or cashed out.';

export function question(overrides = {}) {
  return {
    id: 'avengers-opening-record',
    text: 'Will Avengers: Doomsday set a new record for the biggest North American opening weekend?',
    topic: 'culture',
    decidedBy: 'Box Office Mojo, domestic opening weekend above 360,091,572 dollars, as resolved on Manifold.',
    closesAt: '2026-12-17T12:00:00Z',
    status: 'open',
    canStake: true,
    outcome: null,
    settlement: null,
    settledAt: null,
    manifold: { state: 'open', decidedAs: null, decidedAt: null },
    sides: [
      { side: 'yes', label: 'Yes', coins: 120, players: 4, payoutPerCoin: 1.62 },
      { side: 'no', label: 'No', coins: 80, players: 3, payoutPerCoin: 2.43 },
    ],
    totalCoins: 200,
    source: 'cache',
    fetchedAt: '2026-11-20T10:02:11Z',
    ...overrides,
  };
}

export function listAnswer(questions = [question()]) {
  return { questions, rules: RULES, attribution: CREDIT, playMoney: PLAY_MONEY };
}

export function stakeRow(overrides = {}) {
  return {
    questionId: 'avengers-opening-record',
    text: 'Will Avengers: Doomsday set a new record for the biggest North American opening weekend?',
    side: 'yes',
    amount: 20,
    placedAt: '2026-11-20T10:05:00Z',
    status: 'open',
    result: null,
    payout: null,
    settlement: null,
    outcome: null,
    settledAt: null,
    ...overrides,
  };
}

export function mineAnswer(overrides = {}) {
  return { coins: 940, stakedToday: 70, leftToday: 130, dailyCap: 200, host: false, stakes: [], ...overrides };
}

// What the request layer hands the adapter (the same shape as A2's online/api.js).
export const good = data => ({ ok: true, status: 200, data });
export const failed = (status, code, message, extra = {}) => ({ ok: false, status, code, message, ...extra });
