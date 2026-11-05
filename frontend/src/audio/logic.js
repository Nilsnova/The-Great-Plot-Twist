// Pure gain, weather and stride math, shared by procedural audio and tests.
const unit=value=>Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;
export function mixVolumes({master=0,music=0,effects=0}={}) {
  return {master:unit(master),music:unit(master)*unit(music),effects:unit(master)*unit(effects)};
}
export function weatherSound({wind=0,rain=0}={}) {
  wind=unit(wind);rain=unit(rain);
  return {sea:0.045+wind*0.065,wind:wind*0.09,rain:rain*0.055,cutoff:350+wind*1400};
}
export function strideStep(distance,speed,dt) {
  const next=distance+Math.max(0,Number.isFinite(speed)?speed:0)*Math.max(0,Math.min(0.1,dt||0));
  return {distance:next%1.25,step:next>=1.25};
}
