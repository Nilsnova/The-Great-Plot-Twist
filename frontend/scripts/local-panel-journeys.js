// Explicit development practice goldens. Every width owns a fresh page, session and fake module graph.
// This is native public-control coverage, separate from the recorded production and input-parity gates.
import assert from 'node:assert/strict';
import {openWorldBrowser} from './world-browser-tools.js';
import {startFromTitle} from './shell-browser-tools.js';
import {stubIntro} from './intro-browser-fixture.js';
import {openPanelHotspot,assertPanelReadable} from './online-panel-actions.js';

const desk='.desk-modal[open]',arena='.duel-modal[open]';
const check=(checks,value,label)=>{assert.ok(value,label);checks.push(label);};

async function chartLanding(page,area){
  const place=area==='predictions'?'saltreach_harbor':'smugglers_cove';
  const label=area==='predictions'?'Saltreach Harbor':'Smugglers’ Cove';
  await page.locator('canvas[tabindex="0"]:not(.interiors-canvas)').focus();await page.keyboard.press('KeyM');
  const chart=page.locator('.sea-chart[open]');await chart.waitFor({state:'visible'});
  const landing=chart.locator(`[data-place="${place}"]`);
  assert.equal(await landing.getAttribute('aria-disabled'),'false','The public sea chart enables the practice landing');
  await chart.getByRole('checkbox',{name:'Fast travel',exact:true}).check();await landing.click();
  await page.waitForFunction(label=>document.querySelector('.hud .chapter')?.textContent.includes(label),label);
  await page.locator('.sailing').waitFor({state:'hidden'});await chart.waitFor({state:'hidden'});
  await page.locator('canvas[tabindex="0"]:not(.interiors-canvas)').focus();
}
async function openPractice(env,area){
  const {page}=env;await page.emulateMedia({reducedMotion:'reduce'});await stubIntro(page);
  const query=area==='predictions'?'desk=local':'arena=local';
  await page.goto(env.url+'/?case=local&'+query);await startFromTitle(page);
  const room=page.locator('.interiors-scene:not([hidden])');
  if(await room.isVisible()){
    await page.waitForFunction(()=>document.querySelector('.interiors-scene:not([hidden])')?.dataset.state==='ready');
    await room.getByRole('button',{name:'Leave room',exact:true}).click();
    await room.waitFor({state:'hidden'});
  }
  await chartLanding(page,area);await openPanelHotspot(env,area);
  const selector=area==='predictions'?desk:arena;
  const practice=area==='predictions'?'.desk-practice':'.duel-practice';
  const label=area==='predictions'?'Practice desk: not real coins':'Practice ring:';
  await page.locator(selector+' '+practice).filter({hasText:label}).waitFor({state:'visible'});
}
async function reopenPractice(page,area){
  const id=area==='predictions'?'prediction_kiosk':'arena_gate';
  await page.waitForFunction(id=>{const prompt=document.querySelector('.hud .interact');
    return prompt?.dataset.zone===id&&!prompt.hidden;},id);
  const interact=page.locator('.touch-actions').getByRole('button',{name:'Interact',exact:true});
  if(await interact.isVisible())await interact.click();else await page.keyboard.press('KeyE');
  await page.locator(area==='predictions'?desk:arena).waitFor({state:'visible'});
}
async function assertClosed(page,selector,checks){
  await page.locator(selector).waitFor({state:'hidden'});
  check(checks,await page.locator('.shell-screen[open]').count()===0,'Closing practice leaves Pause closed');
  check(checks,await page.evaluate(()=>document.activeElement?.matches('canvas[tabindex="0"]')===true),
    'Closing practice returns native focus to the game');
}
async function prepareStake(page){
  const card=page.locator(desk+' .desk-card').first();
  await card.getByRole('radio',{name:'No',exact:true}).check();
  await card.getByRole('spinbutton').fill('17');
  const label='Stake '+await card.locator('h3').innerText();
  await card.getByRole('button',{name:label,exact:true}).click();
  await card.getByRole('button',{name:'Confirm',exact:true}).waitFor({state:'visible'});return card;
}
async function localPredictionGolden(env,checks){
  const {page}=env,modal=page.locator(desk);await openPractice(env,'predictions');
  await modal.getByRole('tab',{name:'My stakes',exact:true}).click();
  check(checks,await modal.locator('.desk-stake-main').count()===0,'This width starts with a fresh practice holding');
  await modal.getByRole('tab',{name:'Questions',exact:true}).click();
  const before=await modal.locator('.desk-questions .desk-account').textContent();
  await assertPanelReadable(page,desk);await prepareStake(page);await assertPanelReadable(page,desk);
  await page.keyboard.press('Escape');
  check(checks,await modal.count()===1&&await modal.getByRole('button',{name:'Confirm',exact:true}).count()===0,
    'The first desk Escape cancels only the unsubmitted confirmation');
  check(checks,await modal.locator('.desk-questions .desk-account').textContent()===before
    &&await modal.locator('.desk-your-stake').count()===0,'Cancelling a practice confirmation changes no balance or holding');
  const card=await prepareStake(page);await card.getByRole('button',{name:'Confirm',exact:true}).click();
  await card.locator('.desk-your-stake').filter({hasText:'17 coins on NO'}).waitFor({state:'visible'});
  check(checks,await modal.locator('.desk-your-stake').count()===1,'One native Confirm places one practice stake');
  await assertPanelReadable(page,desk);
  await modal.getByRole('tab',{name:'My stakes',exact:true}).click();
  await modal.locator('.desk-stake-main').filter({hasText:'17 coins on NO'}).waitFor({state:'visible'});
  check(checks,await modal.locator('.desk-stake-main').count()===1,'My stakes displays the practice receipt exactly once');
  await assertPanelReadable(page,desk);await page.keyboard.press('Escape');await assertClosed(page,desk,checks);
  await reopenPractice(page,'predictions');await modal.getByRole('tab',{name:'My stakes',exact:true}).click();
  await modal.locator('.desk-stake-main').filter({hasText:'17 coins on NO'}).waitFor({state:'visible'});
  check(checks,await modal.locator('.desk-stake-main').count()===1,'Ordinary close and reopen retain the same practice holding');
  await page.keyboard.press('Escape');await assertClosed(page,desk,checks);
}
async function chooseOwnShades(root){
  const rounds=root.locator('.duel-round');assert.equal(await rounds.count(),3,'The public practice picker offers three rounds');
  for(let index=0;index<3;index++)await rounds.nth(index).locator('input[type="radio"][value="shade"]').check();
}
async function finishReveal(page){
  const reveal=page.locator(arena+' .duel-reveal:not([hidden])');
  // The existing practice adapter answers after six seconds; no fake clock, rival, sealed data or outcome is injected.
  await reveal.waitFor({state:'visible',timeout:15000});
  const skip=reveal.getByRole('button',{name:'Skip',exact:true});if(await skip.isVisible())await skip.click();
  await reveal.locator('.duel-banner').filter({hasText:/\S/}).waitFor({state:'visible'});
  await reveal.getByRole('button',{name:'Back to the ring',exact:true}).waitFor({state:'visible'});
  const table=reveal.getByRole('table',{name:'Every round',exact:true});await table.waitFor({state:'visible'});
  const rows=await table.locator('tbody tr').evaluateAll(rows=>rows.map(row=>[...row.querySelectorAll('td')].map(cell=>cell.textContent.trim())));
  assert.ok(rows.length===3&&rows.every((row,index)=>row.length===4&&row[0]===String(index+1)&&row[1]==='Shade'
    &&['Flash','Shade','Mirror'].includes(row[2])&&['Your point','Their point','Nobody scores'].includes(row[3])),
  'The complete public result contains all three own choices and the adapter-supplied rival choices and points');
  return rows;
}
async function localArenaGolden(env,checks){
  const {page}=env,modal=page.locator(arena);await openPractice(env,'arena');
  await modal.locator('.duel-wallet').waitFor({state:'visible'});await assertPanelReadable(page,arena);
  await modal.getByRole('tab',{name:'Your duels',exact:true}).click();
  const beforeReplays=await modal.getByRole('button',{name:/^Replay:/}).count();
  await modal.getByRole('tab',{name:'Challenges',exact:true}).click();
  const challenge=modal.locator('.duel-section').filter({hasText:'Named challenges to you'}).locator('.duel-card').first();
  const answerLabel='Answer challenge 1 from '+await challenge.locator('h4').innerText();
  await challenge.getByRole('button',{name:answerLabel,exact:true}).click();
  const answer=modal.locator('.duel-answer:not([hidden])');await answer.waitFor();await chooseOwnShades(answer);
  await assertPanelReadable(page,arena);await answer.getByRole('button',{name:'Back to the challenges',exact:true}).click();
  await modal.getByRole('tab',{name:'New challenge',exact:true}).click();const form=modal.locator('.duel-form');
  await form.getByRole('radio',{name:'Any captain (open challenge)',exact:true}).check();
  await form.getByRole('radio',{name:'3 rounds',exact:true}).check();
  await form.getByRole('radio',{name:'Friendly',exact:true}).check();await chooseOwnShades(form);
  await assertPanelReadable(page,arena);await form.getByRole('button',{name:'Seal and send',exact:true}).click();
  await modal.locator('.duel-sealed').waitFor({state:'visible'});
  check(checks,await modal.locator('.duel-sealed').isVisible(),'The practice captain can inspect only their own sealed choices before the rival answers');
  const original=await finishReveal(page);await assertPanelReadable(page,arena);
  check(checks,true,'The public practice adapter completes all three rounds without an injected outcome');
  await page.keyboard.press('Escape');await modal.locator('.duel-reveal').waitFor({state:'hidden'});
  check(checks,await modal.count()===1,'The first arena Escape leaves the reveal and keeps its modal');
  await assertPanelReadable(page,arena);await modal.getByRole('tab',{name:'Rules',exact:true}).click();await assertPanelReadable(page,arena);
  await modal.getByRole('tab',{name:'Your duels',exact:true}).click();
  check(checks,await modal.getByRole('button',{name:/^Replay:/}).count()===beforeReplays+1,
    'One native friendly challenge adds one complete practice result');
  const replay=modal.getByRole('button',{name:/^Replay:/}).first();await replay.click();
  const replayed=await finishReveal(page);
  check(checks,JSON.stringify(replayed)===JSON.stringify(original),'Replay preserves every adapter-supplied round and point');
  await assertPanelReadable(page,arena);await page.keyboard.press('Escape');await modal.locator('.duel-reveal').waitFor({state:'hidden'});
  check(checks,await modal.count()===1,'Replay Escape returns to history before the modal closes');
  await page.keyboard.press('Escape');await assertClosed(page,arena,checks);
  await reopenPractice(page,'arena');await modal.getByRole('tab',{name:'Your duels',exact:true}).click();
  check(checks,await modal.getByRole('button',{name:/^Replay:/}).count()===beforeReplays+1,
    'Ordinary close and reopen retain the newly completed practice duel');
  await modal.getByRole('button',{name:/^Replay:/}).first().click();const reopened=await finishReveal(page);
  check(checks,JSON.stringify(reopened)===JSON.stringify(original),'Reopened practice replays the same complete result');
  await page.keyboard.press('Escape');await modal.locator('.duel-reveal').waitFor({state:'hidden'});
  await page.keyboard.press('Escape');await assertClosed(page,arena,checks);
}
async function checkLocalPanel(area,{widths=[1280,375]}={}){
  assert.ok(!process.env.TEST_URL,'Explicit local panel checks require their own Vite development server');
  assert.ok(widths.length===2&&widths[0]===1280&&widths[1]===375,'The practice gate independently plays both required viewport widths');
  const cases=[];
  for(const width of widths){
    // New Vite/browser/context per width is the reset. No private fake/reset or world-position hooks are used.
    const env=await openWorldBrowser({preview:false}),checks=[],requests=[];
    env.page.on('request',request=>{
      const path=new URL(request.url()).pathname;
      if(/^\/api\/(?:predictions|duels)(?:\/|$)/.test(path))requests.push({method:request.method(),path:'/api/'+(path.startsWith('/api/predictions')?'predictions':'duels')+'/*'});
    });
    try{
      await env.page.setViewportSize({width,height:812});
      if(area==='predictions')await localPredictionGolden(env,checks);else await localArenaGolden(env,checks);
      check(checks,requests.length===0,'Explicit practice uses no prediction or duel HTTP service');
      check(checks,env.external.length===0,'Explicit practice makes no external requests');
      check(checks,env.pageErrors.length===0,'The local practice journey has no uncaught browser errors');
      cases.push({width,height:812,checks});
    }finally{await env.close();}
  }
  return {area,mode:'development-practice',independentContexts:cases.length,cases};
}
export const checkLocalPredictions=options=>checkLocalPanel('predictions',options);
export const checkLocalArena=options=>checkLocalPanel('arena',options);
