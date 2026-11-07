// Real HTTP adapter ownership survives ordinary hiding, but never an account or feature lifetime.
import {randomUUID} from 'node:crypto';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createSession} from '../src/online/session.js';
import {createHttpAdapter} from '../src/screens/duels/http-adapter.js';

const owners=[];
const good=data=>({ok:true,status:200,data});
const unavailable=()=>({ok:false,status:503,code:'database_unavailable'});
const ask=()=>({rounds:3,stake:10,signals:['shade','shade','shade']});
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
function setup({applied=false}={}){
  const session=createSession();session.setToken(`recorded-${randomUUID()}`);
  const started=deferred(),held=deferred(),events=[],bodies=[],known=new Map();
  let enabled=true,failRead=false,charges=0;
  const list=()=>({coins:120-charges*10,heldCoins:charges*10,incoming:[],openChallenges:[],
    yours:[...known.values()],recent:[],rules:{},serverTime:new Date().toISOString()});
  function apply(body){
    if(known.has(body.actionUid))return known.get(body.actionUid);
    const duel={id:randomUUID(),status:'open',yourSignals:[...body.signals]};
    known.set(body.actionUid,duel);charges++;return duel;
  }
  const request={
    publicGet:vi.fn(async path=>{
      expect(path).toBe('/api/config');events.push('config');return good({flags:{arena:enabled}});
    }),
    get:vi.fn(async path=>{
      expect(path).toBe('/api/duels');events.push('read');return failRead?unavailable():good(list());
    }),
    post:vi.fn(async(path,body)=>{
      expect(path).toBe('/api/duels');events.push('write');bodies.push(structuredClone(body));
      if(bodies.length===1){
        started.resolve();await held.promise;
        if(applied)return good({duel:apply(body),coins:120-charges*10});
        return unavailable();
      }
      if(known.has(body.actionUid))return {ok:false,status:409,code:'already_applied'};
      return good({duel:apply(body),coins:120-charges*10});
    }),
  };
  const adapter=createHttpAdapter({request,getToken:session.getToken,
    getIdentity:()=>session.isSignedIn()?session.getScope():null,onIdentityChange:session.onChange,
    getFlags:()=>({arena:enabled})});
  const fixture={adapter,session,started,held,events,bodies,request,
    charges:()=>charges,setReadFailure(value){failRead=value;},setEnabled(value){enabled=value;},
    dispose(){held.resolve();adapter.dispose();}};
  owners.push(fixture);return fixture;
}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-07T00:00:00Z'));});
afterEach(()=>{owners.splice(0).forEach(owner=>owner.dispose());expect(vi.getTimerCount()).toBe(0);vi.useRealTimers();});

it.each([false,true])('retains a held POST across close, reads first, and explicitly repeats the same body (applied=%s)',async applied=>{
  const f=setup({applied});await f.adapter.setVisible(true);
  const writing=f.adapter.challenge(ask());await f.started.promise;
  await f.adapter.setVisible(false);const reads=f.request.get.mock.calls.length;
  f.held.resolve();expect((await writing).ok).toBe(false);
  expect(f.request.get).toHaveBeenCalledTimes(reads);
  expect(f.adapter.read()).toMatchObject({mode:'loading',coins:null,selected:null,sealed:{},canRetry:false});
  await f.adapter.setVisible(true);
  expect(f.bodies).toHaveLength(1);expect(f.adapter.read().canRetry).toBe(true);
  f.events.length=0;
  expect((await f.adapter.retry()).ok).toBe(true);
  expect(f.events).toEqual(['read','write','read']);
  expect(f.bodies).toHaveLength(2);expect(f.bodies[1]).toEqual(f.bodies[0]);
  expect(f.charges()).toBe(1);expect(f.adapter.read().canRetry).toBe(false);
});

it('keeps a paused UID without writing when the required fresh retry read fails',async()=>{
  const f=setup();await f.adapter.setVisible(true);
  const writing=f.adapter.challenge(ask());await f.started.promise;
  await f.adapter.setVisible(false);f.held.resolve();await writing;await f.adapter.setVisible(true);
  f.events.length=0;f.setReadFailure(true);
  expect((await f.adapter.retry()).ok).toBe(false);
  expect(f.events).toEqual(['read']);expect(f.bodies).toHaveLength(1);expect(f.adapter.read().canRetry).toBe(true);
  f.setReadFailure(false);f.events.length=0;
  expect((await f.adapter.retry()).ok).toBe(true);
  expect(f.events).toEqual(['read','write','read']);expect(f.bodies[1]).toEqual(f.bodies[0]);expect(f.charges()).toBe(1);
});

it('erases the old held attempt at an account boundary before another captain opens',async()=>{
  const f=setup();await f.adapter.setVisible(true);
  const writing=f.adapter.challenge(ask());await f.started.promise;
  await f.adapter.setVisible(false);f.session.clearToken();f.session.setToken(`recorded-${randomUUID()}`);
  f.held.resolve();expect((await writing).ok).toBe(false);await f.adapter.setVisible(true);
  expect(f.adapter.read().canRetry).toBe(false);await f.adapter.retry();expect(f.bodies).toHaveLength(1);
  expect((await f.adapter.challenge(ask())).ok).toBe(true);
  expect(f.bodies).toHaveLength(2);expect(f.bodies[1].actionUid===f.bodies[0].actionUid).toBe(false);
});

it('drops the held attempt when a subsequent opening observes the strict feature flag off',async()=>{
  const f=setup();await f.adapter.setVisible(true);
  const writing=f.adapter.challenge(ask());await f.started.promise;
  await f.adapter.setVisible(false);f.held.resolve();await writing;
  f.setEnabled(false);await f.adapter.setVisible(true);
  expect(f.adapter.read()).toMatchObject({mode:'closed',canRetry:false,coins:null,sealed:{}});
  f.setEnabled(true);await f.adapter.refresh();await f.adapter.retry();expect(f.bodies).toHaveLength(1);
});

it('never replays the held attempt after final disposal',async()=>{
  const f=setup();await f.adapter.setVisible(true);
  const writing=f.adapter.challenge(ask());await f.started.promise;f.adapter.dispose();f.held.resolve();
  expect((await writing).ok).toBe(false);expect((await f.adapter.retry()).ok).toBe(false);
  expect(f.bodies).toHaveLength(1);expect(f.adapter.read()).toMatchObject({canRetry:false,coins:null,sealed:{}});
});
