// Real-factory presence lifecycle uses injected clients and controlled unit visibility, never services.
import {randomUUID} from 'node:crypto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createSession} from '../src/online/session.js';
import {createRealCaseAdapter} from '../src/online/case-adapter/index.js';

const okay=data=>({ok:true,status:200,data}),copy=value=>structuredClone(value);
const sample=(x=1,y=2)=>({place:'saltreach_harbor',x,y,facing:'front',moving:true});
async function settle(){for(let step=0;step<80;step++)await Promise.resolve();}
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
class UnitDocument extends EventTarget {
  hidden=false;
  setHidden(value){this.hidden=value;this.dispatchEvent(new Event('visibilitychange'));}
}
function crewFor(me,code='START7'){
  return {id:randomUUID(),code,status:'forming',mode:'crew',mySeat:1,startedAt:null,
    seats:[1,2,3,4].map(seatNo=>({seatNo,holder:seatNo<=2?'player':'open',
      name:seatNo===1?me.captainName:seatNo===2?'Recorded peer':null,
      kit:seatNo===1?'witness':seatNo===2?'stranger':null,isMe:seatNo===1}))};
}
const fixtures=[];
function setup(options={}){
  const {signedIn=true,holdName=false}=options;
  const flag=Object.hasOwn(options,'flag')?options.flag:true;
  const session=createSession();if(signedIn)session.setToken(`fixture-${randomUUID()}`);
  const me={id:randomUUID(),captainName:holdName?null:'Recorded Captain',coins:0,
    kit:'witness',place:'saltreach_harbor',crews:[]},peer={id:randomUUID()};
  let serverCrew=crewFor(me);
  const heldName=holdName?deferred():null,crewReplies=[],requests=[],records=[],authListeners=new Set();
  const document=new UnitDocument(),window=new EventTarget(),emit=vi.fn();
  const api={get:vi.fn(async path=>{
    requests.push({method:'GET',path});
    if(path==='/api/config')return okay({flags:{sign_in:true,live_presence:flag,case:false}});
    if(path==='/api/me')return okay(copy(me));
    if(path==='/api/save')return okay({version:1,data:{},updatedAt:null});
    if(path==='/api/crews/me')return crewReplies.length?crewReplies.shift():okay({crew:copy(serverCrew)});
    throw new Error('Unexpected recorded presence GET');
  }),post:vi.fn(async path=>{
    requests.push({method:'POST',path});
    if(path==='/api/me/name')return heldName?heldName.promise:okay({captainName:me.captainName,rerollsLeft:1});
    if(path==='/api/crews/me/start')return {ok:false,status:409,code:'crew_busy'};
    throw new Error('Unexpected recorded presence POST');
  }),put:vi.fn(async()=>{throw new Error('No save write in the presence fixture');}),
  del:vi.fn(async()=>{throw new Error('No deletion in the presence fixture');})};
  const auth={read:()=>({state:session.isSignedIn()?'signed_in':'signed_out',configured:true}),
    restore:vi.fn(async()=>{}),signOut:vi.fn(async()=>{}),dispose:vi.fn(),
    getAccessToken:vi.fn(async()=>session.getToken()),readOwnLedger:vi.fn(async()=>({ok:true,rows:[]})),
    readCrewSeats:vi.fn(async()=>({ok:true,seats:[{playerId:me.id,seatNo:1},{playerId:peer.id,seatNo:2}]})),
    subscribe(listener){authListeners.add(listener);return ()=>authListeners.delete(listener);},
  };
  const startRealtime=vi.fn(wire=>{
    const live={wire,setPlace:vi.fn(),update:vi.fn(),emote:vi.fn(()=>true),setCrew:vi.fn(),setKit:vi.fn(),
      stop:vi.fn(()=>wire.emit({type:'live_status_changed',state:'off'}))};
    records.push(live);wire.emit({type:'live_status_changed',state:'live'});return live;
  });
  const loadRealtime=vi.fn(async()=>({startRealtime}));
  const adapter=createRealCaseAdapter({session,api,publicApi:api,auth,document,window,emit,loadRealtime,
    supabaseUrl:'https://placeholder.supabase.co',publishableKey:`public-${randomUUID()}`,
    clock:()=>Date.now(),random:()=>.5,isCrewVisible:()=>false,readLocalSave:()=>null,on:()=>()=>{}});
  const fixture={adapter,session,api,auth,document,window,emit,loadRealtime,startRealtime,records,requests,me,peer,authListeners,
    crewReads:()=>requests.filter(request=>request.path==='/api/crews/me'),
    async ready(count=1){await settle();expect(auth.readOwnLedger).toHaveBeenCalled();
      expect(adapter.read().account).toMatchObject({state:'signed_in',hasKit:true,namePending:false});
      expect(records).toHaveLength(count);},
    finishName(){me.captainName='Recorded Captain';heldName.resolve(okay({captainName:me.captainName,rerollsLeft:1}));},
    replaceCrew(code){serverCrew={...serverCrew,code};},
    nextIdentity(){me.id=randomUUID();me.captainName='Second Recorded Captain';serverCrew=crewFor(me,'NEXT7');},
    holdCrew(){const held=deferred();crewReplies.push(held.promise);return held;},
    crewSnapshot:()=>copy(serverCrew),
  };
  fixtures.push(fixture);return fixture;
}
async function crewNotice(f){
  expect((await f.adapter.muster()).reason).toBe('not_ready');await settle();
  const notice=f.adapter.read().notice;expect(notice.reason).toBe('not_ready');return notice;
}
function peerEvents(f,live=f.records.at(-1)){
  const roster={type:'live_presence_changed',place:'saltreach_harbor',room:1,
    shown:[{id:f.peer.id,name:'Recorded peer',kit:'stranger',crewmate:true}],hiddenCount:0,crew:[]};
  live.wire.emit(roster);
  live.wire.emit({type:'live_peer_moved',id:f.peer.id,x:3,z:4,facing:'up',moving:false,everyMs:500});
  return roster;
}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(10000);});
afterEach(()=>{for(const f of fixtures.splice(0))f.adapter.dispose();expect(vi.getTimerCount()).toBe(0);vi.useRealTimers();});

