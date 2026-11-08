// Injected response matrices and controlled clocks; no account, database or service is contacted.
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createSession} from '../src/online/session.js';
import {createAdapterStore} from '../src/online/case-adapter/store.js';
import {createCaseLifecycle} from '../src/online/case-adapter/case-lifecycle.js';
import {createCaseFixture} from '../scripts/online-case-fixture.js';

const okay=data=>({ok:true,status:200,data:structuredClone(data)});
const dark={stage:'dark',lightsOn:false,fogBankGone:false,gullsRestOpen:false,extraLights:0,solves:0,relitAt:null,wall:[],line:null};
let lives=[];
function setup({signedIn=true,flags={case:true},isDemo=()=>false}={}) {
  const session=createSession();if(signedIn)session.setToken(`generated-${Math.random()}`);
  const snapshot=createCaseFixture(),store=createAdapterStore({session}),calls=[],retries=new Map();
  const document=new EventTarget();document.hidden=false;
  let response=()=>okay({case:snapshot}),post=()=>okay({accepted:true,reason:null,message:'',case:snapshot});
  const api={get:vi.fn(async path=>{calls.push({method:'GET',path});return response(path);}),
    post:vi.fn(async(path,body)=>{calls.push({method:'POST',path,body:structuredClone(body)});return post(path,body);})};
  const publicApi={get:vi.fn(async path=>{calls.push({method:'PUBLIC',path});return okay(dark);})};
  store.commit({config:{flags},accountState:signedIn?'signed_in':'signed_out',me:signedIn?{coins:0}:null,
    crew:{...snapshot.crew,seats:snapshot.seats}});
  const ctx={store,state:store.state,session,api,publicApi,document,window:{location:{search:''}},now:Date.now,random:()=>0,
    accept:()=>({accepted:true,reason:null,message:''}),refuse:reason=>({accepted:false,reason,message:reason}),
    transport:{read:vi.fn(async()=>({mapped:{accepted:true}}))},refreshRewards:vi.fn(),
    readMonitor:{begin:vi.fn((kind,options)=>{retries.set(kind,options.retry);return Object.assign(vi.fn(),{cancel:vi.fn()});}),clearRead:vi.fn()}};
  const life=createCaseLifecycle(ctx,{isDemo});lives.push(life);
  return {life,ctx,store,snapshot,calls,api,publicApi,document,retries,
    setRead:fn=>{response=fn;},setPost:fn=>{post=fn;}};
}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-08T12:00:00Z'));});
afterEach(()=>{for(const life of lives)life.dispose();lives=[];vi.useRealTimers();});

