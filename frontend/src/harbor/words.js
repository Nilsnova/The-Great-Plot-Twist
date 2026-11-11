// Every sentence the Harbor cards show, in one place so the house text lint reads them all. Pure: no DOM.
// Coins always go through formatCoins (src/lib/coins.js); asset prices keep their real size.
import {formatCoinDelta, formatCoins} from '../lib/coins.js';

export const SIGN_IN = 'Sign in or join with a class code to place a stake';
export const SIGN_IN_BUTTON = 'Sign in';
export const PLAY_MONEY = 'Play coins only. They cannot be bought or cashed out.';
export const TRY_AGAIN = 'Try again';
export const SEND_AGAIN = 'Send again';
export const NOT_HEARD = 'We did not hear back. Look at My stakes before you send it again.';
export const LOADING = 'Opening the stall...';

export const TITLES = {
  harbor: 'Harbor', market: 'Market stall', match: 'Match board', fortune: 'Fortune teller',
  weather: 'Weather board', duel: 'Duel ring',
};

// One plain sentence per stall about the real data behind it (H5, UX-AUDIT section e).
export const EXPLAIN = {
  market: 'Real crypto and gold prices from Binance, and real stock prices from Finnhub.',
  match: 'Real football fixtures and results from football-data.org: Premier League, Primeira Liga and Champions League.',
  fortune: 'Yes or no questions about the real world, picked by hand from Manifold, a play money forecasting site.',
  weather: 'The real weather right now from Open-Meteo, and what it does to the pirate ships.',
  duel: 'Tap any captain in the harbor to challenge them to a quick duel of three rounds.',
};
export const OPEN_STALL = name => `Open the ${name.toLowerCase()}`;

export const MARKET = {
  question: 'Will it go up or down?',
  up: 'Up', down: 'Down',
  stakeGroup: 'Your stake',
  sideGroup: name => `Up or down for ${name}`,
  promise: stake => `You put in ${formatCoins(stake)}. Close it when you like to collect what it is worth.`,
  choose: 'Pick up or down, then a stake.',
  confirm: (stake, side) => `Place ${formatCoins(stake)} on ${side}`,
  placed: (stake, side) => `Your ${formatCoins(stake)} is on ${side}.`,
  holding: (side, stake) => `You said ${side} with ${formatCoins(stake)}.`,
  now: result => `Now ${formatCoinDelta(result)}`,
  nowUnknown: 'Now: waiting for a price',
  close: 'Close',
  closeLabel: (side, name) => `Close your ${side} stake on ${name}`,
  closedNow: 'Market closed for now',
  closedUntil: when => `Market closed, back at ${when} Lisbon`,
  unavailable: 'Prices unavailable right now',
  catchingUp: 'Prices are catching up. Try again in a minute.',
  later: 'Stakes open later.',
  retired: 'This stall takes no new stakes.',
  noPrice: 'No price yet',
};

export const MATCH = {
  empty: 'No matches this week. Leagues pause for internationals.',
  closed: 'The match board is closed for now.',
  unavailable: 'Matches unavailable right now',
  pickGroup: match => `Who wins ${match}?`,
  draw: 'Draw',
  picksClosed: 'Picks for this match are closed.',
  yourPick: (pick, stake) => `Your pick: ${pick}, ${formatCoins(stake)}`,
};

export const FORTUNE = {
  empty: 'No open questions right now',
  closed: 'The fortune teller is closed for now.',
  unavailable: 'Questions unavailable right now',
  yes: 'Yes', no: 'No',
  pickGroup: 'Yes or no?',
  yourAnswer: (side, stake) => `Your answer: ${side}, ${formatCoins(stake)}`,
};

export const POOL = {
  choose: 'Pick a side, then a stake.',
  win: gain => `If you are right you win about ${formatCoins(gain)}`,
  lonely: stake => `If you are right you get your ${formatCoins(stake)} back, plus a share of what others put on the other side.`,
  confirm: (stake, side) => `Place ${formatCoins(stake)} on ${side}`,
  placed: (stake, side) => `Your ${formatCoins(stake)} is on ${side}.`,
};

export const MY_STAKES = {
  title: 'My stakes',
  none: 'No stakes yet.',
  waiting: 'waiting for the result',
  row: (stake, side, what, state) => `${formatCoins(stake)} on ${side} (${what}): ${state}`,
};

// The result of anything that settled or closed: "You won 🪙 +10".
export function resultText(gain) {
  if (!Number.isFinite(gain)) return 'Settled';
  if (gain > 0) return `You won ${formatCoinDelta(gain)}`;
  if (gain < 0) return `You lost ${formatCoinDelta(gain)}`;
  return 'You got your coins back';
}
export const refundedText = stake => `Refunded ${formatCoins(stake)}`;

// Plain words for the refusals the stalls can meet. The server's own message is never shown,
// because it may name limits and fees that the Harbor does not talk about.
const REFUSALS = {
  insufficient_funds: 'You do not have enough coins for this stake.',
  daily_stake_cap: 'You reached today\'s limit here. Come back tomorrow.',
  too_many_requests: 'Wait a few seconds, then try again.',
  market_closed: 'The market just closed. Try again when it opens.',
  prices_stale: 'Prices are catching up. Try again in a minute.',
  company_unavailable: 'Prices unavailable right now',
  company_delisted: 'This stall takes no new stakes.',
  too_many_positions: 'Close a stake before you place a new one.',
  stake_too_small: 'This stall needs a bigger stake.',
  stake_too_big: 'This stall needs a smaller stake.',
  already_staked: 'You already have a stake on this one.',
  pool_closed: 'Picks for this one are closed.',
  position_closed: 'This stake was already closed.',
  feature_off: 'This stall is closed for now.',
  source_unavailable: 'The stall cannot check the real world right now. Try again soon.',
  busy: 'Waiting for the server...',
};
export const refusalText = code => REFUSALS[code] ?? 'The stall said no this time. Try again later.';

// Real asset prices may be big ("$74,339"); only coins stay small.
const dollars = (digits) => new Intl.NumberFormat('en-US', {minimumFractionDigits: digits, maximumFractionDigits: digits});
export function priceText(price) {
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return null;
  const digits = price >= 1000 ? 0 : price >= 1 ? 2 : 4;
  return `$${dollars(digits).format(price)}`;
}

const lisbonParts = (date, options) => new Intl.DateTimeFormat('en-GB', {timeZone: 'Europe/Lisbon', ...options}).format(date);
// "15:30", or "Monday 14:30" when the market opens on another Lisbon day.
export function lisbonWhen(iso, now = Date.now()) {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return null;
  const time = lisbonParts(date, {hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
  const sameDay = lisbonParts(date, {dateStyle: 'short'}) === lisbonParts(new Date(now), {dateStyle: 'short'});
  return sameDay ? time : `${lisbonParts(date, {weekday: 'long'})} ${time}`;
}

// "Sat 20:00" in the player's own time zone, for a match kickoff.
export function kickoffText(iso, timeZone) {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    ...(timeZone ? {timeZone} : {})}).format(date).replace(',', '');
}
