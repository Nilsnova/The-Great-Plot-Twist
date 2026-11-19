// Real-provider repair quota acceptance. All state installation is declared setup.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {runFullRepairQuotaAcceptance} from './paid-repair.mjs';

const BASELINE='64ee02b360d68836b2de9247121ab47dc6a3ecbf';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const helpers=resolve(process.env.MP_ECO_HELPERS_ROOT??fileURLToPath(new URL('./',import.meta.url)));
const helperRoot=resolve(helpers,'../../..');
const {createClients,api,land,loadRuntime}=await import(pathToFileURL(resolve(helpers,'clients.mjs')));
const {observe,install,admit}=await import(pathToFileURL(resolve(helpers,'observer.mjs')));
const {sourceEvidence,servedSourceEvidence}=await import(pathToFileURL(resolve(helpers,'source.mjs')));
const runtimePath=process.env.MP_ECO_RUNTIME??'/tmp/mp505-provider/runtime.json';
const output=process.env.MP_ECO_OUTPUT??'/tmp/mp505-full-repair-quota';
const runtime=await loadRuntime(runtimePath);
assert.equal(runtime.expectedCommit,BASELINE,'the provider must declare this exact current candidate');
const context=e=>Object.fromEntries(['mode','version','islandOwner','runEpoch'].map(key=>[key,e[key]]));
const uid=()=>randomUUID().replaceAll('-','');
const digest=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const helperPaths=['clients.mjs','runtime.mjs','observer.mjs','source.mjs'];
const hashes=()=>Object.fromEntries([
  ...helperPaths.map(path=>['frontend/scripts/authenticated-economy/'+path,digest(resolve(helpers,path))]),
  ...['config.py','observe.py','application.py','stack.py','__init__.py','provider_roles.sql'].map(path=>['backend/tools/authenticated_economy/'+path,
    digest(resolve(helperRoot,'backend/tools/authenticated_economy',path))]),
]);
const report={productionSource:BASELINE,scenario:'complete-shared-repair-quota',status:'running',
  driverSha256:digest(fileURLToPath(import.meta.url)),repairScenarioSha256:digest(resolve(root,'frontend/scripts/authenticated-economy/paid-repair.mjs')),
  helperHashesBefore:hashes(),sourceBefore:sourceEvidence(BASELINE,{checkoutRoot:helperRoot}),
  servedSourceBefore:servedSourceEvidence(runtime),
  scenarioSourceBefore:sourceEvidence(BASELINE,{checkoutRoot:root}),setup:[],boundaries:[
    'This extends broader authenticated acceptance; it does not turn the earlier bounded T60 evidence into a failed requirement.',
    'Advanced saved unlocks, personal earned eligibility and the 2000-coin test treasury are explicit fixtures, not evidence of naturally earned progression or balance.',
    'Every wall and level upgrade is bought through an actual current authenticated HTTP quote; no direct structure/HP/journal/clock/outcome installation.',
  ]};
