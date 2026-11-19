// Real Chromium duplicated-tab storage plus actor-global Web Locks; no live authority is used.
import {it,expect} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const browser=browserHarness();
it('keeps a browser-cloned controlling session to one document and fences takeover generations',async()=>{
 await browser.withPage(async(page,base)=>{
  await page.context().route('**/*',route=>{
   const url=new URL(route.request().url());if(url.origin!==base || url.pathname.startsWith('/api/'))return route.abort();
   if(url.pathname==='/g20-harness')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'});
   return route.continue();
  });
  const start=async page=>page.evaluate(async()=>{
   const {createSharedSessionClient}=await window.g20Import('/src/island/shared-session-client.js');
   const {actorId,economy,metadata,sessionId}=await window.g20Import('/tests/island/shared-session-fixture.js');
   window.attachBodies=[];
   const api={attach:async record=>{window.attachBodies.push(record.body);const data=metadata();
    if(record.body.expectedGeneration!=='0')data.session.connectionGeneration=String(BigInt(record.body.expectedGeneration)+1n);
    return {ok:true,data};},
    read:async proof=>{const data=metadata(!!proof);if(proof)data.session.connectionGeneration=proof.connectionGeneration;return {ok:true,data};},
    heartbeat:async proof=>{const data=metadata();data.session.connectionGeneration=proof.connectionGeneration;return {ok:true,data};},
    disconnect:async()=>({ok:true,data:metadata(false)})};
   window.client=createSharedSessionClient({api,getActorId:()=>actorId,getEconomy:economy,storage:sessionStorage,
    makeSessionId:()=>sessionId,setTimer:()=>1,clearTimer(){}});
   await window.client.open();return {proof:window.client.proof(),bodies:window.attachBodies,stored:Object.keys(sessionStorage)};
  });
  const first=await start(page);expect(first.proof).not.toBeNull();
  const opening=page.waitForEvent('popup');await page.evaluate(()=>window.open('/g20-harness','copy'));const other=await opening;
  try{
   await other.waitForLoadState('domcontentloaded');
   await other.addScriptTag({type:'module',content:'window.g20Import = path => import(path);'});
   await other.waitForFunction(()=>typeof window.g20Import==='function');
   expect(await other.evaluate(()=>Object.keys(sessionStorage))).toEqual(first.stored);
   const copy=await start(other);expect(copy.proof).toBeNull();expect(copy.bodies).toEqual([]);
   await page.evaluate(()=>window.client.disconnect());
   const resumed=await other.evaluate(async()=>{await window.client.open();return {proof:window.client.proof(),bodies:window.attachBodies};});
   expect(resumed.proof.connectionGeneration).toBe('9007199254740994');
   expect(resumed.bodies[0].expectedGeneration).toBe('9007199254740993');
   expect(await page.evaluate(()=>window.client.proof())).toBeNull();
   await other.evaluate(()=>window.client.dispose());await page.evaluate(()=>window.client.dispose());
  }finally{await other.close();}
 });
});
