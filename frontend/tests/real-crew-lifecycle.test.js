// Coordinator coverage uses the real factory/session/transport/monitor with recorded replies and fake time.
import {randomUUID} from 'node:crypto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createSession} from '../src/online/session.js';
import {createRealCaseAdapter} from '../src/online/case-adapter/index.js';
import * as crewLifecycle from '../src/online/case-adapter/crew-lifecycle.js';

const okay=data=>({ok:true,status:200,data});
const failed=status=>({ok:false,status,code:status===503?'database_unavailable':'network_error'});
const copy=value=>structuredClone(value);
function deferred(){let resolve;const promise=new Promise(finish=>{resolve=finish;});return {promise,resolve};}
async function settle(){for(let step=0;step<40;step++)await Promise.resolve();}
function surface(extra={}){
  const listeners=new Map();return {...extra,listeners,
    addEventListener(name,callback){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(callback);},
    removeEventListener(name,callback){listeners.get(name)?.delete(callback);},
    emit(name){for(const callback of [...listeners.get(name)??[]])callback();},
  };
}
// The me/save envelope follows real-account-startup-save; seats follow the recorded real-crew fixture.
function recordedCrew({code='START1',two=false,mySeat=1,status='forming',name='Recorded Captain'}={}){
  return {id:randomUUID(),code,status,mode:two?'crew':'solo',mySeat,
    startedAt:status==='forming'?null:new Date(Date.now()).toISOString(),seats:[1,2,3,4].map(seatNo=>({
      seatNo,holder:seatNo===mySeat||two&&seatNo===(mySeat===1?2:1)?'player':'open',
      name:seatNo===mySeat?name:two&&seatNo===(mySeat===1?2:1)?'Recorded Second Captain':null,
      kit:seatNo===mySeat?'witness':two&&seatNo===(mySeat===1?2:1)?'stranger':null,isMe:seatNo===mySeat,
    }))};
}
const fixtures=[];
function setup({visible=false,hasCrew=true}={}){
  const session=createSession();session.setToken(`fixture-${randomUUID()}`);
  const me={id:randomUUID(),captainName:'Recorded Captain',coins:0,kit:'witness',place:'saltreach_harbor',crews:[]};
  let serverCrew=hasCrew?recordedCrew():null,shown=visible;
  const requests=[],crewReplies=[],bus=new Map(),authListeners=new Set();
  const document=surface({hidden:false}),window=surface();
  const api={
    get:vi.fn(async path=>{
      requests.push({method:'GET',path,at:Date.now()});
      if(path==='/api/config')return okay({flags:{sign_in:true,live_presence:false,case:false}});
      if(path==='/api/me')return okay(copy(me));
      if(path==='/api/save')return okay({version:1,data:{},updatedAt:null});
      if(path==='/api/crews/me'){
        const reply=crewReplies.shift();return typeof reply==='function'?reply():reply?copy(reply):okay({crew:copy(serverCrew)});
      }
      throw new Error('Unexpected recorded GET route');
    }),
    post:vi.fn(async(path,body)=>{
      requests.push({method:'POST',path,body:copy(body),at:Date.now()});
      if(path==='/api/me/name')return okay({captainName:me.captainName,rerollsLeft:1});
      if(path==='/api/crews')serverCrew=recordedCrew({code:'CREATE1',name:me.captainName});
      else if(path==='/api/crews/join')serverCrew=recordedCrew({code:'K7QF2M',two:true,mySeat:2,name:me.captainName});
      else if(path==='/api/crews/me/start'){
        serverCrew={...serverCrew,status:'active',startedAt:new Date(Date.now()).toISOString(),
          seats:serverCrew.seats.map(seat=>seat.holder!=='open'?seat:{...seat,holder:'partner',
            name:'Recorded partner',kit:'informant',partnerId:`recorded_partner_${seat.seatNo}`})};
      }else throw new Error('Unexpected recorded POST route');
      return okay({crew:copy(serverCrew)});
    }),
    put:vi.fn(async()=>{throw new Error('This crew fixture has no autosave action');}),
    del:vi.fn(async()=>{throw new Error('This crew fixture has no delete action');}),
  };
  const auth={read:()=>({state:session.isSignedIn()?'signed_in':'signed_out',configured:true}),
    restore:vi.fn(async()=>{}),signOut:vi.fn(async()=>{}),dispose:vi.fn(),
    signIn:vi.fn(async()=>{session.setToken(`fixture-${randomUUID()}`);return {ok:true};}),
    readOwnLedger:vi.fn(async()=>({ok:true,rows:[]})),
    subscribe(callback){authListeners.add(callback);return ()=>authListeners.delete(callback);},
  };
  const adapter=createRealCaseAdapter({session,api,publicApi:api,auth,clock:()=>Date.now(),random:()=>.5,
    document,window,isCrewVisible:()=>shown,readLocalSave:()=>null,
    on(name,callback){if(!bus.has(name))bus.set(name,new Set());bus.get(name).add(callback);return ()=>bus.get(name)?.delete(callback);},
  });
  const fixture={adapter,session,api,auth,me,requests,crewReplies,document,window,bus,authListeners,
    crewReads:()=>requests.filter(request=>request.method==='GET'&&request.path==='/api/crews/me'),
    snapshot:()=>copy(serverCrew),
    setServerCrew(value){serverCrew=copy(value);},
    async ready(){
      for(let step=0;step<80;step++){
        const account=adapter.read().account;
        if(account.canReroll&&account.namePending===false&&auth.readOwnLedger.mock.calls.length)break;
        await Promise.resolve();
      }
      expect(auth.readOwnLedger).toHaveBeenCalledOnce();
      expect(adapter.read().account).toMatchObject({state:'signed_in',hasKit:true,canReroll:true,namePending:false});
      await settle();
    },
    show(value){shown=value;window.emit('focus');},
    nextIdentity(){Object.assign(me,{id:randomUUID(),captainName:'Second Recorded Captain'});
      serverCrew=recordedCrew({code:'NEWREADY',status:'active',name:me.captainName});},
    holdNextCrew(){const held=deferred();crewReplies.push(()=>held.promise);return held;},
  };
  fixtures.push(fixture);return fixture;
}
// Observe the real private lifecycle returned during synchronous factory construction, without a public test hook.
function setupWithCrewLife(options){
  const watched=vi.spyOn(crewLifecycle,'createCrewLifecycle');
  try{
    const fixture=setup(options),life=watched.mock.results.at(-1)?.value;
    expect(typeof life?.nudge).toBe('function');return {...fixture,crewLife:life};
  }finally{watched.mockRestore();}
}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(0);});
afterEach(()=>{for(const fixture of fixtures.splice(0))fixture.adapter.dispose();expect(vi.getTimerCount()).toBe(0);vi.useRealTimers();});

