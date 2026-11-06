// Canned boards for the local fake, in the shape of spec section 8.1. The prices are made up and the
// zero points are written out, so this file works out nothing. Used by: fake.js and the tests.
// A scenario is a whole board: mixed (class time), us-open, holiday, demo, off and relit.
import { SCENARIO_TIMES, portfolioFixture } from './fixtures-portfolio.js';

export { REFUSALS } from './refusals.js';
export { portfolioFixture };
export const SCENARIOS = ['mixed', 'us-open', 'holiday', 'demo', 'off', 'relit'];

const OPEN = {
  source: 'cache', status: 'open', reason: null, holiday: null, opensAt: null, closesAt: null,
  delisted: false, canOpen: true, canClose: true, priceDecimals: 2, priceAt: '2026-11-06T12:05:00Z',
};
const ISLAND = { ...OPEN, kind: 'island', market: 'always', marketName: 'Around the clock', currency: 'USDT' };
const STOCK = { ...OPEN, kind: 'stock', market: 'us', marketName: 'New York (NYSE and Nasdaq)', currency: 'USD' };
const NO_TRADE = { canOpen: false, canClose: false, zeroPrices: null };

const COMPANIES = {
  'harbor-trust': {
    ...ISLAND, id: 'harbor-trust', name: 'Saltreach Harbor Trust', ticker: 'SHT', follows: 'Bitcoin',
    tagline: 'The old harbor bank. When it moves, the whole market feels it.',
    price: 76159.21, zeroPrices: { rising: 68543.289, falling: 83775.131 },
  },
  'tidewright-works': {
    ...ISLAND, id: 'tidewright-works', name: 'Tidewright Works', ticker: 'TIDE', follows: 'Ether',
    tagline: 'Builds the locks, cranes and engines that every other island company uses.',
    price: 3412.55, zeroPrices: { rising: 3071.295, falling: 3753.805 },
  },
  'swiftwater-ferries': {
    ...ISLAND, id: 'swiftwater-ferries', name: 'Swiftwater Ferries', ticker: 'SWFT', follows: 'Solana',
    tagline: 'Fast boats, quick profits, quick losses.',
    price: 162.84, zeroPrices: { rising: 146.556, falling: 179.124 },
  },
  'pier-post-courier': {
    ...ISLAND, id: 'pier-post-courier', name: 'Pier Post Courier', ticker: 'PIER', follows: 'XRP', priceDecimals: 4,
    tagline: 'Carries letters and payments from pier to pier.',
    price: 2.4012, zeroPrices: { rising: 2.16108, falling: 2.64132 },
  },
  'greyfathom-salvage': {
    ...ISLAND, id: 'greyfathom-salvage', name: 'Greyfathom Salvage', ticker: 'GREY', follows: 'Gold (PAXG, one troy ounce)',
    tagline: 'Raises what the sea has taken. The salvage yard at Wreck Point.',
    price: 3987.4, zeroPrices: { rising: 3588.66, falling: 4386.14 },
  },
  apple: {
    ...STOCK, id: 'apple', name: 'Apple', ticker: 'AAPL', follows: 'Apple Inc. shares (Nasdaq)',
    tagline: 'Phones, laptops and the shop in every pocket.',
    price: 271.2, zeroPrices: { rising: 244.08, falling: 298.32 },
  },
  nvidia: {
    ...STOCK, id: 'nvidia', name: 'NVIDIA', ticker: 'NVDA', follows: 'NVIDIA Corporation shares (Nasdaq)',
    tagline: 'The chips behind the pictures and the thinking machines.',
    price: 190.1, zeroPrices: { rising: 171.09, falling: 209.11 },
  },
  tesla: {
    ...STOCK, id: 'tesla', name: 'Tesla', ticker: 'TSLA', follows: 'Tesla Inc. shares (Nasdaq)',
    tagline: 'Electric cars that make a lot of noise on the news.',
    price: 318.4, zeroPrices: { rising: 286.56, falling: 350.24 },
  },
  'coca-cola': {
    ...STOCK, id: 'coca-cola', name: 'Coca-Cola', ticker: 'KO', follows: 'The Coca-Cola Company shares (NYSE)',
    tagline: 'A very old fizzy drink with a very calm share price.',
    price: 71.35, zeroPrices: { rising: 64.215, falling: 78.485 },
  },
  spotify: {
    ...STOCK, id: 'spotify', name: 'Spotify', ticker: 'SPOT', follows: 'Spotify Technology shares (NYSE)',
    tagline: 'Songs on demand, from a quiet harbor of servers.',
    price: 612.8, zeroPrices: { rising: 551.52, falling: 674.08 },
  },
};
const of = (id, changes) => ({ ...COMPANIES[id], ...changes });
const stale = (reason, priceAt) => ({ status: 'stale', reason, priceAt, source: 'stale', ...NO_TRADE });
const closed = (reason, extra) => ({ status: 'closed', reason, ...NO_TRADE, ...extra });
const NO_PRICE = { status: 'unavailable', reason: 'no_price', price: null, priceAt: null, source: 'none', ...NO_TRADE };
const NEXT_OPEN = '2026-11-06T14:30:00Z';
const THANKSGIVING = { holiday: 'Thanksgiving Day', priceAt: '2026-11-25T21:00:00Z', opensAt: '2026-11-27T14:30:00Z' };
const US_CLOSES = '2026-11-06T21:00:00Z';

