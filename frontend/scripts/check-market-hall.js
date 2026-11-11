// The Harbor market stall (lane H, "Up or down in 5 minutes?") in the production build with recorded answers
// of GET and POST /api/market/calls (online-market-fixture.js): Play, open Menu > Harbor > Open the market
// stall (public controls only, no game hooks) as an anonymous player, then signed in through the bundled
// PKCE fixture with the market flag off, then on. With the flag on: nothing preselected, a 🪙 10 call on Up
// is POSTed once with a valid actionUid and exactly {asset, direction, stake, actionUid}, it shows as an open
// call counting down to its five minutes, and the HUD's 🪙 counter follows the wallet (GET /api/me). The walk-up
// hotspot and the keyboard are audited in dev by check-a11y.js (a11y-market.js).
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {openMarketFixture} from './online-market-fixture.js';
import {signInFromTitle} from './online-chaos-signin.js';
import {playFromTitle} from './online-browser-actions.js';

const folder='captures/20261111_G31-market-calls',report={checks:[],proofs:[]};
const check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};
const stall=page=>page.locator('.harbor-market[open]');
const item=(page,name)=>stall(page).locator('.harbor-asset').filter({has:page.getByRole('heading',{name,exact:true})});
const PLAY_MONEY='Play coins only. They cannot be bought or cashed out.';

// Play, then the lore and the goal card (first Play of a fresh tab), until the HUD is up.
async function play(page){
  await playFromTitle(page);
  for(let i=0;i<8;i++){
    await page.waitForFunction(()=>document.querySelector('dialog.cutscene[open],.tutorial-card[open],.goal-card[open]')
      ||(document.querySelector('.hud.exploring')&&!document.querySelector('dialog[open]')),null,{timeout:30000});
    if(await page.locator('dialog.cutscene[open],.tutorial-card[open]').count())await page.getByRole('button',{name:'Skip',exact:true}).click();
    else if(await page.locator('.goal-card[open]').count())await page.locator('.goal-card[open]').getByRole('button',{name:'Got it',exact:true}).click();
    else return;
    await page.waitForTimeout(200);
  }
  throw new Error('The game did not start.');
}
// Opens the stall and waits until it left "Opening the stall...".
async function openStall(page){
  await page.locator('.hud.exploring').getByRole('button',{name:'Menu',exact:true}).click();
  await page.locator('.shell-screen[open][data-mode="pause"]').getByRole('button',{name:'Harbor',exact:true}).click();
  await page.locator('.harbor-overview[open]').getByRole('button',{name:'Open the market stall',exact:true}).click();
  await stall(page).waitFor();
  await page.waitForFunction(()=>{const main=document.querySelector('.harbor-market[open] .harbor-card-main');
    return main&&!/Opening the stall/.test(main.textContent);});
}
async function closeStall(page){
  await page.keyboard.press('Escape');await stall(page).waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.activeElement?.matches('canvas[tabindex="0"]'));
}
const callRequests=(env,from)=>env.marketRequests.slice(from).filter(request=>request.path==='/api/market/calls');

