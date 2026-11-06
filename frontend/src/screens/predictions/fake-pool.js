// The made-up data and the stand-in split of the practice desk. Development and tests only.
// The real rules are in backend/server/predictions/pools.py. This split is simpler (every payout is
// rounded down) and is never the source of truth: nothing here touches a real coin.
//
// Used by: adapter-fake.js and the tests.

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const CUT_PERCENT = 5;

const other = (side, amount) => ({ who: 'other', side, amount });

// Three practice questions: one that closes in 41 days (and an hour, so the label stays "in 41 days" for a while),
// one that closes in 3 hours, and one that has closed.
export function practiceQuestions(startMs) {
  return [
    { id: 'practice-gull', topic: 'culture', closesAt: startMs + 41 * DAY + HOUR, settled: null,
      text: 'Will the harbor gull steal a fish before noon tomorrow?',
      stakes: [other('yes', 40), other('yes', 30), other('no', 50)] },
    { id: 'practice-rain', topic: 'weather', closesAt: startMs + 3 * HOUR, settled: null,
      text: 'Will it rain on Saltreach Harbor this weekend?',
      stakes: [other('yes', 25), other('no', 25)] },
    { id: 'practice-ferry', topic: 'culture', closesAt: startMs - HOUR, settled: null,
      text: 'Will the practice ferry arrive on time?',
      stakes: [other('yes', 30), other('yes', 30), other('no', 40)] },
  ];
}

export const sum = stakes => stakes.reduce((total, stake) => total + stake.amount, 0);

export function sideTotals(stakes, side) {
  const own = stakes.filter(stake => stake.side === side);
  return { coins: sum(own), players: own.length };
}

// What one coin on this side would bring back. The real server rounds down to two decimals too.
export function perCoin(stakes, side) {
  const total = sum(stakes);
  const own = sum(stakes.filter(stake => stake.side === side));
  if (own === 0) return null;
  const losing = total - own;
  if (losing === 0) return 1;
  const shared = total - Math.floor((losing * CUT_PERCENT) / 100);
  return Math.floor((shared / own) * 100) / 100;
}

// Who gets what when a question is settled: winners share the pool, or everybody gets their stake back.
export function standInSplit(stakes, outcome) {
  const total = sum(stakes);
  const winning = sum(stakes.filter(stake => stake.side === outcome));
  const losing = total - winning;
  let settlement = 'winners';
  if (outcome === 'void') settlement = 'refund_void';
  else if (winning === 0) settlement = 'refund_no_winners';
  else if (losing === 0) settlement = 'refund_one_sided';

  const shared = total - Math.floor((losing * CUT_PERCENT) / 100);
  const payouts = stakes.map(stake => {
    if (settlement !== 'winners') return stake.amount;
    return stake.side === outcome ? Math.floor((stake.amount * shared) / winning) : 0;
  });
  const paidCoins = payouts.reduce((all, coins) => all + coins, 0);
  return { settlement, payouts, paidCoins, cutCoins: total - paidCoins, paidPlayers: payouts.filter(coins => coins > 0).length };
}
