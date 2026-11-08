// Actual scoped ledger/store/monitor ownership with injected held replies and generated sessions only.
import {randomUUID} from 'node:crypto';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createSession} from '../src/online/session.js';
import {createAdapterStore} from '../src/online/case-adapter/store.js';
import {createReadMonitor} from '../src/online/case-adapter/read-monitor.js';
import {refreshAccountRewards} from '../src/online/case-adapter/rewards.js';

const fixtures=[];
const rows=(amount,reason)=>[{amount,reason,created_at:'2026-11-07T00:00:00Z'}];
const baseline=()=>rows(5,'recorded_before');
const latest=()=>rows(9,'recorded_latest');
const old=()=>rows(-7,'recorded_old');
const good=value=>({ok:true,rows:value});
const failed=status=>({ok:false,status});
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
function setup(){
  const session=createSession();session.setToken(`fixture-${randomUUID()}`);
  const store=createAdapterStore({session}),document=new EventTarget(),window=new EventTarget();document.hidden=false;
  const makeMe=()=>({id:randomUUID(),captainName:'Recorded Captain',coins:100,kit:'witness',place:'saltreach_harbor',crews:[]});
  store.commit({me:makeMe(),rewardsStatus:'ready',rewardsRows:baseline()});
  const auth={readOwnLedger:vi.fn(async()=>good(latest()))};
  const ctx={session,store,state:store.state,auth,document,window,now:Date.now,
    accept:message=>({accepted:true,reason:null,message}),refuse:reason=>({accepted:false,reason,message:reason})};
  ctx.readMonitor=createReadMonitor(ctx);
  const fixture={ctx,session,store,auth,monitor:ctx.readMonitor,
    replaceIdentity(){
      session.clearToken();store.invalidate();ctx.readMonitor.reset();
      store.commit({me:null,rewardsRows:[],rewardsStatus:null});
      session.setToken(`fixture-${randomUUID()}`);store.invalidate();store.commit({me:makeMe()});
    },
    dispose(){store.dispose();ctx.readMonitor.dispose();},
  };
  fixtures.push(fixture);return fixture;
}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(0);});
afterEach(()=>{for(const fixture of fixtures.splice(0))fixture.dispose();expect(vi.getTimerCount()).toBe(0);vi.useRealTimers();});

it('keeps the newer pending read intact when an older success settles first',async()=>{
  const f=setup(),older=deferred(),newer=deferred();
  f.auth.readOwnLedger.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
  const first=refreshAccountRewards(f.ctx),second=refreshAccountRewards(f.ctx);
  await vi.advanceTimersByTimeAsync(300);expect(f.monitor.read().state).toBe('loading');
  older.resolve(good(old()));expect((await first).accepted).toBe(false);
  expect(f.store.state.rewardsStatus).toBe('loading');expect(f.store.state.rewardsRows).toEqual(baseline());
  expect(f.monitor.read().state).toBe('loading');expect(f.auth.readOwnLedger).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(4700);expect(f.monitor.read().state).toBe('slow');
  newer.resolve(good(latest()));expect((await second).accepted).toBe(true);
  expect(f.store.state.rewardsStatus).toBe('ready');expect(f.store.state.rewardsRows).toEqual(latest());
  expect(f.store.read().rewards.ledger.map(row=>({amount:row.amount,reason:row.reason,at:row.at})))
    .toEqual(latest().map(row=>({amount:row.amount,reason:row.reason,at:row.created_at})));
  expect(f.monitor.read().state).toBe('idle');expect(vi.getTimerCount()).toBe(0);
});

it('cannot overwrite a newer successful ledger with an older successful response',async()=>{
  const f=setup(),older=deferred(),newer=deferred();
  f.auth.readOwnLedger.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
  const first=refreshAccountRewards(f.ctx),second=refreshAccountRewards(f.ctx);
  newer.resolve(good(latest()));await second;const before=f.store.read(),connection=f.monitor.read();
  older.resolve(good(old()));expect((await first).accepted).toBe(false);
  expect(f.store.read()).toEqual(before);expect(f.monitor.read()).toEqual(connection);
  expect(f.store.state.rewardsRows).toEqual(latest());expect(vi.getTimerCount()).toBe(0);
});

