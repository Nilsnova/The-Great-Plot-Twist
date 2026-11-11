// What the market stall shows, worked out from the Exchange answers (GET /api/market and
// /api/market/portfolio). Pure: no DOM, no fetch, no trading rules. The server decides every number.
//   marketView({board, boardFailure, portfolio, portfolioFailure, history, now}) -> {state, line, assets}
// Kept assets: Bitcoin, Ether, gold and at most two stocks, in that order. The rest stays hidden.
import {offeredStakes} from './stakes.js';
import {MARKET, priceText, lisbonWhen, resultText} from './words.js';

const CRYPTO = [
  {id: 'harbor-trust', follows: 'Bitcoin', name: 'Bitcoin'},
  {id: 'tidewright-works', follows: 'Ether', name: 'Ether'},
  {id: 'greyfathom-salvage', follows: 'Gold', name: 'Gold'},
];
const MAX_STOCKS = 2;
export const SIDES = Object.freeze({rising: MARKET.up, falling: MARKET.down});

const list = value => (Array.isArray(value) ? value : []);
function cryptoName(company) {
  const known = CRYPTO.find(entry => entry.id === company.id
    || (typeof company.follows === 'string' && company.follows.startsWith(entry.follows)));
  return known?.name ?? null;
}

// The companies the stall keeps, each with the plain name a player knows.
export function pickAssets(companies) {
  const all = list(companies).filter(company => company && typeof company.id === 'string');
  const crypto = CRYPTO.map(entry => all.find(company => cryptoName(company) === entry.name))
    .filter(Boolean).map(company => ({company, name: cryptoName(company)}));
  const stocks = all.filter(company => company.kind === 'stock').slice(0, MAX_STOCKS)
    .map(company => ({company, name: String(company.name ?? company.id)}));
  return [...crypto, ...stocks];
}

// Why an asset cannot take a stake right now, in words, or null when it can.
export function closedReason(company, board, now) {
  if (company.delisted) return MARKET.retired;
  if (company.status === 'closed') {
    const when = lisbonWhen(company.opensAt, now);
    return when ? MARKET.closedUntil(when) : MARKET.closedNow;
  }
  if (company.status === 'unavailable') return MARKET.unavailable;
  if (company.status === 'stale') return MARKET.catchingUp;
  if (board?.tradingEnabled === false || company.canOpen !== true) return MARKET.later;
  return null;
}

function holdingView(position, name) {
  const side = SIDES[position.side] ?? position.side;
  return {id: position.id, side, stake: position.stake, canClose: position.canClose === true,
    line: MARKET.holding(side, position.stake),
    now: Number.isFinite(position.result) ? MARKET.now(position.result) : MARKET.nowUnknown,
    closeLabel: MARKET.closeLabel(side, name)};
}

// The whole result of a closed position, both fees counted by the server.
export const closedResult = position => resultText(position?.result ?? (Number.isFinite(position?.coinsChange)
  && Number.isFinite(position?.stake) ? position.coinsChange - position.stake - (position.openFee ?? 0) : NaN));

export function marketView({board, boardFailure = null, portfolio = null, portfolioFailure = null,
  history = new Map(), now = Date.now()} = {}) {
  if (!board) return {state: boardFailure ? 'unavailable' : 'loading', line: boardFailure ? MARKET.unavailable : null, assets: []};
  const signedOut = portfolioFailure?.code === 'unauthorized' || portfolioFailure?.status === 401;
  const tradingOff = board.tradingEnabled === false || portfolioFailure?.code === 'feature_off';
  const stakes = offeredStakes(board.rules);
  const assets = pickAssets(board.companies).map(({company, name}) => {
    const reason = tradingOff ? (closedReason(company, board, now) ?? MARKET.later) : closedReason(company, board, now);
    const holdings = list(portfolio?.positions).filter(position => position.companyId === company.id)
      .map(position => holdingView(position, name));
    return {id: company.id, name, price: priceText(company.price) ?? MARKET.noPrice,
      history: list(history.get(company.id)), reason, holdings, stakes,
      canStake: reason === null && !signedOut && stakes.length > 0};
  });
  return {state: signedOut ? 'signed_out' : tradingOff ? 'off' : 'open', line: null, assets};
}

// Keeps a few recent prices per asset, so a sparkline can appear once the board was read twice.
export function rememberPrices(history, companies, limit = 30) {
  for (const company of list(companies)) {
    if (typeof company?.price !== 'number' || !Number.isFinite(company.price)) continue;
    const points = history.get(company.id) ?? [];
    const last = points.at(-1);
    if (!last || last.at !== company.priceAt) points.push({at: company.priceAt, price: company.price});
    while (points.length > limit) points.shift();
    history.set(company.id, points);
  }
  return history;
}

// Closed positions the player has not seen yet, newest first (an automatic close at zero included).
export function newlyClosed(portfolio, seen) {
  const fresh = list(portfolio?.recentlyClosed).filter(position => position?.id && !seen.has(position.id));
  for (const position of fresh) seen.add(position.id);
  return fresh;
}
