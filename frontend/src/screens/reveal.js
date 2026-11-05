// Ordered, adapter-supplied reveal lines. Cited cards are highlighted without interpreting the story.
import {node,button,restoreFocus} from './helpers.js';
export function createRevealScreen({send,navigate}){
  const element=node('section','case-reveal');
  return {element,update(view){restoreFocus(element,()=>{const model=view.reveal;element.replaceChildren();if(!model.available){element.append(node('p','','The reveal is not available.'));return;}
    if(model.done){element.append(node('p','','The coast is relit.'),button('See the coast',()=>navigate('relighting'),{focus:'reveal-coast'}));return;}
    const line=model.line;element.append(node('p','case-caption',`Line ${model.index+1} of ${model.total}`),node('h3','',line.title),node('p','case-reveal-line',line.text));
    const cards=node('ul','case-cited-cards');cards.setAttribute('aria-label','Cards cited in this line');for(const card of model.cards??[]){const cited=line.cites.includes(card.id),row=node('li',cited?'is-cited':'',`${card.id} · ${card.title}${cited?' · cited':''}`);cards.append(row);}element.append(cards,button(model.index+1===model.total?'Finish the reveal':'Next line',()=>send('nextReveal'),{disabled:!model.canAdvance,focus:'reveal-next'}));
  });},tick(){},dispose(){element.remove();}};
}
