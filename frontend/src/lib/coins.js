// The one way the game writes coins: "🪙 120". Whole numbers only, thousands with a comma, and a real
// minus sign in front of a loss. Anything that is not a number shows as "🪙 0", never "NaN" or "?".
//   formatCoins(1250)  -> "🪙 1,250"     formatCoins(-10) -> "−🪙 10"
//   formatDelta(25)    -> "+25"           formatDelta(-4)  -> "−4"
//   formatCoinDelta(10)-> "🪙 +10"        coinsSpoken(1)   -> "1 coin" (for aria labels)
// Used by every screen that shows a balance, a price in coins, a stake or a payout (BUILD-PLAN 3.2).
export const COIN = '🪙';
const MINUS = '−';
const grouping = new Intl.NumberFormat('en-US', {maximumFractionDigits: 0});

export function wholeCoins(value) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number)) return 0;
  const whole = Math.round(number);
  return Object.is(whole, -0) ? 0 : whole;
}

const digits = value => grouping.format(Math.abs(value));

export function formatCoins(value) {
  const whole = wholeCoins(value);
  return `${whole < 0 ? MINUS : ''}${COIN} ${digits(whole)}`;
}

export function formatDelta(value) {
  const whole = wholeCoins(value);
  return `${whole > 0 ? '+' : whole < 0 ? MINUS : ''}${digits(whole)}`;
}

export const formatCoinDelta = value => `${COIN} ${formatDelta(value)}`;

export function coinsSpoken(value) {
  const whole = wholeCoins(value);
  return `${whole < 0 ? 'minus ' : ''}${digits(whole)} ${Math.abs(whole) === 1 ? 'coin' : 'coins'}`;
}
