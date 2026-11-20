// Shared core contract failures and exact retries. Used by the client test suite.
import {describe,it,expect} from 'vitest';
import {readSharedSnapshot} from '../../src/island/shared-snapshot.js';
import {createSharedIntents} from '../../src/island/shared-intents.js';
import {createIslandApi} from '../../src/island/api.js';
import {sharedFixture, receipt} from './shared-core-fixture.js';
import {personalReply} from './economy-fixture.js';
describe('coherent shared core', () => {
 it('keeps the personal v1 intent through401 and a same-actor authorized refresh',async()=>{
  let generation=1,profile=personalReply().captain,allocated=0;const bodies=[];
  const api=createIslandApi({transport:{get:async()=>({ok:true,data:{code:'ISLE-K7Q2M',coins:10,waveBest:0,flags:0,spots:[]}}),post:async(_path,body)=>{
   bodies.push(structuredClone(body));return bodies.length<3?{ok:false,status:bodies.length===1?503:401}:{ok:true,data:personalReply()};
  }},personalCaptain:()=>profile,personalScope:()=> 'actor1:ISLE-K7Q2M',authGeneration:()=>generation,makeUid:()=>`personal${++allocated}`});
  await api.learnSkill({skill:'steady_aim'});await api.learnSkill({skill:'steady_aim'});
  generation=2;await api.getIsland();profile={...profile,revision:'99'};
  expect((await api.learnSkill({skill:'steady_aim'})).ok).toBe(true);
  expect(bodies).toEqual([bodies[0],bodies[0],bodies[0]]);expect(allocated).toBe(1);
 });
 it('cannot spend the previous own snapshot while the canonical visit context is unresolved',async()=>{
  const snapshot=sharedFixture(),posts=[];
  const api=createIslandApi({transport:{get(){},post:(...args)=>{posts.push(args);return Promise.resolve({ok:false,status:503});}},
    economy:()=>snapshot.economy,sharedSnapshot:()=>snapshot,getEconomy:()=>null,getActorId:()=>snapshot.actorId});
  expect((await api.build({spot:'cannon_1',kind:'cannon'})).code).toBe('economy_context_required');
  expect(posts).toEqual([]);
 });
 it('decodes installed domain capabilities but rejects contradictory availability reasons',()=>{
  const snapshot=sharedFixture();snapshot.capabilities.market={available:true,reason:null};
  expect(readSharedSnapshot(snapshot)).not.toBeNull();
  snapshot.capabilities.market.reason='unavailable';expect(readSharedSnapshot(snapshot)).toBeNull();
  snapshot.capabilities.market={available:'true',reason:null};expect(readSharedSnapshot(snapshot)).toBeNull();
 });
 it('refuses to replace an unreadable persisted intent with a fresh UID', () => {
  let allocated=0;
  const storage={getItem:()=>'{broken',setItem(){}};
  const snapshot=sharedFixture(),intents=createSharedIntents({storage,makeUid:()=>`intent00${++allocated}`});
  expect(intents.begin(snapshot,'build',{spot:'cannon_1',kind:'cannon'},snapshot.quotes.build[0].intent)).toBeNull();
  expect(allocated).toBe(0);
 });
 it('retains the exact unknown core intent through401 and same-actor restoration',async()=>{
  const entries=new Map(),storage={getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value)};
  const snapshot=sharedFixture(),bodies=[];let allocated=0;
  const transport={get:async()=>({ok:true,data:snapshot}),post:async(_path,body)=>{
   bodies.push(structuredClone(body));
   return bodies.length<3?{ok:false,status:bodies.length===1?503:401}:{ok:true,data:receipt(snapshot,body,'build')};
  }};
  const config={transport,economy:()=>snapshot.economy,sharedSnapshot:()=>snapshot,pendingStorage:storage,makeUid:()=>`intent00${++allocated}`};
  const first=createIslandApi(config);await first.build({spot:'cannon_1',kind:'cannon'});
  expect((await first.build({spot:'cannon_1',kind:'cannon'})).status).toBe(401);
  snapshot.quotes.build[0].intent.quotedCoins='999';
  const restored=createIslandApi(config);expect((await restored.build({spot:'cannon_1',kind:'cannon'})).ok).toBe(true);
  expect(bodies).toEqual([bodies[0],bodies[0],bodies[0]]);expect(allocated).toBe(1);
 });
 it('requires decimal money, explicit quotes and target identity', () => {
  const good=sharedFixture(); expect(readSharedSnapshot(good)).not.toBeNull();
  good.quotes.build[0].intent.quotedCoins=10; expect(readSharedSnapshot(good)).toBeNull();
  const missing=sharedFixture(); delete missing.quotes.build[0].target; expect(readSharedSnapshot(missing)).toBeNull();
 });
 it('keeps the complete uncertain intent across a reload for only its actor', () => {
  const entries=new Map(),storage={getItem:k=>entries.get(k),setItem:(k,v)=>entries.set(k,v)};
  const context=sharedFixture(),first=createSharedIntents({storage,makeUid:()=> 'original'});
  const body=first.begin(context,'build',{spot:'cannon_1',kind:'cannon'},context.quotes.build[0].intent);
  const next=createSharedIntents({storage,makeUid:()=> 'replacement'}); context.quotes.build[0].intent.quotedCoins='99';
  expect(next.begin(context,'build',{spot:'cannon_1',kind:'cannon'},context.quotes.build[0].intent)).toEqual(body);
  context.actorId='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  expect(next.begin(context,'build',{spot:'cannon_1',kind:'cannon'},context.quotes.build[0].intent).actionUid).toBe('replacement');
 });
 it('posts the frozen quote and accepts a historical receipt without a replacement island',async()=>{
  let snapshot=sharedFixture(),bodies=[];
  const transport={get:async()=>({ok:true,data:snapshot}),post:async(path,body)=>{
   bodies.push(structuredClone(body)); if(bodies.length===1)return {ok:false,status:503};
   return {ok:true,data:receipt(snapshot,body,'build')};
  }};
  const api=createIslandApi({transport,economy:()=>snapshot.economy,sharedSnapshot:()=>snapshot,makeUid:()=> 'same'});
  expect((await api.getIsland()).ok).toBe(true);
  expect((await api.build({spot:'cannon_1',kind:'cannon'})).ok).toBe(false);
  snapshot=structuredClone(snapshot);snapshot.quotes.build[0].intent.quotedCoins='500';
  const answer=await api.build({spot:'cannon_1',kind:'cannon'});
  expect(answer.ok).toBe(true);expect(answer.sharedReceipt).toBe(true);
  expect(answer.data.currentEconomy).toBeNull();expect(bodies[1]).toEqual(bodies[0]);
  expect(bodies[0]).not.toHaveProperty('actorId');expect(bodies[0]).not.toHaveProperty('accountId');
 });
});

