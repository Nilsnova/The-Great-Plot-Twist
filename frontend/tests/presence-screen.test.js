import {describe,it,expect,vi} from 'vitest';
import {createPresenceHud} from '../src/screens/presence/index.js';

class Element{constructor(tag){this.tagName=tag;this.children=[];this.style={};this.dataset={};this.attributes={};this.listeners={};this._textContent='';this.textWrites=0;this.hidden=false;this.disabled=false;this.className='';}
  get textContent(){return this._textContent;}set textContent(value){this._textContent=String(value);this.textWrites++;}
  append(...items){this.children.push(...items);}replaceChildren(...items){this.children=[...items];}setAttribute(k,v){this.attributes[k]=v;}removeAttribute(k){delete this.attributes[k];}addEventListener(k,fn){this.listeners[k]=fn;}removeEventListener(k){delete this.listeners[k];}remove(){this.removed=true;}click(){this.listeners.click?.({});}}
const view={status:'live',place:'saltreach_harbor',others:[{id:'p1',name:'Captain Shoal',kit:{id:'witness',name:'Witness'},x:1,y:2,facing:'front',moving:false,emote:null,isCrew:true,at:1000}],hiddenCount:2,crew:[{id:'c1',seat:1,name:'Captain Shoal',kit:{id:'witness',name:'Witness'},online:true,place:'saltreach_harbor',isPartner:true}],sampledAt:1000,localEmote:null,canEmote:true,cooldown:0};

describe('presence HUD',()=>{
  it('ignores stale activations while emotes are off, waiting or disposed',async()=>{
    const previous=globalThis.document;globalThis.document={createElement:tag=>new Element(tag)};
    try{
      const send=vi.fn(async()=>({accepted:true,reason:null,message:''})),hud=createPresenceHud({send});
      hud.update(view);const buttons=[];
      const walk=element=>{if(element.tagName==='button')buttons.push(element);element.children.forEach(walk);};
      walk(hud.element);const wave=buttons.find(button=>button.textContent==='Emote wave');
      for(const status of ['off','offline','reconnecting']){
        hud.update({...view,status,canEmote:false});expect(wave.disabled).toBe(true);wave.click();
      }
      expect(send).not.toHaveBeenCalled();
      hud.update(view);wave.click();await Promise.resolve();expect(send).toHaveBeenCalledOnce();
      hud.update({...view,canEmote:false,cooldown:3000});expect(wave.disabled).toBe(true);wave.click();
      expect(send).toHaveBeenCalledOnce();hud.update(view);wave.click();await Promise.resolve();
      expect(send).toHaveBeenCalledTimes(2);hud.dispose();wave.click();expect(send).toHaveBeenCalledTimes(2);
    }finally{globalThis.document=previous;}
  });

  it('shows accessible count and supplies five emote intents',()=>{
    const previous=globalThis.document;globalThis.document={createElement:tag=>new Element(tag)};
    try{
      const send=vi.fn(),hud=createPresenceHud({send});hud.update(view);hud.setCounts({drawn:1,hidden:2,ids:['p1']});
      const find=cls=>{let found;const walk=e=>{if(e.className===cls)found=e;e.children.forEach(walk);};walk(hud.element);return found;};
      const status=find('presence-sr-only'),count=find('presence-count'),more=find('presence-more');
      expect(hud.element.attributes['aria-label']).toContain('presence');expect(status.attributes['aria-live']).toBe('polite');
      expect(find('presence-emotes').hidden).toBe(true);expect(find('presence-connection').textContent).toBe('Live · 3');
      expect(status.textContent).toContain('Captain Shoal (Witness)');expect(count.textContent).toContain('1 shown');expect(count.textContent).toContain('2 hidden');
      expect(more.textContent).toBe('+2 more captains here');
      expect(find('presence-crew-strip')).toBeUndefined();
      const writes=status.textWrites;hud.setCounts({drawn:1,hidden:2,ids:['p1']});
      expect(status.textWrites).toBe(writes);
      const buttons=[];const walk=e=>{if(e.tagName==='button')buttons.push(e);e.children.forEach(walk);};walk(hud.element);
      expect(buttons.filter(button=>button.textContent.startsWith('Emote ')).map(button=>button.textContent)).toHaveLength(5);
      buttons.find(button=>button.textContent==='Emotes').click();expect(find('presence-emotes').hidden).toBe(false);
      buttons.find(button=>button.textContent==='Emote wave').click();expect(send).toHaveBeenCalledWith('setEmote','wave');expect(find('presence-emotes').hidden).toBe(true);
      expect(buttons.some(button=>button.textContent.startsWith('Crew'))).toBe(false);
      hud.dispose();expect(hud.element.removed).toBe(true);
    }finally{globalThis.document=previous;}
  });
});
