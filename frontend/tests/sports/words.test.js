// Fixture and returned-coin labels never invent a live result or imply pending payouts.
import { expect, it } from 'vitest';
import { fixtureStatus, settlementText } from '../../src/screens/sports/words.js';
import { FIXTURE, OPEN_STAKE } from './sample-answers.js';
it('recorded fixtures remain clearly read-only even if an upstream flag is wrong', () => {
  expect(fixtureStatus({ ...FIXTURE, source: 'recorded', canStake: true })).toBe('Recorded example · read only');
});
it('distinguishes closed/live/finished and unpaid stakes from confirmed returns', () => {
  expect(fixtureStatus({ ...FIXTURE, canStake: false })).toBe('Staking closed');
  expect(fixtureStatus({ ...FIXTURE, closesAt: '2023-01-01T19:00:00Z', canStake: true })).toBe('Staking closed');
  expect(fixtureStatus({ ...FIXTURE, status: 'playing' })).toContain('staking closed');
  expect(settlementText(OPEN_STAKE)).toContain('No payout has been confirmed');
  expect(settlementText({ ...OPEN_STAKE, status: 'settled', payout: 10, settlement: 'refund_no_winners' })).toBe('Refunded · 10 coins returned');
});
