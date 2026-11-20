// Actual legacy protocol-one compatibility; local recovery-admission flag is explicitly off.
import {registerHooks} from 'node:module';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
registerHooks({load(url,context,next){return next(url,url.endsWith('.json')?{...context,importAttributes:{type:'json'}}:context);}});
const {createWaveController}=await import('../../src/pirates/controller.js');
const {defenses}=await import('../../src/island/spots.js');
const helperRoot=process.env.MP_ECO_HELPER_ROOT
 ?pathToFileURL(process.env.MP_ECO_HELPER_ROOT.replace(/\/?$/,'/')):new URL('./',import.meta.url);
const {createApiClients}=await import(new URL('api-clients.mjs',helperRoot));
const {observe,admit}=await import(new URL('observer.mjs',helperRoot));
const {sourceEvidence,servedSourceEvidence}=await import(new URL('source.mjs',helperRoot));
const sourceCommit='64ee02b360d68836b2de9247121ab47dc6a3ecbf';
const runtimePath='/tmp/mp505-provider/runtime.json',output=process.env.MP_ECO_OUTPUT??'/tmp/next505-protocol-one';
const root=fileURLToPath(new URL('../../../',import.meta.url)),uid=()=>randomUUID().replaceAll('-','');
const digest=async()=>createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex');
const launcherPath=new URL('../../../backend/tools/authenticated_economy/protocol_one_api.py',import.meta.url);
const launcherHash=async()=>createHash('sha256').update(await readFile(launcherPath)).digest('hex');
const helperHashes=async()=>Object.fromEntries(await Promise.all(['api-clients.mjs','observer.mjs','runtime.mjs','source.mjs'].map(async name=>
 [name,createHash('sha256').update(await readFile(new URL(name,helperRoot))).digest('hex')])));
