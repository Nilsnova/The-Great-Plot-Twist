import {startFromTitle,closeSettings} from './shell-browser-tools.js';
// Weather still drives the island; provider/licence details are available only in Settings → Credits.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openWorldBrowser} from './world-browser-tools.js';
import {stubWeather} from './weather-browser-fixture.js';
const env=await openWorldBrowser(),{page}=env;
const report={checked:new Date().toISOString(),checks:[]};
try {
  await page.unroute('**/api/weather');await stubWeather(page,{wind:.73,rain:.44,fog:.35,cloudCover:.7});
  await page.goto(env.url);await startFromTitle(page);
  await page.waitForFunction(async()=>{const {getWeather}=await import('/src/world/weather.js');return getWeather().wind===.73;});
  const weather=await page.evaluate(async()=>{const {getWeather}=await import('/src/world/weather.js');return getWeather();});
  assert.deepEqual(weather,{wind:.73,rain:.44,fog:.35,cloudCover:.7});report.checks.push('Startup weather response still drives all four weather values');
  assert.equal(await page.locator('.weather-credit').count(),0);
  assert.ok(!(await page.locator('.hud').textContent()).includes('CC BY'));
  report.checks.push('Gameplay has no provider, licence or attribution block');
  report.hud=[];
  for(const [width,height] of [[1280,800],[375,667]]){
    await page.setViewportSize({width,height});const bounds=await page.locator('.conditions').boundingBox();
    assert.ok(bounds.height<=80&&bounds.width<300);report.hud.push({viewport:width,...bounds});
    await page.screenshot({path:`captures/20261106_G8-Clean-Weather-HUD-${width}.png`});
  }
  report.checks.push('Weather and time stay compact on desktop and phone');
  await page.getByRole('button',{name:'Open visual settings'}).click();
  await page.getByRole('button',{name:'Credits',exact:true}).click();await page.locator('.shell-credits').waitFor();
  assert.ok((await page.locator('.shell-credits').textContent()).includes('adapted for the game'));
  assert.equal(await page.getByRole('link',{name:'Open-Meteo',exact:true}).getAttribute('href'),'https://open-meteo.com/');
  assert.equal(await page.getByRole('link',{name:'CC BY 4.0',exact:true}).getAttribute('href'),'https://creativecommons.org/licenses/by/4.0/');
  report.checks.push('Settings → Credits retains source, adaptation and licence links');
  await page.screenshot({path:'captures/20261106_G8-Settings-Credits-375.png'});
  await page.getByRole('button',{name:'Back',exact:true}).click();
  assert.equal(await page.locator('.shell-screen[open]').getAttribute('data-mode'),'settings');
  await closeSettings(page,{keyboard:true});
  assert.equal(await page.locator('.weather-credit').count(),0);
  report.checks.push('Credits Back returns to Settings, then gameplay without an attribution overlay');
  assert.deepEqual(env.errors,[]);assert.deepEqual(env.external,[]);report.checks.push('No browser errors or external asset requests');console.log(JSON.stringify(report,null,2));
} finally {await writeFile('captures/20261106_G8-Clean-HUD-Checks.json',JSON.stringify(report,null,2)+'\n');await env.close();}