describe('real factory presence lifecycle',()=>{
  it.each([false,'false',undefined])('does not load A4 for non-true flag %s',async flag=>{
    const f=setup({flag});await f.ready(0);
    expect(f.loadRealtime).not.toHaveBeenCalled();expect(f.adapter.read().presence.status).toBe('off');
    expect(f.auth.readCrewSeats).not.toHaveBeenCalled();
  });

  it('keeps a signed-out factory off even with a true public flag',async()=>{
    const f=setup({signedIn:false});await settle();
    expect(f.loadRealtime).not.toHaveBeenCalled();expect(f.auth.readCrewSeats).not.toHaveBeenCalled();
    expect(f.requests).toEqual([{method:'GET',path:'/api/config'}]);
    expect((await f.adapter.reportPosition(sample())).reason).toBe('sign_in_required');
  });

  it('waits for the authoritative captain name before loading A4',async()=>{
    const f=setup({holdName:true});await settle();
    expect(f.api.post).toHaveBeenCalledWith('/api/me/name',undefined);
    expect(f.loadRealtime).not.toHaveBeenCalled();expect(f.auth.readCrewSeats).not.toHaveBeenCalled();
    f.finishName();await f.ready();expect(f.startRealtime).toHaveBeenCalledOnce();
    expect(f.records[0].wire.playerId).toBe(f.me.id);
  });

  it('exposes safe peer views and cosmetic receipts without replacing a held crew refusal',async()=>{
    const f=setup();await f.ready();const live=f.records[0],roster=peerEvents(f);
    expect(f.adapter.read().presence.others).toMatchObject([{name:'Recorded peer',x:3,y:4,facing:'back'}]);
    expect(JSON.stringify(f.adapter.read().presence)).not.toContain(f.peer.id);
    expect(f.emit.mock.calls.map(([event])=>event).filter(event=>event.type==='live_presence_changed')).toEqual([roster]);
    const notice=await crewNotice(f),events=f.emit.mock.calls.length;
    const receipts=[await f.adapter.reportPosition(sample()),await f.adapter.setEmote('wave'),
      await f.adapter.setEmote('cheer'),await f.adapter.reportPosition(sample(NaN)),
      await f.adapter.setEmote('unknown')];
    expect(receipts.map(result=>[result.accepted,result.reason])).toEqual([
      [true,null],[true,null],[false,'emote_cooldown'],[false,'invalid_request'],[false,'invalid_emote'],
    ]);
    for(const receipt of receipts){
      expect(Object.keys(receipt).sort()).toEqual(['accepted','message','reason','view']);
      expect(receipt.message).toEqual(expect.any(String));expect(receipt.view.notice).toEqual(notice);
    }
    expect(live.update).toHaveBeenLastCalledWith({x:1,z:2,facing:'down',moving:true});
    expect(live.emote).toHaveBeenCalledExactlyOnceWith('wave');expect(f.emit).toHaveBeenCalledTimes(events);
    await vi.advanceTimersByTimeAsync(1800);f.adapter.tick();
    expect(f.adapter.read().presence.localEmote).toBeNull();expect(f.adapter.read().notice).toEqual(notice);
  });

  it('stops synchronously on unit visibility and starts only with a fresh sample after 500ms',async()=>{
    const f=setup();await f.ready();const first=f.records[0];peerEvents(f);
    await f.adapter.reportPosition(sample());f.document.setHidden(true);
    expect(first.stop).toHaveBeenCalledOnce();expect(f.adapter.read().presence.others).toEqual([]);
    await f.adapter.reportPosition(sample(99,99));first.wire.emit({type:'live_status_changed',state:'live'});
    expect(first.update).toHaveBeenCalledTimes(1);expect(f.adapter.read().presence.status).toBe('off');
    const crewReads=f.crewReads().length;f.document.setHidden(false);await settle();
    const fresh={...sample(5,6),facing:'back',moving:false};await f.adapter.reportPosition(fresh);
    await vi.advanceTimersByTimeAsync(499);expect(f.records).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);await settle();expect(f.records).toHaveLength(2);
    expect(f.records[1].setPlace).toHaveBeenLastCalledWith('saltreach_harbor');
    expect(f.records[1].update).toHaveBeenCalledExactlyOnceWith({x:5,z:6,facing:'up',moving:false});
    expect(f.crewReads()).toHaveLength(crewReads);
  });

  it('clears identity cosmetics immediately and ignores stale A4 callbacks after signout and disposal',async()=>{
    const f=setup();await f.ready();const first=f.records[0];peerEvents(f);const notice=await crewNotice(f);
    f.session.clearToken();expect(first.stop).toHaveBeenCalledOnce();
    expect(f.adapter.read().presence).toMatchObject({status:'off',others:[],crew:[]});
    const refused=await f.adapter.reportPosition(sample());
    expect(refused).toMatchObject({accepted:false,reason:'sign_in_required',view:{notice}});
    expect(await first.wire.getAccessToken()).toBeNull();
    f.nextIdentity();f.session.setToken(`fixture-${randomUUID()}`);await f.ready(2);
    const current=f.adapter.read(),reads=f.requests.length;
    peerEvents(f,first);first.wire.emit({type:'live_crew_updated',kind:'crew_changed',data:{version:20}});
    await settle();expect(f.adapter.read()).toEqual(current);expect(f.requests).toHaveLength(reads);
    const latest=f.records[1],closed=f.adapter.read(),publications=[];
    const unsubscribe=f.adapter.subscribe(event=>publications.push(event));
    const offCount=()=>f.emit.mock.calls.filter(([event])=>event.type==='live_status_changed'&&event.state==='off').length;
    const beforeOff=offCount();f.adapter.dispose();f.adapter.dispose();
    expect(latest.stop).toHaveBeenCalledOnce();expect(f.adapter.read()).toEqual(closed);
    expect(offCount()).toBe(beforeOff+1);expect(publications).toEqual([]);
    peerEvents(f,latest);f.document.setHidden(true);f.document.setHidden(false);
    f.session.clearToken();f.window.dispatchEvent(new Event('focus'));await settle();
    expect(f.adapter.read()).toEqual(closed);expect(f.requests).toHaveLength(reads);
    expect(publications).toEqual([]);expect(offCount()).toBe(beforeOff+1);unsubscribe();
    expect(f.auth.dispose).toHaveBeenCalledOnce();expect(f.authListeners.size).toBe(0);
  });

  it('rereads a live crew push and drops an older push completion across an identity change',async()=>{
    const f=setup();await f.ready();const first=f.records[0],initial=f.crewReads().length;
    f.replaceCrew('PUSH7');
    first.wire.emit({type:'live_crew_updated',kind:'crew_changed',data:{version:2}});
    await settle();expect(f.crewReads()).toHaveLength(initial+1);
    expect(f.adapter.read()).toMatchObject({crew:{code:'PUSH7'},notice:{message:'Your crew changed.'}});
    const old=f.crewSnapshot(),held=f.holdCrew();
    first.wire.emit({type:'live_crew_updated',kind:'crew_changed',data:{version:3}});await settle();
    expect(f.crewReads()).toHaveLength(initial+2);
    f.session.clearToken();f.nextIdentity();f.session.setToken(`fixture-${randomUUID()}`);await f.ready(2);
    const current=f.adapter.read();expect(current.crew.code).toBe('NEXT7');
    held.resolve(okay({crew:old}));await settle();expect(f.adapter.read()).toEqual(current);
  });
});
