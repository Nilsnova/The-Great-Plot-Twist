// Actual Auth/API personal evidence; combat is the unmodified production simulation over sealed time.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createPersonalPlayout} from './economy-personal-playout.mjs';
import {fetchSealedEvents} from '../src/pirates/wave-replay.js';

const argument=name=>{const index=process.argv.indexOf(name);return index<0?null:process.argv[index+1];};
const runtimePath=argument('--runtime'),output=argument('--output');
const expectedCommit=argument('--expected-commit');
if(!runtimePath||!output||!/^[a-f0-9]{40}$/.test(expectedCommit??''))throw Error('Use --runtime LOCAL_JSON --output PRIVATE_DIRECTORY --expected-commit FULL_SHA.');
const helpers=process.env.MP_ECO_API_HELPERS?pathToFileURL(process.env.MP_ECO_API_HELPERS):new URL('./authenticated-economy/api-clients.mjs',import.meta.url);
const observer=new URL('./observer.mjs',helpers),sourceHelper=new URL('./source.mjs',helpers),runtimeHelper=new URL('./runtime.mjs',helpers);
const {createApiClients,requestApi}=await import(helpers.href);
const {observe,install,admit}=await import(observer.href);
const {servedSourceEvidence,sourceEvidence}=await import(sourceHelper.href);
const {loadRuntime}=await import(runtimeHelper.href);
const runtime=await loadRuntime(runtimePath);assert.equal(runtime.expectedCommit,expectedCommit);
const root=fileURLToPath(new URL('../../',import.meta.url));
sourceEvidence(expectedCommit,{checkoutRoot:root});const sourceBefore=servedSourceEvidence(runtime);
const source=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const ownFiles=['check-economy-personal-provider.mjs','economy-personal-playout.mjs','economy-personal-loader.mjs'];
const ownHashes=Object.fromEntries(await Promise.all(ownFiles.map(async file=>[file,sha(await readFile(new URL(file,import.meta.url)))])));
const helperUrls=[helpers,observer,sourceHelper,runtimeHelper];
const helperHashes=Object.fromEntries(await Promise.all(helperUrls.map(async url=>[fileURLToPath(url).split('/').pop(),sha(await readFile(url))])));
await mkdir(output,{recursive:false,mode:0o700});
const startedAt=new Date().toISOString(),facts=[],requests=[];let env;
const uid=()=>randomUUID().replaceAll('-','');
const wait=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
const context=e=>Object.fromEntries(['mode','version','islandOwner','runEpoch'].map(key=>[key,e[key]]));
const read=(sql,parameters=[])=>observe(sql,parameters,{runtimePath});
const seed=(sql,parameters,purpose)=>install(sql,parameters,purpose,{runtimePath});
function note(event,details={}){facts.push({event,at:new Date().toISOString(),...details});console.log(JSON.stringify({event,...details}));}
async function api(actor,path,{method='GET',body}={}){
 const answer=await requestApi(actor,path,{method,body});
 requests.push({actor:actor.label,path,method,status:answer.status,errorCode:answer.data?.error?.code??null});return answer;
}
async function ok(actor,path,options){const answer=await api(actor,path,options);assert.equal(answer.status,200,path+': '+(answer.data?.error?.code??'unexpected status'));return answer.data;}
async function profile(actor){return ok(actor,'/api/captain');}
async function attach(actor,economy){
 const sessionId=randomUUID(),answer=await ok(actor,'/api/island/session/attach',{method:'POST',body:{economy,sessionId,expectedGeneration:'0',actionUid:uid()}});
 assert.equal(answer.session.isController,true);return {economy,sessionId,connectionGeneration:answer.session.connectionGeneration};
}
async function leave(actor,proof){return ok(actor,'/api/island/session/leave',{method:'POST',body:{...proof,actionUid:uid()}});}
async function heartbeat(actor,proof){return ok(actor,'/api/island/session/heartbeat',{method:'POST',body:proof});}
async function build(actor,path,proof,spot){
 const snapshot=await ok(actor,path),quote=snapshot.quotes.build.find(row=>row.target.spot===spot&&row.available);
 assert.ok(quote,'Missing actual build quote for '+spot);assert.equal(quote.intent.quotedCoins,'9');
 return ok(actor,'/api/island/build',{method:'POST',body:{economy:proof.economy,actionUid:uid(),...quote.intent}});
}
async function noProgress(actors){
 for(const actor of actors){const current=await profile(actor);assert.equal(current.captain.personalBestWave,0);assert.equal(current.skills.earned,0);}
}
async function participation(waveId){return read('select player_id,confirmed_at>=a.starts_at as post_start from public.island_wave_participation_receipts p join public.island_wave_accounting a on a.wave_id=p.wave_id where p.wave_id=$1::uuid order by player_id',[waveId]);}
async function waveIncome(waveId){
 const rows=await read("select a.account_id,a.run_epoch,a.played_wave,a.reward_basis,c.earned_bonuses,c.outcome,c.loot_coins::text as loot,(select count(*)::int from public.island_treasury_transactions t where t.reference='wave:'||a.wave_id::text and t.reason='pirate_loot') as credits,(select coalesce(sum(t.balance_delta),0)::text from public.island_treasury_transactions t where t.reference='wave:'||a.wave_id::text and t.reason='pirate_loot') as credited from public.island_wave_accounting a join public.island_wave_closures c on c.wave_id=a.wave_id where a.wave_id=$1::uuid",[waveId]);
 assert.equal(rows.length,1);const row=rows[0],basis=row.reward_basis;
 const bonus=row.earned_bonuses.reduce((total,name)=>total+BigInt(basis.bonuses[name]),0n);
 const expected=row.outcome==='won'?(BigInt(basis.baseCoins)+BigInt(basis.perWaveCoins)*BigInt(row.played_wave)+BigInt(basis.perHouseCoins)*BigInt(basis.houseLevels)+bonus)*BigInt(basis.bossMultiplier):0n;
 assert.equal(row.loot,String(expected));assert.equal(row.credited,row.loot);return row;
}
async function naturalFinish(actor,proof,wave,{otherHeartbeats=[]}={}){
 const play=createPersonalPlayout(wave),deadline=Date.now()+240000;let lastHeartbeat=0;
 while(!play.sim.done&&Date.now()<deadline){
  if(Date.now()-lastHeartbeat>4000){await heartbeat(actor,proof);for(const [other,otherProof] of otherHeartbeats)await heartbeat(other,otherProof);lastHeartbeat=Date.now();}
  const complete=await fetchSealedEvents(play.replay,async request=>{
   const query=new URLSearchParams({islandOwner:proof.economy.islandOwner,runEpoch:proof.economy.runEpoch,
    sessionId:proof.sessionId,connectionGeneration:proof.connectionGeneration,...Object.fromEntries(Object.entries(request).map(([key,value])=>[key,String(value)]))});
   return ok(actor,'/api/waves/'+wave.waveId+'/events?'+query);
  });assert.equal(complete,true,'Actual server journal was not complete');
  if(play.replay.sealedThroughTick>=play.driver.nextTick)play.advance(play.replay.sealedThroughTick);
  if(!play.sim.done)await wait(800);
 }
 assert.equal(play.sim.done,true,'No natural simulation terminal within four minutes');
 const result=play.sim.result(),checkpoint=play.checkpoint(uid());
 const body={...proof,waveId:wave.waveId,waveProtocol:2,survived:result.survived,shipsSunk:result.shipsSunk,
  ...(result.bonuses?.length?{bonuses:result.bonuses}:{}),...(result.rescued===true?{rescued:true}:{}),checkpoint};
 const finished=await ok(actor,'/api/waves/finish',{method:'POST',body});
 assert.equal(finished.outcome,result.survived?'won':'lost');
 note('natural-headless-wave-terminal',{waveId:wave.waveId,playedWave:wave.wave,outcome:finished.outcome,
  simulatedSeconds:result.time,sealedThroughTick:play.replay.sealedThroughTick,simulatedThroughTick:checkpoint.throughTick,shipsSunk:result.shipsSunk});
 return {finished,body};
}
try{
 env=await createApiClients({labels:['personal-owner','personal-engineer','personal-offline','personal-spectator','personal-countdown'],runtimePath,expectedCommit});
 const [owner,engineer,offline,spectator,countdown]=env.clients;
 const created=await ok(owner,'/api/games',{method:'POST',body:{actionUid:uid()}}),code=created.game.code;
 const admitted=await admit(owner.actorId,{coins:200,runtimePath}),economy=context(admitted.currentEconomy);
 await seed('insert into public.islets(player_id,timber) values($1::uuid,0) on conflict do nothing',[owner.actorId],'Saved island fixture anchor only; no earned purchase is claimed');
 await seed("insert into public.islet_buildings(player_id,plot,building_type,level,coins_paid,timber_paid,ref) select $1::uuid,'cannon_'||n,'cannon',5,0,0,'fixture_saved_'||n from generate_series(1,4) n",
  [owner.actorId],'Explicit saved four-cannon level-five defense fixture; no natural acquisition or refund entitlement is claimed');
 await seed('update public.islands set wave_best=1,next_wave=2,crew_gunner=4 where player_id=$1::uuid',[owner.actorId],
  'Explicit island wave-two/crew setup; personal won-wave progress is not changed');
 for(const actor of [engineer,offline,spectator,countdown])await ok(actor,'/api/games/join',{method:'POST',body:{code,actionUid:uid()}});
 await ok(engineer,'/api/games',{method:'POST',body:{actionUid:uid()}});
 const admittedB=await admit(engineer.actorId,{coins:200,runtimePath}),economyB=context(admittedB.currentEconomy);
 const proofs=new Map();for(const actor of env.clients)proofs.set(actor,await attach(actor,economy));
 await seed('update public.personal_captain_profiles set level=5 where player_id=$1::uuid',[engineer.actorId],
  'Acquired Captain-level eligibility fixture only; no personal win or skill point is granted');
 const walletBefore=await read('select player_id,balance::text from public.wallets where player_id=any($1::uuid[]) order by player_id',[env.clients.map(row=>row.actorId)]);
 let current=await profile(engineer);
 await ok(engineer,'/api/captain/role',{method:'POST',body:{progressionVersion:1,expectedRevision:current.captain.revision,actionUid:uid(),role:'engineer'}});
 const visit='/api/island/visit/'+code;
 const first=await build(engineer,visit,proofs.get(engineer),'wall_1');
 const c1=(await profile(engineer)).captain.engineerCommitment.id;
 await build(engineer,visit,proofs.get(engineer),'wall_2');assert.equal((await profile(engineer)).captain.engineerCommitment.id,c1);
 current=await profile(engineer);
 const refusedRole=await api(engineer,'/api/captain/role',{method:'POST',body:{progressionVersion:1,expectedRevision:current.captain.revision,actionUid:uid(),role:'medic'}});assert.equal(refusedRole.status,409);
 const respec=await ok(engineer,'/api/captain/respec',{method:'POST',body:{progressionVersion:1,expectedRevision:current.captain.revision,actionUid:uid()}});
 assert.equal(respec.captain.role,'engineer');assert.equal(respec.captain.engineerCommitment.id,c1);
 const legacy=await api(engineer,'/api/island/role',{method:'POST',body:{role:'medic'}});assert.equal(legacy.status,409);
 const legacyRespec=await api(engineer,'/api/island/respec',{method:'POST',body:{actionUid:uid()}});assert.equal(legacyRespec.status,409);
 for(const actor of [offline,spectator])await leave(actor,proofs.get(actor));
 for(const actor of [owner,engineer,countdown])await heartbeat(actor,proofs.get(actor));
 await ok(owner,'/api/island/session/settings',{method:'POST',body:{...proofs.get(owner),actionUid:uid(),countdownSeconds:10,autoNext:false}});
 const wave=await ok(owner,'/api/waves/start',{method:'POST',body:{...proofs.get(owner),where:'own',actionUid:uid(),waveProtocol:2}});
 assert.equal(wave.wave,2);assert.equal(wave.initialSnapshot.participants.length,3);
 await heartbeat(owner,proofs.get(owner));await heartbeat(countdown,proofs.get(countdown));
 assert.deepEqual(await participation(wave.waveId),[]);
 await leave(countdown,proofs.get(countdown));
 const spectatorRead=await ok(spectator,'/api/waves/current?where='+code+'&waveProtocol=2');assert.equal(spectatorRead.session.isSpectator,true);assert.equal(spectatorRead.participantToken,null);
 await noProgress([offline,spectator,countdown]);
 const frozen=await read('select engineer_commitment_id from public.personal_captain_wave_snapshots where player_id=$1::uuid and wave_id=$2::uuid',[engineer.actorId,wave.waveId]);assert.equal(frozen[0].engineer_commitment_id,c1);
 const assigned=await profile(engineer);const assignedRespec=await api(engineer,'/api/captain/respec',{method:'POST',body:{progressionVersion:1,expectedRevision:assigned.captain.revision,actionUid:uid()}});assert.equal(assignedRespec.status,409);
 note('multiple-discounts-one-generation-and-countdown-fences',{prices:['9','9'],generation:c1,roster:3,preStartParticipation:0,roleBlocked:refusedRole.status,legacyBlocked:legacy.status,legacyRespecBlocked:legacyRespec.status,assignedRespecBlocked:assignedRespec.status});
 while(Date.now()<=Date.parse(wave.startsAt)+200)await wait(Math.min(500,Date.parse(wave.startsAt)+250-Date.now()));
 await heartbeat(owner,proofs.get(owner));await heartbeat(engineer,proofs.get(engineer));
 const confirmed=await participation(wave.waveId);assert.equal(confirmed.length,2);assert.ok(confirmed.every(row=>row.post_start));
 const combatSpectator=await ok(spectator,'/api/waves/current?where='+code+'&waveProtocol=2');assert.equal(combatSpectator.session.isSpectator,true);
 const oldProof=proofs.get(engineer);
 await ok(engineer,'/api/island/session/disconnect',{method:'POST',body:oldProof});
 assert.deepEqual(await participation(wave.waveId),confirmed);
 const restored=await ok(engineer,'/api/island/session/attach',{method:'POST',body:{economy,sessionId:oldProof.sessionId,expectedGeneration:oldProof.connectionGeneration,actionUid:uid()}});
 assert.equal(BigInt(restored.session.connectionGeneration),BigInt(oldProof.connectionGeneration)+1n);
 proofs.set(engineer,{...oldProof,connectionGeneration:restored.session.connectionGeneration});
 assert.deepEqual(await participation(wave.waveId),confirmed);
 note('confirmed-participation-survived-real-disconnect',{confirmedActors:2,rotatedConnection:true,spectatorRewardReceipts:0});
 await leave(engineer,proofs.get(engineer));
 const proofB=await attach(engineer,economyB);await build(engineer,'/api/island',proofB,'wall_1');
 const c2=(await profile(engineer)).captain.engineerCommitment.id;assert.notEqual(c2,c1);
 note('confirmed-withdrawal-new-engineer-generation',{participation:2,oldGeneration:c1,newGeneration:c2});
 const terminal=await naturalFinish(owner,proofs.get(owner),wave,{otherHeartbeats:[[engineer,proofB]]});assert.equal(terminal.finished.outcome,'won');
 for(let repeat=0;repeat<2;repeat++)assert.equal((await ok(owner,'/api/waves/finish',{method:'POST',body:terminal.body})).repeat,true);
 const income=await waveIncome(wave.waveId);assert.equal(income.credits,1);assert.notEqual(income.loot,'0');
 assert.equal((await profile(engineer)).captain.engineerCommitment.id,c2);
 const ownerProgress=await profile(owner);assert.equal(ownerProgress.captain.personalBestWave,2);assert.equal(ownerProgress.skills.earned,1);
 const engineerProgress=await profile(engineer);assert.equal(engineerProgress.captain.personalBestWave,2);assert.equal(engineerProgress.skills.earned,1);
 await noProgress([offline,spectator,countdown]);
 const completion=await read('select player_id,confirmed_participation,engineer_commitment_id from public.island_wave_completion_receipts where wave_id=$1::uuid order by player_id',[wave.waveId]);
 assert.equal(completion.length,3);assert.equal(completion.filter(row=>row.confirmed_participation).length,2);
 const resetBody={economy,confirmCode:code,actionUid:uid()};await ok(owner,'/api/island/fresh-start',{method:'POST',body:resetBody});
 await ok(engineer,'/api/games/leave',{method:'POST',body:{code}});
 const historical={...terminal.body,...proofs.get(engineer)};
 for(let repeat=0;repeat<3;repeat++){
  const claim=await ok(engineer,'/api/waves/finish',{method:'POST',body:historical});
  assert.equal(claim.repeat,true);assert.equal(claim.completion.confirmedParticipation,true);assert.equal(claim.completion.engineerCommitmentId,c1);assert.equal(claim.economy,null);
 }
 const afterClaims=await profile(engineer);assert.equal(afterClaims.captain.engineerCommitment.id,c2);assert.equal(afterClaims.skills.earned,1);
 const effects=await read('select count(*)::int as count from public.personal_captain_completion_effects where player_id=$1::uuid and wave_id=$2::uuid',[engineer.actorId,wave.waveId]);assert.equal(effects[0].count,1);
 assert.deepEqual(await waveIncome(wave.waveId),income);
 note('personal-receipt-survives-departure-reset-and-retries',{outcome:'won',playedWave:2,ownerEarnedPoints:1,engineerEarnedPoints:1,unconfirmedActorsEarnedPoints:0,completionEffects:1,successorGenerationRetained:true});
 await heartbeat(engineer,proofB);
 await ok(engineer,'/api/island/session/settings',{method:'POST',body:{...proofB,actionUid:uid(),countdownSeconds:0,autoNext:false}});
 const waveB=await ok(engineer,'/api/waves/start',{method:'POST',body:{...proofB,where:'own',actionUid:uid(),waveProtocol:2}});
 await heartbeat(engineer,proofB);
 const terminalB=await naturalFinish(engineer,proofB,waveB);assert.equal(terminalB.finished.completion.confirmedParticipation,true);
 const lateWin=await ok(engineer,'/api/waves/finish',{method:'POST',body:{...terminalB.body,survived:true}});
 assert.equal(lateWin.repeat,true);assert.equal(lateWin.outcome,terminalB.finished.outcome);
 const incomeB=await waveIncome(waveB.waveId);assert.equal(incomeB.credits,terminalB.finished.outcome==='won'?1:0);
 assert.equal(terminalB.finished.completion.engineerCommitmentId,c2);
 current=await profile(engineer);assert.equal(current.captain.engineerCommitment,null);assert.equal(current.skills.earned,1);
 const walletAfter=await read('select player_id,balance::text from public.wallets where player_id=any($1::uuid[]) order by player_id',[env.clients.map(row=>row.actorId)]);assert.deepEqual(walletAfter,walletBefore);
 const accounts=await read('select a.id,a.state,a.balance_coins::text as balance,a.committed_coins::text as held,(select coalesce(sum(t.balance_delta),0)::text from public.island_treasury_transactions t where t.account_id=a.id) as ledger_balance,(select coalesce(sum(t.committed_delta),0)::text from public.island_treasury_transactions t where t.account_id=a.id) as ledger_held from public.island_economy_accounts a where a.island_owner in ($1::uuid,$2::uuid) order by a.id',[owner.actorId,engineer.actorId]);
 assert.equal(accounts.length,3);for(const account of accounts){assert.equal(account.balance,account.ledger_balance);assert.equal(account.held,account.ledger_held);assert.equal(account.held,'0');}
 assert.equal(accounts.find(row=>row.id===admitted.currentEconomy.accountId).balance,String(182n+BigInt(income.loot)));
 assert.equal(accounts.find(row=>row.id===admittedB.currentEconomy.accountId).balance,String(191n+BigInt(incomeB.loot)));
 assert.equal(accounts.find(row=>row.id!==admitted.currentEconomy.accountId&&row.id!==admittedB.currentEconomy.accountId).balance,'200');
 note('matching-natural-completion-only-clears-successor',{outcome:terminalB.finished.outcome,clearedGeneration:c2,earnedPoints:current.skills.earned,allPrivateWalletsUnchanged:true});
 note('wave-income-once-across-acknowledgements',{winning:income,secondAttempt:incomeB,lateWinClaimKeptOriginalOutcome:true,houseBossBonusCoverage:false});
 note('free-personal-actions-and-all-account-ledgers-reconciled',{accounts,allPrivateWalletsUnchanged:true});
 const sourceAfter=servedSourceEvidence(runtime);
 for(const url of helperUrls)assert.equal(sha(await readFile(url)),helperHashes[fileURLToPath(url).split('/').pop()],'Helper changed during run');
 await writeFile(output+'/result.json',JSON.stringify({result:'passed',source,expectedCommit,ownHashes,helperHashes,sourceBefore,sourceAfter,startedAt,finishedAt:new Date().toISOString(),facts,requests,
  limitations:['API-only registered-provider execution; no rendered browser interaction is claimed.','Four saved level-five cannons, saved island wave/crew and acquired Engineer level eligibility are explicit fixtures, not naturally earned.','Actual outcomes and HP checkpoints came only from the unchanged production simulation over complete actual sealed journals; no clock, journal, HP, receipt or outcome tampering.','This bounded personal/Engineer case does not complete other acceptance rows or public rollout.']},null,2)+'\n',{mode:0o600});
}catch(error){await writeFile(output+'/failure.json',JSON.stringify({result:'failed',source,expectedCommit,ownHashes,helperHashes,sourceBefore,startedAt,finishedAt:new Date().toISOString(),failure:{name:error.name,message:error.message,stack:error.stack},facts,requests},null,2)+'\n',{mode:0o600});throw error;}
finally{await env?.close();}
