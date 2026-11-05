import {stubIntro} from './intro-browser-fixture.js';
import {startFromTitle,closeSettings} from './shell-browser-tools.js';
// Verify real finale visuals, ownership, exact events, Escape and reduced motion in Chrome.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { openWorldBrowser,measure,settle } from './world-browser-tools.js';
const env=await openWorldBrowser(),{page}=env;
const report={checked:new Date().toISOString(),checks:[],shots:{}};
const check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};
try {
  await stubIntro(page);await page.goto(env.url);await startFromTitle(page);

  check(await page.locator('.cinematic-demo').count()===0,'Normal play has no rehearsal controls');
  await page.evaluate(()=>{window.__cinema=[];window.__island.on('cinematic',e=>window.__cinema.push(e));});
  check(await page.evaluate(()=>window.__island.world.cinematic('unknown'))===false,'Unknown cinematic is refused without events');
  const lazyPattern='**/src/world/cinematics/controller.js*';
  await page.route(lazyPattern,async route=>{await new Promise(resolve=>setTimeout(resolve,700));await route.continue();});
  await page.evaluate(()=>{window.__cancelledLoad=window.__island.world.cinematic('fog_lift');});await page.waitForFunction(()=>window.__island.world.busy);await page.keyboard.press('Escape');
  check(await page.evaluate(async()=>await window.__cancelledLoad===false&&!window.__island.world.busy),'Escape cancels a lazily loading shot before it starts');
  await page.unroute(lazyPattern);await page.waitForTimeout(750);
  check(await page.evaluate(()=>window.__cinema.length===0)&&await page.locator('.cinematic-modal').count()===0,'Late lazy loading cannot reopen a cancelled shot or emit events');
  report.before=await measure(page);
  const start=Date.now();await page.evaluate(()=>{window.__shot=window.__island.world.cinematic('three_lights');});
  await page.waitForFunction(()=>document.querySelector('.cinematic-modal progress')?.value>.1);
  check(await page.evaluate(async()=>!(await window.__island.world.goTo('saltreach_harbor'))&&!window.__island.world.interact('desk')),'A cinematic blocks travel and hotspot input');
  check(await page.evaluate(()=>window.__island.world.cinematic('fog_lift'))===false,'Overlapping cinematics are refused');
  report.shots.three_lights=await measure(page);
  await page.waitForFunction(()=>document.querySelector('.cinematic-modal progress')?.value>.7);
  await page.screenshot({path:'captures/20261105_G4-three_lights.png'});
  check(await page.evaluate(()=>window.__shot.then(result=>result.stage==='completed')),'Three-light shot completes');report.threeLightsMs=Date.now()-start;
  check(report.threeLightsMs<15000,'Normal shot completes within fifteen seconds including loading');
  for(const name of ['fog_lift','schooner_reveal','unmask','relighting']) {
    await page.evaluate(name=>{window.__shot=window.__island.world.cinematic(name);},name);
    await page.waitForFunction(()=>document.querySelector('.cinematic-modal progress')?.value>.42);
    await page.screenshot({path:`captures/20261105_G4-${name}.png`});await page.keyboard.press('Escape');
    check(await page.evaluate(()=>window.__shot.then(result=>result.stage==='skipped')),`${name}: Escape skips and settles the promise`);
  }
  const expected=['three_lights','fog_lift','schooner_reveal','unmask','relighting'].flatMap((name,index)=>[{type:'cinematic',name,stage:'started'},{type:'cinematic',name,stage:index===0?'completed':'skipped'}]);
  check(await page.evaluate(expected=>JSON.stringify(window.__cinema)===JSON.stringify(expected),expected),'Every shot emits exact started and terminal payloads once');
  check(await page.evaluate(()=>window.__island.world.relit===false&&window.__island.world.current.id==='lighthouse_isle'),'Visuals do not decide Relighting or move the player to another place');
  await page.emulateMedia({reducedMotion:'reduce'});const reducedStart=Date.now();
  check(await page.evaluate(()=>window.__island.world.cinematic('fog_lift').then(r=>r.stage==='skipped')),'Reduced motion skips animation');report.reducedMotionMs=Date.now()-reducedStart;
  check(report.reducedMotionMs<1000,'Reduced-motion passage settles quickly');
  await page.emulateMedia({reducedMotion:'no-preference'});
  report.after=await measure(page);
  check(report.before.geometries===report.after.geometries&&report.before.textures===report.after.textures&&report.after.roots===1,'Cinematics release their bitmaps without extra world geometry or textures');
  check(report.shots.three_lights.calls<150&&report.shots.three_lights.triangles<150000&&report.shots.three_lights.fps>=30,'Active cinematic stays within rendering budgets');
  await page.evaluate(()=>{window.__shot=window.__island.world.cinematic('fog_lift');window.__island.world.dispose();});
  check(await page.evaluate(()=>window.__shot.then(result=>result.stage==='cancelled')),'World disposal cancels a pending shot');
  check(await page.locator('.cinematic-modal').count()===0,'World disposal removes the cinematic dialog');
  await page.goto(env.url+'/?demo=1');await startFromTitle(page);
  check(await page.locator('.cinematic-demo').count()===1,'Explicit demo query exposes the rehearsal selector');
  await page.locator('.presenter-panel summary').click();await page.getByRole('button',{name:'Play visual'}).click();await page.locator('.cinematic-modal').waitFor({state:'visible'});await page.keyboard.press('Escape');
  await settle(page);check(await page.evaluate(()=>!window.__island.world.busy),'Demo skip restores control');
  check(env.errors.length===0,'No browser errors');check(env.external.length===0,'No external requests');console.log(JSON.stringify(report,null,2));
} finally {await writeFile('captures/20261105_G4-Cinematic-Checks.json',JSON.stringify(report,null,2));await env.close();}
