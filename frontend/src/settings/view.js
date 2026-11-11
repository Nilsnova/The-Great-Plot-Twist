import '../ui/open-panels.css';
import '../ui/kit/components.css';
import '../ui/settings-polish.css';
// Readable native settings controls (segmented radios, switches, sliders). Used by the title and the pause menu.
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
    input.addEventListener('change',()=>saved(setPreferences({[key]:read(input)})));
    return label;
  }
  // A short list of choices is a segmented toggle (native radios), not a dropdown.
  function choice(title,key,options,read=value=>value) {
    const set=node('fieldset','preference u-choice'),name=uniqueId('preference');set.dataset.preference=key;set.append(node('legend','',title));
    for(const [value,label] of options){
      const item=node('label'),input=node('input');input.type='radio';input.name=name;input.value=value;input.checked=String(values[key])===value;
      input.addEventListener('change',()=>{if(input.checked)saved(setPreferences({[key]:read(value)}));});
      item.append(input,document.createTextNode(label));set.append(item);
    }
    form.append(set);return set;
  }
  function saved(ok){status.textContent=ok?'Saved in this browser.':'Applied for this visit; storage is unavailable.';}
  function toggle(title,key){
    const input=node('input','u-switch');input.type='checkbox';input.checked=values[key]===true;input.dataset.preference=key;
    field(title,input,key,element=>element.checked);return input;
  }
  choice('Show other captains','showCaptains',[['everyone','Everyone'],['crew','Crew'],['off','Off']]);
  toggle('First-time hints','hintsEnabled');
  choice('Quality','quality',[['high','High'],['low','Low']]);
  for(const key of ['master','music','effects','voice']) {
    const input=node('input');input.type='range';input.min='0';input.max='100';input.step='1';input.value=String(Math.round(values[key]*100));input.dataset.preference=key;
    const output=node('output','preference-value',`${input.value}%`);output.setAttribute('aria-hidden','true');
    input.setAttribute('aria-valuetext',`${input.value} percent`);
    input.addEventListener('input',()=>{output.value=`${input.value}%`;input.setAttribute('aria-valuetext',`${input.value} percent`);setPreferences({[key]:Number(input.value)/100});});
    const label=field(`${key[0].toUpperCase()+key.slice(1)} volume`,input,key,element=>Number(element.value)/100);
    const title=label.firstElementChild;title.classList.add('preference-title');title.append(output);output.htmlFor=input.id;
  }
  choice('Reduced motion','reducedMotion',[['null','Device'],['true','On'],['false','Off']],value=>value==='null'?null:value==='true');
  choice('Subtitle size','subtitleSize',[['normal','Normal'],['large','Large']]);
  choice('Text speed','textSpeed',[['24','Relaxed'],['36','Steady'],['60','Quick'],['0','Instant']],Number).classList.add('is-wide');
  toggle('Color-blind-safe highlights','colourblind');
  const controls=node('section','controls-overview');controls.append(node('h3','','Controls'));
  for(const [title,copy] of [
    ['Keyboard','WASD or arrows walk. F fires your musket (hold it for more shots). E inspects, M opens the chart, and the wheel zooms. Escape closes or pauses. In story choices, use arrows and Enter or numbers 1 to 9.'],
    ['Touch','Tap a clear spot on the map to walk, or drag the stick. Use Inspect nearby, Chart to travel and Menu to pause. Tap story choices directly.'],
    ['Gamepad','Left stick or D-pad walks. A inspects, Y opens the chart, and Menu pauses. Menus also support D-pad and A.'],
  ]) {const paragraph=node('p');paragraph.append(node('strong','',title),document.createTextNode(copy));controls.append(paragraph);}
  const report=createProblemLink('settings_open');form.append(controls,report,createProblemDescription(report),createBuildInfo(),status);return form;
}
