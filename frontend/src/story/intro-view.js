// Safe kit presentation for scenes, inventory, notes, move history and the original ending card.
import {createDialogue,createPanel,createButton} from '../ui/kit/index.js';
import {node} from '../ui/kit/dom.js';
export function createIntroView({onAction,onRestart,onClose}) {
  const element=node('div','intro-view'),message=node('p','intro-message'),notes=node('ul','intro-notes'),endingNotes=node('ul','intro-notes intro-ending-notes'),columns=node('div','intro-columns');
  message.setAttribute('role','status');
  const dialogue=createDialogue({speaker:'Field notes',text:'',onChoice:onAction});
  const inventory=node('ul','intro-inventory'),moves=node('ol','intro-moves');moves.setAttribute('aria-label','Accepted move log');
  const inventoryPanel=createPanel({title:'Inventory',body:inventory}),movesPanel=createPanel({title:'Move log · actions[]',body:moves});
  const ending=createPanel({title:'',body:''}),restart=createButton({label:'Start a new intro',onClick:onRestart}),close=createButton({label:'Return to the island',onClick:onClose,variant:'quiet'});
  ending.element.classList.add('intro-ending');const endingSummary=node('div','intro-ending-summary'),endingText=node('p'),arrivalSlot=node('div','intro-arrival-slot');
  endingSummary.append(endingText,endingNotes);ending.body.append(endingSummary,arrivalSlot,restart.element);
  columns.append(inventoryPanel.element,movesPanel.element);element.append(dialogue.element,ending.element,message,notes,columns,close.element);
  function update(view,actions,notice) {
    element.dataset.scene=view.scene;dialogue.element.hidden=view.ended;ending.element.hidden=!view.ended;
    if(view.ended){ending.update({title:view.title});endingText.textContent=view.text;}else dialogue.update({speaker:view.title,text:view.text,choices:view.choices});
    message.textContent=notice??view.message??'';message.hidden=!message.textContent;
    const sceneNotes=view.notes.map(note=>node('li','',note));
    notes.replaceChildren(...(view.ended?[]:sceneNotes));endingNotes.replaceChildren(...(view.ended?sceneNotes:[]));
    notes.hidden=view.ended||!view.notes.length;endingNotes.hidden=!view.ended||!view.notes.length;inventory.replaceChildren();
    if(!view.inventory.length)inventory.append(node('li','','Your pockets are empty.'));
    view.inventory.forEach(item=>{const li=node('li');li.append(node('strong','',item.name),node('p','',item.description));inventory.append(li);});
    moves.replaceChildren(...view.history.map(move=>{const li=node('li','',move.label);li.dataset.action=move.id;return li;}));movesPanel.update({title:`Move log · ${actions.length} accepted`});
    if(!actions.length)moves.append(node('li','','No moves yet.'));
  }
  return {element,update,setArrival(content){
    arrivalSlot.replaceChildren(...(content?[content]:[]));
    if(content)content.prepend(endingSummary);else ending.body.insertBefore(endingSummary,arrivalSlot);
  },pause(){dialogue.pause();},focus(){if(ending.element.hidden)dialogue.focus();else restart.element.focus();},
    dispose(){dialogue.dispose();inventoryPanel.dispose();movesPanel.dispose();ending.dispose();restart.dispose();close.dispose();element.remove();}};
}
