// Fake time and the actual transport/read monitor verify cadence without a browser, service or credential.
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createSession} from '../src/online/session.js';
import {createAdapterStore} from '../src/online/case-adapter/store.js';
import {createAdapterTransport} from '../src/online/case-adapter/transport.js';
import {createReadMonitor} from '../src/online/case-adapter/read-monitor.js';
import {createCrewPolling} from '../src/online/case-adapter/crew-polling.js';

function surface(extra={}){
  const listeners=new Map();return {...extra,listeners,
    addEventListener(name,listener){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(listener);},
    removeEventListener(name,listener){listeners.get(name)?.delete(listener);},
    emit(name){for(const listener of [...listeners.get(name)??[]])listener();},
  };
}
const okay=crew=>({ok:true,status:200,data:{crew}});
const fail=status=>({ok:false,status,code:status===503?'database_unavailable':status===429?'too_many_requests':'network_error'});
const crew=()=>({id:'private-recorded-crew',code:'RECORDED',status:'forming',mode:'solo',mySeat:1,startedAt:null,
  seats:[{seatNo:1,holder:'player',name:'Placeholder captain',kit:'stranger',isMe:true},
    ...[2,3,4].map(seatNo=>({seatNo,holder:'open',name:null,kit:null,isMe:false}))]});
const active=[];
function setup({visible=true,defaultVisibility=false}={}){
  const document=surface({hidden:false,documentElement:{}}),queries=[],observers=[];
  let shown=visible,covered=false,attached=true,ancestorHidden=false,cssVisibility='visible',poll;
  const screen={isConnected:true,getClientRects:()=>shown?[{}]:[],closest:()=>ancestorHidden?{}:null};
  document.querySelector=selector=>{
    queries.push(selector);
    if(selector==='.account-modal[open]')return covered?{}:null;
    if(selector==='.case-modal[open] .case-crew')return attached?screen:null;
    return null;
  };
  const window=surface({getComputedStyle:()=>({display:'block',visibility:cssVisibility}),
    MutationObserver:class{
      constructor(callback){this.callback=callback;this.observe=vi.fn();this.disconnect=vi.fn();observers.push(this);}
    }});
  const session=createSession();session.setToken(Math.random().toString(36));
  const store=createAdapterStore({session});store.commit({crew:crew()});
  const replies=[],api={get:vi.fn(async()=>{
    const reply=replies.shift();return typeof reply==='function'?reply():reply??okay(structuredClone(store.state.crew));
  }),post:vi.fn(),del:vi.fn()};
  const ctx={store,state:store.state,session,api,publicApi:api,document,window,now:Date.now,random:()=>.5,
    refuse:reason=>({accepted:false,reason,message:'Placeholder refusal.'})};
  ctx.readMonitor=createReadMonitor(ctx);ctx.transport=createAdapterTransport(ctx);
  ctx.retryRead=async kind=>{
    const scope=store.scope(),result=await ctx.transport.read(kind,{automatic:true});
    if(kind==='crew'&&store.isCurrent(scope))poll.refresh({result,scope});
    return result;
  };
  const setTimer=vi.fn((run,ms)=>setTimeout(run,ms)),clearTimer=vi.fn(id=>clearTimeout(id));
  poll=createCrewPolling(ctx,{...(defaultVisibility?{}:{isVisible:()=>shown&&!covered}),setTimer,clearTimer});
  const fixture={poll,ctx,store,session,document,window,api,replies,queries,observers,setTimer,clearTimer,
    show(value){shown=value;},cover(value){covered=value;},attach(value){attached=value;},
    hideAncestor(value){ancestorHidden=value;},cssVisibility(value){cssVisibility=value;},
    mutate(records=[{type:'attributes',target:{matches:()=>true}}]){for(const observer of observers)observer.callback(records);},
    async externalRead({automatic=false}={}){
      const scope=store.scope(),result=await ctx.transport.read('crew',{automatic});
      poll.refresh({result,scope});return result;
    },
    dispose(){poll.dispose();ctx.readMonitor.dispose();store.dispose();},
  };
  active.push(fixture);return fixture;
}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(0);});
afterEach(()=>{for(const fixture of active.splice(0))fixture.dispose();vi.useRealTimers();});

