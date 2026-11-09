// G29 C2/C3 fixture tests: the lock and duel calls through the real api.js with a fake fetch.
import {describe,expect,it} from 'vitest';
import {createApi} from '../src/online/api.js';
import {createLockApi} from '../src/class-demo/lock-api.js';
import {createDuelApi,pendingInvite} from '../src/class-demo/duel-api.js';

function fixture(responses){
  const calls=[];
  const fetchImpl=async(path,options)=>{calls.push({path,method:options.method,auth:options.headers.Authorization??null,body:options.body?JSON.parse(options.body):undefined});
    const [status,body,headers={}]=responses.shift()??[200,{}];
    return new Response(body===null?'':JSON.stringify(body),{status,headers:{'Content-Type':'application/json',...headers}});};
  const session={getToken:()=>'test-token-not-real',clearToken(){},renewToken:async()=>false};
  return {api:createApi({session,fetchImpl}),calls};
}
const lockView={question:'What does the sky over Lisbon look like right now?',place:{name:'Lisbon',latitude:38.72,longitude:-9.14,source:'ip'},weatherSource:'live',choices:[{id:'clear',label:'Sunny or clear'}],opened:false,hintReady:false};

describe('lock api',()=>{
  it('asks the question with or without a chosen place',async()=>{
    const {api,calls}=fixture([[200,lockView],[200,lockView]]);const lock=createLockApi({api});
    expect((await lock.read(null)).data.question).toMatch(/Lisbon/);
    await lock.read({name:'Porto',latitude:41.15,longitude:-8.61});
    expect(calls.map(call=>call.path)).toEqual(['/api/lock','/api/lock?name=Porto&latitude=41.15&longitude=-8.61']);
    expect(calls.every(call=>call.method==='GET'&&call.auth==='Bearer test-token-not-real')).toBe(true);
  });
  it('posts an answer with its action id and only the place fields',async()=>{
    const {api,calls}=fixture([[200,{accepted:true,reason:null,match:'exact',message:'Right.',lock:{...lockView,opened:true}}],[200,{accepted:false,reason:'wrong',match:null,message:'Not quite.',lock:lockView}]]);
    const lock=createLockApi({api});
    expect((await lock.answer({answer:'clear',actionUid:'lock0001',place:{name:'Porto',latitude:41.15,longitude:-8.61,country:'Portugal'}})).data.accepted).toBe(true);
    await lock.answer({answer:'hint',actionUid:'lock0002'});
    expect(calls[0]).toMatchObject({path:'/api/lock/answer',method:'POST',body:{answer:'clear',actionUid:'lock0001',place:{name:'Porto',latitude:41.15,longitude:-8.61}}});
    expect(calls[1].body).toEqual({answer:'hint',actionUid:'lock0002'});
  });
  it('passes refusals through as plain data: 403 demo_closed, 409 too_many_tries, 429 with Retry-After',async()=>{
    const {api}=fixture([[403,{error:{code:'demo_closed',message:'The class demo is closed.'}}],[409,{error:{code:'too_many_tries',message:'Enough.'}}],[429,{error:{code:'too_many_requests'}},{'Retry-After':'7'}]]);
    const lock=createLockApi({api});
    expect(await lock.read(null)).toMatchObject({ok:false,status:403,code:'demo_closed'});
    expect(await lock.answer({answer:'rain',actionUid:'lock0003'})).toMatchObject({ok:false,status:409,code:'too_many_tries'});
    expect(await lock.search('lisbon')).toMatchObject({ok:false,status:429,retryAfterSeconds:7});
  });
  it('searches places with an encoded query',async()=>{
    const {api,calls}=fixture([[200,{places:[{name:'Lisbon',region:'Lisbon',country:'Portugal',latitude:38.7,longitude:-9.1}]}]]);
    await createLockApi({api}).search('  São Paulo ');
    expect(calls[0].path).toBe('/api/places/search?q=S%C3%A3o+Paulo');
  });
});

describe('duel api',()=>{
  it('sends a friendly named three-round challenge',async()=>{
    const {api,calls}=fixture([[200,{duel:{id:'d1',status:'open'}}]]);
    const reply=await createDuelApi({api}).challenge({opponentName:'Brave Puffin 17',signals:['flash','shade','mirror'],actionUid:'duel0001'});
    expect(reply.data.duel.id).toBe('d1');
    expect(calls[0]).toMatchObject({path:'/api/duels',method:'POST',body:{opponentName:'Brave Puffin 17',rounds:3,stake:0,signals:['flash','shade','mirror'],actionUid:'duel0001'}});
  });
  it('answers, reads, lists and declines through the Lantern Duels routes',async()=>{
    const {api,calls}=fixture([[200,{duel:{id:'d 1',reveal:[]}}],[200,{duel:{id:'d 1'}}],[200,{incoming:[]}],[200,{}]]);
    const duels=createDuelApi({api});
    await duels.answer({id:'d 1',signals:['shade','shade','shade'],actionUid:'duel0002'});await duels.detail('d 1');await duels.list();await duels.decline('d 1');
    expect(calls.map(call=>`${call.method} ${call.path}`)).toEqual(['POST /api/duels/d%201/move','GET /api/duels/d%201','GET /api/duels','POST /api/duels/d%201/cancel']);
    expect(calls[0].body).toEqual({signals:['shade','shade','shade'],actionUid:'duel0002'});
  });
  it('keeps an unknown outcome distinguishable from a refusal',async()=>{
    const {api}=fixture([[503,{error:{code:'database_unavailable'}}],[409,{error:{code:'already_applied',message:'Already done.'}}]]);
    const duels=createDuelApi({api});
    expect(await duels.challenge({opponentName:'Ana',signals:['flash','shade','shade'],actionUid:'duel0003'})).toMatchObject({ok:false,status:503});
    expect(await duels.challenge({opponentName:'Ana',signals:['flash','shade','shade'],actionUid:'duel0003'})).toMatchObject({ok:false,status:409,code:'already_applied'});
  });
  it('finds a waiting friendly invitation for me',()=>{
    const list={incoming:[{id:'a',stake:10,canAnswer:true},{id:'b',stake:0,canAnswer:false},{id:'c',stake:0,canAnswer:true}]};
    expect(pendingInvite(list)?.id).toBe('c');expect(pendingInvite(list,new Set(['c']))).toBeNull();expect(pendingInvite(null)).toBeNull();
  });
});
