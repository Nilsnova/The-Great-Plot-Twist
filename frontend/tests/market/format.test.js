// Plain formatting for the Exchange panel: prices, coins, percent and local times. No DOM, no rules.
import { describe, expect, it } from 'vitest';
import {
  coinsText, coinsLabel, signedCoinsText, priceText, percentText, timeText, momentText, roundTowardEntry, zeroPointText,
} from '../../src/screens/market/format.js';

describe('coins', () => {
  it('writes whole coins with thousands separators', () => {
    expect(coinsText(0)).toBe('0');
    expect(coinsText(2000)).toBe('2,000');
    expect(coinsText(-5)).toBe('-5');
  });

  it('writes a missing or fractional amount as unknown instead of inventing one', () => {
    for (const value of [null, undefined, NaN, 1.5, '12', Infinity]) expect(coinsText(value)).toBe('unknown');
  });

  it('adds the word coin or coins, one for exactly one', () => {
    expect(coinsLabel(1)).toBe('1 coin');
    expect(coinsLabel(-1)).toBe('-1 coin');
    expect(coinsLabel(0)).toBe('0 coins');
    expect(coinsLabel(1234)).toBe('1,234 coins');
    expect(coinsLabel(null)).toBe('unknown');
  });

  it('signs a change so that gain and loss are never only a colour', () => {
    expect(signedCoinsText(113)).toBe('+113');
    expect(signedCoinsText(-20)).toBe('-20');
    expect(signedCoinsText(0)).toBe('0');
    expect(signedCoinsText(null)).toBe('unknown');
  });
});

describe('prices', () => {
  it('uses the decimals of the company and adds its currency', () => {
    expect(priceText(76159.21, { priceDecimals: 2, currency: 'USDT' })).toBe('76,159.21 USDT');
    expect(priceText(2.4, { priceDecimals: 4, currency: 'USDT' })).toBe('2.4000 USDT');
    expect(priceText(271.2, { priceDecimals: 2, currency: 'USD' })).toBe('271.20 USD');
    expect(priceText(1500, { priceDecimals: 0, currency: 'USD' })).toBe('1,500 USD');
  });

  it('writes only the number when there is no currency', () => {
    expect(priceText(2.6512, { priceDecimals: 4 })).toBe('2.6512');
  });

  it('falls back to two decimals when priceDecimals is missing or silly', () => {
    expect(priceText(5, {})).toBe('5.00');
    expect(priceText(5)).toBe('5.00');
    for (const bad of [-1, 9, 1.5, 'x', null]) expect(priceText(5, { priceDecimals: bad })).toBe('5.00');
  });

  it('writes a missing price as unknown', () => {
    expect(priceText(null, { priceDecimals: 2, currency: 'USD' })).toBe('unknown');
    expect(priceText(NaN, { priceDecimals: 2 })).toBe('unknown');
  });
});

describe('percent', () => {
  it('always shows two decimals and a space before the sign, as the spec writes it', () => {
    expect(percentText(15)).toBe('15.00 %');
    expect(percentText(-7.5)).toBe('-7.50 %');
    expect(percentText(0)).toBe('0.00 %');
    expect(percentText(null)).toBe('unknown');
  });
});

describe('times in the time zone of the player', () => {
  const noon = '2026-11-06T12:05:03Z';

  it('shows hours and minutes, never seconds', () => {
    expect(timeText(noon, { timeZone: 'UTC' })).toBe('12:05');
    expect(timeText('2026-11-05T20:59:59Z', { timeZone: 'UTC' })).toBe('20:59');
  });

  it('follows the time zone it is given', () => {
    expect(timeText(noon, { timeZone: 'Europe/Berlin' })).toBe('13:05');
    expect(timeText(noon, { timeZone: 'America/New_York' })).toBe('07:05');
    expect(timeText(noon, { timeZone: 'Europe/Lisbon' })).toBe('12:05');
  });

  it('writes a bad time as unknown', () => {
    for (const bad of [null, undefined, '', 'yesterday', '2026-13-45T99:99:99Z']) expect(timeText(bad, { timeZone: 'UTC' })).toBe('unknown');
  });
});

