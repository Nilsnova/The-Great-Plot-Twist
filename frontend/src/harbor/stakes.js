// The Harbor stake picker's numbers (D050): the player chooses any whole amount between the stall's
// smallest stake and the most they may stake right now. Pure: no DOM, no fetch. The server checks
// every stake again; these numbers only keep the buttons from offering a stake it would refuse.
//   const range = stakeRange({rules, coins, leftToday});  // {min, max, ok}
//   stepFor(1000) -> 50     stepStake(100, +1, 1000, range) -> 150     shareStake(25, 1000, range) -> 250
import {HARBOR_STAKE_PLACED} from '../ui/quest-events.js';

// The bus event after the server accepted a stake: {type, kind: 'market' | 'match', stake}.
// The quest strip (lane U) listens for it; the name comes from src/ui/quest-events.js.
export const STAKE_EVENT = HARBOR_STAKE_PLACED;

// A right pick or call pays back twice the stake (the stake plus the same again).
export const PAYOUT_MULTIPLIER = 2;
// The stalls' limits when an answer does not say them (the server's numbers, D050).
export const MATCH_RULES = Object.freeze({minStake: 1, maxStake: 10000, dailyCap: 25000});
export const MARKET_RULES = Object.freeze({minStake: 5, maxStake: 10000});

// The quick buttons: a share of the player's coins, or everything they may stake ("All in").
export const QUICK_SHARES = Object.freeze([10, 25, 50, 100]);
export const STEP_PERCENT = 5;
export const MIN_STEP = 5;
// Friendly step sizes. The biggest is half the largest stake (10,000).
const STEPS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

const whole = value => (Number.isSafeInteger(value) && value >= 0 ? value : null);

// The smallest and largest stake allowed now: at least the stall's minimum, at most its maximum, the
// player's coins and (on the match board) the coins left today. ok is false when nothing fits.
export function stakeRange({rules, coins, leftToday = null} = {}) {
  const min = Math.max(1, whole(rules?.minStake) ?? 1);
  const limits = [whole(rules?.maxStake), whole(coins), whole(leftToday)].filter(value => value !== null);
  const max = limits.length ? Math.min(...limits) : min;
  return {min, max, ok: max >= min};
}

export function clampStake(amount, {min, max}) {
  const value = Number.isFinite(amount) ? Math.floor(amount) : min;
  return Math.min(max, Math.max(min, value));
}

// 5 % of the coins, rounded down to a friendly size, never below 5: 1,000 coins step by 50.
export function stepFor(coins) {
  const target = (whole(coins) ?? 0) * STEP_PERCENT / 100;
  return STEPS.filter(step => step <= target).at(-1) ?? MIN_STEP;
}

// One press of "+" (direction 1) or "−" (direction -1).
export const stepStake = (amount, direction, coins, range) => clampStake(amount + direction * stepFor(coins), range);

// A quick button: a share of the coins, rounded down to a multiple of 5 when it can be. 100 is "All in":
// the most the player may stake right now.
export function shareStake(percent, coins, range) {
  if (percent >= 100) return range.max;
  const raw = Math.floor((whole(coins) ?? 0) * percent / 100);
  return clampStake(raw >= MIN_STEP ? raw - (raw % MIN_STEP) : raw, range);
}

// The amount the picker shows first: 10 % of the coins.
export const firstStake = (coins, range) => shareStake(QUICK_SHARES[0], coins, range);

export const winFor = (stake, multiplier = PAYOUT_MULTIPLIER) => stake * multiplier;
