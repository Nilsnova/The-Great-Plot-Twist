// G29 C1 evidence: title, lore cutscene, goal card and harbor start, with the click count from the URL.
// node scripts/capture-front-door.js [outDir] [--preview]. Offline API fixtures only; no live services.
import {mkdir,writeFile} from 'node:fs/promises';
import {openWorldBrowser} from './world-browser-tools.js';
const outDir=process.argv.slice(2).find(value=>!value.startsWith('--'))??'captures/20261109_G29-C1';
const env=await openWorldBrowser({preview:process.argv.includes('--preview')}),{page}=env,report={clicks:0,steps:[]};
const step=(label,extra={})=>{report.steps.push({label,clicks:report.clicks,...extra});};
try{
  await mkdir(outDir,{recursive:true});
  await page.setViewportSize({width:1280,height:720});
  await page.goto(env.url);await page.locator('#play').waitFor();
  await page.screenshot({path:`${outDir}/01-title-desktop.png`});step('title');
  await page.locator('#play').click();report.clicks++;
  await page.locator('dialog.cutscene[open]').waitFor();
  await page.waitForFunction(()=>document.querySelector('dialog.cutscene')?.dataset.line==='lore_intro_02',null,{timeout:15000});
  await page.waitForTimeout(900);await page.screenshot({path:`${outDir}/02-cutscene-lore.png`});step('cutscene',{line:'lore_intro_02'});
  await page.waitForFunction(()=>document.querySelector('dialog.cutscene')?.dataset.line==='lore_intro_03',null,{timeout:15000});
  await page.waitForTimeout(900);await page.screenshot({path:`${outDir}/03-cutscene-dark.png`});
  await page.waitForFunction(()=>document.querySelector('dialog.cutscene')?.dataset.line==='lore_intro_04',null,{timeout:15000});
  await page.waitForTimeout(900);await page.screenshot({path:`${outDir}/03-cutscene-chart.png`});
  await page.waitForFunction(()=>document.querySelector('dialog.cutscene')?.dataset.line==='lore_intro_06',null,{timeout:15000});
  await page.waitForTimeout(900);await page.screenshot({path:`${outDir}/03-cutscene-harbor.png`});
  await page.getByRole('button',{name:'Skip',exact:true}).click();report.clicks++;
  await page.locator('.goal-card[open]').waitFor({timeout:30000});
  await page.waitForTimeout(600);await page.screenshot({path:`${outDir}/04-goal-card.png`});step('goal card');
  await page.getByRole('button',{name:'Got it',exact:true}).click();report.clicks++;
  // The production preview hides window.__island, so the HUD's place name stands in there.
  const dev=await page.evaluate(()=>!!window.__island);
  await page.waitForFunction(dev=>!document.querySelector('dialog[open]')&&(dev?window.__island.world.current?.id==='saltreach_harbor'
    :document.querySelector('.masthead')?.textContent.includes('Saltreach Harbor')),dev);
  await page.waitForTimeout(1500);await page.screenshot({path:`${outDir}/05-harbor-start.png`});
  const where=await page.evaluate(()=>window.__island?{place:window.__island.world.current.id,
    player:{x:+window.__island.player.position.x.toFixed(2),z:+window.__island.player.position.z.toFixed(2)},
    focused:document.activeElement?.matches('canvas[tabindex="0"]')}:{place:'saltreach_harbor',
    focused:document.activeElement?.matches('canvas[tabindex="0"]')});
  step('harbor',where);
  await page.keyboard.down('KeyW');await page.waitForTimeout(500);await page.keyboard.up('KeyW');
  report.moved=dev?await page.evaluate(start=>Math.hypot(window.__island.player.position.x-start.x,window.__island.player.position.z-start.z)>0.2,where.player):null;
  await page.setViewportSize({width:390,height:844});await page.goto(env.url);await page.locator('#play').waitFor();
  await page.screenshot({path:`${outDir}/06-title-phone.png`});
  report.errors=env.errors;report.external=env.external;
  await writeFile(`${outDir}/journey.json`,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
  if(env.errors.length||env.external.length||report.moved===false||where.place!=='saltreach_harbor'||where.interior)process.exitCode=1;
}finally{await env.close();}
