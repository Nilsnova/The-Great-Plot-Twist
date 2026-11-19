// Actual concurrent game creation and reset requests cannot multiply per-run capital.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createApiClients} from './api-clients.mjs';
import {observe,admit} from './observer.mjs';
import {sourceEvidence,servedSourceEvidence} from './source.mjs';

const output=process.env.MP_ECO_OUTPUT??'/tmp/mp505-grant-races';
await mkdir(output,{recursive:false,mode:0o700});
const uid=()=>randomUUID().replaceAll('-','');
const context=e=>Object.fromEntries(['mode','version','islandOwner','runEpoch'].map(key=>[key,e[key]]));
const files=['grant-races.mjs','api-clients.mjs','runtime.mjs','source.mjs','observer.mjs','record-source.mjs',
 '../../../backend/tools/authenticated_economy/observe.py','../../../backend/tools/authenticated_economy/config.py',
 '../../../backend/tools/authenticated_economy/application.py','../../../backend/tools/authenticated_economy/worker.py'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async name=>[name,createHash('sha256').update(await readFile(new URL(name,import.meta.url))).digest('hex')])));
const helpersBefore=await hashes(),startedAt=new Date().toISOString(),facts=[];
function check(reply,status,label){assert.equal(reply.status,status,label+': '+JSON.stringify(reply.data));return reply.data;}
function note(event,details){const row={event,at:new Date().toISOString(),...details};facts.push(row);console.log(JSON.stringify(row));}
let env;
try{
 env=await createApiClients({labels:['grant-same-owner','grant-distinct-owner','grant-member']});
 const baseline=env.runtime.expectedCommit,sourceBefore=sourceEvidence(baseline);
 const [sameOwner,distinctOwner,member]=env.clients;
 const privateWallets=async()=>observe('select w.player_id::text,w.balance::text,'
  +"(select count(*)::int from public.wallet_transactions t where t.player_id=w.player_id and reason='starting_coins') as starting_grants,"
  +'(select coalesce(sum(delta),0)::text from public.wallet_transactions t where t.player_id=w.player_id) as ledger '
  +'from public.wallets w where player_id=any($1::uuid[]) order by player_id',[[sameOwner.actorId,distinctOwner.actorId,member.actorId]]);
 const initialWallets=await privateWallets();assert.ok(initialWallets.every(row=>row.balance==='0'&&row.starting_grants===0));
 const islands=[];
 for(const owner of [sameOwner,distinctOwner]){
  const created=await Promise.all(Array.from({length:3},()=>owner.request('/api/games',{method:'POST',body:{actionUid:uid()}})));
  const games=created.map(reply=>check(reply,200,'Concurrent create'));
  assert.equal(new Set(games.map(reply=>reply.game.code)).size,1);
  const code=games[0].game.code;
  const admitted=await admit(owner.actorId,{coins:200});
  const economy=context(admitted.currentEconomy);
  check(await member.request('/api/games/join',{method:'POST',body:{code,actionUid:uid()}}),200,'Member joins');
  check(await owner.request('/api/island/session/attach',{method:'POST',body:{economy,sessionId:randomUUID(),expectedGeneration:'0',actionUid:uid()}}),200,'Canonical adoption');
  const resumed=await Promise.all(Array.from({length:3},()=>owner.request('/api/games',{method:'POST',body:{actionUid:uid()}})));
  assert.ok(resumed.every(reply=>reply.status===200));
  const current=check(await owner.request('/api/island'),200,'Shared current');
  assert.equal(current.economy.treasury.availableCoins,'200');
  const roots=await observe('select count(*)::int as accounts from public.island_economy_accounts where island_owner=$1::uuid',[owner.actorId]);assert.equal(roots[0].accounts,1);
  const grant=await observe("select count(*)::int as count from public.island_treasury_transactions where account_id=$1::uuid and reason='starting_coins'",[current.economy.accountId]);assert.equal(grant[0].count,1);
  islands.push({owner,code,economy,initial:current.economy});
 }
 const afterCreation=await privateWallets();
 for(const row of afterCreation){assert.equal(row.balance,row.ledger);assert.equal(row.balance,row.player_id===member.actorId?'0':'200');assert.equal(row.starting_grants,row.player_id===member.actorId?0:1);}
 note('concurrent-create-and-resume-did-not-multiply-grants',{islands:2,parallelCreatesPerOwner:3,parallelSharedResumesPerOwner:3,sharedBudgetEach:'200',islandAccountsEach:1,personalInitialGrantsEachOwner:1,joiningMemberPersonalBudget:'0'});

 for(const [index,island] of islands.entries()){
  const firstBody={economy:island.economy,confirmCode:island.code,actionUid:uid()};
  const secondBody=index===0?firstBody:{...firstBody,actionUid:uid()};
  const replies=await Promise.all([firstBody,secondBody].map(body=>island.owner.request('/api/island/fresh-start',{method:'POST',body})));
  if(index===0){assert.deepEqual(replies.map(reply=>reply.status),[200,200]);assert.deepEqual(replies[0].data.receipt,replies[1].data.receipt);}
  else assert.deepEqual(replies.map(reply=>reply.status).sort(),[200,409]);
  const current=check(await member.request('/api/island/visit/'+encodeURIComponent(island.code)),200,'Member current after reset');
  assert.notEqual(current.economy.runEpoch,island.economy.runEpoch);assert.equal(current.economy.treasury.availableCoins,'200');
  const rows=await observe('select a.state,a.balance_coins::text as balance,a.committed_coins::text as held,'
   +"(select count(*)::int from public.island_treasury_transactions t where t.account_id=a.id and t.reason='starting_coins') as grants,"
   +'(select coalesce(sum(balance_delta),0)::text from public.island_treasury_transactions t where t.account_id=a.id) as ledger_balance '
   +'from public.island_economy_accounts a where island_owner=$1::uuid order by state',[island.owner.actorId]);
  assert.equal(rows.length,2);assert.equal(rows.filter(row=>row.state==='active').length,1);assert.equal(rows.filter(row=>row.state==='retired').length,1);
  assert.ok(rows.every(row=>row.balance==='200'&&row.held==='0'&&row.grants===1&&row.ledger_balance===row.balance));
  const stale=await island.owner.request('/api/island/fresh-start',{method:'POST',body:{...firstBody,actionUid:uid()}});check(stale,409,'New UID cannot reset a retired captured epoch');
  assert.equal((await observe('select count(*)::int as count from public.island_economy_accounts where island_owner=$1::uuid',[island.owner.actorId]))[0].count,2);
  note(index===0?'same-uid-reset-race-had-one-effect':'distinct-uid-reset-race-had-one-effect',{statuses:replies.map(reply=>reply.status),repeatFlags:replies.map(reply=>reply.data.repeat??null),newBudget:'200',oldBudget:'200',accounts:rows,staleNewUidStatus:stale.status});
 }
 assert.deepEqual(await privateWallets(),afterCreation);
 const helpersAfter=await hashes();assert.deepEqual(helpersAfter,helpersBefore);
 await writeFile(output+'/result.json',JSON.stringify({result:'passed',productionSource:baseline,startedAt,finishedAt:new Date().toISOString(),sourceBefore,sourceAfter:sourceEvidence(baseline),servedSourcesBefore:env.servedSources,servedSourcesAfter:servedSourceEvidence(env.runtime),helpersBefore,helpersAfter,facts,
  limitations:['API-only registered identities; no rendered controls or real save conversion is claimed.','Fresh service admission uses the configured200capital; it is explicit test setup.','Retired cash remains visible only as immutable origin history and does not fund the replacement account.']},null,2)+'\n',{mode:0o600});
}catch(error){process.exitCode=1;await writeFile(output+'/failure.json',JSON.stringify({result:'failed',startedAt,finishedAt:new Date().toISOString(),helpersBefore,facts,error:String(error),stack:error.stack},null,2)+'\n',{mode:0o600});throw error;}
finally{await env?.close();}
