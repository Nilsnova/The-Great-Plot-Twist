// Real shared call UI with injected market owners, fake time and a minimal DOM; no browser or service.
import {randomUUID} from 'node:crypto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('../../src/diagnostics/report-link.js',()=>({createProblemLink:()=>{const a=document.createElement('a');a.textContent='Report a problem';return a;}}));
import {createMarketCalls} from '../../src/screens/market/request-state.js';
import {safeMarketAdapter} from '../../src/screens/market/call-results.js';
import {createTrades} from '../../src/screens/market/trades.js';
import {createMarketSession} from '../../src/screens/market/session.js';
import {createFakeMarketAdapter} from '../../src/screens/market/fake.js';
class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.dataset={};this.hidden=false;this.disabled=false;this.isConnected=true;this.value='';}
  append(...children){for(const child of children){this.children.push(child);child.parentElement=this;}}
  setAttribute(name,value){this.attributes[name]=String(value);}removeAttribute(name){delete this.attributes[name];}
  set textContent(value){this.value=String(value);}get textContent(){return this.value;}
  closest(){return this.dialog??this.parentElement?.closest()??null;}
  querySelector(selector){return find(this,node=>selector==='[data-focus="retry-server-call"]'&&node.dataset.focus==='retry-server-call');}
  remove(){this.isConnected=false;}focus(){document.activeElement=this;}
}
const find=(root,predicate)=>predicate(root)?root:root.children.map(child=>find(child,predicate)).find(Boolean);
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
async function settle(){for(let step=0;step<50;step++)await Promise.resolve();}
const fixtures=[],intent={companyId:'harbor-trust',side:'rising',stake:100};
async function setup(){
  const fake=createFakeMarketAdapter(),adapter={board:vi.fn(fake.board),portfolio:vi.fn(fake.portfolio),open:vi.fn(fake.open),close:vi.fn(fake.close)};
  const safe=safeMarketAdapter(adapter),session=createMarketSession({adapter:safe}),trades=createTrades({adapter:safe,session,now:()=>Date.now(),makeUid:()=>`fixture_${randomUUID()}`});
  await session.refreshAll();let active=true;
  const message=document.createElement('p');message.tabIndex=-1;
  const onSignIn=vi.fn(),onChange=vi.fn(),onResult=vi.fn();
  const calls=createMarketCalls({session,trades,messageElement:message,isActive:()=>active,onSignIn,onChange,onResult,now:()=>Date.now()});
  calls.element.dialog={open:true};
  const f={adapter,session,trades,calls,message,onSignIn,onChange,onResult,
    close(){active=false;calls.element.dialog.open=false;calls.cancel();},
    reopen(){active=true;calls.element.dialog.open=true;calls.resume();},
    get retry(){return find(calls.element,node=>node.dataset.focus==='retry-server-call');},
    get report(){return find(calls.element,node=>node.tagName==='a');},
  };fixtures.push(f);return f;
}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(0);vi.stubGlobal('document',{createElement:tag=>new Element(tag),activeElement:null});});
afterEach(()=>{for(const f of fixtures.splice(0)){f.calls.dispose();f.session.dispose();f.trades.resetPrivate();}expect(vi.getTimerCount()).toBe(0);vi.useRealTimers();vi.unstubAllGlobals();});
describe('Market common call presentation',()=>{
  it('uses genuine delayed300ms/slow5s read UI and explicit read-only Retry',async()=>{
    const f=await setup(),held=deferred();f.adapter.board.mockReturnValueOnce(held.promise);
    const pending=f.calls.read('refreshBoard');expect(f.calls.element.hidden).toBe(true);
    await vi.advanceTimersByTimeAsync(299);expect(f.calls.element.hidden).toBe(true);
    await vi.advanceTimersByTimeAsync(1);expect(f.calls.element.dataset.state).toBe('loading');
    await vi.advanceTimersByTimeAsync(4700);expect(f.calls.element.dataset.state).toBe('slow');expect(f.report.hidden).toBe(false);
    held.resolve({ok:false,status:503,code:'market_unavailable',message:randomUUID(),data:{private:randomUUID()}});await pending;
    expect(f.calls.element.dataset.state).toBe('error');expect(f.message.textContent).toBe('Service unavailable. Try again in a moment.');
    f.retry.onclick();await settle();expect(f.adapter.board).toHaveBeenCalledTimes(3);expect(f.adapter.open).not.toHaveBeenCalled();
  });
  it.each([[0,'outcome_unknown','offline'],[401,'unauthorized','expired'],[404,'feature_off','error'],[409,'stale_save','error'],
    [429,'too_many_requests','rate_limited'],[502,'outcome_unknown','error'],[503,'outcome_unknown','error']])('shows honest shared state for%s without server prose',async(status,code,phase)=>{
    const f=await setup(),privateText=randomUUID();f.adapter.open.mockResolvedValueOnce({ok:false,status,code,message:privateText,data:{secret:privateText},retryAfterSeconds:3});
    const result=await f.calls.run(()=>f.trades.open(intent));expect(result.status).toBe(status);
    expect(f.calls.element.dataset.state).toBe(phase);expect(f.message.textContent).not.toContain(privateText);
    expect(document.activeElement).toBe(f.message);expect(f.report.hidden).toBe(false);expect(f.adapter.open).toHaveBeenCalledOnce();
    if(status===401){find(f.calls.element,node=>node.dataset.focus==='sign-in-server-call').onclick();expect(f.onSignIn).toHaveBeenCalledOnce();}
    if(status===409)expect(f.message.textContent).toBe('The service could not complete this request. Please try again.');
  });
  it('keeps the exact trade429 deadline across fractional close/reopen with no forced activation or automatic write',async()=>{
    const f=await setup();f.adapter.open.mockResolvedValueOnce({ok:false,status:429,code:'too_many_requests',retryAfterSeconds:3});
    await f.calls.run(()=>f.trades.open(intent));expect(f.trades.pending).toBeNull();expect(f.calls.blocked).toBe(true);expect(f.retry.disabled).toBe(true);
    f.retry.onclick();expect(f.adapter.open).toHaveBeenCalledOnce();await vi.advanceTimersByTimeAsync(1500);
    f.close();expect(vi.getTimerCount()).toBe(0);f.reopen();expect(f.retry.disabled).toBe(true);
    await vi.advanceTimersByTimeAsync(1499);expect(f.calls.blocked).toBe(true);expect(f.adapter.open).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);expect(f.retry.disabled).toBe(false);expect(f.calls.blocked).toBe(false);expect(f.adapter.open).toHaveBeenCalledOnce();
    f.retry.onclick();await settle();expect(f.adapter.open).toHaveBeenCalledTimes(2);
  });
  it('does not restart an earlier read429 when an unrelated concurrent read completes later',async()=>{
    const f=await setup(),other=deferred();f.adapter.portfolio.mockReturnValueOnce(other.promise);
    const portfolio=f.calls.read('refreshPortfolio');f.adapter.board.mockResolvedValueOnce({ok:false,status:429,code:'too_many_requests',retryAfterSeconds:3});
    await f.calls.read('refreshBoard');await vi.advanceTimersByTimeAsync(1500);
    other.resolve(await createFakeMarketAdapter().portfolio());await portfolio;
    expect(f.calls.element.dataset.state).toBe('rate_limited');expect(f.retry.disabled).toBe(true);
    await vi.advanceTimersByTimeAsync(1499);expect(f.retry.disabled).toBe(true);
    await vi.advanceTimersByTimeAsync(1);expect(f.retry.disabled).toBe(false);expect(f.calls.blocked).toBe(false);expect(f.adapter.open).not.toHaveBeenCalled();
  });
  it('routes common Retry for an unknown trade through a fresh successful GET and the same held UID after ordinary close',async()=>{
    const f=await setup();f.adapter.open.mockResolvedValueOnce({ok:false,status:0,code:'outcome_unknown'}).mockResolvedValueOnce({ok:false,status:409,code:'already_applied'});
    const result=await f.calls.run(()=>f.trades.open(intent));await result.refreshed;
    const first=f.adapter.open.mock.calls[0],fresh=deferred();f.close();f.reopen();
    f.adapter.portfolio.mockReturnValueOnce(fresh.promise);f.retry.onclick();await settle();expect(f.adapter.open).toHaveBeenCalledOnce();
    fresh.resolve(await createFakeMarketAdapter().portfolio());await settle();
    expect(f.adapter.open).toHaveBeenCalledTimes(2);expect(f.adapter.open.mock.calls[1]).toEqual(first);
    expect(f.adapter.portfolio.mock.invocationCallOrder.some(order=>order>f.adapter.open.mock.invocationCallOrder[0]&&order<f.adapter.open.mock.invocationCallOrder[1])).toBe(true);
  });
  it('keeps Retry after failed Check again read-only while Retry trade still requires the same-UID barrier',async()=>{
    const f=await setup();f.adapter.open.mockResolvedValueOnce({ok:false,status:0,code:'outcome_unknown'});
    await (await f.calls.run(()=>f.trades.open(intent))).refreshed;
    f.adapter.portfolio.mockResolvedValueOnce({ok:false,status:503,code:'database_unavailable'});
    const checked=await f.calls.run(()=>f.trades.checkAgain(),{read:true,remember:false,retryKind:'check'});expect(checked.kind).toBe('unknown');
    expect(f.retry.textContent).toBe('Retry checking positions');f.retry.onclick();await settle();
    expect(f.adapter.open).toHaveBeenCalledOnce();expect(f.trades.pending).not.toBeNull();expect(f.onResult.mock.lastCall[0].kind).toBe('checked');
  });
  it('keeps the successful positions-check message visible while its uncertain trade still requires an explicit resend',async()=>{
    const f=await setup();f.adapter.open.mockResolvedValueOnce({ok:false,status:503,code:'outcome_unknown'});
    await (await f.calls.run(()=>f.trades.open(intent))).refreshed;const held=f.trades.pending;
    const result=await f.calls.run(()=>f.trades.checkAgain(),{read:true,remember:false,retryKind:'check'});
    expect(result.kind).toBe('checked');expect(f.trades.pending).toBe(held);
    expect(f.message.textContent).toBe('Updated your positions. If your trade is not listed, send it again, or forget it.');
    f.close();f.reopen();expect(f.message.textContent).toBe(result.message);
    expect(f.adapter.open).toHaveBeenCalledOnce();expect(f.trades.pending).toBe(held);
  });
  it.each([[401,'unauthorized'],[403,'forbidden'],[404,'no_such_position'],[409,'market_closed'],[422,'validation_error'],
    [429,'too_many_requests'],[502,'database_error'],[503,'market_unavailable']])('retains the original uncertain UID when an explicit resend receives%s',async(status,code)=>{
    const f=await setup();f.adapter.open.mockResolvedValueOnce({ok:false,status:0,code:'outcome_unknown'});
    await (await f.calls.run(()=>f.trades.open(intent))).refreshed;const held=f.trades.pending,first=f.adapter.open.mock.calls[0];
    f.adapter.open.mockResolvedValueOnce({ok:false,status,code,retryAfterSeconds:3});
    const result=await f.calls.run(()=>f.trades.sendAgain(),{read:true,remember:false,retryKind:'resend'});
    expect(result).toMatchObject({kind:'unknown',status,code});expect(f.trades.pending).toBe(held);expect(f.adapter.open.mock.calls[1]).toEqual(first);
    await result.refreshed;await vi.advanceTimersByTimeAsync(4000);expect(f.adapter.open).toHaveBeenCalledTimes(2);
    if(status===429){await f.calls.retry();expect(f.adapter.open).toHaveBeenCalledTimes(3);expect(f.adapter.open.mock.calls[2]).toEqual(first);expect(f.trades.pending).toBeNull();}
  });
  it('does not restore a refused old resend into a replacement account',async()=>{
    const f=await setup();f.adapter.open.mockResolvedValueOnce({ok:false,status:0,code:'outcome_unknown'});
    await (await f.calls.run(()=>f.trades.open(intent))).refreshed;
    const held=deferred();f.adapter.open.mockReturnValueOnce(held.promise);const sending=f.calls.run(()=>f.trades.sendAgain(),{read:true,remember:false,retryKind:'resend'});await settle();
    f.calls.reset();f.trades.resetPrivate();f.session.resetPrivate(false);held.resolve({ok:false,status:429,code:'too_many_requests',retryAfterSeconds:3});
    expect((await sending).kind).toBe('expired');expect(f.trades.pending).toBeNull();expect(f.calls.blocked).toBe(false);expect(f.calls.element.hidden).toBe(true);
  });
  it('keeps unknown UID on failed check/read retry and erases it only at identity/final cleanup',async()=>{
    const f=await setup();f.adapter.open.mockResolvedValueOnce({ok:false,status:503,code:'outcome_unknown'});
    await (await f.calls.run(()=>f.trades.open(intent))).refreshed;const held=f.trades.pending;
    f.adapter.portfolio.mockResolvedValueOnce({ok:false,status:503,code:'database_unavailable'});
    await f.calls.retry();expect(f.adapter.open).toHaveBeenCalledOnce();expect(f.trades.pending).toBe(held);
    f.calls.reset();f.trades.resetPrivate();f.session.resetPrivate(false);expect(f.trades.pending).toBeNull();
    f.retry.onclick();await settle();expect(f.adapter.open).toHaveBeenCalledOnce();
    f.calls.dispose();expect(vi.getTimerCount()).toBe(0);
  });
});
