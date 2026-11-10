// Actual factory/lease/L2 integration with generated credentials and injected replies only.
import {randomUUID} from 'node:crypto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createSession} from '../src/online/session.js';
import {createRealAdapter} from '../src/online/adapter/index.js';
import * as stores from '../src/online/adapter/store.js';
import {findPanelServices} from '../src/online/panel-services.js';
import {createIsletAdapter} from '../src/screens/islet/adapter.js';
import {createFakeIsletTransport} from '../src/screens/islet/fake-transport.js';

const STATION='islet_signal_station';
const okay=data=>({ok:true,status:200,data});
const failed=()=>({ok:false,status:503,code:'database_unavailable'});
const copy=value=>structuredClone(value);
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
async function settle(){for(let turn=0;turn<60;turn++)await Promise.resolve();}
async function until(predicate,label){
  for(let turn=0;turn<160&&!predicate();turn++)await Promise.resolve();
  expect(predicate(),label).toBe(true);
}
function surface(extra={}){
  const events=new Map();
  return {...extra,
    addEventListener(name,listener){if(!events.has(name))events.set(name,new Set());events.get(name).add(listener);},
    removeEventListener(name,listener){events.get(name)?.delete(listener);},
  };
}
const fixtures=[];
function setup({holdInitialMe=true}={}){
  const session=createSession();session.setToken(`fixture-${randomUUID()}`);
  const server=createFakeIsletTransport({now:()=>new Date(Date.now())});
  const me={id:randomUUID(),captainName:'Recorded Captain',coins:1000,kit:'witness',place:'saltreach_harbor',crews:[]};
  const firstMe=deferred(),requests=[],unexpected=[],isletReplies=[],buildReplies=[],engines=[];
  let meReads=0;
  const api={
    get:vi.fn(async path=>{
      requests.push({method:'GET',path});
      if(path==='/api/me'){
        meReads+=1;
        return holdInitialMe&&meReads===1?firstMe.promise:okay(copy(me));
      }
      if(path==='/api/islet'){
        const reply=isletReplies.shift();return reply?reply():server.get(path);
      }
      unexpected.push({method:'GET',path});throw new Error('Unexpected injected GET');
    }),
    post:vi.fn(async(path,body)=>{
      requests.push({method:'POST',path,...(body===undefined?{}:{body:copy(body)})});
      if(path==='/api/me/name')return okay({captainName:me.captainName,rerollsLeft:1});
      if(path==='/api/islet/build'){
        const reply=buildReplies.shift();
        if(reply)return reply(path,body);
        const result=await server.post(path,body);
        if(result.ok)me.coins=result.data.coins;
        return result;
      }
      unexpected.push({method:'POST',path});throw new Error('Unexpected injected POST');
    }),
    put:vi.fn(async path=>{unexpected.push({method:'PUT',path});throw new Error('No fixture PUT');}),
    del:vi.fn(async path=>{unexpected.push({method:'DELETE',path});throw new Error('No fixture DELETE');}),
  };
  const publicApi={get:vi.fn(async path=>{
    requests.push({method:'PUBLIC_GET',path});
    if(path==='/api/config')return okay({flags:{sign_in:true,live_presence:false,case:false}});
    unexpected.push({method:'PUBLIC_GET',path});throw new Error('Unexpected injected public GET');
  })};
  const auth={read:()=>({state:'signed_in',configured:true}),restore:vi.fn(async()=>{}),
    signOut:vi.fn(async()=>{}),dispose:vi.fn(),
    subscribe:()=>()=>{},
  };
  const loadIslet=vi.fn(async()=>({createIsletAdapter(options){
    const engine=createIsletAdapter({...options,makeUid:()=>`fixture_${randomUUID()}`});
    engines.push(engine);return engine;
  }}));
  // Observe the real private store only in this test; no extra production capability is exposed.
  const watched=vi.spyOn(stores,'createAdapterStore');
  let adapter,store;
  try{
    adapter=createRealAdapter({session,api,publicApi,auth,loadIslet,isDemo:()=>false,
      clock:()=>Date.now(),random:()=>.5,
      document:surface({hidden:false}),window:surface(),on:()=>()=>{},
    });
    store=watched.mock.results.at(-1)?.value;
  }finally{watched.mockRestore();}
  const fixture={adapter,store,session,api,publicApi,auth,server,me,firstMe,requests,unexpected,
    isletReplies,buildReplies,engines,loadIslet,
    calls:(method,path)=>requests.filter(request=>request.method===method&&request.path===path),
    async lease(){
      await until(()=>findPanelServices(session)?.isReady()===true,'accepted config makes the exact session lease ready');
      return findPanelServices(session);
    },
    async ready(){
      await until(()=>adapter.read().account.canReroll===true,'name setup must finish');
      await settle();
      expect(adapter.read().account).toMatchObject({state:'signed_in',namePending:false,canReroll:true});
      expect(this.calls('POST','/api/me/name')).toHaveLength(1);
    },
  };
  fixtures.push(fixture);return fixture;
}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(0);});
afterEach(()=>{
  for(const f of fixtures.splice(0)){
    f.adapter.dispose();expect(findPanelServices(f.session)).toBeNull();
    expect(f.unexpected).toEqual([]);expect(f.api.put).not.toHaveBeenCalled();expect(f.api.del).not.toHaveBeenCalled();
  }
  expect(vi.getTimerCount()).toBe(0);vi.useRealTimers();
});

