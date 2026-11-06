// App-owned, memory-only diagnostics. Only fixed action names and public place ids are retained.
import {on} from '../core/events.js';
import {places} from '../world/places/registry.js';
import {actionForControl} from './ui-actions.js';
import {createUiTrace} from './trace.js';
const trace=createUiTrace();let active=false,placeId='not_started',inputType='mouse',stops=[];
function clicked(event){
  const control=event.target?.closest?.('button,a,summary');if(!control)return;
  if(control.hasAttribute('data-choice')){trace.record('dialogue_choice');return;}
  const label=control.getAttribute('aria-label')??control.textContent.trim();
  trace.record(actionForControl({label,focus:control.dataset.focus}));
}
function pointed(event){inputType=event.pointerType==='touch'?'touch':'mouse';}
function changed(event){if(event.target?.matches?.('[data-preference]'))trace.record('settings_change');}
function keyed(event){
  if(!event.isTrusted||event.target?.closest?.('input,textarea,select,[contenteditable="true"]'))return;
  const action={KeyE:'interact',KeyM:'chart_open',Escape:'back'}[event.code];
  if(action)trace.record(action);
}
export function startDiagnostics(){
  if(active)return;active=true;
  document.addEventListener('click',clicked,true);document.addEventListener('pointerdown',pointed,true);document.addEventListener('change',changed,true);
  document.addEventListener('keydown',keyed,true);
  stops=[on('arrived',event=>{if(Object.hasOwn(places,event.place))placeId=event.place;}),on('app_disposed',disposeDiagnostics)];
}
export function noteUiAction(action){startDiagnostics();trace.record(action);}
export function noteInputType(type){startDiagnostics();if(['touch','mouse','gamepad'].includes(type))inputType=type;}
export function readDiagnostics(){
  return {build:__BUILD_STAMP__,placeId,viewport:{width:innerWidth,height:innerHeight},inputType,actions:trace.read()};
}
export function disposeDiagnostics(){
  if(!active)return;active=false;
  document.removeEventListener('click',clicked,true);document.removeEventListener('pointerdown',pointed,true);document.removeEventListener('change',changed,true);
  document.removeEventListener('keydown',keyed,true);
  stops.forEach(stop=>stop());stops=[];trace.clear();placeId='not_started';inputType='mouse';
}
if(import.meta.hot)import.meta.hot.dispose(disposeDiagnostics);
