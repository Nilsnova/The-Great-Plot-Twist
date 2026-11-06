import {describe,it,expect} from 'vitest';
import {addFrameSample,formatBytes,performanceSummary,updateSlowFrameState} from '../src/shell/perf/logic.js';
import {tourDurationSeconds,tourSteps,createTourMachine} from '../src/demo/logic.js';

describe('class presenter plan',()=>{
  it('uses the approved nine beats and 170 second duration',()=>{
    expect(tourSteps.map(step=>step.id)).toEqual(['intro','arrival','islet','chart','harbor','board','weather','finale','relighting']);
    expect(tourDurationSeconds).toBe(170);
  });
  it('keeps timed transitions paused while waits remain cancellable',()=>{
    const tour=createTourMachine();tour.start();tour.tick(4);tour.togglePause();tour.tick(40);expect(tour.elapsed).toBe(4);expect(tour.due).toBe(false);tour.togglePause();tour.tick(11);expect(tour.due).toBe(true);
  });
});

describe('performance sampling',()=>{
  it('keeps a bounded frame-time window and computes p95 and renderer totals',()=>{
    const samples=addFrameSample([16,17,18],20,3);expect(samples).toEqual([17,18,20]);
    expect(performanceSummary({fps:59.7,frameTimes:samples,calls:12,triangles:900,geometries:4,textures:3,heapBytes:4096})).toEqual({fps:60,p95Ms:20,calls:12,triangles:900,geometries:4,textures:3,heapBytes:4096});
  });
  it('offers low quality only after five seconds below 45 fps and formats memory',()=>{
    let state={slowSince:null,offer:false};state=updateSlowFrameState(state,40,1000);expect(state.offer).toBe(false);
    state=updateSlowFrameState(state,40,5999);expect(state.offer).toBe(false);state=updateSlowFrameState(state,40,6000);expect(state.offer).toBe(true);
    expect(updateSlowFrameState(state,50,7000).offer).toBe(false);expect(formatBytes(1536)).toBe('1.5 KB');expect(formatBytes(null)).toBe('Unavailable');
  });
});
