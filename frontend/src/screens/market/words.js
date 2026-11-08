// Plain words for company states, errors and small labels (spec sections 8.5 and 9.4). No DOM.
// Used by: view-models.js, result-words.js, session.js, trades.js and the views. A test checks every code has words.
import { UNKNOWN, coinsLabel, momentText, percentText, timeText } from './format.js';

export const GENERIC_ERROR = 'Something went wrong. Please try again.';
export const OUTCOME_UNKNOWN = 'We could not confirm this. Check your positions before you try again.';
export const SIGN_IN_WORDS = 'Sign in to trade on the Island Exchange.';
export const DELISTED_WORDS = 'Delisted after the Relighting: you can only close positions.';
export const DEMO_LABEL = 'Demo recording: prices from 4 November 2026 (Binance Vision), played back. Trades here use your real coins.';
export const NOT_AVAILABLE = 'Not available right now.';

// The screen's own line for every code. The server's message wins when there is one (see errorWords).
export const ERROR_FALLBACKS = {
  unauthorized: SIGN_IN_WORDS,
  feature_off: 'The Island Exchange is not open yet.',
  no_such_company: 'There is no company with that id.',
  no_such_position: 'You have no position with that id.',
  already_applied: 'This was already done.',
  market_closed: 'This company cannot be traded now: its market is closed.',
  prices_stale: 'The price is not up to date right now, so trading is paused. Try again in a moment.',
  company_unavailable: 'This company cannot be traded right now: its prices are not connected.',
  company_delisted: 'This company was delisted after the Relighting. You can still close your positions in it.',
  daily_stake_cap: 'You have reached the limit for new positions today. You can try again from the next game day.',
  too_many_positions: 'You have too many open positions. Close one first.',
  insufficient_funds: 'You do not have enough coins for this stake and its fee.',
  position_closed: 'This position is already closed.',
  wrong_price_mode: 'This position was opened on the live market or on the demo recording, so it can only be closed there.',
  validation_error: 'Something in the request was not right. Please check it and try again.',
  stake_too_small: 'The stake is too small for a position.',
  stake_too_big: 'The stake is too big for a position.',
  invalid_transaction: 'This trade could not be completed. Nothing changed.',
  too_many_requests: 'You are trading very fast. Wait a few seconds, then try again.',
  database_error: GENERIC_ERROR,
  database_unavailable: 'The database did not answer in time. Your trade may or may not have gone through: check your positions before you try again.',
  database_not_configured: 'The Island Exchange is not connected to its database yet.',
  market_unavailable: 'The Island Exchange is not available right now.',
  server_error: GENERIC_ERROR,
  outcome_unknown: OUTCOME_UNKNOWN,
  network_error: 'Could not reach the Island Exchange. Check your connection and try again.',
  bad_response: GENERIC_ERROR,
};

export function errorWords(error, context = {}) {
  const code = error?.code;
  if (!Object.hasOwn(ERROR_FALLBACKS, code)) return GENERIC_ERROR;
  if (code === 'unauthorized') return SIGN_IN_WORDS;
  if (code === 'outcome_unknown') return OUTCOME_UNKNOWN;
  if (code === 'insufficient_funds' && Number.isSafeInteger(context.total)) return `You need ${coinsLabel(context.total)} for this stake and its fee.`;
  const wait = error.retryAfterSeconds;
  if (code === 'too_many_requests' && Number.isFinite(wait) && wait > 0) {
    return `You are trading very fast. Wait ${wait} ${wait === 1 ? 'second' : 'seconds'}, then try again.`;
  }
  const message = typeof error.message === 'string' ? error.message.trim() : '';
  return message || ERROR_FALLBACKS[code];
}

// US stock openings use Lisbon time; other timestamps keep the player's zone.
function opening(state, options, alwaysDay = false) {
  const lisbon = state.kind === 'stock' && state.market === 'us';
  const when = momentText(state.opensAt, { ...options, ...(lisbon ? { timeZone: 'Europe/Lisbon' } : {}), alwaysDay });
  return when === UNKNOWN ? '' : `, opens ${when}${lisbon ? ' Lisbon time' : ''}`;
}

const CLOSED = {
  outside_hours: (state, options) => `Closed${opening(state, options)}`,
  weekend: (state, options) => `Closed for the weekend${opening(state, options, true)}`,
  holiday: (state, options) => `Closed for ${state.holiday || 'a holiday'}${opening(state, options, true)}`,
  no_calendar: () => 'Closed: opening hours after 31 December are not known yet',
};
const STALE = {
  source_away(state, options) {
    const last = state.priceAt ? momentText(state.priceAt, options) : UNKNOWN;
    return `Price source not answering.${last === UNKNOWN ? '' : ` Last price ${last}.`} Trading paused.`;
  },
  waiting_first_price: () => 'Waiting for the first price of the day.',
  quote_old: () => 'Waiting for a fresh price.',
};
// A position opened on the other kind of prices than the server plays now. `state.mode` is the position's own mode.
function otherPrices(state) {
  if (state.mode === 'live') return 'Opened on the live market: it can be closed only there.';
  if (state.mode === 'replay') return 'Opened on the demo recording: it can be closed only in demo mode.';
  return 'Opened on the other kind of prices (live market or demo recording): it can be closed only there.';
}
const UNAVAILABLE = {
  no_price: () => 'No price yet.',
  source_off: () => 'Prices not connected yet.',
  not_in_recording: () => 'Not part of the demo recording.',
  wrong_price_mode: otherPrices,
};
const BY_STATUS = { closed: CLOSED, stale: STALE, unavailable: UNAVAILABLE };

// What the card says about a company. `state` is a company of the board, or the status fields of a position.
export function statusWords(state, options = {}) {
  const status = state?.status;
  if (status === 'open') {
    if (state.kind === 'island') return 'Open around the clock';
    return state.closesAt ? `Open until ${timeText(state.closesAt, options)}` : 'Open now';
  }
  const words = BY_STATUS[status]?.[state.reason];
  return words ? words(state, options) : NOT_AVAILABLE;
}

export const sideWords = side => ({ rising: 'Rising', falling: 'Falling' })[side] ?? 'Unknown';

// Up or down in words, with the sign, so that the colour is never the only signal.
export function profitWords(profit, percent) {
  if (!Number.isSafeInteger(profit)) return { direction: 'even', text: 'Profit unknown' };
  const tail = percentText(percent) === UNKNOWN ? '' : ` (${percentText(percent)})`;
  if (profit > 0) return { direction: 'up', text: `Up ${coinsLabel(profit)}${tail}` };
  if (profit < 0) return { direction: 'down', text: `Down ${coinsLabel(-profit)}${tail}` };
  return { direction: 'even', text: `Unchanged${tail}` };
}

export function demoWords(board) {
  if (!board?.demo) return null;
  return typeof board.demoNote === 'string' && board.demoNote.trim() ? board.demoNote.trim() : DEMO_LABEL;
}
