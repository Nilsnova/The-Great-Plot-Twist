import {readHttp} from './http-read.js';
import {openIntroApiFixture} from './intro-api-fixture.js';
import {startFromTitle,closeSettings} from './shell-browser-tools.js';
// Play both original endings through the actual Vite proxy and an injected canonical public API.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openWorldBrowser} from './world-browser-tools.js';
const fixture=await openIntroApiFixture();let env;
try{env=await openWorldBrowser({apiTarget:fixture.url});}catch(error){await fixture.close();throw error;}
const {page}=env;
const report={checked:new Date().toISOString(),checks:[],apiReads:0,endings:[]};
const check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};
const choose=async id=>{
  const skip=page.locator('.intro-modal .kit-dialogue').getByRole('button',{name:'Show full text'});
  if(await skip.isVisible()){try{await skip.click({timeout:1000});}catch(error){if(await skip.isVisible())throw error;}}
  await page.locator(`.intro-modal [data-choice="${id}"]`).click();
};
async function visit(id) {
  await page.evaluate(async id=>{const {zones}=await import('/src/world/zones.js');const z=zones.find(z=>z.id===id);window.__island.player.position.set(z.x,z.y,z.z);},id);
  await page.waitForFunction(id=>document.querySelector('.interact')?.dataset.zone===id,id);await page.keyboard.press('KeyE');
  await page.locator('.intro-modal').waitFor({state:'visible'});
  await page.waitForFunction(id=>window.__island.world.intro.active&&window.__island.world.intro.state&&(window.__island.world.intro.state.ended||window.__island.world.intro.state.scene===id),id);
}
try {
  const response=await readHttp(env.url+'/api/content/intro-story');check(response.ok,'Vite proxy reaches the injected public intro API');
  const story=await response.json();assert.deepEqual(story,fixture.canonical);check(story.start==='cottage'&&story.scenes.lamp_room,'API returns the unchanged canonical story');
  page.on('request',request=>{if(request.url().includes('/api/')){assert.ok(['/api/config','/api/content/intro-story','/api/weather'].includes(new URL(request.url()).pathname));assert.equal(request.headers().authorization,undefined);assert.equal(request.method(),'GET');if(new URL(request.url()).pathname==='/api/content/intro-story')report.apiReads++;}});
  await page.route('**/api/content/intro-story',route=>route.continue());await page.goto(env.url);await startFromTitle(page);
  await page.evaluate(()=>{window.__introEvents=[];window.__island.on('intro_ended',event=>window.__introEvents.push(event));});
  await visit('shore');await page.keyboard.press('Escape');await page.locator('.intro-modal').waitFor({state:'hidden'});
  await visit('desk');
  check(await page.evaluate(()=>JSON.stringify(window.__island.world.intro.actions)===JSON.stringify(['to_shore','shore_back','to_desk'])),'Physical shore-to-desk visit replays shore_back then to_desk');
  await choose('take_key');check((await page.locator('.intro-inventory').textContent()).includes('key'),'Accepted pickup appears in inventory');
  check((await page.locator('.intro-notes:not(.intro-ending-notes)').textContent()).length>0,'Engine notes are visible after a change');await choose('read_log');
  const skip=page.locator('.intro-modal .kit-dialogue').getByRole('button',{name:'Show full text'});if(await skip.isVisible())await skip.click();
  await page.screenshot({path:'captures/20261105_G4-Act1-Desk.png'});
  await page.keyboard.press('Escape');await page.locator('.intro-modal').waitFor({state:'hidden'});await visit('shore');
  await choose('take_lantern');await choose('warn_harbor');await page.keyboard.press('Escape');await page.locator('.intro-modal').waitFor({state:'hidden'});
  await visit('tower_door');await choose('unlock_door');check(await page.locator('.intro-view').getAttribute('data-scene')==='stairwell','Stairwell plays in the dialogue box');
  await choose('climb');check(await page.locator('.intro-view').getAttribute('data-scene')==='lamp_room','Lamp room plays in the dialogue box');
  await choose('signal');check(await page.locator('.intro-ending').isVisible(),'The original ending card is shown');
  check(await page.evaluate(()=>JSON.stringify(window.__introEvents)===JSON.stringify([{type:'intro_ended',ending:'ending_rescue'}])),'Rescue emits the exact intro_ended payload once');
  await page.screenshot({path:'captures/20261105_G4-Act1-Ending.png'});report.endings.push('ending_rescue');
  const saved=await page.evaluate(()=>window.__island.world.intro.actions);
  await page.reload();await startFromTitle(page,{resume:true,closeIntro:false});
  check(await page.evaluate(saved=>JSON.stringify(window.__island.world.intro.actions)===JSON.stringify(saved),saved),'Reload restores a replayable move journal');
  await page.getByRole('button',{name:'Start a new intro'}).click();
  await page.evaluate(()=>{window.__introEvents=[];window.__island.on('intro_ended',event=>window.__introEvents.push(event));});
  for(const id of ['to_desk','take_key','desk_back','to_shore','take_lantern','trust_fisherman','shore_back','to_tower','unlock_door','climb'])await choose(id);
  const skipAgain=page.locator('.intro-modal .kit-dialogue').getByRole('button',{name:'Show full text'});if(await skipAgain.isVisible())await skipAgain.click();
  check(await page.locator('[data-choice=signal]').isDisabled(),'Engine-blocked choices are visibly locked');
  const before=await page.evaluate(()=>JSON.stringify({state:window.__island.world.intro.state,actions:window.__island.world.intro.actions}));await page.keyboard.press('1');
  check(await page.evaluate(before=>JSON.stringify({state:window.__island.world.intro.state,actions:window.__island.world.intro.actions})===before,before),'A locked choice changes no state or move log');
  await choose('untie');report.endings.push('ending_trapped');
  check(await page.evaluate(()=>JSON.stringify(window.__introEvents)===JSON.stringify([{type:'intro_ended',ending:'ending_trapped'}])),'Trapped ending emits once');
  await page.keyboard.press('Escape');await page.locator('.intro-modal').waitFor({state:'hidden'});
  check(await page.evaluate(()=>document.activeElement?.tagName==='CANVAS'&&!window.__island.world.busy),'Closing the story restores game focus and controls');
  report.proxyRequests=fixture.requests;
  check(fixture.requests.length>=report.apiReads+1&&fixture.requests.every(request=>request.method==='GET'&&!request.authorized&&request.path==='/api/content/intro-story'),
    'Node probe and browser story reads use only the anonymous canonical proxy endpoint');
  check(env.errors.length===0,'No browser errors');check(env.external.length===0,'No external requests');console.log(JSON.stringify(report,null,2));
} finally {try{await writeFile('captures/20261105_G4-Intro-Checks.json',JSON.stringify(report,null,2));}finally{try{await env.close();}finally{await fixture.close();}}}