describe('forming crew cadence and presentation gates',()=>{
  it('reads the actual crew route every five healthy visible seconds and never sends a write',async()=>{
    const f=setup();f.poll.refresh();
    await vi.advanceTimersByTimeAsync(4999);expect(f.api.get).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);expect(f.api.get).toHaveBeenCalledExactlyOnceWith('/api/crews/me');
    await vi.advanceTimersByTimeAsync(5000);expect(f.api.get).toHaveBeenCalledTimes(2);
    expect(f.api.post).not.toHaveBeenCalled();expect(f.api.del).not.toHaveBeenCalled();
  });
  it('uses the real case-crew selector and rejects covered, detached, CSS-hidden and ancestor-hidden views',async()=>{
    const f=setup({defaultVisibility:true});
    f.cover(true);f.poll.refresh();await vi.advanceTimersByTimeAsync(5000);expect(f.api.get).not.toHaveBeenCalled();
    f.cover(false);f.attach(false);f.mutate();await vi.advanceTimersByTimeAsync(5000);expect(f.api.get).not.toHaveBeenCalled();
    f.attach(true);f.hideAncestor(true);f.mutate();await vi.advanceTimersByTimeAsync(5000);expect(f.api.get).not.toHaveBeenCalled();
    f.hideAncestor(false);f.cssVisibility('hidden');f.mutate();await vi.advanceTimersByTimeAsync(5000);expect(f.api.get).not.toHaveBeenCalled();
    f.cssVisibility('visible');f.mutate();await vi.advanceTimersByTimeAsync(0);
    expect(f.api.get).toHaveBeenCalledExactlyOnceWith('/api/crews/me');
    expect(f.queries).toContain('.case-modal[open] .case-crew');
    expect(f.observers[0].observe).toHaveBeenCalledWith(f.document.documentElement,
      {subtree:true,childList:true,attributes:true,attributeFilter:['open','hidden']});
  });
  it('stops cadence when the screen closes or Account covers it, and reads once on an overdue show',async()=>{
    const f=setup();f.poll.refresh();await vi.advanceTimersByTimeAsync(5000);
    f.show(false);f.mutate();await vi.advanceTimersByTimeAsync(60000);expect(f.api.get).toHaveBeenCalledOnce();
    f.show(true);f.mutate();await vi.advanceTimersByTimeAsync(0);expect(f.api.get).toHaveBeenCalledTimes(2);
    f.cover(true);f.mutate();await vi.advanceTimersByTimeAsync(60000);expect(f.api.get).toHaveBeenCalledTimes(2);
    f.cover(false);f.mutate();await vi.advanceTimersByTimeAsync(0);expect(f.api.get).toHaveBeenCalledTimes(3);
  });
  it('pauses in a hidden tab and resumes one overdue read without focus storms',async()=>{
    const f=setup();f.poll.refresh();await vi.advanceTimersByTimeAsync(2000);
    f.document.hidden=true;f.document.emit('visibilitychange');await vi.advanceTimersByTimeAsync(60000);
    await f.poll.nudge({force:true});expect(f.api.get).not.toHaveBeenCalled();
    f.document.hidden=false;f.document.emit('visibilitychange');f.window.emit('focus');f.window.emit('focus');
    await vi.advanceTimersByTimeAsync(0);expect(f.api.get).toHaveBeenCalledOnce();
    f.window.emit('focus');await vi.advanceTimersByTimeAsync(4999);expect(f.api.get).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);expect(f.api.get).toHaveBeenCalledTimes(2);
  });
  it.each(['active','finished',null])('does not run the cadence for crew status %s',async status=>{
    const f=setup();f.store.commit({crew:status?{...crew(),status}:null});f.poll.refresh();
    await vi.advanceTimersByTimeAsync(60000);await f.poll.nudge();expect(f.api.get).not.toHaveBeenCalled();
  });
  it('does not turn unrelated DOM text updates into reads or repeated scheduling',async()=>{
    const f=setup();f.poll.refresh();const timerCalls=f.setTimer.mock.calls.length;
    for(let count=0;count<20;count++)f.mutate([{type:'childList',addedNodes:[{nodeType:3}],removedNodes:[]}]);
    expect(f.setTimer).toHaveBeenCalledTimes(timerCalls);expect(f.api.get).not.toHaveBeenCalled();
  });
  it('ignores repeated unrelated HUD hidden attributes without querying visibility or touching timers',()=>{
    const f=setup({defaultVisibility:true});f.poll.refresh();
    const queries=f.queries.length,scheduled=f.setTimer.mock.calls.length,cleared=f.clearTimer.mock.calls.length;
    const hud={matches:vi.fn(()=>false)};
    for(let frame=0;frame<120;frame++)f.mutate([{type:'attributes',attributeName:'hidden',target:hud}]);
    expect(hud.matches).toHaveBeenCalledWith('.case-modal,.account-modal,.case-crew');
    expect(f.queries).toHaveLength(queries);expect(f.setTimer).toHaveBeenCalledTimes(scheduled);
    expect(f.clearTimer).toHaveBeenCalledTimes(cleared);expect(f.api.get).not.toHaveBeenCalled();
  });
});

