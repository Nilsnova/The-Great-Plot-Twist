// The screen displays evidence and sends a suspect id. It never chooses an outcome.
import {node,button,labelledSelect,restoreFocus,secondsLabel} from './helpers.js';
export function createAccusationScreen({send,navigate}){
  const element=node('section','case-accusation');let selected='';
  return {element,update(view){restoreFocus(element,()=>{const model=view.accusation;element.replaceChildren(node('p','',model.status??'The case service has not connected.'));
    if(model.schoonerFound){const scene=node('div','case-wheel-scene'),ship=node('img'),captain=node('img');ship.src=`${import.meta.env.BASE_URL}pixel/ghost-schooner.png`;ship.alt='Dark schooner';ship.width=256;ship.height=224;captain.src=`${import.meta.env.BASE_URL}pixel/character-masked-captain.png`;captain.alt='The masked captain at the wheel';captain.width=72;captain.height=96;scene.append(ship);if(model.aboard)scene.append(captain);element.append(scene);}
    if(model.canBoard)element.append(button('Board the schooner',()=>send('boardSchooner'),{focus:'board-schooner'}));
    const evidence=node('div','case-evidence');for(const finding of model.evidence??[]){const row=node('article');row.append(node('h3','',`${finding.id} · ${finding.title}`));for(const card of finding.cards)row.append(node('p','',`${card.id} · ${card.title}`));evidence.append(row);}element.append(evidence);
    const suspects=(model.suspects??[]).map(s=>({id:s.id,label:`${s.title}${s.cleared?' · cleared':''}`}));if(suspects.length){if(!suspects.some(s=>s.id===selected))selected=suspects[0].id;const field=labelledSelect('Accuse a suspect',suspects,id=>{selected=id;},{value:selected,focus:'accuse-select'});element.append(field.element,button('Present this accusation',async()=>{const result=await send('accuse',selected);if(result?.accepted)navigate('reveal');},{disabled:!model.allowed,focus:'accuse-send'}));}
    element.append(node('p','case-accuse-wait'));if(view.reveal.available)element.append(button('Open the reveal',()=>navigate('reveal'),{focus:'open-reveal'}));
  });this.tick(view);},tick(view){const model=view.accusation,control=element.querySelector('[data-focus="accuse-send"]');if(control)control.disabled=!model.allowed;const wait=element.querySelector('.case-accuse-wait');if(wait)wait.textContent=model.cooldown>0?`Next accusation in ${secondsLabel(model.cooldown)}`:'';},dispose(){element.remove();}};
}