await mkdir(folder,{recursive:true});
for(const width of [1280,375]){
  const env=await openMarketFixture(),{page}=env;
  try{
    await page.setViewportSize({width,height:812});
    // 1. Anonymous: the stall asks to sign in and sends nothing.
    env.resetMarket({flag:true,tradingEnabled:true});
    await page.goto(env.url);await page.locator('.shell-screen[open]').waitFor();
    await play(page);
    let before=env.marketRequests.length;
    await openStall(page);
    await stall(page).locator('.harbor-sign-in').waitFor();
    check(await stall(page).locator('.harbor-picker').count()===0,`${width}: an anonymous player gets no up/down or stake control`);
    check(callRequests(env,before).length===0,'An anonymous player sends no /api/market/calls request');
    check(await stall(page).locator('.harbor-footnote').textContent()===PLAY_MONEY,'The stall keeps its play-money line');
    await page.screenshot({path:`${folder}/anonymous-${width}.png`});
    await closeStall(page);
    // 2. Signed in with the market flag off: the stall says it is closed, no stake control, no write.
    env.resetMarket({flag:false,tradingEnabled:true});
    await signInFromTitle(env);
    await play(page);
    // The HUD's 🪙 counter reads the wallet (the islands flag is off in this fixture).
    await page.waitForFunction(()=>document.querySelector('.hud-coins')?.textContent==='🪙 1,000',null,{timeout:15000});
    check(true,`${width}: the HUD shows the recorded wallet as 🪙 1,000`);
    before=env.marketRequests.length;
    await openStall(page);
    await stall(page).locator('.harbor-empty').filter({hasText:'This stall is closed for now.'}).waitFor();
    check(true,'With the market flag off (404 feature_off) the stall says it is closed for now');
    check(await stall(page).locator('.harbor-picker,.harbor-stake').count()===0,'With the flag off no up/down or stake control is offered');
    let phase=env.marketRequests.slice(before);
    check(phase.every(request=>request.method==='GET'),'With the flag off no market write is sent');
    check(await stall(page).locator('.harbor-footnote').textContent()===PLAY_MONEY,'The closed stall keeps its play-money line');
    await page.screenshot({path:`${folder}/flag-off-${width}.png`});
    await closeStall(page);
    // 3. Flag on: the recorded assets and the decided call, then a 🪙 10 call on Up.
    env.resetMarket({flag:true,tradingEnabled:true});
    await page.reload();await page.locator('.shell-screen[open]').waitFor();
    await play(page);
    before=env.marketRequests.length;
    await openStall(page);
    const bitcoin=item(page,'Bitcoin');
    await bitcoin.locator('.harbor-picker').waitFor();
    check(JSON.stringify(await stall(page).locator('.harbor-asset h3').allTextContents())==='["Bitcoin","Ether","Gold","Apple","NVIDIA"]',
      'One item per asset, with the server names in the server order');
    check(await bitcoin.locator('.harbor-price').textContent()==='$100.00','The recorded price shows on Bitcoin');
    check(await bitcoin.locator('.harbor-question').textContent()==='Up or down in 5 minutes?','Bitcoin asks "Up or down in 5 minutes?"');
    check(await stall(page).locator('.harbor-picker').count()===1,'Only the open asset takes a call; the closed ones do not');
    check(await item(page,'Apple').locator('.harbor-reason').textContent()==='Closed for the weekend'
      &&await item(page,'Ether').locator('.harbor-reason').textContent()==='Prices are catching up. Try again in a minute.'
      &&await item(page,'Gold').locator('.harbor-reason').textContent()==='Prices unavailable right now',
      'Closed assets say why in plain words (weekend, quote_old, source_off)');
    check(await bitcoin.locator('.harbor-call[data-open="false"] .harbor-now').textContent()==='You won 🪙 +20',
      'The recorded decided call shows its payout: You won 🪙 +20');
    check(await bitcoin.locator('[aria-pressed="true"]').count()===0&&await bitcoin.locator('.harbor-confirm').isDisabled(),
      'Nothing is preselected, so one stray tap never places a call');
    check(JSON.stringify(await bitcoin.locator('.harbor-stake').evaluateAll(nodes=>nodes.map(node=>node.dataset.stake)))==='["5","10","25"]',
      'The stakes are 5, 10 and 25');
    await bitcoin.getByRole('button',{name:'Up, Bitcoin',exact:true}).click();
    await bitcoin.getByRole('button',{name:'10 coins on Bitcoin',exact:true}).click();
    await bitcoin.getByRole('button',{name:'Place 🪙 10 on Up, Bitcoin',exact:true}).click();
    await bitcoin.locator('.harbor-notice').filter({hasText:'Your 🪙 10 is on Up.'}).waitFor();
    const open=bitcoin.locator('.harbor-call[data-open="true"]');
    await open.waitFor();
    check(await open.locator('p').first().textContent()==='You said Up with 🪙 10.'
      &&/^Decided in (5|4) min$/.test(await open.locator('.harbor-now').textContent()),
      'The call shows as an open call counting down to its five minutes');
    await page.screenshot({path:`${folder}/called-${width}.png`});
    await page.waitForFunction(()=>document.querySelector('.hud-coins')?.textContent==='🪙 990',null,{timeout:15000});
    check(true,'The HUD follows the authoritative wallet after the call (🪙 990)');
    phase=env.marketRequests.slice(before);
    const writes=phase.filter(request=>request.method==='POST');
    check(writes.length===1&&writes[0].path==='/api/market/calls','Exactly one POST /api/market/calls was sent');
    check(writes[0].authorized&&writes[0].uidValid&&writes[0].bodyKeys.join()==='actionUid,asset,direction,stake',
      'The POST is signed in, carries a valid actionUid and exactly {asset, direction, stake, actionUid}');
    check(phase.filter(request=>request.path==='/api/market/calls'&&request.method==='GET').every(request=>request.authorized),
      'Every GET /api/market/calls is signed in');
    check(!phase.some(request=>['/api/market/open','/api/market/close','/api/market/portfolio'].includes(request.path)),
      'The stall no longer uses the old Exchange routes');
    const proof=env.callsProof();report.proofs.push({width,...proof});
    check(proof.posts===1&&proof.repeats===0&&proof.open===1&&proof.coins===990,'The recorded server applied one call, no repeat');
    check(proof.allCallBodiesExpected&&proof.allPrivateAuthorized,'Request bodies and authorisation match the published routes');
    check(await stall(page).locator('a[href*="example.invalid"]').count()===0,'The price credit stays in Settings, Credits');
    await closeStall(page);
    check(env.pageErrors.length===0,`No uncaught browser errors${env.pageErrors.length?': '+env.pageErrors.join(' | '):''}`);
  }finally{await env.close();}
}
await writeFile(`${folder}/Checks.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({checks:report.checks.length,proofs:report.proofs},null,2));
