// Actual island assembly uses a fresh canonical controller read and the server's nonce room.
import {it,expect} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const evaluate=browserHarness();
it('binds the supported visible island to its exact server room and withdraws before a visit',async()=>{
 const result=await evaluate(async()=>{
  const {createIsland}=await window.g20Import('/src/island/index.js');
  const {sharedFixture}=await window.g20Import('/tests/island/shared-core-fixture.js');
  const {actorId,economy,metadata,controlReceipt}=await window.g20Import('/tests/island/shared-session-fixture.js');
  const {on,emit}=await window.g20Import('/src/core/events.js');
  const snapshot={...sharedFixture(),actorId,economy:economy()};snapshot.capabilities.session={available:true,reason:null};
  const calls=[];
  const island=createIsland({container:document.body,emit,on,mode:'live',getActorId:()=>actorId,storage:localStorage,visitStorage:null,
   menu:()=>()=>{},settings:()=>()=>{},transport:{get:async(path,options)=>{
    calls.push({path,options});if(path==='/api/island')return {ok:true,data:snapshot};
    if(path.startsWith('/api/island/session?')){const data=metadata();data.session.sessionId=new URL(path,location.href).searchParams.get('sessionId');return {ok:true,data};}return {ok:false,status:409};
   },post:async(path,body,options)=>{calls.push({path,body,options});
    if(path==='/api/island/session/attach'){const data=metadata();data.session.sessionId=body.sessionId;return {ok:true,data};}
    if(path==='/api/island/session/leave')return {ok:true,data:controlReceipt('session_leave',body)};
    return {ok:false,status:409};}}});
  const unknown=island.roomPlace();await island.load();const room=island.roomPlace(),proof=island.session.proof();
  island.visit('ISLE-FR3ND');const duringVisit=island.roomPlace();await Promise.resolve();await Promise.resolve();
  const result={unknown,room,proof,duringVisit,calls};island.dispose();return result;
 });
 expect(result.unknown).toBeNull();expect(result.room).toBe('isle_k7q2m_0123456789abcdef01234567');expect(result.duringVisit).toBeNull();
 expect(result.proof.connectionGeneration).toBe('9007199254740993');
 const selected=result.calls.filter(row=>row.path.includes('/session'));
 expect(selected.map(row=>row.path.split('?')[0])).toEqual(['/api/island/session/attach','/api/island/session','/api/island/session/leave']);
 for(const row of selected)expect(row.options.headers['X-Island-Economy-Version']).toBe('1');
 expect(selected[2].body).not.toHaveProperty('accountId');expect(selected[2].body.economy).not.toHaveProperty('accountId');
});
it.each([false,true])('rereads adopted personal progress and defended quotes once after confirmed attach (visitor=%s)',async visitor=>{
 const result=await evaluate(async visitor=>{
  const {createIsland}=await window.g20Import('/src/island/index.js');
  const {sharedFixture}=await window.g20Import('/tests/island/shared-core-fixture.js');
  const {personalReply}=await window.g20Import('/tests/island/economy-fixture.js');
  const {actorId,economy,metadata}=await window.g20Import('/tests/island/shared-session-fixture.js');
  const {on,emit}=await window.g20Import('/src/core/events.js');
  let adopted=false,sid=null;const calls=[];
  const selected=()=>visitor?{...economy(),islandOwner:'66666666-6666-4666-8666-666666666666',accountId:'77777777-7777-4777-8777-777777777777',runEpoch:'88888888-8888-4888-8888-888888888888'}:economy();
  const snapshot=visiting=>{const row={...sharedFixture(),actorId,economy:visiting?selected():economy(),code:visiting?'ISLE-FR3ND':'ISLE-K7Q2M'};
   row.capabilities.session={available:true,reason:null};row.personalCaptain=adopted?personalReply():null;
   for(const quote of row.quotes.build){quote.available=adopted;quote.reason=adopted?null:'captain_not_initialized';}return row;};
  const meta=()=>{const row=metadata();row.economy=selected();row.session.sessionId=sid;return row;};
  const island=createIsland({container:document.body,emit,on,mode:'live',getActorId:()=>actorId,storage:localStorage,visitStorage:null,
   menu:()=>()=>{},settings:()=>()=>{},transport:{get:async path=>{calls.push(path);
    if(path==='/api/island')return {ok:true,data:snapshot(false)};
    if(path.startsWith('/api/island/visit/'))return {ok:true,data:snapshot(true)};
    if(path==='/api/captain')return adopted?{ok:true,data:personalReply()}:{ok:false,status:404};
    if(path.startsWith('/api/island/session?'))return {ok:true,data:meta()};return {ok:false,status:409};
   },post:async(path,body)=>{calls.push(path);
    if(path==='/api/island/session/attach'){adopted=true;sid=body.sessionId;return {ok:true,data:meta()};}
    if(path==='/api/island/session/heartbeat')return {ok:true,data:meta()};
    return {ok:false,status:409};}}});
  if(visitor)island.visit('ISLE-FR3ND');await island.load();
  const before=calls.filter(path=>path==='/api/captain').length,profile=island.island.captain,shown=visitor?island.visiting:island.island;
  await island.session.ensure();await island.session.ensure();
  const result={profile,quote:shown.quotes.build[0],captainReads:before,afterHeartbeat:calls.filter(path=>path==='/api/captain').length,
   defendedReads:calls.filter(path=>path===(visitor?'/api/island/visit/ISLE-FR3ND':'/api/island')).length,calls};
  island.dispose();return result;
 },visitor);
 expect(result.profile.progressionVersion).toBe(1);expect(result.profile.level).toBe(3);expect(result.quote.available).toBe(true);
 expect(result.captainReads).toBe(2);expect(result.afterHeartbeat).toBe(2);
 expect(result.defendedReads).toBe(2);
});

