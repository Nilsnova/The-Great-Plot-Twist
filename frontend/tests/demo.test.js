// Tour timing, skipping and completion do not depend on a browser or API.
import {describe,it,expect} from 'vitest';
import {createTourMachine,tourSteps} from '../src/demo/logic.js';
describe('highlights tour',()=>{
  it('has a two-to-three-minute default script',()=>{const seconds=tourSteps.reduce((sum,step)=>sum+step.seconds,0);expect(seconds).toBeGreaterThanOrEqual(120);expect(seconds).toBeLessThanOrEqual(180);});
  it('ticks only while active and advances one step at a time',()=>{const tour=createTourMachine();tour.tick(99);expect(tour.step).toBe(null);tour.start();tour.tick(-9);expect(tour.elapsed).toBe(0);tour.tick(20);expect(tour.due).toBe(true);tour.advance();expect(tour.step.id).toBe('arrival');expect(tour.elapsed).toBe(0);});
  it('can skip every step, stop and restart without stale elapsed time',()=>{const tour=createTourMachine();tour.start();for(let i=0;i<tourSteps.length-1;i++)expect(tour.advance()).toBe(true);expect(tour.advance()).toBe(false);expect(tour.step).toBe(null);tour.start();tour.tick(NaN);tour.stop();tour.start();expect(tour.progress).toBe(0);});
});
it('uses a separate fake fixture without authorising a solve or reveal',async()=>{const {createFakeCaseAdapter}=await import('../src/adapter/fake/index.js');const a=createFakeCaseAdapter();for(const stage of ['board','finale','lock','relighting'])a.dev.rehearse(stage);expect(a.read().reveal.available).toBe(false);expect(a.read().reveal.lines).toEqual([]);expect(a.read().effects.some(effect=>effect.name==='unmask')).toBe(false);expect(a.read().world.lightsOn).toBe(true);});
