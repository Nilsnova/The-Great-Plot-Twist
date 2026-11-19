// Actual-provider T60 scenario. The caller owns isolated users/bootstrap and schedules mutations.
// No intercepted responses, injected HP, fabricated journal events or database writes are used.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const SOURCE = '3bdd8eda16470795fdedd68c42fffab54e5f2ced';
const REPAIR = '/api/island/structures/repair';

async function pointerClick(page,button) {
  await button.waitFor({state:'visible',timeout:10000});
  // Recovery controls follow a long card. Use ordinary scrolling and reacquire
  // the locator after each render, then require actual pointer ownership.
  let point=null;
  for(let attempt=0;attempt<40 && !point;attempt++) {
    point=await button.evaluate(element=>{
      element.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
      const box=element.getBoundingClientRect(),x=box.x+box.width/2,y=box.y+box.height/2;
      const hit=document.elementFromPoint(x,y);
      return !element.disabled && box.width>0 && box.height>0
        && (hit===element || element.contains(hit))?{x,y}:null;
    });
    if(!point)await page.waitForTimeout(50);
  }
  assert.ok(point,'the visible enabled button must actually receive the physical pointer');
  await page.mouse.click(point.x,point.y);
}

async function dismissGuides(page) {
  let dismissed=false;
  for(let turn=0;turn<8;turn++) {
    const action=await page.evaluate(()=>{
      for(const [selector,label] of [['.shell-screen[open]','Resume'],['.goal-card[open]','Got it'],
        ['.island-card-lobby[open]','Look around first'],['dialog.cutscene[open]','Skip'],['.tutorial-card[open]','Skip']]) {
        const dialog=document.querySelector(selector);
        const button=dialog && [...dialog.querySelectorAll('button')].find(node=>node.textContent.trim()===label);
        if(button){button.click();return label;}
      }
      return null;
    });
    if(!action)return dismissed;
    dismissed=true;await page.waitForTimeout(50);
  }
  throw new Error('Ordinary guide dismissal did not finish.');
}

async function openCard(page, spot) {
  await dismissGuides(page);
  await page.evaluate(() => window.__island?.island.ui.close());
  await page.evaluate(spot => {
    const island = window.__island?.island;
    if (!island || island.mode==='fake') throw new Error('A real rendered island is required.');
    island.ui.close(); island.pick(spot);
  },spot);
  await page.locator('.island-card[open]').waitFor({timeout:10000});
}

const repairBody=(read,row,origin)=>({spot:row.spot,instanceId:row.instanceId,actionUid:crypto.randomUUID(),
  expectedEpoch:read.islandEpoch,expectedWindow:read.repairWindow,expectedWaveId:read.waveId,
  expectedLevel:row.level,expectedRepairSeq:row.repairSeq,quotedPrice:row.fixedPrice,waveProtocol:2,
  economy:Object.fromEntries(['mode','version','islandOwner','runEpoch'].map(key=>[key,origin[key]]))});

async function quotedRepairTransport(page,spot,origin,api){
  const read=await recovery(page),row=read.structures.find(item=>item.spot===spot);
  assert.ok(row && row.hpUnits<1000000);
  const body=repairBody(read,row,origin),answer=await api(page,REPAIR,{method:'POST',body});
  assert.equal(answer.status,200,JSON.stringify(answer.data));assert.equal(answer.data.repeat,false);
  return {body,data:answer.data};
}

async function naturalRepairTarget(page,spots,previous=null){
  const found=await page.waitForFunction(({spots,previous})=>{
    const rows=window.__island?.waves?.island.recoveryCombatState?.structures
      .filter(row=>spots.includes(row.spot) && row.hpUnits<1000000)??[];
    return (rows.find(row=>row.spot!==previous)??rows[0])?.spot??null;
  },{spots,previous},{timeout:90000});
  return found.jsonValue();
}

async function acceptedNaturalDamage(page,spot){
  await page.waitForFunction(spot=>window.__island?.waves?.island.recoveryCombatState?.structures
    .some(row=>row.spot===spot && row.hpUnits<1000000),spot,{timeout:90000});
  let checkpoint;const until=Date.now()+10000;
  do{
    checkpoint=await page.evaluate(()=>window.__island.waves.island.checkpointBeforeRepair());
    if(checkpoint.ok || !['health_sync_required','input_sync_required'].includes(checkpoint.code))break;
    await page.waitForTimeout(100);
  }while(Date.now()<until);
  assert.equal(checkpoint.ok,true,`Actual natural checkpoint refused: ${JSON.stringify(checkpoint)}`);
  const read=await recovery(page),row=read.structures.find(item=>item.spot===spot);
  assert.ok(row && row.hpUnits<1000000);return {read,row};
}

