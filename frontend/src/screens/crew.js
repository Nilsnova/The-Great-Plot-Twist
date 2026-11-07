// Crew codes and seats are adapter views. Local input checks only keep a preview tied to its text.
import {node,button,restoreFocus} from './helpers.js';

function normalizedCode(value){
  if(typeof value!=='string')return null;
  const code=value.replace(/[\s-]/g,'').toUpperCase();
  return /^[A-Z0-9]{1,20}$/.test(code)?code:null;
}

export function createCrewScreen({send,navigate}) {
  const element=node('section','case-crew'),status=node('p','case-caption');
  status.setAttribute('role','status');
  let view={},code=null,pending=false,disposed=false,generation=0,identityPaused=false;
  let input=null,check=null,confirm=null,create=null,muster=null,previewHint=null;
  const permissions=()=>view.permissions??{};
  const ready=()=>view.mode==='local'||(view.account?.state==='signed_in'&&view.account?.hasKit===true);
  function clearPrivate(){
    generation+=1;pending=false;code='';status.textContent='';if(input)input.value='';
  }
  function adopt(next){
    const incoming=next??{},paused=incoming.mode!=='local'
      &&(incoming.account?.state!=='signed_in'||incoming.account?.hasKit!==true);
    if(paused&&!identityPaused)clearPrivate();
    identityPaused=paused;view=incoming;
    if(code===null)code=typeof view.crew?.joinPreview?.code==='string'?view.crew.joinPreview.code:'';
    return paused;
  }
  const matchingPreview=()=>normalizedCode(code)!==null
    &&normalizedCode(code)===normalizedCode(view.crew?.joinPreview?.code);
  function availability(){
    const canJoin=ready()&&permissions().joinCrew===true;
    if(create)create.disabled=pending||!ready()||permissions().createCrew!==true;
    if(muster)muster.disabled=pending||!ready()||permissions().muster!==true;
    if(input)input.disabled=pending||!canJoin;
    if(check)check.disabled=pending||!canJoin||!normalizedCode(code);
    if(confirm)confirm.disabled=pending||!canJoin||!matchingPreview();
    if(previewHint)previewHint.textContent=matchingPreview()
      ?'Confirm this code to ask the server for a seat.'
      :'The code changed. Check it again before confirming.';
  }
  async function invoke(name,...args){
    if(disposed||pending||!ready())return;
    const token=generation;
    const focus=element.contains(document.activeElement)?document.activeElement.dataset.focus:null;
    pending=true;availability();
    try{return await send?.(name,...args);}
    finally{
      if(!disposed&&token===generation){
        pending=false;
        availability();
        if(focus&&element.isConnected&&document.activeElement===document.body){
          const target=[...element.querySelectorAll('[data-focus]')].find(control=>control.dataset.focus===focus&&!control.disabled);
          target?.focus({preventScroll:true});
        }
      }
    }
  }
  async function copy(value,token){
    if(disposed||token!==generation||!ready()||view.crew?.code!==value)return;
    try{await navigator.clipboard.writeText(value);if(!disposed&&token===generation&&ready()&&view.crew?.code===value)status.textContent='Crew code copied.';}
    catch{if(!disposed&&token===generation&&ready()&&view.crew?.code===value)status.textContent='Select the crew code and copy it with your device’s copy command.';}
  }
  function checkCode(token){
    if(token===generation&&permissions().joinCrew===true&&normalizedCode(code))return invoke('joinCrew',code);
  }
  function joinForm(token){
    const form=node('form','crew-join'),label=node('label','case-field');
    input=node('input');input.type='text';input.value=code;input.maxLength=64;input.size=20;
    input.autocomplete='off';input.spellcheck=false;input.inputMode='text';input.setAttribute('autocapitalize','characters');
    input.setAttribute('aria-label','Crew code');input.dataset.focus='join-code';
    input.oninput=()=>{if(token===generation&&!disposed&&ready()){code=input.value;availability();}};
    input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();checkCode(token);}};
    label.append(node('span','','Join with a code'),input);
    check=button('Check crew code',()=>checkCode(token),{focus:'join-check'});
    form.append(label,check);form.onsubmit=event=>{event.preventDefault();checkCode(token);};
    element.append(form,node('p','case-caption','Spaces, hyphens and letter case are ignored. Use 1 to 20 letters or numbers.'));
  }
  function render(){
    const crew=view.crew??{seats:[]},token=generation;
    input=null;check=null;confirm=null;create=null;muster=null;previewHint=null;element.replaceChildren();
    if(crew.code){
      const heading=node('div','crew-code-line'),value=node('code','crew-code',crew.code);value.tabIndex=0;
      heading.append(value,button('Copy code',()=>copy(crew.code,token),{focus:'copy-crew-code'}));
      element.append(heading,node('p','',`Crew ${crew.status}`));
    }
    if(permissions().createCrew===true||!crew.code){
      create=button('Start a crew',()=>{if(token===generation)return invoke('createCrew');},{focus:'create-crew'});element.append(create);
    }
    if(permissions().joinCrew===true||!crew.code)joinForm(token);
    if(crew.joinPreview){
      const preview=node('aside','case-notice');
      previewHint=node('p','case-caption');
      confirm=button('Confirm join',()=>{
        if(token===generation&&permissions().joinCrew===true&&matchingPreview())return invoke('joinCrew',crew.joinPreview.code,{confirm:true});
      },{focus:'confirm-join'});
      preview.append(node('h3','','Check crew code'),node('p','',`Code: ${crew.joinPreview.code}`),
        node('p','',crew.joinPreview.message),previewHint,confirm);element.append(preview);
    }
    const seats=node('ol','crew-seats');seats.setAttribute('aria-label','Crew seats');
    for(const seat of crew.seats??[]){
      const card=node('li','crew-seat');card.dataset.kind=seat.kind;
      if(['deckhand','navigator','cook','salvager'].includes(seat.archetype)){
        const image=node('img','crew-portrait');image.src=`${import.meta.env.BASE_URL}pixel/crew-${seat.archetype}.png`;
        image.alt='';image.width=48;image.height=64;card.append(image);
      }
      card.append(node('p','case-eyebrow',`SEAT ${seat.seat} · ${seat.kind.toUpperCase()}`),
        node('h3','',seat.name),node('p','',seat.kit?.name??'Awaiting a captain'));
      if(seat.farewell)card.append(node('p','case-caption',seat.farewell));
      if(seat.isYou)card.append(node('span','kit-badge','You'));seats.append(card);
    }
    element.append(seats);
    if(permissions().muster===true){muster=button('Muster with NPC partners',()=>{if(token===generation)return invoke('muster');},{focus:'muster'});element.append(muster);}
    element.append(button('Open the Captain’s Table',()=>navigate('board'),{quiet:true}),status);
    if(view.mode==='local')element.append(node('p','case-caption','Local rehearsal code to join: LANTERN. This does not join a live crew.'));
    availability();
  }
  return {element,update(next){
    if(disposed)return;
    const focused=element.contains(document.activeElement)?document.activeElement:null;
    const selection=focused?.dataset.focus==='join-code'
      ?{start:focused.selectionStart,end:focused.selectionEnd,direction:focused.selectionDirection}:null;
    const paused=adopt(next);
    restoreFocus(element,render);
    if(!paused&&selection&&input&&!input.disabled&&document.activeElement===input){
      input.setSelectionRange(selection.start,selection.end,selection.direction);
    }
  },tick(next){if(disposed)return;if(next)adopt(next);availability();},dispose(){
    if(disposed)return;disposed=true;clearPrivate();view={};
    input=null;check=null;confirm=null;create=null;muster=null;previewHint=null;element.replaceChildren();element.remove();
  }};
}
