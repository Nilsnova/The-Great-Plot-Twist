// Verify the injected identity in built files and Settings > About, and that play shows no build badge.
import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {openWorldBrowser} from './world-browser-tools.js';
import {stubIntro} from './intro-browser-fixture.js';
import {startFromTitle} from './shell-browser-tools.js';
const stamp=JSON.parse(await readFile('dist/build-stamp.json','utf8'));
const files=await readdir('dist/assets');let embedded=false;
for(const name of files.filter(name=>name.endsWith('.js'))){const text=await readFile('dist/assets/'+name,'utf8');if(text.includes(stamp.sha)&&text.includes(stamp.builtAt))embedded=true;}
assert.ok(embedded,'Built JavaScript contains the same SHA and time as the public build stamp');
const env=await openWorldBrowser({preview:true}),{page}=env,report={stamp,checks:['Built JavaScript contains the injected stamp']};
const check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};
try{
  await stubIntro(page);await page.goto(env.url);await page.locator('#title-build-stamp').waitFor({state:'visible'});
  check((await page.locator('#title-build-stamp').textContent()).includes(stamp.sha),'Built title HTML contains the release identity');
  check(await page.locator('.shell-screen').evaluate((el,sha)=>!el.textContent.includes(sha)&&getComputedStyle(el.querySelector('.kit-modal-header'),'::after').content==='none',stamp.sha),'The title shows no build badge; the stamp lives in Settings > About');
  await page.setViewportSize({width:375,height:812});await page.screenshot({path:'captures/20261106_G9-C0/title-stamp-375.png'});await page.setViewportSize({width:1440,height:900});
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.locator('.build-info').waitFor();
  check(await page.locator('.build-info').evaluate((el,stamp)=>el.dataset.sha===stamp.sha&&el.dataset.builtAt===stamp.builtAt&&el.closest('.shell-section')?.querySelector('h3')?.textContent==='About',stamp),'Settings > About displays the injected commit and build time');
  await page.getByRole('button',{name:'Credits',exact:true}).click();await page.locator('.shell-credits .build-info').waitFor();
  check(await page.locator('.build-info').getAttribute('data-sha')===stamp.sha,'Credits uses the same build identity');
  await page.screenshot({path:'captures/20261106_G9-Build-Stamp-Credits.png'});
  await page.keyboard.press('Escape');await page.locator('.preferences').waitFor();await page.keyboard.press('Escape');await startFromTitle(page);
  check(await page.locator('.build-badge').count()===0&&await page.evaluate(sha=>[...document.querySelectorAll('.hud')].every(el=>!el.textContent.includes(sha)),stamp.sha),'Normal gameplay shows no build badge; the stamp lives in Settings > About');
  await page.setViewportSize({width:375,height:667});
  check(await page.locator('.build-badge').count()===0,'The phone play area carries no build label');
  await page.screenshot({path:'captures/20261106_G9-Build-Stamp-World-375.png'});
  await page.goto(env.url+'/?demo=1');await page.getByRole('button',{name:'Highlights tour',exact:true}).click();await page.locator('.intro-modal[open]').waitFor();
  check(await page.locator('.build-badge').count()===0,'Presenter mode contains no corner build label');
  await page.goto(env.url+'/?perf=1');await startFromTitle(page);
  await page.evaluate(()=>{window.__copiedPerf='';Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copiedPerf=text;}}});});
  await page.waitForFunction(()=>document.querySelector('.performance-panel dd')?.textContent!=='Unavailable');
  await page.locator('.performance-panel').getByRole('button',{name:'Copy numbers'}).click();
  await page.waitForFunction(()=>!!window.__copiedPerf);
  check(await page.evaluate(stamp=>window.__copiedPerf.includes(stamp.sha)&&window.__copiedPerf.includes(stamp.builtAt),stamp),'Performance copy contains the same identity and build time');
  check(env.errors.length===0&&env.external.length===0,'Build stamp has no browser error or external dependency');
  console.log(JSON.stringify(report,null,2));
}finally{await writeFile('captures/20261106_G9-Build-Stamp-Checks.json',JSON.stringify(report,null,2)+'\n');await env.close();}