const STAKES_2 = [[10, 1, 11], [25, 1, 26], [50, 1, 51], [100, 2, 102], [250, 5, 255], [500, 10, 510]];
const STAKES_1 = [[10, 1, 11], [25, 1, 26], [50, 1, 51], [100, 1, 101], [250, 3, 253], [500, 5, 505]];
const rules = (feePercent, rows) => ({
  leverage: 10, zeroPointMovePercent: 10, feePercent, minStake: 10, maxStake: 500, dailyStakeCap: 2000, maxOpenPositions: 20,
  stakeChoices: rows.map(([stake, fee, total]) => ({ stake, fee, total })),
  tradePriceMaxAgeSeconds: 5, tradesPer30Seconds: 10, gameDayStarts: '08:00 Europe/Lisbon',
});

const BINANCE = { text: 'Real prices from Binance market data.', href: null, licenceText: null, licenceHref: null };
const FINNHUB = { text: 'Stock prices from Finnhub.', href: 'https://finnhub.io', licenceText: null, licenceHref: null };
const REPLAY = {
  text: 'Demo recording: Binance Vision data of 4 November 2026.', href: 'https://data.binance.vision',
  licenceText: 'CC BY-NC-SA 4.0', licenceHref: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
};
const ISLANDS = ['harbor-trust', 'tidewright-works', 'pier-post-courier', 'greyfathom-salvage'].map(id => of(id));

const COMPANIES_BY_SCENARIO = {
  mixed: () => [
    of('harbor-trust'), of('tidewright-works'), of('swiftwater-ferries', stale('source_away', '2026-11-06T11:58:10Z')),
    of('pier-post-courier'), of('greyfathom-salvage'),
    of('apple', closed('outside_hours', { priceAt: '2026-11-05T20:59:59Z', opensAt: NEXT_OPEN })),
    of('nvidia', NO_PRICE),
  ],
  'us-open': () => [
    of('harbor-trust'), of('apple', { closesAt: US_CLOSES, priceAt: '2026-11-06T15:19:40Z' }),
    of('nvidia', stale('source_away', '2026-11-06T15:12:40Z')), of('tesla', stale('quote_old', '2026-11-06T15:18:05Z')),
    of('coca-cola', stale('waiting_first_price', '2026-11-05T20:59:59Z')),
    of('spotify', { closesAt: US_CLOSES, priceAt: '2026-11-06T15:19:55Z' }),
  ],
  holiday: () => [of('harbor-trust'), of('apple', closed('holiday', THANKSGIVING)), of('nvidia', closed('holiday', THANKSGIVING))],
  demo: () => ISLANDS.map(company => ({ ...company, source: 'replay' })),
  off: () => ISLANDS.map(company => ({ ...company, canOpen: false, canClose: false })),
  relit: () => ISLANDS.map(company => (company.id === 'greyfathom-salvage' ? { ...company, delisted: true, canOpen: false } : company)),
};

export function boardFixture(name = 'mixed') {
  const scenario = SCENARIOS.includes(name) ? name : 'mixed';
  const demo = scenario === 'demo';
  return structuredClone({
    generatedAt: SCENARIO_TIMES[scenario], demo,
    demoNote: demo ? 'Demo recording: prices from 4 November 2026 (Binance Vision), played back. Trades here use your real coins.' : null,
    tradingEnabled: scenario !== 'off', relit: scenario === 'relit',
    companies: COMPANIES_BY_SCENARIO[scenario](),
    rules: scenario === 'relit' ? rules(1, STAKES_1) : rules(2, STAKES_2),
    credits: demo ? [REPLAY] : [BINANCE, FINNHUB],
    simulationNote: 'Simulation with play money. Real names and real prices, no real money and no prizes.',
  });
}
