// NPC order controls and travel/report display. Partners' legal orders come from the adapter.
import {node,button,labelledSelect,restoreFocus,secondsLabel} from './helpers.js';
import {reducedMotion} from '../settings/preferences.js';
export function createPartnersScreen({send}) {
  const element=node('section','case-partners'),selection=new Map();
  function controls(partner) {
    const local=selection.get(partner.seat)??{order:'fetch',target:''};selection.set(partner.seat,local);
    const section=node('div','partner-order-controls'),targets=()=>partner.targets[local.order]??[];
    function targetField(){const choices=targets();if(!choices.some(item=>item.id===local.target))local.target=choices[0]?.id??'';const field=labelledSelect('Target',choices,id=>{local.target=id;},{value:local.target,focus:`partner-target-${partner.seat}`});field.element.hidden=!choices.length;return field.element;}
    const targetContainer=node('div');targetContainer.append(targetField());
    const order=labelledSelect('Order',partner.orders,id=>{local.order=id;targetContainer.replaceChildren(targetField());},{value:local.order,focus:`partner-order-${partner.seat}`});
    section.append(order.element,targetContainer,button('Send order',()=>send('orderPartner',partner.seat,local.order,local.target),{disabled:!partner.canOrder,focus:`partner-send-${partner.seat}`}));return section;
  }
  return {element,update(view){restoreFocus(element,()=>{
    element.replaceChildren(node('p','','Partners follow orders. They do not pair cards, accuse or give hints.'));
    for(const partner of view.partners){const row=node('article','case-partner');row.dataset.seat=partner.seat;row.append(node('h3','',`${partner.name} · Seat ${partner.seat}`),node('p','partner-status',partner.status));
      const track=node('div','partner-track'),image=node('img','partner-walker');image.src=`${import.meta.env.BASE_URL}pixel/crew-${['deckhand','navigator','cook','salvager'].includes(partner.archetype)?partner.archetype:'deckhand'}.png`;image.alt='';image.width=48;image.height=64;track.append(image);row.append(track,controls(partner),node('p','partner-report'));element.append(row);}
    if(!view.partners.length)element.append(node('p','','Muster a crew with open seats to meet your partners.'));
    if(view.notice?.offer){const offer=view.notice.offer,prompt=node('aside','case-notice');prompt.append(node('p','',`Use the paid shortcut for ${offer.price} coins?`),button(`Pay ${offer.price} coins · Send this order`,()=>send('orderPartner',offer.seat,offer.order,offer.target,{allowPaid:true}),{focus:'partner-paid'}));element.append(prompt);}this.tick(view);
  });},tick(view){for(const partner of view.partners){const row=element.querySelector(`[data-seat="${partner.seat}"]`);if(!row)continue;row.querySelector('.partner-status').textContent=partner.status;row.querySelector(`[data-focus="partner-send-${partner.seat}"]`).disabled=!partner.canOrder;
    const job=partner.job;row.querySelector('.partner-report').textContent=job?(job.done?job.report:`${partner.status} · ${secondsLabel(job.remaining)}`):'Ready for an order.';
    const image=row.querySelector('.partner-walker'),moving=partner.status==='Travelling'&&!reducedMotion(),frame=moving?`-walk-${Math.floor(view.now)%2+1}`:'';
    const archetype=['deckhand','navigator','cook','salvager'].includes(partner.archetype)?partner.archetype:'deckhand',src=`${import.meta.env.BASE_URL}pixel/crew-${archetype}${frame}.png`;if(image.getAttribute('src')!==src)image.setAttribute('src',src);image.style.transform=`translateX(${Math.round(job&&!job.done?(1-job.remaining/(job.total||1))*120:0)}px)`;
  }},dispose(){element.remove();}};
}
