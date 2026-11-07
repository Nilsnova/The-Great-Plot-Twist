// Play both original endings and room inspections through Vite and an injected canonical public API.
import {readHttp} from './http-read.js';
import {openIntroApiFixture} from './intro-api-fixture.js';
import {startFromTitle} from './shell-browser-tools.js';
import {revealIntroText} from './online-browser-actions.js';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openWorldBrowser} from './world-browser-tools.js';
const fixture=await openIntroApiFixture();let env;
try{env=await openWorldBrowser({apiTarget:fixture.url});}catch(error){await fixture.close();throw error;}
const {page}=env;
const report={checked:new Date().toISOString(),checks:[],apiReads:0,endings:[]};
const check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};
async function revealPassage() {
  await revealIntroText(page);
}
async function pages() {
  for(let count=0;count<30;count++){
    await revealPassage();
    const next=page.locator('.intro-modal [data-choice="intro:next"]');
    if(!await next.count())return;
    await next.click();
  }
  throw new Error('Intro passages did not reach their choices.');
}
async function showChoice(id) {
  await pages();
  for(let count=0;count<8;count++){
    const target=page.locator(`.intro-modal [data-choice="${id}"]`);
    if(await target.count())return target;
    const more=page.locator('.intro-modal [data-choice="intro:more"]');
    if(!await more.count())break;
    await more.click();await revealPassage();
  }
  throw new Error(`Original intro action is not reachable: ${id}`);
}
async function choose(id) {await (await showChoice(id)).click();}
async function leaveRoom() {
  const room=page.locator('.interiors-scene:not([hidden])');
  if(!await room.count())return;
  await page.getByRole('button',{name:'Leave room',exact:true}).click();
  await room.waitFor({state:'hidden'});
}
async function closeStory() {
  await page.keyboard.press('Escape');await page.locator('.intro-modal').waitFor({state:'hidden'});
  await leaveRoom();
}
async function visit(id) {
  await leaveRoom();
  if(id==='desk'||id==='shore'){
    const roomId=id==='desk'?'cottage':'boathouse';
    const doorway=id==='desk'?{x:-7,z:5.8}:{x:-7,z:18.05};
    await page.evaluate(({x,z})=>{const g=window.__island;g.player.position.set(x,g.world.current.groundHeight(x,z),z);},doorway);
    await page.waitForFunction(roomId=>window.__island.interiors?.roomId===roomId&&document.querySelector('.interiors-scene')?.dataset.state==='ready',roomId);
    check(await page.locator('.interiors-scene').evaluate(room=>{const rect=room.getBoundingClientRect();return rect.width===innerWidth&&rect.height===innerHeight;}),`${roomId}: crossing the doorway opens a full-screen room`);
    await page.locator('.interiors-hotspot').filter({hasText:id==='desk'?'Writing desk':'Lantern rack'}).click();
  }else{
    await page.evaluate(async id=>{const {zones}=await import('/src/world/zones.js');const z=zones.find(z=>z.id===id);window.__island.player.position.set(z.x,z.y,z.z);},id);
    await page.waitForFunction(id=>document.querySelector('.interact')?.dataset.zone===id,id);await page.keyboard.press('KeyE');
  }
  await page.locator('.intro-modal').waitFor({state:'visible'});
  await page.waitForFunction(id=>window.__island.world.intro.active&&window.__island.world.intro.state&&(window.__island.world.intro.state.ended||window.__island.world.intro.state.scene===id),id);
}

