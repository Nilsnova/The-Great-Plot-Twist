// Polling and transport cooperate without duplicate reads or unbounded retry timers.
import {afterEach, expect, it, vi} from 'vitest';
import {createAdapterPolling} from '../src/online/adapter/polling.js';
import {createAdapterTransport} from '../src/online/adapter/transport.js';
import {createAdapterStore} from '../src/online/adapter/store.js';
import {createSession} from '../src/online/session.js';
import {createRealAdapter} from '../src/online/adapter/index.js';

afterEach(() => vi.useRealTimers());

it('retries config after five, fifteen and thirty seconds, then waits for a manual read', async () => {
  vi.useFakeTimers();
  const read=vi.fn(async()=>({mapped:{accepted:false,reason:'not_connected'}}));
  const listeners=new Map();
  const polling=createAdapterPolling({now:Date.now,random:()=>0,document:{},window:{
    addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)},
    store:{isClosed:()=>false},transport:{read}});
  try {
    await polling.start();
    expect(read).toHaveBeenCalledTimes(1);
    await listeners.get('focus')();
    await listeners.get('focus')();
    expect(read).toHaveBeenCalledTimes(1);
    for(const [delay,count] of [[5000,2],[15000,3],[30000,4]]){
      await vi.advanceTimersByTimeAsync(delay);
      expect(read).toHaveBeenCalledTimes(count);
    }
    await vi.advanceTimersByTimeAsync(600000);
    expect(read).toHaveBeenCalledTimes(4);
    expect(vi.getTimerCount()).toBe(0);
    await listeners.get('focus')();
    expect(read).toHaveBeenCalledTimes(4);
    await polling.refresh({manual:true});
    expect(read).toHaveBeenCalledTimes(5);
    await vi.advanceTimersByTimeAsync(5000);
    expect(read).toHaveBeenCalledTimes(6);
  } finally {polling.dispose();}
  expect(vi.getTimerCount()).toBe(0);
});

it('shares an in-flight read while keeping a new identity separate from the old answer', async () => {
  const session=createSession();
  session.setToken('fixture-'+crypto.randomUUID());
  const store=createAdapterStore({session});
  const answers=[];
  const get=vi.fn(()=>new Promise(resolve=>answers.push(resolve)));
  const ctx={state:store.state,store,session,api:{get},publicApi:{get},
    now:Date.now,random:Math.random,refuse:reason=>({accepted:false,reason,message:''})};
  const transport=createAdapterTransport(ctx);
  const first=transport.read('me');
  expect(transport.read('me')).toBe(first);
  expect(get).toHaveBeenCalledTimes(1);
  store.invalidate();transport.clearPending();
  session.clearToken();session.setToken('fixture-'+crypto.randomUUID());
  const next=transport.read('me');
  expect(get).toHaveBeenCalledTimes(2);
  const me={id:crypto.randomUUID(),captainName:'Recorded Captain',coins:0,crews:[],kit:null,place:null};
  answers[1]({ok:true,status:200,data:me});
  expect((await next).mapped.accepted).toBe(true);
  answers[0]({ok:true,status:200,data:{...me,captainName:'Older Captain'}});
  expect((await first).mapped.reason).toBe('session_expired');
  expect(store.read().account.captainName).toBe('Recorded Captain');
  store.dispose();
});

it.each(['me'])('finishes account loading after an automatic %s recovery',async kind=>{
  vi.useFakeTimers();
  const session=createSession();session.setToken('fixture-'+crypto.randomUUID());
  const me={id:crypto.randomUUID(),captainName:'Recorded Captain',coins:0,crews:[],kit:null,place:null};
  let failed=false;
  const replies={'/api/config':{flags:{sign_in:true}},'/api/me':me};
  const api={get:vi.fn(async path=>{
    if(path==='/api/'+kind&&!failed){failed=true;return {ok:false,status:503,code:'database_unavailable'};}
    return {ok:true,status:200,data:replies[path]};
  }),post:vi.fn(async()=>({ok:true,status:200,data:{captainName:me.captainName,rerollsLeft:1}}))};
  const adapter=createRealAdapter({session,api,publicApi:api,auth:{},document:{},window:{}});
  try{
    await vi.advanceTimersByTimeAsync(0);
    expect(api.post).toHaveBeenCalledTimes(kind==='me'?0:1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(adapter.read().account).toMatchObject({canReroll:true});
    expect(api.get).not.toHaveBeenCalledWith('/api/crews/me');expect(api.get).not.toHaveBeenCalledWith('/api/save');
  }finally{adapter.dispose();}
  expect(vi.getTimerCount()).toBe(0);
});

it('still retries a failed me read while name initialization holds the hydration task',async()=>{
  vi.useFakeTimers();
  const session=createSession();session.setToken('fixture-'+crypto.randomUUID());
  const me={id:crypto.randomUUID(),captainName:'Recorded Captain',coins:0,crews:[],kit:null,place:null};
  let meReads=0,posts=0,finishName;
  const api={get:vi.fn(async path=>{
    if(path==='/api/me'&&++meReads===2)return {ok:false,status:503,code:'database_unavailable'};
    return {ok:true,status:200,data:path==='/api/config'?{flags:{sign_in:true}}:me};
  }),post:vi.fn(async()=>{
    if(++posts===1)return {ok:false,status:503,code:'database_unavailable'};
    return new Promise(resolve=>{finishName=resolve;});
  })};
  const adapter=createRealAdapter({session,api,publicApi:api,auth:{},document:{},window:{}});
  try{
    await vi.advanceTimersByTimeAsync(0);
    expect(typeof finishName).toBe('function');expect(meReads).toBe(2);
    await vi.advanceTimersByTimeAsync(5000);
    expect(meReads).toBe(3);
    finishName({ok:true,status:200,data:{captainName:me.captainName,rerollsLeft:1}});
    await vi.advanceTimersByTimeAsync(0);
    expect(posts).toBe(2);
    expect(adapter.read().account.canReroll).toBe(true);
  }finally{adapter.dispose();}
  expect(vi.getTimerCount()).toBe(0);
});
