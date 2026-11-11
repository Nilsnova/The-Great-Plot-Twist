// Made-up answers and in-memory adapters for the Harbor card tests and screenshots. No network, no rules:
// each fake records what it was sent and answers what the test asked for. Prices and teams are invented.
export const NOW = Date.parse('2026-11-11T12:00:00Z');

const company = (id, name, follows, kind, price, extra = {}) => ({id, name, ticker: id.slice(0, 4).toUpperCase(), kind, follows,
  market: kind === 'stock' ? 'us' : 'always', currency: kind === 'stock' ? 'USD' : 'USDT', priceDecimals: 2, price,
  priceAt: '2026-11-11T11:59:30Z', source: 'live', status: 'open', reason: null, holiday: null, opensAt: null, closesAt: null,
  delisted: false, canOpen: true, canClose: true, zeroPrices: {rising: price * 0.9, falling: price * 1.1}, ...extra});

export function marketBoard({minStake = 5, maxStake = 500, tradingEnabled = true, stocks = 'closed', priceShift = 0} = {}) {
  const closed = {status: 'closed', reason: 'outside_hours', opensAt: '2026-11-11T14:30:00Z', canOpen: false, canClose: false, zeroPrices: null};
  const none = {status: 'unavailable', reason: 'no_price', price: null, priceAt: null, source: 'none', canOpen: false, canClose: false, zeroPrices: null};
  const stockState = stocks === 'open' ? {} : stocks === 'none' ? none : closed;
  return {generatedAt: '2026-11-11T12:00:00Z', demo: false, demoNote: null, tradingEnabled, relit: false,
    companies: [
      company('harbor-trust', 'Saltreach Harbor Trust', 'Bitcoin', 'island', 74339.12 + priceShift),
      company('tidewright-works', 'Tidewright Works', 'Ether', 'island', 3412.55),
      company('swiftwater-ferries', 'Swiftwater Ferries', 'Solana', 'island', 162.84),
      company('greyfathom-salvage', 'Greyfathom Salvage', 'Gold (PAXG, one troy ounce)', 'island', 3987.4),
      company('apple', 'Apple', 'Apple Inc. shares (Nasdaq)', 'stock', 271.2, stockState),
      company('nvidia', 'NVIDIA', 'NVIDIA Corporation shares (Nasdaq)', 'stock', 190.1, stocks === 'open' ? {} : none),
      company('tesla', 'Tesla', 'Tesla Inc. shares (Nasdaq)', 'stock', 318.4),
    ],
    rules: {leverage: 10, zeroPointMovePercent: 10, feePercent: 2, minStake, maxStake, dailyStakeCap: 2000, maxOpenPositions: 20,
      stakeChoices: [5, 10, 25, 50].filter(stake => stake >= minStake).map(stake => ({stake, fee: 1, total: stake + 1}))},
    credits: [], simulationNote: 'Play money only.'};
}

export const emptyPortfolio = (extra = {}) => ({coins: 100, demo: false, feePercent: 2, stakedToday: 0, dailyStakeCap: 2000,
  openCount: 0, maxOpenPositions: 20, positions: [], recentlyClosed: [], generatedAt: '2026-11-11T12:00:00Z', ...extra});
export const openPosition = (extra = {}) => ({id: 'pos-1', companyId: 'harbor-trust', name: 'Saltreach Harbor Trust', side: 'rising',
  mode: 'live', stake: 10, openFee: 1, entryPrice: 74000, zeroPrice: 66600, price: 74339, value: 10, profit: 0, result: 3,
  closeFee: 1, wouldReceive: 13, canClose: true, companyStatus: 'open', ...extra});

// The Exchange adapter surface (screens/market/http.js): every call resolves, none throws.
export function fakeMarket({board = marketBoard(), portfolio = emptyPortfolio(), signedIn = true, refuse = null, closedAs = null} = {}) {
  const calls = [];
  let current = structuredClone(portfolio);
  return {calls,
    async board() { calls.push(['board']); return {ok: true, data: structuredClone(board)}; },
    async portfolio() { calls.push(['portfolio']); return signedIn ? {ok: true, data: structuredClone(current)}
      : {ok: false, code: 'unauthorized', status: 401, message: 'Session expired. Sign in again.'}; },
    async open(body, {uid} = {}) {
      calls.push(['open', body, uid]);
      if (refuse) return {ok: false, code: refuse, status: 409, message: 'Server words'};
      current = {...current, positions: [openPosition({id: `pos-${calls.length}`, companyId: body.companyId, side: body.side, stake: body.stake, result: -1})]};
      return {ok: true, data: {positionId: `pos-${calls.length}`, ...body}};
    },
    async close(body, {uid} = {}) {
      calls.push(['close', body, uid]);
      const position = current.positions.find(row => row.id === body.positionId);
      current = {...current, positions: current.positions.filter(row => row.id !== body.positionId),
        recentlyClosed: [{...position, closedAs: closedAs ?? 'closed', coinsChange: 21, result: 10}, ...current.recentlyClosed]};
      return {ok: true, data: {positionId: body.positionId, closedAs: 'closed', coinsChange: 21, coins: 121}};
    },
    signIn() { signedIn = true; }};
}

