// Shared request presentation is independent of game outcomes and browser timers.
import {describe,it,expect} from 'vitest';
import {intentFailure,normalizeIntentResult} from '../src/adapter/call-failure.js';
import {createCallState} from '../src/ui/kit/call-state.js';
describe('server failure normalization',()=>{
  it('maps 401 and 429 without exposing raw error text',()=>{
    expect(intentFailure({status:401,message:'PRIVATE_TOKEN'})).toMatchObject({reason:'session_expired'});
    expect(intentFailure({status:429,retryAfterSeconds:3.2})).toMatchObject({reason:'rate_limited',retryAfterSeconds:4});
    expect(JSON.stringify(intentFailure({status:500,message:'PRIVATE_TOKEN'}))).not.toContain('PRIVATE_TOKEN');
  });
  it('recognizes offline status and fetch errors, while programming errors remain internal',()=>{
    expect(intentFailure(new Error('unknown'),{online:false}).reason).toBe('offline');
    expect(intentFailure(new TypeError('Failed to fetch')).reason).toBe('offline');
    expect(intentFailure(new TypeError('Cannot read properties')).reason).toBe('internal_error');
  });
  it('rejects invalid retry metadata and preserves domain refusals',()=>{
    for(const retryAfterSeconds of [-1,Infinity,'3'])expect(intentFailure({status:429,retryAfterSeconds}).retryAfterSeconds).toBeUndefined();
    const refusal={accepted:false,reason:'different_seats_required',message:'Two different seats must pin these cards.',view:{revision:3}};
    expect(normalizeIntentResult(refusal)).toEqual(refusal);
  });
});
describe('call state',()=>{
  it('supports loading, caller-supplied empty and ready states',()=>{
    const state=createCallState();state.loading();expect(state.read().phase).toBe('loading');
    state.succeed({empty:true,message:'No saved games yet.'});expect(state.read()).toMatchObject({phase:'empty',message:'No saved games yet.'});
    state.succeed();expect(state.read().phase).toBe('ready');expect(state.read().message).toBe('');
  });
  it('provides explicit retry for transport errors, sign-in for expiry, and no domain retry',()=>{
    const state=createCallState();state.fail({reason:'offline',message:'Offline'});expect(state.read()).toMatchObject({phase:'offline',canRetry:true});
    state.fail({reason:'session_expired'});expect(state.read()).toMatchObject({phase:'expired',canSignIn:true,canRetry:false});
    state.fail({reason:'forbidden',message:'Not allowed'});expect(state.read().canRetry).toBe(false);
  });
  it('counts supplied retry seconds without automatically retrying or changing game state',()=>{
    let now=1000;const state=createCallState({now:()=>now});state.fail({reason:'rate_limited',retryAfterSeconds:3});
    expect(state.read()).toMatchObject({remaining:3,canRetry:false});now=2001;expect(state.read().remaining).toBe(2);
    now=4000;expect(state.read()).toMatchObject({remaining:0,canRetry:true,phase:'rate_limited'});
    state.clear();expect(state.read()).toMatchObject({phase:'idle',remaining:0,canRetry:false});
  });
});