it('keeps a visitor retry after its display code has been normalized',async()=>{
 const snapshot=sharedFixture();snapshot.code='FR3ND';const bodies=[];
 const api=createIslandApi({transport:{get(){},post:async(path,body)=>{bodies.push(body);return {ok:false,status:503};}},economy:()=>snapshot.economy,sharedSnapshot:()=>snapshot,makeUid:(()=>{let uid=0;return()=>String(++uid);})()});
 await api.build({spot:'cannon_1',kind:'cannon',code:'ISLE-FR3ND'});
 snapshot.quotes.build[0].intent.quotedCoins='500';
 await api.build({spot:'cannon_1',kind:'cannon',code:'FR3ND'});
 expect(bodies[1]).toEqual(bodies[0]);
});
it('accepts an immutable effect while withholding an unusable live projection',async()=>{
 const snapshot=sharedFixture();let response;
 const api=createIslandApi({transport:{get(){},post:async(path,body)=>{response=receipt(snapshot,body,'build');response.currentEconomy={broken:true};return {ok:true,data:response};}},economy:()=>snapshot.economy,sharedSnapshot:()=>snapshot});
 const answer=await api.build({spot:'cannon_1',kind:'cannon'});
 expect(answer.ok).toBe(true);expect(answer.data.currentEconomy).toBeNull();expect(answer.data.receipt).toEqual(response.receipt);
});
it('refuses a receipt with another actor, UID, epoch or charged price while retaining its original request',async()=>{
 for(const field of ['actor','uid','epoch','price']){
  const snapshot=sharedFixture(),bodies=[];
  const api=createIslandApi({transport:{get(){},post:async(path,body)=>{
   bodies.push(structuredClone(body));const data=receipt(snapshot,body,'build');
   if(bodies.length===1){if(field==='actor')data.receipt.actorId='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    if(field==='uid')data.receipt.actionUid='another';if(field==='epoch')data.receipt.origin.runEpoch='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    if(field==='price')data.receipt.result.chargedCoins='999';}
   return {ok:true,data};
  }},economy:()=>snapshot.economy,sharedSnapshot:()=>snapshot});
  expect((await api.build({spot:'cannon_1',kind:'cannon'})).code).toBe('unreadable');
  snapshot.quotes.build[0].intent.quotedCoins='1000';
  expect((await api.build({spot:'cannon_1',kind:'cannon'})).ok).toBe(true);expect(bodies[1]).toEqual(bodies[0]);
 }
});
it.each(['1',true,4])('retains the research intent when the successful receipt has malformed tier %j',async tier=>{
 const snapshot=sharedFixture(),bodies=[];
 const api=createIslandApi({transport:{get(){},post:async(_path,body)=>{
  bodies.push(structuredClone(body));const reply=receipt(snapshot,body,'research');
  if(bodies.length===1)reply.receipt.result.research.tier=tier;
  return {ok:true,data:reply};
 }},economy:()=>snapshot.economy,sharedSnapshot:()=>snapshot});
 expect((await api.research({branch:'cannon'})).code).toBe('unreadable');
 snapshot.quotes.research[0].intent.quotedCoins='999';
 expect((await api.research({branch:'cannon'})).ok).toBe(true);expect(bodies[1]).toEqual(bodies[0]);
});
it('does not downgrade a pinned shared read when the server omits the versioned snapshot',async()=>{
 let snapshot=sharedFixture();const api=createIslandApi({transport:{get:async()=>({ok:true,data:snapshot}),post(){}}});
 expect((await api.getIsland()).ok).toBe(true);snapshot={code:snapshot.code,coins:9999,waveBest:0,flags:0,spots:[]};
 expect((await api.getIsland()).code).toBe('unreadable');
});
it('keeps a later uncertain operation when an earlier duplicate response completes',()=>{
 const snapshot=sharedFixture(),target={spot:'cannon_1',kind:'cannon'};let count=0;
 const pending=createSharedIntents({makeUid:()=>String(++count)}),intent=snapshot.quotes.build[0].intent;
 const first=pending.begin(snapshot,'build',target,intent);pending.finish(snapshot,'build',target,first.actionUid);
 const second=pending.begin(snapshot,'build',target,intent);pending.finish(snapshot,'build',target,first.actionUid);
 expect(pending.pending(snapshot,'build',target)).toEqual(second);
});