const RULES = {minStake: 1, maxStake: 50, dailyCap: 200, poolCutPercent: 5, pickLeadMinutes: 60};
export const fixture = (extra = {}) => ({id: 'fd-101', sport: 'football', competition: 'Primeira Liga', home: 'Harbor Athletic',
  away: 'Island United', kickoff: '2026-11-14T20:00:00Z', closesAt: '2026-11-14T19:00:00Z', status: 'scheduled', source: 'live',
  homeScore: null, awayScore: null, picks: ['home', 'draw', 'away'], canStake: true,
  pool: {status: 'open', outcome: null, settlement: null, paidCoins: null, cutCoins: null, settledAt: null, total: 60,
    sides: {home: {coins: 40, players: 3}, away: {coins: 20, players: 2}}}, ...extra});
export const sportsBoard = (fixtures = [fixture(), fixture({id: 'fd-102', competition: 'Premier League', home: 'Gull Rovers',
  away: 'Reef Town', kickoff: '2026-11-15T15:00:00Z', closesAt: '2026-11-15T14:00:00Z'})]) => ({fixtures, source: 'live',
  provider: 'football-data.org', fetchedAt: '2026-11-11T11:00:00Z', attribution: 'Football data', rules: RULES, simulationNote: 'Play money.'});

// The sports adapter surface (screens/sports/http.js).
export function fakeSports({board = sportsBoard(), stakes = [], boardFailure = null, refuse = null} = {}) {
  const calls = [];
  let own = structuredClone(stakes);
  return {calls,
    async board() { calls.push(['board']); return boardFailure ?? {ok: true, data: structuredClone(board)}; },
    async mine() { calls.push(['mine']); return {ok: true, data: {coins: 100, stakedToday: 0, coinsLeftToday: 200, stakes: structuredClone(own),
      checksUnavailable: false, rules: RULES, simulationNote: 'Play money.'}}; },
    async stake(body) {
      calls.push(['stake', body]);
      if (refuse) return {ok: false, status: 409, code: refuse, message: 'Server words', unknown: false};
      const match = board.fixtures.find(row => row.id === body.fixtureId);
      own = [{id: `stake-${calls.length}`, fixtureId: body.fixtureId, pick: body.pick, amount: body.amount, payout: null,
        home: match.home, away: match.away, status: 'open', settlement: null}, ...own];
      return {ok: true, data: {accepted: true, repeat: false, id: `stake-${calls.length}`, fixtureId: body.fixtureId, pick: body.pick, amount: body.amount, coins: 90}};
    },
    async settle() { return {ok: false, status: 403, code: 'forbidden', message: ''}; }};
}

export const question = (extra = {}) => ({id: 'snow-lisbon', text: 'Will it snow in Lisbon before 2027?', topic: 'weather',
  decidedBy: 'Manifold', closesAt: '2026-12-31T12:00:00Z', status: 'open', canStake: true, outcome: null, settlement: null,
  settledAt: null, manifold: {state: 'open', decidedAs: null, decidedAt: null},
  sides: [{side: 'yes', label: 'Yes', coins: 30, players: 2, payoutPerCoin: 2.5}, {side: 'no', label: 'No', coins: 50, players: 4, payoutPerCoin: 1.5}],
  totalCoins: 80, source: 'cache', fetchedAt: '2026-11-11T11:00:00Z', ...extra});

// The prediction desk adapter surface (screens/predictions/adapter.js replies).
export function fakeDesk({questions = [question()], signedIn = true, closed = false, stakes = [], refuse = null} = {}) {
  const calls = [];
  let own = structuredClone(stakes);
  return {calls, makeStakeId: () => `stake-id-${calls.length}`,
    async list() { calls.push(['list']); return closed ? {kind: 'closed', message: ''}
      : {kind: 'ok', data: {questions: structuredClone(questions), rules: {minStake: 1, maxStake: 50, dailyCap: 200, cutPercent: 5}}}; },
    async mine() { calls.push(['mine']); return signedIn ? {kind: 'ok', data: {coins: 100, stakedToday: 0, leftToday: 200, dailyCap: 200, stakes: structuredClone(own)}}
      : {kind: 'signin', message: 'Sign in'}; },
    async stake(body) {
      calls.push(['stake', body]);
      if (refuse) return {kind: 'refused', status: 409, code: refuse, message: 'Server words'};
      own = [{questionId: body.questionId, text: questions[0].text, side: body.side, amount: body.amount, status: 'open', result: null, payout: null}, ...own];
      return {kind: 'ok', data: {...body, coins: 90}};
    }};
}

export const weatherAnswer = (state = 'storm', extra = {}) => ({cloudCover: 1, rain: 0.6, fog: 0.1, wind: 0.8, isDay: true,
  summary: {storm: 'Thunderstorm, windy', fog: 'Fog', rain: 'Light rain', calm: 'Clear sky'}[state], place: 'Carcavelos, Portugal',
  source: 'live', fetchedAt: '2026-11-11T11:50:00Z', attribution: 'Weather data by Open-Meteo.com, adapted for the game', state, ...extra});