const migrationManifestPath=resolve(runtime.directory,'migrations.json');
const migrationManifest=JSON.parse(readFileSync(migrationManifestPath,'utf8'));
assert.equal(migrationManifest.migrationCount,108);
for(const file of migrationManifest.files)assert.equal(digest(resolve(root,'supabase/migrations',file.name)),file.sha256);
report.providerMigrations={count:108,manifestSha256:digest(migrationManifestPath),files:migrationManifest.files};
const loaded={createClients,api,land,loadRuntime,observe,install,admit,sourceEvidence,servedSourceEvidence};
report.loadedExportFunctionSha256=Object.fromEntries(Object.entries(loaded).map(([key,fn])=>[key,createHash('sha256').update(fn.toString()).digest('hex')]));
await mkdir(output,{recursive:true});
const save=()=>writeFile(resolve(output,'driver-report.json'),`${JSON.stringify(report,null,2)}\n`);
let ownerEnv,memberEnv;
async function checked(page,path,body){const result=await api(page,path,{method:'POST',body});assert.equal(result.status,200,JSON.stringify(result));return result;}
try {
  // Each invocation launches its own Chromium process, preventing cross-player focus ownership.
  ownerEnv=await createClients({labels:['quota-owner'],runtimePath,expectedCommit:BASELINE,independentBrowsers:true});
  memberEnv=await createClients({labels:['quota-member'],runtimePath,expectedCommit:BASELINE,independentBrowsers:true});
  const owner=ownerEnv.clients[0],member=memberEnv.clients[0];
  assert.notEqual(owner.context.browser(),member.context.browser());report.distinctBrowserObjects=true;
  await checked(owner.page,'/api/games',{actionUid:uid()});
  const own=await api(owner.page,'/api/island');assert.equal(own.status,200);const code=own.data.code;
  await admit(owner.actorId,{coins:2000,runtimePath});
  await checked(member.page,'/api/games/join',{code,actionUid:uid()});
  await land(owner.page);await land(member.page,{join:code});
  for(const client of [owner,member])await client.page.waitForFunction(()=>!!window.__island?.island.session.proof(),null,{timeout:30000});
  await install('update public.islands set wave_best=20,next_wave=1 where player_id=$1::uuid',[owner.actorId],
    'Explicit saved island unlock/repeat-wave fixture for paid-quota coverage; no combat, HP, outcome or clock is supplied',{runtimePath});
  await install('update public.personal_captain_profiles set level=5,won_wave_best=20,earned_points=10 where player_id=any($1::uuid[])',[[owner.actorId,member.actorId]],
    'Explicit advanced earned-profile eligibility fixture; no claim that these personal milestones were naturally earned',{runtimePath});
  report.setup.push({name:'declared saved-state prerequisites',treasuryGrant:'2000',islandWaveBest:20,nextPlayedWave:1,
    personalCaptainLevel:5,personalWonWaveBest:20,personalEarnedPoints:10,actors:[owner.actorId,member.actorId],code});
  const purchases=[];
  for(const spot of ['wall_1','wall_2','wall_3','wall_4','wall_5','wall_6'])for(let level=1;level<=3;level++){
    const view=await api(owner.page,'/api/island');assert.equal(view.status,200);
    const kind=level===1?'build':'upgrade',quote=view.data.quotes[kind].find(row=>row.target.spot===spot&&row.available);
    assert.ok(quote,`A real current level-${level} ${spot} quote is required`);
    const body={economy:context(view.data.economy),actionUid:uid(),...quote.intent};
    const result=await checked(owner.page,'/api/island/'+kind,body);
    purchases.push({spot,level,request:body,receipt:result.data.receipt});
  }
  report.setup.push({name:'ordinary quoted defense purchases',description:'Six level-three shore walls retain enough ordinary combat time for the complete quota journey.',purchases});
  for(const client of [owner,member])await client.page.evaluate(async()=>await window.__island.island.load());
  const current=await api(owner.page,'/api/island');assert.equal(current.status,200);
  for(const spot of ['wall_1','wall_2','wall_3','wall_4','wall_5','wall_6'])assert.equal(current.data.spots.find(row=>row.id===spot).level,3);
  report.walletsBefore=await observe('select player_id,balance from public.wallets where player_id=any($1::uuid[]) order by player_id',[[owner.actorId,member.actorId]],{runtimePath});
  await save();console.log('Declared real-provider defense setup is ready');
  report.result=await runFullRepairQuotaAcceptance({ownerPage:owner.page,memberPage:member.page,
    api,observe:(sql,params)=>observe(sql,params,{runtimePath}),outputDir:output,sourceCommit:BASELINE,
    setup:report.setup,spots:['wall_1','wall_2','wall_3','wall_4','wall_5','wall_6'],
    reconnectMember:async page=>{await page.reload();await land(page,{join:code});}});
  report.walletsAfter=await observe('select player_id,balance from public.wallets where player_id=any($1::uuid[]) order by player_id',[[owner.actorId,member.actorId]],{runtimePath});
  assert.deepEqual(report.walletsAfter,report.walletsBefore);report.status='passed';
}catch(error){report.status='failed';report.failure={name:error.name,message:error.message,stack:error.stack};process.exitCode=1;
  for(const [label,env] of [['owner',ownerEnv],['member',memberEnv]])if(env)await env.clients[0].page.screenshot({path:resolve(output,'failure-'+label+'.png')}).catch(()=>{});
}finally{
  await ownerEnv?.close();await memberEnv?.close();
  report.helperHashesAfter=hashes();report.helpersUnchanged=JSON.stringify(report.helperHashesBefore)===JSON.stringify(report.helperHashesAfter);
  try{report.sourceAfter=sourceEvidence(BASELINE,{checkoutRoot:helperRoot});report.scenarioSourceAfter=sourceEvidence(BASELINE,{checkoutRoot:root});report.servedSourceAfter=servedSourceEvidence(runtime);
    assert.equal(digest(migrationManifestPath),report.providerMigrations.manifestSha256);}
  catch(error){report.status='failed';report.sourceFailure=error.message;process.exitCode=1;}
  if(!report.helpersUnchanged){report.status='failed';report.helperFailure='A frozen helper changed during observation';process.exitCode=1;}
  await save();
}
console.log(JSON.stringify({status:report.status,report:resolve(output,'driver-report.json'),failure:report.failure?.message}));
