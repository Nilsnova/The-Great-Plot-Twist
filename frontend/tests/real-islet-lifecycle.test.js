// Injected L2 engine/API coverage: no SDK, browser, credential or service is contacted.
import {randomUUID} from 'node:crypto';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {createSession} from '../src/online/session.js';
import {createAdapterStore} from '../src/online/adapter/store.js';
import {createIsletLifecycle} from '../src/online/adapter/islet-lifecycle.js';
import {createIsletAdapter} from '../src/screens/islet/adapter.js';
import {createFakeIsletTransport} from '../src/screens/islet/fake-transport.js';
import {disposeDiagnostics} from '../src/diagnostics/runtime.js';

const STATION = 'islet_signal_station';
const failed = (status,code='database_unavailable',extra={}) => ({ok:false,status,code,...extra});
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
async function settle(){for(let step=0;step<20;step++)await Promise.resolve();}
const fixtures=[];
function setup({signedIn=true,demo=false}={}){
  const session=createSession();if(signedIn)session.setToken(`fixture-${randomUUID()}`);
  const store=createAdapterStore({session}),server=createFakeIsletTransport({now:()=>new Date(0)});
  store.commit({me:{id:randomUUID(),captainName:'Recorded captain',coins:1000,kit:'witness',place:'saltreach_harbor',crews:[]}});
  let time=0,isDemo=demo;
  const gets=[],posts=[],requests=[],engines=[];
  const api={
    get:vi.fn(async path=>{requests.push({method:'GET',path});const next=gets.shift();return next?next():server.get(path);}),
    post:vi.fn(async(path,body)=>{requests.push({method:'POST',path,body:structuredClone(body)});const next=posts.shift();return next?next(path,body):server.post(path,body);}),
  };
  const ctx={store,state:store.state,session,api,now:()=>time,
    accept:(message='')=>({accepted:true,reason:null,message}),
    refuse:reason=>({accepted:false,reason,message:`Refused: ${reason}`}),
    transport:{read:vi.fn(async()=>({mapped:{accepted:true}}))},
  };
  const module={createIsletAdapter(options){const adapter=createIsletAdapter({...options,makeUid:()=>`fixture_${randomUUID()}`});engines.push(adapter);return adapter;}};
  const loadIslet=vi.fn(async()=>module);
  const life=createIsletLifecycle(ctx,{loadIslet,isDemo:()=>isDemo});
  const f={ctx,life,session,store,server,api,loadIslet,module,engines,gets,posts,requests,
    setTime(value){time=value;},setDemo(value){isDemo=value;},
    nextIdentity(){session.clearToken();store.invalidate();life.reset();session.setToken(`fixture-${randomUUID()}`);store.invalidate();life.reset();},
    getCount:()=>requests.filter(r=>r.method==='GET').length,
    postCalls:()=>requests.filter(r=>r.method==='POST'),
  };
  fixtures.push(f);return f;
}
afterEach(()=>{for(const f of fixtures.splice(0))f.life.dispose();disposeDiagnostics();});