describe('factory-owned islet hydration and success cleanup',()=>{
  it('does not supersede held initial me setup when the first islet GET answers earlier',async()=>{
    const f=setup(),lease=await f.lease();
    await until(()=>f.calls('GET','/api/me').length===1,'initial hydration starts its me GET');
    const islet=await lease.getIslet();expect(islet).toBe(f.engines[0]);
    expect((await islet.refresh()).accepted).toBe(true);await settle();
    expect(f.calls('GET','/api/islet')).toHaveLength(1);
    expect(f.calls('GET','/api/me')).toHaveLength(1);
    expect(f.calls('POST','/api/me/name')).toHaveLength(0);
    f.firstMe.resolve(okay(copy(f.me)));await f.ready();
    expect(f.calls('GET','/api/me')).toHaveLength(1);
    expect(f.adapter.read().captain.coins).toBe(1000);
    expect(await lease.getIslet()).toBe(islet);expect(f.loadIslet).toHaveBeenCalledOnce();
  });

  it('resumes name setup after a failed initial me is recovered by the islet wallet GET',async()=>{
    const f=setup(),lease=await f.lease();
    await until(()=>f.calls('GET','/api/me').length===1,'initial hydration is held');
    const islet=await lease.getIslet();await islet.refresh();await settle();
    expect(f.calls('GET','/api/me')).toHaveLength(1);
    f.firstMe.resolve(failed());await f.ready();
    expect(f.calls('GET','/api/me')).toHaveLength(2);
    expect(f.adapter.read()).toMatchObject({captain:{coins:1000},account:{canReroll:true,namePending:false}});
    // Fake time never reaches the monitor's 5s retry: the shared islet helper itself recovered setup.
    expect(Date.now()).toBe(0);expect(f.calls('GET','/api/islet')).toHaveLength(1);
  });

  it('confirms an applied 503 as built through the panel engine recovery GET and rereads the wallet',async()=>{
    const f=setup({holdInitialMe:false});await f.ready();
    const lease=await f.lease(),islet=await lease.getIslet();await islet.refresh();await settle();
    const recovery=deferred();
    f.buildReplies.push(async(path,body)=>{
      const result=await f.server.post(path,body);expect(result.ok).toBe(true);
      f.me.coins=result.data.coins;f.isletReplies.push(()=>recovery.promise);return failed();
    });
    const building=islet.build(STATION);
    await until(()=>f.calls('GET','/api/islet').length===2,'failed POST starts one authoritative recovery GET');
    recovery.resolve(await f.server.get('/api/islet'));
    await building;
    await until(()=>f.adapter.read().captain.coins===700,'the confirmed build rereads the authoritative wallet');
    await settle();
    expect(islet.read().spots.find(spot=>spot.plot===STATION).state).toBe('built');
    expect(f.calls('POST','/api/islet/build')).toHaveLength(1);
    expect(f.calls('GET','/api/islet')).toHaveLength(2);
    expect(f.calls('GET','/api/me')).toHaveLength(2);
    expect(Object.keys(f.calls('POST','/api/islet/build')[0].body).sort()).toEqual(['actionUid','plot','type']);
    expect(f.adapter).not.toHaveProperty('buildLight');
  });

  it('keeps the held write UID when the same shared panel engine retries a failed build',async()=>{
    const f=setup({holdInitialMe:false});await f.ready();
    const lease=await f.lease(),islet=await lease.getIslet();await islet.refresh();await settle();
    f.buildReplies.push(()=>failed());
    expect((await islet.build(STATION)).accepted).toBe(false);
    const firstBody=f.calls('POST','/api/islet/build')[0].body;
    await islet.refresh();expect((await islet.build(STATION)).accepted).toBe(true);
    await until(()=>f.adapter.read().captain.coins===700,'direct panel success refreshes the authoritative wallet');
    await settle();
    expect(f.calls('POST','/api/islet/build')).toHaveLength(2);
    expect(f.calls('POST','/api/islet/build')[1].body).toEqual(firstBody);
    expect(await lease.getIslet()).toBe(islet);expect(f.engines).toHaveLength(1);
    expect(f.calls('GET','/api/me')).toHaveLength(2);
  });
});