describe('real factory crew lifecycle',()=>{
  it('hydrates own crew with Crew closed and polls forming crews only after the visible five-second cadence',async()=>{
    const f=setup();await f.ready();expect(f.crewReads()).toHaveLength(1);
    expect(f.adapter.read().permissions).toMatchObject({joinCrew:true,muster:true});
    await vi.advanceTimersByTimeAsync(60000);expect(f.crewReads()).toHaveLength(1);
    f.show(true);await settle();await vi.advanceTimersByTimeAsync(0);expect(f.crewReads()).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(4999);expect(f.crewReads()).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);expect(f.crewReads()).toHaveLength(3);
    f.show(false);await settle();await vi.advanceTimersByTimeAsync(20000);expect(f.crewReads()).toHaveLength(3);
    expect(f.api.put).not.toHaveBeenCalled();expect(f.api.del).not.toHaveBeenCalled();
  });

  it('observes each create/join/muster reread without an immediate duplicate or an obsolete poll deadline',async()=>{
    const f=setup({visible:true,hasCrew:false});await f.ready();const initial=f.crewReads().length;
    expect((await f.adapter.createCrew()).accepted).toBe(true);await settle();
    expect(f.crewReads()).toHaveLength(initial+1);
    expect(f.adapter.read().crew.seats.filter(seat=>seat.kind==='player')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(4999);expect(f.crewReads()).toHaveLength(initial+1);
    expect((await f.adapter.joinCrew(' k7q - f2m ')).accepted).toBe(true);
    expect(f.crewReads()).toHaveLength(initial+1);
    expect((await f.adapter.joinCrew('K7QF2M',{confirm:true})).accepted).toBe(true);await settle();
    expect(f.crewReads()).toHaveLength(initial+2);expect(f.adapter.read().permissions.muster).toBe(true);
    expect(f.adapter.read().crew.mySeat).toBe(2);
    await vi.advanceTimersByTimeAsync(1);expect(f.crewReads()).toHaveLength(initial+2);
    expect((await f.adapter.muster()).accepted).toBe(true);await settle();
    expect(f.crewReads()).toHaveLength(initial+3);
    expect(f.adapter.read().crew).toMatchObject({status:'active'});
    expect(f.adapter.read().crew.seats.filter(seat=>seat.kind==='npc')).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(60000);expect(f.crewReads()).toHaveLength(initial+3);
    expect(f.requests.filter(request=>request.method==='POST'&&request.path.startsWith('/api/crews'))
      .map(({path,body})=>({path,body}))).toEqual([
      {path:'/api/crews',body:undefined},{path:'/api/crews/join',body:{code:'K7QF2M'}},{path:'/api/crews/me/start',body:undefined},
    ]);
  });

  it('preserves 5/15/30 own-crew read recovery while the Crew screen stays closed',async()=>{
    const f=setup();f.crewReplies.push(failed(503),failed(0),failed(503),okay({crew:f.snapshot()}));
    await f.ready();expect(f.crewReads()).toHaveLength(1);
    for(const [index,delay] of [5000,15000,30000].entries()){
      await vi.advanceTimersByTimeAsync(delay-1);expect(f.crewReads()).toHaveLength(index+1);
      await vi.advanceTimersByTimeAsync(1);expect(f.crewReads()).toHaveLength(index+2);
    }
    expect(f.adapter.read().crew).toMatchObject({status:'forming',code:'START1'});
    expect(f.adapter.read().permissions.muster).toBe(true);
    await vi.advanceTimersByTimeAsync(60000);expect(f.crewReads()).toHaveLength(4);
  });

  it('keeps a new identity authoritative when an older crew GET finishes after signout and re-sign-in',async()=>{
    const f=setup({visible:true});await f.ready();const old=f.snapshot(),held=f.holdNextCrew(),updates=[];
    const stop=f.adapter.subscribe(event=>updates.push(event.view));
    await vi.advanceTimersByTimeAsync(5000);expect(f.crewReads()).toHaveLength(2);
    expect((await f.adapter.signOut()).accepted).toBe(true);
    expect(f.adapter.read()).toMatchObject({account:{state:'signed_out',hasKit:false},crew:{code:null,status:'none'}});
    const afterSignOut=updates.length,readsBeforeNew=f.crewReads().length;
    f.nextIdentity();expect((await f.adapter.signIn()).accepted).toBe(true);await settle();
    expect(f.crewReads()).toHaveLength(readsBeforeNew+1);
    const current=f.adapter.read();expect(current).toMatchObject({account:{state:'signed_in',captainName:'Second Recorded Captain'},
      crew:{code:'NEWREADY',status:'active'}});
    held.resolve(okay({crew:old}));await settle();expect(f.adapter.read()).toEqual(current);
    expect(updates.slice(afterSignOut).some(view=>view.crew.code===old.code)).toBe(false);
    expect(JSON.stringify(f.adapter.read())).not.toContain(old.id);expect(JSON.stringify(f.adapter.read())).not.toContain(f.me.id);
    await vi.advanceTimersByTimeAsync(60000);expect(f.crewReads()).toHaveLength(readsBeforeNew+1);stop();
  });

  it('disposes all coordinator timers/listeners and ignores late reads and later identity/focus events',async()=>{
    const f=setup({visible:true});await f.ready();const held=f.holdNextCrew();
    await vi.advanceTimersByTimeAsync(5000);expect(f.crewReads()).toHaveLength(2);
    const before=f.adapter.read(),requestCount=f.requests.length;
    f.adapter.dispose();f.adapter.dispose();expect(vi.getTimerCount()).toBe(0);
    held.resolve(okay({crew:f.snapshot()}));f.session.clearToken();f.session.setToken(`fixture-${randomUUID()}`);
    f.window.emit('focus');f.document.hidden=true;f.document.emit('visibilitychange');f.document.hidden=false;f.document.emit('visibilitychange');
    await settle();await vi.advanceTimersByTimeAsync(60000);
    expect(f.requests).toHaveLength(requestCount);expect(f.adapter.read()).toEqual(before);expect(f.auth.dispose).toHaveBeenCalledOnce();
    expect(f.authListeners.size).toBe(0);
    expect([...f.document.listeners.values(),...f.window.listeners.values(),...f.bus.values()].every(listeners=>listeners.size===0)).toBe(true);
  });

  it.each(['success','503'])('keeps a fresh muster authoritative when an older forming poll ends with %s',async oldResult=>{
    const f=setup({visible:true});await f.ready();const old=f.snapshot(),held=f.holdNextCrew();
    await vi.advanceTimersByTimeAsync(5000);expect(f.crewReads()).toHaveLength(2);
    let done=false;
    const mutation=f.adapter.muster().then(result=>{done=true;return result;});
    try{
      await settle();
      // The authoritative reread starts and completes without waiting for the held older GET.
      expect(f.crewReads()).toHaveLength(3);expect(done).toBe(true);
      expect((await mutation).accepted).toBe(true);
      const current=f.adapter.read(),timers=vi.getTimerCount();
      expect(current.crew.status).toBe('active');
      expect(current.crew.seats.filter(seat=>seat.kind==='npc')).toHaveLength(3);
      held.resolve(oldResult==='success'?okay({crew:old}):failed(503));await settle();
      expect(f.adapter.read()).toEqual(current);expect(vi.getTimerCount()).toBe(timers);
      await vi.advanceTimersByTimeAsync(60000);
      // An active crew neither resumes forming polls nor queues recovery for the obsolete failure.
      expect(f.crewReads()).toHaveLength(3);
      expect(f.requests.filter(request=>request.method==='POST'&&request.path==='/api/crews/me/start')).toHaveLength(1);
    }finally{held.resolve(okay({crew:old}));await settle();}
  });

  it('keeps the fresh forming cadence when an obsolete poll returns 503 after a successful join',async()=>{
    const f=setup({visible:true});await f.ready();const old=f.snapshot(),held=f.holdNextCrew();
    await vi.advanceTimersByTimeAsync(5000);expect(f.crewReads()).toHaveLength(2);
    expect((await f.adapter.joinCrew('K7QF2M')).accepted).toBe(true);
    let done=false;
    const mutation=f.adapter.joinCrew('K7QF2M',{confirm:true}).then(result=>{done=true;return result;});
    try{
      await settle();expect(f.crewReads()).toHaveLength(3);expect(done).toBe(true);
      expect((await mutation).accepted).toBe(true);
      expect(f.adapter.read().crew).toMatchObject({status:'forming',code:'K7QF2M',mySeat:2});
      // Healthy cadence must continue even if the superseded request remains hung past its deadline.
      await vi.advanceTimersByTimeAsync(4999);expect(f.crewReads()).toHaveLength(3);
      await vi.advanceTimersByTimeAsync(1);expect(f.crewReads()).toHaveLength(4);
      const current=f.adapter.read();
      await vi.advanceTimersByTimeAsync(2000);held.resolve(failed(503));await settle();
      expect(f.adapter.read()).toEqual(current);
      // The late stale result cannot move the latest healthy-response deadline by two seconds.
      await vi.advanceTimersByTimeAsync(2999);expect(f.crewReads()).toHaveLength(4);
      await vi.advanceTimersByTimeAsync(1);expect(f.crewReads()).toHaveLength(5);
      await vi.advanceTimersByTimeAsync(4999);expect(f.crewReads()).toHaveLength(5);
      await vi.advanceTimersByTimeAsync(1);expect(f.crewReads()).toHaveLength(6);
      expect(f.requests.filter(request=>request.method==='POST'&&request.path==='/api/crews/join')).toHaveLength(1);
      expect(f.adapter.read().account.connection.state).toBe('idle');
    }finally{held.resolve(okay({crew:old}));await settle();}
  });

  it('starts distinct recovery and final GETs before an older poll settles for an unknown muster outcome',async()=>{
    const f=setup({visible:true});await f.ready();const old=f.snapshot(),held=f.holdNextCrew();
    await vi.advanceTimersByTimeAsync(5000);expect(f.crewReads()).toHaveLength(2);
    const normalPost=f.api.post.getMockImplementation();
    // The recorded server applied the first write, but its response was unavailable to the caller.
    f.api.post.mockImplementationOnce(async(path,body)=>{await normalPost(path,body);return failed(503);});
    const before=f.requests.length;let done=false;
    const mutation=f.adapter.muster().then(result=>{done=true;return result;});
    try{
      await settle();expect(done).toBe(true);expect(f.crewReads()).toHaveLength(4);
      expect(f.requests.slice(before).map(({method,path,body})=>({method,path,...(method==='POST'?{body}: {})}))).toEqual([
        {method:'POST',path:'/api/crews/me/start',body:undefined},
        {method:'GET',path:'/api/crews/me'},
        {method:'POST',path:'/api/crews/me/start',body:undefined},
        {method:'GET',path:'/api/crews/me'},
      ]);
      expect((await mutation).accepted).toBe(true);const current=f.adapter.read();
      expect(current.crew.status).toBe('active');
      held.resolve(okay({crew:old}));await settle();expect(f.adapter.read()).toEqual(current);
      await vi.advanceTimersByTimeAsync(60000);expect(f.crewReads()).toHaveLength(4);
      expect(f.requests.filter(request=>request.method==='POST'&&request.path==='/api/crews/me/start')).toHaveLength(2);
    }finally{held.resolve(okay({crew:old}));await settle();}
  });


  it('resumes forming cadence from a fresh recovery read when the resend is also unavailable',async()=>{
    const f=setup({visible:true});await f.ready();const old=f.snapshot(),held=f.holdNextCrew();
    await vi.advanceTimersByTimeAsync(5000);expect(f.crewReads()).toHaveLength(2);
    const unavailable=async(path,body)=>{
      expect(path).toBe('/api/crews/me/start');
      f.requests.push({method:'POST',path,body:copy(body),at:Date.now()});return failed(503);
    };
    f.api.post.mockImplementationOnce(unavailable).mockImplementationOnce(unavailable);
    const before=f.requests.length;let done=false;
    const mutation=f.adapter.muster().then(result=>{done=true;return result;});
    try{
      await settle();expect(done).toBe(true);expect(f.crewReads()).toHaveLength(3);
      expect((await mutation)).toMatchObject({accepted:false,reason:'not_connected'});
      // The refused resend provides no final handler GET: recovery alone must observe the fresh result.
      expect(f.requests.slice(before).map(({method,path})=>({method,path}))).toEqual([
        {method:'POST',path:'/api/crews/me/start'},
        {method:'GET',path:'/api/crews/me'},
        {method:'POST',path:'/api/crews/me/start'},
      ]);
      expect(f.adapter.read().crew.status).toBe('forming');
      // The obsolete pre-write poll is still held when the next healthy deadline arrives.
      await vi.advanceTimersByTimeAsync(4999);expect(f.crewReads()).toHaveLength(3);
      await vi.advanceTimersByTimeAsync(1);expect(f.crewReads()).toHaveLength(4);
      const current=f.adapter.read();
      await vi.advanceTimersByTimeAsync(2000);held.resolve(failed(503));await settle();
      expect(f.adapter.read()).toEqual(current);
      await vi.advanceTimersByTimeAsync(2999);expect(f.crewReads()).toHaveLength(4);
      await vi.advanceTimersByTimeAsync(1);expect(f.crewReads()).toHaveLength(5);
      expect(f.adapter.read().account.connection.state).toBe('idle');
      expect(f.requests.filter(request=>request.method==='POST'&&request.path==='/api/crews/me/start')).toHaveLength(2);
    }finally{held.resolve(okay({crew:old}));await settle();}
  });


  it.each([
    ['none','success'],['none','503'],['active','success'],['active','503'],
  ])('reads a fresh pushed %s crew before an old forming poll settles with %s',async(status,oldResult)=>{
    const f=setupWithCrewLife({visible:true});await f.ready();const old=f.snapshot(),held=f.holdNextCrew();
    await vi.advanceTimersByTimeAsync(5000);expect(f.crewReads()).toHaveLength(2);
    const fresh=status==='none'?null:{...old,status:'active',startedAt:new Date(Date.now()).toISOString(),
      seats:old.seats.map(seat=>seat.holder==='open'?{...seat,holder:'partner',name:'Recorded partner',kit:'informant'}:seat)};
    f.setServerCrew(fresh);let done=false;
    const pushed=f.crewLife.nudge({force:true}).then(result=>{done=true;return result;});
    try{
      await settle();expect(f.crewReads()).toHaveLength(3);expect(done).toBe(true);
      expect((await pushed).mapped.accepted).toBe(true);
      const current=f.adapter.read();expect(current.crew.status).toBe(status);
      held.resolve(oldResult==='success'?okay({crew:old}):failed(503));await settle();
      expect(f.adapter.read()).toEqual(current);
      await vi.advanceTimersByTimeAsync(60000);expect(f.crewReads()).toHaveLength(3);
      expect(f.requests.filter(request=>request.method==='POST'&&request.path.startsWith('/api/crews'))).toHaveLength(0);
    }finally{held.resolve(okay({crew:old}));await settle();}
  });

  it('keeps forced crew reads private and never queues a hidden push for a later show',async()=>{
    const f=setupWithCrewLife({visible:false});await f.ready();expect(f.crewReads()).toHaveLength(1);
    f.document.hidden=true;f.document.emit('visibilitychange');
    await f.crewLife.nudge({force:true});expect(f.crewReads()).toHaveLength(1);
    f.document.hidden=false;f.document.emit('visibilitychange');f.window.emit('focus');
    await vi.advanceTimersByTimeAsync(60000);expect(f.crewReads()).toHaveLength(1);
    f.session.clearToken();await f.crewLife.nudge({force:true});
    f.document.emit('visibilitychange');f.window.emit('focus');
    await vi.advanceTimersByTimeAsync(60000);expect(f.crewReads()).toHaveLength(1);
  });

  it('retains 5/15/30 recovery after a forced read fails and an obsolete poll fails later',async()=>{
    const f=setupWithCrewLife({visible:true});await f.ready();const old=f.snapshot(),held=f.holdNextCrew();
    await vi.advanceTimersByTimeAsync(5000);expect(f.crewReads()).toHaveLength(2);
    f.crewReplies.push(failed(503),failed(503),failed(503),okay({crew:{...old,status:'active'}}));
    try{
      let done=false;const pushed=f.crewLife.nudge({force:true}).then(result=>{done=true;return result;});
      await settle();expect(done).toBe(true);expect(f.crewReads()).toHaveLength(3);
      expect((await pushed).mapped).toMatchObject({accepted:false,reason:'not_connected'});
      await vi.advanceTimersByTimeAsync(4999);expect(f.crewReads()).toHaveLength(3);
      await vi.advanceTimersByTimeAsync(1);expect(f.crewReads()).toHaveLength(4);
      await vi.advanceTimersByTimeAsync(2000);const current=f.adapter.read();held.resolve(failed(503));await settle();
      expect(f.adapter.read()).toEqual(current);
      await vi.advanceTimersByTimeAsync(12999);expect(f.crewReads()).toHaveLength(4);
      await vi.advanceTimersByTimeAsync(1);expect(f.crewReads()).toHaveLength(5);
      await vi.advanceTimersByTimeAsync(29999);expect(f.crewReads()).toHaveLength(5);
      await vi.advanceTimersByTimeAsync(1);expect(f.crewReads()).toHaveLength(6);
      expect(f.adapter.read().crew.status).toBe('active');
      expect(f.requests.filter(request=>request.method==='POST'&&request.path.startsWith('/api/crews'))).toHaveLength(0);
    }finally{held.resolve(okay({crew:old}));await settle();}
  });

});
