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
