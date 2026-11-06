// Minimal injected DOM checks timer/lifecycle behavior without a browser or network.
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('../src/diagnostics/report-link.js',()=>({createProblemLink:vi.fn(()=>{
  const link=document.createElement('a');link.textContent='Report a problem';return link;
})}));
import {createProblemLink} from '../src/diagnostics/report-link.js';
import {createServerCallState} from '../src/ui/kit/server-call-state.js';

class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.dataset={};this.hidden=false;this.disabled=false;this.isConnected=true;this.writes=0;this.value='';}
  append(...children){for(const child of children){this.children.push(child);child.parentElement=this;}}
  setAttribute(name,value){this.attributes[name]=String(value);}
  removeAttribute(name){delete this.attributes[name];}
  set textContent(value){this.value=value;this.writes++;}
  get textContent(){return this.value;}
  closest(){return this.dialog??this.parentElement?.closest()??null;}
  remove(){this.isConnected=false;}
  focus(){document.activeElement=this;}
}
const find=(root,predicate)=>predicate(root)?root:root.children.map(child=>find(child,predicate)).find(Boolean);
const active=[];
function create(options={}){const call=createServerCallState({now:()=>Date.now(),...options});active.push(call);return call;}
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(0);vi.clearAllMocks();
  vi.stubGlobal('document',{createElement:tag=>new Element(tag),activeElement:null});
});
afterEach(()=>{for(const call of active.splice(0))call.dispose();vi.useRealTimers();vi.unstubAllGlobals();});

describe('accessible server states',()=>{
  it('shows delayed loading and slow-read words, with a safe problem link by default',async()=>{
    const call=create();call.loading({read:true});
    expect(call.element.hidden).toBe(true);expect(call.element.dataset.state).toBe('pending');
    await vi.advanceTimersByTimeAsync(299);expect(call.element.hidden).toBe(true);
    await vi.advanceTimersByTimeAsync(1);expect(call.element.hidden).toBe(false);expect(call.element.dataset.state).toBe('loading');
    await vi.advanceTimersByTimeAsync(4700);expect(call.element.dataset.state).toBe('slow');
    expect(createProblemLink).toHaveBeenCalledWith();
    expect(find(call.element,node=>node.tagName==='a').hidden).toBe(false);
    call.succeed();expect(call.element.hidden).toBe(true);expect(vi.getTimerCount()).toBe(0);
  });
  it('announces the start and end of a countdown, not every second, and never retries by itself',async()=>{
    const onRetry=vi.fn(),onChange=vi.fn(),call=create({onRetry,onChange});
    const retry=find(call.element,node=>node.dataset.focus==='retry-server-call');
    const live=find(call.element,node=>node.className==='server-call-announcement');
    call.fail({reason:'rate_limited',retryAfterSeconds:3});
    const startWrites=live.writes;expect(live.textContent).toContain('3 s.');expect(retry.disabled).toBe(true);
    retry.onclick();expect(onRetry).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);expect(live.writes).toBe(startWrites);
    expect(call.read().remaining).toBe(1);expect(onRetry).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);expect(live.writes).toBe(startWrites+1);
    expect(live.textContent).toContain('try again now');expect(retry.disabled).toBe(false);
    expect(onRetry).not.toHaveBeenCalled();retry.onclick();expect(onRetry).toHaveBeenCalledOnce();
    expect(onChange.mock.lastCall[0]).toMatchObject({remaining:0,canRetry:true});
  });
  it('keeps focus in place while exposing explicit offline, back-online and sign-in actions',()=>{
    const onRetry=vi.fn(),onSignIn=vi.fn(),call=create({onRetry,onSignIn});
    const focus=new Element('button');focus.focus();call.setOnline(false);
    expect(document.activeElement).toBe(focus);expect(call.element.dataset.state).toBe('offline');
    call.setOnline(true);expect(call.element.dataset.state).toBe('online');expect(onRetry).not.toHaveBeenCalled();
    call.fail({reason:'session_expired'});
    const signIn=find(call.element,node=>node.dataset.focus==='sign-in-server-call');
    expect(signIn.hidden).toBe(false);expect(document.activeElement).toBe(focus);
    signIn.onclick();expect(onSignIn).toHaveBeenCalledOnce();
  });
  it('cancels pending timers on clear/disposal and stops a closed dialog countdown',async()=>{
    const call=create();call.loading({read:true});call.clear();expect(vi.getTimerCount()).toBe(0);
    call.fail({reason:'rate_limited',retryAfterSeconds:3});call.element.dialog={open:false};
    await vi.advanceTimersByTimeAsync(1000);expect(vi.getTimerCount()).toBe(0);
    call.loading({read:true});call.dispose();await vi.advanceTimersByTimeAsync(6000);
    expect(vi.getTimerCount()).toBe(0);expect(call.element.isConnected).toBe(false);
  });
});
