// T26: recorded-weather game journey and desktop/phone screenshots. No live account or API writes.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {openWorldBrowser} from './world-browser-tools.js';
const phase=process.argv[2]??'after';
const dir=process.env.SHOTS_DIR??'captures/t26';await mkdir(dir,{recursive:true});
const env=await openWorldBrowser({hmr:false});const {page}=env;
try {
 await page.goto(env.url+'/?islands=fake');
 await page.locator('#play').click();
 for(let n=0;n<15;n++){
  await page.waitForFunction(()=>document.querySelector('dialog[open]')||window.__island?.world.current?.id==='home_islet');
  const skip=page.getByRole('button',{name:'Skip',exact:true});
  if(await skip.isVisible())await skip.click();
  else if(await page.getByRole('button',{name:'Got it',exact:true}).isVisible())await page.getByRole('button',{name:'Got it',exact:true}).click();
  else if(await page.getByRole('button',{name:'Create a game',exact:true}).isVisible())await page.getByRole('button',{name:'Create a game',exact:true}).click();
  else if(await page.locator('.island-card-lobby[open]').count()){await page.locator('.island-card-lobby[open]').getByRole('button',{name:'Start',exact:true}).click();}
  else if(await page.evaluate(()=>window.__island?.world.current?.id==='home_islet'&&!document.querySelector('dialog[open]')))break;
  await page.waitForTimeout(500);
 }
 await page.waitForFunction(()=>window.__island?.island?.island);
 await page.evaluate(async()=>{const i=window.__island.island;i.dev.setWaveBest(4);await i.load();i.ui.close();i.pick('island_harbor');});
 for(const [width,height] of [[1280,720],[375,812]]){
  await page.setViewportSize({width,height});
  await page.screenshot({path:`${dir}/${phase}-${width}-harbor.png`});
  if(phase==='after'){await page.locator('[data-stall="weather"] button').scrollIntoViewIfNeeded();await page.screenshot({path:`${dir}/${phase}-${width}-entry.png`});}
  if(phase==='after'){
   await page.locator('[data-stall="weather"] button').click();
   await page.locator('.harbor-weather[open]').waitFor();
   assert.equal(await page.locator('dialog[open]').count(),1);
   assert.match(await page.locator('.harbor-weather[open]').textContent(),/Calm: a quiet sea/);
   const box=await page.locator('.harbor-weather[open]').boundingBox();
   assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=height);
   await page.screenshot({path:`${dir}/${phase}-${width}-weather.png`});
   await page.keyboard.press('Escape');
   assert.equal(await page.locator('dialog[open]').count(),0);
   await page.evaluate(()=>window.__island.island.pick('island_harbor'));
  }
 }
 console.log('Captured '+phase+' Harbor at 1280×720 and 375×812');
}finally{await env.close();}
