// Screenshots and real title/world layout checks for the simplified start and HUD.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {openWorldBrowser} from './world-browser-tools.js';
import {startFromTitle} from './shell-browser-tools.js';
const output=process.env.CAPTURE_DIR||'/tmp/plot-twist-quiet-hud';
await mkdir(output,{recursive:true});
const env=await openWorldBrowser({preview:true}),{page}=env,report={checks:[]};
const check=(value,label)=>{assert.ok(value,label);report.checks.push(label);};
try{
  await page.goto(env.url);await page.locator('.shell-screen[open]').waitFor();
  for(const [width,height] of [[1280,720],[375,667],[320,568]]){
    await page.setViewportSize({width,height});
    const layout=await page.locator('.shell-screen[open]').evaluate(element=>{
      const r=element.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,overflow:element.scrollWidth>element.clientWidth};
    });
    check(layout.left>=0&&layout.right<=width&&layout.top>=0&&layout.bottom<=height&&!layout.overflow,`Title stays inside ${width}×${height}`);
    check(await page.locator('.shell-menu').getByRole('button',{name:'Join',exact:true}).isVisible(),`Join (the class code) is visible from the ${width}px title`);
    check(await page.locator('.shell-screen[open] .shell-account, .shell-screen[open] .account-summary').count()===0,`Account details stay off the ${width}px title (they live in Settings > Account)`);
    await page.screenshot({path:join(output,`title-${width}.png`)});
  }
  await page.setViewportSize({width:1280,height:720});await startFromTitle(page);
  for(const [width,height] of [[1280,720],[375,667],[320,568]]){
    await page.setViewportSize({width,height});
    check(await page.locator('.hud [data-hud-group]').evaluateAll(nodes=>nodes.filter(node=>node.getClientRects().length).length)===3&&await page.locator('.case-toolbar,.controls').count()===0,`Three HUD groups and no Journal at ${width}px`);
    const layout=await page.evaluate(()=>{
      const coins=document.querySelector('.hud-coins').getBoundingClientRect(),menu=document.querySelector('.hud-menu').getBoundingClientRect(),strip=document.querySelector('.quest-strip').getBoundingClientRect();
      return {coins:coins.toJSON(),menu:menu.toJSON(),strip:strip.toJSON(),fits:coins.left>=0&&menu.right<=innerWidth&&strip.right<=innerWidth&&coins.right<menu.left&&menu.bottom<=strip.top};
    });
    await page.screenshot({path:join(output,`world-${width}.png`)});
    check(layout.fits,`Coins, Menu and quest strip do not overlap at ${width}px: ${JSON.stringify(layout)}`);
  }
  await page.getByRole('button',{name:'Menu',exact:true}).click();
  check(await page.locator('.shell-screen[open]').isVisible(),'Menu keeps the supplied shell/settings entry reachable');
  if(await page.locator('.shell-screen[data-mode=pause][open]').isVisible())await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.locator('.preferences').waitFor();
  check(await page.locator('.preference input[type=checkbox]').evaluateAll(elements=>elements.every(element=>{const r=element.getBoundingClientRect();return r.width>=44&&r.height>=44;})),'Deferred settings keep full-size checkbox targets');
  check(env.errors.length===0&&env.external.length===0,'No browser errors or external asset requests');
  console.log(JSON.stringify(report,null,2));
}finally{await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));await env.close();}