describe('moments with a day word when the day is not today', () => {
  const options = { timeZone: 'UTC', now: '2026-11-06T12:05:03Z' };

  it('leaves the day out for the same day', () => {
    expect(momentText('2026-11-06T14:30:00Z', options)).toBe('14:30');
  });

  it('says tomorrow and yesterday', () => {
    expect(momentText('2026-11-07T14:30:00Z', options)).toBe('tomorrow 14:30');
    expect(momentText('2026-11-05T20:59:59Z', options)).toBe('yesterday 20:59');
  });

  it('names the weekday further away', () => {
    expect(momentText('2026-11-09T14:30:00Z', options)).toBe('Monday 14:30');
    expect(momentText('2026-11-02T10:00:00Z', options)).toBe('Monday 10:00');
  });

  it('can always name the weekday, for weekends and holidays', () => {
    expect(momentText('2026-11-06T14:30:00Z', { ...options, alwaysDay: true })).toBe('Friday 14:30');
    expect(momentText('2026-11-07T14:30:00Z', { ...options, alwaysDay: true })).toBe('Saturday 14:30');
  });

  it('counts the days in the time zone of the player, not in UTC', () => {
    // 23:30 UTC is already after midnight in Berlin, so it is tomorrow there.
    const berlin = { timeZone: 'Europe/Berlin', now: '2026-11-06T12:05:03Z' };
    expect(momentText('2026-11-06T23:30:00Z', berlin)).toBe('tomorrow 00:30');
    expect(momentText('2026-11-06T22:30:00Z', berlin)).toBe('23:30');
  });

  it('falls back to just the time when there is no usable now', () => {
    expect(momentText('2026-11-09T14:30:00Z', { timeZone: 'UTC' })).toBe('Monday 14:30');
    expect(momentText('nonsense', options)).toBe('unknown');
  });
});

describe('rounding a zero point toward the entry price', () => {
  it('rounds a rising zero point up, because the entry price lies above it', () => {
    expect(roundTowardEntry(68543.289, 2, 'rising')).toBe(68543.29);
    expect(roundTowardEntry(192.915, 2, 'rising')).toBe(192.92);
    expect(roundTowardEntry(2.16108, 4, 'rising')).toBe(2.1611);
  });

  it('rounds a falling zero point down, because the entry price lies below it', () => {
    expect(roundTowardEntry(83775.131, 2, 'falling')).toBe(83775.13);
    expect(roundTowardEntry(235.785, 2, 'falling')).toBe(235.78);
    expect(roundTowardEntry(2.64132, 4, 'falling')).toBe(2.6413);
  });

  it('leaves a number that already fits untouched, with no floating point surprise', () => {
    expect(roundTowardEntry(68400, 2, 'rising')).toBe(68400);
    expect(roundTowardEntry(76.15, 2, 'rising')).toBe(76.15);
    expect(roundTowardEntry(2.64, 4, 'falling')).toBe(2.64);
    expect(roundTowardEntry(0.1 + 0.2, 1, 'rising')).toBe(0.3);
  });

  it('works with no decimals and with many', () => {
    expect(roundTowardEntry(192.915, 0, 'rising')).toBe(193);
    expect(roundTowardEntry(192.915, 0, 'falling')).toBe(192);
    expect(roundTowardEntry(0.00012345, 6, 'rising')).toBe(0.000124);
    expect(roundTowardEntry(0.00012345, 6, 'falling')).toBe(0.000123);
  });

  it('refuses what is not a price', () => {
    for (const bad of [null, NaN, -1, 'x']) expect(roundTowardEntry(bad, 2, 'rising')).toBe(null);
  });

  it('formats the rounded zero point with the decimals and currency of the company', () => {
    expect(zeroPointText(68543.289, 'rising', { priceDecimals: 2, currency: 'USDT' })).toBe('68,543.29 USDT');
    expect(zeroPointText(83775.131, 'falling', { priceDecimals: 2, currency: 'USDT' })).toBe('83,775.13 USDT');
    expect(zeroPointText(2.64, 'falling', { priceDecimals: 4, currency: 'USDT' })).toBe('2.6400 USDT');
    expect(zeroPointText(null, 'rising', { priceDecimals: 2, currency: 'USDT' })).toBe('unknown');
  });
});
