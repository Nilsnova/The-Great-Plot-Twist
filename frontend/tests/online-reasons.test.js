// The A2 transport vocabulary becomes stable adapter results without leaking unknown payloads.
import {describe, expect, it} from 'vitest';
import {mapApiResult} from '../src/online/adapter/reasons.js';
import {normalizeIntentResult} from '../src/adapter/call-failure.js';
import {createCallState} from '../src/ui/kit/call-state.js';

const failed = (status, code, extra = {}) => ({ok: false, status, code, message: 'Placeholder detail.', ...extra});
// Expected product copy and actions are explicit. Domain actions remain owned by their existing screens:
// real-crew.test.js checks a changed first-tap code and crew reads; real-account-profile.test.js checks
// the used-name control; real-account-saves.test.js checks both save choices and forbids a blind PUT.
// Columns: HTTP status, code, reason, adapter message, phase, Retry, Sign in, next action, visible copy.
const rows = [
  [0, 'network_error', 'offline', 'You are offline. Your progress on this device is kept.',
    'offline', true, false, 'retry the original intent'],
  [0, 'timeout', 'offline', 'You are offline. Your progress on this device is kept.',
    'offline', true, false, 'retry the original intent'],
  [401, 'unauthorized', 'session_expired', 'Session expired. Sign in again.',
    'expired', false, true, 'sign in again', 'Session expired. Sign in again; your progress on this device is kept.'],
  [403, 'forbidden', 'forbidden', 'This action is not available to this account.',
    'error', false, false, 'return to an allowed original action'],
  [404, 'feature_off', 'feature_off', 'This feature opens later. You can keep exploring.',
    'error', false, false, 'keep exploring', 'This feature is unavailable. You can keep exploring.'],
  [404, 'player_not_set_up', 'not_ready', 'Your captain is being set up. Try again in a moment.',
    'error', false, false, 'use the captain-setup action'],
  [404, 'wrong_code', 'wrong_code', 'No crew has that code.',
    'error', false, false, 'edit and check the crew code'],
  [404, 'no_crew', 'crew_required', 'Make or join a crew first.',
    'error', false, false, 'use the crew screen'],
  [409, 'kit_needed', 'kit_required', 'Finish Act 1 first.',
    'error', false, false, 'finish the local intro'],
  [409, 'already_in_crew', 'already_in_crew', 'You already belong to a crew.',
    'error', false, false, 'use the current crew'],
  [409, 'crew_busy', 'not_ready', 'The crew is busy. Try again.',
    'error', false, false, 'use the original crew action after recovery'],
  [409, 'crew_full', 'not_ready', 'Placeholder detail.',
    'error', false, false, 'choose a different crew code'],
  [409, 'crew_finished', 'not_ready', 'Placeholder detail.',
    'error', false, false, 'use the refreshed crew screen'],
  [409, 'stale_save', 'save_conflict', 'This save changed on another device. Choose which copy to keep.',
    'error', false, false, 'choose the device or cloud copy'],
  [409, 'no_rerolls_left', 'name_reroll_used', 'You already used your re-roll.',
    'error', false, false, 'keep the confirmed captain name'],
  [409, 'no_name_yet', 'not_ready', 'Your captain is being set up. Try again in a moment.',
    'error', false, false, 'complete captain setup before the original action'],
  [422, 'validation_error', 'invalid_request', 'This request could not be understood. Report a problem if it happens again.',
    'error', false, false, 'correct the original input or report the problem'],
  [422, 'move_refused', 'intro_incomplete', 'Finish Act 1 first.',
    'error', false, false, 'finish the local intro'],
  [422, 'no_ending', 'intro_incomplete', 'Finish Act 1 first.',
    'error', false, false, 'finish the local intro'],
  [422, 'save_too_big', 'save_unavailable', 'This save cannot be stored.',
    'error', false, false, 'keep local progress and review the save'],
  [422, 'save_not_json', 'save_unavailable', 'This save cannot be stored.',
    'error', false, false, 'keep local progress and review the save'],
  [422, 'invalid_transaction', 'internal_error', 'The service could not complete this request. Please try again.',
    'error', true, false, 'explicitly retry the original intent'],
  [502, 'database_error', 'internal_error', 'The service could not complete this request. Please try again.',
    'error', true, false, 'explicitly retry the original intent'],
  [429, 'too_many_requests', 'rate_limited', 'Too many attempts. Wait a moment, then try again.',
    'rate_limited', false, false, 'wait before explicitly retrying', 'Too many attempts. Try again in 3 s.'],
  [503, 'database_unavailable', 'not_connected', 'Service unavailable. Try again in a moment.',
    'error', true, false, 'explicitly retry after unknown-outcome reconciliation'],
];

