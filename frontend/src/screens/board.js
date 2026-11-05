// Keyboard and drag/drop board. Pins, findings, cleared suspects and gates are adapter view data.
import {reducedMotion} from '../settings/preferences.js';
import {node,button,labelledSelect,restoreFocus,secondsLabel} from './helpers.js';
const frames={new:'clue-frame-new',pinned:'clue-frame-pinned',used:'clue-frame-used'};
export function createBoardScreen({send}) {
  const element=node('section','case-board');let first='',second='';const seenPins=new Set(),timers=[];
  function pinCredits(card){const line=node('p','case-card-credit','Pinned: ');if(!card.pinnedBy.length)line.append(document.createTextNode('Not pinned'));for(const pin of card.pinnedBy){const badge=node('span','case-seat-credit',pin.label);badge.dataset.seat=pin.seat;line.append(badge);}return line;}
  function cardView(card) {
    const item=node('article','case-clue');item.dataset.state=card.state;item.dataset.card=card.id;item.style.borderImageSource=`url("${import.meta.env.BASE_URL}pixel/${frames[card.state]??frames.new}.png")`;
    item.append(node('span','case-card-id',card.id),node('h3','',card.title),node('span','kit-badge',card.state));
    if(card.body)item.append(node('p','',card.body));
    item.append(node('p','case-card-credit',`Found: ${card.holders.map(holder=>holder.label).join(', ')||'Crew journal'}`),pinCredits(card));
    if(card.canPin)item.append(button('Pin my card',()=>send('pin',card.id),{focus:`pin-${card.id}`}));
    item.draggable=card.canPair;item.ondragstart=event=>event.dataTransfer.setData('text/plain',card.id);item.ondragover=event=>event.preventDefault();item.ondrop=event=>{event.preventDefault();send('pair',event.dataTransfer.getData('text/plain'),card.id);};
    return item;
  }
  return {element,update(view){restoreFocus(element,()=>{
    const board=view.board;element.replaceChildren(node('p','',board.pairHelp??'The adapter will supply your crew’s cards.'));
    const cards=node('div','case-cards');cards.setAttribute('aria-label','Crew cards');for(const card of board.cards)cards.append(cardView(card));
    if(!board.cards.length)cards.append(node('p','case-empty','No cards yet. Search the coast or inspect your satchel.'));element.append(cards);for(const pin of board.pinHighlights??[]){if(seenPins.has(pin.id))continue;seenPins.add(pin.id);const card=[...cards.querySelectorAll('[data-card]')].find(node=>node.dataset.card===pin.cardId);if(card&&Date.now()-pin.at<2200){card.dataset.pinSeat=pin.seat;if(!reducedMotion()){card.classList.add('case-live-pin');timers.push(setTimeout(()=>card.classList.remove('case-live-pin'),1800));}}}
    const choices=board.cards.filter(card=>card.canPair).map(card=>({id:card.id,label:`${card.id} · ${card.title}`}));
    if(choices.length){if(!choices.some(choice=>choice.id===first))first=choices[0].id;if(!choices.some(choice=>choice.id===second))second=choices[1]?.id??first;
      const pair=node('div','case-pair-controls'),a=labelledSelect('First card',choices,value=>{first=value;},{value:first,focus:'pair-first'}),b=labelledSelect('Second card',choices,value=>{second=value;},{value:second,focus:'pair-second'});
      pair.append(a.element,b.element,button('Pair cards',()=>send('pair',first,second),{disabled:!board.canPair,focus:'pair-cards'}));element.append(pair);}
    const deductions=node('section','case-deductions');deductions.append(node('h3','','Deductions'));
    for(const deduction of board.deductions){const panel=node('article','case-deduction');panel.dataset.complete=String(deduction.complete);panel.append(node('h4','',`${deduction.id} · ${deduction.title}`),node('p','',deduction.complete?deduction.finding:'Not formed'));
      if(deduction.complete)panel.append(node('p','',`Clears: ${deduction.clearedTitles.join(', ')||'No suspect'}`),node('p','',`Opens: ${deduction.opens.join(', ')}`));deductions.append(panel);}element.append(deductions);
    const suspects=node('section','case-suspects');suspects.append(node('h3','','Suspects'));const list=node('ul');
    for(const suspect of board.suspects){const row=node('li','',suspect.title);row.dataset.cleared=String(suspect.cleared);row.append(node('span','kit-badge',suspect.cleared?`Cleared · ${suspect.clearedBy}`:'Not cleared'));list.append(row);}suspects.append(list);element.append(suspects);
    if(board.logLead)element.append(node('p','case-caption','Elena’s log is a lead, not a pinnable card.'));
    element.append(node('p','case-pair-wait'));this.tick(view);
  });},tick(view){const label=element.querySelector('.case-pair-wait');const pair=element.querySelector('[data-focus=pair-cards]');if(pair)pair.disabled=!view.board.canPair;if(label){label.textContent=view.board.pairWait?`Pairing available in ${secondsLabel(view.board.pairWait)}`:'';label.setAttribute('role','status');}},dispose(){timers.forEach(clearTimeout);element.remove();}};
}