describe('factory-owned shared islet lifecycle',()=>{
  it('does not import or send while anonymous/demo, and offers no finale build intent',async()=>{
    for(const options of [{signedIn:false},{demo:true}]){
      const f=setup(options);expect(await f.life.getAdapter()).toBeNull();
      expect((await f.life.refresh()).accepted).toBe(false);
      expect(f.loadIslet).not.toHaveBeenCalled();expect(f.requests).toEqual([]);
    }
    expect(setup().life).not.toHaveProperty('buildLight');
  });

  it('returns one actual engine, shares overlapping reads and commits only cloned accepted GET views',async()=>{
    const f=setup(),[a,b]=await Promise.all([f.life.getAdapter(),f.life.getAdapter()]);
    expect(a).toBe(b);expect(a).toBe(f.engines[0]);expect(f.loadIslet).toHaveBeenCalledOnce();
    expect(f.store.state.isletSnapshot).toBeUndefined();
    const held=deferred();f.gets.push(()=>held.promise);
    const one=a.refresh(),two=f.life.refresh();await settle();expect(f.getCount()).toBe(1);
    a.subscribe(event=>{if(event.answered)event.view.coins=-123;});
    held.resolve(await f.server.get('/api/islet'));expect((await one).accepted).toBe(true);await two;
    expect(f.store.state.isletSnapshot).toMatchObject({coins:1000,timber:20,signalStationBuilt:false});
    const good=structuredClone(f.store.state.isletSnapshot);
    f.gets.push(()=>failed(503));expect((await a.refresh()).accepted).toBe(false);
    expect(f.store.state.isletSnapshot).toEqual(good);
    f.nextIdentity();await a.refresh();expect(f.store.state.isletSnapshot.coins).toBe(1000);
  });

  it('invalidates an unfinished import without creating an engine, then resets the same owned engine across identities',async()=>{
    const f=setup(),held=deferred();f.loadIslet.mockImplementationOnce(()=>held.promise);
    const old=f.life.getAdapter();await settle();f.nextIdentity();held.resolve(f.module);
    expect(await old).toBeNull();expect(f.engines).toHaveLength(0);
    const adapter=await f.life.getAdapter();await adapter.refresh();expect(f.store.state.isletSnapshot.coins).toBe(1000);
    f.nextIdentity();expect(f.store.state.isletSnapshot).toBeNull();expect(adapter.read().spots).toEqual([]);
    expect(await f.life.getAdapter()).toBe(adapter);expect(f.engines).toHaveLength(1);
    f.server.dev.setCoins(777);await adapter.refresh();expect(f.store.state.isletSnapshot.coins).toBe(777);
  });

  it('does not let an old refresh continuation start a read for the replacement account',async()=>{
    const f=setup();await f.life.getAdapter();
    const pending=f.life.refresh();f.nextIdentity();
    expect(await pending).toMatchObject({accepted:false,code:'session_expired'});
    expect(f.getCount()).toBe(0);expect(f.store.state.isletSnapshot).toBeNull();
    expect((await f.life.refresh()).accepted).toBe(true);expect(f.getCount()).toBe(1);
  });

  it('fences a late GET and POST at account boundaries, including the gap before the owner reset hook',async()=>{
    const f=setup(),adapter=await f.life.getAdapter(),read=deferred();f.gets.push(()=>read.promise);
    const pendingRead=adapter.refresh();await settle();const oldAnswer=await f.server.get('/api/islet');
    f.nextIdentity();read.resolve(oldAnswer);expect((await pendingRead).accepted).toBe(false);
    expect(f.store.state.isletSnapshot).toBeNull();expect(adapter.read().spots).toEqual([]);
    await adapter.refresh();const post=deferred();f.posts.push(()=>post.promise);
    const pendingBuild=adapter.build(STATION);await settle();expect(f.postCalls()).toHaveLength(1);
    const reads=f.getCount();f.store.invalidate(); // Root's synchronous reset has not run yet.
    post.resolve(failed(503));expect((await pendingBuild).accepted).toBe(false);
    expect(f.getCount()).toBe(reads);expect(f.store.state.isletSnapshot).toBeNull();
    expect(adapter.read().spots).toEqual([]);expect(f.ctx.transport.read).not.toHaveBeenCalled();
    await adapter.refresh();f.session.clearToken();
    expect((await adapter.build(STATION)).accepted).toBe(false);expect(f.postCalls()).toHaveLength(1);
  });

  it('waits for held account hydration before correcting a snapshot and skips a now-redundant me read',async()=>{
    const f=setup(),hydration=deferred();f.store.commit({me:null});
    f.ctx.waitForSetup=vi.fn(()=>hydration.promise);
    const adapter=await f.life.getAdapter();await adapter.refresh();await adapter.refresh();await settle();
    expect(f.ctx.waitForSetup).toHaveBeenCalledOnce();
    expect(f.ctx.transport.read).not.toHaveBeenCalled();
    f.store.commit({me:{coins:1000,captainName:'Hydrated captain',kit:'witness'}});hydration.resolve();await settle();
    expect(f.ctx.transport.read).not.toHaveBeenCalled();
    expect(f.store.read().captain.coins).toBe(1000);expect(f.store.state.isletSnapshot.coins).toBe(1000);
  });

  it('hands accepted fresh-me recovery back to failed initial hydration and does not read again',async()=>{
    const f=setup();f.store.commit({me:null});f.ctx.waitForSetup=vi.fn(async()=>{});
    f.ctx.transport.read.mockImplementationOnce(async()=>{
      f.store.commit({me:{coins:1000,captainName:'Recovered captain',kit:'witness'}});return {mapped:{accepted:true}};
    });
    f.ctx.onMeRefreshed=vi.fn(async()=>({setupHandled:true}));
    await f.life.refresh();await settle();
    expect(f.ctx.waitForSetup).toHaveBeenCalledOnce();expect(f.ctx.transport.read).toHaveBeenCalledExactlyOnceWith('me',{fresh:true});
    expect(f.ctx.onMeRefreshed).toHaveBeenCalledOnce();
    expect(f.store.read().captain.coins).toBe(1000);
  });

  it('fences wallet work across both the hydration barrier and accepted-me continuation',async()=>{
    const f=setup(),hydration=deferred();f.store.commit({me:null});f.ctx.waitForSetup=()=>hydration.promise;
    await f.life.refresh();await settle();f.nextIdentity();hydration.resolve();await settle();
    expect(f.ctx.transport.read).not.toHaveBeenCalled();
    const g=setup(),continuation=deferred();g.server.dev.setCoins(900);g.ctx.onMeRefreshed=vi.fn(()=>continuation.promise);
    await g.life.refresh();await settle();expect(g.ctx.onMeRefreshed).toHaveBeenCalledOnce();
    g.nextIdentity();continuation.resolve({setupHandled:false});await settle();
  });

  it('refreshes the authoritative captain/wallet after a direct panel build and shares the same balance attempt',async()=>{
    const f=setup(),adapter=await f.life.getAdapter();await adapter.refresh();
    const me=deferred();f.ctx.transport.read.mockImplementationOnce(async()=>{
      await me.promise;f.store.commit({me:{...f.store.state.me,coins:700}});return {mapped:{accepted:true}};
    });
    expect((await adapter.build(STATION)).accepted).toBe(true);await settle();
    expect(f.store.state.isletSnapshot.coins).toBe(700);
    expect(f.store.read().captain.coins).toBe(1000); // Only the authoritative me reply updates the HUD.
    expect(f.ctx.transport.read).toHaveBeenCalledExactlyOnceWith('me',{fresh:true});
    
    await adapter.refresh();expect(f.ctx.transport.read).toHaveBeenCalledOnce();
    me.resolve();await settle();
    expect(f.store.read()).toMatchObject({captain:{coins:700}});
    
    await adapter.refresh();await settle();expect(f.ctx.transport.read).toHaveBeenCalledOnce();
  });

  it('leaves failed wallet read recovery to its read owner for repeated same-coins answers',async()=>{
    const f=setup(),adapter=await f.life.getAdapter();await adapter.refresh();
    f.ctx.transport.read.mockRejectedValue(new Error('recorded me failure'));
    f.server.dev.setCoins(900);await adapter.refresh();await settle();
    expect(f.ctx.transport.read).toHaveBeenCalledOnce();
    expect(f.store.read().captain.coins).toBe(1000);
    await adapter.refresh();await adapter.refresh();await settle();
    expect(f.ctx.transport.read).toHaveBeenCalledOnce();
    f.server.dev.setCoins(800);await adapter.refresh();await settle();
    expect(f.ctx.transport.read).toHaveBeenCalledTimes(2);
  });

  it('starts a fresh manual GET after a newer internal readback while the older external GET is still held',async()=>{
    const f=setup(),adapter=await f.life.getAdapter();await adapter.refresh();
    const oldAnswer=await f.server.get('/api/islet'),held=deferred(),fresh=deferred(),before=f.getCount();
    f.gets.push(()=>held.promise);const old=adapter.refresh();await settle();expect(f.getCount()).toBe(before+1);
    try{
      expect((await adapter.build(STATION)).accepted).toBe(true);
      expect(f.getCount()).toBe(before+2);expect(f.store.state.isletSnapshot.signalStationBuilt).toBe(true);
      f.gets.push(()=>fresh.promise);const manual=adapter.refresh();
      await settle();expect(f.getCount()).toBe(before+3);
      const current=structuredClone(f.store.state.isletSnapshot);held.resolve(oldAnswer);
      expect(await old).toMatchObject({accepted:true,stale:true});expect(f.store.state.isletSnapshot).toEqual(current);
      const shared=adapter.refresh();expect(shared).toBe(manual);await settle();expect(f.getCount()).toBe(before+3);
      fresh.resolve(await f.server.get('/api/islet'));expect((await manual).accepted).toBe(true);await shared;
      expect(f.store.state.isletSnapshot).toMatchObject({signalStationBuilt:true,coins:700});
    }finally{held.resolve(oldAnswer);fresh.resolve(await f.server.get('/api/islet'));await settle();}
  });

  it('does not carry an old wallet task or attempted balance into the replacement account',async()=>{
    const f=setup(),adapter=await f.life.getAdapter();await adapter.refresh();
    const me=deferred();f.ctx.transport.read.mockImplementationOnce(()=>me.promise);
    expect((await adapter.build(STATION)).accepted).toBe(true);await settle();
    expect(f.ctx.transport.read).toHaveBeenCalledOnce();
    f.nextIdentity();f.server.dev.reset();await adapter.refresh();
    expect((await adapter.build(STATION)).accepted).toBe(true);await settle();
    expect(f.ctx.transport.read).toHaveBeenCalledTimes(2);
    me.resolve({mapped:{accepted:true}});await settle();
  });

  it('disposes once, drops pending imports/results and preserves an already closed factory store',async()=>{
    const f=setup(),adapter=await f.life.getAdapter();await adapter.refresh();
    const stopped=vi.spyOn(adapter,'dispose'),held=deferred();f.gets.push(()=>held.promise);
    const pending=adapter.refresh();await settle();const last=structuredClone(f.store.state.isletSnapshot),count=f.getCount();
    f.store.dispose();f.life.dispose();f.life.dispose();held.resolve(await f.server.get('/api/islet'));
    expect((await pending).accepted).toBe(false);expect(f.store.state.isletSnapshot).toEqual(last);
    expect(stopped).toHaveBeenCalledOnce();expect(await f.life.getAdapter()).toBeNull();expect(f.getCount()).toBe(count);
    const g=setup(),imported=deferred();g.loadIslet.mockImplementationOnce(()=>imported.promise);
    const loading=g.life.getAdapter();await settle();g.life.dispose();imported.resolve(g.module);
    expect(await loading).toBeNull();expect(g.engines).toEqual([]);expect(g.requests).toEqual([]);
  });
});
