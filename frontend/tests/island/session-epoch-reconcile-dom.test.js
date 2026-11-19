// Real island assembly with bounded synthetic transport; no provider or live runtime.
import {it,expect} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const evaluate=browserHarness();
it.each(['before','after'])('reconciles a member replacement after stale heartbeat resolves %s its read',async order=>{
 const result=await evaluate(async order=>{
  const {createIsland}=await window.g20Import('/src/island/index.js');
  const {sharedFixture}=await window.g20Import('/tests/island/shared-core-fixture.js');
  const {personalReply}=await window.g20Import('/tests/island/economy-fixture.js');
  const {actorId,economy,metadata}=await window.g20Import('/tests/island/shared-session-fixture.js');
  const {on,emit}=await window.g20Import('/src/core/events.js');
  const first={...economy(),islandOwner:'66666666-6666-4666-8666-666666666666',accountId:'77777777-7777-4777-8777-777777777777',runEpoch:'88888888-8888-4888-8888-888888888888'};
  const next={...first,accountId:'99999999-9999-4999-8999-999999999999',runEpoch:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};
  let selected=first,sid,holdPing=false,releasePing;const calls=[];
  const snapshot=visiting=>{const row={...sharedFixture(),actorId,economy:visiting?selected:economy(),code:visiting?'ISLE-FR3ND':'ISLE-K7Q2M',personalCaptain:personalReply()};row.capabilities.session={available:true,reason:null};return row;};
  const meta=(controller=true)=>{const row=metadata(controller);row.economy=selected;if(controller)row.session.sessionId=sid;row.session.place='isle_fr3nd_'+(selected===first?'0':'1').repeat(24);return row;};
  const island=createIsland({container:document.body,emit,on,mode:'live',getActorId:()=>actorId,storage:localStorage,visitStorage:null,
   menu:()=>()=>{},settings:()=>()=>{},transport:{get:async path=>{
    calls.push({path});if(path==='/api/island')return {ok:true,data:snapshot(false)};
    if(path.startsWith('/api/island/visit/'))return {ok:true,data:snapshot(true)};
    if(path==='/api/captain')return {ok:true,data:personalReply()};
    if(path.startsWith('/api/island/session?'))return {ok:true,data:meta(new URL(path,location.href).searchParams.has('sessionId'))};
    return {ok:false,status:409};
   },post:async(path,body)=>{
    calls.push({path,body});
    if(path==='/api/island/session/attach'){sid=body.sessionId;return {ok:true,data:meta()};}
    if(path==='/api/island/session/leave')return {ok:false,status:409,code:'stale_controller'};
    if(path==='/api/island/session/heartbeat')return holdPing?new Promise(resolve=>{releasePing=resolve;}):{ok:true,data:meta()};
    return {ok:false,status:409};
   }}});
  island.visit('ISLE-FR3ND');await island.load();const oldProof=island.session.proof();
  holdPing=true;const ping=island.session.ensure();
  for(let i=0;i<50&&!releasePing;i++)await new Promise(resolve=>setTimeout(resolve,0));
  if(!releasePing)throw new Error('Initial heartbeat was not held');
  selected=next;
  if(order==='before'){releasePing({ok:false,status:409,code:'stale_controller'});await ping;}
  await island.refreshDefended();const immediately=island.economy;
  if(order==='after'){releasePing({ok:false,status:409,code:'stale_controller'});await ping;}
  const deadline=Date.now()+8000;while(Date.now()<deadline&&island.session.proof()?.origin.runEpoch!==next.runEpoch)await new Promise(resolve=>setTimeout(resolve,10));
  const proof=island.session.proof(),room=island.roomPlace(),countBefore=calls.filter(row=>row.path.includes('/session')).length;
  await island.refreshDefended();await Promise.resolve();await Promise.resolve();
  const countAfter=calls.filter(row=>row.path.includes('/session')).length;
  const result={oldProof,immediately,proof,room,state:island.session.state,calls,countBefore,countAfter};island.dispose();return result;
 },order);
 expect(result.oldProof.origin.runEpoch).toBe('88888888-8888-4888-8888-888888888888');
 expect(result.immediately.runEpoch).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 expect(result.proof?.origin.runEpoch,JSON.stringify({state:result.state,calls:result.calls})).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 expect(result.room).toBe('isle_fr3nd_'+'1'.repeat(24));
 expect(result.calls.filter(row=>row.path==='/api/island/session/attach')).toHaveLength(2);
 expect(result.countAfter).toBe(result.countBefore);
});
