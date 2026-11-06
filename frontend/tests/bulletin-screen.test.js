import {describe,it,expect} from 'vitest';
import {createBulletinScreen} from '../src/screens/bulletin/index.js';
import {bulletinView,initialBulletinState,setBulletinScenario} from '../src/adapter/fake/bulletin.js';
class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.listeners={};this.hidden=false;this.textContent='';this.className='';}
  append(...children){for(const child of children){this.children.push(child);child.parentElement=this;}}
  replaceChildren(...children){this.children=[];this.append(...children);}
  setAttribute(name,value){this.attributes[name]=String(value);}removeAttribute(name){delete this.attributes[name];}
  addEventListener(name,callback){this.listeners[name]=callback;}removeEventListener(name){delete this.listeners[name];}
  click(){this.listeners.click?.({});}remove(){this.removed=true;}
}
function find(root,predicate){if(predicate(root))return root;for(const child of root.children??[]){const match=find(child,predicate);if(match)return match;}return null;}
describe('bulletin panel',()=>{
  it('renders supplied lines, Lisbon dates and resets without attribution clutter; tick preserves content nodes',()=>{
    const previous=globalThis.document;globalThis.document={createElement:tag=>new Element(tag)};
    try{
      const state=initialBulletinState(Date.parse('2026-11-16T12:00:00Z'));setBulletinScenario(state,'real',Date.parse('2026-11-16T12:00:00Z'));const panel=createBulletinScreen();panel.update({bulletin:bulletinView(state)});
      const first=find(panel.element,node=>node.className==='bulletin-lines').children[0];
      expect(first.dataset.kind).toBe('weather');expect(find(panel.element,node=>node.className==='bulletin-lines').children[1].dataset.kind).toBe('fog');
      expect(find(panel.element,node=>node.className==='bulletin-day').textContent).toContain('2026-11-16');
      expect(find(panel.element,node=>node.className==='bulletin-resets').children[1].children).toHaveLength(4);
      expect(find(panel.element,node=>node.tagName==='a')).toBeNull();
      panel.tick();expect(find(panel.element,node=>node.className==='bulletin-lines').children[0]).toBe(first);
      setBulletinScenario(state,'loading');panel.update({bulletin:bulletinView(state)});expect(find(panel.element,node=>node.className==='bulletin-status').textContent).toBe('The bulletin is not posted yet');
      setBulletinScenario(state,'unavailable');panel.update({bulletin:bulletinView(state)});expect(find(panel.element,node=>node.className==='bulletin-status').textContent).toContain('unavailable');
      setBulletinScenario(state,'hook');const hooked=bulletinView(state);panel.update({bulletin:hooked});
      expect(find(panel.element,node=>node.className==='bulletin-hook').hidden).toBe(false);
      expect(find(panel.element,node=>node.className==='bulletin-hook').children[1].textContent).toBe('[notice supplied by the server]');
      const announce=find(panel.element,node=>node.dataset.focus==='hook-announcements'),live=find(panel.element,node=>node.className==='bulletin-hook-status');
      expect(live.textContent).toBe('');announce.click();expect(live.textContent).toBe('Short flash, 1 of 3.');announce.click();expect(live.textContent).toBe('Flash announcements stopped.');
      announce.click();expect(live.textContent).toContain('Short flash');panel.close();expect(live.textContent).toBe('Flash announcements stopped.');
      panel.dispose();
    }finally{globalThis.document=previous;}
  });
});
