import {describe,it,expect,vi} from 'vitest';
import {createPresenceHud} from '../src/screens/presence/index.js';

class Element{constructor(tag){this.tagName=tag;this.children=[];this.style={};this.dataset={};this.attributes={};this.listeners={};this._textContent='';this.textWrites=0;this.hidden=false;this.disabled=false;this.className='';}
  get textContent(){return this._textContent;}set textContent(value){this._textContent=String(value);this.textWrites++;}
  append(...items){this.children.push(...items);}replaceChildren(...items){this.children=[...items];}setAttribute(k,v){this.attributes[k]=v;}removeAttribute(k){delete this.attributes[k];}addEventListener(k,fn){this.listeners[k]=fn;}removeEventListener(k){delete this.listeners[k];}remove(){this.removed=true;}click(){this.listeners.click?.({});}}
const view={status:'live',place:'saltreach_harbor',others:[{id:'p1',name:'Captain Shoal',kit:{id:'witness',name:'Witness'},x:1,y:2,facing:'front',moving:false,emote:null,isCrew:true,at:1000}],hiddenCount:2,crew:[{id:'c1',seat:1,name:'Captain Shoal',kit:{id:'witness',name:'Witness'},online:true,place:'saltreach_harbor',isPartner:true}],sampledAt:1000,localEmote:null,canEmote:true,cooldown:0};

describe('presence HUD',()=>{
  it('shows accessible count, supplies five emote intents and opens crew callback',()=>{
    const previous=globalThis.document;globalThis.document={createElement:tag=>new Element(tag)};
    try{
      const send=vi.fn(),onCrew=vi.fn(),hud=createPresenceHud({send,onCrew});hud.update(view);hud.setCounts({drawn:1,hidden:2,ids:['p1']});
      const find=cls=>{let found;const walk=e=>{if(e.className===cls)found=e;e.children.forEach(walk);};walk(hud.element);return found;};
      const status=find('presence-sr-only'),count=find('presence-count'),more=find('presence-more'),strip=find('presence-crew-strip');
      expect(hud.element.attributes['aria-label']).toContain('presence');expect(status.attributes['aria-live']).toBe('polite');
      expect(find('presence-emotes').hidden).toBe(true);expect(find('presence-connection').textContent).toContain('nearby');
      expect(status.textContent).toContain('Captain Shoal (Witness)');expect(count.textContent).toContain('1 shown');expect(count.textContent).toContain('2 hidden');
      expect(more.textContent).toBe('+2 more captains here');
      const seats=[...strip.children];expect(seats).toHaveLength(4);expect(seats[0].attributes['aria-label']).toContain('partner');expect(seats[1].textContent).toContain('Open');
      const writes=status.textWrites;hud.setCounts({drawn:1,hidden:2,ids:['p1']});
      expect(strip.children.every((item,index)=>item===seats[index])).toBe(true);expect(status.textWrites).toBe(writes);
      const buttons=[];const walk=e=>{if(e.tagName==='button')buttons.push(e);e.children.forEach(walk);};walk(hud.element);
      expect(buttons.filter(button=>button.textContent.startsWith('Emote ')).map(button=>button.textContent)).toHaveLength(5);
      buttons.find(button=>button.textContent==='Emotes').click();expect(find('presence-emotes').hidden).toBe(false);
      buttons.find(button=>button.textContent==='Emote wave').click();expect(send).toHaveBeenCalledWith('setEmote','wave');expect(find('presence-emotes').hidden).toBe(true);
      buttons.find(button=>button.textContent.startsWith('Crew')).click();expect(onCrew).toHaveBeenCalledOnce();
      hud.dispose();expect(hud.element.removed).toBe(true);
    }finally{globalThis.document=previous;}
  });
});
