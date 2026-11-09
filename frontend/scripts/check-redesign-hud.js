// Screenshots and real title/world layout checks for the simplified start and HUD.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {openWorldBrowser} from './world-browser-tools.js';
import {stubIntro} from './intro-browser-fixture.js';
const output=process.env.CAPTURE_DIR||'/tmp/plot-twist-quiet-hud';
await mkdir(output,{recursive:true});
const env=await openWorldBrowser({preview:true}),{page}=env,report={checks:[]};
const check=(value,label)=>{assert.ok(value,label);report.checks.push(label);};
try{
  await stubIntro(page);await page.goto(env.url);await page.locator('.shell-screen[open]').waitFor();
  for(const [width,height] of [[1280,720],[375,667],[320,568]]){
    await page.setViewportSize({width,height});
    const layout=await page.locator('.shell-screen[open]').evaluate(element=>{
      const r=element.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,overflow:element.scrollWidth>element.clientWidth};
    });
    check(layout.left>=0&&layout.right<=width&&layout.top>=0&&layout.bottom<=height&&!layout.overflow,`Title stays inside ${width}×${height}`);
    check(await page.getByRole('button',{name:'Play with friends',exact:true}).isVisible(),`Friends is visible from the ${width}px title`);
    check(await page.locator('.shell-account').evaluate(element=>!element.open),`Account details start collapsed at ${width}px`);
    await page.screenshot({path:join(output,`title-${width}.png`)});
  }
  await page.getByRole('button',{name:'Play with friends',exact:true}).click();
  await page.getByText('Online crews are not connected in this build.',{exact:true}).waitFor();
  check(await page.getByText('Online crews are not connected in this build.',{exact:true}).isVisible(),'Unavailable online play has a short truthful explanation');
  await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Lighthouse prologue',exact:true}).click();
  await page.locator('.intro-modal[open]').waitFor();
  await page.locator('.intro-modal[open] .intro-view').waitFor();
  const room=page.locator('.interiors-scene:not([hidden])');await room.waitFor();
  await page.waitForFunction(()=>document.querySelector('.interiors-scene:not([hidden])')?.dataset.state==='ready');
  await page.keyboard.press('Escape');
  await page.locator('.intro-modal[open]').waitFor({state:'hidden'});
  await room.getByRole('button',{name:'Leave room',exact:true}).click();await room.waitFor({state:'hidden'});
  for(const [width,height] of [[1280,720],[375,667],[320,568]]){
    await page.setViewportSize({width,height});
    check(await page.locator('.controls').isHidden()&&await page.locator('.case-toolbar').isHidden(),`No permanent controls/tools at ${width}px`);
    const layout=await page.evaluate(()=>{
      const header=document.querySelector('.masthead').getBoundingClientRect(),actions=document.querySelector('.hud-actions').getBoundingClientRect();
      return {header:header.toJSON(),actions:actions.toJSON(),fits:header.left>=0&&header.right<=innerWidth&&actions.right<=innerWidth&&header.bottom<=actions.top};
    });
    await page.screenshot({path:join(output,`world-${width}.png`)});
    check(layout.fits,`Status and actions do not overlap at ${width}px: ${JSON.stringify(layout)}`);
  }
  await page.getByRole('button',{name:'Controls',exact:true}).click();
  check(await page.locator('.controls').isVisible(),'Controls open only on request');
  await page.getByRole('button',{name:'Journal',exact:true}).click();
  check(await page.locator('.controls').isHidden()&&await page.locator('.case-toolbar').isVisible(),'Journal replaces the guide instead of stacking panels');
  await page.getByRole('button',{name:'Journal',exact:true}).click();
  await page.getByRole('button',{name:'Menu',exact:true}).click();
  check(await page.locator('.shell-screen[open]').isVisible(),'Menu keeps the supplied shell/settings entry reachable');
  if(await page.locator('.shell-screen[data-mode=pause][open]').isVisible())await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.locator('.preferences').waitFor();
  check(await page.locator('.preference input[type=checkbox]').evaluateAll(elements=>elements.every(element=>{const r=element.getBoundingClientRect();return r.width>=44&&r.height>=44;})),'Deferred settings keep full-size checkbox targets');
  check(env.errors.length===0&&env.external.length===0,'No browser errors or external asset requests');
  console.log(JSON.stringify(report,null,2));
}finally{await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));await env.close();}
