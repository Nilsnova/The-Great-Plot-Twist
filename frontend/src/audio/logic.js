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
export function harborAudioConditions({weatherAnswer,bulletin,place,active=false,night=0}={}) {
  const harbor=active&&place==='saltreach_harbor';
  const announced=bulletin?.status==='ready'?bulletin.weather?.tonight:null;
  const isFogNight=announced?.isFogNight??weatherAnswer?.tonight?.isFogNight;
  const state=weatherAnswer?.state??(announced?.isNow===true?announced.state:null);
  return {fogHorn:harbor&&night>.6&&isFogNight===true,flagSnap:harbor&&state==='storm'};
}
export function isStationHumActive({place,active=false,night=0,isletBuilt=[]}={}) {
  return active&&place==='home_islet'&&night>0.12&&Array.isArray(isletBuilt)&&isletBuilt.includes('islet_signal_station');
}
export const harborCueVolumes=Object.freeze({build:.035,paper:.016,flag:.021,hook:.018,stationHum:.009});
