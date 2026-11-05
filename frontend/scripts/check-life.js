// G7 new read-only screens, NPC life, preference persistence and phone readability.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openWorldBrowser,measure} from './world-browser-tools.js';
const env=await openWorldBrowser(),{page}=env,report={checks:[]};page.setDefaultTimeout(12000);
const check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);console.log(`PASS ${label}`);};
const open=name=>page.evaluate(name=>window.__island.caseUi.open(name),name);
const snap=name=>page.screenshot({path:`captures/20261105_G7-C2-${name}.png`});
try{
 await page.route('**/api/**',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));
 await page.goto(env.url+'/?case=local');await page.locator('#new-game').click();await page.waitForFunction(()=>window.__island);await page.locator('.intro-modal[open]').waitFor();await page.keyboard.press('Escape');
 await page.evaluate(()=>window.__plotTwist.adapter.dev.rehearse('board'));
 await open('rewards');check((await page.locator('.rewards-ledger').textContent()).includes('50 coins'),'Ledger shows supplied card and deduction rewards');check(await page.locator('.keepsake.owned').count()===0,'Keepsakes remain unearned before the solve');await snap('Ledger');
 await open('log');check((await page.locator('.captains-log').textContent()).includes('Rescue ending'),'Log records the intro ending and kit');check(await page.locator('.captains-log-sealed').count()===1,'Log reveal remains sealed before solve');
 await open('hints');await page.getByRole('button',{name:'Dismiss tip',exact:true}).first().click();
 check(await page.evaluate(()=>JSON.parse(localStorage.getItem('plot_twist_preferences_v1')).preferences.dismissedHints.includes('captains-log')),'Dismissed hints are device preferences');
 await page.getByRole('button',{name:'Hints on',exact:true}).click();check(await page.getByRole('button',{name:'Review the Captain’s Table',exact:true}).count()===1,'What next actions stay available when first-use hints are off');
 await open('partners');const card=page.locator('.partner-life-card[data-seat="2"]');await card.getByLabel('Order',{exact:true}).selectOption('fetch');await card.getByLabel('Target',{exact:true}).selectOption('C3');await card.getByRole('button',{name:'Send order',exact:true}).click();
 check((await card.locator('.partner-life-status').textContent())==='travelling','A supplied partner job starts travelling');
 await page.keyboard.press('Escape');await page.evaluate(()=>window.__island.chart.show());check(await page.locator('.chart-map svg line').count()>0,'Sea chart displays supplied partner journey lines');await page.keyboard.press('Escape');
 await page.evaluate(()=>window.__plotTwist.adapter.dev.advanceCase(600));await open('partners');check((await card.locator('.partner-life-report').textContent()).includes('ready to report'),'A completed partner errand has a visible report');
 await page.keyboard.press('Escape');
 await page.route('**/src/shell/hints/shortcuts.js*',async route=>{await new Promise(resolve=>setTimeout(resolve,200));await route.continue();});
 await page.keyboard.press('?');await page.keyboard.press('Escape');await page.waitForTimeout(450);
 check(await page.getByRole('dialog',{name:'Keyboard and controller shortcuts'}).count()===0||!await page.getByRole('dialog',{name:'Keyboard and controller shortcuts'}).isVisible(),'Escape cancels the pending shortcuts import');
 check(!await page.locator('.shell-screen[open]').count(),'Cancelling pending help does not also pause');await page.unroute('**/src/shell/hints/shortcuts.js*');
 await page.keyboard.press('?');await page.getByRole('dialog',{name:'Keyboard and controller shortcuts'}).waitFor();check(true,'Question-mark opens keyboard shortcuts');
 const position=await page.evaluate(()=>window.__island.player.position.toArray());await page.keyboard.down('KeyW');await page.waitForTimeout(120);await page.keyboard.up('KeyW');
 check(await page.evaluate(before=>JSON.stringify(window.__island.player.position.toArray())===JSON.stringify(before),position),'Shortcuts block world movement');
 await page.keyboard.press('Escape');check(!await page.locator('.shell-screen[open]').count(),'Escape closes the top help panel before pause');
 await page.setViewportSize({width:375,height:667});
 for(const name of ['rewards','log','hints','partners']){await open(name);const bounds=await page.locator('.case-modal').evaluate(el=>({overflow:el.scrollWidth>el.clientWidth,bounds:el.getBoundingClientRect().toJSON()}));check(!bounds.overflow&&bounds.bounds.x>=0&&bounds.bounds.right<=375,`${name} fits at 375 px`);await snap(name+'-Phone');}
 await page.keyboard.press('Escape');await page.evaluate(()=>window.__island.world.goTo('saltreach_harbor',{fast:true}));await page.waitForTimeout(300);report.performance=await measure(page);check(report.performance.calls<150,'Crew characters remain within the world draw-call budget');await snap('Crew-World');
 check(env.errors.every(error=>error.includes('503'))&&env.external.length===0,'Only injected API-down diagnostics, no external assets');console.log(JSON.stringify(report,null,2));
}catch(error){report.failure=error.message;await snap('Failure');throw error;}
finally{await writeFile('captures/20261105_G7-C2-Checks.json',JSON.stringify(report,null,2));await env.close();}
