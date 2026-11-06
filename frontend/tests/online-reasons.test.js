// The A2 transport vocabulary becomes stable adapter results without leaking unknown payloads.
import {describe, expect, it} from 'vitest';
import {mapApiResult} from '../src/online/case-adapter/reasons.js';

const failed = (status, code, extra = {}) => ({ok: false, status, code, message: 'Placeholder detail.', ...extra});
const rows = [
  [0, 'network_error', 'offline'],
  [0, 'timeout', 'offline'],
  [401, 'unauthorized', 'session_expired'],
  [403, 'forbidden', 'forbidden'],
  [404, 'feature_off', 'feature_off'],
  [404, 'player_not_set_up', 'not_ready'],
  [404, 'wrong_code', 'wrong_code'],
  [404, 'no_crew', 'crew_required'],
  [409, 'kit_needed', 'kit_required'],
  [409, 'already_in_crew', 'already_in_crew'],
  [409, 'crew_busy', 'not_ready'],
  [409, 'crew_full', 'not_ready'],
  [409, 'crew_finished', 'not_ready'],
  [409, 'stale_save', 'save_conflict'],
  [409, 'no_rerolls_left', 'name_reroll_used'],
  [409, 'no_name_yet', 'not_ready'],
  [422, 'validation_error', 'invalid_request'],
  [422, 'move_refused', 'intro_incomplete'],
  [422, 'no_ending', 'intro_incomplete'],
  [422, 'save_too_big', 'save_unavailable'],
  [422, 'save_not_json', 'save_unavailable'],
  [422, 'invalid_transaction', 'internal_error'],
  [502, 'database_error', 'internal_error'],
  [429, 'too_many_requests', 'rate_limited'],
  [503, 'database_unavailable', 'not_connected'],
];

describe('online API reason mapping', () => {
  it.each(rows)('maps %s %s to %s', (status, code, reason) => {
    expect(mapApiResult(failed(status, code))).toMatchObject({accepted: false, reason});
  });

  it('keeps safe fixed wording for transport failures and unknown errors', () => {
    expect(mapApiResult(failed(0, 'timeout')).message)
      .toBe('You are offline. Your progress on this device is kept.');
    for (const status of [400, 404, 409, 422, 500, 502]) {
      const result = mapApiResult(failed(status, 'unknown_code', {body: {privateId: 'placeholder'}}));
      expect(result.reason).toBe('internal_error');
      expect(JSON.stringify(result)).not.toContain('Placeholder');
      expect(result).not.toHaveProperty('body');
    }
  });

  it.each(['crew_full', 'crew_finished'])('preserves the known business explanation for %s', code => {
    expect(mapApiResult(failed(409, code)).message).toBe('Placeholder detail.');
  });

  it.each(['already_applied', 'already_seated', 'already_started'])('accepts %s and requests a read', code => {
    expect(mapApiResult(failed(409, code))).toMatchObject({accepted: true, reason: null, recovery: 'reread'});
  });

  it.each(['__proto__', 'constructor', 'toString'])('refuses unknown code %s without inherited data', code => {
    expect(mapApiResult(failed(409, code)).reason).toBe('internal_error');
  });

  it('describes recovery without executing requests', () => {
    expect(mapApiResult(failed(409, 'crew_busy')).recovery).toBe('retry_once');
    expect(mapApiResult(failed(409, 'no_name_yet')).recovery).toBe('init_name');
    expect(mapApiResult(failed(503, 'case_unavailable'), {method: 'POST'}).recovery).toBe('unknown_outcome');
    expect(mapApiResult(failed(0, 'timeout'), {method: 'PUT'}).recovery).toBe('unknown_outcome');
    expect(mapApiResult(failed(503, 'case_unavailable'), {method: 'GET'})).not.toHaveProperty('recovery');
  });

  it('maps crew join rate limits and bounds a rounded countdown', () => {
    const options = {route: '/api/crews/join', method: 'POST'};
    expect(mapApiResult(failed(429, 'too_many_requests', {retryAfterSeconds: 2.1}), options))
      .toMatchObject({reason: 'too_many_tries', retryAfterSeconds: 3});
    for (const seconds of [-1, Infinity, NaN, '20', 86401]) {
      expect(mapApiResult(failed(429, 'too_many_requests', {retryAfterSeconds: seconds})))
        .not.toHaveProperty('retryAfterSeconds');
    }
    expect(mapApiResult(failed(429, 'too_many_requests', {retryAfterSeconds: 86400})).retryAfterSeconds).toBe(86400);
  });

  it('accepts regular success and repeat success without leaking response extras', () => {
    expect(mapApiResult({ok: true, status: 200, data: {privateId: 'placeholder'}}))
      .toEqual({accepted: true, reason: null, message: ''});
    expect(mapApiResult({ok: true, status: 200, data: {accepted: true, repeat: true}}))
      .toMatchObject({accepted: true, recovery: 'reread'});
  });

  it('preserves the server refusal when an idempotent case answer repeats',()=>{
    expect(mapApiResult({ok:true,status:200,data:{accepted:false,repeat:true,
      reason:'accusation_refused',message:'Placeholder refusal.'}})).toMatchObject({
      accepted:false,reason:'accusation_refused',message:'Placeholder refusal.',recovery:'reread',
    });
  });

  it('uses known case refusals and their explanation but sanitizes unknown case reasons', () => {
    expect(mapApiResult({ok: true, status: 200, data: {
      accepted: false, reason: 'locked_window', message: 'Placeholder window.',
    }})).toEqual({accepted: false, reason: 'locked_window', message: 'Placeholder window.'});
    expect(mapApiResult({ok: true, status: 200, data: {
      accepted: false, reason: 'unknown_code', message: 'Placeholder detail.',
    }}).reason).toBe('internal_error');
    expect(mapApiResult(null).reason).toBe('internal_error');
  });
});