describe('online API reason mapping', () => {
  it.each(rows.map(([status, code, reason, message, phase, canRetry, canSignIn, nextAction, visibleMessage = message]) =>
    ({status, code, reason, message, phase, canRetry, canSignIn, nextAction, visibleMessage})))
  ('$status $code shows $reason; next: $nextAction', row => {
    const result = mapApiResult(failed(row.status, row.code, {retryAfterSeconds: 3}));
    expect(result).toMatchObject({accepted: false, reason: row.reason, message: row.message});
    let now = 0;
    const state = createCallState({now: () => now});
    state.fail(normalizeIntentResult(result));
    expect(state.read()).toMatchObject({phase: row.phase, message: row.visibleMessage,
      canRetry: row.canRetry, canSignIn: row.canSignIn, remaining: row.status === 429 ? 3 : 0});
    if (row.status === 429) {
      now = 3000;
      expect(state.read()).toMatchObject({phase: 'rate_limited', remaining: 0,
        message: 'Too many attempts. You can try again now.', canRetry: true, canSignIn: false});
    }
  });

  it('offers first sign-in while keeping a signed-out visitor\'s own progress wording', () => {
    const refusal = {accepted: false, reason: 'sign_in_required',
      message: 'Sign in with GitHub to claim your kit. Your progress on this device is kept.'};
    const normalized = normalizeIntentResult(refusal);
    expect(normalized).toEqual(refusal);
    const state = createCallState(); state.fail(normalized);
    expect(state.read()).toMatchObject({phase: 'error', message: refusal.message,
      canRetry: false, canSignIn: true, remaining: 0});
  });

  it('keeps safe fixed wording for transport failures and unknown errors', () => {
    expect(mapApiResult(failed(0, 'timeout')).message)
      .toBe('You are offline. Your progress on this device is kept.');
    for (const status of [400, 404, 409, 422, 500, 502]) {
      const result = mapApiResult(failed(status, 'unknown_code', {body: {privateId: 'placeholder'}}));
      expect(result.reason).toBe('internal_error');
      expect(JSON.stringify(result)).not.toContain('Placeholder');
      expect(result).not.toHaveProperty('body');
      const state = createCallState(); state.fail(normalizeIntentResult(result));
      expect(state.read()).toMatchObject({phase: 'error', canRetry: true, canSignIn: false,
        message: 'The service could not complete this request. Please try again.'});
    }
  });

  it.each(['crew_full', 'crew_finished'])('preserves the known business explanation for %s', code => {
    expect(mapApiResult(failed(409, code)).message).toBe('Placeholder detail.');
  });

  it.each(['already_applied', 'already_seated', 'already_started'])('accepts %s and requests a read', code => {
    const result = mapApiResult(failed(409, code));
    expect(result).toEqual({accepted: true, reason: null, message: '', recovery: 'reread'});
    const state = createCallState(); state.succeed({message: result.message});
    expect(state.read()).toMatchObject({phase: 'ready', message: '', canRetry: false, canSignIn: false});
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
    const result = mapApiResult(failed(429, 'too_many_requests', {retryAfterSeconds: 2.1}), options);
    expect(result).toMatchObject({reason: 'too_many_tries', retryAfterSeconds: 3,
      message: 'Too many crew codes. Wait a moment, then try again.'});
    let now = 0;
    const state = createCallState({now: () => now}); state.fail(normalizeIntentResult(result));
    expect(state.read()).toMatchObject({phase: 'rate_limited', message: 'Too many attempts. Try again in 3 s.',
      remaining: 3, canRetry: false, canSignIn: false});
    now = 3000;
    expect(state.read()).toMatchObject({remaining: 0, canRetry: true, canSignIn: false,
      message: 'Too many attempts. You can try again now.'});
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
    const result=mapApiResult({ok:true,status:200,data:{accepted:false,repeat:true,
      reason:'accusation_refused',message:'Placeholder refusal.'}});
    expect(result).toMatchObject({
      accepted:false,reason:'accusation_refused',message:'Placeholder refusal.',recovery:'reread',
    });
    const state=createCallState();state.fail(normalizeIntentResult(result));
    expect(state.read()).toMatchObject({phase:'error',message:'Placeholder refusal.',
      canRetry:false,canSignIn:false});
  });

  it('uses known case refusals and their explanation but sanitizes unknown case reasons', () => {
    const known=mapApiResult({ok: true, status: 200, data: {
      accepted: false, reason: 'locked_window', message: 'Placeholder window.',
    }});
    expect(known).toEqual({accepted: false, reason: 'locked_window', message: 'Placeholder window.'});
    const state=createCallState();state.fail(normalizeIntentResult(known));
    expect(state.read()).toMatchObject({phase:'error',message:'Placeholder window.',
      canRetry:false,canSignIn:false});
    const unknown=mapApiResult({ok: true, status: 200, data: {
      accepted: false, reason: 'unknown_code', message: 'Placeholder detail.',
    }});
    expect(unknown.reason).toBe('internal_error');
    expect(unknown.message).toBe('The service could not complete this request. Please try again.');
    expect(JSON.stringify(unknown)).not.toContain('Placeholder');
    expect(mapApiResult(null).reason).toBe('internal_error');
  });
});

