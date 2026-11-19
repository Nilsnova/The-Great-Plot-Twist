// Actual registered-member research, demolition, succession and owner lifecycle boundaries.
// Fresh capital and saved island unlock are explicit setup, never earned gameplay evidence.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createApiClients} from './api-clients.mjs';
import {observe,install,admit} from './observer.mjs';
import {sourceEvidence,servedSourceEvidence} from './source.mjs';

const output=process.env.MP_ECO_OUTPUT??'/tmp/mp505-member-authority';
await mkdir(output,{recursive:false,mode:0o700});
const uid=()=>randomUUID().replaceAll('-','');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const context=e=>Object.fromEntries(['mode','version','islandOwner','runEpoch'].map(key=>[key,e[key]]));
const startedAt=new Date().toISOString();
const hashes=async()=>Object.fromEntries(await Promise.all(['member-authority.mjs','api-clients.mjs','observer.mjs','runtime.mjs','source.mjs','record-source.mjs',
 '../../../backend/tools/authenticated_economy/observe.py','../../../backend/tools/authenticated_economy/config.py',
 '../../../backend/tools/authenticated_economy/application.py','../../../backend/tools/authenticated_economy/worker.py']
 .map(async name=>[name,sha(await readFile(new URL(name,import.meta.url)))])));
