// Read-only account rewards. Every amount, entitlement and line comes from the adapter.
import {node,restoreFocus} from '../helpers.js';
import './rewards.css';
export function createRewardsScreen(){const element=node('section','rewards-screen');return {element,update(view){restoreFocus(element,()=>{
  const model=view.rewards;element.replaceChildren(node('h3','','Your voyage'),node('p','rewards-balance',model.balance===null?'Coins are available after arrival.':`${model.balance.toLocaleString('en-US')} coins`));
  element.append(node('h3','','Coin ledger'));const ledger=node('ol','rewards-ledger');ledger.setAttribute('aria-label','Read-only coin ledger');
  for(const entry of model.ledger){const row=node('li');row.append(node('strong','',`${entry.amount>0?'+':''}${entry.amount.toLocaleString('en-US')} coins`),node('span','',entry.label));ledger.append(row);}
  if(model.status==='unavailable')element.append(node('p','case-notice','Your coin ledger is unavailable right now. You can keep exploring.'));
  if(!model.ledger.length)ledger.append(node('li','',model.status==='loading'?'Loading coin changes…':model.status==='unavailable'?'Coin changes could not be loaded.':'No coin changes yet.'));element.append(ledger,node('h3','','Keepsake cabinet'));
  const cabinet=node('div','rewards-cabinet');for(const item of model.keepsakes){const card=node('article',item.owned?'keepsake owned':'keepsake');const image=node('img');image.src=`${import.meta.env.BASE_URL}pixel/${({keepers_star:'keepers-star',recovered_lens:'lighthouse-lens',wall:'wall-of-lights-plaque',relighter:'coin-icon'})[item.id]??'coin-icon'}.png`;image.alt='';image.width=64;image.height=64;card.append(image,node('h4','',item.title),node('p','',item.description),node('p','',item.owned?'Earned':'Not yet earned'));cabinet.append(card);}element.append(cabinet);
  if(model.epilogue.length){element.append(node('h3','','After the case'));for(const line of model.epilogue)element.append(node('p','rewards-epilogue',line.text));}
  if(model.wallEntry)element.append(node('p','',`${model.wallEntry.name} · Wall of Lights`));
  if(model.festivalBadge)element.append(node('p','','Festival participant · lantern chosen'));
 });},tick(){},dispose(){element.remove();}};}
