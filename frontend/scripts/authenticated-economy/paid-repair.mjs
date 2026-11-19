// Actual-provider T60 scenario. The caller owns isolated users/bootstrap and schedules mutations.
// No intercepted responses, injected HP, fabricated journal events or database writes are used.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const SOURCE = '3bdd8eda16470795fdedd68c42fffab54e5f2ced';
const REPAIR = '/api/island/structures/repair';

async function dismissGuides(page) {
  let dismissed=false;
  for(let turn=0;turn<8;turn++) {
    const guides=page.locator('dialog.cutscene[open],.goal-card[open],.tutorial-card[open]');
    if(!await guides.count())return dismissed;
    // Escape closes the actual top modal before a delayed underlying arrival can be skipped.
    await page.keyboard.press('Escape'); dismissed=true;
  }
  throw new Error('Ordinary guide dismissal did not finish.');
}

async function openCard(page, spot) {
  await page.evaluate(() => window.__island?.island.ui.close());
  await dismissGuides(page);
  await page.evaluate(spot => {
    const island = window.__island?.island;
    if (!island || island.mode==='fake') throw new Error('A real rendered island is required.');
    island.ui.close(); island.pick(spot);
  },spot);
  await page.locator('.island-card[open]').waitFor({timeout:10000});
}

async function recovery(page) {
  return page.evaluate(async () => {
    const island = window.__island.island;
    const answer = await island.api.structureRecovery({code:island.gameCode});
    if (!answer.ok) throw new Error(`Canonical structures refused: ${answer.code}`);
    return answer.data;
  });
}

async function damagedCard(page, spot, timeout=90000) {
  await openCard(page,spot);
  await page.locator('.island-card[open] .recovery-repair:not([disabled])').waitFor({timeout});
  const checkpoint = await page.evaluate(() => window.__island.waves.island.checkpointBeforeRepair());
  assert.equal(checkpoint.ok,true,'the actual simulation must commit its accepted damage prefix');
  const read = await recovery(page), row = read.structures.find(item => item.spot===spot);
  assert.ok(row && row.hpUnits<1000000,'natural rendered damage must also be accepted by the server');
  return {read,row};
}

async function paidClick(page, spot) {
  await openCard(page,spot);
  if(await dismissGuides(page))await openCard(page,spot);
  const response = page.waitForResponse(reply => reply.url().endsWith(REPAIR)
    && reply.request().method()==='POST',{timeout:20000});
  await page.locator('.island-card[open] .recovery-repair:not([disabled])').click();
  const reply = await response, data = await reply.json();
  assert.equal(reply.status(),200,JSON.stringify(data));
  return {body:reply.request().postDataJSON(),data};
}

async function accounting(observe, account, wave) {
  const rows = await observe(`select balance_coins::text as balance,committed_coins::text as committed,
    (select count(*)::integer from public.island_shared_repair_receipts r
     join public.island_economy_operations o on o.id=r.operation_id where o.account_id=a.id) as receipts,
    (select paid_used from public.recovery_wave_states where wave_id=$2) as used
    from public.island_economy_accounts a where id=$1`,[account,wave]);
  assert.equal(rows.length,1,'the observer must read one committed original account');
  return rows[0];
}

/** Preconditions: both real product pages share one admitted idle island, a built target and repair funds.
 * api(page,path,{method,body,headers}) returns {status,data}; observe runs parameterized READ ONLY SQL.
 * Direct same-UID/fourth-request probes are explicitly transport-layer checks, not UI-click claims.
 */
