import {describe,it,expect} from 'vitest';
import {createVisibleClock} from '../src/core/visible-clock.js';

class VisibilityTarget extends EventTarget {
  hidden=false;added=0;removed=0;
  addEventListener(type,listener,options){if(type==='visibilitychange')this.added++;super.addEventListener(type,listener,options);}
  removeEventListener(type,listener,options){if(type==='visibilitychange')this.removed++;super.removeEventListener(type,listener,options);}
  setHidden(hidden){this.hidden=hidden;this.dispatchEvent(new Event('visibilitychange'));}
}

describe('visible monotonic clock',()=>{
  it('returns uncapped visible deltas in seconds',()=>{
    let time=1000;const clock=createVisibleClock({now:()=>time,visibilityTarget:new VisibilityTarget()});
    time=1725;expect(clock.readDeltaSeconds()).toBeCloseTo(.725);time=5725;expect(clock.readDeltaSeconds()).toBe(4);clock.dispose();
  });
  it('resets at both visibility changes and never catches up hidden time',()=>{
    let time=1000;const target=new VisibilityTarget(),clock=createVisibleClock({now:()=>time,visibilityTarget:target});
    time=1500;expect(clock.readDeltaSeconds()).toBe(.5);
    target.setHidden(true);time=8500;expect(clock.readDeltaSeconds()).toBe(0);
    target.setHidden(false);expect(clock.readDeltaSeconds()).toBe(0);
    time=8750;expect(clock.readDeltaSeconds()).toBe(.25);clock.dispose();
  });
  it('recovers from a hidden state even when visibility events are missed',()=>{
    let time=1000;const target=new VisibilityTarget(),clock=createVisibleClock({now:()=>time,visibilityTarget:target});
    target.hidden=true;time=9000;expect(clock.readDeltaSeconds()).toBe(0);
    target.hidden=false;expect(clock.readDeltaSeconds()).toBe(0);time=9400;expect(clock.readDeltaSeconds()).toBe(.4);clock.dispose();
  });
  it('clamps a non-monotonic injected source and removes its listener on dispose',()=>{
    let time=500;const target=new VisibilityTarget(),clock=createVisibleClock({now:()=>time,visibilityTarget:target});
    time=400;expect(clock.readDeltaSeconds()).toBe(0);time=900;expect(clock.readDeltaSeconds()).toBe(.5);
    expect(target.added).toBe(1);clock.dispose();clock.dispose();expect(target.removed).toBe(1);expect(clock.readDeltaSeconds()).toBe(0);
  });
});
