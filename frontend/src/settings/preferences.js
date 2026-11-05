// One preference owner for every menu, dialogue and visual effect. No login data is stored.
import {defaults,loadPreferences,savePreferences,normalizePreferences,motionReduced} from './logic.js';
let storage;
try{storage=window.localStorage;}catch{/* Storage is optional. */}
let value=storage?loadPreferences(storage):{...defaults};
const listeners=new Set();
export const getPreferences=()=>({...value});
export const reducedMotion=()=>motionReduced(value.reducedMotion,typeof window!=='undefined'&&!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
export function setPreferences(patch) {
  value=normalizePreferences({...value,...patch});const saved=savePreferences(storage,value);
  document.documentElement.dataset.reducedMotion=String(reducedMotion());
  document.documentElement.dataset.colourblind=String(value.colourblind);
  for(const listener of listeners)listener(getPreferences());
  return saved;
}
export function onPreferences(listener){listeners.add(listener);return()=>listeners.delete(listener);}
export function watchSystemMotion() {
  const media=matchMedia('(prefers-reduced-motion: reduce)'),change=()=>setPreferences({});
  media.addEventListener('change',change);change();return()=>media.removeEventListener('change',change);
}
