// The local time words of the match board (moved from the removed prediction desk on 11 Nov).
import { describe, expect, it } from 'vitest';
import { closingLabel, formatLocalTime, timeOfDay } from '../../src/screens/sports/time-labels.js';

const NOW = Date.parse('2026-11-06T12:00:00Z');
const UTC = { timeZone: 'UTC' };

describe('times and closing labels', () => {
  it('formats a UTC time in the given zone with the zone name', () => {
    expect(formatLocalTime('2026-12-17T12:00:00Z', UTC)).toBe('Thu 17 Dec, 12:00 UTC');
    expect(formatLocalTime('2026-12-17T12:00:00Z', { timeZone: 'Europe/Berlin' })).toMatch(/^Thu 17 Dec, 13:00 /);
  });

  it('gives a plain time of day for a decision', () => {
    expect(timeOfDay('2026-11-20T14:02:00Z', UTC)).toBe('14:02');
  });

  it('counts the days to the close', () => {
    expect(closingLabel('2026-12-17T12:00:00Z', NOW, UTC)).toBe('Staking closes Thu 17 Dec, 12:00 UTC (in 41 days)');
    expect(closingLabel('2026-11-07T12:00:00Z', NOW, UTC)).toContain('(in 1 day)');
  });

  it('counts hours and minutes close to the end', () => {
    expect(closingLabel('2026-11-06T17:30:00Z', NOW, UTC)).toContain('(in 5 hours)');
    expect(closingLabel('2026-11-06T13:00:00Z', NOW, UTC)).toContain('(in 1 hour)');
    expect(closingLabel('2026-11-06T12:12:30Z', NOW, UTC)).toContain('(in 12 minutes)');
    expect(closingLabel('2026-11-06T12:01:00Z', NOW, UTC)).toContain('(in 1 minute)');
    expect(closingLabel('2026-11-06T12:00:30Z', NOW, UTC)).toContain('(in less than a minute)');
  });

  it('says closed after the closing time, and at exactly the closing time', () => {
    expect(closingLabel('2026-11-06T11:00:00Z', NOW, UTC)).toBe('Staking closed Fri 6 Nov, 11:00 UTC');
    expect(closingLabel('2026-11-06T12:00:00Z', NOW, UTC)).toBe('Staking closed Fri 6 Nov, 12:00 UTC');
  });

  it('copes with a closing time it cannot read', () => {
    expect(closingLabel('nonsense', NOW, UTC)).toBe('The closing time is not known.');
    expect(closingLabel(null, NOW, UTC)).toBe('The closing time is not known.');
  });
});

