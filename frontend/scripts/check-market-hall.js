// The Harbor market stall (lane H) in the production build with recorded answers: sign in through the
// bundled PKCE fixture, Play, open Menu > Harbor > Open the market stall (public controls only, no game
// hooks), then check the trading-off states, a 🪙 10 stake on Up, closing it, the request shapes and the
// HUD's wallet balance. The walk-up hotspot and the keyboard are audited in dev by check-a11y.js
// (a11y-market.js). The old Island Exchange panel (tabs, positions, leverage) left the game with lane H.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {openMarketFixture} from './online-market-fixture.js';
import {signInFromTitle} from './online-chaos-signin.js';
import {playFromTitle} from './online-browser-actions.js';

const folder='captures/20261111_G31-market-stall',report={checks:[],proofs:[]};
const check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};
const stall=page=>page.locator('.harbor-market[open]');

// Play, then the lore and the goal card (first Play of a fresh tab), until the HUD is up.
async function play(page){
  await playFromTitle(page);
  for(let i=0;i<8;i++){
    await page.waitForFunction(()=>document.querySelector('dialog.cutscene[open],.goal-card[open]')
      ||(document.querySelector('.hud.exploring')&&!document.querySelector('dialog[open]')),null,{timeout:30000});
    if(await page.locator('dialog.cutscene[open]').count())await page.getByRole('button',{name:'Skip',exact:true}).click();
    else if(await page.locator('.goal-card[open]').count())await page.locator('.goal-card[open]').getByRole('button',{name:'Got it',exact:true}).click();
    else return;
    await page.waitForTimeout(200);
  }
  throw new Error('The game did not start.');
}
async function openStall(page){
  await page.locator('.hud.exploring').getByRole('button',{name:'Menu',exact:true}).click();
  await page.locator('.shell-screen[open][data-mode="pause"]').getByRole('button',{name:'Harbor',exact:true}).click();
  await page.locator('.harbor-overview[open]').getByRole('button',{name:'Open the market stall',exact:true}).click();
  await stall(page).waitFor();
  await stall(page).locator('.harbor-asset').filter({has:page.getByRole('heading',{name:'Bitcoin',exact:true})}).waitFor();
}
async function closeStall(page){
  await page.keyboard.press('Escape');await stall(page).waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.activeElement?.matches('canvas[tabindex="0"]'));
}

await mkdir(folder,{recursive:true});
for(const width of [1280,375]){
  const env=await openMarketFixture(),{page}=env;
  try{
    await page.setViewportSize({width,height:812});
    env.resetMarket({flag:false,tradingEnabled:true});
    await signInFromTitle(env);
    await play(page);
    // The HUD's 🪙 counter reads the wallet (the islands flag is off in this fixture).
    await page.waitForFunction(()=>document.querySelector('.hud-coins')?.textContent==='🪙 1,000',null,{timeout:15000});
    check(true,`${width}: the HUD shows the recorded wallet as 🪙 1,000`);
    // 1. Trading off (a false market flag): public prices, no stake controls, no private write.
    let before=env.marketRequests.length;
    await openStall(page);
    const recorded=stall(page).locator('.harbor-asset').filter({has:page.getByRole('heading',{name:'Bitcoin',exact:true})});
    check(await recorded.locator('.harbor-price').textContent()==='$100.00','The recorded public price shows on the stall (as Bitcoin)');
    check(await recorded.locator('.harbor-reason').count()===1,'With trading off the asset says why it takes no stake');
    check(await stall(page).locator('.harbor-picker').count()===0,'With trading off no up/down or stake control is offered');
    // The stall keeps Bitcoin, Ether, gold and at most two stocks: the third recorded stock stays hidden.
    check(await stall(page).locator('.harbor-asset').count()===3,'The recorded company (as Bitcoin) and two of the three stocks show');
    let phase=env.marketRequests.slice(before);
    check(phase.filter(request=>request.path==='/api/market').every(request=>request.method==='GET'&&!request.authorized),
      'The price board is an anonymous GET');
    check(phase.every(request=>request.method==='GET'),'Trading off sends no market write');
    check(await stall(page).locator('.harbor-footnote').textContent()==='Play coins only. They cannot be bought or cashed out.',
      'The stall keeps its play-money line');
    check(await stall(page).locator('a[href*="example.invalid"]').count()===0,'The price credit stays in Settings, Credits');
    await page.screenshot({path:`${folder}/trading-off-${width}.png`});
    await closeStall(page);
    // 2. Trading on: a 🪙 10 stake on Up, then closed.
    env.resetMarket({flag:true,tradingEnabled:true});
    await page.reload();await page.locator('.shell-screen[open]').waitFor();
    await play(page);
    before=env.marketRequests.length;
    await openStall(page);
    const asset=stall(page).locator('.harbor-asset').filter({has:page.getByRole('heading',{name:'Bitcoin',exact:true})});
    await asset.locator('.harbor-picker').waitFor();
    check(await stall(page).locator('.harbor-picker').count()===1,'Only the open recorded company takes a stake; closed, stale and unavailable stocks do not');
    check(await asset.locator('[aria-pressed="true"]').count()===0&&await asset.locator('.harbor-confirm').isDisabled(),
      'Nothing is preselected, so one stray tap never places a stake');
    check(JSON.stringify(await asset.locator('.harbor-stake').evaluateAll(nodes=>nodes.map(node=>node.dataset.stake)))==='["10","25"]',
      'Only the stakes the server accepts are offered (the recorded minimum is 10: 10 and 25, no 5)');
    await asset.getByRole('button',{name:'Up, Bitcoin',exact:true}).click();
    await asset.getByRole('button',{name:'10 coins on Bitcoin',exact:true}).click();
    await asset.getByRole('button',{name:'Place 🪙 10 on Up, Bitcoin',exact:true}).click();
    await asset.locator('.harbor-notice').filter({hasText:'Your 🪙 10 is on Up.'}).waitFor();
    await asset.locator('.harbor-holding').first().waitFor();
    await page.screenshot({path:`${folder}/staked-${width}.png`});
    check(true,'A 🪙 10 stake on Up is accepted and shows as a holding');
    await page.waitForFunction(()=>document.querySelector('.hud-coins')?.textContent==='🪙 989',null,{timeout:15000});
    check(true,'The HUD follows the authoritative wallet after the stake (🪙 989)');
    await asset.getByRole('button',{name:/^Close your .+ stake on /i}).click();
    await asset.locator('.harbor-notice').filter({hasText:/🪙/}).first().waitFor();
    await page.waitForFunction(()=>!document.querySelector('.harbor-market[open] .harbor-holding .kit-button'));
    check(true,'Close ends the stake and says what came back');
    phase=env.marketRequests.slice(before);
    const writes=phase.filter(request=>request.method==='POST');
    check(writes.length===2&&writes[0].path==='/api/market/open'&&writes[1].path==='/api/market/close','One open and one close were sent');
    check(writes.every(request=>request.authorized&&request.uidValid),'Every write is signed in and carries an actionUid');
    const proof=env.marketProof();report.proofs.push({width,...proof});
    check(proof.opens===1&&proof.closes===1&&proof.repeats===0,'The recorded server applied one open and one close, no repeat');
    check(proof.allBodiesExpected&&proof.allPublicAnonymous&&proof.allPrivateAuthorized,'Request bodies and authorisation match the published routes');
    await closeStall(page);
    check(env.pageErrors.length===0,'No uncaught browser errors');
  }finally{await env.close();}
}
await writeFile(`${folder}/Checks.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({checks:report.checks.length,proofs:report.proofs},null,2));
