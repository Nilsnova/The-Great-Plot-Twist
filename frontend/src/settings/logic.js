// Bounded preferences only. Used by settings storage and tests, never for account tokens.
export const PREFERENCES_KEY='plot_twist_preferences_v1';
export const defaults=Object.freeze({quality:'high',master:0.7,music:0.35,effects:0.65,voice:0.8,subtitleSize:'normal',reducedMotion:null,textSpeed:36,colourblind:false,showCaptains:'everyone',hintsEnabled:true,narrator:true,captions:true,easyFinishers:false,dismissedHints:[]});
const volume=value=>typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.min(1,value)):null;
export function normalizePreferences(value={}) {
  const result={...defaults};
  if(!value||typeof value!=='object')return result;
  if(['low','high'].includes(value.quality))result.quality=value.quality;
  for(const key of ['master','music','effects','voice'])result[key]=volume(value[key])??defaults[key];
  if([null,true,false].includes(value.reducedMotion))result.reducedMotion=value.reducedMotion;
  if([0,24,36,60].includes(value.textSpeed))result.textSpeed=value.textSpeed;
  if(['normal','large'].includes(value.subtitleSize))result.subtitleSize=value.subtitleSize;
  if(['everyone','crew','off'].includes(value.showCaptains))result.showCaptains=value.showCaptains;
  if(typeof value.colourblind==='boolean')result.colourblind=value.colourblind;
  if(typeof value.hintsEnabled==='boolean')result.hintsEnabled=value.hintsEnabled;
  // The narrator (src/narrator/): its voiced lines, and their caption card; both on by default.
  for(const key of ['narrator','captions'])if(typeof value[key]==='boolean')result[key]=value[key];
  // Boss finishers (src/pirates/finisher/): a wider zone and slower prompts for this player; off by default.
  if(typeof value.easyFinishers==='boolean')result.easyFinishers=value.easyFinishers;
  if(Array.isArray(value.dismissedHints))result.dismissedHints=[...new Set(value.dismissedHints.filter(id=>typeof id==='string'&&/^[a-z0-9_-]{1,64}$/.test(id)))].slice(0,100);
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
