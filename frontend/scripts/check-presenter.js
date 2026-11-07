// Verifies keyboard operation, recording dimensions and opt-in renderer metrics.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {openWorldBrowser} from './world-browser-tools.js';

const env=await openWorldBrowser({preview:true}),{page}=env;
const report={checked:new Date().toISOString(),checks:[],errors:env.errors,external:env.external};
const check=(condition,label)=>{assert.ok(condition,label);report.checks.push(label);};
page.setDefaultTimeout(15000);
try{
  await mkdir('captures',{recursive:true});
  await page.setViewportSize({width:1920,height:1080});
  await page.unroute('**/api/weather');
  await page.route('**/api/**',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"offline presenter check"}'}));
  await page.goto(`${env.url}/?demo=1&record=1&perf=1`,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Highlights tour',exact:true}).click();
  await page.locator('.performance-panel').waitFor();
  check(await page.locator('#game').evaluate(node=>{const box=node.getBoundingClientRect();return box.width===1920&&box.height===1080;}),'Recording mode fixes the game frame at 1920 by 1080');
  check(await page.getByRole('button',{name:/Previous/}).isVisible()&&await page.locator('.presenter-toolbar').getByRole('button',{name:'Next · Space',exact:true}).isVisible(),'Presenter controls are visible during the tour');
  await page.getByText('Beat 1 of 9 · A page from the intro',{exact:true}).waitFor();
  await page.locator('.intro-modal[open] .intro-view').waitFor();
  check(await page.locator('.performance-panel').evaluate(node=>node.closest('dialog[open]')?.classList.contains('intro-modal')),'Performance panel remains interactive in the active intro dialog');
  await page.keyboard.press('N');check(await page.locator('.presenter-speaker-notes').isVisible(),'N opens the selected beat speaker notes');
  await page.keyboard.press('P');await page.getByRole('button',{name:/Resume/}).waitFor();
  await page.waitForTimeout(1800);
  check(await page.getByText('Beat 1 of 9 · Paused',{exact:true}).isVisible(),'P freezes the active beat timer');
  await page.keyboard.press('P');await page.getByRole('button',{name:/Pause/}).waitFor();
  await page.keyboard.press('B');check(await page.locator('.presenter-blank').evaluate(node=>node.open&&node.matches(':modal')),'B opens a native top-layer blank over the intro dialog');await page.keyboard.press('Escape');
  check(await page.locator('.presenter-blank').evaluate(node=>!node.open),'Escape restores the intro screen from blank');
  await page.keyboard.press('ArrowRight');await page.getByText('Beat 2 of 9 · Arrival on Lighthouse Isle',{exact:true}).waitFor();
  check(await page.locator('.chapter').textContent().then(text=>text.toUpperCase().includes('LIGHTHOUSE ISLE')),'Right arrow advances to the arrival beat');
  await page.keyboard.press('Digit6');await page.getByText('Beat 6 of 9 · At the Captain’s Table',{exact:true}).waitFor();
  await page.locator('.case-modal[open]').waitFor();await page.keyboard.press('B');
  check(await page.locator('.presenter-blank').evaluate(node=>node.open&&node.matches(':modal')),'B opens a top-layer blank above the board dialog');await page.keyboard.press('Escape');
  check(await page.locator('.case-modal[open]').isVisible()&&await page.locator('.presenter-blank').evaluate(node=>!node.open),'Escape restores the still-open board after blanking');
  await page.keyboard.press('B');await page.keyboard.press('Digit1');
  await page.waitForFunction(()=>document.querySelector('.intro-modal')?.open);
  report.laterDialogBlank=await page.evaluate(()=>({blankOpen:document.querySelector('.presenter-blank').open,blankClass:document.body.classList.contains('presenter-blanking'),visibility:getComputedStyle(document.querySelector('.intro-modal')).visibility}));
  check(await page.locator('.intro-modal').evaluate(node=>getComputedStyle(node).visibility==='hidden')&&await page.locator('.presenter-blank').evaluate(node=>node.open),'A later tour dialog remains hidden while the presentation is blanked');
  await page.keyboard.press('Escape');
  check(await page.locator('.intro-modal[open]').isVisible()&&await page.locator('.presenter-blank').evaluate(node=>!node.open),'Escape restores a later dialog without closing its content');
  await page.keyboard.press('Digit6');await page.locator('.case-modal[open]').waitFor();
  const bounds=await page.evaluate(()=>['.presenter-panel','.presenter-toolbar button','.presenter-speaker-notes'].map(selector=>{const rect=document.querySelector(selector).getBoundingClientRect();return {selector,left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom,width:rect.width,height:rect.height};}));
  check(bounds.every(rect=>rect.left>=0&&rect.top>=0&&rect.right<=1920&&rect.bottom<=1080&&rect.width>0&&rect.height>0),'Presenter controls and opened notes remain inside the recording viewport beside the board');
  await page.waitForTimeout(2500);
  const lowOffer=page.getByRole('button',{name:/Switch to low quality/});
  if(await lowOffer.isVisible()){await lowOffer.click();report.usedLowQualityFallback=true;check(await page.locator('.performance-status').textContent().then(text=>text.includes('Low quality is on.')),'Slower devices can use the offered low quality control');}
  await lowOffer.waitFor({state:'hidden'});
  const metrics=await page.locator('.performance-panel').innerText();
  check(/Frames per second/.test(metrics)&&/95th percentile frame/.test(metrics)&&/Triangles/.test(metrics),'Performance panel reports frame time and renderer counts');
  report.performance=await page.locator('.performance-panel').evaluate(panel=>Object.fromEntries([...panel.querySelectorAll('dt')].map(term=>[term.textContent,term.nextElementSibling.textContent])));
  const calls=Number(report.performance['Draw calls'].replaceAll(',',''));
  check(Number.isFinite(calls)&&calls<150,`Draw call count stays below 150 after settle (${calls})`);
  await page.keyboard.press('Digit8');await page.locator('.cinematic-modal[open]').waitFor({timeout:12000});
  await page.keyboard.press('P');await page.getByRole('button',{name:/Resume/}).waitFor();
  // The timeline must retain its exact frame while P freezes the current shot.
  await page.waitForTimeout(100);const pausedProgress=await page.getByRole('progressbar',{name:'Coastal passage',exact:true}).evaluate(node=>node.value);
  await page.waitForTimeout(1500);
  check(await page.getByRole('progressbar',{name:'Coastal passage',exact:true}).evaluate(node=>node.value)===pausedProgress,'P freezes an active cinematic as well as the tour clock');
  await page.keyboard.press('P');await page.keyboard.press('Digit6');await page.locator('.case-modal[open]').waitFor();
  await page.screenshot({path:'captures/20261106_G8-Presenter-1920.png'});
  await page.getByRole('button',{name:/End rehearsal/}).click();await page.getByRole('button',{name:'Start highlights tour',exact:true}).waitFor();
  check(await page.locator('.presenter-blank').evaluate(node=>!node.open),'Ending the rehearsal cannot leave the screen blanked');
  const expected503=/Failed to load resource: the server responded with a status of 503/;
  report.errors=env.errors.filter(error=>!expected503.test(error));
  check(report.errors.length===0&&env.external.length===0,'Presenter run has no JavaScript errors or external requests');
  console.log(JSON.stringify(report,null,2));
}catch(error){report.failure=error.message;try{await page.screenshot({path:'captures/20261106_G8-Presenter-Failure.png'});}catch{}throw error;}
finally{await writeFile('captures/20261106_G8-Presenter-Checks.json',`${JSON.stringify(report,null,2)}\n`);await env.close();}