describe('explicit public read failure policy',()=>{
  const serviceMessage='The service could not complete this request. Please try again.';
  const publicOptions=route=>({route,method:'GET',publicRead:true});

  it.each(['/api/config','/api/bulletin'])('refuses public %s401 with fixed service words and no private recovery',route=>{
    const answer=failed(401,'session_expired',{message:'UNTRUSTED_PUBLIC_DETAIL',body:{privateId:'UNTRUSTED_PUBLIC_DETAIL'}});
    const result=mapApiResult(answer,publicOptions(route));
    expect(result).toEqual({accepted:false,reason:'internal_error',message:serviceMessage});
    expect(result).not.toHaveProperty('recovery');expect(answer.status).toBe(401);
    expect(JSON.stringify(result)).not.toContain('UNTRUSTED_PUBLIC_DETAIL');
    const call=createCallState();call.fail(result);
    expect(call.read()).toMatchObject({phase:'error',canRetry:true,canSignIn:false,message:serviceMessage});
  });

  it.each(['stale_save','already_applied','already_seated','already_started','crew_busy','no_name_yet','crew_full','crew_finished'])
  ('cannot turn public409 %s into success, a private conflict or a recovery action',code=>{
    for(const route of ['/api/config','/api/bulletin']){
      const result=mapApiResult(failed(409,code,{message:'UNTRUSTED_PUBLIC_DETAIL',data:{repeat:true}}),publicOptions(route));
      expect(result).toEqual({accepted:false,reason:'internal_error',message:serviceMessage});
      expect(Object.keys(result).sort()).toEqual(['accepted','message','reason']);
      const call=createCallState();call.fail(result);
      expect(call.read()).toMatchObject({phase:'error',canRetry:true,canSignIn:false,message:serviceMessage});
    }
  });

  it('keeps default and explicitly private401 behavior even when a caller supplies a public-looking route',()=>{
    for(const options of [undefined,{publicRead:false},{route:'/api/config',method:'GET'},
      {route:'/api/me',method:'GET',publicRead:false}]){
      const result=mapApiResult(failed(401,'unauthorized'),options);
      expect(result).toEqual({accepted:false,reason:'session_expired',message:'Session expired. Sign in again.'});
      const call=createCallState();call.fail(result);
      expect(call.read()).toMatchObject({phase:'expired',canRetry:false,canSignIn:true});
    }
  });

  it.each(['already_applied','already_seated','already_started'])('keeps private completed409 %s accepted with reread',code=>{
    for(const options of [undefined,{publicRead:false},{route:'/api/crews/me/start',method:'POST'}]){
      expect(mapApiResult(failed(409,code),options)).toEqual({accepted:true,reason:null,message:'',recovery:'reread'});
    }
  });

  it('keeps private conflict and setup recovery while public409 stays refused',()=>{
    expect(mapApiResult(failed(409,'stale_save'),{method:'PUT'})).toMatchObject({accepted:false,reason:'save_conflict'});
    expect(mapApiResult(failed(409,'crew_busy'),{method:'POST'})).toHaveProperty('recovery','retry_once');
    expect(mapApiResult(failed(409,'no_name_yet'),{method:'POST'})).toHaveProperty('recovery','init_name');
  });

  it.each([[0,'timeout'],[503,'case_unavailable'],[404,'feature_off'],[429,'too_many_requests'],[502,'database_error']])
  ('preserves the existing public GET policy for HTTP%s/%s', (status,code)=>{
    const answer=failed(status,code,{retryAfterSeconds:2.1});
    expect(mapApiResult(answer,publicOptions('/api/config')))
      .toEqual(mapApiResult(answer,{route:'/api/config',method:'GET'}));
    expect(mapApiResult(answer,publicOptions('/api/bulletin'))).not.toHaveProperty('recovery');
  });
});
