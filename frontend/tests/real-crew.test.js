// Recorded A6 answers verify two-tap joining, authoritative seats and safe retry/identity boundaries.
import {describe,expect,it,vi} from 'vitest';
import {createSession} from '../src/online/session.js';
import {createAdapterStore} from '../src/online/case-adapter/store.js';
import {createAdapterTransport} from '../src/online/case-adapter/transport.js';
import {createCrewHandlers} from '../src/online/case-adapter/crew.js';

const okay=data=>({ok:true,status:200,data});
const fail=(status,code)=>({ok:false,status,code});
const crew={id:'private-crew-placeholder',code:'CODE22',status:'forming',mode:'solo',mySeat:1,seats:[
  {seatNo:1,holder:'player',name:'Placeholder captain',kit:'witness',isMe:true},
  ...[2,3,4].map(seatNo=>({seatNo,holder:'open',name:null,kit:null,isMe:false})),
]};
function setup(){
  const session=createSession();session.setToken(String(Math.random()));
  const store=createAdapterStore({session});
  const calls=[],posts=[],reads=[];
  const api={
    async get(path){calls.push({method:'GET',path});const reply=reads.shift();return typeof reply==='function'?reply():reply??okay({crew:store.state.crew});},
    async post(path,body){calls.push({method:'POST',path,body});const reply=posts.shift();return typeof reply==='function'?reply():reply??fail(404,'wrong_code');},
  };
  const ctx={store,state:store.state,session,api,publicApi:api,now:()=>0,random:()=>0.5,
    accept:message=>({accepted:true,reason:null,message}),refuse:reason=>({accepted:false,reason,message:'Placeholder crew message.'}),
    onCrewChanged:vi.fn(async()=>{})};
  ctx.transport=createAdapterTransport(ctx);
  return {ctx,store,calls,posts,reads,handlers:createCrewHandlers(ctx)};
}
describe('real crew intents',()=>{
  it('normalizes a first tap and previews no invented seat without a request',async()=>{
    const test=setup();
    expect((await test.handlers.joinCrew(' k7q - f2m ')).accepted).toBe(true);
    expect(test.calls).toEqual([]);
    expect(test.store.read().crew.joinPreview).toEqual({code:'K7QF2M',seat:null,replaces:null,
      message:'Check this crew code, then confirm joining.'});
  });
  it('requires a matching first tap before a confirmation can spend a guess',async()=>{
    const test=setup();
    await test.handlers.joinCrew('k7qf2m',{confirm:true});
    expect(test.calls).toEqual([]);
    await test.handlers.joinCrew('other2',{confirm:true});
    expect(test.calls).toEqual([]);expect(test.store.read().crew.joinPreview.code).toBe('OTHER2');
    test.posts.push(okay({crew}));
    expect((await test.handlers.joinCrew('oth-er2',{confirm:true})).accepted).toBe(true);
    expect(test.calls[0]).toEqual({method:'POST',path:'/api/crews/join',body:{code:'OTHER2'}});
    expect(test.store.read().crew.joinPreview).toBeNull();
    expect(test.ctx.onCrewChanged).toHaveBeenCalledOnce();
  });
  it.each(['','a'.repeat(21),'bad!code',null])('rejects malformed codes before a preview or request',async code=>{
    const test=setup();expect((await test.handlers.joinCrew(code)).reason).toBe('invalid_request');
    expect(test.calls).toEqual([]);expect(test.store.read().crew.joinPreview).toBeNull();
  });
  it('creates and musters with no request body and uses only server-picked seats',async()=>{
    const test=setup();test.posts.push(okay({crew}));
    expect((await test.handlers.createCrew()).accepted).toBe(true);
    const active={...crew,status:'active',seats:[crew.seats[0],
      ...[2,3,4].map(seatNo=>({seatNo,holder:'partner',name:'Recorded partner',kit:'informant'}))]};
    test.posts.push(okay({crew:active}));expect((await test.handlers.muster()).accepted).toBe(true);
    expect(test.calls.filter(call=>call.method==='POST')).toEqual([
      {method:'POST',path:'/api/crews',body:undefined},{method:'POST',path:'/api/crews/me/start',body:undefined}]);
    expect(test.store.read().crew.seats.slice(1).every(seat=>seat.kind==='npc')).toBe(true);
  });
  it.each(['already_seated','already_started'])('clears the preview and rereads after %s',async code=>{
    const test=setup();await test.handlers.joinCrew('CODE22');test.posts.push(fail(409,code));
    test.reads.push(okay({crew}));
    expect((await test.handlers.joinCrew('CODE22',{confirm:true})).accepted).toBe(true);
    expect(test.store.read().crew.joinPreview).toBeNull();expect(test.store.read().crew.status).toBe('forming');
    expect(test.calls.filter(call=>call.method==='POST')).toHaveLength(1);
  });
  it.each([fail(503,'crew_codes_busy'),fail(0,'network_error')])(
    'rereads an uncertain join before one retry with the unchanged normalized body',async first=>{
      const test=setup();await test.handlers.joinCrew(' c o-d e 22 ');
      test.posts.push(first,okay({crew}));
      expect((await test.handlers.joinCrew('CODE22',{confirm:true})).accepted).toBe(true);
      expect(test.calls.slice(0,3).map(call=>call.method)).toEqual(['POST','GET','POST']);
      const writes=test.calls.filter(call=>call.method==='POST');expect(writes).toHaveLength(2);
      expect(writes[0].body).toEqual({code:'CODE22'});expect(writes[1].body).toEqual(writes[0].body);
    });
  it.each([
    [404,'wrong_code','wrong_code'],[404,'no_crew','crew_required'],[404,'player_not_set_up','not_ready'],
    [409,'kit_needed','kit_required'],[409,'already_in_crew','already_in_crew'],[409,'crew_full','not_ready'],
    [409,'crew_finished','not_ready'],[409,'crew_busy','not_ready'],[422,'validation_error','invalid_request'],
    [429,'too_many_requests','too_many_tries'],[503,'crew_codes_busy','not_connected'],
    [401,'unauthorized','session_expired'],[502,'database_error','internal_error'],
  ])('keeps A6 refusal %s %s refused as %s',async(status,code,reason)=>{
    const test=setup();await test.handlers.joinCrew('CODE22');test.posts.push(fail(status,code),fail(status,code));
    const result=await test.handlers.joinCrew('CODE22',{confirm:true});
    expect(result).toMatchObject({accepted:false,reason});expect(result.message.length).toBeGreaterThan(0);
    expect(test.store.state.crew).toBeNull();
  });
  it('retains the server wait on too many wrong codes',async()=>{
    const test=setup();await test.handlers.joinCrew('CODE22');
    test.posts.push({...fail(429,'too_many_requests'),retryAfterSeconds:42});
    expect(await test.handlers.joinCrew('CODE22',{confirm:true})).toMatchObject({accepted:false,reason:'too_many_tries',retryAfterSeconds:42});
  });
  it('rereads a crew that finished instead of retaining an obsolete forming crew',async()=>{
    const test=setup();test.store.commit({crew});test.posts.push(fail(409,'crew_finished'));
    test.reads.push(okay({crew:null}));
    expect((await test.handlers.muster()).accepted).toBe(false);
    expect(test.calls.map(call=>call.method)).toEqual(['POST','GET']);
    expect(test.store.state.crew).toBeNull();expect(test.ctx.onCrewChanged).toHaveBeenCalledOnce();
  });
  it('ignores a completed change when its follow-up read belongs to an old account',async()=>{
    const test=setup();test.posts.push(okay({crew}));let finish;
    test.reads.push(()=>new Promise(resolve=>{finish=resolve;}));const pending=test.handlers.createCrew();
    await vi.waitFor(()=>expect(typeof finish).toBe('function'));
    test.store.invalidate();test.store.commit({crew:null});test.ctx.session.clearToken();finish(okay({crew}));
    expect((await pending).reason).toBe('session_expired');expect(test.store.state.crew).toBeNull();
    expect(test.ctx.onCrewChanged).not.toHaveBeenCalled();
  });
  it('rejects malformed success without adding a crew',async()=>{
    const test=setup();test.posts.push(okay({crew:{...crew,seats:[]}}));
    expect((await test.handlers.createCrew()).reason).toBe('invalid_request');expect(test.store.state.crew).toBeNull();
  });
});
