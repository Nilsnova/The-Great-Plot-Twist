// What the market stall shows, worked out from GET /api/market/calls (INTERFACES.md, the market stall, D034):
// {assets: [{id, name, price, priceAt, open, closedReason}], calls: [...], balance}. Pure: no DOM, no fetch,
// no rules. The server decides every price, every result and every coin.
//   callsView({answer, failure, history, now}) -> {state, line, balance, full, assets}
// state is loading, unavailable, signed_out, off (flag market off) or open. One item per asset, in the
// server's order and with the server's names (Bitcoin, Ether, Gold, Apple, NVIDIA).
import {STAKES} from './stakes.js';
import {MARKET, priceText} from './words.js';

export const SIDES = Object.freeze({up: MARKET.up, down: MARKET.down});
export const MAX_OPEN_CALLS = 3;
const DECIDED_SHOWN = 2; // per asset: the newest decided calls, so the card stays short

const list = value => (Array.isArray(value) ? value : []);
const signedOut = failure => failure?.code === 'unauthorized' || failure?.status === 401;
const switchedOff = failure => failure?.code === 'feature_off' || failure?.code === 'demo_closed';

// Why an asset takes no call right now, in plain words (the server's closedReason codes).
const REASONS = {
  weekend: MARKET.weekend, holiday: MARKET.holiday, outside_hours: MARKET.outsideHours, no_calendar: MARKET.closedNow,
  closed: MARKET.closedNow,
  quote_old: MARKET.catchingUp, source_away: MARKET.catchingUp, waiting_first_price: MARKET.catchingUp, stale: MARKET.catchingUp,
  source_off: MARKET.unavailable, not_in_recording: MARKET.unavailable, no_price: MARKET.unavailable, unavailable: MARKET.unavailable,
  demo: MARKET.demo, delisted: MARKET.retired,
};
export const reasonText = code => REASONS[code] ?? MARKET.closedNow;

// "Decided in 42 min" until settleAt; the server decides on the first read at or after it.
export function countdownText(settleAt, now = Date.now()) {
  const left = Date.parse(settleAt) - now;
  if (!Number.isFinite(left) || left <= 0) return MARKET.deciding;
  if (left < 60000) return MARKET.decidedSoon;
  return MARKET.decidedIn(Math.ceil(left / 60000));
}

// One call as the card shows it: what the player said, and the countdown or the result.
export function callView(call, now = Date.now()) {
  const side = SIDES[call.direction] ?? String(call.direction);
  const base = {id: call.id, open: call.status === 'open', line: MARKET.call(side, call.stake)};
  if (call.status === 'open') return {...base, tone: 'info', state: countdownText(call.settleAt, now)};
  if (call.status === 'won') return {...base, tone: 'good', state: MARKET.won(call.payout ?? call.stake * 2)};
  if (call.status === 'refunded') return {...base, tone: 'info', state: MARKET.refunded(call.payout ?? call.stake)};
  return {...base, tone: 'bad', state: MARKET.lost};
}

export function callsView({answer = null, failure = null, history = new Map(), now = Date.now()} = {}) {
  if (signedOut(failure)) return {state: 'signed_out', line: null, balance: null, full: false, assets: []};
  if (switchedOff(failure)) return {state: 'off', line: MARKET.closed, balance: null, full: false, assets: []};
  if (!answer) return {state: failure ? 'unavailable' : 'loading', line: failure ? MARKET.unavailable : null,
    balance: null, full: false, assets: []};
  const calls = list(answer.calls).filter(call => call && typeof call.id === 'string');
  const full = calls.filter(call => call.status === 'open').length >= MAX_OPEN_CALLS;
  const assets = list(answer.assets).filter(asset => asset && typeof asset.id === 'string').map(asset => {
    const own = calls.filter(call => call.asset === asset.id);
    const decided = own.filter(call => call.status !== 'open')
      .sort((a, b) => String(b.settleAt).localeCompare(String(a.settleAt))).slice(0, DECIDED_SHOWN);
    const price = priceText(asset.price);
    const open = asset.open === true && price !== null;
    return {id: asset.id, name: String(asset.name ?? asset.id), price: price ?? MARKET.noPrice,
      history: list(history.get(asset.id)), reason: open ? null : reasonText(asset.closedReason ?? (price ? null : 'no_price')),
      canStake: open && !full, stakes: [...STAKES],
      calls: [...own.filter(call => call.status === 'open'), ...decided].map(call => callView(call, now))};
  });
  const balance = Number.isSafeInteger(answer.balance) ? answer.balance : null;
  return {state: 'open', line: null, balance, full, assets};
}

// Keeps a few recent prices per asset, so a sparkline can appear once the stall was read twice.
export function rememberPrices(history, assets, limit = 30) {
  for (const asset of list(assets)) {
    if (typeof asset?.price !== 'number' || !Number.isFinite(asset.price)) continue;
    const points = history.get(asset.id) ?? [];
    const last = points.at(-1);
    if (!last || last.at !== asset.priceAt) points.push({at: asset.priceAt, price: asset.price});
    while (points.length > limit) points.shift();
    history.set(asset.id, points);
  }
  return history;
}
