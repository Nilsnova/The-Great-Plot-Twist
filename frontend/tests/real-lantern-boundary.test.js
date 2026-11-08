// The G9 facade has no lantern-claim route. All clients, tokens and replies are injected.
import {afterEach,expect,it,vi} from 'vitest';
import {createRealCaseAdapter} from '../src/online/case-adapter/index.js';
import {createSession} from '../src/online/session.js';
const owners=[];
afterEach(()=>{for(const adapter of owners.splice(0))adapter.dispose();});
const okay=data=>({ok:true,status:200,data});
const stable=view=>({...view,revision:0,notice:null});
const flush=async()=>{for(let i=0;i<25;i++)await Promise.resolve();};
function heldSetup(signedIn){
  const session=createSession();if(signedIn)session.setToken('fixture-'+crypto.randomUUID());
  let release;const pending=new Promise(resolve=>{release=resolve;});
  const publicApi={get:vi.fn(()=>pending)},api={get:vi.fn(),post:vi.fn(),put:vi.fn(),del:vi.fn()};
  const write=vi.fn(),clear=vi.fn(),auth={read:()=>({state:signedIn?'signed_in':'signed_out',configured:false}),
    restore:async()=>{},dispose(){}};
  const adapter=createRealCaseAdapter({session,api,publicApi,auth,document:{},window:{},
    readLocalSave:()=>({version:1,actions:['to_desk']}),writeLocalSave:write,clearLocalSave:clear});
  owners.push(adapter);return {adapter,session,api,publicApi,write,clear,release};
}
it.each([false,true])('refuses locally during pending config, signed in %s, without changing private state',async signedIn=>{
  const item=heldSetup(signedIn);await flush();const before=stable(item.adapter.read());
  const token=item.session.getToken(),scope=item.session.getScope(),reads=item.publicApi.get.mock.calls.length;
  let reply;const task=item.adapter.claimLantern('sea').then(value=>{reply=value;});
  try{
    await flush();expect(reply).toMatchObject({accepted:false,reason:'festival_closed',message:'The lantern festival is not open.'});
    expect(stable(reply.view)).toEqual(before);expect(item.session.getToken()===token).toBe(true);
    expect(item.session.getScope()).toBe(scope);expect(item.publicApi.get).toHaveBeenCalledTimes(reads);
    for(const method of Object.values(item.api))expect(method).not.toHaveBeenCalled();
    expect(item.write).not.toHaveBeenCalled();expect(item.clear).not.toHaveBeenCalled();
  }finally{item.adapter.dispose();item.release(okay({flags:{case:true,festival:true}}));await task;}
});
it('preserves a hydrated wallet, save, crew, world, effects and local journal',async()=>{
  const session=createSession();session.setToken('fixture-'+crypto.randomUUID());
  const journal=JSON.stringify({version:1,actions:['to_desk']}),write=vi.fn(),clear=vi.fn();
  const me={id:crypto.randomUUID(),captainName:'Recorded Captain',coins:137,kit:'witness',place:'saltreach_harbor',crews:[]};
  const api={get:vi.fn(async path=>okay(path==='/api/me'?me:path==='/api/crews/me'?{crew:null}
    :{version:1,data:{kind:'world',actions:[],place:'saltreach_harbor'},updatedAt:null})),
    post:vi.fn(async()=>okay({captainName:'Recorded Captain',rerollsLeft:1})),put:vi.fn(),del:vi.fn()};
  const publicApi={get:vi.fn(async()=>okay({flags:{case:true,festival:true}}))};
  const auth={read:()=>({state:'signed_in',configured:false}),restore:async()=>{},dispose(){},
    readOwnLedger:async()=>({ok:true,rows:[{amount:7,reason:'clue_reward',at:'2026-11-07T12:00:00Z'}]})};
  const adapter=createRealCaseAdapter({session,api,publicApi,auth,document:{},window:{},
    readLocalSave:()=>journal,writeLocalSave:write,clearLocalSave:clear});owners.push(adapter);
  await vi.waitFor(()=>{expect(adapter.read().captain.coins).toBe(137);expect(adapter.read().rewards.ledger).toHaveLength(1);});
  await flush();const before=stable(adapter.read()),scope=session.getScope(),token=session.getToken();
  const calls=[publicApi.get,...Object.values(api)].map(fn=>fn.mock.calls.length);
  for(const colour of ['sea','unpublished-colour','']){
    const reply=await adapter.claimLantern(colour);expect(reply.reason).toBe('festival_closed');
    expect(reply.accepted).toBe(false);expect(stable(reply.view)).toEqual(before);
  }
  expect([publicApi.get,...Object.values(api)].map(fn=>fn.mock.calls.length)).toEqual(calls);
  expect(session.getScope()).toBe(scope);expect(session.getToken()===token).toBe(true);
  expect(write).not.toHaveBeenCalled();expect(clear).not.toHaveBeenCalled();
  expect(journal).toBe(JSON.stringify({version:1,actions:['to_desk']}));
});
it.each([undefined,null,4,{}])('retains unknown_colour validation for malformed input %s',async colour=>{
  const item=heldSetup(false);await flush();const result=await item.adapter.claimLantern(colour);
  expect(result).toMatchObject({accepted:false,reason:'unknown_colour'});
  expect(item.api.post).not.toHaveBeenCalled();item.adapter.dispose();item.release(okay({flags:{}}));
});
it('retains the disposed receipt and frozen view after disposal',async()=>{
  const item=heldSetup(true);await flush();item.adapter.dispose();const before=item.adapter.read();
  expect(await item.adapter.claimLantern('sea')).toMatchObject({accepted:false,reason:'disposed',view:before});
  expect(item.adapter.read()).toEqual(before);expect(item.api.post).not.toHaveBeenCalled();item.release(okay({flags:{}}));
});
