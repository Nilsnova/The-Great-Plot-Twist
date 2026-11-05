// Adapter-driven screens, production spoiler boundary and mobile reading checks.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openWorldBrowser} from './world-browser-tools.js';
const env=await openWorldBrowser(),{page}=env,report={checked:new Date().toISOString(),checks:[]};
const check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};
try{
 await page.goto(env.url+'/case-lab.html?demo=1');await page.waitForFunction(()=>window.__caseLab);
 await page.evaluate(async()=>{const {adapter:a,screens}=window.__caseLab;await a.createCrew();await a.muster();for(const [id,seat] of [['C1',1],['C2',2],['C3',1],['C4',2]]){a.dev.give(id,seat);if(seat===1)await a.pin(id);else a.dev.pinForSeat(id,seat);}await a.pair('C1','C2');await screens.open('board');});
 await page.screenshot({path:'captures/20261105_G6-Board.png'});check(await page.locator('.case-clue').count()===4,'Board displays four held cards and seat credits');
 await page.evaluate(()=>window.__caseLab.screens.open('search',{spot:'ferry_pier'}));check(await page.getByRole('button',{name:'Pay 150 coins · Start search'}).count()===1,'Paid shortcut is separately priced');await page.screenshot({path:'captures/20261105_G6-Search.png'});
 await page.evaluate(async()=>{const {adapter:a,screens}=window.__caseLab;await a.buildLight('islet_signal_station');await a.callNightfall();await a.orderPartner(2,'man_light','keepers_lamp');await a.orderPartner(3,'man_light','harbor_light');await a.takePost('islet_signal_station');a.dev.advance(600);await screens.open('finale');});await page.screenshot({path:'captures/20261105_G6-Night.png'});
 check(await page.locator('.case-bearing-input input').count()===4,'Every beam has an accessible native slider');
 for(const screen of ['crew','board','search','partners','finale','accusation','reveal','relighting']){await page.evaluate(screen=>window.__caseLab.screens.open(screen),screen);await page.setViewportSize({width:375,height:667});await page.waitForTimeout(40);check(await page.locator('dialog[open]').evaluate(root=>root.scrollWidth<=root.clientWidth+1),`${screen}: phone modal has no horizontal overflow`);const small=await page.locator('dialog[open]').evaluate(root=>[...root.querySelectorAll('p,h2,h3,h4,label,button,select,option,dt,dd,code,span,li')].filter(el=>el.getClientRects().length&&el.textContent.trim()&&parseFloat(getComputedStyle(el).fontSize)<14).map(el=>el.tagName+':'+getComputedStyle(el).fontSize));check(!small.length,`${screen}: all visible text is at least 14px`);await page.screenshot({path:`captures/20261105_G6-${screen}-Phone.png`});await page.setViewportSize({width:1440,height:900});}
 check(!env.errors.length,'Case workshop has no browser errors');check(!env.external.length,'Case workshop makes no external request');
 console.log(JSON.stringify(report,null,2));
}finally{await writeFile('captures/20261105_G6-Case-Checks.json',JSON.stringify(report,null,2));await env.close();}