describe('authoritative nudges, inflight sharing and identity boundaries',()=>{
  it('allows push/membership reads with Crew closed or finished, while ordinary nudges stay gated',async()=>{
    const f=setup({visible:false});f.store.commit({crew:{...crew(),status:'finished'}});f.cover(true);
    await f.poll.nudge();expect(f.api.get).not.toHaveBeenCalled();
    await f.poll.nudge({force:'true'});expect(f.api.get).not.toHaveBeenCalled();
    await f.poll.nudge({force:true});expect(f.api.get).toHaveBeenCalledExactlyOnceWith('/api/crews/me');
    await vi.advanceTimersByTimeAsync(60000);expect(f.api.get).toHaveBeenCalledOnce();
  });
  it('shares ordinary nudges but starts a fresh forced read ahead of an older held GET',async()=>{
    const f=setup();let finish;
    f.replies.push(()=>new Promise(resolve=>{finish=resolve;}),okay({...crew(),status:'active'}));
    const external=f.ctx.transport.read('crew'),first=f.poll.nudge(),ordinary=f.poll.nudge();
    expect(first).toBe(ordinary);await Promise.resolve();expect(f.api.get).toHaveBeenCalledOnce();
    const forced=f.poll.nudge({force:true});expect(forced).not.toBe(first);await forced;
    expect(f.api.get).toHaveBeenCalledTimes(2);expect(f.store.read().crew.status).toBe('active');
    finish(okay(crew()));expect((await external).stale).toBe(true);expect((await first).stale).toBe(true);
    await vi.advanceTimersByTimeAsync(6000);expect(f.api.get).toHaveBeenCalledTimes(2);
    expect(f.store.read().crew.status).toBe('active');
  });
  it('rechecks hidden/signout admission before a queued microtask can start a private GET',async()=>{
    const f=setup(),pending=f.poll.nudge({force:true});
    f.document.hidden=true;f.document.emit('visibilitychange');await pending;expect(f.api.get).not.toHaveBeenCalled();
    f.document.hidden=false;const signedOut=f.poll.nudge({force:true});f.session.clearToken();await signedOut;
    expect(f.api.get).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(60000);expect(f.api.get).not.toHaveBeenCalled();
  });
  it('ignores an old private response after signout and never re-arms the old identity',async()=>{
    const f=setup();let finish;
    f.replies.push(()=>new Promise(resolve=>{finish=resolve;}));
    const pending=f.poll.nudge({force:true});await Promise.resolve();expect(f.api.get).toHaveBeenCalledOnce();
    f.store.invalidate();f.session.clearToken();f.ctx.readMonitor.reset();f.store.commit({accountState:'signed_out',crew:null});f.poll.refresh();
    finish(okay(crew()));await pending;await vi.advanceTimersByTimeAsync(60000);
    expect(f.store.state.crew).toBeNull();expect(f.api.get).toHaveBeenCalledOnce();
  });
  it('does not let an older identity completion or scoped success release a current failed read',async()=>{
    const f=setup(),oldScope=f.store.scope();let finish;
    f.replies.push(()=>new Promise(resolve=>{finish=resolve;}));
    const old=f.poll.nudge();await Promise.resolve();
    f.store.invalidate();f.ctx.readMonitor.reset();f.store.commit({crew:crew()});f.poll.refresh();
    f.replies.push(fail(429));await f.poll.nudge({force:true});
    f.poll.refresh({result:{mapped:{accepted:true}},scope:oldScope});
    finish(okay(crew()));await old;
    await vi.advanceTimersByTimeAsync(60000);f.window.emit('focus');await f.poll.nudge();
    expect(f.api.get).toHaveBeenCalledTimes(2);
  });
});