describe('real case shared lifecycle',()=>{
  it('requires strict case enablement and keeps demo server-free',async()=>{
    for(const options of [{flags:{case:'true'}},{isDemo:()=>true}]) {
      const env=setup(options);await env.life.refresh();expect(env.calls).toEqual([]);
      expect((await env.life.handlers.pin('C1')).reason).toBe('feature_off');
    }
    const env=setup({signedIn:false});await env.life.refresh();
    expect(env.calls.map(row=>row.method)).toEqual(['PUBLIC']);expect(env.store.read().board.cards).toEqual([]);
  });
  it('maps earned content and resolves native short hotspot names without inventing a route',async()=>{
    const env=setup();await env.life.refresh();
    expect(env.store.read().board.cards).toHaveLength(2);
    expect(env.life.handlers.inspectSpot('ferry_pier').accepted).toBe(true);
    expect(env.store.read().search.routes[0].id).toBe('C3.recorded');
    const before=env.calls.length;expect(env.life.handlers.inspectSpot('unknown').accepted).toBe(false);
    expect(env.calls).toHaveLength(before);
  });
  it('starts a fresh case read when the same forming crew musters without waiting on its earlier null read',async()=>{
    const env=setup(),active=env.store.state.crew;env.store.commit({crew:{...active,status:'forming',startedAt:null}});
    env.setRead(()=>okay({case:null}));await env.life.refresh();expect(env.store.read().crew.caseReady).toBe(false);
    env.store.commit({crew:active});env.setRead(()=>okay({case:env.snapshot}));
    await env.ctx.onCrewRead({result:{mapped:{accepted:true}}});
    expect(env.api.get).toHaveBeenCalledTimes(2);expect(env.store.read().crew.caseReady).toBe(true);
  });
  it('rejects older same-revision settlement and another crew without replacing held content',async()=>{
    const env=setup();await env.life.refresh();const before=env.store.read().board;
    const older=structuredClone(env.snapshot);older.now--;older.board.cards=[];
    env.setRead(()=>okay({case:older}));await env.retries.get('case')();expect(env.store.read().board).toEqual(before);
    older.now+=10;older.crew.id='different_crew';await env.retries.get('case')();expect(env.store.read().board).toEqual(before);
    env.setRead(()=>okay({case:null}));await env.retries.get('case')();expect(env.store.read().board.cards).toEqual([]);
    expect(env.store.read().crew.caseReady).toBe(false);
  });
  it('joins rapid activations and keeps the original UID through a failed read before explicit retry',async()=>{
    const env=setup();await env.life.refresh();let finish;
    env.setPost(()=>new Promise(resolve=>{finish=resolve;}));
    const first=env.life.handlers.pin('C1'),second=env.life.handlers.pin('C1');await Promise.resolve();await Promise.resolve();
    expect(env.api.post).toHaveBeenCalledTimes(1);finish({ok:false,status:0});await Promise.all([first,second]);
    const original=env.calls.find(row=>row.method==='POST').body;
    env.setRead(()=>({ok:false,status:503}));expect((await env.life.handlers.pin('C1')).accepted).toBe(false);
    expect(env.api.post).toHaveBeenCalledTimes(1);
    env.setRead(()=>okay({case:env.snapshot}));env.setPost(()=>okay({accepted:false,reason:'already_pinned',message:'Recorded refusal.',repeat:true,case:env.snapshot}));
    const result=await env.life.handlers.pin('C1');expect(result.accepted).toBe(false);expect(result.repeat).toBe(true);
    expect(env.calls.filter(row=>row.method==='POST')[1].body).toEqual(original);
    expect(env.calls.slice(-2).map(row=>row.method)).toEqual(['GET','POST']);
  });
  it('fences hidden late writes and preserves their UID for visible explicit retry',async()=>{
    const env=setup();await env.life.refresh();let finish;
    env.setPost(()=>new Promise(resolve=>{finish=resolve;}));const sending=env.life.handlers.pin('C1');
    await Promise.resolve();await Promise.resolve();const body=env.calls.find(row=>row.method==='POST').body;
    env.document.hidden=true;env.document.dispatchEvent(new Event('visibilitychange'));
    const changed=structuredClone(env.snapshot);changed.writeRevision++;changed.board.cards=[];
    finish(okay({accepted:true,reason:null,message:'',case:changed}));expect((await sending).accepted).toBe(false);
    expect(env.store.read().board.cards).toHaveLength(2);
    env.document.hidden=false;env.document.dispatchEvent(new Event('visibilitychange'));
    env.setPost(()=>okay({accepted:true,reason:null,message:'',repeat:true,case:env.snapshot}));
    await env.life.handlers.pin('C1');expect(env.calls.filter(row=>row.method==='POST')[1].body).toEqual(body);
  });
  it('ends failed automatic reads after 5/15/30 seconds and restarts only on explicit retry',async()=>{
    const env=setup();env.setRead(()=>({ok:false,status:503}));await env.life.refresh();
    for(const delay of [5000,15000,30000])await vi.advanceTimersByTimeAsync(delay);
    expect(env.api.get).toHaveBeenCalledTimes(4);await vi.advanceTimersByTimeAsync(180000);
    expect(env.api.get).toHaveBeenCalledTimes(4);
    env.setRead(()=>okay({case:env.snapshot}));await env.retries.get('case')();expect(env.api.get).toHaveBeenCalledTimes(5);
  });
  it('holds server read cooldown across manual retry and refreshes public coast after accepted accusation',async()=>{
    const env=setup();env.setRead(()=>({ok:false,status:429,retryAfterSeconds:20}));await env.life.refresh();
    await env.retries.get('case')();expect(env.api.get).toHaveBeenCalledTimes(1);
    env.setRead(()=>okay({case:env.snapshot}));await vi.advanceTimersByTimeAsync(20000);
    expect(env.api.get).toHaveBeenCalledTimes(2);
    const before=env.publicApi.get.mock.calls.length;await env.life.handlers.accuse('recorded_suspect');
    expect(env.publicApi.get.mock.calls.length).toBe(before+1);
    expect(env.ctx.transport.read).toHaveBeenCalledWith('me',{fresh:true});expect(env.ctx.refreshRewards).toHaveBeenCalled();
  });
  it('clears private views on account loss and cannot revive them from a late GET',async()=>{
    const env=setup();let finish;env.setRead(()=>new Promise(resolve=>{finish=resolve;}));const reading=env.life.refresh();
    env.ctx.session.clearToken();env.store.invalidate();env.store.commit({accountState:'expired',me:null,crew:null});env.life.reset();
    finish(okay({case:env.snapshot}));await reading;expect(env.store.read().board.cards).toEqual([]);expect(env.store.read().effects).toEqual([]);
  });
});
