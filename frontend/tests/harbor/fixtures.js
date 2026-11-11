// Made-up answers and in-memory adapters for the Harbor card tests and screenshots. No network, no rules:
// each fake records what it was sent and answers what the test asked for. Prices and teams are invented.
export const NOW = Date.parse('2026-11-11T12:00:00Z');

// GET /api/market/calls assets (INTERFACES.md, the market stall). stocks: 'closed' (Apple closed outside
// market hours, NVIDIA without a price because its source is off) or 'open'.
export const callAsset = (id, name, price, extra = {}) => ({id, name, price, priceAt: '2026-11-11T11:59:30Z', open: true,
  closedReason: null, ...extra});
export const callAssets = ({stocks = 'closed', priceShift = 0} = {}) => [
  callAsset('harbor-trust', 'Bitcoin', 74339.12 + priceShift),
  callAsset('tidewright-works', 'Ether', 3412.55),
  callAsset('greyfathom-salvage', 'Gold', 3987.4),
  callAsset('apple', 'Apple', 271.2, stocks === 'open' ? {} : {open: false, closedReason: 'outside_hours'}),
  callAsset('nvidia', 'NVIDIA', 190.1, stocks === 'open' ? {} : {open: false, closedReason: 'source_off', price: null, priceAt: null}),
];
// One call; the default is open on Bitcoin, decided at 12:18, 18 minutes after NOW.
export const marketCall = (extra = {}) => ({id: 'call-1', asset: 'harbor-trust', direction: 'up', stake: 10, openPrice: 74000,
  openedAt: '2026-11-11T11:18:00Z', settleAt: '2026-11-11T12:18:00Z', status: 'open', settlePrice: null, payout: null, ...extra});
const REFUSAL_STATUS = {insufficient_funds: 409, market_closed: 409, too_many_calls: 409, bad_stake: 422, no_such_asset: 404,
  validation_error: 422, too_many_requests: 429};

// The market stall adapter surface (src/harbor/calls-http.js): read() and place(body, {uid}); every call resolves.
// `requests` records what the card sent: ['read'] and ['place', body, uid].
export function fakeCalls({assets, stocks = 'closed', calls = [], balance = 100, signedIn = true, off = false, refuse = null} = {}) {
  const requests = [], board = assets ?? callAssets({stocks});
  let own = structuredClone(calls), coins = balance;
  const receipts = new Map();
  return {requests,
    async read() {
      requests.push(['read']);
      if (!signedIn) return {ok: false, code: 'unauthorized', status: 401, message: 'Session expired. Sign in again.'};
      if (off) return {ok: false, code: 'feature_off', status: 404, message: 'Server words'};
      return {ok: true, data: structuredClone({assets: board, calls: own, balance: coins})};
    },
    async place(body, {uid} = {}) {
      requests.push(['place', body, uid]);
      if (refuse) return {ok: false, code: refuse, status: REFUSAL_STATUS[refuse] ?? 409, message: 'Server words'};
      if (!receipts.has(uid)) {
        const call = marketCall({id: `call-${requests.length}`, asset: body.asset, direction: body.direction, stake: body.stake,
          openPrice: 74339.12, openedAt: '2026-11-11T12:00:00Z', settleAt: '2026-11-11T13:00:00Z'});
        own = [...own, call]; coins -= body.stake; receipts.set(uid, call);
      }
      return {ok: true, data: structuredClone({...receipts.get(uid), balance: coins})};
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

export const weatherAnswer = (state = 'storm', extra = {}) => ({cloudCover: 1, rain: 0.6, fog: 0.1, wind: 0.8, isDay: true,
  summary: {storm: 'Thunderstorm, windy', fog: 'Fog', rain: 'Light rain', calm: 'Clear sky'}[state], place: 'Carcavelos, Portugal',
  source: 'live', fetchedAt: '2026-11-11T11:50:00Z', attribution: 'Weather data by Open-Meteo.com, adapted for the game', state, ...extra});