describe('read monitor remains the only failed-read retry owner',()=>{
  it.each([0,503])('keeps status %s at the existing 5/15/30 retry budget, then waits for manual recovery',async status=>{
    const f=setup();f.replies.push(...Array.from({length:4},()=>fail(status)));f.poll.refresh();
    await vi.advanceTimersByTimeAsync(5000);expect(f.api.get).toHaveBeenCalledOnce();
    f.window.emit('focus');await f.poll.nudge();expect(f.api.get).toHaveBeenCalledOnce();
    for(const [index,delay] of [5000,15000,30000].entries()){
      await vi.advanceTimersByTimeAsync(delay-1);expect(f.api.get).toHaveBeenCalledTimes(index+1);
      await vi.advanceTimersByTimeAsync(1);expect(f.api.get).toHaveBeenCalledTimes(index+2);
    }
    await vi.advanceTimersByTimeAsync(300000);await f.poll.nudge();expect(f.api.get).toHaveBeenCalledTimes(4);
    f.replies.push(okay(crew()));await f.ctx.readMonitor.retryFailed();expect(f.api.get).toHaveBeenCalledTimes(5);
    await vi.advanceTimersByTimeAsync(5000);expect(f.api.get).toHaveBeenCalledTimes(6);
  });
  it('preserves initial own-crew hydration and read recovery while Crew is closed',async()=>{
    const f=setup({visible:false});f.replies.push(fail(503),okay(crew()));
    await f.externalRead();expect(f.api.get).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(4999);expect(f.api.get).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);expect(f.api.get).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60000);expect(f.api.get).toHaveBeenCalledTimes(2);
  });
  it('halts regular cadence on a non-retrying refusal; a real push can reread and restore healthy cadence',async()=>{
    const f=setup();f.replies.push(fail(429));f.poll.refresh();await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(300000);f.window.emit('focus');await f.poll.nudge();expect(f.api.get).toHaveBeenCalledOnce();
    await f.poll.nudge({force:true});expect(f.api.get).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5000);expect(f.api.get).toHaveBeenCalledTimes(3);
  });
  it('accepts only a supplied current-scope external result before resuming the regular cadence',async()=>{
    const f=setup(),scope=f.store.scope();f.replies.push(fail(429));await f.externalRead();
    f.poll.refresh({result:{mapped:{accepted:true}}});await vi.advanceTimersByTimeAsync(60000);expect(f.api.get).toHaveBeenCalledOnce();
    f.poll.refresh({result:{mapped:{accepted:true}},scope});
    await vi.advanceTimersByTimeAsync(4999);expect(f.api.get).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);expect(f.api.get).toHaveBeenCalledTimes(2);
  });
});

describe('cleanup',()=>{
  it('cancels the timer and every owned subscription, observer and late completion on disposal',async()=>{
    const f=setup();f.poll.refresh();expect(f.setTimer).toHaveBeenCalledOnce();
    let finish;f.replies.push(()=>new Promise(resolve=>{finish=resolve;}));const pending=f.poll.nudge();await Promise.resolve();
    f.poll.dispose();f.poll.dispose();finish(okay(crew()));await pending;
    f.document.emit('visibilitychange');f.window.emit('focus');f.mutate();await f.poll.nudge({force:true});
    f.ctx.readMonitor.dispose();await vi.advanceTimersByTimeAsync(60000);
    expect(f.api.get).toHaveBeenCalledOnce();expect(f.observers[0].disconnect).toHaveBeenCalledOnce();
    expect(f.document.listeners.get('visibilitychange').size).toBe(0);expect(f.window.listeners.get('focus').size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);expect(f.clearTimer).toHaveBeenCalled();
  });
});
