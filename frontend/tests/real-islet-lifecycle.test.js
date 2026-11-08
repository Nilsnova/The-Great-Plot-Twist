// Injected L2 engine/API coverage: no SDK, browser, credential or service is contacted.
import {randomUUID} from 'node:crypto';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {createSession} from '../src/online/session.js';
import {createAdapterStore} from '../src/online/case-adapter/store.js';
import {createIsletLifecycle} from '../src/online/case-adapter/islet-lifecycle.js';
import {createIsletAdapter} from '../src/screens/islet/adapter.js';
import {createFakeIsletTransport} from '../src/screens/islet/fake-transport.js';
import {sendCaseIntent} from '../src/adapter/intent.js';
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
    auth:{readOwnLedger:vi.fn(async()=>({ok:true,rows:[]}))},
    transport:{read:vi.fn(async()=>({mapped:{accepted:true}}))},
    refreshCase:vi.fn(async()=>{}),onIsletFailure:vi.fn(),
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
  it('does not import or send while anonymous/demo, and validates the one finale station before loading',async()=>{
    for(const options of [{signedIn:false},{demo:true}]){
      const f=setup(options);expect(await f.life.getAdapter()).toBeNull();
      expect((await f.life.buildLight(STATION)).accepted).toBe(false);
      expect(f.loadIslet).not.toHaveBeenCalled();expect(f.requests).toEqual([]);
    }
    const f=setup();expect(await f.life.buildLight('ruin_light')).toMatchObject({accepted:false,reason:'unknown_light'});
    expect(f.loadIslet).not.toHaveBeenCalled();expect(f.requests).toEqual([]);
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
    const pendingBuild=f.life.buildLight(STATION);await settle();expect(f.postCalls()).toHaveLength(1);
    const reads=f.getCount();f.store.invalidate(); // Root's synchronous reset has not run yet.
    post.resolve(failed(503));expect(await pendingBuild).toMatchObject({accepted:false,reason:'session_expired'});
    expect(f.getCount()).toBe(reads);expect(f.store.state.isletSnapshot).toBeNull();
    expect(adapter.read().spots).toEqual([]);expect(f.ctx.transport.read).not.toHaveBeenCalled();
    await adapter.refresh();f.session.clearToken();
    expect((await adapter.build(STATION)).accepted).toBe(false);expect(f.postCalls()).toHaveLength(1);
  });

  it('waits for held account hydration before correcting a snapshot and skips a now-redundant me/ledger read',async()=>{
    const f=setup(),hydration=deferred();f.store.commit({me:null});
    f.ctx.waitForSave=vi.fn(()=>hydration.promise);
    const adapter=await f.life.getAdapter();await adapter.refresh();await adapter.refresh();await settle();
    expect(f.ctx.waitForSave).toHaveBeenCalledOnce();
    expect(f.ctx.transport.read).not.toHaveBeenCalled();expect(f.ctx.auth.readOwnLedger).not.toHaveBeenCalled();
    f.store.commit({me:{coins:1000,captainName:'Hydrated captain',kit:'witness'}});hydration.resolve();await settle();
    expect(f.ctx.transport.read).not.toHaveBeenCalled();expect(f.ctx.auth.readOwnLedger).not.toHaveBeenCalled();
    expect(f.store.read().captain.coins).toBe(1000);expect(f.store.state.isletSnapshot.coins).toBe(1000);
  });

  it('hands accepted fresh-me recovery back to failed initial hydration and does not duplicate its ledger',async()=>{
    const f=setup();f.store.commit({me:null});f.ctx.waitForSave=vi.fn(async()=>{});
    f.ctx.transport.read.mockImplementationOnce(async()=>{
      f.store.commit({me:{coins:1000,captainName:'Recovered captain',kit:'witness'}});return {mapped:{accepted:true}};
    });
    f.ctx.onMeRefreshed=vi.fn(async()=>{await f.ctx.auth.readOwnLedger();return {ledgerHandled:true};});
    await f.life.refresh();await settle();
    expect(f.ctx.waitForSave).toHaveBeenCalledOnce();expect(f.ctx.transport.read).toHaveBeenCalledExactlyOnceWith('me',{fresh:true});
    expect(f.ctx.onMeRefreshed).toHaveBeenCalledOnce();expect(f.ctx.auth.readOwnLedger).toHaveBeenCalledOnce();
    expect(f.store.read().captain.coins).toBe(1000);
  });

  it('keeps normal fresh-me ledger ownership when hydration reports it was already complete',async()=>{
    const f=setup();f.server.dev.setCoins(900);f.ctx.onMeRefreshed=vi.fn(async()=>false);
    await f.life.refresh();await settle();
    expect(f.ctx.onMeRefreshed).toHaveBeenCalledOnce();expect(f.ctx.auth.readOwnLedger).toHaveBeenCalledOnce();
  });

  it('fences wallet work across both the hydration barrier and accepted-me continuation',async()=>{
    const f=setup(),hydration=deferred();f.store.commit({me:null});f.ctx.waitForSave=()=>hydration.promise;
    await f.life.refresh();await settle();f.nextIdentity();hydration.resolve();await settle();
    expect(f.ctx.transport.read).not.toHaveBeenCalled();expect(f.ctx.auth.readOwnLedger).not.toHaveBeenCalled();
    const g=setup(),continuation=deferred();g.server.dev.setCoins(900);g.ctx.onMeRefreshed=vi.fn(()=>continuation.promise);
    await g.life.refresh();await settle();expect(g.ctx.onMeRefreshed).toHaveBeenCalledOnce();
    g.nextIdentity();continuation.resolve({ledgerHandled:false});await settle();expect(g.ctx.auth.readOwnLedger).not.toHaveBeenCalled();
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
    expect(f.ctx.auth.readOwnLedger).not.toHaveBeenCalled();
    await adapter.refresh();expect(f.ctx.transport.read).toHaveBeenCalledOnce();
    me.resolve();await settle();
    expect(f.store.read()).toMatchObject({captain:{coins:700},rewards:{balance:700}});
    expect(f.ctx.auth.readOwnLedger).toHaveBeenCalledOnce();
    await adapter.refresh();await settle();expect(f.ctx.transport.read).toHaveBeenCalledOnce();
  });

  it('leaves failed wallet read recovery to its read owner for repeated same-coins answers',async()=>{
    const f=setup(),adapter=await f.life.getAdapter();await adapter.refresh();
    f.ctx.transport.read.mockRejectedValue(new Error('recorded me failure'));
    f.ctx.auth.readOwnLedger.mockResolvedValue({ok:false,status:503});
    f.server.dev.setCoins(900);await adapter.refresh();await settle();
    expect(f.ctx.transport.read).toHaveBeenCalledOnce();expect(f.ctx.auth.readOwnLedger).toHaveBeenCalledOnce();
    expect(f.store.read().captain.coins).toBe(1000);
    await adapter.refresh();await adapter.refresh();await settle();
    expect(f.ctx.transport.read).toHaveBeenCalledOnce();expect(f.ctx.auth.readOwnLedger).toHaveBeenCalledOnce();
    f.server.dev.setCoins(800);await adapter.refresh();await settle();
    expect(f.ctx.transport.read).toHaveBeenCalledTimes(2);expect(f.ctx.auth.readOwnLedger).toHaveBeenCalledTimes(2);
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
    expect(f.ctx.transport.read).toHaveBeenCalledOnce();expect(f.ctx.auth.readOwnLedger).not.toHaveBeenCalled();
    f.nextIdentity();f.server.dev.reset();await adapter.refresh();
    expect((await adapter.build(STATION)).accepted).toBe(true);await settle();
    expect(f.ctx.transport.read).toHaveBeenCalledTimes(2);expect(f.ctx.auth.readOwnLedger).toHaveBeenCalledOnce();
    me.resolve({mapped:{accepted:true}});await settle();expect(f.ctx.auth.readOwnLedger).toHaveBeenCalledOnce();
  });

  it('uses L2 exact POST and one readback, keeping a successful build when wallet/ledger/case reads fail',async()=>{
    const f=setup();f.ctx.transport.read.mockRejectedValue(new Error('recorded me failure'));
    f.ctx.auth.readOwnLedger.mockRejectedValue(new Error('recorded ledger failure'));
    f.ctx.refreshCase.mockRejectedValue(new Error('recorded case failure'));
    expect(await f.life.buildLight(STATION)).toMatchObject({accepted:true,reason:null});
    expect(f.getCount()).toBe(2);expect(f.postCalls()).toHaveLength(1);
    expect(f.postCalls()[0]).toEqual({method:'POST',path:'/api/islet/build',body:{plot:STATION,type:'signal_station',actionUid:expect.any(String)}});
    expect(f.ctx.transport.read).toHaveBeenCalledExactlyOnceWith('me',{fresh:true});
    expect(f.ctx.auth.readOwnLedger).toHaveBeenCalledOnce();expect(f.ctx.refreshCase).toHaveBeenCalledOnce();
    expect(f.store.state.isletSnapshot).toMatchObject({signalStationBuilt:true,coins:700,timber:10});
  });

  it('still refreshes the wallet after accepted build when the islet readback fails',async()=>{
    const f=setup();f.ctx.waitForSave=vi.fn(async()=>{});await f.life.refresh();f.posts.push(async(path,body)=>{
      const result=await f.server.post(path,body);f.gets.push(()=>failed(503));return result;
    });
    expect((await f.life.buildLight(STATION)).accepted).toBe(true);
    expect(f.store.state.isletSnapshot.coins).toBe(1000); // Last good islet view, not a computed charge.
    expect(f.ctx.transport.read).toHaveBeenCalledExactlyOnceWith('me',{fresh:true});
    expect(f.ctx.auth.readOwnLedger).toHaveBeenCalledOnce();
  });

  it('does not mistake a pre-build hydration wallet task for recovery after an accepted build with failed readback',async()=>{
    const f=setup(),preBuildMe=deferred(),walletStarted=deferred(),readbackStarted=deferred();
    f.store.commit({me:{...f.store.state.me,coins:1100}});
    f.ctx.transport.read.mockImplementationOnce(async()=>{
      walletStarted.resolve();await preBuildMe.promise;f.store.commit({me:{...f.store.state.me,coins:1000}});return {mapped:{accepted:true}};
    }).mockImplementationOnce(async()=>{
      f.store.commit({me:{...f.store.state.me,coins:700}});return {mapped:{accepted:true}};
    });
    f.posts.push(async(path,body)=>{
      const result=await f.server.post(path,body);
      f.gets.push(()=>{readbackStarted.resolve();return failed(503);});return result;
    });
    const pending=f.life.buildLight(STATION);
    await Promise.all([walletStarted.promise,readbackStarted.promise]);
    expect(f.postCalls()).toHaveLength(1);expect(f.getCount()).toBe(2);expect(f.ctx.transport.read).toHaveBeenCalledOnce();
    preBuildMe.resolve();expect((await pending).accepted).toBe(true);
    expect(f.ctx.transport.read).toHaveBeenCalledTimes(2);expect(f.ctx.auth.readOwnLedger).toHaveBeenCalledTimes(2);
    expect(f.store.read().captain.coins).toBe(700);
  });

  it('does not reuse an unbuilt external GET accepted during a pending POST as its post-build wallet recovery',async()=>{
    const f=setup(),oldMe=deferred(),post=deferred();f.store.commit({me:{...f.store.state.me,coins:1100}});
    f.ctx.transport.read.mockImplementationOnce(async()=>{
      await oldMe.promise;f.store.commit({me:{...f.store.state.me,coins:1000}});return {mapped:{accepted:true}};
    }).mockImplementationOnce(async()=>{
      f.store.commit({me:{...f.store.state.me,coins:700}});return {mapped:{accepted:true}};
    });
    const adapter=await f.life.getAdapter();await adapter.refresh();
    f.posts.push(async(path,body)=>{await post.promise;const result=await f.server.post(path,body);f.gets.push(()=>failed(503));return result;});
    const pending=f.life.buildLight(STATION);await settle();
    await adapter.refresh();expect(f.store.state.isletSnapshot.signalStationBuilt).toBe(false);
    post.resolve();await settle();expect(f.ctx.transport.read).toHaveBeenCalledOnce();
    oldMe.resolve();expect((await pending).accepted).toBe(true);
    expect(f.ctx.transport.read).toHaveBeenCalledTimes(2);expect(f.ctx.auth.readOwnLedger).toHaveBeenCalledTimes(2);
    expect(f.store.read().captain.coins).toBe(700);
  });

  it.each([
    ['not_enough_timber','materials_required'],['insufficient_funds','no_coins'],
    ['plot_occupied','already_built'],['not_buildable_yet','light_not_ready'],
  ])('preserves published %s as %s through the production intent boundary',async(code,reason)=>{
    const f=setup();await f.life.refresh();f.posts.push(()=>failed(409,code,{message:'Recorded public plot explanation.'}));
    let raw;
    const adapter={read:f.store.read,async buildLight(station){raw=await f.life.buildLight(station);return {...raw,view:f.store.read()};}};
    const result=await sendCaseIntent(adapter,'buildLight',STATION);
    expect(raw).toMatchObject({accepted:false,reason});expect(raw).not.toHaveProperty('status');expect(result).not.toHaveProperty('status');
    expect(f.ctx.onIsletFailure).toHaveBeenCalledWith(expect.objectContaining({accepted:false,reason}));
    expect(f.ctx.onIsletFailure.mock.calls[0][0]).not.toHaveProperty('status');
    expect(result).toMatchObject({accepted:false,reason,message:'Recorded public plot explanation.',view:{schema:1,mode:'online'}});
    expect(result.view).toEqual(adapter.read());expect(JSON.stringify(result)).not.toContain(f.store.state.me.id);
    expect(f.postCalls()).toHaveLength(1);expect(f.getCount()).toBe(2);
  });

  it.each([
    [0,'network_error','offline'],[401,'unauthorized','session_expired'],[404,'feature_off','feature_off'],
    [429,'too_many_requests','rate_limited'],[502,'database_error','internal_error'],[503,'database_unavailable','not_connected'],
  ])('preserves common %s failure semantics through the production intent boundary',async(status,code,reason)=>{
    const f=setup();await f.life.refresh();f.posts.push(()=>failed(status,code,status===429?{retryAfterSeconds:3}:{}));
    let raw;
    const adapter={read:f.store.read,async buildLight(station){raw=await f.life.buildLight(station);return {...raw,view:f.store.read()};}};
    const result=await sendCaseIntent(adapter,'buildLight',STATION);
    expect(raw).toMatchObject({accepted:false,reason,status});
    expect(result).toMatchObject({accepted:false,reason,view:{schema:1,mode:'online'}});
    expect(result.message).toEqual(expect.any(String));expect(result.message.length).toBeGreaterThan(0);
    expect(result).not.toHaveProperty('status'); // The existing generic normalizer owns common failure copy/shape.
    expect(result.view).toEqual(adapter.read());expect(JSON.stringify(result)).not.toContain(f.store.state.me.id);
    if(status===429){expect(raw.retryAfterSeconds).toBe(3);expect(result.retryAfterSeconds).toBe(3);}
    expect(f.postCalls()).toHaveLength(1);
  });

  it.each([0,503])('clears provisional %s failure only after the server confirms the applied station',async status=>{
    const f=setup();await f.life.refresh();
    f.ctx.onIsletFailure.mockImplementation(failure=>f.store.commit({isletFailure:failure}));
    f.posts.push(async(path,body)=>{await f.server.post(path,body);return failed(status);});
    expect((await f.life.buildLight(STATION)).accepted).toBe(true);
    expect(f.ctx.onIsletFailure).toHaveBeenCalledOnce();expect(f.store.state.isletSnapshot.signalStationBuilt).toBe(true);
    expect(f.store.state.isletFailure).toBeNull();expect(f.store.read()).not.toHaveProperty('isletFailure');
  });

  it('preserves an unconfirmed or failed-read failure, then clears it after a panel workshop build is confirmed',async()=>{
    const f=setup();await f.life.refresh();f.ctx.onIsletFailure.mockImplementation(failure=>f.store.commit({isletFailure:failure}));
    f.posts.push(()=>failed(503));expect((await f.life.buildLight(STATION)).accepted).toBe(false);
    const failure=structuredClone(f.store.state.isletFailure);expect(failure.reason).toBe('not_connected');
    const adapter=await f.life.getAdapter();await adapter.refresh();expect(f.store.state.isletFailure).toEqual(failure);
    f.gets.push(()=>failed(503));expect((await adapter.refresh()).accepted).toBe(false);expect(f.store.state.isletFailure).toEqual(failure);
    expect((await adapter.build('plot_2')).accepted).toBe(true);
    expect(f.store.state.isletSnapshot).toMatchObject({signalStationBuilt:false,busyPlot:'plot_2'});
    expect(f.store.state.isletSnapshot.spots.find(spot=>spot.plot==='plot_2').state).toBe('built');
    expect(f.store.state.isletFailure).toBeNull();
  });

  it('rechecks an unapplied unknown outcome, retries the held UID and never substitutes a fresh click',async()=>{
    const f=setup();await f.life.refresh();f.posts.push(()=>failed(503));
    expect((await f.life.buildLight(STATION)).accepted).toBe(false);
    expect((await f.life.getAdapter()).read().spots.find(s=>s.plot===STATION).retry).toBe(true);
    expect((await f.life.buildLight(STATION)).accepted).toBe(true);
    expect(f.postCalls()).toHaveLength(2);expect(f.postCalls()[1].body.actionUid).toBe(f.postCalls()[0].body.actionUid);
    expect(f.getCount()).toBe(4); // Initial GET, recovery, explicit retry check, accepted-build readback.
  });

  it('confirms an applied unknown outcome by Retry GET without posting twice, and refuses a superseded preflight',async()=>{
    const f=setup();await f.life.refresh();f.posts.push(async(path,body)=>{
      await f.server.post(path,body);f.gets.push(()=>failed(503));return failed(0,'network_error');
    });
    expect((await f.life.buildLight(STATION)).accepted).toBe(false);
    const adapter=await f.life.getAdapter(),refresh=adapter.refresh;
    adapter.refresh=vi.fn(async()=>({accepted:true,code:'superseded',stale:true,message:''}));
    expect(await f.life.buildLight(STATION)).toMatchObject({accepted:false,reason:'not_ready'});expect(f.postCalls()).toHaveLength(1);
    adapter.refresh=refresh;expect((await f.life.buildLight(STATION)).accepted).toBe(true);
    expect(f.postCalls()).toHaveLength(1);expect(f.getCount()).toBe(3);expect(f.ctx.transport.read).toHaveBeenCalledOnce();
  });

  it.each([[0,'offline'],[502,'internal_error'],[503,'not_connected']])('retains the common %s failure while the build remains unknown',async(status,reason)=>{
    const f=setup();await f.life.refresh();f.posts.push(()=>failed(status));
    expect(await f.life.buildLight(STATION)).toMatchObject({accepted:false,reason,status});
    expect((await f.life.getAdapter()).read().spots.find(s=>s.plot===STATION).retry).toBe(true);
  });

  it('reports 429 at the POST response and preserves its expired deadline through a slow recovery GET',async()=>{
    const f=setup();await f.life.refresh();const recovery=deferred();
    f.posts.push(()=>{f.gets.push(()=>recovery.promise);return failed(429,'too_many_requests',{retryAfterSeconds:3});});
    f.ctx.onIsletFailure.mockImplementation(()=>{throw new Error('presentation failure');});
    const pending=f.life.buildLight(STATION);await settle();
    expect(f.ctx.onIsletFailure).toHaveBeenCalledWith(expect.objectContaining({reason:'rate_limited',status:429,retryAfterSeconds:3,retryAt:3000}));
    expect(f.getCount()).toBe(2);
    expect(await f.life.buildLight(STATION)).toMatchObject({accepted:false,reason:'not_ready'});
    expect(f.getCount()).toBe(2);expect(f.postCalls()).toHaveLength(1);f.setTime(5000);recovery.resolve(await f.server.get('/api/islet'));
    const result=await pending;expect(result).toMatchObject({accepted:false,reason:'rate_limited',status:429,retryAfterSeconds:0});
    expect(result).not.toHaveProperty('retryAt');
    expect(f.ctx.onIsletFailure).toHaveBeenCalledOnce();
  });

  it('keeps an existing engine cooldown exact at fractional seconds through the private failure seam',async()=>{
    const f=setup();await f.life.refresh();
    f.posts.push(()=>failed(429,'too_many_requests',{retryAfterSeconds:3}));
    expect((await f.life.buildLight(STATION)).reason).toBe('rate_limited');
    f.ctx.onIsletFailure.mockClear();f.setTime(1500);const requests=f.requests.length;
    const result=await f.life.buildLight(STATION);
    expect(result).toMatchObject({accepted:false,reason:'rate_limited',retryAfterSeconds:2});
    expect(result).not.toHaveProperty('retryAt');expect(f.requests).toHaveLength(requests);
    expect(f.ctx.onIsletFailure).toHaveBeenCalledWith(expect.objectContaining({reason:'rate_limited',retryAt:3000}));
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
