// The proxy waits for a painted title, but never loses an early intent or late disposal.
import {afterEach,describe,expect,it,vi} from 'vitest';
import {createLazyOnlineAdapter} from '../src/adapter/lazy-online.js';
import {createUnavailableCaseAdapter} from '../src/adapter/unavailable.js';
import {createSession} from '../src/online/session.js';

function defaultDependencies(){
  const session=createSession();session.setToken(`fixture-${crypto.randomUUID()}`);
  const me={id:crypto.randomUUID(),captainName:'Recorded Captain',coins:0,kit:null,place:null,crews:[]};
  const okay=data=>({ok:true,status:200,data});
  const api={get:vi.fn(async path=>{
    if(path==='/api/me')return okay({...me});
    if(path==='/api/save')return okay({version:1,data:{},updatedAt:null});
    if(path==='/api/crews/me')return okay({crew:null});
    throw new Error('Unexpected injected private read');
  }),post:vi.fn(async path=>{
    if(path==='/api/me/name')return okay({captainName:me.captainName,rerollsLeft:1});
    throw new Error('Unexpected injected private change');
  }),put:vi.fn(),del:vi.fn()};
  const publicApi={get:vi.fn(async path=>{
    if(path==='/api/config')return okay({flags:{sign_in:true,live_presence:false}});
    throw new Error('Unexpected injected public read');
  })};
  const stopAuth=vi.fn(),auth={read:()=>({state:'signed_in',configured:true}),
    restore:vi.fn(async()=>{}),subscribe:vi.fn(()=>stopAuth),dispose:vi.fn(),
    readOwnLedger:vi.fn(async()=>({ok:true,rows:[]})),getAccessToken:vi.fn(async()=>session.getToken())};
  const network=vi.fn(async()=>{throw new Error('No network in the default-loader fixture');});
  vi.stubGlobal('fetch',network);
  return {api,publicApi,session,auth,fetchImpl:network,document:new EventTarget(),window:new EventTarget(),
    isCrewVisible:()=>false,readLocalSave:()=>null,on:()=>()=>{},stopAuth,network,me};
}

afterEach(()=>vi.unstubAllGlobals());
describe('lazy online composition',()=>{
  it('releases callback auth when disposed before its first scheduled load',()=>{
    vi.stubGlobal('requestAnimationFrame',vi.fn(()=>1));
    vi.stubGlobal('cancelAnimationFrame',vi.fn());
    const auth={dispose:vi.fn()};
    const load=vi.fn();
    const adapter=createLazyOnlineAdapter({deps:{auth},load});
    adapter.dispose();adapter.dispose();
    expect(load).not.toHaveBeenCalled();
    expect(auth.dispose).toHaveBeenCalledOnce();
  });
  it('releases callback auth when the real chunk fails and the fallback owns no auth',async()=>{
    const auth={dispose:vi.fn()};
    const adapter=createLazyOnlineAdapter({deps:{auth},load:()=>Promise.reject(new Error('chunk unavailable'))});
    await adapter.continueGame();
    adapter.dispose();
    expect(auth.dispose).toHaveBeenCalledOnce();
  });
  it('waits two frames and publishes an online snapshot after loading',async()=>{
    const frames=[];vi.stubGlobal('requestAnimationFrame',callback=>{frames.push(callback);return frames.length;});
    vi.stubGlobal('cancelAnimationFrame',vi.fn());
    const factory=vi.fn(()=>({...createUnavailableCaseAdapter(),read:()=>({mode:'online'})}));
    const load=vi.fn(async()=>({createRealCaseAdapter:factory}));
    const adapter=createLazyOnlineAdapter({load});let events=0;
    const off=adapter.subscribe(()=>events++);
    try{
      expect(adapter.read().mode).toBe('online');expect(load).not.toHaveBeenCalled();
      frames.shift()();expect(load).not.toHaveBeenCalled();
      frames.shift()();await Promise.resolve();await Promise.resolve();
      expect(factory).toHaveBeenCalledTimes(1);expect(events).toBe(1);off();
    }finally{adapter.dispose();}
  });
  it('loads for an early intent and disposes a factory that arrives after closure',async()=>{
    let resolve;const load=()=>new Promise(finish=>{resolve=finish;});
    const adapter=createLazyOnlineAdapter({load});
    const pending=adapter.continueGame();adapter.dispose();
    const real=createUnavailableCaseAdapter();const dispose=vi.spyOn(real,'dispose');
    resolve({createRealCaseAdapter:()=>real});
    expect((await pending).reason).toBe('disposed');expect(dispose).toHaveBeenCalledOnce();
  });
  it('uses the default loader after two frames with the exact injected account and public clients',async()=>{
    const frames=[];let nextFrame=0;
    vi.stubGlobal('requestAnimationFrame',callback=>{frames.push(callback);return ++nextFrame;});
    vi.stubGlobal('cancelAnimationFrame',vi.fn());
    const deps=defaultDependencies(),adapter=createLazyOnlineAdapter({deps});
    try{
      const copy=adapter.read();copy.account.canSignIn=true;
      expect(adapter.read().account.canSignIn).toBe(false);
      expect(deps.publicApi.get).not.toHaveBeenCalled();expect(deps.api.get).not.toHaveBeenCalled();
      frames.shift()();
      expect(deps.publicApi.get).not.toHaveBeenCalled();expect(deps.auth.restore).not.toHaveBeenCalled();
      frames.shift()();
      await vi.waitFor(()=>{
        expect(deps.auth.readOwnLedger).toHaveBeenCalledOnce();
        expect(adapter.read().account).toMatchObject({state:'signed_in',captainName:deps.me.captainName,namePending:false});
      });
      expect(deps.publicApi.get).toHaveBeenCalledExactlyOnceWith('/api/config');
      expect(deps.api.get.mock.calls).toEqual([['/api/me'],['/api/save'],['/api/crews/me']]);
      expect(deps.api.post).toHaveBeenCalledExactlyOnceWith('/api/me/name',undefined);
      expect(deps.auth.restore).toHaveBeenCalledOnce();expect(deps.auth.getAccessToken).not.toHaveBeenCalled();
      expect(deps.network).not.toHaveBeenCalled();
    }finally{adapter.dispose();}
    expect(deps.stopAuth).toHaveBeenCalledOnce();expect(deps.auth.dispose).toHaveBeenCalled();
  });
  it('does no private work when disposed during the default two-stage import',async()=>{
    vi.stubGlobal('requestAnimationFrame',vi.fn(()=>1));
    vi.stubGlobal('cancelAnimationFrame',vi.fn());
    const deps=defaultDependencies(),adapter=createLazyOnlineAdapter({deps}),events=[];
    adapter.subscribe(event=>events.push(event));
    const pending=adapter.continueGame();adapter.dispose();const closed=adapter.read();
    expect((await pending).reason).toBe('disposed');
    await Promise.resolve();
    expect(adapter.read()).toEqual(closed);expect(events).toEqual([]);
    expect(deps.publicApi.get).not.toHaveBeenCalled();expect(deps.api.get).not.toHaveBeenCalled();
    expect(deps.api.post).not.toHaveBeenCalled();expect(deps.api.put).not.toHaveBeenCalled();expect(deps.api.del).not.toHaveBeenCalled();
    expect(deps.auth.restore).not.toHaveBeenCalled();expect(deps.auth.readOwnLedger).not.toHaveBeenCalled();
    expect(deps.auth.getAccessToken).not.toHaveBeenCalled();expect(deps.network).not.toHaveBeenCalled();
    expect(deps.auth.dispose).toHaveBeenCalled();
  });
});
