import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {createBulletinScreen} from '../src/screens/bulletin/index.js';
import {bulletinView,initialBulletinState,setBulletinScenario} from '../src/adapter/fake/bulletin.js';
class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.listeners={};this.hidden=false;this.textContent='';this.className='';}
  append(...children){for(const child of children){this.children.push(child);child.parentElement=this;}}
  replaceChildren(...children){this.children=[];this.append(...children);}
  setAttribute(name,value){this.attributes[name]=String(value);}removeAttribute(name){delete this.attributes[name];}
  addEventListener(name,callback){this.listeners[name]=callback;}removeEventListener(name){delete this.listeners[name];}
  click(){if(!this.disabled)return this.onclick?this.onclick({}):this.listeners.click?.({});}
  querySelector(selector){const key=selector.match(/data-focus="([^"]+)"/)?.[1];return find(this,node=>node.dataset.focus===key);}
  remove(){this.removed=true;}
}
function find(root,predicate){if(predicate(root))return root;for(const child of root.children??[]){const match=find(child,predicate);if(match)return match;}return null;}
const part=(panel,name)=>find(panel.element,node=>node.className===name);
const action=(panel,key)=>find(panel.element,node=>node.dataset.focus===key);
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function supplied(scenario='real'){
  const state=initialBulletinState(Date.parse('2026-11-16T12:00:00Z'));
  setBulletinScenario(state,scenario,Date.parse('2026-11-16T12:00:00Z'));return bulletinView(state);
}
let previousDocument;
beforeEach(()=>{previousDocument=globalThis.document;globalThis.document={createElement:tag=>new Element(tag)};});
afterEach(()=>{globalThis.document=previousDocument;vi.restoreAllMocks();vi.useRealTimers();});
describe('bulletin panel',()=>{
  it('renders supplied lines, Lisbon dates and resets without attribution clutter; tick preserves content nodes',()=>{
    const previous=globalThis.document;globalThis.document={createElement:tag=>new Element(tag)};
    try{
      const state=initialBulletinState(Date.parse('2026-11-16T12:00:00Z'));setBulletinScenario(state,'real',Date.parse('2026-11-16T12:00:00Z'));const panel=createBulletinScreen();panel.update({bulletin:bulletinView(state)});panel.setActive(true);
      const first=find(panel.element,node=>node.className==='bulletin-lines').children[0];
      expect(first.dataset.kind).toBe('weather');expect(find(panel.element,node=>node.className==='bulletin-lines').children[1].dataset.kind).toBe('fog');
      expect(find(panel.element,node=>node.className==='bulletin-day').textContent).toContain('2026-11-16');
      expect(find(panel.element,node=>node.className==='bulletin-resets').children[1].children).toHaveLength(4);
      expect(action(panel,'report-server-call').hidden).toBe(true);
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

  it('shows supplied stale words and all last-good lines without presenting them as a new posting',()=>{
    const panel=createBulletinScreen({onRetry:vi.fn()}),view=supplied();panel.setActive(true);
    const message='This is the last posted bulletin. Please try again.';
    panel.update({bulletin:{...view,stale:true,message}});
    expect(part(panel,'bulletin-status').textContent).toBe(message);
    expect(part(panel,'bulletin-lines').children.map(item=>[item.dataset.kind,item.textContent]))
      .toEqual(view.lines.map(item=>[item.kind,item.text]));
    expect(part(panel,'bulletin-day').hidden).toBe(false);expect(part(panel,'bulletin-resets').hidden).toBe(false);
    expect(action(panel,'retry-server-call').hidden).toBe(false);expect(action(panel,'retry-server-call').disabled).toBe(false);
    const first=part(panel,'bulletin-lines').children[0];panel.tick();expect(part(panel,'bulletin-lines').children[0]).toBe(first);
    panel.update({...view,stale:true});expect(part(panel,'bulletin-status').textContent).toContain('last posted bulletin');
    panel.update({...view,message:'Posted by the harbor.'});expect(part(panel,'bulletin-status').textContent).toBe('Posted by the harbor.');
    expect(action(panel,'retry-server-call').hidden).toBe(true);panel.dispose();
  });

  it('runs one injected retry, shares its pending promise and displays only supplied recovery data',async()=>{
    const held=deferred(),onRetry=vi.fn(()=>held.promise),panel=createBulletinScreen({onRetry});
    panel.update({status:'unavailable',message:'The latest bulletin is unavailable.'});
    const retry=action(panel,'retry-server-call'),retained=retry.onclick;
    expect(retry.disabled).toBe(true);await retained({});expect(onRetry).not.toHaveBeenCalled();
    panel.setActive(true);const first=retained({}),second=retained({});expect(second).toBe(first);
    expect(retry.disabled).toBe(true);await Promise.resolve();expect(onRetry).toHaveBeenCalledOnce();
    const view=supplied();panel.update({bulletin:view});held.resolve({ok:true,bulletin:view});await first;
    expect(onRetry).toHaveBeenCalledOnce();expect(part(panel,'bulletin-status').textContent).toBe('Posted');
    expect(part(panel,'bulletin-lines').children.map(item=>item.textContent)).toEqual(view.lines.map(item=>item.text));
    expect(retry.hidden).toBe(true);expect(part(panel,'bulletin-retry-status').hidden).toBe(true);panel.dispose();
  });

  it.each(['reply','throw'])('keeps stale lines and uses fixed words after a failed retry (%s)',async kind=>{
    const secret=`fixture-${crypto.randomUUID()}`,onRetry=vi.fn(()=>kind==='throw'
      ?Promise.reject(new Error(secret)):Promise.resolve({ok:false,message:secret}));
    const panel=createBulletinScreen({onRetry}),view={...supplied(),stale:true,message:'Last posted bulletin.'};
    panel.update(view);panel.setActive(true);await action(panel,'retry-server-call').click();
    expect(part(panel,'bulletin-status').textContent).toBe(view.message);
    expect(part(panel,'bulletin-lines').children.map(item=>item.textContent)).toEqual(view.lines.map(item=>item.text));
    expect(part(panel,'bulletin-retry-status').textContent).toBe('The harbor bulletin is unavailable right now. Try again.');
    expect(part(panel,'bulletin-retry-status').textContent).not.toContain(secret);
    panel.update(view);expect(part(panel,'bulletin-retry-status').hidden).toBe(false);
    expect(action(panel,'retry-server-call').disabled).toBe(false);expect(onRetry).toHaveBeenCalledOnce();panel.dispose();
  });

  it('does not start a queued read after close, and a later open still requires an explicit retry',async()=>{
    const onRetry=vi.fn(async()=>({ok:false})),panel=createBulletinScreen({onRetry});
    panel.update({status:'unavailable'});panel.setActive(true);
    const retry=action(panel,'retry-server-call'),pending=retry.onclick({});panel.close();
    expect(await pending).toBe(false);expect(onRetry).not.toHaveBeenCalled();expect(retry.disabled).toBe(true);
    panel.setActive(true);expect(onRetry).not.toHaveBeenCalled();await retry.click();expect(onRetry).toHaveBeenCalledOnce();panel.dispose();
  });

  it('keeps one in-flight read across close/reopen and ignores late feedback after close or final disposal',async()=>{
    const held=deferred(),onRetry=vi.fn(()=>held.promise),onClose=vi.fn(),panel=createBulletinScreen({onRetry,onClose});
    panel.update({status:'unavailable'});panel.setActive(true);
    const retry=action(panel,'retry-server-call'),retained=retry.onclick,pending=retained({});
    await Promise.resolve();expect(onRetry).toHaveBeenCalledOnce();panel.close();
    expect(onClose).not.toHaveBeenCalled();await retained({});expect(onRetry).toHaveBeenCalledOnce();
    panel.setActive(true);expect(retry.disabled).toBe(true);expect(retained({})).toBe(pending);panel.close();
    held.reject(new Error(`fixture-${crypto.randomUUID()}`));expect(await pending).toBe(false);
    expect(retry.disabled).toBe(true);expect(part(panel,'bulletin-retry-status').hidden).toBe(true);
    panel.dispose();panel.dispose();expect(onClose).toHaveBeenCalledOnce();expect(panel.element.removed).toBe(true);
    await retained({});panel.setActive(true);expect(onRetry).toHaveBeenCalledOnce();
  });

  it('fences a held retry result at disposal without changing the last rendered nodes',async()=>{
    const held=deferred(),onRetry=vi.fn(()=>held.promise),panel=createBulletinScreen({onRetry});
    const view={...supplied(),stale:true};panel.update(view);panel.setActive(true);
    const first=part(panel,'bulletin-lines').children[0],status=part(panel,'bulletin-status').textContent;
    const pending=action(panel,'retry-server-call').click();await Promise.resolve();panel.dispose();
    held.resolve({ok:false,message:`fixture-${crypto.randomUUID()}`});expect(await pending).toBe(false);
    panel.update({status:'off'});panel.tick();panel.setActive(true);
    expect(part(panel,'bulletin-lines').children[0]).toBe(first);expect(part(panel,'bulletin-status').textContent).toBe(status);
    expect(part(panel,'bulletin-retry-status').hidden).toBe(true);expect(onRetry).toHaveBeenCalledOnce();
  });

  it('keeps retained announcement and timer callbacks quiet while inactive, closed, off or disposed',()=>{
    vi.useFakeTimers();const timer=vi.spyOn(globalThis,'setTimeout'),panel=createBulletinScreen(),hooked=supplied('hook');
    panel.update(hooked);const announce=action(panel,'hook-announcements'),retained=announce.listeners.click,live=part(panel,'bulletin-hook-status');
    retained({});expect(live.textContent).toBe('');expect(vi.getTimerCount()).toBe(0);
    panel.setActive(true);retained({});expect(live.textContent).toBe('Short flash, 1 of 3.');
    const oldTimer=timer.mock.calls.at(-1)[0];expect(vi.getTimerCount()).toBe(1);panel.close();
    oldTimer();retained({});vi.advanceTimersByTime(60000);
    expect(live.textContent).toBe('Flash announcements stopped.');expect(vi.getTimerCount()).toBe(0);
    panel.setActive(true);expect(live.textContent).toBe('Flash announcements stopped.');expect(vi.getTimerCount()).toBe(0);
    retained({});oldTimer();retained({});expect(live.textContent).toBe('Flash announcements stopped.');expect(vi.getTimerCount()).toBe(0);
    panel.update({status:'off'});retained({});oldTimer();expect(live.textContent).toBe('');expect(part(panel,'bulletin-hook').hidden).toBe(true);
    panel.update(hooked);expect(part(panel,'bulletin-hook').children[0].textContent).toBe(hooked.chapterTwoHook.notice.title);
    panel.update({status:'unavailable'});retained({});expect(live.textContent).toBe('');expect(announce.disabled).toBe(true);
    panel.update(hooked);expect(part(panel,'bulletin-hook').children[1].textContent).toBe(hooked.chapterTwoHook.notice.text);
    panel.dispose();retained({});oldTimer();panel.update(hooked);panel.tick();expect(live.textContent).toBe('');expect(vi.getTimerCount()).toBe(0);
  });
});


describe('published public bulletin request presentation',()=>{
  it.each([
    [0,'offline','offline'],[401,'internal_error','error'],[409,'internal_error','error'],
    [429,'rate_limited','rate_limited'],[502,'internal_error','error'],[503,'not_connected','error'],
  ])('uses the published reason for HTTP %s without changing public reads into private authentication',async(status,reason,phase)=>{
    const onRetry=vi.fn(async()=>({ok:false})),panel=createBulletinScreen({onRetry,now:()=>1000});
    const request={status,reason,message:'Recorded safe public read message.',...(status===429?{retryUntil:4000}:{})};
    panel.setActive(true);panel.update({status:'unavailable',request});
    expect(part(panel,'server-call').dataset.state).toBe(phase);
    expect(action(panel,'report-server-call').hidden).toBe(false);
    expect(action(panel,'sign-in-server-call').hidden).toBe(true);
    if(status===429){
      expect(action(panel,'retry-server-call').disabled).toBe(true);
      await action(panel,'retry-server-call').onclick();expect(onRetry).not.toHaveBeenCalled();
    }else expect(action(panel,'retry-server-call').disabled).toBe(false);
    panel.dispose();
  });

  it('keeps the original fractional 429 deadline through repeated publications, close and reopen',async()=>{
    let now=1000.25;const onRetry=vi.fn(async()=>({ok:false}));
    const panel=createBulletinScreen({onRetry,now:()=>now});
    const bulletin={status:'unavailable',request:{reason:'rate_limited',status:429,retryUntil:3000.25,message:'Recorded rate limit.'}};
    panel.update(bulletin);panel.setActive(true);const retry=action(panel,'retry-server-call'),retained=retry.onclick;
    expect(part(panel,'bulletin-retry-status').textContent).toContain('2 s.');
    now=1500.5;panel.close();panel.update(structuredClone(bulletin));panel.setActive(true);
    expect(part(panel,'bulletin-retry-status').textContent).toContain('2 s.');
    await retained();expect(onRetry).not.toHaveBeenCalled();
    now=3000.24;panel.update(structuredClone(bulletin));await retained();expect(onRetry).not.toHaveBeenCalled();
    now=3000.25;panel.update(structuredClone(bulletin));expect(retry.disabled).toBe(false);
    expect(onRetry).not.toHaveBeenCalled();await retained();expect(onRetry).toHaveBeenCalledOnce();
    panel.close();await retained();panel.dispose();await retained();expect(onRetry).toHaveBeenCalledOnce();
  });

  it('hides a published feature-off request and fences retained retry callbacks',async()=>{
    const onRetry=vi.fn(),panel=createBulletinScreen({onRetry});panel.setActive(true);
    panel.update({status:'unavailable',request:{reason:'internal_error',status:502,message:'Recorded public error.'}});
    const retained=action(panel,'retry-server-call').onclick;
    panel.update({status:'off',request:{reason:'feature_off',status:404,message:'Recorded feature off.'}});
    expect(panel.element.hidden).toBe(true);expect(part(panel,'server-call').hidden).toBe(true);
    await retained();expect(onRetry).not.toHaveBeenCalled();panel.dispose();
  });
});
