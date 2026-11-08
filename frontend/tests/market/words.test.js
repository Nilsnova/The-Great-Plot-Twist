// Plain words for every company status and every error code of the Exchange (spec sections 8.5 and 9.4).
import { describe, expect, it } from 'vitest';
import {
  statusWords, errorWords, ERROR_FALLBACKS, GENERIC_ERROR, OUTCOME_UNKNOWN, DELISTED_WORDS, DEMO_LABEL, SIGN_IN_WORDS,
  sideWords, profitWords, demoWords,
} from '../../src/screens/market/words.js';

// Every code the server can answer (section 8.5), plus the two the browser adds itself.
const SERVER_CODES = [
  'unauthorized', 'feature_off', 'no_such_company', 'no_such_position', 'already_applied', 'market_closed',
  'prices_stale', 'company_unavailable', 'company_delisted', 'daily_stake_cap', 'too_many_positions',
  'insufficient_funds', 'position_closed', 'wrong_price_mode', 'validation_error', 'stake_too_small',
  'stake_too_big', 'invalid_transaction', 'too_many_requests', 'database_error', 'database_unavailable',
  'database_not_configured', 'market_unavailable',
];
const BROWSER_CODES = ['outcome_unknown', 'network_error', 'bad_response'];

const at = { timeZone: 'UTC', now: '2026-11-06T12:05:03Z' };

