// T26: recorded-weather game journey and desktop/phone screenshots. No live account or API writes.
// T46: `node scripts/check-island-weather.js after live` swaps the recorded answer for a live storm with
// tonight's fog forecast; the default (`fallback`) keeps the recorded answer of weather-browser-fixture.js.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {DEFAULT_ATTRIBUTION} from '../src/net/weather.js';
import {openWorldBrowser} from './world-browser-tools.js';
const phase=process.argv[2]??'after',variant=process.argv[3]??'fallback';
const dir=process.env.SHOTS_DIR??'captures/t26';await mkdir(dir,{recursive:true});
const env=await openWorldBrowser({hmr:false});const {page}=env;
// The sea stays clear (heavy weather slowed the intro past its waits on a test machine); the server's
// state and tonight's forecast are what the card reads.
const LIVE={cloudCover:.05,rain:0,fog:.02,wind:.18,isDay:true,summary:'Thunderstorm, windy',place:'Coastal test station',source:'live',
 fetchedAt:'2026-11-14T15:50:00Z',attribution:DEFAULT_ATTRIBUTION,state:'storm',tonight:{date:'2026-11-14',startsAt:'2026-11-14T18:00:00Z',
 endsAt:'2026-11-15T06:00:00Z',isNow:false,state:'fog',isFogNight:true,fogNightKind:'real'}};
const EXPECT=variant==='live'?[/Storm: 50% more pirate ships/,/Forecast for tonight here: fog\. Only to read: no coins are at stake\./]
 :[/Calm: a quiet sea/,/This is a recorded reading from 2026-11-05 00:00 UTC, not today's weather\./];
const tag=variant==='fallback'?'':`-${variant}`;
// The island card re-renders while it loads: wait for the Harbor entry to stay put before using it.
async function settledEntry(){
 const entry=page.locator('[data-stall="weather"] button');
 for(let n=0;n<20;n++){try{await entry.scrollIntoViewIfNeeded({timeout:1000});return entry;}catch{await page.waitForTimeout(250);}}
 return entry;
}
try {
 if(variant==='live')await page.route('**/api/weather',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(LIVE)}));
 await page.goto(env.url+'/?islands=fake');
 await page.locator('#play').click();
 for(let n=0;n<15;n++){
  await page.waitForFunction(()=>document.querySelector('dialog[open]')||window.__island?.world.current?.id==='home_islet')
   .catch(async error=>{await page.screenshot({path:`${dir}/${phase}${tag}-stuck.png`});throw error;});
  // A cutscene or card can change between isVisible and click (a slow machine waited 30 s on a click that
  // had landed); tap() gives up quickly and the next pass of the loop looks again.
  const tap=locator=>locator.click({timeout:3000,noWaitAfter:true}).catch(()=>locator.evaluate(node=>node.click()).catch(()=>{}));
  const skip=page.getByRole('button',{name:'Skip',exact:true}),gotIt=page.getByRole('button',{name:'Got it',exact:true});
  const create=page.getByRole('button',{name:'Create a game',exact:true});
  if(await skip.isVisible())await tap(skip);
  else if(await gotIt.isVisible())await tap(gotIt);
  else if(await create.isVisible())await tap(create);
  else if(await page.locator('.island-card-lobby[open]').count())await tap(page.locator('.island-card-lobby[open]').getByRole('button',{name:'Start',exact:true}));
  else if(await page.evaluate(()=>window.__island?.world.current?.id==='home_islet'&&!document.querySelector('dialog[open]')))break;
  await page.waitForTimeout(500);
 }
 await page.waitForFunction(()=>window.__island?.island?.island);
 await page.evaluate(async()=>{const i=window.__island.island;i.dev.setWaveBest(4);await i.load();i.ui.close();i.pick('island_harbor');});
 for(const [width,height] of [[1280,720],[375,812]]){
  await page.setViewportSize({width,height});
  if(!tag)await page.screenshot({path:`${dir}/${phase}-${width}-harbor.png`});
  if(phase==='after'&&!tag){await settledEntry();await page.screenshot({path:`${dir}/${phase}-${width}-entry.png`});}
  if(phase==='after'){
   await (await settledEntry()).click();
   await page.locator('.harbor-weather[open]').waitFor();
   assert.equal(await page.locator('dialog[open]').count(),1);
   const shown=await page.locator('.harbor-weather[open]').textContent();
   for(const line of [...EXPECT,/A wave uses the weather where its bell is rung/])assert.match(shown,line);
   const box=await page.locator('.harbor-weather[open]').boundingBox();
   assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=height);
   await page.screenshot({path:`${dir}/${phase}-${width}-weather${tag}.png`});
   await page.keyboard.press('Escape');
   assert.equal(await page.locator('dialog[open]').count(),0);
   await page.evaluate(()=>window.__island.island.pick('island_harbor'));
  }
 }
 console.log('Captured '+phase+' '+variant+' Harbor at 1280×720 and 375×812');
}finally{await env.close();}
