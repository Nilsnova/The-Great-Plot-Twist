import {stubIntro} from './intro-browser-fixture.js';
import {startFromTitle,closeSettings} from './shell-browser-tools.js';
// Verify the graphics startup hands the weather client's values to the existing island hook.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openWorldBrowser} from './world-browser-tools.js';
import {stubWeather} from './weather-browser-fixture.js';
const env=await openWorldBrowser(),{page}=env;
const report={checked:new Date().toISOString(),checks:[]};
try {
  await page.unroute('**/api/weather');await stubWeather(page,{wind:.73,rain:.44,fog:.35,cloudCover:.7});
  await stubIntro(page);await page.goto(env.url);await startFromTitle(page);
  await page.waitForFunction(()=>document.querySelector('.weather-credit a'));
  const weather=await page.evaluate(async()=>{const {getWeather}=await import('/src/world/weather.js');return getWeather();});
  assert.deepEqual(weather,{wind:.73,rain:.44,fog:.35,cloudCover:.7});report.checks.push('Startup weather response drives the existing four weather values');
  const links=await page.locator('.weather-credit a').evaluateAll(nodes=>nodes.map(node=>({text:node.textContent,href:node.href})));
  assert.ok(links[0].text.includes('adapted for the game')&&links[0].href==='https://open-meteo.com/');
  assert.equal(links[1].text,'CC BY 4.0');assert.equal(links[1].href,'https://creativecommons.org/licenses/by/4.0/');
  report.checks.push('Readable attribution links name the source, adaptation and licence beside the weather');
  await page.screenshot({path:'captures/20261105_G4-Weather-Credit.png'});
  assert.deepEqual(env.errors,[]);assert.deepEqual(env.external,[]);report.checks.push('No browser errors or external asset requests');console.log(JSON.stringify(report,null,2));
} finally {await writeFile('captures/20261105_G4-Weather-Checks.json',JSON.stringify(report,null,2));await env.close();}
