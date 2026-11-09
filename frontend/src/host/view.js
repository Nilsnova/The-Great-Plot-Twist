// Pixel UI host panels. No HTML interpolation, inline style, direct database calls or spoiler fields.
import { node } from '../ui/kit/dom.js';
import { createPanel } from '../ui/kit/panel.js';
import { createButton } from '../ui/kit/button.js';
import { overviewPanels, checklistPanel, demoPanel } from './panels.js';

export function createHostView() {
  const panels=document.getElementById('host-panels'),status=document.getElementById('host-status');
  const actions=document.getElementById('host-actions'),closeButtons=new Map();
  let handlers={},signIn,forget;
  const clockButtons=[];let demoUi=null;
  function button(label,onClick) {return createButton({label,onClick}).element;}
  function crewsPanel(data) {
    const panel=createPanel({title:'Recent crews'});
    panel.body.append(node('p','host-note',`Newest ${data.crews.length} of ${data.total} crews. Refresh to see changes.`));
    if(!data.crews.length)panel.body.append(node('p','','No crews yet.'));
    for(const crew of data.crews) {
      const card=node('article','host-crew');
      card.append(node('h3','',crew.code??'Legacy crew'),
        node('p','',`${crew.status} · sailed ${crew.startedAt??'not yet'}`));
      const seats=node('ul');
      for(const seat of crew.seats)seats.append(node('li','',
        `Seat ${seat.seatNo}: ${seat.kind==='npc'?'NPC partner':seat.captainName??'Captain unavailable'}`));
      card.append(seats);
      if(crew.canClose) {
        const label=node('label','host-confirm'),checkbox=node('input');checkbox.type='checkbox';
        label.append(checkbox,document.createTextNode(' This is my test crew. Close it permanently.'));
        const close=button('Close test crew',()=>handlers.closeCrew(crew.id,checkbox.checked));
        close.disabled=true;checkbox.addEventListener('change',()=>{close.disabled=!checkbox.checked;});
        closeButtons.set(crew.id,{close,checkbox});card.append(label,close);
      }
      panel.body.append(card);
    }
    return panel.element;
  }
  function clockPanel(data) {
    const panel=createPanel({title:'Case clock'});panel.element.dataset.panel='clock';
    panel.body.append(node('p','host-note','Forward your own open crew only. Other crews and the world are unchanged.'));
    const label=node('label','host-clock-label','Seconds to move forward'),input=node('input');
    input.type='number';input.min='1';input.max='3600';input.step='1';input.value='600';input.id='clock-seconds';
    label.htmlFor=input.id;panel.body.append(label,input);
    function move(seconds) {
      if(!Number.isInteger(seconds)||seconds<1||seconds>3600){status.textContent='Enter a whole number from 1 to 3600.';return;}
      handlers.setClock(seconds);
    }
    const quick=node('div','host-clock-actions');
    for(const [caption,seconds] of [['+1 min',60],['+5 min',300],['+15 min',900],['+60 min',3600]]) {
      const apply=button(caption,()=>{input.value=String(seconds);move(seconds);});clockButtons.push(apply);quick.append(apply);
    }
    const apply=button('Move clock forward',()=>{if(input.reportValidity())move(Number(input.value));});
    clockButtons.push(apply);panel.body.append(apply,quick);
    return panel.element;
  }
  return {
    bind(callbacks) {
      handlers=callbacks;signIn=button('Sign in with GitHub',()=>handlers.signIn());
      forget=button('Forget me',()=>handlers.forget());forget.hidden=true;
      actions.append(signIn,forget,button('Refresh console',()=>handlers.refresh()));
    },
    signedIn(value) {signIn.hidden=value;forget.hidden=!value;},
    hide() {panels.hidden=true;panels.replaceChildren();closeButtons.clear();clockButtons.length=0;demoUi=null;},
    say(text) {status.textContent=text;},
    busy(id,value) {const row=closeButtons.get(id);if(row)row.close.disabled=value||!row.checkbox.checked;},
    demoBusy(value) {demoUi?.busy(value);},
    demoUpdate(demo,done) {demoUi?.update(demo);if(done)demoUi?.reset();},
    clockBusy(value) {clockButtons.forEach(b=>{b.disabled=value;});},
    show(data,crews,headers,demo=null) {
      closeButtons.clear();demoUi=demoPanel(demo,handlers);
      panels.replaceChildren(...overviewPanels(data),demoUi.element,crewsPanel(crews),checklistPanel(data,headers));
      if(data.caseClockAvailable)panels.append(clockPanel(data));
      panels.hidden=false;
    },
  };
}
