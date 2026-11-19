// Real DOM/pointer and island assembly; synthetic validated transport, no real provider/SQL mutation.
import {it,expect} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const browser=browserHarness();
it('preserves the focused Build node through idle polls and one ordinary pointer action',async()=>{
 await browser.withPage(async page=>{
  await page.setViewportSize({width:1100,height:800});
  await page.evaluate(async()=>{
   const {createIsland}=await window.g20Import('/src/island/index.js');
   const {sharedFixture,receipt}=await window.g20Import('/tests/island/shared-core-fixture.js');
   const {personalReply}=await window.g20Import('/tests/island/economy-fixture.js');
   const {actorId,economy,metadata}=await window.g20Import('/tests/island/shared-session-fixture.js');
   const {on,emit}=await window.g20Import('/src/core/events.js');
   const snapshot={...sharedFixture(),actorId,economy:economy(),personalCaptain:personalReply()};snapshot.capabilities.session={available:true,reason:null};
   const posts=[],reads=[];let sessionId;
   const meta=()=>{const row=metadata();row.session.sessionId=sessionId;row.economy=snapshot.economy;return row;};
   const island=createIsland({container:document.body,emit,on,mode:'live',getActorId:()=>actorId,storage:localStorage,visitStorage:null,
    menu:()=>()=>{},settings:()=>()=>{},transport:{get:async(path,options)=>{
     reads.push({path,options});
     if(path==='/api/island')return {ok:true,data:structuredClone(snapshot)};
     if(path==='/api/captain')return {ok:true,data:personalReply()};
     if(path.startsWith('/api/island/session?'))return {ok:true,data:meta()};
     if(path.startsWith('/api/waves/current?'))return {ok:true,data:null};
     return {ok:false,status:409};
    },post:async(path,body,options)=>{
     if(path==='/api/island/session/attach'){sessionId=body.sessionId;return {ok:true,data:meta()};}
     if(path==='/api/island/session/heartbeat')return {ok:true,data:meta()};
     if(path==='/api/island/build'){
      posts.push({path,body,options});const answer=receipt(snapshot,body,'build');
      Object.assign(snapshot.spots.find(row=>row.id===body.spot),{built:true,level:1,instanceId:answer.receipt.result.instanceId,revision:'1'});
      snapshot.economy={...snapshot.economy,revision:'2',treasury:{balanceCoins:'90',committedCoins:'0',availableCoins:'90'}};
      return {ok:true,data:answer};
     }return {ok:false,status:409};
    }}});
   await island.load();island.pick('wall_1');window.idleBuild={island,posts,reads};
   window.idleBuild.button=document.querySelector('.island-card[open] [data-focus="build"]');
   window.idleBuild.button.focus();window.idleBuild.before=reads.filter(row=>row.path.startsWith('/api/waves/current?')).length;
  });
  const build=page.getByRole('button',{name:/^Build ·/});expect(await build.isEnabled()).toBe(true);
  const retained=await page.evaluate(async()=>{
   const f=window.idleBuild;for(let i=0;i<3;i++)await f.island.joinRunningWave();
   return {same:f.button===document.querySelector('.island-card[open] [data-focus="build"]'),connected:f.button.isConnected,focused:document.activeElement===f.button};
  });
  const box=await build.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  // A normal accepted poll completes while the pointer is held, as it can in production.
  await page.evaluate(()=>window.idleBuild.island.joinRunningWave());await page.mouse.up();
  await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,50)));
  const result=await page.evaluate(()=>{
   const f=window.idleBuild,polls=f.reads.filter(row=>row.path.startsWith('/api/waves/current?'));
   const result={posts:f.posts,pollCount:polls.length-f.before,pollHeaders:polls.map(row=>row.options.headers),built:f.island.island.spots.find(row=>row.id==='wall_1').built,economy:f.island.economy};
   f.island.dispose();return result;
  });
  expect({...retained,buildPosts:result.posts.length,built:result.built}).toEqual({same:true,connected:true,focused:true,buildPosts:1,built:true});
  expect(result.economy).toMatchObject({revision:'2',treasury:{availableCoins:'90'}});
  expect(result.pollCount).toBe(4);for(const headers of result.pollHeaders)expect(headers['X-Island-Economy-Version']).toBe('1');
  expect(result.posts[0].body).toMatchObject({spot:'wall_1',kind:'wall',quotedCoins:'10',economy:{mode:'island_shared',version:1}});
  expect(result.posts[0].body.economy).not.toHaveProperty('accountId');
 });
});
