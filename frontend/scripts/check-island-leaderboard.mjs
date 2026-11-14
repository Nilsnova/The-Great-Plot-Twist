// T7 local game evidence. Sample islands only; never reads live player records.
// Run from frontend: node scripts/check-island-leaderboard.mjs before|after
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {openWorldBrowser} from './world-browser-tools.js';
const phase=process.argv[2]??'before';
const dir=process.env.SHOTS_DIR??'captures/20261113_T7';await mkdir(dir,{recursive:true});
const env=await openWorldBrowser({hmr:false});const {page}=env;
try {
 if(phase==='before') await page.route('**/src/island/index.js', route => route.fulfill({contentType:'text/javascript', body:execFileSync('git',['show','338a6816:frontend/src/island/index.js'],{encoding:'utf8'})}));
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

 for(const [width,height] of [[1280,720],[375,812]]){
  await page.setViewportSize({width,height});
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Resume',exact:true}).waitFor();
  await page.screenshot({path:`${dir}/${phase}-${width}-menu.png`});
  if(phase==='before') { assert.equal(await page.getByRole('button',{name:'Leaderboard',exact:true}).count(),0); await page.getByRole('button',{name:'Resume',exact:true}).click(); continue; }
  await page.getByRole('button',{name:'Leaderboard',exact:true}).click();
  await page.locator('.island-card-leaderboard[open]').waitFor();
  await page.getByRole('button',{name:'Try again',exact:true}).waitFor();
  await page.screenshot({path:`${dir}/after-${width}-offline.png`});
  await page.evaluate(()=>{const i=window.__island.island; i.ui.close();
    i.ui.leaderboardCard({data:{weekStart:'2026-11-09T00:00:00Z',weekEnd:'2026-11-16T00:00:00Z',entries:Array.from({length:10},(_,n)=>({rank:n+1,name:n===0?'Captain with a very long name':`Captain ${n+1}`,wave:30-n}))}},()=>{});
  });
  const card=page.locator('.island-card-leaderboard[open]');
  assert.equal(await card.locator('li').count(),10);
  assert.ok(await card.evaluate(el=>el.scrollWidth<=el.clientWidth));
  const controls = await card.locator('button').evaluateAll(buttons => buttons.map(b => ({width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height})));
  assert.ok(controls.every(b => b.width >= 44 && b.height >= 44));
  const contrast = await card.evaluate(async root => {
    const h = await import('/scripts/a11y-helpers.js');
    return [...root.querySelectorAll('.island-leaderboard-row span, .island-leaderboard-name, .island-purpose')].map(el => {
      let bg = null;
      for (let n = el; n && !bg; n = n.parentElement) { const color = h.parseColour(getComputedStyle(n).backgroundColor); if (color?.a === 1) bg = color; }
      return h.contrastRatio(h.parseColour(getComputedStyle(el).color), bg);
    });
  });
  assert.ok(contrast.every(value => value >= 4.5), 'Leaderboard text contrast');
  await page.screenshot({path:`${dir}/after-${width}-top10.png`});
  await page.evaluate(()=>{const i=window.__island.island;i.ui.leaderboardCard({data:{weekStart:'2026-11-09T00:00:00Z',weekEnd:'2026-11-16T00:00:00Z',entries:[{rank:1,name:'Captain Gull',wave:45},{rank:2,name:'Captain Brine',wave:30},{rank:3,name:'Captain Reed',wave:12}]}},()=>{});});
  assert.equal(await card.locator('li').count(),3);
  await page.screenshot({path:`${dir}/after-${width}-three-islands.png`});
  await page.keyboard.press('Escape');
  assert.equal(await card.count(), 0);
 }
 console.log('T7 desktop/phone menu, offline and fixture top 10 checks passed ('+phase+').');
}finally{await env.close();}