describe('status words', () => {
  it('says an island company is open around the clock', () => {
    expect(statusWords({ kind: 'island', status: 'open' }, at)).toBe('Open around the clock');
  });

  it('says until when a stock market is open', () => {
    const state = { kind: 'stock', status: 'open', closesAt: '2026-11-06T21:00:00Z' };
    expect(statusWords(state, at)).toBe('Open until 21:00');
    expect(statusWords({ kind: 'stock', status: 'open' }, at)).toBe('Open now');
  });

  it('says when a closed market opens again', () => {
    const state = { kind: 'stock', market: 'us', status: 'closed', reason: 'outside_hours', opensAt: '2026-11-06T14:30:00Z' };
    expect(statusWords(state, at)).toBe('Closed, opens 14:30 Lisbon time');
    expect(statusWords({ ...state, opensAt: '2026-11-07T14:30:00Z' }, at)).toBe('Closed, opens tomorrow 14:30 Lisbon time');
  });

  it('names the weekday for a weekend and the holiday for a holiday', () => {
    const weekend = { kind: 'stock', market: 'us', status: 'closed', reason: 'weekend', opensAt: '2026-11-09T14:30:00Z' };
    expect(statusWords(weekend, at)).toBe('Closed for the weekend, opens Monday 14:30 Lisbon time');
    const holiday = { kind: 'stock', market: 'us', status: 'closed', reason: 'holiday', holiday: 'Thanksgiving Day', opensAt: '2026-11-27T14:30:00Z' };
    expect(statusWords(holiday, at)).toBe('Closed for Thanksgiving Day, opens Friday 14:30 Lisbon time');
  });

  it('copes with a holiday that has no name', () => {
    const holiday = { kind: 'stock', market: 'us', status: 'closed', reason: 'holiday', holiday: null, opensAt: '2026-11-27T14:30:00Z' };
    expect(statusWords(holiday, at)).toBe('Closed for a holiday, opens Friday 14:30 Lisbon time');
  });

  it.each([
    ['summer', '2026-07-07T13:30:00Z', '2026-07-07T10:00:00Z', '14:30'],
    ['winter', '2026-01-06T14:30:00Z', '2026-01-06T10:00:00Z', '14:30'],
    ['different US and European DST weeks', '2026-03-16T13:30:00Z', '2026-03-16T10:00:00Z', '13:30'],
  ])('shows the supplied US opening in Lisbon during %s even for a New York caller', (_season, opensAt, now, expected) => {
    const state = { kind: 'stock', market: 'us', status: 'closed', reason: 'outside_hours', opensAt };
    expect(statusWords(state, { now, timeZone: 'America/New_York' })).toBe(`Closed, opens ${expected} Lisbon time`);
    expect(statusWords(state, { now })).toBe(`Closed, opens ${expected} Lisbon time`);
  });

  it('counts opening days in Lisbon when the player is still on the previous day', () => {
    const state = { kind: 'stock', market: 'us', status: 'closed', reason: 'outside_hours', opensAt: '2026-07-13T13:30:00Z' };
    expect(statusWords(state, { now: '2026-07-12T23:30:00Z', timeZone: 'America/New_York' })).toBe('Closed, opens 14:30 Lisbon time');
  });

  it('keeps US closing and last-price times in the player zone and does not label an unknown opening', () => {
    const local = { now: '2026-07-07T12:00:00Z', timeZone: 'America/New_York' };
    const stock = { kind: 'stock', market: 'us' };
    expect(statusWords({ ...stock, status: 'open', closesAt: '2026-07-07T20:00:00Z' }, local)).toBe('Open until 16:00');
    expect(statusWords({ ...stock, status: 'stale', reason: 'source_away', priceAt: '2026-07-07T11:59:00Z' }, local))
      .toBe('Price source not answering. Last price 07:59. Trading paused.');
    for (const opensAt of [null, undefined, 'not a date']) {
      expect(statusWords({ ...stock, status: 'closed', reason: 'outside_hours', opensAt }, local)).toBe('Closed');
    }
    expect(statusWords({ kind: 'island', market: 'always', status: 'closed', reason: 'outside_hours', opensAt: '2026-07-07T13:30:00Z' }, local))
      .toBe('Closed, opens 09:30');
  });

  it('says plainly when the opening hours are not known', () => {
    const state = { kind: 'stock', status: 'closed', reason: 'no_calendar', opensAt: null };
    expect(statusWords(state, at)).toBe('Closed: opening hours after 31 December are not known yet');
  });

  it('shows the last price time when the price source does not answer', () => {
    const state = { kind: 'island', status: 'stale', reason: 'source_away', priceAt: '2026-11-06T12:05:00Z' };
    expect(statusWords(state, at)).toBe('Price source not answering. Last price 12:05. Trading paused.');
  });

  it('explains the two stock-only waiting states', () => {
    expect(statusWords({ status: 'stale', reason: 'waiting_first_price' }, at)).toBe('Waiting for the first price of the day.');
    expect(statusWords({ status: 'stale', reason: 'quote_old' }, at)).toBe('Waiting for a fresh price.');
  });

  it('explains why a company has no price', () => {
    expect(statusWords({ status: 'unavailable', reason: 'no_price' }, at)).toBe('No price yet.');
    expect(statusWords({ status: 'unavailable', reason: 'source_off' }, at)).toBe('Prices not connected yet.');
    expect(statusWords({ status: 'unavailable', reason: 'not_in_recording' }, at)).toBe('Not part of the demo recording.');
  });

  it('shows a closed stock and its supplied Lisbon opening even before the first quote', () => {
    const state = {kind:'stock',market:'us',status:'unavailable',reason:'no_price',opensAt:'2026-11-09T14:30:00Z'};
    expect(statusWords(state, {now:'2026-11-08T12:00:00Z',timeZone:'America/New_York'}))
      .toBe('Closed, opens Monday 14:30 Lisbon time. No price yet.');
    expect(statusWords({...state,opensAt:'2026-07-13T13:30:00Z'}, {now:'2026-07-12T12:00:00Z'}))
      .toBe('Closed, opens Monday 14:30 Lisbon time. No price yet.');
  });

  it.each([null,undefined,'','not a date',55,{}])('keeps no-price wording without a usable supplied opening: %j', opensAt => {
    expect(statusWords({kind:'stock',market:'us',status:'unavailable',reason:'no_price',opensAt},
      {now:'2026-11-08T12:00:00Z'})).toBe('No price yet.');
  });

  it('does not infer closure for non-stocks, open stocks or other unavailable reasons', () => {
    const stock = {kind:'stock',market:'us',status:'unavailable',reason:'no_price',opensAt:'2026-11-09T14:30:00Z'};
    for (const kind of ['island',undefined])expect(statusWords({...stock,kind},at)).toBe('No price yet.');
    expect(statusWords({...stock,status:'open'},at)).toBe('Open now');
    expect(statusWords({...stock,reason:'source_off'},at)).toBe('Prices not connected yet.');
    expect(statusWords({...stock,reason:'not_in_recording'},at)).toBe('Not part of the demo recording.');
    expect(statusWords({...stock,reason:'wrong_price_mode',mode:'live'},at))
      .toBe('Opened on the live market: it can be closed only there.');
  });

  it('explains a position that was opened on the other kind of prices, saying which kind', () => {
    const state = { status: 'unavailable', reason: 'wrong_price_mode' };
    expect(statusWords({ ...state, mode: 'live' }, at)).toBe('Opened on the live market: it can be closed only there.');
    expect(statusWords({ ...state, mode: 'replay' }, at)).toBe('Opened on the demo recording: it can be closed only in demo mode.');
    expect(statusWords(state, at)).toBe('Opened on the other kind of prices (live market or demo recording): it can be closed only there.');
  });

  it('has different words for every status and reason the server can send', () => {
    const combos = [
      ['closed', 'outside_hours'], ['closed', 'weekend'], ['closed', 'holiday'], ['closed', 'no_calendar'],
      ['stale', 'source_away'], ['stale', 'waiting_first_price'], ['stale', 'quote_old'],
      ['unavailable', 'source_off'], ['unavailable', 'not_in_recording'], ['unavailable', 'no_price'],
      ['unavailable', 'wrong_price_mode'],
    ];
    const lines = combos.map(([status, reason]) => statusWords({ kind: 'stock', status, reason, opensAt: '2026-11-09T14:30:00Z', priceAt: '2026-11-06T12:00:00Z' }, at));
    expect(lines.every(line => typeof line === 'string' && line.length > 8)).toBe(true);
    expect(new Set(lines).size).toBe(combos.length);
  });

  it('never shows a blank line for a status it does not know', () => {
    expect(statusWords({ status: 'sleepy', reason: 'dreaming' }, at)).toBe('Not available right now.');
    expect(statusWords({}, at)).toBe('Not available right now.');
    expect(statusWords(null, at)).toBe('Not available right now.');
  });

  it('keeps the fixed lines of the spec', () => {
    expect(DELISTED_WORDS).toBe('Delisted after the Relighting: you can only close positions.');
    expect(DEMO_LABEL).toBe('Demo recording: prices from 4 November 2026 (Binance Vision), played back. Trades here use your real coins.');
    expect(OUTCOME_UNKNOWN).toBe('We could not confirm this. Check your positions before you try again.');
    expect(GENERIC_ERROR).toBe('Something went wrong. Please try again.');
    expect(SIGN_IN_WORDS).toBe('Sign in to trade on the Island Exchange.');
  });

  it('prefers the label the server sends for demo mode', () => {
    expect(demoWords({ demo: true, demoNote: 'The server label.' })).toBe('The server label.');
    expect(demoWords({ demo: true, demoNote: null })).toBe(DEMO_LABEL);
    expect(demoWords({ demo: false, demoNote: null })).toBe(null);
  });
});

