import '../ui/open-panels.css';
import '../ui/settings-polish.css';
// Readable native settings controls. Used by both the title and pause menu.
import '../shell/preferences.css';
import {node,uniqueId} from '../ui/kit/dom.js';
import {getPreferences,setPreferences} from './preferences.js';
import {noteAdapterView} from '../diagnostics/runtime.js';
import {createBuildInfo} from '../build/info.js';
import {createProblemLink,createProblemDescription} from '../diagnostics/report-link.js';
export function createSettingsView(view) {
  noteAdapterView(view);
  const form=node('div','preferences'),status=node('p','preferences-status');status.setAttribute('role','status');
  const values=getPreferences();
  function field(title,input,key,read) {
    const label=node('label','preference'),id=uniqueId('preference');input.id=id;label.htmlFor=id;
    label.append(node('span','',title),input);form.append(label);
    input.addEventListener('change',()=>{status.textContent=setPreferences({[key]:read(input)})?'Preferences saved in this browser.':'Preferences applied for this visit; storage is unavailable.';});
    return label;
  }
  function select(title,key,options,read=value=>value) {
    const input=node('select');input.dataset.preference=key;
    for(const [value,label] of options){const option=node('option','',label);option.value=value;input.append(option);}
    input.value=String(values[key]);field(title,input,key,element=>read(element.value));
  }
  select('Show other captains','showCaptains',[['everyone','Everyone · up to 8'],['crew','Crew only'],['off','Off']]);
  select('First-time hints','hintsEnabled',[['true','On'],['false','Off']],value=>value==='true');
  select('Quality','quality',[['high','High · full weather'],['low','Low · lighter weather']]);
  for(const key of ['master','music','effects']) {
    const input=node('input');input.type='range';input.min='0';input.max='100';input.step='1';input.value=String(Math.round(values[key]*100));input.dataset.preference=key;
    const output=node('output','preference-value',`${input.value}%`);output.setAttribute('aria-hidden','true');
    input.setAttribute('aria-valuetext',`${input.value} percent`);
    input.addEventListener('input',()=>{output.value=`${input.value}%`;input.setAttribute('aria-valuetext',`${input.value} percent`);setPreferences({[key]:Number(input.value)/100});});
    const label=field(`${key[0].toUpperCase()+key.slice(1)} volume`,input,key,element=>Number(element.value)/100);
    const title=label.firstElementChild;title.classList.add('preference-title');title.append(output);output.htmlFor=input.id;
  }
  select('Reduced motion','reducedMotion',[['null','Follow device preference'],['true','On · still transitions'],['false','Off · full animation']],value=>value==='null'?null:value==='true');
  select('Text speed','textSpeed',[['24','Relaxed'],['36','Steady'],['60','Quick'],['0','Instant']],Number);
  const colour=node('input');colour.type='checkbox';colour.checked=values.colourblind;colour.dataset.preference='colourblind';field('Color-blind-safe highlights',colour,'colourblind',element=>element.checked);
  const controls=node('section','controls-overview');controls.append(node('h3','','Controls'));
  for(const [title,copy] of [
    ['Keyboard','WASD or arrows walk; Shift runs. E inspects, M opens the chart, and the wheel zooms. Escape closes or pauses. In story choices, use arrows and Enter or numbers 1 to 9.'],
    ['Touch','Tap a clear spot on the map to walk, or drag the stick. Use Inspect nearby, Chart to travel and Menu to pause. Tap story choices directly.'],
    ['Gamepad','Left stick or D-pad walks. A inspects, Y opens the chart, and Menu pauses. Menus also support D-pad and A.'],
  ]) {const paragraph=node('p');paragraph.append(node('strong','',title),document.createTextNode(copy));controls.append(paragraph);}
  const report=createProblemLink('settings_open');form.append(controls,report,createProblemDescription(report),createBuildInfo(),status);return form;
}