const helpersBefore=await hashes();
let env,timer,heartbeatFlight,heartbeatFailure;
const sessions=new Map(),facts=[];
function check(reply,status,label){assert.equal(reply.status,status,label+': '+JSON.stringify(reply.data));return reply.data;}
function note(event,details={}){const row={event,at:new Date().toISOString(),...details};facts.push(row);console.log(JSON.stringify(row));}
const read=(statement,params=[])=>observe(statement,params);
async function account(accountId){
 const rows=await read('select balance_coins::text as balance,committed_coins::text as held,state,'
  +'(select coalesce(sum(balance_delta),0)::text from public.island_treasury_transactions where account_id=a.id) as ledger_balance,'
  +'(select coalesce(sum(committed_delta),0)::text from public.island_treasury_transactions where account_id=a.id) as ledger_held '
  +'from public.island_economy_accounts a where id=$1::uuid',[accountId]);
 assert.equal(rows.length,1);assert.equal(rows[0].balance,rows[0].ledger_balance);assert.equal(rows[0].held,rows[0].ledger_held);return rows[0];
}
async function stopHeartbeats(){clearInterval(timer);if(heartbeatFlight)await heartbeatFlight;if(heartbeatFailure)throw heartbeatFailure;}
try{
 env=await createApiClients({labels:['authority-owner','authority-member','authority-outsider']});
 const [owner,member,outsider]=env.clients,baseline=env.runtime.expectedCommit;
 const sourceBefore=sourceEvidence(baseline);
 const game=check(await owner.request('/api/games',{method:'POST',body:{actionUid:uid()}}),200,'Create');
 const code=game.game.code;
 await admit(owner.actorId,{coins:6000});
 await install('update public.islands set wave_best=20 where player_id=$1::uuid',[owner.actorId],
  'Explicit saved island-unlock fixture for research; no claim of naturally earned wave20');
 check(await member.request('/api/games/join',{method:'POST',body:{code,actionUid:uid()}}),200,'Join');
 let snapshot=check(await owner.request('/api/island'),200,'Shared read'),economy=context(snapshot.economy);
 for(const actor of [owner,member]){
  const attached=check(await actor.request('/api/island/session/attach',{method:'POST',body:{economy,sessionId:randomUUID(),expectedGeneration:'0',actionUid:uid()}}),200,'Attach');
  sessions.set(actor.actorId,{actor,...attached.session});
 }
 timer=setInterval(()=>{
  if(heartbeatFlight||heartbeatFailure)return;
  heartbeatFlight=Promise.all([...sessions.values()].map(async s=>check(await s.actor.request('/api/island/session/heartbeat',{method:'POST',body:{economy,sessionId:s.sessionId,connectionGeneration:s.connectionGeneration}}),200,'Heartbeat')))
   .catch(error=>{heartbeatFailure=error;}).finally(()=>{heartbeatFlight=null;});
 },5000);
 const walletsBefore=await read('select player_id::text,balance::text from public.wallets where player_id=any($1::uuid[]) order by player_id',[[owner.actorId,member.actorId,outsider.actorId]]);
 const captainBefore=check(await member.request('/api/captain'),200,'Personal Captain');
 const view=async actor=>check(await actor.request(actor===owner?'/api/island':'/api/island/visit/'+encodeURIComponent(code)),200,'Fresh snapshot');
 snapshot=await view(owner);
 const build=snapshot.quotes.build.find(q=>q.target.spot==='wall_1'&&q.available);assert.ok(build);
 check(await owner.request('/api/island/build',{method:'POST',body:{economy,actionUid:uid(),...build.intent}}),200,'Owner build');
 snapshot=await view(member);
 const demolition=snapshot.quotes.demolish.find(q=>q.target.spot==='wall_1'&&q.available);assert.ok(demolition);
 const beforeDemolition=await account(snapshot.economy.accountId);
 check(await member.request('/api/island/demolish',{method:'POST',body:{economy,actionUid:uid(),...demolition.intent}}),200,'Invited member demolition');
 const afterDemolition=await account(snapshot.economy.accountId);
 assert.equal(BigInt(afterDemolition.balance)-BigInt(beforeDemolition.balance),BigInt(demolition.intent.quotedCoins));
 note('member-demolished-owner-building-with-shared-refund',{quotedRefund:demolition.intent.quotedCoins,personalFunding:false});

 async function research(actor,tier,change=false,exclude=null){
  const current=await view(actor);
  const quote=current.quotes.research.find(q=>q.target.branch==='cannon'&&q.target.tier===tier&&q.target.change===change&&(exclude===null||q.target.choice!==exclude)&&q.available);
  assert.ok(quote,'Eligible research quote');
  const body={economy,actionUid:uid(),...quote.intent};
  const response=check(await actor.request('/api/island/research',{method:'POST',body}),200,'Research');
  return {body,response,choice:quote.target.choice};
 }
 const first=await research(owner,1);
 const second=await research(owner,2);
 const changed=await research(member,2,true,second.choice);
 assert.notEqual(changed.choice,second.choice);
 const afterResearch=await view(member);
 assert.equal(afterResearch.research.find(r=>r.branch==='cannon').choice2,changed.choice);
 note('invited-member-changed-owner-research-decision',{ownerChoice:second.choice,memberChoice:changed.choice,quotedCost:changed.body.quotedCoins,ownerApprovalRequired:false});

 const offered=afterResearch.quotes.build.find(q=>q.target.spot==='wall_2'&&q.available);assert.ok(offered);
 const valid={economy,actionUid:uid(),...offered.intent};
 const beforeRefusals=await account(afterResearch.economy.accountId);
 const outsiderRead=await outsider.request('/api/island/visit/'+encodeURIComponent(code));check(outsiderRead,403,'Outsider read');
 const outsiderWrite=await outsider.request('/api/island/build',{method:'POST',body:valid});check(outsiderWrite,403,'Outsider write');
 const forgedAccount=await member.request('/api/island/build',{method:'POST',body:{...valid,actionUid:uid(),economy:{...economy,accountId:randomUUID()}}});check(forgedAccount,422,'Forged account');
 const forgedEpoch=await member.request('/api/island/build',{method:'POST',body:{...valid,actionUid:uid(),economy:{...economy,runEpoch:randomUUID()}}});check(forgedEpoch,409,'Forged epoch');
 assert.deepEqual(await account(afterResearch.economy.accountId),beforeRefusals);
 note('nonmembers-and-forged-account-epoch-refused',{statuses:[outsiderRead.status,outsiderWrite.status,forgedAccount.status,forgedEpoch.status],treasuryUnchanged:true});

 const ownerSession=sessions.get(owner.actorId);
 check(await owner.request('/api/island/session/leave',{method:'POST',body:{economy,sessionId:ownerSession.sessionId,connectionGeneration:ownerSession.connectionGeneration,actionUid:uid()}}),200,'Owner controller leaves');
 sessions.delete(owner.actorId);
 const memberSession=sessions.get(member.actorId);
 const query=new URLSearchParams({islandOwner:economy.islandOwner,runEpoch:economy.runEpoch,sessionId:memberSession.sessionId,connectionGeneration:memberSession.connectionGeneration});
 const successor=check(await member.request('/api/island/session?'+query),200,'Successor metadata');
 assert.equal(successor.session.isController,true);assert.equal(successor.session.leaderId,member.actorId);
 check(await member.request('/api/island/session/settings',{method:'POST',body:{economy,sessionId:memberSession.sessionId,connectionGeneration:memberSession.connectionGeneration,actionUid:uid(),autoNext:false}}),200,'Successor settings');
 const deniedReset=await member.request('/api/island/fresh-start',{method:'POST',body:{economy,actionUid:uid(),confirmCode:code}});check(deniedReset,403,'Successor cannot reset');
 await stopHeartbeats();
 note('session-successor-kept-member-ownership',{controllerAndLeader:true,settingsStatus:200,resetStatus:deniedReset.status});

 const originalAccount=afterResearch.economy.accountId;
 const resetBody={economy,actionUid:uid(),confirmCode:code};
 const reset=check(await owner.request('/api/island/fresh-start',{method:'POST',body:resetBody}),200,'Owner reset');
 const resetRetry=check(await owner.request('/api/island/fresh-start',{method:'POST',body:resetBody}),200,'Reset retry');assert.equal(resetRetry.repeat,true);
 const replacement=await view(member);assert.notEqual(replacement.economy.accountId,originalAccount);assert.notEqual(replacement.economy.runEpoch,economy.runEpoch);
 assert.equal(replacement.economy.treasury.availableCoins,'200');
 const oldBeforeReplay=await account(originalAccount),newBeforeReplay=await account(replacement.economy.accountId);
 const oldRetry=check(await owner.request('/api/island/research',{method:'POST',body:first.body}),200,'Original research retry after reset');
 assert.equal(oldRetry.repeat,true);assert.deepEqual(oldRetry.receipt,first.response.receipt);
 assert.deepEqual(await account(originalAccount),oldBeforeReplay);assert.deepEqual(await account(replacement.economy.accountId),newBeforeReplay);
 assert.deepEqual(check(await member.request('/api/captain'),200,'Preserved Captain'),captainBefore);
 const grants=await read("select count(*)::int as count from public.island_treasury_transactions where account_id=$1::uuid and reason='starting_coins'",[replacement.economy.accountId]);assert.equal(grants[0].count,1);
 note('owner-reset-and-old-operation-isolation',{newBudget:'200',newGrantCount:1,changedEpoch:true,oldReceiptRetained:true,memberCaptainUnchanged:true});

 const confirmation=await owner.request('/api/me',{method:'DELETE',body:{confirm:true}});check(confirmation,409,'Owned island explicit confirmation');
 const existing=await read('select count(*)::int as count from public.islands where player_id=$1::uuid',[owner.actorId]);assert.equal(existing[0].count,1);
 check(await owner.request('/api/me',{method:'DELETE',body:{confirm:true,confirmOwnedIslandDeletion:true}}),200,'Confirmed owner deletion');
 const removed=await read('select (select count(*)::int from auth.users where id=$1::uuid) as auth_count,(select count(*)::int from public.profiles where id=$1::uuid) as profile_count,(select count(*)::int from public.islands where player_id=$1::uuid) as island_count',[owner.actorId]);
 assert.deepEqual(removed[0],{auth_count:0,profile_count:0,island_count:0});
 assert.deepEqual(check(await member.request('/api/captain'),200,'Continuing personal Captain'),captainBefore);
 const walletsAfter=await read('select player_id::text,balance::text from public.wallets where player_id=any($1::uuid[]) order by player_id',[[member.actorId,outsider.actorId]]);
 assert.deepEqual(walletsAfter,walletsBefore.filter(row=>row.player_id!==owner.actorId));
 const cachedOwner=await owner.request('/api/me');assert.ok([401,403,404].includes(cachedOwner.status));
 note('confirmed-owner-deletion-preserved-other-players',{initialConfirmationStatus:409,ownedIslandDeleted:true,authDeleted:true,memberCaptainUnchanged:true,continuingWalletsUnchanged:true,cachedOwnerStatus:cachedOwner.status});
 const helpersAfter=await hashes();assert.deepEqual(helpersAfter,helpersBefore);
 await writeFile(output+'/result.json',JSON.stringify({result:'passed',startedAt,finishedAt:new Date().toISOString(),productionSource:baseline,sourceBefore,sourceAfter:sourceEvidence(baseline),servedSourcesBefore:env.servedSources,servedSourcesAfter:servedSourceEvidence(env.runtime),helpersBefore,helpersAfter,facts,
  limitations:['API-only registered identities; no anonymous guest admission or rendered interaction is claimed.','Fresh6000capital and savedwave20 unlock are explicit setup; no history/clock/HP/outcome is edited.','Personal preservation checks use the actual initialized level1 profile; earned receipt/milestone preservation is a separate case.','No owner succession or automatic new owner is inferred.']},null,2)+'\n',{mode:0o600});
}catch(error){process.exitCode=1;await writeFile(output+'/failure.json',JSON.stringify({result:'failed',startedAt,finishedAt:new Date().toISOString(),helpersBefore,facts,error:String(error),stack:error.stack},null,2)+'\n',{mode:0o600});throw error;}
finally{clearInterval(timer);if(heartbeatFlight)await heartbeatFlight;await env?.close();}
