// Audio mixing and weather/stride mapping are deterministic without an audio device.
import {describe,it,expect} from 'vitest';
import {mixVolumes,weatherSound,strideStep,harborAudioConditions,isStationHumActive,harborCueVolumes} from '../src/audio/logic.js';
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
  it('uses the supplied server fog-night and storm fields for harbor cues',()=>{
    expect(harborAudioConditions({place:'saltreach_harbor',active:true,night:.8,weatherAnswer:{state:'calm',tonight:{isFogNight:true}}}))
      .toEqual({fogHorn:true,flagSnap:false});
    expect(harborAudioConditions({place:'saltreach_harbor',active:true,night:.8,weatherAnswer:{state:'storm',tonight:{isFogNight:false}}}))
      .toEqual({fogHorn:false,flagSnap:true});
    expect(harborAudioConditions({place:'saltreach_harbor',active:true,night:.8,weatherAnswer:{state:'fog'}}))
      .toEqual({fogHorn:false,flagSnap:false});
    expect(harborAudioConditions({place:'saltreach_harbor',active:true,night:.1,weatherAnswer:{state:'calm',tonight:{isFogNight:true}}}))
      .toEqual({fogHorn:false,flagSnap:false});
    expect(harborAudioConditions({place:'lighthouse_isle',active:true,night:.8,weatherAnswer:{state:'storm',tonight:{isFogNight:true}}}))
      .toEqual({fogHorn:false,flagSnap:false});
    expect(harborAudioConditions({place:'saltreach_harbor',active:true,night:.8,weatherAnswer:{state:null,tonight:{isFogNight:false}},
      bulletin:{status:'ready',weather:{tonight:{state:'storm',isFogNight:true,isNow:true}}}})).toEqual({fogHorn:true,flagSnap:true});
    expect(harborAudioConditions({place:'saltreach_harbor',active:true,night:.8,weatherAnswer:{state:'storm',tonight:{isFogNight:true}},
      bulletin:{status:'off',weather:null}})).toEqual({fogHorn:true,flagSnap:true});
    expect(harborAudioConditions({place:'saltreach_harbor',active:true,night:.8,weatherAnswer:{state:'calm'},
      bulletin:{status:'ready',weather:{tonight:{state:'storm',isNow:false,isFogNight:false}}}})).toEqual({fogHorn:false,flagSnap:false});
  });
  it('hums only for an active, built, lit home station',()=>{
    expect(isStationHumActive({place:'home_islet',active:true,night:.8,isletBuilt:['plot_1','islet_signal_station']})).toBe(true);
    expect(isStationHumActive({place:'home_islet',active:true,night:.8,isletBuilt:['plot_1']})).toBe(false);
    expect(isStationHumActive({place:'home_islet',active:true,night:0,isletBuilt:['islet_signal_station']})).toBe(false);
    expect(isStationHumActive({place:'home_islet',active:false,night:.8,isletBuilt:['islet_signal_station']})).toBe(false);
  });
  it('keeps new harbor cues below the existing one-shot level',()=>{
    expect(Math.max(...Object.values(harborCueVolumes))).toBeLessThanOrEqual(.035);
    expect(harborCueVolumes.stationHum).toBeLessThan(.01);
  });
});