try {
  const response=await readHttp(env.url+'/api/content/intro-story');check(response.ok,'Vite proxy reaches the injected public intro API');
  const story=await response.json();assert.deepEqual(story,fixture.canonical);check(story.start==='cottage'&&story.scenes.lamp_room,'API returns the unchanged canonical story');
  page.on('request',request=>{if(request.url().includes('/api/')){assert.ok(['/api/config','/api/content/intro-story','/api/weather'].includes(new URL(request.url()).pathname));assert.equal(request.headers().authorization,undefined);assert.equal(request.method(),'GET');if(new URL(request.url()).pathname==='/api/content/intro-story')report.apiReads++;}});
  await page.route('**/api/content/intro-story',route=>route.continue());await page.goto(env.url);await startFromTitle(page);await leaveRoom();
  await page.evaluate(()=>{window.__introEvents=[];window.__roomEvents=[];window.__island.on('interact',event=>window.__roomEvents.push(event));window.__island.on('intro_ended',event=>window.__introEvents.push(event));});
  await visit('shore');await closeStory();
  await visit('desk');
  check(await page.evaluate(()=>JSON.stringify(window.__island.world.intro.actions)===JSON.stringify(['to_shore','shore_back','to_desk'])),'Physical shore-to-desk visit replays shore_back then to_desk');
  await choose('take_key');await pages();
  check(!await page.locator('.intro-journal').evaluate(journal=>journal.open),'Inventory and past prose stay collapsed during the current passage');
  await page.locator('.intro-journal>summary').click();
  check((await page.locator('.intro-inventory').textContent()).includes('key'),'Accepted pickup appears in the optional inventory');
  check(await page.locator('.intro-notes:not(.intro-ending-notes)').isVisible()&&(await page.locator('.intro-notes:not(.intro-ending-notes)').textContent()).length>0,'Engine notes remain available in Journal after a change');
  await page.keyboard.press('Escape');check(await page.locator('.intro-modal').isVisible(),'Closing Journal keeps the current passage open');await choose('read_log');await pages();
  await page.screenshot({path:'captures/20261105_G4-Act1-Desk.png'});
  await closeStory();await visit('shore');
  await choose('take_lantern');await choose('warn_harbor');await closeStory();
  await visit('tower_door');await choose('unlock_door');check(await page.locator('.intro-view').getAttribute('data-scene')==='stairwell','Stairwell plays in the dialogue box');
  await choose('climb');check(await page.locator('.intro-view').getAttribute('data-scene')==='lamp_room','Lamp room plays in the dialogue box');
  check(await page.evaluate(()=>JSON.stringify(window.__roomEvents)===JSON.stringify(['shore','desk','shore','tower_door'].map(id=>({type:'interact',id,place:'lighthouse_isle'})))),'Room inspections preserve the original exact interaction payloads');
  await choose('signal');await pages();check(await page.locator('.intro-ending').isVisible(),'The original ending card is shown');
  check(await page.evaluate(()=>JSON.stringify(window.__introEvents)===JSON.stringify([{type:'intro_ended',ending:'ending_rescue'}])),'Rescue emits the exact intro_ended payload once');
  await page.screenshot({path:'captures/20261105_G4-Act1-Ending.png'});report.endings.push('ending_rescue');
  const saved=await page.evaluate(()=>window.__island.world.intro.actions);
  await page.reload();await startFromTitle(page,{resume:true,closeIntro:false});await pages();
  check(await page.evaluate(saved=>JSON.stringify(window.__island.world.intro.actions)===JSON.stringify(saved),saved),'Reload restores a replayable move journal');
  await page.getByRole('button',{name:'Start a new intro'}).click();
  await page.evaluate(()=>{window.__introEvents=[];window.__island.on('intro_ended',event=>window.__introEvents.push(event));});
  for(const id of ['to_desk','take_key','desk_back','to_shore','take_lantern','trust_fisherman','shore_back','to_tower','unlock_door','climb'])await choose(id);
  await showChoice('signal');
  check(await page.locator('[data-choice=signal]').isDisabled(),'Engine-blocked choices are visibly locked');
  const before=await page.evaluate(()=>JSON.stringify({state:window.__island.world.intro.state,actions:window.__island.world.intro.actions}));await page.keyboard.press('1');
  check(await page.evaluate(before=>JSON.stringify({state:window.__island.world.intro.state,actions:window.__island.world.intro.actions})===before,before),'A locked choice changes no state or move log');
  await choose('untie');await pages();report.endings.push('ending_trapped');
  check(await page.evaluate(()=>JSON.stringify(window.__introEvents)===JSON.stringify([{type:'intro_ended',ending:'ending_trapped'}])),'Trapped ending emits once');
  await closeStory();
  check(await page.evaluate(()=>document.activeElement?.tagName==='CANVAS'&&!window.__island.world.busy),'Closing the story restores game focus and controls');
  report.proxyRequests=fixture.requests;
  check(fixture.requests.length>=report.apiReads+1&&fixture.requests.every(request=>request.method==='GET'&&!request.authorized&&request.path==='/api/content/intro-story'),
    'Node probe and browser story reads use only the anonymous canonical proxy endpoint');
  check(env.errors.length===0,'No browser errors');check(env.external.length===0,'No external requests');console.log(JSON.stringify(report,null,2));
} finally {try{await writeFile('captures/20261105_G4-Intro-Checks.json',JSON.stringify(report,null,2));}finally{try{await env.close();}finally{await fixture.close();}}}
