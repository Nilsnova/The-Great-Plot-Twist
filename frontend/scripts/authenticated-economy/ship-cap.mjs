// Authenticated provider financial scenario; supplied stars and initial saved unlocks are explicit fixtures.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const uid=()=>randomUUID().replaceAll('-','');
const intent=e=>Object.fromEntries(['mode','version','islandOwner','runEpoch'].map(k=>[k,e[k]]));
const checked=(answer,status=200)=>{assert.equal(answer.status,status,JSON.stringify(answer.data));return answer.data;};
const gamePath='/api/island/boat';
const sum=rows=>rows.reduce((n,row)=>n+Number(row.receipt.result.coins),0);
export const sameSourceScope=(before,after)=>JSON.stringify(before,(key,value)=>key==='actualCheckoutHead'?undefined:value)
 ===JSON.stringify(after,(key,value)=>key==='actualCheckoutHead'?undefined:value);

export async function runShipCap({clients,observe,install,admit,sourceEvidence,helperEvidence}) {
 assert.equal(clients.length,11,'Ten primary members plus one independent island owner are required');
 const hash=async()=>createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex');
 const runnerBefore=await hash(),helperBefore=await helperEvidence(),sourceBefore=await sourceEvidence();
 const report={scenario:'ship-reward-cap',status:'running',evidenceLayer:'actual_local_provider_authenticated_HTTP',
  runnerSha256:runnerBefore,helperBefore,sourceBefore,assertions:[],limits:[
   'API-only actual GoTrue/production verifier; no rendered controls, Realtime or natural ship-game play claim.',
   'Initial saved wave30/wave35 and completed wreck are explicit pre-admission eligibility fixtures, not earned wins or repair payments.',
   'Submitted 0–3 stars use the existing trusted-score product contract; no score-history, clock, outcome, receipt or authority edits.',
   'Fresh local admission is installer setup, not legacy conversion or rollout.']};
 const check=(name,facts)=>{report.assertions.push({name,...facts});console.log(name);};
 async function prepare(owner,members,wave){
  checked(await owner.request('/api/games',{method:'POST',body:{actionUid:uid()}}));
  const legacy=checked(await owner.request('/api/island'));
  const seeded=await install('update public.islands set wave_best=$2,next_wave=$2+1,wreck_paid=500 where player_id=$1::uuid returning wave_best,wreck_paid',
   [owner.actorId,wave],`Initial saved-unlock fixture: record ${wave}, repaired wreck 500, before admission; no victory/repair receipt is fabricated`);
  assert.equal(seeded.length,1);assert.equal(seeded[0].wave_best,wave);assert.equal(seeded[0].wreck_paid,500);
  await admit(owner.actorId,{coins:200});
  for(const member of members)checked(await member.request('/api/games/join',{method:'POST',body:{code:legacy.code,actionUid:uid()}}));
  const view=checked(await owner.request('/api/island'));
  assert.equal(view.economy.mode,'island_shared');assert.equal(view.economy.treasury.availableCoins,'200');
  return {owner,members:[owner,...members],code:legacy.code,economy:view.economy,context:intent(view.economy),record:wave};
 }
 async function start(client,island,game){
  const body={economy:island.context,game,actionUid:uid()};
  const reply=checked(await client.request(gamePath+'/start',{method:'POST',body}));
  const round=reply.receipt.result.round;
  assert.equal(round.game,game);assert.equal(round.recordWave,island.record);
  assert.equal(round.accountId,island.economy.accountId);assert.equal(round.runEpoch,island.economy.runEpoch);
  return {client,round,reply};
 }
 async function claim(opened,island,stars){
  const body={economy:island.context,roundId:opened.round.id,stars,actionUid:uid()};
  const reply=checked(await opened.client.request(gamePath+'/claim',{method:'POST',body}));
  assert.equal(reply.receipt.result.stars,stars);assert.equal(reply.receipt.result.recordWave,island.record);
  assert.equal(reply.receipt.origin.accountId,island.economy.accountId);assert.equal(reply.receipt.origin.runEpoch,island.economy.runEpoch);
  return {client:opened.client,body,reply};
 }
 async function walletFacts(){return observe(`select w.player_id,w.balance::text as balance,
  (select count(*)::integer from public.wallet_transactions t where t.player_id=w.player_id) as entries,
  coalesce((select sum(t.delta)::text from public.wallet_transactions t where t.player_id=w.player_id),'0') as summed
  from public.wallets w where w.player_id=any($1::uuid[]) order by w.player_id`,[clients.map(c=>c.actorId)]);}
 async function money(account){
  const rows=await observe(`select a.balance_coins::text as balance,a.committed_coins::text as committed,a.revision::text as revision,
   coalesce(sum(t.balance_delta),0)::text as summed_balance,coalesce(sum(t.committed_delta),0)::text as summed_committed,
   count(t.id)::text as entries from public.island_economy_accounts a left join public.island_treasury_transactions t on t.account_id=a.id
   where a.id=$1::uuid group by a.id`,[account]);
  assert.equal(rows.length,1);const row=rows[0];assert.equal(row.balance,row.summed_balance);
  assert.equal(row.committed,row.summed_committed);assert.equal(row.revision,row.entries);return row;
 }
 try {
  const primary=await prepare(clients[0],clients.slice(1,10),30);
  const foreign=await prepare(clients[10],[clients[1]],35);
  const walletsBefore=await walletFacts();assert.equal(walletsBefore.length,11);
  const members=await observe('select count(*)::integer as count from public.island_members where island_owner=$1::uuid and player_id<>$1::uuid and left_at is null',[primary.owner.actorId]);
  assert.equal(members[0].count,9);
  for(const member of primary.members){
   const status=checked(await member.request(gamePath+'?code='+encodeURIComponent(primary.code)));
   assert.equal(status.rewardScope,'island');assert.equal(status.open,true);assert.equal(status.wave,30);
   assert.equal(status.economy.accountId,primary.economy.accountId);
  }
  check('ten real authenticated members share the admitted ship origin',{members:10,record:30});
  const historical=[];
  for(const game of ['broadside','dash']){
   const stages=[];
   for(const stars of [1,2,3]){
    const rounds=await Promise.all(primary.members.map(member=>start(member,primary,game)));
    const claims=await Promise.all(rounds.map(round=>claim(round,primary,stars)));
    const delta=sum(claims.map(c=>c.reply));assert.equal(delta,12);
    for(const item of claims)assert.equal(item.reply.receipt.result.maximumCoins,'36');
    stages.push({stars,parallelMembers:10,creditedCoins:delta,receipts:claims.map(c=>c.reply.receipt)});
    historical.push(...claims);
   }
   const lowerRounds=await Promise.all(primary.members.map(member=>start(member,primary,game)));
   const lower=await Promise.all(lowerRounds.map((round,index)=>claim(round,primary,index%4)));
   assert.equal(sum(lower.map(c=>c.reply)),0);
   const bucket=await observe(`select game,record_wave,maximum_coins::text as maximum,paid_coins::text as paid
    from public.island_boat_reward_buckets where account_id=$1::uuid and game=$2 order by record_wave`,[primary.economy.accountId,game]);
   assert.deepEqual(bucket,[{game,record_wave:30,maximum:'36',paid:'36'}]);
   check('parallel improvements share one '+game+' cap',{stages,duplicateLowerClaims:10,duplicateLowerCoins:0,bucket});
  }
  const beforeRetry=await money(primary.economy.accountId);
  assert.equal(beforeRetry.balance,'272');
  const replays=await Promise.all(historical.map(async item=>{
   const repeated=checked(await item.client.request(gamePath+'/claim',{method:'POST',body:item.body}));
   assert.equal(repeated.repeat,true);assert.deepEqual(repeated.receipt,item.reply.receipt);assert.equal(repeated.currentEconomy,null);return repeated;
  }));
  assert.equal(replays.length,60);assert.deepEqual(await money(primary.economy.accountId),beforeRetry);
  const changed=checked(await historical[0].client.request(gamePath+'/claim',{method:'POST',body:{...historical[0].body,stars:2}}),409);
  assert.equal(changed.error.code,'idempotency_conflict');
  check('sixty exact historical claims and changed payload cannot mint money',{exactReplays:60,changedStatus:409,account:beforeRetry});
  const pending=await start(clients[1],primary,'broadside');
  const foreignBefore=await money(foreign.economy.accountId);
  const wrongIsland=checked(await clients[1].request(gamePath+'/claim',{method:'POST',body:{economy:foreign.context,roundId:pending.round.id,stars:3,actionUid:uid()}}),409);
  assert.equal(wrongIsland.error.code,'economy_epoch_mismatch');
  assert.deepEqual(await money(primary.economy.accountId),beforeRetry);assert.deepEqual(await money(foreign.economy.accountId),foreignBefore);
  const foreignRound=await start(clients[1],foreign,'broadside');
  const foreignClaim=await claim(foreignRound,foreign,3);assert.equal(foreignClaim.reply.receipt.result.coins,'39');
  assert.equal((await money(foreign.economy.accountId)).balance,'239');
  check('different island and frozen record cannot reuse a source round',{wrongIslandStatus:409,foreignRecord:35,foreignOwnReward:'39'});
  const resetBody={economy:primary.context,confirmCode:primary.code,actionUid:uid()};
  const reset=checked(await primary.owner.request('/api/island/fresh-start',{method:'POST',body:resetBody}));
  assert.equal(reset.repeat,false);assert.equal(reset.currentEconomy,null);
  const replacement=checked(await primary.owner.request('/api/island')).economy;
  assert.notEqual(replacement.accountId,primary.economy.accountId);assert.notEqual(replacement.runEpoch,primary.economy.runEpoch);
  assert.equal(replacement.treasury.availableCoins,'200');
  const replacementBefore=await money(replacement.accountId);
  const retired=await observe('select state from public.island_economy_accounts where id=$1::uuid',[primary.economy.accountId]);
  assert.equal(retired[0].state,'retired');
  const oldRefusals=[];
  // The common operation helper refuses a new retired-account intent before the
  // ship function's later epoch check; a mismatched new epoch is refused earlier by HTTP.
  for(const [context,expectedCode] of [[primary.context,'economy_path_unavailable'],[intent(replacement),'economy_epoch_mismatch']]){
   const actionUid=uid();
   const refused=checked(await clients[1].request(gamePath+'/claim',{method:'POST',body:{economy:context,roundId:pending.round.id,stars:3,actionUid}}),409);
   assert.equal(refused.error.code,expectedCode);
   const roots=await observe('select count(*)::integer as count from public.island_economy_operations where actor_id=$1::uuid and action_uid=$2',[clients[1].actorId,actionUid]);
   assert.equal(roots[0].count,0);
   assert.deepEqual(await money(primary.economy.accountId),beforeRetry);
   assert.deepEqual(await money(replacement.accountId),replacementBefore);
   oldRefusals.push({status:409,code:refused.error.code,noOperationRoot:true});
  }
  const freshStatus=checked(await primary.owner.request(gamePath+'?code='+encodeURIComponent(primary.code)));
  assert.equal(freshStatus.economy.accountId,replacement.accountId);assert.equal(freshStatus.open,false);
  const healthyForeign=checked(await foreign.owner.request(gamePath+'?code='+encodeURIComponent(foreign.code)));
  assert.equal(healthyForeign.open,true);
  const prior=historical[0];
  const afterReset=checked(await prior.client.request(gamePath+'/claim',{method:'POST',body:prior.body}));
  assert.equal(afterReset.repeat,true);assert.deepEqual(afterReset.receipt,prior.reply.receipt);assert.equal(afterReset.currentEconomy,null);
  assert.deepEqual(await money(primary.economy.accountId),beforeRetry);assert.deepEqual(await money(replacement.accountId),replacementBefore);
  const resetReplay=checked(await primary.owner.request('/api/island/fresh-start',{method:'POST',body:resetBody}));
  assert.equal(resetReplay.repeat,true);assert.deepEqual(resetReplay.receipt,reset.receipt);
  assert.deepEqual(await money(replacement.accountId),replacementBefore);
  check('actual owner reset preserves origin fences and immutable receipt replay',{oldBalance:'272',newBalance:'200',retiredState:retired[0].state,oldRefusals,currentStatusHealthy:true,uncompletedOldRoundRefused:true,newEpochCannotRebindRound:true,historicalReceiptReplay:true,oneReplacementGrant:true});
  assert.deepEqual(await walletFacts(),walletsBefore);
  check('all origin ledgers reconcile and eleven private wallet histories stay unchanged',{privateWallets:walletsBefore.length,primary:beforeRetry,foreign:await money(foreign.economy.accountId),replacement:replacementBefore});
  report.status='passed';
 }catch(error){report.status='failed';report.failure={name:error.name,message:error.message};throw Object.assign(error,{shipReport:report});}
 finally{
  report.helperAfter=await helperEvidence();report.sourceAfter=await sourceEvidence();report.runnerAfterSha256=await hash();
  report.sourcesUnchanged=report.runnerAfterSha256===runnerBefore&&JSON.stringify(report.helperAfter)===JSON.stringify(helperBefore)
   &&sameSourceScope(report.sourceAfter,sourceBefore);
  report.sourceComparison='Same protected production baseline/diff scope and exact pinned helper hashes; checkout HEAD is recorded separately because unrelated tests may be committed.';
  if(!report.sourcesUnchanged){report.status='failed';report.sourceFailure='Scenario/helper/served sources changed';}
 }
 if(!report.sourcesUnchanged)throw Object.assign(new Error('The actual measured source inputs changed'),{shipReport:report});
 return report;
}