const beforeHash=await digest(),report={sourceCommit,scenario:'actual-provider-legacy-protocol-one',status:'running',startedAt:new Date().toISOString(),
 scenarioSha256:beforeHash,launcherSha256:await launcherHash(),helperHashesBefore:await helperHashes(),
 sourceBefore:sourceEvidence(sourceCommit,{checkoutRoot:root}),steps:[],configuration:{api:'http://127.0.0.1:58007',structureRecovery:false},limits:[
 'A separate actual production create_app API disables recovery admission as explicit legacy compatibility configuration; the primary API is unchanged.',
 'Real registered local provider users, real HTTP and unmodified production controller; no rendered browser claim.',
 'No stored clock, HP, seed, simulation outcome or authority is replaced. Actual elapsed finish timing is retained.',
 'Natural expiry is not claimed if its configured deadline is outside this bounded run.'
]};
let env,timer,controller;
const checked=(r,n=200)=>{assert.equal(r.status,n,JSON.stringify(r.data));return r.data;};
await mkdir(output,{recursive:true});
try{
 env=await createApiClients({labels:['protocol-one-owner','protocol-one-shared'],runtimePath,expectedCommit:sourceCommit});
 const [owner,shared]=env.clients;
 const request=async(client,path,{method='GET',body}={})=>{
  assert.ok(path.startsWith('/api/'));
  const r=await fetch('http://127.0.0.1:58007'+path,{method,redirect:'error',headers:{Authorization:'Bearer '+client.session.access_token,
   'X-Island-Economy-Version':'1',...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:r.status,data:await r.json()};
 };
 for(const c of env.clients){assert.equal(checked(await request(c,'/api/me')).id,c.actorId);checked(await request(c,'/api/games',{method:'POST',body:{actionUid:uid()}}));}
 const wallet=async c=>(await observe(`select balance::text as balance,(select count(*)::integer from public.wallet_transactions t where t.player_id=w.player_id) as entries
   from public.wallets w where player_id=$1::uuid`,[c.actorId],{runtimePath}))[0];
 for(const spot of ['cannon_1','cannon_2','cannon_3'])checked(await request(owner,'/api/island/build',{method:'POST',body:{spot,kind:'cannon',actionUid:uid()}}));
 const island=checked(await request(owner,'/api/island'));assert.equal(island.recoveryVersion,0);
 const pre=await wallet(owner),body={where:'own',waveProtocol:1,actionUid:uid()};
 const bells=await Promise.all([request(owner,'/api/waves/start',{method:'POST',body}),request(owner,'/api/waves/start',{method:'POST',body})]);
 const wave=checked(bells[0]);assert.equal(checked(bells[1]).waveId,wave.waveId);assert.equal(wave.waveProtocol,1);assert.equal(wave.recoveryVersion,0);
 const otherBell=await request(owner,'/api/waves/start',{method:'POST',body:{...body,actionUid:uid()}});checked(otherBell,409);assert.equal(otherBell.data.error.code,'wave_running');
 assert.equal(checked(await request(owner,'/api/waves/current?where=own&waveProtocol=1')).waveId,wave.waveId);
 const [row]=await observe('select starts_at,minimum_seconds,maximum_seconds from public.wave_runs where id=$1::uuid',[wave.waveId],{runtimePath});
 report.steps.push({name:'supported protocol-one same-UID bell race and different-UID refusal',wave,otherBell,canonicalTiming:row});
 let finishBody,finishReply;
 controller=createWaveController({world:{player:{position:{x:0,z:0}},place:()=> 'home_islet'},place:'home_islet',
  getDefenses:()=>defenses(island.spots),createRenderer:()=>null,createHud:()=>null,createEventArt:()=>null,loadAuto:()=>false,
  finishWave:async raw=>{finishBody={...raw,waveProtocol:1};finishReply=await request(owner,'/api/waves/finish',{method:'POST',body:finishBody});
   if(finishReply.status!==200)throw Object.assign(Error(finishReply.data.error.code),{code:finishReply.data.error.code,status:finishReply.status});return finishReply.data;}});
 assert.ok(controller.start(wave));timer=setInterval(()=>controller.update(.05),50);
 const deadline=Date.now()+180000;while(Date.now()<deadline&&finishReply?.status!==200)await new Promise(resolve=>setTimeout(resolve,100));
 assert.equal(finishReply?.status,200,'a real-time naturally derived legacy result must finish successfully');
 clearInterval(timer);const result=finishReply.data,after=await wallet(owner);
 assert.equal(BigInt(after.balance),BigInt(pre.balance)+BigInt(result.loot));
 assert.equal(after.entries,pre.entries+(result.loot>0?1:0));
 const repeat=checked(await request(owner,'/api/waves/finish',{method:'POST',body:finishBody}));assert.deepEqual(repeat,result);assert.deepEqual(await wallet(owner),after);
 const [participant]=await observe('select finished_at,survived,ships_sunk,loot,expired from public.wave_participants where wave_id=$1::uuid and player_id=$2::uuid',[wave.waveId,owner.actorId],{runtimePath});
 assert.ok(participant.finished_at);assert.equal(participant.survived,finishBody.survived);assert.equal(participant.ships_sunk,finishBody.shipsSunk);assert.equal(participant.loot,result.loot);assert.equal(participant.expired,false);
 assert.equal(checked(await request(owner,'/api/waves/current?where=own&waveProtocol=1')),null);
 report.steps.push({name:'natural controller result, canonical finish and exact immutable payout retry',finishBody,result,pre,after,participant,
  elapsedSinceStartSeconds:(Date.now()-Date.parse(wave.startsAt))/1000});
 await admit(shared.actorId,{coins:200,runtimePath});const sharedBefore=await wallet(shared);
 const refused=await request(shared,'/api/waves/start',{method:'POST',body:{where:'own',waveProtocol:1,actionUid:uid()}});
 checked(refused,409);assert.equal(refused.data.error.code,'client_update_required');assert.deepEqual(await wallet(shared),sharedBefore);
 assert.equal((await observe('select count(*)::integer as count from public.wave_runs where island_owner=$1::uuid',[shared.actorId],{runtimePath}))[0].count,0);
 report.steps.push({name:'shared admission still refuses legacy bell with no private payout fallback',refused,privateBefore:sharedBefore,privateAfter:await wallet(shared)});
 report.servedPrimarySources=servedSourceEvidence(env.runtime);report.status='passed';
}catch(error){report.status='failed';report.error=String(error);process.exitCode=1;}
finally{clearInterval(timer);controller?.dispose();await env?.close();report.finishedAt=new Date().toISOString();report.scenarioAfterSha256=await digest();
 if(report.scenarioAfterSha256!==beforeHash){report.status='failed';report.sourceFailure='Scenario changed during execution';process.exitCode=1;}
 report.launcherAfterSha256=await launcherHash();report.helperHashesAfter=await helperHashes();
 if(report.launcherAfterSha256!==report.launcherSha256||JSON.stringify(report.helperHashesAfter)!==JSON.stringify(report.helperHashesBefore)){
  report.status='failed';report.sourceFailure='Launcher or direct helper changed during execution';process.exitCode=1;}
 try{report.sourceAfter=sourceEvidence(sourceCommit,{checkoutRoot:root});}catch(error){report.status='failed';report.sourceFailure=String(error);process.exitCode=1;}
 await writeFile(output+'/protocol-one-result.json',JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({status:report.status,error:report.error??null,steps:report.steps.map(s=>s.name)}));
