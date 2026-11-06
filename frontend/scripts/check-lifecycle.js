// A failed first island load must not dispose the adapter shared with title/account.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openWorldBrowser} from './world-browser-tools.js';
const env=await openWorldBrowser(),{page}=env,report={checks:[]};page.setDefaultTimeout(12000);
const check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};
try{
 await page.route('**/api/**',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));
 await page.goto(env.url+'/?case=local');await page.locator('#new-game').waitFor();
 await page.getByRole('button',{name:'Sign in with GitHub',exact:true}).click();await page.waitForFunction(()=>window.__plotTwist.adapter.read().account.state==='signed_in');
 await page.evaluate(()=>{const adapter=window.__plotTwist.adapter,dispose=adapter.dispose;window.__disposeCount=0;adapter.dispose=()=>{window.__disposeCount++;dispose();};});
 await page.route('**/pixel/ground.png',route=>route.fulfill({status:503,body:''}));await page.locator('#new-game').click();
 await page.getByText('The coast could not load. Check the connection and WebGL 2, then try again.',{exact:true}).waitFor();
 check(await page.evaluate(()=>window.__disposeCount===0),'A failed world load keeps the caller-owned account adapter alive');
 check(await page.evaluate(async()=>{const result=await window.__plotTwist.adapter.setEmote('wave');return result.accepted;}),'The same adapter still accepts intents after the failure');
 report.expectedLoadDiagnostics=[...env.errors];const priorErrors=env.errors.length;
 await page.unroute('**/pixel/ground.png');await page.locator('#new-game').click();await page.locator('.intro-modal[open] .intro-view').waitFor();
 check(await page.evaluate(()=>window.__plotTwist.adapter.read().account.state==='signed_in'),'Retry preserves the signed-in account state');
 check(await page.locator('canvas[tabindex="0"]').count()===1,'Retry owns one world canvas');
 check(await page.evaluate(()=>window.__island.scene.children.filter(item=>item.name.startsWith('place:')).length===1),'Retry owns one place root');
 const skip=page.getByRole('button',{name:'Show full text',exact:true});if(await skip.isVisible())await skip.click();
 await page.setViewportSize({width:375,height:667});check(await page.locator('.kit-dialogue-text').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=19),'Story text is at least 19 CSS px on the phone');await page.screenshot({path:'captures/20261106_G7-Lifecycle-Story-375.png'});
 await page.evaluate(()=>{const dispose=window.__plotTwist.dispose;dispose();dispose();});
 check(await page.evaluate(()=>window.__disposeCount===1&&!window.__island),'Application teardown disposes its shared adapter exactly once');
 check(await page.locator('canvas[tabindex="0"]').count()===0,'Teardown removes the world canvas');
 check(env.errors.slice(priorErrors).every(message=>message.includes('503'))&&env.external.length===0,'Retry introduces no unexpected browser error or external asset request');
 console.log(JSON.stringify(report,null,2));
}catch(error){report.failure=error.message;await page.screenshot({path:'captures/20261106_G7-Lifecycle-Failure.png'});throw error;}
finally{await writeFile('captures/20261106_G7-Lifecycle-Checks.json',JSON.stringify(report,null,2));await env.close();}
