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
  it.each(['rate_limited','too_many_tries'])('keeps an exact private 1.5s remaining deadline for %s',reason=>{
    let now=1500;const state=createCallState({now:()=>now});
    state.fail({reason,retryAfterSeconds:2},{retryAfterMs:1500});
    expect(state.read()).toMatchObject({phase:'rate_limited',remaining:2,canRetry:false});
    now=2500;expect(state.read()).toMatchObject({remaining:1,nextUpdate:500,canRetry:false});
    now=2999;expect(state.read()).toMatchObject({remaining:1,canRetry:false});
    now=3000;expect(state.read()).toMatchObject({remaining:0,nextUpdate:0,canRetry:true});
    expect(state.read().message).toContain('try again now');
  });
  it('accepts fractional milliseconds and exact zero without reviving a completed wait from rounded seconds',()=>{
    let now=1000;const state=createCallState({now:()=>now});
    state.fail({reason:'rate_limited',retryAfterSeconds:2},{retryAfterMs:1500.5});
    now=2500.49;expect(state.read().canRetry).toBe(false);
    now=2500.5;expect(state.read()).toMatchObject({remaining:0,canRetry:true});
    now=4000;state.fail({reason:'rate_limited',retryAfterSeconds:3},{retryAfterMs:0});
    expect(state.read()).toMatchObject({phase:'rate_limited',remaining:0,canRetry:true,nextUpdate:0});
  });
  it.each([-1,86400001,NaN,Infinity,-Infinity,'1500',true,null,undefined])('falls back to bounded rounded seconds for invalid private milliseconds %s',retryAfterMs=>{
    let now=1000;const state=createCallState({now:()=>now});
    state.fail({reason:'rate_limited',retryAfterSeconds:1.2},{retryAfterMs});
    now=2999;expect(state.read()).toMatchObject({remaining:1,canRetry:false});
    now=3000;expect(state.read()).toMatchObject({remaining:0,canRetry:true});
  });
  it('does not read a millisecond override from the public result or alter the bounded seconds fallback',()=>{
    let now=1000;const state=createCallState({now:()=>now});
    state.fail({reason:'rate_limited',retryAfterSeconds:3,retryAfterMs:0});
    now=2500;expect(state.read()).toMatchObject({remaining:2,canRetry:false});
    now=4000;expect(state.read().canRetry).toBe(true);
    state.fail({reason:'rate_limited',retryAfterSeconds:86401},{retryAfterMs:-1});
    expect(state.read()).toMatchObject({remaining:0,canRetry:true});
  });
  it('bounds the private wait to one day and preserves caller retryability and non-rate phases',()=>{
    let now=1000;const state=createCallState({now:()=>now});
    state.fail({reason:'rate_limited',retryAfterSeconds:0},{retryAfterMs:86400000,retryable:false});
    expect(state.read()).toMatchObject({remaining:86400,canRetry:false});
    now+=86400000;expect(state.read()).toMatchObject({remaining:0,canRetry:false});
    for(const reason of ['offline','session_expired','forbidden']){
      const control=createCallState({now:()=>now});control.fail({reason,message:'Existing words'});
      state.fail({reason,message:'Existing words'},{retryAfterMs:1500});
      expect(state.read()).toEqual(control.read());
    }
  });
});