it('posts exact CAS bodies for every quoted action and accepts their actual domain receipts',async()=>{
 const {isSharedReceipt}=await import('../../src/island/shared-receipts.js');
 const snapshot=sharedFixture(),instanceId='11111111-1111-4111-8111-111111111111';
 const expected={instanceId,kind:'cannon',level:5,spec:null,treeA:0,treeB:0,revision:'9007199254740999'};
 const actions=[
  ['upgrade',{spot:'cannon_1'},{spot:'cannon_1',kind:'cannon',instanceId,expectedLevel:4,quotedCoins:'170'},'upgrade',
   {spot:'cannon_1',kind:'cannon',instanceId,level:5,chargedCoins:'170',refundedCoins:'0'}],
  ['demolish',{spot:'cannon_1'},{spot:'cannon_1',kind:'cannon',instanceId,expectedLevel:5,quotedCoins:'85'},'demolish',
   {spot:'cannon_1',kind:'cannon',instanceId,level:5,chargedCoins:'0',refundedCoins:'85'}],
  ['research',{branch:'cannon',tier:1,choice:null,change:false},snapshot.quotes.research[0].intent,'research',
   {chargedCoins:'180',research:{branch:'cannon',tier:1,choice2:null,choice3:null,revision:'1',coinsPaid:'180'}}],
  ['towerSkill',{spot:'cannon_1',spec:'blast'},{spot:'cannon_1',spec:'blast',expected,quotedCoins:'0'},'specialise',
   {chargedCoins:'0',building:{...expected,spot:'cannon_1',spec:'blast',revision:'9007199254741000'}}],
  ['towerTree',{spot:'cannon_1',path:'a',tier:1},{spot:'cannon_1',path:'a',tier:1,expected,quotedCoins:'300'},'tower_tree',
   {chargedCoins:'300',building:{...expected,spot:'cannon_1',treeA:1,revision:'9007199254741000'}}],
  ['wreck',{amount:25},{amount:25,quotedCoins:'25'},'wreck',{chargedCoins:'10',wreckPaid:500}],
 ];
 for(const [group,target,intent,action,result] of actions){
  snapshot.quotes[group]=[{target,intent,available:true,reason:null}];
  const pending=createSharedIntents({makeUid:()=> 'full-intent'}),body=pending.begin(snapshot,group,target,intent,'ISLE-K7Q2M');
  expect(body).toMatchObject(intent);expect(body).not.toHaveProperty('action');
  const reply=receipt(snapshot,body,action);reply.receipt.result=result;
  expect(isSharedReceipt(reply,{snapshot,group,body})).toBe(true);
 }
});
it('submits the exact displayed demolition quote and refuses a quote from another target or epoch',async()=>{
 const snapshot=sharedFixture(),instanceId='11111111-1111-4111-8111-111111111111';
 const quote={quoteVersion:1,actorId:snapshot.actorId,economy:snapshot.economy,quote:{target:{spot:'wall_1'},intent:{spot:'wall_1',kind:'wall',instanceId,expectedLevel:3,quotedCoins:'12345678901234567890'},available:true,reason:null}};
 const bodies=[],api=createIslandApi({transport:{get:async()=>({ok:true,data:quote}),post:async(path,body)=>{bodies.push(body);const result=receipt(snapshot,body,'demolish');result.receipt.result={spot:body.spot,kind:body.kind,level:3,instanceId,chargedCoins:'0',refundedCoins:body.quotedCoins};return {ok:true,data:result};}},economy:()=>snapshot.economy,sharedSnapshot:()=>snapshot});
 const shown=(await api.demolishQuote({spot:'wall_1'})).data;
 expect((await api.demolish({spot:'wall_1',quote:shown})).ok).toBe(true);expect(bodies[0].quotedCoins).toBe('12345678901234567890');
 expect((await api.demolish({spot:'cannon_1',quote:shown})).ok).toBe(false);
 shown.economy={...shown.economy,runEpoch:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'};
 expect((await api.demolish({spot:'wall_1',quote:shown})).ok).toBe(false);expect(bodies).toHaveLength(1);
});
it('does not send any shared intent when its price or CAS basis is missing',async()=>{
 for(const invalid of ['money','basis','missing','paused']){
  const snapshot=sharedFixture();
  if(invalid==='money')snapshot.quotes.build[0].intent.quotedCoins=10;
  if(invalid==='basis')delete snapshot.quotes.build[0].intent.instanceId;
  if(invalid==='missing')snapshot.quotes.build[0].intent=null;
  if(invalid==='paused')snapshot.admissionState='paused';
  let posted=0;const api=createIslandApi({transport:{get(){},post:async()=>{posted++;}},economy:()=>snapshot.economy,sharedSnapshot:()=>snapshot});
  expect((await api.build({spot:'cannon_1',kind:'cannon'})).ok).toBe(false);expect(posted).toBe(0);
 }
});
it('binds shared sends and replies to an opaque auth generation without posting it as actor identity',async()=>{
 let generation=1,snapshot=sharedFixture(),release;const bodies=[];
 const api=createIslandApi({transport:{get:async()=>({ok:true,data:snapshot}),post:(path,body)=>{bodies.push(body);return new Promise(resolve=>{release=()=>resolve({ok:true,data:receipt(snapshot,body,'build')});});}},economy:()=>snapshot.economy,sharedSnapshot:()=>snapshot,authGeneration:()=>generation,makeUid:()=> 'preserved'});
 await api.getIsland();const pending=api.build({spot:'cannon_1',kind:'cannon'});
 generation=2;release();expect((await pending).code).toBe('auth_context_changed');
 expect((await api.build({spot:'cannon_1',kind:'cannon'})).code).toBe('economy_context_required');expect(bodies).toHaveLength(1);
 generation=3;await api.getIsland();const retry=api.build({spot:'cannon_1',kind:'cannon'});release();expect((await retry).ok).toBe(true);
 expect(bodies[1]).toEqual(bodies[0]);expect(bodies[0]).not.toHaveProperty('actorId');expect(bodies[0]).not.toHaveProperty('authGeneration');
});
it('allows an independently authorized legacy home after an account change without downgrading the previous shared actor',async()=>{
 let generation=1,data=sharedFixture();const api=createIslandApi({transport:{get:async()=>({ok:true,data}),post(){}},authGeneration:()=>generation});
 expect((await api.getIsland()).ok).toBe(true);generation=2;data={code:'ISLE-FR3ND',coins:10,waveBest:0,flags:0,spots:[]};
 expect((await api.getIsland()).ok).toBe(true);
});