describe('error words', () => {
  it('has a fallback line for every error code of section 8.5 and for the browser codes', () => {
    for (const code of [...SERVER_CODES, ...BROWSER_CODES]) {
      expect(typeof ERROR_FALLBACKS[code], code).toBe('string');
      expect(ERROR_FALLBACKS[code].length, code).toBeGreaterThan(10);
    }
  });

  it('shows the plain words the server sent', () => {
    const error = { code: 'market_closed', message: 'Apple trades in New York, which is closed now.' };
    expect(errorWords(error)).toBe('Apple trades in New York, which is closed now.');
  });

  it('uses its own fallback when the server sent no message', () => {
    expect(errorWords({ code: 'prices_stale', message: '' })).toBe(ERROR_FALLBACKS.prices_stale);
    expect(errorWords({ code: 'prices_stale' })).toBe(ERROR_FALLBACKS.prices_stale);
    expect(errorWords({ code: 'prices_stale', message: '   ' })).toBe(ERROR_FALLBACKS.prices_stale);
  });

  it('gives an unknown code the generic line, whatever the message says', () => {
    expect(errorWords({ code: 'brand_new_code', message: 'Surprise.' })).toBe(GENERIC_ERROR);
    expect(errorWords({})).toBe(GENERIC_ERROR);
    expect(errorWords(null)).toBe(GENERIC_ERROR);
  });

  it('asks the player to sign in whatever the standard answer says', () => {
    expect(errorWords({ code: 'unauthorized', message: 'Not authenticated' })).toBe('Sign in to trade on the Island Exchange.');
  });

  it('names the coins needed when there are not enough, using the total the server sent for the stake', () => {
    const error = { code: 'insufficient_funds', message: 'Not enough coins.' };
    expect(errorWords(error, { total: 102 })).toBe('You need 102 coins for this stake and its fee.');
    expect(errorWords(error, { total: 1020 })).toBe('You need 1,020 coins for this stake and its fee.');
    expect(errorWords(error, {})).toBe('Not enough coins.');
  });

  it('says how long to wait after a too-fast trade', () => {
    const error = { code: 'too_many_requests', message: 'Slow down.', retryAfterSeconds: 7 };
    expect(errorWords(error)).toBe('You are trading very fast. Wait 7 seconds, then try again.');
    expect(errorWords({ ...error, retryAfterSeconds: 1 })).toBe('You are trading very fast. Wait 1 second, then try again.');
    expect(errorWords({ ...error, retryAfterSeconds: null })).toBe('Slow down.');
  });

  it('always uses the same words for an unknown outcome', () => {
    expect(errorWords({ code: 'outcome_unknown', message: 'whatever' })).toBe(OUTCOME_UNKNOWN);
  });
});

describe('small words', () => {
  it('names the side', () => {
    expect(sideWords('rising')).toBe('Rising');
    expect(sideWords('falling')).toBe('Falling');
    expect(sideWords('sideways')).toBe('Unknown');
  });

  it('says up or down in words and keeps the sign, never only a colour', () => {
    expect(profitWords(15, 15)).toEqual({ direction: 'up', text: 'Up 15 coins (15.00 %)' });
    expect(profitWords(-20, -20)).toEqual({ direction: 'down', text: 'Down 20 coins (-20.00 %)' });
    expect(profitWords(0, 0)).toEqual({ direction: 'even', text: 'Unchanged (0.00 %)' });
    expect(profitWords(1, 1)).toEqual({ direction: 'up', text: 'Up 1 coin (1.00 %)' });
    expect(profitWords(null, null)).toEqual({ direction: 'even', text: 'Profit unknown' });
  });
});
