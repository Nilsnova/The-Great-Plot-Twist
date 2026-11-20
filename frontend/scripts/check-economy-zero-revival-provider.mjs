// Separate actual-provider zero-treasury revival: enemy damage, canonical reports and a real hold.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createPersonalPlayout} from './economy-personal-playout.mjs';
import {fetchSealedEvents} from '../src/pirates/wave-replay.js';
const arg=name=>{const n=process.argv.indexOf(name);return n<0?null:process.argv[n+1];};
const runtimePath=arg('--runtime'),output=arg('--output'),expectedCommit=arg('--expected-commit');
if(!runtimePath||!output||!/^[a-f0-9]{40}$/.test(expectedCommit??''))throw Error('Use --runtime LOCAL_JSON --output PRIVATE_DIRECTORY --expected-commit FULL_SHA.');
const helper=process.env.MP_ECO_API_HELPERS?pathToFileURL(process.env.MP_ECO_API_HELPERS):new URL('./authenticated-economy/api-clients.mjs',import.meta.url);
const observer=new URL('./observer.mjs',helper),sourceUrl=new URL('./source.mjs',helper),runtimeUrl=new URL('./runtime.mjs',helper);
const {createApiClients,requestApi}=await import(helper.href),{observe,admit}=await import(observer.href);
const {sourceEvidence,servedSourceEvidence}=await import(sourceUrl.href),{loadRuntime}=await import(runtimeUrl.href);
const runtime=await loadRuntime(runtimePath);assert.equal(runtime.expectedCommit,expectedCommit);
const root=fileURLToPath(new URL('../../',import.meta.url));sourceEvidence(expectedCommit,{checkoutRoot:root});
const sourceBefore=servedSourceEvidence(runtime),source=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const ownHashes=Object.fromEntries(await Promise.all(['check-economy-zero-revival-provider.mjs','economy-personal-playout.mjs','economy-personal-loader.mjs'].map(async file=>[file,sha(await readFile(new URL(file,import.meta.url)))])));
const helperUrls=[helper,observer,sourceUrl,runtimeUrl],helperHashes=Object.fromEntries(await Promise.all(helperUrls.map(async url=>[fileURLToPath(url).split('/').pop(),sha(await readFile(url))])));
await mkdir(output,{recursive:false,mode:0o700});const startedAt=new Date().toISOString(),facts=[],requests=[];let env;
const uid=()=>randomUUID().replaceAll('-',''),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),read=(sql,parameters=[])=>observe(sql,parameters,{runtimePath});
function note(event,detail={}){facts.push({event,at:new Date().toISOString(),...detail});console.log(JSON.stringify({event,...detail}));}
async function api(actor,path,{method='GET',body}={}){const answer=await requestApi(actor,path,{method,body}),url=new URL(path,'http://localhost');requests.push({actor:actor.label,path:url.pathname,queryKeys:[...url.searchParams.keys()],method,status:answer.status,errorCode:answer.data?.error?.code??null});return answer;}
async function ok(actor,path,options){const answer=await api(actor,path,options);assert.equal(answer.status,200,path.split('?')[0]+': '+(answer.data?.error?.code??'unexpected status'));return answer.data;}
try{
 env=await createApiClients({labels:['zero-revive-owner','zero-revive-member'],runtimePath,expectedCommit});const [owner,member]=env.clients;
 const game=await ok(owner,'/api/games',{method:'POST',body:{actionUid:uid()}}),code=game.game.code;
 const admitted=await admit(owner.actorId,{coins:0,runtimePath}),economy=Object.fromEntries(['mode','version','islandOwner','runEpoch'].map(key=>[key,admitted.currentEconomy[key]])),accountId=admitted.currentEconomy.accountId;
 await ok(member,'/api/games/join',{method:'POST',body:{code,actionUid:uid()}});
 const proofs=new Map();for(const actor of env.clients){const sessionId=randomUUID(),attached=await ok(actor,'/api/island/session/attach',{method:'POST',body:{economy,sessionId,expectedGeneration:'0',actionUid:uid()}});proofs.set(actor,{economy,sessionId,connectionGeneration:attached.session.connectionGeneration});}
 await ok(owner,'/api/island/session/settings',{method:'POST',body:{...proofs.get(owner),actionUid:uid(),countdownSeconds:0,autoNext:false}});
 const wave=await ok(owner,'/api/waves/start',{method:'POST',body:{...proofs.get(owner),where:'own',actionUid:uid(),waveProtocol:2}});
 const joined=await ok(member,'/api/waves/join',{method:'POST',body:{...proofs.get(member),waveId:wave.waveId,waveProtocol:2}});
 const actors=new Map([[wave.participantToken,owner],[joined.participantToken,member]]),play=createPersonalPlayout(wave);
 const money=async()=>({account:await read('select balance_coins::text as balance,committed_coins::text as held,revision::text,(select count(*)::int from public.island_treasury_transactions t where t.account_id=a.id) as transactions from public.island_economy_accounts a where id=$1::uuid',[accountId]),wallets:await read('select player_id,balance::text,(select count(*)::int from public.wallet_transactions t where t.player_id=w.player_id) as transactions from public.wallets w where player_id=any($1::uuid[]) order by player_id',[env.clients.map(actor=>actor.actorId)]),quota:await read('select paid_used from public.recovery_wave_states where wave_id=$1::uuid',[wave.waveId])});
 const before=await money();assert.equal(before.account[0].balance,'0');assert.equal(before.account[0].held,'0');assert.equal(before.quota[0].paid_used,0);
 let lastHeartbeat=0;
 async function pump(){
  if(Date.now()-lastHeartbeat>4000){for(const actor of env.clients)await ok(actor,'/api/island/session/heartbeat',{method:'POST',body:proofs.get(actor)});lastHeartbeat=Date.now();}
  const proof=proofs.get(owner);assert.equal(await fetchSealedEvents(play.replay,request=>{
   const query=new URLSearchParams({islandOwner:economy.islandOwner,runEpoch:economy.runEpoch,sessionId:proof.sessionId,connectionGeneration:proof.connectionGeneration,...Object.fromEntries(Object.entries(request).map(([key,value])=>[key,String(value)]))});return ok(owner,'/api/waves/'+wave.waveId+'/events?'+query);
  }),true);
  if(play.replay.sealedThroughTick>=play.driver.nextTick)play.advance(play.replay.sealedThroughTick);
  assert.equal(play.sim.done,false,'Natural attempt ended before a valid teammate revival');
  if(play.driver.nextTick===0)return null;
  const party=play.sim.state().party,standing=party.find(row=>!row.down&&!row.withdrawn);assert.ok(standing,'No standing helper remains');
  const reporter=actors.get(standing.id),captains=Object.fromEntries(party.filter(row=>!row.withdrawn).map(row=>[row.id,{hpUnits:Math.round(row.hp/row.maxHp*1000000),downAtTick:row.down?Math.round(row.downAt/.05):null,reviveBasisSeq:row.reviveBasisSeq}]));
  const report={...proofs.get(reporter),waveProtocol:2,checkpointUid:uid(),throughTick:play.driver.nextTick-1,inputHeadSeq:play.replay.headSeq,captains};
  const accepted=await ok(reporter,'/api/waves/'+wave.waveId+'/captains',{method:'POST',body:report});assert.equal(accepted.accepted,true);assert.equal(play.sim.bindCaptainFalls(accepted.captains,report.throughTick),true);
  return {party,standing,accepted};
 }
 const deadline=Date.now()+100000;let state,target;
 while(Date.now()<deadline){state=await pump();target=state?.party.find(row=>row.down);if(target)break;await wait(200);}
 assert.ok(target,'No genuine enemy-caused fall within the bounded attempt');const reviver=actors.get(state.standing.id),fallId=state.accepted.captains[target.id].fallId;assert.ok(fallId);
 note('enemy-caused-fall-at-zero-treasury',{battleSeconds:play.sim.result().time,reviver:reviver.label,target:actors.get(target.id).label,helperHpUnits:state.accepted.captains[state.standing.id].hpUnits,targetHpUnits:0,treasury:'0',paidUsed:0});
 const input=await ok(reviver,'/api/waves/'+wave.waveId+'/inputs',{method:'POST',body:{...proofs.get(reviver),waveProtocol:2,inputs:[{inputUid:uid(),actorCounter:1,tick:play.replay.sealedThroughTick+1,command:{type:'captain_revive_hold_start',targetId:target.id,fallId}}]}});
 const hold=input.accepted[0].payload.hold;assert.equal(hold.requiredMs,2000);
 const body={...proofs.get(reviver),actionUid:uid(),waveId:wave.waveId,targetToken:target.id,fallId,holdId:hold.holdId};
 const early=await api(reviver,'/api/island/revive',{method:'POST',body});assert.equal(early.status,409);assert.equal(early.data.error.code,'hold_incomplete');
 while(Date.now()<Date.parse(hold.startedAt)+hold.requiredMs+80){await pump();await wait(120);}
 await pump();const revived=await ok(reviver,'/api/island/revive',{method:'POST',body});assert.equal(revived.receipt.result.restoredHPUnits,500000);
 const repeat=await ok(reviver,'/api/island/revive',{method:'POST',body});assert.equal(repeat.repeat,true);assert.deepEqual(repeat.receipt,revived.receipt);
 assert.deepEqual(await money(),before);
 const journal=await read("select count(*)::int as count from public.recovery_wave_events where wave_id=$1::uuid and event_kind='captain_revive'",[wave.waveId]);assert.equal(journal[0].count,1);
 const targetState=await read('select down,hp_units,revive_basis_seq from public.shared_session_slots where wave_id=$1::uuid and participant_token=$2::uuid',[wave.waveId,target.id]);assert.equal(targetState[0].down,false);assert.equal(targetState[0].hp_units,500000);assert.equal(String(targetState[0].revive_basis_seq),String(revived.receipt.result.eventSeq));
 note('real-two-second-free-revival-at-zero',{requiredMs:hold.requiredMs,earlyStatus:early.status,restoredHPUnits:500000,journalEvents:1,sameReceiptRetry:true,treasuryBeforeAfter:'0',allMoneyAndQuotaFactsUnchanged:true,paidUsed:0});
 const sourceAfter=servedSourceEvidence(runtime);for(const url of helperUrls)assert.equal(sha(await readFile(url)),helperHashes[fileURLToPath(url).split('/').pop()]);
 await writeFile(output+'/result.json',JSON.stringify({result:'passed',source,expectedCommit,ownHashes,helperHashes,sourceBefore,sourceAfter,startedAt,finishedAt:new Date().toISOString(),facts,requests,accounting:before,limitations:['API/headless actual-provider case; no rendered hold is claimed.','Only zero-capital fresh island admission is a setup fixture; no HP, fall, outcome, input journal, hold timestamp or clock was fabricated.','Captain reports are computed from unchanged production simulation over complete actual server-sealed prefixes, under its existing client-report trust contract.','Private wallets retain their normal starting balances and are independently unchanged; zero-private-wallet eligibility is not claimed.','No product/helper/schema change, hosted migration, conversion, deployment or activation.']},null,2)+'\n',{mode:0o600});
}catch(error){await writeFile(output+'/failure.json',JSON.stringify({result:'failed',source,expectedCommit,ownHashes,helperHashes,sourceBefore,startedAt,finishedAt:new Date().toISOString(),failure:{name:error.name,message:error.message,stack:error.stack},facts,requests},null,2)+'\n',{mode:0o600});throw error;}
finally{await env?.close();}
