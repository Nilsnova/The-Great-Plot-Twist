// Verify the injected identity in built files, menus and the presenter-safe world badge.
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
  await stubIntro(page);await page.goto(env.url);await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.locator('.build-info').waitFor();
  check(await page.locator('.build-info').evaluate((el,stamp)=>el.dataset.sha===stamp.sha&&el.dataset.builtAt===stamp.builtAt,stamp),'Settings displays the injected commit and build time');
  await page.getByRole('button',{name:'Credits',exact:true}).click();await page.locator('.shell-credits .build-info').waitFor();
  check(await page.locator('.build-info').getAttribute('data-sha')===stamp.sha,'Credits uses the same build identity');
  await page.screenshot({path:'captures/20261106_G9-Build-Stamp-Credits.png'});
  await page.keyboard.press('Escape');await page.keyboard.press('Escape');await startFromTitle(page);
  check(await page.locator('.build-badge').isVisible()&&(await page.locator('.build-badge').textContent()).includes(stamp.sha),'Normal gameplay has a small version badge');
  await page.setViewportSize({width:375,height:667});
  check(await page.locator('.build-badge').evaluate(el=>{const r=el.getBoundingClientRect(),footer=document.querySelector('.conditions').getBoundingClientRect();return parseFloat(getComputedStyle(el).fontSize)>=16&&r.left>=0&&r.right<=innerWidth&&r.bottom<=footer.top;}),'Phone badge remains readable and above the weather controls');
  await page.screenshot({path:'captures/20261106_G9-Build-Stamp-World-375.png'});
  await page.goto(env.url+'/?demo=1');await page.getByRole('button',{name:'Highlights tour',exact:true}).click();await page.locator('.intro-modal[open]').waitFor();
  check(await page.locator('.build-badge').count()===0,'Presenter mode contains no corner build label');
  check(env.errors.length===0&&env.external.length===0,'Build stamp has no browser error or external dependency');
  console.log(JSON.stringify(report,null,2));
}finally{await writeFile('captures/20261106_G9-Build-Stamp-Checks.json',JSON.stringify(report,null,2)+'\n');await env.close();}
