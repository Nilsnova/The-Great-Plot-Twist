// Referee arrival card. Every ending, kit, item, coin and place comes from the adapter view.
import {formatCoins} from '../ui/kit/logic.js';
import {node,button,facts} from './helpers.js';
export function createArrivalScreen({navigate}) {
  const element=node('section','case-arrival');element.setAttribute('aria-label','Your arrival profile');
  return {element,update(view){
    const arrival=view.arrival;element.replaceChildren(node('p','case-eyebrow',arrival.endingLabel),node('h3','',arrival.title));
    if(arrival.kit){element.append(node('strong','case-kit-name',arrival.kit.name),facts([['Kit item',arrival.kit.item],['Start place',arrival.kit.startLabel],['Starting coins',formatCoins(arrival.coins)]]));
      const inventory=node('ul');for(const item of arrival.items)inventory.append(node('li','',item));element.append(inventory);
      if(arrival.logCard){const log=node('aside','case-log-card');log.append(node('h4','',arrival.logCard.title),node('p','',arrival.logCard.message),node('small','','Lead only · cannot be pinned'));element.append(log);}
      element.append(button('Find your crew',()=>navigate('crew'),{focus:'arrival-crew'}));}
    element.append(node('p','case-caption',arrival.message));
  },tick(){},dispose(){element.remove();}};
}
