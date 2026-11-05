// Bounded preferences only. Used by settings storage and tests, never for account tokens.
export const PREFERENCES_KEY='plot_twist_preferences_v1';
export const defaults=Object.freeze({quality:'high',master:0.7,music:0.35,effects:0.65,reducedMotion:null,textSpeed:36,colourblind:false,showCaptains:'everyone'});
const volume=value=>typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.min(1,value)):null;
export function normalizePreferences(value={}) {
  const result={...defaults};
  if(!value||typeof value!=='object')return result;
  if(['low','high'].includes(value.quality))result.quality=value.quality;
  for(const key of ['master','music','effects'])result[key]=volume(value[key])??defaults[key];
  if([null,true,false].includes(value.reducedMotion))result.reducedMotion=value.reducedMotion;
  if([0,24,36,60].includes(value.textSpeed))result.textSpeed=value.textSpeed;
  if(['everyone','crew','off'].includes(value.showCaptains))result.showCaptains=value.showCaptains;
  if(typeof value.colourblind==='boolean')result.colourblind=value.colourblind;
  return result;
}
export function loadPreferences(storage) {
  try {const saved=JSON.parse(storage.getItem(PREFERENCES_KEY));return normalizePreferences(saved?.version===1?saved.preferences:null);}catch{return {...defaults};}
}
export function savePreferences(storage,value) {
  const preferences=normalizePreferences(value);
  try {storage.setItem(PREFERENCES_KEY,JSON.stringify({version:1,preferences}));return true;}catch{return false;}
}
export function motionReduced(preference,system=false) {return preference===null?system:preference===true;}
