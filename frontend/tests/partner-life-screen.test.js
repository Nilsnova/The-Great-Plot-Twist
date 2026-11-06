import {describe,it,expect,vi} from 'vitest';
import {createPartnerLifeScreen} from '../src/screens/partners/index.js';

class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.style={};this.dataset={};this.attributes={};this.listeners={};this.textContent='';this.value='';this.hidden=false;this.disabled=false;this.checked=false;this.className='';}
  append(...items){for(const item of items){this.children.push(item);item.parentElement=this;}}replaceChildren(...items){this.children=[];this.append(...items);}
  setAttribute(key,value){this.attributes[key]=String(value);}removeAttribute(key){delete this.attributes[key];}
  addEventListener(key,fn){this.listeners[key]=fn;}removeEventListener(key){delete this.listeners[key];}
  remove(){this.removed=true;}click(){return this.listeners.click?.({});}
}
function find(root,predicate){if(predicate(root))return root;for(const child of root.children??[]){const found=find(child,predicate);if(found)return found;}return null;}
const view={now:120,notice:null,partners:[{seat:2,name:'Salvager partner',archetype:'salvager',canOrder:true,orders:[{id:'fetch',label:'Fetch a card'}],targets:{fetch:[{id:'C4',label:'Card target'}]},job:null,life:{status:'travelling',portraitId:'crew-salvager-portrait',actor:{place:'saltreach_harbor',x:0,y:19,facing:'front',moving:true},travel:{remaining:180},post:null,chartLine:{from:{x:217,y:156},to:{x:112,y:76},progress:.5,active:true,label:'Harbor to Cove'},event:{type:'order_accepted',text:'I’m heading out.'},refusal:null}}]};

describe('partner life screen',()=>{
  it('shows supplied life status and requires explicit priced paid consent',async()=>{
    const previous=globalThis.document;globalThis.document={createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)};
    try{
      const send=vi.fn().mockResolvedValue({accepted:false,offer:{seat:2,order:'fetch',target:'C4',price:150}}),screen=createPartnerLifeScreen({send,navigate:vi.fn()});screen.update(view);
      expect(find(screen.element,node=>node.className==='partner-life-intro').textContent).toContain('Partners follow orders');
      const card=find(screen.element,node=>node.className==='partner-life-card'),portrait=find(card,node=>node.className==='partner-life-portrait');
      expect(portrait.width).toBe(64);expect(portrait.height).toBe(80);expect(find(card,node=>node.className==='partner-life-timer').textContent).toBe('Travel · 3:00');
      const order=find(card,node=>node.tagName==='select'&&node.attributes['aria-label']==='Order'),target=find(card,node=>node.tagName==='select'&&node.attributes['aria-label']==='Target');
      expect(order.dataset.focus).toBe('order-2');expect(target.dataset.focus).toBe('target-2');
      const ticked={...view,now:180,partners:view.partners.map(partner=>({...partner,life:{...partner.life,travel:{...partner.life.travel,remaining:120}}}))};
      screen.tick(ticked);expect(find(screen.element,node=>node.className==='partner-life-card')).toBe(card);expect(find(card,node=>node.className==='partner-life-timer').textContent).toBe('Travel · 2:00');
      const status=find(screen.element,node=>node.className==='partner-life-status');expect(status.textContent).toBe('travelling');
      expect(find(screen.element,node=>node.className==='partner-life-report').textContent).toBe('I’m heading out.');
      const sendButton=find(screen.element,node=>node.tagName==='button'&&node.dataset.focus==='send-partner-2');await sendButton.click();
      expect(send).toHaveBeenLastCalledWith('orderPartner',2,'fetch','C4',{allowPaid:false});
      const paid=find(screen.element,node=>node.className==='partner-paid-offer');expect(paid.hidden).toBe(false);expect(find(paid,node=>node.tagName==='p').textContent).toContain('150 coins');
      const consent=find(paid,node=>node.tagName==='input');expect(consent.checked).toBe(false);
      const confirm=find(paid,node=>node.tagName==='button');expect(confirm.disabled).toBe(true);
      consent.checked=true;consent.listeners.change();expect(confirm.disabled).toBe(false);await confirm.click();
      expect(send).toHaveBeenLastCalledWith('orderPartner',2,'fetch','C4',{allowPaid:true});
    }finally{globalThis.document=previous;}
  });
});
