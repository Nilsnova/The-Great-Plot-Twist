// Canned portfolios for the local fake, in the shape of spec section 8.2. The numbers are made up but
// consistent (a 1 % move is 10 % of the stake). Used by: fixtures.js. Memory only.

export const SCENARIO_TIMES = {
  mixed: '2026-11-06T12:05:03Z', 'us-open': '2026-11-06T15:20:03Z', holiday: '2026-11-26T12:05:03Z',
  demo: '2026-11-06T12:05:03Z', off: '2026-11-06T12:05:03Z', relit: '2026-11-06T12:05:03Z',
};

const harbor = {
  id: 'pos-harbor-1', companyId: 'harbor-trust', name: 'Saltreach Harbor Trust', ticker: 'SHT', follows: 'Bitcoin', currency: 'USDT', priceDecimals: 2, side: 'rising', mode: 'live',
  stake: 100, openFee: 2, entryPrice: 75000, zeroPrice: 67500, openedAt: '2026-11-06T11:40:12Z', price: 76159.21, priceAt: '2026-11-06T12:05:00Z',
  companyStatus: 'open', companyReason: null, opensAt: null, value: 115, profit: 15, profitPercent: 15, closeFee: 2, wouldReceive: 113, result: 11, canClose: true,
};
const courier = {
  id: 'pos-courier-1', companyId: 'pier-post-courier', name: 'Pier Post Courier', ticker: 'PIER', follows: 'XRP', currency: 'USDT', priceDecimals: 4, side: 'falling', mode: 'live',
  stake: 50, openFee: 1, entryPrice: 2.4, zeroPrice: 2.64, openedAt: '2026-11-06T09:12:40Z', price: 2.4012, priceAt: '2026-11-06T12:05:00Z',
  companyStatus: 'open', companyReason: null, opensAt: null, value: 49, profit: -1, profitPercent: -2, closeFee: 1, wouldReceive: 48, result: -3, canClose: true,
};
const apple = {
  id: 'pos-apple-1', companyId: 'apple', name: 'Apple', ticker: 'AAPL', follows: 'Apple Inc. shares (Nasdaq)', currency: 'USD', priceDecimals: 2, side: 'rising', mode: 'live',
  stake: 50, openFee: 1, entryPrice: 260, zeroPrice: 234, openedAt: '2026-11-05T15:02:10Z', price: 271.2, priceAt: '2026-11-05T20:59:59Z',
  companyStatus: 'closed', companyReason: 'outside_hours', opensAt: '2026-11-06T14:30:00Z',
  value: 71, profit: 21, profitPercent: 42, closeFee: 1, wouldReceive: 70, result: 19, canClose: false,
};
const zeroed = {
  id: 'pos-courier-0', companyId: 'pier-post-courier', name: 'Pier Post Courier', currency: 'USDT', priceDecimals: 4, side: 'falling', mode: 'live', stake: 50, openFee: 1,
  entryPrice: 2.4, zeroPrice: 2.64, openedAt: '2026-11-06T09:12:40Z', closedAs: 'zeroed', closePrice: 2.6512, closedAt: '2026-11-06T10:02:31Z',
  value: 0, closeFee: 0, coinsChange: 0, result: -51,
};
const byPlayer = {
  id: 'pos-harbor-0', companyId: 'harbor-trust', name: 'Saltreach Harbor Trust', currency: 'USDT', priceDecimals: 2, side: 'rising', mode: 'live', stake: 100, openFee: 2,
  entryPrice: 76000, zeroPrice: 68400, openedAt: '2026-11-06T08:00:00Z', closedAs: 'closed', closePrice: 77520, closedAt: '2026-11-06T09:30:00Z',
  value: 120, closeFee: 2, coinsChange: 118, result: 16,
};

function appleFor(name) {
  if (name === 'us-open') {
    return { ...apple, priceAt: '2026-11-06T15:19:40Z', companyStatus: 'open', companyReason: null, opensAt: null, canClose: true };
  }
  if (name === 'holiday') return { ...apple, companyReason: 'holiday', opensAt: '2026-11-27T14:30:00Z' };
  return apple;
}

export function portfolioFixture(name = 'mixed') {
  const demo = name === 'demo';
  const positions = demo ? [] : [harbor, appleFor(name), courier];
  return structuredClone({
    coins: demo ? 500 : 940, demo, feePercent: name === 'relit' ? 1 : 2,
    stakedToday: demo ? 0 : 200, dailyStakeCap: 2000, openCount: positions.length, maxOpenPositions: 20,
    positions, recentlyClosed: demo ? [] : [zeroed, byPlayer], generatedAt: SCENARIO_TIMES[name] ?? SCENARIO_TIMES.mixed,
  });
}