it.each(['actor','selection'])('rejects delayed adoption hydration after %s changes',async boundary=>{
 const result=await evaluate(async boundary=>{
  const {createIsland}=await window.g20Import('/src/island/index.js');
  const {sharedFixture}=await window.g20Import('/tests/island/shared-core-fixture.js');
  const {personalReply}=await window.g20Import('/tests/island/economy-fixture.js');
  const {actorId,economy,metadata}=await window.g20Import('/tests/island/shared-session-fixture.js');
  const {on,emit}=await window.g20Import('/src/core/events.js');
  let actor=actorId,adopted=false,sid;const releases=[];
  const snapshot=()=>{const row={...sharedFixture(),actorId,economy:economy(),personalCaptain:adopted?personalReply():null};row.capabilities.session={available:true,reason:null};return row;};
  const meta=()=>{const row=metadata();row.session.sessionId=sid;return row;};
  const island=createIsland({container:document.body,emit,on,mode:'live',getActorId:()=>actor,storage:localStorage,visitStorage:null,menu:()=>()=>{},settings:()=>()=>{},
   transport:{get:async path=>{
    if(path==='/api/island' || path==='/api/captain'){const answer=path==='/api/island'?{ok:true,data:snapshot()}:adopted?{ok:true,data:personalReply()}:{ok:false,status:404};
     return adopted?new Promise(resolve=>releases.push(()=>resolve(answer))):answer;}
    if(path.startsWith('/api/island/session?'))return {ok:true,data:meta()};return {ok:false,status:409};
   },post:async(path,body)=>{if(path==='/api/island/session/attach'){adopted=true;sid=body.sessionId;return {ok:true,data:meta()};}return {ok:false,status:409};}}});
  const loading=island.load();for(let i=0;releases.length<2 && i<100;i++)await new Promise(resolve=>setTimeout(resolve,10));
  const queued=releases.length;if(boundary==='actor')actor=null;else island.visit('ISLE-FR3ND');
  for(const release of releases)release();await loading;const profile=island.island?.captain,proof=island.session.proof();island.dispose();return {queued,profile,proof};
 },boundary);
 expect(result.queued).toBe(2);expect(result.profile?.level).toBeUndefined();expect(result.proof).toBeNull();
});
