// NPC partner life is supplied by the adapter; this screen only renders it and sends orders.
import {node,button,secondsLabel} from '../helpers.js';
import './partners.css';

const valid=['deckhand','navigator','cook','salvager'],portraits=new Set(valid.map(id=>`crew-${id}-portrait`));
const setText=(el,value)=>{if(el.textContent!==String(value??''))el.textContent=String(value??'');};
function svgNode(name){return document.createElementNS('http://www.w3.org/2000/svg',name);}

function createCard(partner,send,navigate){
  const seat=partner.seat;let current=partner;const local={order:partner.orders?.some(item=>item.id==='fetch')?'fetch':partner.orders?.[0]?.id??'wait',target:'',offer:null};
  const article=node('article','partner-life-card');article.dataset.seat=seat;
  const head=node('header','partner-life-head'),portrait=node('img','partner-life-portrait');portrait.alt='';portrait.width=64;portrait.height=80;
  const title=node('h3','',`${partner.name} · Seat ${seat}`),status=node('span','partner-life-status');head.append(portrait,title,status);
  const chart=node('div','partner-chart'),svg=svgNode('svg'),chartCaption=node('p','partner-chart-caption');
  svg.setAttribute('viewBox','0 0 440 230');svg.setAttribute('role','img');svg.setAttribute('aria-label',`Route for seat ${seat}`);
  chart.append(svg,chartCaption);
  const report=node('p','partner-life-report');report.setAttribute('aria-live','polite');const timer=node('p','partner-life-timer');
  const postStatus=node('p','partner-life-post');
  const orderLabel=node('label','partner-field'),orderCaption=node('span','', 'Order'),orderSelect=node('select');orderSelect.setAttribute('aria-label','Order');orderSelect.dataset.focus=`order-${seat}`;orderLabel.append(orderCaption,orderSelect);
  const targetLabel=node('label','partner-field'),targetCaption=node('span','', 'Target'),targetSelect=node('select');targetSelect.setAttribute('aria-label','Target');targetSelect.dataset.focus=`target-${seat}`;targetLabel.append(targetCaption,targetSelect);
  const sendButton=button('Send order',sendOrder,{focus:`send-partner-${seat}`,ariaLabel:`Send order · Seat ${seat}`});
  const feedback=node('p','partner-life-feedback');
  const boardButton=button('Open board',()=>navigate('board'),{focus:`partner-board-${seat}`,ariaLabel:`Open board · Seat ${seat}`});boardButton.hidden=true;
  const offerBox=node('div','partner-paid-offer');offerBox.hidden=true;
  const offerText=node('p',''),offerLabel=node('label','partner-paid-consent'),offerCheck=node('input');offerCheck.type='checkbox';
  offerLabel.append(offerCheck,node('span','','Allow the quoted shortcut for this order'));
  const payButton=button('Confirm paid route',confirmPaid,{disabled:true,focus:`partner-paid-${seat}`,ariaLabel:`Confirm paid route · Seat ${seat}`});
  offerBox.append(offerText,offerLabel,payButton);
  article.append(head,chart,report,timer,postStatus,boardButton,orderLabel,targetLabel,sendButton,feedback,offerBox);
  let marker=null;

  function fill(select,options,value){
    const signature=options.map(item=>`${item.id}:${item.label}`).join('|');
    if(select.dataset.signature!==signature){select.replaceChildren(...options.map(option=>{const el=node('option','',option.label);el.value=option.id;return el;}));select.dataset.signature=signature;}
    if(options.some(item=>item.id===value))select.value=value;
    else select.value=options[0]?.id??'';
  }
  function targets(model){return model.targets?.[local.order]??[];}
  orderSelect.addEventListener('change',()=>{local.order=orderSelect.value;local.target=targets(current)[0]?.id??'';local.offer=null;updateOffer();fill(targetSelect,targets(current),local.target);});
  targetSelect.addEventListener('change',()=>{local.target=targetSelect.value;local.offer=null;updateOffer();});
  offerCheck.addEventListener('change',()=>{payButton.disabled=!offerCheck.checked;});
  const matchingOffer=offer=>offer?.seat===seat&&offer.order===local.order&&offer.target===local.target;
  async function place({allowPaid}){
    const reply=await send?.('orderPartner',seat,local.order,local.target,{allowPaid});
    if(!allowPaid&&matchingOffer(reply?.offer))local.offer=reply.offer;
    else local.offer=null;
    setText(feedback,reply?.message??'');updateOffer();return reply;
  }
  function sendOrder(){return place({allowPaid:false});}
  function confirmPaid(){return place({allowPaid:true});}
  function updateOffer(){
    offerBox.hidden=!local.offer;
    if(local.offer){setText(offerText,`Paid route: ${local.offer.price} coins.`);setText(payButton,`Confirm ${local.offer.price} coins`);payButton.setAttribute('aria-label',`Confirm ${local.offer.price} coins · Seat ${seat}`);payButton.disabled=!offerCheck.checked;}
    else {offerCheck.checked=false;payButton.disabled=true;}
  }
  function update(model,view){
    current=model;
    const life=model.life??{},archetype=valid.includes(model.archetype)?model.archetype:'deckhand';
    const base=import.meta.env.BASE_URL??'/';portrait.src=`${base}pixel/${portraits.has(life.portraitId)?life.portraitId:`crew-${archetype}-portrait`}.png`;
    setText(title,`${model.name} · Seat ${seat}`);setText(report,life.event?.text??model.job?.report??'Ready for an order.');
    boardButton.hidden=life.event?.type!=='pinned_card';
    const line=life.chartLine;svg.hidden=!line?.active;svg.style.display=line?.active?'block':'none';svg.replaceChildren();marker=null;
    if(line){
      const segment=svgNode('line');segment.setAttribute('x1',line.from.x);segment.setAttribute('y1',line.from.y);segment.setAttribute('x2',line.to.x);segment.setAttribute('y2',line.to.y);segment.setAttribute('class',line.active?'partner-chart-line active':'partner-chart-line');svg.append(segment);
      marker=svgNode('circle');marker.setAttribute('r','5');marker.setAttribute('class','partner-chart-marker');svg.append(marker);
      setText(chartCaption,line.label??'Partner route');
    }else setText(chartCaption,'At the harbor berth');
    fill(orderSelect,model.orders??[],local.order);local.order=orderSelect.value;
    const choices=targets(model);fill(targetSelect,choices,local.target);local.target=targetSelect.value;
    orderLabel.hidden=!(model.orders?.length);targetLabel.hidden=!choices.length;
    if(matchingOffer(view.notice?.offer)){local.offer=view.notice.offer;updateOffer();}
    else if(view.notice?.seat===seat&&view.notice?.accepted===false&&!local.offer)setText(feedback,view.notice.message);
    tick(model,view);
  }
  function tick(model=current,view={}){
    current=model??current;const life=current.life??{},now=Number.isFinite(view.now)?view.now:0;
    setText(status,(life.status??'idle').replaceAll('_',' '));sendButton.disabled=!current.canOrder;
    const remaining=life.travel?.remaining??current.job?.remaining??0;
    setText(timer,remaining>0?`${life.status==='working'?'Working':'Travel'} · ${secondsLabel(remaining)}`:'');timer.hidden=remaining<=0;
    setText(postStatus,life.post?`${life.post.label} · ${life.post.onDuty?'on duty':`arrives in ${secondsLabel(Math.max(0,(life.post.readyAt??now)-now))}`}`:'');postStatus.hidden=!life.post;
    if(marker&&life.chartLine){const line=life.chartLine,progress=Math.max(0,Math.min(1,line.progress??0));marker.setAttribute('cx',line.from.x+(line.to.x-line.from.x)*progress);marker.setAttribute('cy',line.from.y+(line.to.y-line.from.y)*progress);}
  }
  return {article,update,tick};
}

export function createPartnerLifeScreen({send=()=>{},navigate=()=>{}}={}){
  const element=node('section','partner-life-screen'),intro=node('p','partner-life-intro','Partners follow orders and report back. They do not pair cards, accuse or give hints.');
  const list=node('div','partner-life-list');element.append(intro,list);let cards=new Map(),signature='';
  function update(view={}){
    const partners=view.partners??[],next=partners.map(partner=>`${partner.seat}:${partner.archetype}`).join('|');
    if(next!==signature){signature=next;cards=new Map();list.replaceChildren();for(const partner of partners){const card=createCard(partner,send,navigate);cards.set(partner.seat,card);list.append(card.article);}if(!partners.length)list.append(node('p','partner-life-empty','No partner seats are active.'));}
    for(const partner of partners)cards.get(partner.seat)?.update(partner,view);
  }
  function tick(view={}){
    const partners=view.partners??[],next=partners.map(partner=>`${partner.seat}:${partner.archetype}`).join('|');
    if(next!==signature){update(view);return;}
    for(const partner of partners)cards.get(partner.seat)?.tick(partner,view);
  }
  return {element,update,tick,dispose(){element.remove();cards.clear();}};
}