export async function runPaidRepairAcceptance({ownerPage,memberPage,observe,api,outputDir,
  spot='wall_1',spots=[spot],reconnectMember=page=>page.reload()}) {
  const report = {sourceCommit:SOURCE,status:'running',scenario:'actual-provider-paid-repair',steps:[],limits:[
    'Temporary local provider accounts; no hosted service or deployment.',
    'Natural simulation checkpoints retain the existing accepted-combat-report trust model.',
    'Same-UID and refused fourth requests use actual authenticated transport, not a UI click.',
  ]};
  report.scenarioSha256=createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');
  const trace = [];
  const record = page => request => {
    if (request.url().endsWith(REPAIR) && request.method()==='POST') trace.push(request.postDataJSON());
  };
  const ownerListener=record(ownerPage),memberListener=record(memberPage);
  ownerPage.on('request',ownerListener); memberPage.on('request',memberListener);
  await mkdir(outputDir,{recursive:true});
  try {
    const ownerEconomy = await ownerPage.evaluate(() => window.__island.island.economy);
    const memberEconomy = await memberPage.evaluate(() => window.__island.island.economy);
    assert.equal(memberEconomy.accountId,ownerEconomy.accountId);
    const initial = await recovery(ownerPage);
    let initialRow=initial.structures.find(row=>row.spot===spot);
    assert.equal(initial.displayPhase,'between_waves','start at the real idle boundary');
    assert.ok(initialRow,'caller must build the target through the real product first');
    assert.ok(BigInt(ownerEconomy.treasury.availableCoins)>=BigInt(initialRow.fixedPrice*3));
    await openCard(ownerPage,'island_bell');
    await ownerPage.locator('.island-card[open] [data-focus="bell"]:not([disabled])').click();
    await ownerPage.waitForFunction(() => !!window.__island?.waves?.island.wave,null,{timeout:20000});
    await memberPage.waitForFunction(() => !!window.__island?.waves?.island.wave,null,{timeout:20000});
    const naturallyDamaged=await ownerPage.waitForFunction(spots => {
      const state=window.__island?.waves?.island.wave?.state;
      return [...(state?.walls??[]),...(state?.towers??[])]
        .find(row=>spots.includes(row.id) && row.hp<row.maxHp)?.id??null;
    },spots,{timeout:90000});
    spot=await naturallyDamaged.jsonValue();
    initialRow=initial.structures.find(row=>row.spot===spot);
    const firstDamage = await damagedCard(ownerPage,spot);
    const wave = firstDamage.read.waveId, account=ownerEconomy.accountId;
    assert.equal(firstDamage.read.remainingPaidUses,3);
    const before = await accounting(observe,account,wave);
    const first = await paidClick(ownerPage,spot);
    assert.equal(first.data.receipt.result.useOrdinal,1);
    assert.equal(first.data.receipt.result.chargedPrice,String(initialRow.fixedPrice));
    report.steps.push({name:'first genuine card repair',waveId:wave,receipt:first.data.receipt});
    await damagedCard(ownerPage,spot);
    const damagedBeforeRetry = await recovery(ownerPage), prior = await accounting(observe,account,wave);
    const retry = await api(ownerPage,REPAIR,{method:'POST',body:first.body,
      headers:{'X-Island-Economy-Version':'1'}});
    assert.equal(retry.status,200); assert.equal(retry.data.repeat,true);
    assert.deepEqual(retry.data.receipt,first.data.receipt);
    assert.deepEqual(await accounting(observe,account,wave),prior);
    const afterRetry = await recovery(ownerPage);
    assert.ok(afterRetry.structures.find(row=>row.spot===spot).hpUnits
      <=damagedBeforeRetry.structures.find(row=>row.spot===spot).hpUnits);
    report.steps.push({name:'immutable transport retry after later natural damage',accounting:prior});
    // Reload is an ordinary client reconnect. The page keeps its provider session and reacquires product state.
    await reconnectMember(memberPage);
    await memberPage.waitForFunction(() => !!window.__island?.waves?.island.wave,null,{timeout:30000});
    for (const [ordinal,page] of [[2,memberPage],[3,ownerPage]]) {
      await damagedCard(page,spot);
      const paid = await paidClick(page,spot);
      assert.equal(paid.data.receipt.result.useOrdinal,ordinal);
      report.steps.push({name:`genuine shared repair ${ordinal}`,receipt:paid.data.receipt});
    }
    // With quota exhausted the UI correctly disables its button. Submit a fresh invalid intent only to the API.
    await ownerPage.waitForFunction(spot => {
      const state=window.__island?.waves?.island.wave?.state;
      return [...(state?.walls??[]),...(state?.towers??[])]
        .some(row=>row.id===spot && row.hp<row.maxHp);
    },spot,{timeout:90000});
    assert.equal((await ownerPage.evaluate(() => window.__island.waves.island.checkpointBeforeRepair())).ok,true);
    const last = await recovery(ownerPage), row=last.structures.find(item=>item.spot===spot);
    assert.ok(row.hpUnits<1000000); assert.equal(last.remainingPaidUses,0);
    const fourth={...first.body,actionUid:crypto.randomUUID(),expectedRepairSeq:row.repairSeq};
    const finalBefore=await accounting(observe,account,wave);
    const refused=await api(ownerPage,REPAIR,{method:'POST',body:fourth,
      headers:{'X-Island-Economy-Version':'1'}});
    assert.equal(refused.status,409); assert.equal(refused.data.error.code,'repair_limit_reached');
    assert.deepEqual(await accounting(observe,account,wave),finalBefore);
    assert.equal(finalBefore.used,3); assert.equal(finalBefore.receipts-before.receipts,3);
    report.steps.push({name:'fourth transport intent refused without effect',accounting:finalBefore});
    await ownerPage.screenshot({path:join(outputDir,'paid-repair-shared-quota.png')});
    const until=Date.now()+180000;
    let closed=null;
    while(Date.now()<until) {
      const rows=await observe('select closed_at,closed_hp from public.recovery_wave_states where wave_id=$1',[wave]);
      if(rows[0]?.closed_at) {closed=rows[0];break;}
      await ownerPage.waitForTimeout(1000);
    }
    assert.ok(closed,'ordinary canonical terminal handling must close the played wave');
    assert.ok(closed.closed_hp[first.body.instanceId]<1000000,'closed combat damage stays recorded');
    for(const page of [ownerPage,memberPage]) {
      const ended=await recovery(page);
      assert.equal(ended.displayPhase,'between_waves');
      assert.equal(ended.structures.find(item=>item.spot===spot).hpUnits,1000000);
      await openCard(page,spot);
      assert.equal(await page.locator('.island-card[open] .recovery-repair').count(),0);
    }
    assert.deepEqual((await observe('select closed_at,closed_hp from public.recovery_wave_states where wave_id=$1',[wave]))[0],closed);
    report.steps.push({name:'canonical terminal full current HP and immutable damaged closed HP',closed});
    await ownerPage.screenshot({path:join(outputDir,'paid-repair-terminal-full.png')});
    report.status='passed'; report.originalRepairRequest=first.body; report.repairRequestCount=trace.length;
  } catch(error) {report.status='failed';report.error=error.message;throw error;}
  finally {
    ownerPage.off('request',ownerListener);memberPage.off('request',memberListener);
    await writeFile(join(outputDir,'t60-paid-repair.json'),`${JSON.stringify(report,null,2)}\n`);
  }
  return report;
}
