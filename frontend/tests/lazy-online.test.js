// The proxy waits for a painted title, but never loses an early intent or late disposal.
import {afterEach,describe,expect,it,vi} from 'vitest';
import {createLazyOnlineAdapter} from '../src/adapter/lazy-online.js';
import {createUnavailableCaseAdapter} from '../src/adapter/unavailable.js';

afterEach(()=>vi.unstubAllGlobals());
describe('lazy online composition',()=>{
  it('releases callback auth when disposed before its first scheduled load',()=>{
    vi.stubGlobal('requestAnimationFrame',vi.fn(()=>1));
    vi.stubGlobal('cancelAnimationFrame',vi.fn());
    const auth={dispose:vi.fn()};
    const load=vi.fn();
    const adapter=createLazyOnlineAdapter({deps:{auth},load});
    adapter.dispose();adapter.dispose();
    expect(load).not.toHaveBeenCalled();
    expect(auth.dispose).toHaveBeenCalledOnce();
  });
  it('releases callback auth when the real chunk fails and the fallback owns no auth',async()=>{
    const auth={dispose:vi.fn()};
    const adapter=createLazyOnlineAdapter({deps:{auth},load:()=>Promise.reject(new Error('chunk unavailable'))});
    await adapter.continueGame();
    adapter.dispose();
    expect(auth.dispose).toHaveBeenCalledOnce();
  });
  it('waits two frames and publishes an online snapshot after loading',async()=>{
    const frames=[];vi.stubGlobal('requestAnimationFrame',callback=>{frames.push(callback);return frames.length;});
    vi.stubGlobal('cancelAnimationFrame',vi.fn());
    const factory=vi.fn(()=>({...createUnavailableCaseAdapter(),read:()=>({mode:'online'})}));
    const load=vi.fn(async()=>({createRealCaseAdapter:factory}));
    const adapter=createLazyOnlineAdapter({load});let events=0;
    const off=adapter.subscribe(()=>events++);
    try{
      expect(adapter.read().mode).toBe('online');expect(load).not.toHaveBeenCalled();
      frames.shift()();expect(load).not.toHaveBeenCalled();
      frames.shift()();await Promise.resolve();await Promise.resolve();
      expect(factory).toHaveBeenCalledTimes(1);expect(events).toBe(1);off();
    }finally{adapter.dispose();}
  });
  it('loads for an early intent and disposes a factory that arrives after closure',async()=>{
    let resolve;const load=()=>new Promise(finish=>{resolve=finish;});
    const adapter=createLazyOnlineAdapter({load});
    const pending=adapter.continueGame();adapter.dispose();
    const real=createUnavailableCaseAdapter();const dispose=vi.spyOn(real,'dispose');
    resolve({createRealCaseAdapter:()=>real});
    expect((await pending).reason).toBe('disposed');expect(dispose).toHaveBeenCalledOnce();
  });
});
