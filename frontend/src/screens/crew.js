// Crew code, join preview and four seats. Membership, kit choice and refusals belong to the adapter.
import {node,button,restoreFocus} from './helpers.js';
export function createCrewScreen({send,navigate}) {
  const element=node('section','case-crew');let code='';
  async function copy(value){try{await navigator.clipboard.writeText(value);status.textContent='Crew code copied.';}catch{status.textContent='Select the crew code and copy it with your device’s copy command.';}}
  const status=node('p','case-caption');status.setAttribute('role','status');
  return {element,update(view){restoreFocus(element,()=>{
    const crew=view.crew,permissions=view.permissions??{};element.replaceChildren();
    if(crew.code){const heading=node('div','crew-code-line'),value=node('code','crew-code',crew.code);value.tabIndex=0;heading.append(value,button('Copy code',()=>copy(crew.code)));element.append(heading,node('p','',`Crew ${crew.status}`));}
    else {
      element.append(button('Start a crew',()=>send('createCrew'),{disabled:!permissions.createCrew,focus:'create-crew'}));
      const form=node('form','crew-join'),label=node('label','case-field'),input=node('input');input.value=code;input.maxLength=16;input.autocomplete='off';input.spellcheck=false;input.setAttribute('aria-label','Crew code');input.dataset.focus='join-code';input.oninput=()=>{code=input.value;};input.onkeydown=e=>{if(e.key==='Enter'&&permissions.joinCrew){e.preventDefault();send('joinCrew',code);}};
      label.append(node('span','','Join with a code'),input);form.append(label,button('Check crew code',()=>send('joinCrew',code),{disabled:!permissions.joinCrew,focus:'join-check'}));form.onsubmit=event=>{event.preventDefault();send('joinCrew',code);};element.append(form);
    }
    if(crew.joinPreview){const preview=node('aside','case-notice');preview.append(node('h3','','Your seat'),node('p','',crew.joinPreview.message),button('Confirm join',()=>send('joinCrew',crew.joinPreview.code,{confirm:true}),{focus:'confirm-join'}));element.append(preview);}
    const seats=node('ol','crew-seats');seats.setAttribute('aria-label','Crew seats');
    for(const seat of crew.seats){const card=node('li','crew-seat');card.dataset.kind=seat.kind;
      if(['deckhand','navigator','cook','salvager'].includes(seat.archetype)){const image=node('img','crew-portrait');image.src=`${import.meta.env.BASE_URL}pixel/crew-${seat.archetype}.png`;image.alt='';image.width=48;image.height=64;card.append(image);}
      card.append(node('span','case-eyebrow',`SEAT ${seat.seat} · ${seat.kind.toUpperCase()}`),node('h3','',seat.name),node('p','',seat.kit?.name??'Awaiting a captain'));
      if(seat.farewell)card.append(node('p','case-caption',seat.farewell));
      if(seat.isYou)card.append(node('span','kit-badge','You'));seats.append(card);}
    element.append(seats);
    if(permissions.muster)element.append(button('Muster with NPC partners',()=>send('muster'),{focus:'muster'}));
    element.append(button('Open the Captain’s Table',()=>navigate('board'),{quiet:true}),status);
    if(view.mode==='local')element.append(node('p','case-caption','Local rehearsal code to join: LANTERN. This does not join a live crew.'));
  });},tick(){},dispose(){element.remove();}};
}
