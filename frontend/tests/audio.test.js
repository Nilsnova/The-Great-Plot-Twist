// Audio mixing and weather/stride mapping are deterministic without an audio device.
import {describe,it,expect} from 'vitest';
import {mixVolumes,weatherSound,strideStep} from '../src/audio/logic.js';
describe('procedural audio math',()=>{
  it('multiplies each bus by master and supports exact mute',()=>{
    expect(mixVolumes({master:0.5,music:0.4,effects:0.8})).toEqual({master:0.5,music:0.2,effects:0.4});
    expect(mixVolumes({master:0,music:1,effects:1})).toEqual({master:0,music:0,effects:0});
    expect(mixVolumes({master:9,music:-2,effects:NaN})).toEqual({master:1,music:0,effects:0});
  });
  it('follows wind and rain with bounded gains',()=>{
    const calm=weatherSound(),storm=weatherSound({wind:1,rain:1});
    expect(storm.sea).toBeGreaterThan(calm.sea);expect(storm.wind).toBeGreaterThan(calm.wind);
    expect(storm.rain).toBeGreaterThan(calm.rain);expect(weatherSound({wind:4,rain:4})).toEqual(storm);
  });
  it('steps follow distance, with no catch-up burst after a long pause',()=>{
    expect(strideStep(0.5,0,1)).toEqual({distance:0.5,step:false});
    expect(strideStep(1,3.2,0.1).step).toBe(true);expect(strideStep(0,6,10).step).toBe(false);
  });
});
