// Credits-only browser check. No game renderer, audio, account or backend is needed.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openWorldBrowser} from './world-browser-tools.js';
const env=await openWorldBrowser(),{page}=env,report={checks:[]};
function check(ok,label){assert.ok(ok,label);report.checks.push(label);}
try{
  await page.goto(env.url);await page.getByRole('button',{name:'Credits',exact:true}).click();
  check(await page.locator('.shell-credits ul li').count()===4,'Four editable team credit rows');
  const text=await page.locator('.shell-credits').textContent();
  for(const expected of ['Nils Lenke','Open-Meteo.com','Binance Vision','CC BY-NC-SA 4.0','Apache-2.0','HPND'])check(text.includes(expected),'Credits include '+expected);
  check(await page.getByRole('link',{name:'Replay licence · CC BY-NC-SA 4.0'}).getAttribute('href')==='https://creativecommons.org/licenses/by-nc-sa/4.0/','Recorded replay links its stated licence');
  for(const width of [1280,375]){await page.setViewportSize({width,height:800});check(await page.locator('.shell-screen[open]').evaluate(el=>el.scrollWidth<=el.clientWidth),'Credits wrap at '+width+' px');await page.screenshot({path:`captures/20261105_G7-C0-Credits-${width}.png`});}
  check(env.errors.length===0&&env.external.length===0,'No browser errors or external requests');
  console.log(JSON.stringify(report,null,2));
}finally{await writeFile('captures/20261105_G7-C0-Credits-Checks.json',JSON.stringify(report,null,2));await env.close();}
