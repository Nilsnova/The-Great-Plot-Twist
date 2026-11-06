// One preference owner for every menu, dialogue and visual effect. No login data is stored.
import {defaults,loadPreferences,savePreferences,normalizePreferences,motionReduced} from './logic.js';
let storage;
try{storage=window.localStorage;}catch{/* Storage is optional. */}
const motionMedia=typeof window!=='undefined'?window.matchMedia?.('(prefers-reduced-motion: reduce)'):null;
let value=storage?loadPreferences(storage):{...defaults};
const listeners=new Set();
export const getPreferences=()=>normalizePreferences(value);
export const reducedMotion=()=>motionReduced(value.reducedMotion,!!motionMedia?.matches);
export function setPreferences(patch) {
  value=normalizePreferences({...value,...patch});const saved=savePreferences(storage,value);
  document.documentElement.dataset.reducedMotion=String(reducedMotion());
  document.documentElement.dataset.colourblind=String(value.colourblind);
  for(const listener of listeners)listener(getPreferences());
  return saved;
}
export function onPreferences(listener){listeners.add(listener);return()=>listeners.delete(listener);}
export function watchSystemMotion() {
  const media=motionMedia,change=()=>setPreferences({});
  if(!media)return()=>{};media.addEventListener('change',change);change();return()=>media.removeEventListener('change',change);
}
