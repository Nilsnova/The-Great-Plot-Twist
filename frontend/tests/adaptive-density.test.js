// Sustained drawing cadence adjusts density without reacting to one slow frame or a pause.
import {describe,expect,it} from 'vitest';
import {createFrameBudget,pixelViewport,worldViewport} from '../src/pixel/display.js';
function cadence(budget,now,interval,seconds){for(let elapsed=0;elapsed<seconds*1000;elapsed+=interval){now+=interval;budget.sample(now);}return now;}
describe('adaptive drawing density',()=>{
  it('keeps full detail at healthy 30/60/144Hz',()=>{
    for(const hz of [30,60,120,144]){const budget=createFrameBudget();cadence(budget,0,1000/hz,25);expect(budget.scale).toBe(1);}
  });
  it('reduces only after sustained slow drawing and keeps a bounded floor',()=>{
    const budget=createFrameBudget();let now=cadence(budget,0,66.7,1.5);expect(budget.scale).toBe(1);
    now=cadence(budget,now,66.7,3);expect(budget.scale).toBeLessThan(.8);expect(budget.scale).toBeGreaterThanOrEqual(.5);
    cadence(budget,now,180,30);expect(budget.scale).toBe(.5);
  });
  it('still calibrates a severely slow active renderer',()=>{
    const budget=createFrameBudget();cadence(budget,0,1000/3,14);expect(budget.scale).toBe(.5);
  });
  it('ignores isolated stalls and resets timing across hidden/blocked frames',()=>{
    const budget=createFrameBudget();let now=cadence(budget,0,16.7,4);now+=180;budget.sample(now);now=cadence(budget,now,16.7,4);expect(budget.scale).toBe(1);
    budget.sample(now+3000);expect(budget.scale).toBe(1);budget.sample(now+3030,false);cadence(budget,now+3030,66.7,1);expect(budget.scale).toBe(1);
  });
  it('holds a calibrated density on pauses and recovers slowly after sustained spare capacity',()=>{
    const budget=createFrameBudget();let now=cadence(budget,0,66.7,5),scale=budget.scale;budget.sample(now+100,false);expect(budget.scale).toBe(scale);
    now=cadence(budget,now+100,16.7,10);expect(budget.scale).toBe(scale);cadence(budget,now,16.7,12);expect(budget.scale).toBeCloseTo(scale+.05);
  });
  it('gives up a little density when a 60 Hz screen keeps dropping to 30 (playtest 22 Nov)',()=>{
    // A frame just over 16.7 ms: vsync shows it every other refresh, so gaps alternate 16.7 and 33.3 ms.
    const budget=createFrameBudget();let now=0;
    const hitch=seconds=>{for(let elapsed=0;elapsed<seconds*1000;elapsed+=50){now+=16.7;budget.sample(now);now+=33.3;budget.sample(now);}};
    hitch(5);expect(budget.scale).toBeLessThan(1);expect(budget.scale).toBeGreaterThanOrEqual(.8);
    hitch(60);expect(budget.scale).toBe(.65); // small steps, a floor above the slow rule's .5
  });
  it('keeps full density on a steady 30 Hz cap and on a 60 Hz screen that only rarely misses',()=>{
    const capped=createFrameBudget();cadence(capped,0,1000/30,30);expect(capped.scale).toBe(1);
    const rare=createFrameBudget();let now=0;
    for(let i=0;i<3000;i++){now+=i%20===19?33.3:16.7;rare.sample(now);}
    expect(rare.scale).toBe(1);
  });
  it('holds full density on 50 Hz with jitter and 30 Hz with occasional early callbacks',()=>{
    const jitteredGaps=[[19.9,20.1],[16.7,50,...Array(18).fill(1000/30)]];
    for(const gaps of jitteredGaps){
      const budget=createFrameBudget();let now=0;
      for(let i=0;i<1800;i++){now+=gaps[i%gaps.length];budget.sample(now);}
      expect(budget.scale).toBe(1);
    }
  });
  it('holds the reduced density for a minute after the last hitch even at the floor',()=>{
    const budget=createFrameBudget();let now=0;
    for(let i=0;i<2400;i++){now+=16.7;budget.sample(now);now+=33.3;budget.sample(now);}
    expect(budget.scale).toBe(.65);
    now=cadence(budget,now,16.7,40);expect(budget.scale).toBe(.65);
    cadence(budget,now,16.7,30);expect(budget.scale).toBeGreaterThan(.65);
  });
  it('climbs back slowly after hitching once the screen holds 60 again',()=>{
    const budget=createFrameBudget();let now=0;
    for(let i=0;i<200;i++){now+=16.7;budget.sample(now);now+=33.3;budget.sample(now);}
    now=cadence(budget,now,16.7,6); // the windows that still held the last hitches close
    const lowered=budget.scale;expect(lowered).toBeLessThan(1);
    now=cadence(budget,now,16.7,20);expect(budget.scale).toBeCloseTo(lowered); // not back up after 15 s next to a recent hitch
    cadence(budget,now,16.7,70);expect(budget.scale).toBeGreaterThan(lowered);
  });
  it('restores full density only for an explicit viewport/quality reset',()=>{
    const budget=createFrameBudget();cadence(budget,0,66.7,5);const calibrated=budget.scale;expect(calibrated).toBeLessThan(1);
    budget.reset();expect(budget.scale).toBe(calibrated);budget.reset({restoreDensity:true});expect(budget.scale).toBe(1);
    cadence(budget,0,1000/60,5);expect(budget.scale).toBe(1);
  });
  it('keeps projection/CSS dimensions and absolute pixel caps independent of adaptation',()=>{
    const full=pixelViewport(1280,720,{pixelRatio:2}),adapted=pixelViewport(1280,720,{pixelRatio:2,densityScale:.5});
    expect(adapted.width).toBe(full.width);expect(adapted.height).toBe(full.height);expect(adapted.pixelRatio).toBe(full.pixelRatio/2);
    expect(worldViewport(adapted.width,adapted.height)).toEqual(worldViewport(full.width,full.height));
    expect(adapted.drawingWidth*adapted.drawingHeight).toBeLessThanOrEqual(1920*1080);
    expect(pixelViewport(3840,2160,{pixelRatio:3,densityScale:3}).drawingWidth).toBe(pixelViewport(3840,2160,{pixelRatio:3}).drawingWidth);
  });
  it('does not change density for invalid or backward timestamps',()=>{
    const budget=createFrameBudget();for(const timestamp of [NaN,Infinity,-1,0,0,-20])budget.sample(timestamp);expect(budget.scale).toBe(1);
  });
});
