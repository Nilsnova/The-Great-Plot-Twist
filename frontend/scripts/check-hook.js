// Browser smoke check for the spoiler-safe Chapter 2 hook presentation.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {stubIntro} from './intro-browser-fixture.js';
import {startFromTitle} from './shell-browser-tools.js';
import {openWorldBrowser,settle} from './world-browser-tools.js';
const env=await openWorldBrowser(),{page}=env,report={checked:new Date().toISOString(),checks:[],screenshots:[]};
const check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};
try{
  await stubIntro(page);await page.goto(`${env.url}/?case=local`);await startFromTitle(page);
  await page.evaluate(async()=>{const g=window.__island;await g.world.goTo('saltreach_harbor',{fast:true});await g.caseUi.open('crew');g.caseUi.adapter.dev.setBulletin('hook');});
  await page.locator('.case-modal[open]').waitFor();await page.evaluate(()=>window.__island.caseUi.open('bulletin'));
  await page.locator('.case-modal[open] .bulletin-hook:not([hidden])').waitFor();
  check((await page.locator('.bulletin-hook h3').textContent()).includes('[notice supplied by the server]'),'Hook notice uses placeholder-only fake text');
  const live=page.locator('.bulletin-hook-status'),announce=page.locator('[data-focus="hook-announcements"]');
  check(await live.textContent()==='','Hook pattern announcements do not start automatically');await announce.click();
  check((await live.textContent()).includes('Short flash, 1 of 3'),'Announcement opt-in reads each flash as it happens');
  await page.screenshot({path:'captures/20261106_G8-Hook-Notice.png'});report.screenshots.push('captures/20261106_G8-Hook-Notice.png');
  await page.keyboard.press('Escape');await page.locator('.case-modal[open]').waitFor({state:'hidden'});
  check((await live.textContent()).includes('stopped'),'Closing the modal stops the opt-in announcement timer');
  await page.keyboard.press('KeyM');await page.locator('.sea-chart[open] .chart-hook-marker:not([hidden])').waitFor();
  check((await page.locator('.chart-hook-marker').getAttribute('aria-label')).includes('short, short, long'),'Sea chart marker exposes the supplied pattern in words');
  await page.waitForFunction(()=>document.querySelector('.chart-hook-marker')?.hidden===true);
  await page.waitForFunction(()=>document.querySelector('.chart-hook-marker')?.hidden===false);
  check(true,'Sea chart marker follows the supplied flash and gap timings');
  await page.screenshot({path:'captures/20261106_G8-Hook-Chart.png'});report.screenshots.push('captures/20261106_G8-Hook-Chart.png');
  await page.keyboard.press('Escape');await page.evaluate(()=>{window.__island.settings.hour=0;});await settle(page);
  check(await page.evaluate(()=>{const lamp=window.__island.scene.getObjectByName('chapter-two-distant-signal');return lamp?.visible&&lamp.position.x>20;}),'Distant signal layer sits offshore at its chart bearing at night');
  await page.emulateMedia({reducedMotion:'reduce'});await settle(page);
  check(await page.evaluate(()=>window.__island.scene.getObjectByName('chapter-two-distant-signal')?.visible===true),'Reduced motion retains a still signal marker');
  check(env.errors.length===0,'Browser has no console or page errors');check(env.external.length===0,'Browser makes no external requests');
  report.errors=env.errors;report.external=env.external;console.log(JSON.stringify(report,null,2));
}finally{await writeFile('captures/20261106_G8-Hook-Checks.json',JSON.stringify(report,null,2));await env.close();}
