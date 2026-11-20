// Separate real-provider house/boss income case; no prior acceptance scenario is replayed.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createPersonalPlayout} from './economy-personal-playout.mjs';
import {fetchSealedEvents} from '../src/pirates/wave-replay.js';

const argument=name=>{const index=process.argv.indexOf(name);return index<0?null:process.argv[index+1];};
const runtimePath=argument('--runtime'),output=argument('--output'),expectedCommit=argument('--expected-commit');
if(!runtimePath||!output||!/^[a-f0-9]{40}$/.test(expectedCommit??''))throw Error('Use --runtime LOCAL_JSON --output PRIVATE_DIRECTORY --expected-commit FULL_SHA.');
const helpers=process.env.MP_ECO_API_HELPERS?pathToFileURL(process.env.MP_ECO_API_HELPERS):new URL('./authenticated-economy/api-clients.mjs',import.meta.url);
const observer=new URL('./observer.mjs',helpers),sourceHelper=new URL('./source.mjs',helpers),runtimeHelper=new URL('./runtime.mjs',helpers);
const {createApiClients,requestApi}=await import(helpers.href);
const {observe,install,admit}=await import(observer.href);
const {sourceEvidence,servedSourceEvidence}=await import(sourceHelper.href);
const {loadRuntime}=await import(runtimeHelper.href);
const runtime=await loadRuntime(runtimePath);assert.equal(runtime.expectedCommit,expectedCommit);
const root=fileURLToPath(new URL('../../',import.meta.url));sourceEvidence(expectedCommit,{checkoutRoot:root});
const sourceBefore=servedSourceEvidence(runtime),source=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const ownHashes=Object.fromEntries(await Promise.all(['check-economy-boss-income-provider.mjs','economy-personal-playout.mjs','economy-personal-loader.mjs'].map(async file=>[file,sha(await readFile(new URL(file,import.meta.url)))])));
const helperUrls=[helpers,observer,sourceHelper,runtimeHelper],helperHashes=Object.fromEntries(await Promise.all(helperUrls.map(async url=>[fileURLToPath(url).split('/').pop(),sha(await readFile(url))])));
await mkdir(output,{recursive:false,mode:0o700});
const startedAt=new Date().toISOString(),facts=[],requests=[];let env;
const uid=()=>randomUUID().replaceAll('-',''),wait=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
const context=e=>Object.fromEntries(['mode','version','islandOwner','runEpoch'].map(key=>[key,e[key]]));
const read=(sql,parameters=[])=>observe(sql,parameters,{runtimePath});
const seed=(sql,parameters,purpose)=>install(sql,parameters,purpose,{runtimePath});
function note(event,details={}){facts.push({event,at:new Date().toISOString(),...details});console.log(JSON.stringify({event,...details}));}
async function api(actor,path,{method='GET',body}={}){
 const answer=await requestApi(actor,path,{method,body}),url=new URL(path,'http://localhost');
 requests.push({actor:actor.label,path:url.pathname,queryKeys:[...url.searchParams.keys()],method,status:answer.status,errorCode:answer.data?.error?.code??null});return answer;
}
async function ok(actor,path,options){const result=await api(actor,path,options);assert.equal(result.status,200,path.split('?')[0]+': '+(result.data?.error?.code??'unexpected status'));return result.data;}
try{
 env=await createApiClients({labels:['boss-owner','boss-member-a','boss-member-b'],runtimePath,expectedCommit});
 const [owner,...members]=env.clients;
 const created=await ok(owner,'/api/games',{method:'POST',body:{actionUid:uid()}}),code=created.game.code;
 const admitted=await admit(owner.actorId,{coins:200,runtimePath}),economy=context(admitted.currentEconomy),accountId=admitted.currentEconomy.accountId;
 await seed('insert into public.islets(player_id,timber) values($1::uuid,0) on conflict do nothing',[owner.actorId],'Saved fortress fixture anchor only');
 await seed("insert into public.islet_buildings(player_id,plot,building_type,level,coins_paid,timber_paid,ref) select $1::uuid,'cannon_'||n,'cannon',5,0,0,'fixture_boss_cannon_'||n from generate_series(1,7) n",
  [owner.actorId],'Explicit saved seven-cannon level-five fortress fixture; no earned purchase/refund entitlement is claimed');
 await seed("insert into public.islet_buildings(player_id,plot,building_type,level,coins_paid,timber_paid,ref) values($1::uuid,'house_1','house',2,0,0,'fixture_boss_house_1'),($1::uuid,'house_2','house',3,0,0,'fixture_boss_house_2')",
  [owner.actorId],'Explicit saved two-house fixture with five total levels for frozen income basis; no natural acquisition is claimed');
 await seed('update public.islands set wave_best=4,next_wave=5,crew_gunner=7 where player_id=$1::uuid',[owner.actorId],
  'Explicit saved boss unlock/wave and crew fixture; personal milestones and actual terminal outcomes remain unmodified');
 for(const actor of members)await ok(actor,'/api/games/join',{method:'POST',body:{code,actionUid:uid()}});
 const proofs=new Map();
 for(const actor of env.clients){const sessionId=randomUUID();const attached=await ok(actor,'/api/island/session/attach',{method:'POST',body:{economy,sessionId,expectedGeneration:'0',actionUid:uid()}});assert.equal(attached.session.isController,true);proofs.set(actor,{economy,sessionId,connectionGeneration:attached.session.connectionGeneration});}
 const walletsBefore=await read('select player_id,balance::text from public.wallets where player_id=any($1::uuid[]) order by player_id',[env.clients.map(actor=>actor.actorId)]);
 await ok(owner,'/api/island/session/settings',{method:'POST',body:{...proofs.get(owner),actionUid:uid(),countdownSeconds:0,autoNext:false}});
 const wave=await ok(owner,'/api/waves/start',{method:'POST',body:{...proofs.get(owner),where:'own',actionUid:uid(),waveProtocol:2}});
 assert.equal(wave.wave,5);assert.equal(wave.boss,true);assert.equal(wave.initialSnapshot.participants.length,3);
 const play=createPersonalPlayout(wave),deadline=Date.now()+240000;let lastHeartbeat=0;
 note('normal-authenticated-boss-bell',{playedWave:5,participants:3,savedHouseLevels:5});
 while(!play.sim.done&&Date.now()<deadline){
  if(Date.now()-lastHeartbeat>4000){for(const actor of env.clients)await ok(actor,'/api/island/session/heartbeat',{method:'POST',body:proofs.get(actor)});lastHeartbeat=Date.now();}
  assert.equal(await fetchSealedEvents(play.replay,async request=>{
   const proof=proofs.get(owner),query=new URLSearchParams({islandOwner:economy.islandOwner,runEpoch:economy.runEpoch,sessionId:proof.sessionId,connectionGeneration:proof.connectionGeneration,...Object.fromEntries(Object.entries(request).map(([key,value])=>[key,String(value)]))});
   return ok(owner,'/api/waves/'+wave.waveId+'/events?'+query);
  }),true);
  if(play.replay.sealedThroughTick>=play.driver.nextTick)play.advance(play.replay.sealedThroughTick);
  if(!play.sim.done)await wait(800);
 }
 assert.equal(play.sim.done,true,'No natural boss terminal within four minutes');
 const outcome=play.sim.result();assert.equal(outcome.survived,true,'Saved fortress did not naturally win this boss attempt');
 const body={waveId:wave.waveId,waveProtocol:2,survived:outcome.survived,shipsSunk:outcome.shipsSunk,
  ...(outcome.bonuses?.length?{bonuses:outcome.bonuses}:{}),...(outcome.rescued===true?{rescued:true}:{}),checkpoint:play.checkpoint(uid())};
 const closed=await ok(owner,'/api/waves/finish',{method:'POST',body:{...body,...proofs.get(owner)}});assert.equal(closed.outcome,'won');
 let acknowledgements=1;
 for(const actor of env.clients)for(let repeat=0;repeat<(actor===owner?1:2);repeat++){
  const claim=await ok(actor,'/api/waves/finish',{method:'POST',body:{...body,...proofs.get(actor)}});
  assert.equal(claim.repeat,true);assert.equal(claim.outcome,'won');assert.equal(claim.completion.playerId,actor.actorId);assert.equal(claim.completion.confirmedParticipation,true);assert.equal(claim.completion.accountId,accountId);assert.equal(claim.completion.runEpoch,economy.runEpoch);acknowledgements++;
 }
 const rows=await read("select a.account_id,a.run_epoch,a.played_wave,a.reward_basis,c.earned_bonuses,c.loot_coins::text as loot,(select count(*)::int from public.island_treasury_transactions t where t.reference='wave:'||a.wave_id::text and t.reason='pirate_loot') as credits,(select coalesce(sum(t.balance_delta),0)::text from public.island_treasury_transactions t where t.reference='wave:'||a.wave_id::text and t.reason='pirate_loot') as credited,(select count(*)::int from public.island_wave_participation_receipts p where p.wave_id=a.wave_id) as confirmed,(select count(*)::int from public.island_wave_completion_receipts p where p.wave_id=a.wave_id) as completions from public.island_wave_accounting a join public.island_wave_closures c on c.wave_id=a.wave_id where a.wave_id=$1::uuid",[wave.waveId]);
 assert.equal(rows.length,1);const income=rows[0],basis=income.reward_basis;
 assert.equal(income.account_id,accountId);assert.equal(income.run_epoch,economy.runEpoch);assert.equal(income.confirmed,3);assert.equal(income.completions,3);assert.equal(basis.houseLevels,'5');assert.ok(BigInt(basis.bossMultiplier)>1n);
 const base=BigInt(basis.baseCoins)+BigInt(basis.perWaveCoins)*BigInt(income.played_wave),houses=BigInt(basis.perHouseCoins)*BigInt(basis.houseLevels),bonuses=income.earned_bonuses.reduce((total,name)=>total+BigInt(basis.bonuses[name]),0n),expected=(base+houses+bonuses)*BigInt(basis.bossMultiplier);
 assert.equal(income.loot,String(expected));assert.equal(income.credited,String(expected));assert.equal(income.credits,1);assert.notEqual(income.credited,String(expected*3n));
 const accounts=await read('select balance_coins::text as balance,committed_coins::text as held,(select coalesce(sum(t.balance_delta),0)::text from public.island_treasury_transactions t where t.account_id=a.id) as ledger_balance,(select coalesce(sum(t.committed_delta),0)::text from public.island_treasury_transactions t where t.account_id=a.id) as ledger_held from public.island_economy_accounts a where id=$1::uuid',[accountId]);
 assert.equal(accounts[0].balance,String(200n+expected));assert.equal(accounts[0].held,'0');assert.equal(accounts[0].balance,accounts[0].ledger_balance);assert.equal(accounts[0].held,accounts[0].ledger_held);
 const walletsAfter=await read('select player_id,balance::text from public.wallets where player_id=any($1::uuid[]) order by player_id',[env.clients.map(actor=>actor.actorId)]);assert.deepEqual(walletsAfter,walletsBefore);
 note('natural-boss-win-house-income-once',{waveId:wave.waveId,simulatedSeconds:outcome.time,sealedThroughTick:play.replay.sealedThroughTick,simulatedThroughTick:body.checkpoint.throughTick,shipsSunk:outcome.shipsSunk,acknowledgements,income,calculated:{base:String(base),houses:String(houses),earnedBonuses:String(bonuses),bossMultiplier:basis.bossMultiplier,expected:String(expected)},account:accounts[0],personalWalletsUnchanged:true});
 const sourceAfter=servedSourceEvidence(runtime);for(const url of helperUrls)assert.equal(sha(await readFile(url)),helperHashes[fileURLToPath(url).split('/').pop()]);
 await writeFile(output+'/result.json',JSON.stringify({result:'passed',source,expectedCommit,ownHashes,helperHashes,sourceBefore,sourceAfter,startedAt,finishedAt:new Date().toISOString(),facts,requests,
  limitations:['API-only actual provider sessions; no rendered browser interaction is claimed.','Fortress, houses, wave unlock and crew are explicit saved-state fixtures, not naturally earned assets or conversion.','The terminal win and HP checkpoint came from unchanged production simulation over complete real sealed journals; no outcome, HP, clock, input journal or immutable row was changed.','Only actually earned bonuses are included; unobserved special-bonus cases and other acceptance rows remain separate.','No hosted service, migration, deployment, conversion or activation.']},null,2)+'\n',{mode:0o600});
}catch(error){await writeFile(output+'/failure.json',JSON.stringify({result:'failed',source,expectedCommit,ownHashes,helperHashes,sourceBefore,startedAt,finishedAt:new Date().toISOString(),failure:{name:error.name,message:error.message,stack:error.stack},facts,requests},null,2)+'\n',{mode:0o600});throw error;}
finally{await env?.close();}
