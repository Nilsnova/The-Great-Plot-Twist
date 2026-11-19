// Actual island/API/card chain; validated transport stub only, never a real provider/SQL purchase.
import {it,expect} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const browser=browserHarness();
it('keeps coherent build quotes usable after an unchanged quiet arsenal read without an extra pending core reload',async()=>{
 await browser.withPage(async page=>{
  await page.setViewportSize({width:1100,height:800});
  await page.evaluate(async()=>{
   const {createIsland}=await window.g20Import('/src/island/index.js');
   const {sharedFixture,receipt}=await window.g20Import('/tests/island/shared-core-fixture.js');
   const {data,ACTOR}=await window.g20Import('/tests/island/shared-arsenal-fixture.js');
   const {personalReply}=await window.g20Import('/tests/island/economy-fixture.js');
   const {on,emit}=await window.g20Import('/src/core/events.js');
   const domain=data(),snapshot={...sharedFixture(),actorId:ACTOR,economy:domain.economy,personalCaptain:personalReply()};
   snapshot.capabilities.arsenal={available:true,reason:null};
   const posts=[],held=[],calls=[];let coreReads=0,arsenalReads=0,holdFrom=Infinity;
   const island=createIsland({container:document.body,emit,on,mode:'live',getActorId:()=>ACTOR,storage:localStorage,visitStorage:null,
    menu:()=>()=>{},settings:()=>()=>{},transport:{get:async(path,options)=>{
     calls.push({path,options});
     if(path==='/api/island'){
      const answer={ok:true,data:structuredClone(snapshot)};coreReads++;
      return coreReads>=holdFrom?new Promise(resolve=>held.push(()=>resolve(answer))):answer;
     }
     if(path==='/api/captain')return {ok:true,data:personalReply()};
     if(path.startsWith('/api/island/arsenal')){arsenalReads++;return {ok:true,data:structuredClone({...domain,economy:snapshot.economy})};}
     return {ok:false,status:409};
    },post:async(path,body,options)=>{
     if(path!=='/api/island/build')return {ok:false,status:409};posts.push({path,body,options});
     const answer=receipt(snapshot,body,'build');Object.assign(snapshot.spots.find(row=>row.id===body.spot),{built:true,level:1,instanceId:answer.receipt.result.instanceId,revision:'1'});
     const balance=String(BigInt(snapshot.economy.treasury.balanceCoins)-BigInt(body.quotedCoins));
     snapshot.economy={...snapshot.economy,revision:String(BigInt(snapshot.economy.revision)+1n),treasury:{balanceCoins:balance,committedCoins:'0',availableCoins:balance}};
     return {ok:true,data:answer};
    }}});
   await island.load();await island.arsenal.refresh();await new Promise(resolve=>setTimeout(resolve,20));island.pick('cannon_1');
   window.arsenalQuoteRead={island,posts,held,calls,quiet:async()=>{
    const before={coreReads,arsenalReads};holdFrom=coreReads+2;await island.refreshDefended();holdFrom=Infinity;
    return {coreReads:coreReads-before.coreReads,arsenalReads:arsenalReads-before.arsenalReads,stale:island.island.quotesStale,
     rawQuoteAvailable:island.island.quotes.build.find(row=>row.target.spot==='cannon_1'&&row.target.kind==='cannon').available,
     enabled:!document.querySelector('.island-choice[data-kind="cannon"]').disabled};
   }};
  });
  const quiet=await page.evaluate(()=>window.arsenalQuoteRead.quiet());
  const box=await page.locator('.island-choice[data-kind="cannon"]').boundingBox();
  await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
  await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,40)));
  const result=await page.evaluate(async()=>{
   const f=window.arsenalQuoteRead;
   const result={...f.posts.length?{body:f.posts[0].body}:{},buildPosts:f.posts.length,built:f.island.island.spots.find(row=>row.id==='cannon_1').built,
    arsenalHeaders:f.calls.filter(row=>row.path.startsWith('/api/island/arsenal')).map(row=>row.options.headers)};
   for(const release of f.held)release();await Promise.resolve();f.island.dispose();return result;
  });
  expect({...quiet,buildPosts:result.buildPosts,built:result.built}).toEqual({coreReads:1,arsenalReads:1,stale:false,rawQuoteAvailable:true,enabled:true,buildPosts:1,built:true});
  expect(result.body).toMatchObject({spot:'cannon_1',kind:'cannon',quotedCoins:'10'});
  for(const headers of result.arsenalHeaders)expect(headers['X-Island-Economy-Version']).toBe('1');
 });
});
