// Delayed presentation never delays the action itself or retries a write.
import {describe,it,expect} from 'vitest';
import {createCallState} from '../src/ui/kit/call-state.js';
import {intentFailure} from '../src/adapter/call-failure.js';

describe('request timing and connection words',()=>{
  it('keeps quick requests quiet and shows loading from 300 ms',()=>{
    let time=0;const state=createCallState({now:()=>time});
    state.loading();expect(state.read()).toMatchObject({phase:'loading',visible:false,nextUpdate:300});
    time=299;expect(state.read().visible).toBe(false);
    state.succeed();time=300;expect(state.read()).toMatchObject({phase:'ready',message:'',nextUpdate:0});
    state.loading();time=599;expect(state.read().visible).toBe(false);
    time=600;expect(state.read()).toMatchObject({phase:'loading',visible:true,message:'Loading…',nextUpdate:0});
  });
  it('shows a slow read at five seconds and keeps writes free of read timing',()=>{
    let time=0;const state=createCallState({now:()=>time});state.loading({read:true});
    time=4999;expect(state.read().phase).toBe('loading');
    time=5000;expect(state.read()).toMatchObject({phase:'slow',visible:true,nextUpdate:0});
    expect(state.read().message).toContain('taking longer');
    state.loading();time=20000;expect(state.read().phase).toBe('loading');
  });
  it('names offline and back-online states but leaves retry to an explicit action',()=>{
    const state=createCallState();state.setOnline(false);
    expect(state.read()).toMatchObject({phase:'offline',canRetry:true});
    expect(state.read().message).toContain('progress on this device is kept');
    state.setOnline(true);expect(state.read()).toMatchObject({phase:'online',canRetry:true,message:'Back online. You can try again now.'});
    state.fail({reason:'session_expired'});state.setOnline(true);
    expect(state.read()).toMatchObject({phase:'expired',canRetry:false,canSignIn:true});
    expect(state.read().message).toContain('progress on this device is kept');
  });
  it('applies the supplied wait to crew join limits and never guesses invalid waits',()=>{
    let time=0;const state=createCallState({now:()=>time});state.fail({reason:'too_many_tries',retryAfterSeconds:2.1});
    expect(state.read()).toMatchObject({phase:'rate_limited',remaining:3,canRetry:false});
    time=3000;expect(state.read()).toMatchObject({remaining:0,canRetry:true,nextUpdate:0});
    for(const retryAfterSeconds of [-1,NaN,Infinity,'3',86401]){
      state.fail({reason:'rate_limited',retryAfterSeconds});expect(state.read()).toMatchObject({remaining:0,canRetry:true});
    }
  });
  it('maps an aborted network call to fixed offline copy without raw service details',()=>{
    const failure=intentFailure({status:0,message:'private server detail'});
    expect(failure.reason).toBe('offline');expect(failure.message).not.toContain('private');
  });
});
