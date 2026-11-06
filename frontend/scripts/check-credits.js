// Credits-only browser check. No game renderer, audio, account or backend is needed.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openWorldBrowser} from './world-browser-tools.js';
const production=process.env.CREDITS_PRODUCTION==='1';
const env=await openWorldBrowser({preview:production}),{page}=env,report={checks:[]};
function check(ok,label){assert.ok(ok,label);report.checks.push(label);}
try{
  await page.goto(env.url);check(await page.getByRole('button',{name:'Credits',exact:true}).count()===0,'Credits do not appear on the title menu');await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Credits',exact:true}).click();await page.locator('.shell-credits').waitFor();
  check(await page.locator('.shell-credits ul li').count()===4,'Four editable team credit rows');
  const text=await page.locator('.shell-credits').textContent();
  check(!text.includes('<name>')&&text.includes('Teammate name pending'),'Unknown teammate names are explicit pending credits without raw placeholders');
  for(const expected of ['Nils Lenke','Open-Meteo.com','Binance Vision','CC BY-NC-SA 4.0','Apache-2.0','HPND'])check(text.includes(expected),'Credits include '+expected);
  check(await page.getByRole('link',{name:'Replay license · CC BY-NC-SA 4.0'}).getAttribute('href')==='https://creativecommons.org/licenses/by-nc-sa/4.0/','Recorded replay links its stated licence');
  if(production){const link=page.getByRole('link',{name:'Third-party software notices'});const response=await page.request.get(new URL(await link.getAttribute('href'),env.url+'/').href);const notices=await response.text();check(response.ok()&&notices.includes('three.js authors')&&notices.includes('Vite core license'),'Built Credits serves exact dependency and helper notices');}
  for(const width of [1280,375]){await page.setViewportSize({width,height:800});check(await page.locator('.shell-screen[open]').evaluate(el=>el.scrollWidth<=el.clientWidth),'Credits wrap at '+width+' px');await page.screenshot({path:`captures/20261105_G7-C0-Credits-${width}.png`});}
  await page.keyboard.press('Escape');check(await page.locator('.shell-screen[open]').getAttribute('data-mode')==='settings','Credits Escape returns to Settings');await page.keyboard.press('Escape');check(await page.locator('.shell-screen[open]').getAttribute('data-mode')==='title','Settings Escape returns to the title');
  check(env.errors.length===0&&env.external.length===0,'No browser errors or external requests');
  console.log(JSON.stringify(report,null,2));
}finally{await writeFile('captures/20261105_G7-C0-Credits-Checks.json',JSON.stringify(report,null,2));await env.close();}
