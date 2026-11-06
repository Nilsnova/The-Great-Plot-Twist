import {describe,it,expect,vi,afterEach} from 'vitest';
import {createPausableDeadline} from '../src/world/cinematics/watchdog.js';

describe('pausable cinematic watchdog',()=>{
  afterEach(()=>vi.useRealTimers());
  it('keeps the remaining visible deadline while paused',()=>{
    vi.useFakeTimers();let now=0,expired=0;
    const watchdog=createPausableDeadline(1000,{now:()=>now,onExpire:()=>expired++});
    watchdog.resume();now=400;vi.advanceTimersByTime(400);watchdog.pause();
    expect(watchdog.remaining).toBe(600);
    now=10_400;vi.advanceTimersByTime(10_000);expect(expired).toBe(0);
    watchdog.resume();now+=599;vi.advanceTimersByTime(599);expect(expired).toBe(0);
    now++;vi.advanceTimersByTime(1);expect(expired).toBe(1);
    watchdog.dispose();vi.useRealTimers();
  });
  it('dispose clears an active timer and prevents expiration',()=>{
    vi.useFakeTimers();const expired=vi.fn(),watchdog=createPausableDeadline(250,{onExpire:expired});
    watchdog.resume();watchdog.dispose();vi.advanceTimersByTime(500);expect(expired).not.toHaveBeenCalled();vi.useRealTimers();
  });
});