it.each([503,401])('ignores older HTTP%s after the newest ledger succeeds, preserving session and ready state',async status=>{
  const f=setup(),older=deferred(),newer=deferred(),scope=f.session.getScope(),credential=f.session.getToken();
  f.auth.readOwnLedger.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
  const first=refreshAccountRewards(f.ctx),second=refreshAccountRewards(f.ctx);
  newer.resolve(good(latest()));await second;const before=f.store.read(),connection=f.monitor.read();
  older.resolve(failed(status));expect((await first).accepted).toBe(false);
  expect(f.store.read()).toEqual(before);expect(f.monitor.read()).toEqual(connection);
  expect(f.session.isSignedIn()).toBe(true);expect(f.session.getScope()).toBe(scope);
  expect(f.session.getToken()===credential).toBe(true);expect(vi.getTimerCount()).toBe(0);
});

it.each([503,401])('cannot let older HTTP%s finish or expire a newer still-pending ledger',async status=>{
  const f=setup(),older=deferred(),newer=deferred(),scope=f.session.getScope();
  f.auth.readOwnLedger.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
  const first=refreshAccountRewards(f.ctx),second=refreshAccountRewards(f.ctx);
  await vi.advanceTimersByTimeAsync(300);older.resolve(failed(status));await first;
  expect(f.session.isSignedIn()).toBe(true);expect(f.session.getScope()).toBe(scope);
  expect(f.store.state.rewardsStatus).toBe('loading');expect(f.store.state.rewardsRows).toEqual(baseline());
  expect(f.monitor.read().state).toBe('loading');expect(vi.getTimerCount()).toBe(1);
  newer.resolve(good(latest()));expect((await second).accepted).toBe(true);
  expect(f.store.state.rewardsRows).toEqual(latest());expect(f.monitor.read().state).toBe('idle');
  expect(vi.getTimerCount()).toBe(0);
});

it('keeps the newest failure and its original retry deadline when an older success arrives',async()=>{
  const f=setup(),older=deferred(),newer=deferred();
  f.auth.readOwnLedger.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
  const first=refreshAccountRewards(f.ctx),second=refreshAccountRewards(f.ctx);
  newer.resolve(failed(503));expect((await second).accepted).toBe(false);
  expect(f.store.state.rewardsStatus).toBe('unavailable');
  expect(f.monitor.read()).toMatchObject({state:'error',reason:'not_connected'});expect(vi.getTimerCount()).toBe(1);
  await vi.advanceTimersByTimeAsync(2000);const before=f.store.read(),connection=f.monitor.read();
  older.resolve(good(old()));expect((await first).accepted).toBe(false);
  expect(f.store.read()).toEqual(before);expect(f.monitor.read()).toEqual(connection);
  expect(f.store.state.rewardsRows).toEqual(baseline());expect(vi.getTimerCount()).toBe(1);
  await vi.advanceTimersByTimeAsync(2999);expect(f.auth.readOwnLedger).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);expect(f.auth.readOwnLedger).toHaveBeenCalledTimes(3);
  expect(f.store.state.rewardsStatus).toBe('ready');expect(f.store.state.rewardsRows).toEqual(latest());
  expect(f.monitor.read().state).toBe('online');
  await vi.advanceTimersByTimeAsync(5000);expect(f.monitor.read().state).toBe('idle');expect(vi.getTimerCount()).toBe(0);
});

it('preserves a replacement account when the prior identity later returns401',async()=>{
  const f=setup(),older=deferred();f.auth.readOwnLedger.mockReturnValueOnce(older.promise);
  const first=refreshAccountRewards(f.ctx);f.replaceIdentity();const scope=f.session.getScope();
  await refreshAccountRewards(f.ctx);const before=f.store.read(),credential=f.session.getToken();
  older.resolve(failed(401));expect((await first).accepted).toBe(false);
  expect(f.store.read()).toEqual(before);expect(f.session.getScope()).toBe(scope);expect(f.session.isSignedIn()).toBe(true);
  expect(f.session.getToken()===credential).toBe(true);expect(vi.getTimerCount()).toBe(0);
});

it('freezes the store before disposal and ignores both late success and401 ledger responses',async()=>{
  const f=setup(),older=deferred(),newer=deferred();
  f.auth.readOwnLedger.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
  const first=refreshAccountRewards(f.ctx),second=refreshAccountRewards(f.ctx),before=f.store.read();f.dispose();
  older.resolve(failed(401));newer.resolve(good(latest()));await Promise.all([first,second]);
  expect(f.store.read()).toEqual(before);expect(f.session.isSignedIn()).toBe(true);expect(vi.getTimerCount()).toBe(0);
});
