// Optional schema-1 islet display fields share one contract across every adapter.
import {expect} from 'vitest';
import {caseReasons} from '../reasons.js';

function exactKeys(value, keys) {
  expect(Object.keys(value).sort()).toEqual([...keys].sort());
}

export function validateIsletDisplay(view) {
  const reminder = view.crew?.isletReminder;
  const station = view.finale?.islet;
  const failure = view.finale?.isletFailure;
  if ('isletReminder' in view.crew && reminder !== null) {
    exactKeys(reminder, ['message', 'actionLabel']);
    for (const key of ['message', 'actionLabel']) expect(typeof reminder[key]).toBe('string');
  }
  if ('islet' in view.finale && station !== null) {
    exactKeys(station, ['id', 'name', 'built', 'canBuild', 'buildLabel', 'caption']);
    expect(station.id).toBe('islet_signal_station');
    for (const key of ['name', 'caption']) expect(typeof station[key]).toBe('string');
    for (const key of ['built', 'canBuild']) expect(typeof station[key]).toBe('boolean');
    expect(station.buildLabel === null || typeof station.buildLabel === 'string').toBe(true);
  }
  if ('isletFailure' in view.finale && failure !== null) {
    const optional = ['status', 'retryAfterSeconds', 'retryUntil'];
    exactKeys(failure, ['reason', 'message', ...optional.filter(key => key in failure)]);
    expect(caseReasons).toContain(failure.reason);
    expect(typeof failure.message).toBe('string');
    if ('status' in failure) expect(Number.isInteger(failure.status) && failure.status >= 0 && failure.status <= 599).toBe(true);
    if ('retryAfterSeconds' in failure) expect(Number.isInteger(failure.retryAfterSeconds)
      && failure.retryAfterSeconds >= 0 && failure.retryAfterSeconds <= 86400).toBe(true);
    if ('retryUntil' in failure) expect(failure.reason === 'rate_limited' && Number.isFinite(failure.retryUntil)
      && failure.retryUntil >= 0 && failure.retryUntil <= Number.MAX_SAFE_INTEGER).toBe(true);
  }
  if (view.account.state !== 'signed_in') {
    if ('isletReminder' in view.crew) expect(reminder).toBeNull();
    if ('islet' in view.finale) expect(station).toBeNull();
    if ('isletFailure' in view.finale) expect(failure).toBeNull();
  }
}
