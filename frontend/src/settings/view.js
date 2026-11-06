// Readable native settings controls. Used by both the title and pause menu.
import {node,uniqueId} from '../ui/kit/dom.js';
import {getPreferences,setPreferences} from './preferences.js';
export function createSettingsView() {
  const form=node('div','preferences'),status=node('p','preferences-status');status.setAttribute('role','status');
  const values=getPreferences();
  function field(title,input,key,read) {
    const label=node('label','preference'),id=uniqueId('preference');input.id=id;label.htmlFor=id;
    label.append(node('span','',title),input);form.append(label);
    input.addEventListener('change',()=>{status.textContent=setPreferences({[key]:read(input)})?'Preferences saved in this browser.':'Preferences applied for this visit; storage is unavailable.';});
  }
  function select(title,key,options,read=value=>value) {
    const input=node('select');input.dataset.preference=key;
    for(const [value,label] of options){const option=node('option','',label);option.value=value;input.append(option);}
    input.value=String(values[key]);field(title,input,key,element=>read(element.value));
  }
  select('Show other captains','showCaptains',[['everyone','Everyone · up to eight nearby'],['crew','Crew only'],['off','Off']]);
  select('First-time hints','hintsEnabled',[['true','On'],['false','Off']],value=>value==='true');
  select('Quality','quality',[['high','High · full weather'],['low','Low · lighter weather']]);
  for(const key of ['master','music','effects']) {
    const input=node('input');input.type='range';input.min='0';input.max='100';input.step='1';input.value=String(Math.round(values[key]*100));input.dataset.preference=key;
    input.setAttribute('aria-valuetext',`${input.value} percent`);
    input.addEventListener('input',()=>{input.setAttribute('aria-valuetext',`${input.value} percent`);setPreferences({[key]:Number(input.value)/100});});
    field(`${key[0].toUpperCase()+key.slice(1)} volume`,input,key,element=>Number(element.value)/100);
  }
  select('Reduced motion','reducedMotion',[['null','Follow device preference'],['true','On · still transitions'],['false','Off · full animation']],value=>value==='null'?null:value==='true');
  select('Text speed','textSpeed',[['24','Relaxed'],['36','Steady'],['60','Quick'],['0','Instant']],Number);
  const colour=node('input');colour.type='checkbox';colour.checked=values.colourblind;colour.dataset.preference='colourblind';field('Color-blind-safe highlights',colour,'colourblind',element=>element.checked);
  const controls=node('section','controls-overview');controls.append(node('h3','','Controls'),node('p','','Keyboard: WASD or arrows to walk, Shift to run, E to interact, M for the chart, wheel to zoom, Escape to close a view or pause. Dialogue: 1 to 9 for choices, arrows to browse, Enter to confirm.'));
  controls.append(node('p','','Touch: drag the stick to walk; tap Interact, Chart or Menu. Gamepad (optional): left stick or D-pad, A to interact, Y for chart, Menu to pause. Menus also support D-pad and A.'));
  form.append(controls,status);return form;
}
