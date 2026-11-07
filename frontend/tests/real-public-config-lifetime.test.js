// Public config ownership is separate from account epochs, private pending work and disposal.
import {randomUUID} from 'node:crypto';
import {afterEach,expect,it,vi} from 'vitest';
import {createSession} from '../src/online/session.js';
import {createAdapterStore} from '../src/online/case-adapter/store.js';
import {createAdapterTransport} from '../src/online/case-adapter/transport.js';
import {createRealCaseAdapter} from '../src/online/case-adapter/index.js';

const okay=data=>({ok:true,status:200,data});
const config={flags:{sign_in:true,predictions:false,arena:false,case:false,live_presence:false}};
const identity=()=>({id:randomUUID(),captainName:'Recorded captain',coins:0,crews:[],kit:null,place:null});
function held(){let resolve;const promise=new Promise(finish=>{resolve=finish;});return {promise,resolve};}
async function settle(){for(let count=0;count<80;count++)await Promise.resolve();}
afterEach(()=>vi.useRealTimers());

it('keeps the same anonymous config task across private invalidation while an old own-account read stays fenced',async()=>{
  const session=createSession();session.setToken('fixture-'+randomUUID());
  const store=createAdapterStore({session}),publicReply=held(),oldMe=held(),newMe=held();
  const publicGet=vi.fn(()=>publicReply.promise),privateGet=vi.fn()
    .mockImplementationOnce(()=>oldMe.promise).mockImplementationOnce(()=>newMe.promise);
  const transport=createAdapterTransport({store,state:store.state,session,api:{get:privateGet},publicApi:{get:publicGet},
    now:Date.now,random:Math.random,refuse:reason=>({accepted:false,reason,message:''})});
  const publicTask=transport.read('config'),privateTask=transport.read('me');
  try{
    store.invalidate();session.clearToken();transport.clearPending();
    store.commit({accountState:'signed_out',me:null});
    expect(transport.read('config')).toBe(publicTask);expect(publicGet).toHaveBeenCalledTimes(1);
    session.setToken('fixture-'+randomUUID());store.invalidate();transport.clearPending();
    const currentMe=transport.read('me'),current=identity();
    expect(privateGet).toHaveBeenCalledTimes(2);expect(transport.read('config')).toBe(publicTask);
    newMe.resolve(okay(current));expect((await currentMe).mapped.accepted).toBe(true);
    publicReply.resolve(okay(config));expect((await publicTask).mapped.accepted).toBe(true);
    expect(store.state.config).toEqual(config);
    oldMe.resolve(okay({...identity(),captainName:'Older recorded captain'}));expect((await privateTask).mapped.reason).toBe('session_expired');
    expect(store.read().account.captainName).toBe(current.captainName);expect(publicGet).toHaveBeenCalledTimes(1);
  }finally{store.dispose();transport.clearPending();publicReply.resolve(okay(config));oldMe.resolve(okay(identity()));newMe.resolve(okay(identity()));}
});

function factory({signedIn=true}={}){
  const session=createSession();if(signedIn)session.setToken('fixture-'+randomUUID());
  const publicReply=held(),me=identity();let configReads=0;
  const publicApi={get:vi.fn(()=>++configReads===1?publicReply.promise:Promise.resolve(okay(config)))};
  const api={get:vi.fn(async path=>okay(path==='/api/me'?me:path==='/api/crews/me'?{crew:null}:{version:1,data:{}})),
    post:vi.fn(async()=>okay({captainName:me.captainName,rerollsLeft:1}))};
  const auth={read:()=>({configured:true,state:session.isSignedIn()?'signed_in':'signed_out'}),
    restore:vi.fn(async()=>{}),signOut:vi.fn(async()=>{}),readOwnLedger:vi.fn(async()=>({ok:true,rows:[]})),dispose:vi.fn()};
  const adapter=createRealCaseAdapter({session,api,publicApi,auth,clock:()=>Date.now(),random:()=>.5,
    document:{},window:{},readLocalSave:()=>null});
  return {adapter,session,api,publicApi,publicReply,auth};
}

it.each(['sign-out','new-session'])('accepts a held public config across %s and retains its healthy five-minute cadence',async boundary=>{
  vi.useFakeTimers();vi.setSystemTime(0);const f=factory({signedIn:boundary==='sign-out'});
  try{
    await settle();expect(f.publicApi.get).toHaveBeenCalledExactlyOnceWith('/api/config');
    if(boundary==='sign-out')expect((await f.adapter.signOut()).accepted).toBe(true);
    else f.session.setToken('fixture-'+randomUUID());
    f.publicReply.resolve(okay(config));await settle();
    expect(f.auth.restore).toHaveBeenCalledOnce();
    expect(f.adapter.read().account.state).toBe(boundary==='sign-out'?'signed_out':'signed_in');
    if(boundary==='sign-out'){expect(f.api.get).not.toHaveBeenCalled();expect(f.api.post).not.toHaveBeenCalled();}
    await vi.advanceTimersByTimeAsync(5000);expect(f.publicApi.get).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(294999);expect(f.publicApi.get).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);expect(f.publicApi.get).toHaveBeenCalledTimes(2);
  }finally{f.adapter.dispose();f.publicReply.resolve(okay(config));await settle();}
  expect(vi.getTimerCount()).toBe(0);
});

it('ignores a held public config after disposal without callbacks, private reads, events or timers',async()=>{
  vi.useFakeTimers();vi.setSystemTime(0);const f=factory(),updates=[];
  f.adapter.subscribe(event=>updates.push(event));
  await settle();expect(f.publicApi.get).toHaveBeenCalledTimes(1);
  const frozen=f.adapter.read(),eventCount=updates.length;f.adapter.dispose();
  f.publicReply.resolve(okay(config));await settle();
  expect(f.adapter.read()).toEqual(frozen);expect(updates).toHaveLength(eventCount);
  expect(f.auth.restore).not.toHaveBeenCalled();expect(f.api.get).not.toHaveBeenCalled();expect(f.api.post).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);await vi.advanceTimersByTimeAsync(600000);
  expect(f.publicApi.get).toHaveBeenCalledTimes(1);expect(f.auth.dispose).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
