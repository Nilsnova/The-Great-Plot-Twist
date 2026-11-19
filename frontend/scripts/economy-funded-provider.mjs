// A measured two-player funded wave through ordinary controls and actual provider transactions.
// The local acceptance harness supplies already isolated/authorized clients and read-only observation.
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

async function dismissIntro(page) {
  for(let attempt=0;attempt<12;attempt++) {
    const goal=page.locator('.goal-card[open]').getByRole('button',{name:'Got it',exact:true});
    const skip=page.getByRole('button',{name:'Skip',exact:true}).first();
    if(await goal.isVisible().catch(()=>false))await goal.click();
    else if(await skip.isVisible().catch(()=>false))await skip.click();
    else return;
    await page.waitForTimeout(100);
  }
  throw Error('Ordinary tutorial dismissal did not settle');
}

async function build(page, spot) {
  await dismissIntro(page);
  await page.evaluate(spot => {const island=window.__island.island;island.ui.close();island.pick(spot);},spot);
  const [answer]=await Promise.all([page.waitForResponse(reply=>reply.url().endsWith('/api/island/build')
    &&reply.request().method()==='POST',{timeout:30000}),
    page.locator('.island-card[open] [data-focus="choice-cannon"]:not([disabled])').evaluate(button=>button.click())]);
  const data=await answer.json();
  assert.equal(answer.status(),200,JSON.stringify(data));
  assert.equal(data.receipt.result.chargedCoins,'30');
  return {spot,paidCoins:30,body:answer.request().postDataJSON(),receipt:data.receipt};
}

export async function measureFundedProvider({ownerPage,memberPage,ownerId,memberId,
  observe,outputDir,sourceCommit,harnessHashes={}}) {
  for(const page of [ownerPage,memberPage])assert.ok(['localhost','127.0.0.1'].includes(
    new URL(page.url()).hostname),'Use explicitly isolated local-provider clients only');
  const runnerHash=()=>readFile(new URL(import.meta.url)).then(bytes=>createHash('sha256').update(bytes).digest('hex'));
  const sourceHash=await runnerHash();
  const report={sourceCommit,runnerSha256:sourceHash,harnessHashes,status:'running',
    evidenceLayer:'actual_local_provider_rendered_pair',
    limitations:['Fresh temporary local users/island; explicit installer admission, not save conversion',
      'One two-player early wave; no claim about human skill, full campaign, natural wagers or physical devices',
      'Programmatic normal button handlers; no pointer hit-testing proof',
      'No response interception, fake adapters, injected combat state or forced finish'],purchases:[]};
  await mkdir(outputDir,{recursive:true});
  const before=await observe(`select a.id,a.balance_coins::text as balance,
    (select count(*)::integer from public.islet_buildings b where b.player_id=a.island_owner) as assets,
    (select count(*)::integer from public.island_treasury_transactions t where t.account_id=a.id
     and t.reason='starting_coins') as grants from public.island_economy_accounts a
    join public.island_economy_state s on s.current_account_id=a.id where s.island_owner=$1`,[ownerId]);
  assert.equal(before.length,1);assert.equal(before[0].balance,'200');assert.equal(before[0].assets,0);
  assert.equal(before[0].grants,1);
  const account=before[0].id;
  for(const page of [ownerPage,memberPage])assert.equal(await page.evaluate(
    ()=>window.__island.island.economy.accountId),account,'Both rendered clients defend one account');
  const wallets=()=>observe('select player_id,balance::text as balance from public.wallets where player_id in($1,$2) order by player_id',[ownerId,memberId]);
  const initialWallets=await wallets();
  const started=Date.now();
  try {
    for(const [page,spot] of [[ownerPage,'cannon_1'],[memberPage,'cannon_2'],[ownerPage,'cannon_3']])
      report.purchases.push(await build(page,spot));
    const spent=await observe('select balance_coins::text as balance,committed_coins::text as committed from public.island_economy_accounts where id=$1',[account]);
    assert.deepEqual(spent,[{balance:'110',committed:'0'}]);
    await ownerPage.evaluate(()=>window.__island.island.ui.close());
    await memberPage.evaluate(()=>window.__island.island.ui.close());
    await dismissIntro(ownerPage);await dismissIntro(memberPage);
    await ownerPage.keyboard.down('a');await ownerPage.waitForTimeout(400);await ownerPage.keyboard.up('a');
    await memberPage.keyboard.down('d');await memberPage.waitForTimeout(400);await memberPage.keyboard.up('d');
    await ownerPage.evaluate(()=>window.__island.island.pick('island_bell'));
    const bellWall=Date.now();
    await ownerPage.locator('.island-card[open] [data-focus="bell"]:not([disabled])').evaluate(button=>button.click());
    await ownerPage.waitForFunction(()=>!!window.__island?.waves?.island.wave,null,{timeout:30000});
    await memberPage.waitForFunction(()=>!!window.__island?.waves?.island.wave,null,{timeout:30000});
    const observedWave=await ownerPage.evaluate(()=>{
      const wave=window.__island.waves.island.wave;
      return {wave:wave.info.wave,seed:wave.info.seed,weather:wave.info.weather,
        frozen:wave.info.initialSnapshot,at:wave.state.time};
    });
    assert.equal(observedWave.wave,1);
    report.wave=observedWave;
    let terminal=null;
    const deadline=Date.now()+180000;
    while(Date.now()<deadline){
      const rows=await observe(`select c.outcome,c.loot_coins::text as loot,
        (select count(*)::integer from public.island_wave_completion_receipts r where r.wave_id=c.wave_id) as completions,
        (select count(*)::integer from public.island_treasury_transactions t where t.account_id=$1 and t.reason='pirate_loot') as lootEntries
        from public.island_wave_closures c join public.island_wave_accounting w on w.wave_id=c.wave_id
        where w.account_id=$1`,[account]);
      if(rows.length){terminal=rows[0];break;}
      await ownerPage.waitForTimeout(500);
    }
    assert.ok(terminal,'Ordinary rendered/native terminal handling must settle the measured attempt');
    assert.equal(terminal.completions,2);
    assert.equal(terminal.lootEntries,terminal.outcome==='won'?1:0);
    const final=await observe(`select a.balance_coins::text as balance,
      a.balance_coins=sum(t.balance_delta) as reconciles from public.island_economy_accounts a
      join public.island_treasury_transactions t on t.account_id=a.id where a.id=$1 group by a.id`,[account]);
    assert.equal(final[0].balance,String(110+Number(terminal.loot)));
    assert.equal(final[0].reconciles,true);
    assert.deepEqual(await wallets(),initialWallets);
    report.terminal={...terminal,closingCoins:final[0].balance,ledgerReconciles:true,
      personalWalletsUnchanged:true,elapsedSinceBellMs:Date.now()-bellWall};
    report.elapsedTotalMs=Date.now()-started;
    await ownerPage.screenshot({path:join(outputDir,'funded-pair-terminal.png')});
    assert.equal(await runnerHash(),sourceHash,'The rendered measurement runner changed during execution');
    report.status='measured';
  }catch(error){report.status='failed';report.error=error.message;throw error;}
  finally{await writeFile(join(outputDir,'funded-provider.json'),JSON.stringify(report,null,2)+'\n');}
  return report;
}