/** Full actual-provider quota journey. Defense/unlock/budget setup is declared by the caller. */
export async function runFullRepairQuotaAcceptance({ownerPage,memberPage,observe,api,outputDir,
  reconnectMember,spots,sourceCommit,setup,expectedPlayedWave=1}) {
  const report={sourceCommit,scenario:'actual-provider-three-shared-repairs',status:'running',setup,steps:[],limits:[
    'Real local provider identities, production sessions and natural simulation; no HP, outcome, clock or journal fixture.',
    'Intro acknowledgements activate actual DOM controls as setup; the bell uses a physical pointer. Repair purchases use normal authenticated HTTP from each real browser session.',
    'This proves the complete provider/API quota with native browser replay; the earlier bounded case separately proves a physical repair-card purchase.',
    'Intact/stale/old-UID/fourth-refusal probes use actual authenticated HTTP and independent committed SQL observations.',
  ],scenarioSha256:createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex')};
  await mkdir(outputDir,{recursive:true});
  const save=()=>writeFile(join(outputDir,'t60-full-quota.json'),`${JSON.stringify(report,null,2)}\n`);
  const record=async(name,detail)=>{report.steps.push({name,...detail});await save();console.log(name);};
  try {
    const origin=await ownerPage.evaluate(()=>window.__island.island.economy);
    assert.equal((await memberPage.evaluate(()=>window.__island.island.economy)).accountId,origin.accountId);
    assert.equal((await observe('select current_wave_id from public.island_recovery_state where island_owner=$1',[origin.islandOwner]))[0].current_wave_id,null);
    const priorWave=await ownerPage.evaluate(()=>window.__island?.waves?.island.wave?.info.waveId??null);
    await openCard(ownerPage,'island_bell');
    await pointerClick(ownerPage,ownerPage.locator('.island-card[open] [data-focus="bell"]:not([disabled])'));
    await ownerPage.waitForFunction(prior=>{const wave=window.__island?.waves?.island.wave;
      return !!wave && !wave.done && wave.info.waveId!==prior;},priorWave,{timeout:20000});
    const wave=await ownerPage.evaluate(()=>window.__island.waves.island.wave.info.waveId);
    const playedWave=await ownerPage.evaluate(()=>window.__island.waves.island.wave.info.wave);
    assert.equal(playedWave,expectedPlayedWave,'the accepted wave must match the declared saved-state fixture');
    await memberPage.waitForFunction(wave=>window.__island?.waves?.island.wave?.info.waveId===wave,wave,{timeout:20000});
    const preparing=await recovery(ownerPage),intactRow=preparing.structures.find(row=>row.spot===spots[0]);
    assert.equal(preparing.displayPhase,'preparing');assert.equal(preparing.remainingPaidUses,3);assert.equal(intactRow.hpUnits,1000000);
    const before=await accounting(observe,origin.accountId,wave);
    const intact=await api(ownerPage,REPAIR,{method:'POST',body:repairBody(preparing,intactRow,origin)});
    assert.equal(intact.status,409);assert.equal(intact.data.error.code,'intact');
    assert.deepEqual(await accounting(observe,origin.accountId,wave),before);
    await record('accepted real countdown shares three uses; intact request has no financial/quota effect',{waveId:wave,playedWave,preparing,before,intact});
    const beforeControl=await memberPage.evaluate(()=>{
      const proof=window.__island.island.session.proof(),info=window.__island.waves.island.wave.info;
      return {actorId:proof.actorId,sessionId:proof.sessionId,connectionGeneration:proof.connectionGeneration,participantToken:info.participantToken};
    });
    await reconnectMember(memberPage);
    await memberPage.waitForFunction(wave=>{
      const app=window.__island,info=app?.waves?.island.wave?.info,proof=app?.island.session.proof();
      return info?.waveId===wave && info.spectator===false && !!proof && proof.sessionId===info.controlSessionId;
    },wave,{timeout:30000});
    const restored=await memberPage.evaluate(()=>{
      const proof=window.__island.island.session.proof(),info=window.__island.waves.island.wave.info;
      return {actorId:proof.actorId,sessionId:proof.sessionId,connectionGeneration:proof.connectionGeneration,participantToken:info.participantToken};
    });
    assert.equal(restored.actorId,beforeControl.actorId);assert.equal(restored.sessionId,beforeControl.sessionId);
    assert.equal(restored.participantToken,beforeControl.participantToken);
    assert.ok(BigInt(restored.connectionGeneration)>BigInt(beforeControl.connectionGeneration));
    await record('ordinary member reconnect retains frozen participant and shared untouched allowance',{beforeControl,restored,accounting:await accounting(observe,origin.accountId,wave)});
    const damaged=await ownerPage.waitForFunction(spots=>window.__island?.waves?.island.recoveryCombatState?.structures
      .find(row=>spots.includes(row.spot) && row.hpUnits>0 && row.hpUnits<1000000)?.spot??null,spots,{timeout:90000});
    const spot=await damaged.jsonValue(),damage=await acceptedNaturalDamage(ownerPage,spot),staleBody=repairBody(damage.read,damage.row,origin);
    staleBody.quotedPrice++;
    const stale=await api(ownerPage,REPAIR,{method:'POST',body:staleBody});
    assert.equal(stale.status,409);assert.equal(stale.data.error.code,'stale_recovery_quote');
    assert.deepEqual(await accounting(observe,origin.accountId,wave),before);
    await record('natural damage accepted; stale price consumes neither coins nor a shared use',{spot,damage:damage.row,stale});
    const receipts=[];
    const first=await quotedRepairTransport(ownerPage,spot,origin,api);receipts.push(first.data.receipt);
    assert.equal(first.data.receipt.result.useOrdinal,1);
    assert.equal(first.data.receipt.actorId,origin.islandOwner);assert.equal(first.data.receipt.origin.accountId,origin.accountId);
    assert.equal(first.data.receipt.result.chargedPrice,String(damage.row.fixedPrice));
    await Promise.all([repairApplied(ownerPage,first.data.receipt),repairApplied(memberPage,first.data.receipt)]);
    await record('owner buys shared repair one through authenticated browser transport',{request:first.body,receipt:first.data.receipt});
    const later=await acceptedNaturalDamage(ownerPage,spot),prior=await accounting(observe,origin.accountId,wave);
    const retry=await api(ownerPage,REPAIR,{method:'POST',body:first.body});
    assert.equal(retry.status,200);assert.equal(retry.data.repeat,true);assert.deepEqual(retry.data.receipt,first.data.receipt);
    assert.deepEqual(await accounting(observe,origin.accountId,wave),prior);
    const afterRetry=(await recovery(ownerPage)).structures.find(row=>row.spot===spot);
    assert.equal(afterRetry.repairSeq,later.row.repairSeq);assert.ok(afterRetry.hpUnits<=later.row.hpUnits);
    await record('original UID after later natural damage returns its immutable receipt without healing or spending',{beforeHp:later.row,afterHp:afterRetry,accounting:prior,retry});
    let previousSpot=spot;
    for(const [ordinal,page,actor] of [[2,memberPage,restored.actorId],[3,ownerPage,origin.islandOwner]]) {
      const target=await naturalRepairTarget(page,spots,previousSpot);
      await acceptedNaturalDamage(page,target);const paid=await quotedRepairTransport(page,target,origin,api),receipt=paid.data.receipt;
      assert.equal(receipt.actorId,actor);assert.equal(receipt.origin.accountId,origin.accountId);
      assert.equal(receipt.result.useOrdinal,ordinal);assert.equal(receipt.result.chargedPrice,String(damage.row.fixedPrice));
      receipts.push(receipt);await Promise.all([repairApplied(ownerPage,receipt),repairApplied(memberPage,receipt)]);
      await record(`authenticated shared repair ${ordinal} replays on both clients`,{request:paid.body,receipt});
      previousSpot=target;
    }
    let exhausted=await recovery(ownerPage),row=exhausted.structures.find(item=>spots.includes(item.spot)&&item.hpUnits<1000000);
    assert.equal(exhausted.remainingPaidUses,0);
    // The server's existing damaged row is already accepted authority. A fresh
    // checkpoint is needed only when damage exists solely in the client replay.
    if(!row){const target=await naturalRepairTarget(ownerPage,spots,previousSpot),accepted=await acceptedNaturalDamage(ownerPage,target);
      exhausted=accepted.read;row=accepted.row;}
    const finalBefore=await accounting(observe,origin.accountId,wave);
    assert.equal(exhausted.remainingPaidUses,0);assert.ok(row.hpUnits<1000000);
    const fourth=await api(ownerPage,REPAIR,{method:'POST',body:repairBody(exhausted,row,origin)});
    assert.equal(fourth.status,409);assert.equal(fourth.data.error.code,'repair_limit_reached');
    assert.deepEqual(await accounting(observe,origin.accountId,wave),finalBefore);
    assert.equal(finalBefore.used,3);assert.equal(finalBefore.receipts-before.receipts,3);
    assert.equal(new Set(receipts.map(receipt=>receipt.receiptId)).size,3);
    const total=receipts.reduce((sum,receipt)=>sum+BigInt(receipt.result.chargedPrice),0n);
    assert.equal(BigInt(finalBefore.balance),BigInt(before.balance)-total);assert.equal(finalBefore.committed,before.committed);
    for(const page of [ownerPage,memberPage])assert.equal((await recovery(page)).remainingPaidUses,0);
    await record('fourth fresh request refuses; exactly three receipts and exact total debit across both actors',{before,after:finalBefore,totalCharged:total.toString(),fourth});
    await ownerPage.screenshot({path:join(outputDir,'three-shared-repairs-quota.png')});
    let closed=null;const until=Date.now()+180000;
    while(Date.now()<until){const rows=await observe('select closed_at,closed_hp from public.recovery_wave_states where wave_id=$1',[wave]);
      if(rows[0]?.closed_at){closed=rows[0];break;}await ownerPage.waitForTimeout(1000);}
    assert.ok(closed,'ordinary played combat must close canonically');assert.ok(closed.closed_hp[row.instanceId]<1000000);
    const terminal=[];
    for(const page of [ownerPage,memberPage]){const read=await recovery(page);assert.equal(read.displayPhase,'between_waves');
      assert.ok(read.structures.every(item=>item.hpUnits===1000000));terminal.push(read);}
    const closedAgain=await observe('select closed_at,closed_hp from public.recovery_wave_states where wave_id=$1',[wave]);assert.deepEqual(closedAgain[0],closed);
    const replayClosed=await api(ownerPage,REPAIR,{method:'POST',body:first.body});assert.equal(replayClosed.status,200);assert.equal(replayClosed.data.repeat,true);assert.deepEqual(replayClosed.data.receipt,first.data.receipt);
    await record('canonical natural closure restores both current views and retains damaged closed HP and original receipt',{closed,terminal,replayClosed});
    report.status='passed';
  }catch(error){report.status='failed';report.error={name:error.name,message:error.message};throw error;}
  finally{await save();}
  return report;
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
  await page.waitForFunction(spot=>window.__island?.waves?.island.recoveryCombatState?.structures
    .some(row=>row.spot===spot && row.hpUnits<1000000),spot,{timeout});
  await openCard(page,spot);
  await page.locator('.island-card[open] .recovery-repair:not([disabled])').waitFor({timeout});
  const checkpoint = await page.evaluate(() => window.__island.waves.island.checkpointBeforeRepair());
  assert.equal(checkpoint.ok,true,'the actual simulation must commit its accepted damage prefix');
  const read = await recovery(page), row = read.structures.find(item => item.spot===spot);
  assert.ok(row && row.hpUnits<1000000,'natural rendered damage must also be accepted by the server');
  return {read,row};
}

async function repairApplied(page, receipt) {
  const result=receipt.result;
  await page.waitForFunction(expected=>window.__island?.waves?.island.recoveryCombatState?.structures
    .some(row=>row.instanceId===expected.instanceId && row.repairSeq>=expected.repairSeq),
  result,{timeout:10000});
}

async function paidClick(page, spot) {
  await openCard(page,spot);
  if(await dismissGuides(page))await openCard(page,spot);
  const response = page.waitForResponse(reply => reply.url().endsWith(REPAIR)
    && reply.request().method()==='POST',{timeout:20000})
    .then(reply=>({reply}),error=>({error}));
  await pointerClick(page,page.locator('.island-card[open] .recovery-repair:not([disabled])'));
  const settled=await response;
  if(settled.error)throw settled.error;
  const reply = settled.reply, data = await reply.json();
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
  spot='wall_1',spots=[spot],reconnectMember=page=>page.reload(),sourceCommit=SOURCE}) {
  const report = {sourceCommit,status:'running',scenario:'actual-provider-paid-repair',steps:[],limits:[
    'Temporary local provider accounts; no hosted service or deployment.',
    'Natural simulation checkpoints retain the existing accepted-combat-report trust model.',
    'Same-UID and refused fourth requests use actual authenticated transport, not a UI click.',
    'Existing development inspection selects cards; actions use hit-tested physical pointer controls.',
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
    const idle=await observe(`select current_wave_id from public.island_recovery_state where island_owner=$1`,
      [ownerEconomy.islandOwner]);
    assert.equal(idle.length,1); assert.equal(idle[0].current_wave_id,null,'start at the real idle boundary');
    // Native accepted bell owns first recovery-v1 enrollment. A new shared island
    // may still be recovery0/protocol1 before it; do not forge that transition.
    await openCard(ownerPage,'island_bell');
    await pointerClick(ownerPage,ownerPage.locator('.island-card[open] [data-focus="bell"]:not([disabled])'));
    await ownerPage.waitForFunction(() => !!window.__island?.waves?.island.wave,null,{timeout:20000});
    await memberPage.waitForFunction(() => !!window.__island?.waves?.island.wave,null,{timeout:20000});
    const naturallyDamaged=await ownerPage.waitForFunction(spots => {
      const state=window.__island?.waves?.island.wave?.state;
      return [...(state?.walls??[]),...(state?.towers??[])]
        .find(row=>spots.includes(row.id) && row.hp<row.maxHp)?.id??null;
    },spots,{timeout:90000});
    spot=await naturallyDamaged.jsonValue();
    const firstDamage = await damagedCard(ownerPage,spot);
    assert.equal(firstDamage.read.recoveryVersion,1); assert.equal(firstDamage.read.waveProtocol,2);
    assert.ok(BigInt(ownerEconomy.treasury.availableCoins)>=BigInt(firstDamage.row.fixedPrice*3));
    const wave = firstDamage.read.waveId, account=ownerEconomy.accountId;
    assert.equal(firstDamage.read.remainingPaidUses,3);
    const before = await accounting(observe,account,wave);
    const first = await paidClick(ownerPage,spot);
    assert.equal(first.data.receipt.result.useOrdinal,1);
    assert.equal(first.data.receipt.result.chargedPrice,String(firstDamage.row.fixedPrice));
    report.steps.push({name:'first genuine card repair',waveId:wave,receipt:first.data.receipt});
    await repairApplied(ownerPage,first.data.receipt);
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
    await memberPage.waitForFunction(waveId => {
      const app=window.__island,info=app?.waves?.island.wave?.info,proof=app?.island.session.proof();
      return info?.waveId===waveId && info.spectator===false && !!proof && proof.sessionId===info.controlSessionId;
    },wave,{timeout:30000});
    for (const [ordinal,page] of [[2,memberPage],[3,ownerPage]]) {
      await damagedCard(page,spot);
      const paid = await paidClick(page,spot);
      assert.equal(paid.data.receipt.result.useOrdinal,ordinal);
      report.steps.push({name:`genuine shared repair ${ordinal}`,receipt:paid.data.receipt});
      await repairApplied(page,paid.data.receipt);
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

/** Bounded regression for a real restored member: one repair, not the full three-use matrix. */
export async function runReconnectedRepairAcceptance({ownerPage,memberPage,observe,api,outputDir,
  reconnectMember,spots,sourceCommit=SOURCE}) {
  const report={sourceCommit,status:'running',scenario:'actual-provider-reconnected-member-repair',steps:[],limits:[
    'One genuine paid repair after an ordinary member reload; the full three-use provider matrix is separate.',
    'Real temporary local provider identities and native simulation reports; no hosted service, injected HP or outcomes.',
    'Development inspection selects cards; the bell and paid repair use hit-tested physical pointers.',
  ],scenarioSha256:createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex')};
  await mkdir(outputDir,{recursive:true});
  try {
    const origin=await ownerPage.evaluate(()=>window.__island.island.economy);
    const memberBefore=await memberPage.evaluate(()=>window.__island.island.session.proof());
    assert.ok(memberBefore,'the invited member begins with genuine current control');
    assert.equal((await observe('select current_wave_id from public.island_recovery_state where island_owner=$1',[origin.islandOwner]))[0].current_wave_id,null);
    await openCard(ownerPage,'island_bell');
    await pointerClick(ownerPage,ownerPage.locator('.island-card[open] [data-focus="bell"]:not([disabled])'));
    await ownerPage.waitForFunction(()=>!!window.__island?.waves?.island.wave,null,{timeout:20000});
    const wave=await ownerPage.evaluate(()=>window.__island.waves.island.wave.info.waveId);
    await memberPage.waitForFunction(wave=>window.__island?.waves?.island.wave?.info.waveId===wave,wave,{timeout:20000});
    await reconnectMember(memberPage);
    await memberPage.waitForFunction(wave=>{
      const app=window.__island,info=app?.waves?.island.wave?.info,proof=app?.island.session.proof();
      return info?.waveId===wave && info.spectator===false && !!proof && proof.sessionId===info.controlSessionId;
    },wave,{timeout:30000});
    const restored=await memberPage.evaluate(()=>{
      const info=window.__island.waves.island.wave.info,proof=window.__island.island.session.proof();
      return {actorId:proof.actorId,sessionId:proof.sessionId,connectionGeneration:proof.connectionGeneration,
        waveId:info.waveId,spectator:info.spectator,controlSessionId:info.controlSessionId,participantToken:info.participantToken};
    });
    assert.equal(restored.actorId,memberBefore.actorId);
    assert.equal(restored.sessionId,memberBefore.sessionId);
    assert.ok(BigInt(restored.connectionGeneration)>BigInt(memberBefore.connectionGeneration));
    assert.equal((await observe('select current_wave_id from public.island_recovery_state where island_owner=$1',[origin.islandOwner]))[0].current_wave_id,wave);
    report.steps.push({name:'ordinary reload restores the existing frozen participant while the canonical wave remains active',restored});
    const damaged=await memberPage.waitForFunction(spots=>window.__island?.waves?.island.recoveryCombatState?.structures
      .find(row=>spots.includes(row.spot) && row.hpUnits<1000000)?.spot??null,spots,{timeout:90000});
    const spot=await damaged.jsonValue(),damage=await damagedCard(memberPage,spot);
    const before=await accounting(observe,origin.accountId,wave),paid=await paidClick(memberPage,spot);
    assert.equal(paid.data.receipt.actorId,restored.actorId);assert.equal(paid.data.receipt.origin.accountId,origin.accountId);
    assert.equal(paid.data.receipt.result.useOrdinal,1);assert.equal(paid.data.receipt.result.chargedPrice,String(damage.row.fixedPrice));
    const after=await accounting(observe,origin.accountId,wave);
    assert.equal(BigInt(after.balance),BigInt(before.balance)-BigInt(damage.row.fixedPrice));
    assert.equal(after.committed,before.committed);assert.equal(after.receipts,before.receipts+1);assert.equal(after.used,1);
    await Promise.all([repairApplied(memberPage,paid.data.receipt),repairApplied(ownerPage,paid.data.receipt)]);
    report.steps.push({name:'restored member physically repairs natural damage once from the shared treasury',receipt:paid.data.receipt,before,after});
    await memberPage.screenshot({path:join(outputDir,'reconnected-member-paid-repair.png')});
    let closed=null;const until=Date.now()+180000;
    while(Date.now()<until){const rows=await observe('select closed_at,closed_hp from public.recovery_wave_states where wave_id=$1',[wave]);
      if(rows[0]?.closed_at){closed=rows[0];break;}await ownerPage.waitForTimeout(1000);}
    assert.ok(closed,'the ordinary played wave must close canonically');
    assert.ok(Object.values(closed.closed_hp).some(hp=>hp<1000000),'natural closed combat damage remains visible');
    const terminal=[];
    for(const page of [ownerPage,memberPage]){const read=await recovery(page);assert.equal(read.displayPhase,'between_waves');
      assert.ok(read.structures.every(row=>row.hpUnits===1000000));terminal.push({remainingPaidUses:read.remainingPaidUses,structures:read.structures});}
    assert.deepEqual((await observe('select closed_at,closed_hp from public.recovery_wave_states where wave_id=$1',[wave]))[0],closed);
    report.steps.push({name:'both clients read full current HP while natural closed HP stays immutable',closed,terminal});
    report.status='passed';
  }catch(error){report.status='failed';report.error=error.message;throw error;}
  finally{await writeFile(join(outputDir,'t60-reconnected-repair.json'),`${JSON.stringify(report,null,2)}\n`);}
  return report;
}
