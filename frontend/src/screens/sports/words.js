// Plain presentation labels only. Betting eligibility, caps, results and payouts come from the API.
import { formatLocalTime } from '../predictions/time-labels.js';
export const SIMULATION = 'Simulation · play money only. Coins cannot be bought or cashed out. No real prizes.';
export const UNKNOWN = 'The stake outcome is unknown. Retry the same stake below; its reference is kept so you cannot pay twice.';
export const when = iso => formatLocalTime(iso) || 'Time unavailable';
export function pickName(pick, fixture) {
  return pick === 'home' ? fixture.home : pick === 'away' ? fixture.away : 'Draw';
}
export function fixtureStatus(fixture, now = Date.now()) {
  if (fixture.source === 'recorded') return 'Recorded example · read only';
  if (fixture.pool?.status === 'settled') return 'Settled';
  if (fixture.status === 'scheduled') return fixture.canStake && now < Date.parse(fixture.closesAt) ? 'Staking open' : 'Staking closed';
  return ({ playing: 'In play · staking closed', finished: 'Final result', postponed: 'Postponed',
    cancelled: 'Canceled', suspended: 'Suspended', unknown: 'Status unavailable' })[fixture.status] ?? 'Unavailable';
}
export function settlementText(stake) {
  if (stake.status !== 'settled') return 'Waiting for a verified result. No payout has been confirmed.';
  if (stake.settlement?.startsWith('refund_')) return `Refunded · ${stake.payout} coins returned`;
  return `${stake.payout > 0 ? 'Paid' : 'Settled'} · ${stake.payout} coins returned`;
}
