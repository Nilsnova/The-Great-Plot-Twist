// One short passage at a time. Original prose, pockets and accepted moves live in the journal.
import {createDialogue,createPanel,createButton} from '../ui/kit/index.js';
import {node} from '../ui/kit/dom.js';
import {choiceCopy,passageCopy} from './intro-pages.js';
const NEXT='intro:next',MORE='intro:more';
export function createIntroView({onAction,onRestart,onClose}) {
  const element=node('div','intro-view'),message=node('p','intro-message');message.classList.add('kit-sr-only');message.setAttribute('role','status');
  const progress=node('p','intro-page-count'),goal=node('p','intro-goal','Find Elena. Follow the clues.');
  progress.setAttribute('aria-live','polite');
  const dialogue=createDialogue({speaker:'Lighthouse Isle',text:'',onChoice:choose});
  const journal=node('details','intro-journal'),journalTitle=node('summary','','Journal'),journalBody=node('div','intro-journal-body');
  const original=node('p','intro-original'),notes=node('ul','intro-notes'),journalEndingNotes=node('ul','intro-journal-ending-notes'),inventory=node('ul','intro-inventory'),moves=node('ol','intro-moves');
  moves.setAttribute('aria-label','Accepted move log');
  const inventoryPanel=createPanel({title:'Pockets',body:inventory}),movesPanel=createPanel({title:'Your trail',body:moves});
  const columns=node('div','intro-columns');columns.append(inventoryPanel.element,movesPanel.element);
  journalBody.append(original,notes,journalEndingNotes,columns);journal.append(journalTitle,journalBody);
  const ending=createPanel({title:'Chapter complete',body:''}),endingSummary=node('div','intro-ending-summary');
  const endingText=node('p'),endingNotes=node('ul','intro-notes intro-ending-notes'),arrivalSlot=node('div','intro-arrival-slot');
  const restart=createButton({label:'Start a new intro',onClick:onRestart,variant:'quiet'}),close=createButton({label:'Return to the island',onClick:onClose,variant:'quiet'});
  ending.element.classList.add('intro-ending');endingSummary.append(endingText,endingNotes);ending.body.append(endingSummary,arrivalSlot,restart.element);
  const footer=node('div','intro-footer');footer.append(journal,close.element);
  element.append(goal,progress,dialogue.element,ending.element,message,footer);
  let current=null,pages=[],page=0,batch=0;
  journal.addEventListener('toggle',()=>{dialogue.element.inert=journal.open;ending.element.inert=journal.open;if(journal.open)dialogue.pause();else if(current)dialogue.complete();});
  journal.addEventListener('keydown',event=>{if(event.key==='Escape'&&journal.open){event.preventDefault();event.stopPropagation();journal.open=false;journalTitle.focus();}});
  function paint() {
    const more=page<pages.length-1,options=current.choices.map(choiceCopy),groups=Math.max(1,Math.ceil(options.length/2));
    const choices=more?[{id:NEXT,label:'Continue'}]:options.slice(batch*2,batch*2+2);
    if(!more&&groups>1)choices.push({id:MORE,label:batch<groups-1?'More actions':'First actions'});
    dialogue.update({speaker:current.title,text:pages[page],choices});
    progress.textContent=`${page+1} / ${pages.length}${more?' · Continue to read':current.ended?' · Your journey continues':' · Choose your next move'}`;
    ending.element.hidden=!current.ended||more;
  }
  function choose(id) {
    if(id===NEXT){page++;batch=0;paint();dialogue.focus();return;}
    if(id===MORE){batch=(batch+1)%Math.ceil(current.choices.length/2);paint();dialogue.complete();dialogue.focus();return;}
    onAction?.(id);
  }
  function update(view,actions,notice) {
    const previous=current;current={...view,notes:[...view.notes],choices:[...view.choices]};
    pages=passageCopy(view,previous,notice);page=0;batch=0;element.dataset.scene=view.scene;journal.open=false;
    goal.textContent=view.ended?'Chapter complete. Your journey continues.':'Find Elena. Follow the clues.';
    original.textContent=view.text;message.textContent=notice??view.message??'';message.hidden=!message.textContent;
    notes.replaceChildren(...(view.ended?[]:view.notes.map(note=>node('li','',note))));notes.hidden=view.ended||!view.notes.length;
    journalEndingNotes.replaceChildren(...(view.ended?view.notes.map(note=>node('li','',note)):[]));journalEndingNotes.hidden=!view.ended;
    endingText.textContent=view.ended?view.text:'';endingNotes.replaceChildren(...(view.ended?view.notes.map(note=>node('li','',note)):[]));endingNotes.hidden=!view.ended||!view.notes.length;
    inventory.replaceChildren(...view.inventory.map(item=>{const li=node('li');li.append(node('strong','',item.name),node('p','',item.description));return li;}));
    if(!view.inventory.length)inventory.append(node('li','','Your pockets are empty.'));
    moves.replaceChildren(...view.history.map(move=>{const li=node('li','',move.label);li.dataset.action=move.id;return li;}));
    if(!actions.length)moves.append(node('li','','No moves yet.'));
    paint();
  }
  return {element,update,setArrival(content){arrivalSlot.replaceChildren(...(content?[content]:[]));if(content)content.prepend(endingSummary);else ending.body.insertBefore(endingSummary,arrivalSlot);},
    closeJournal(){if(!journal.open)return false;journal.open=false;journalTitle.focus();return true;},
    pause(){dialogue.pause();},focus(){dialogue.focus();},
    dispose(){dialogue.dispose();inventoryPanel.dispose();movesPanel.dispose();ending.dispose();restart.dispose();close.dispose();element.remove();}};
}
