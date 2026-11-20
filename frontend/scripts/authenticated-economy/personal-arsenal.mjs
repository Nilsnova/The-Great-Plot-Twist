// Bounded real-provider personal/arsenal checks with explicitly seeded earned-state preconditions.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {createClients,api,land,capture,loadRuntime} from './clients.mjs';
import {observe,install,admit} from './observer.mjs';
import {sourceEvidence} from './source.mjs';

const output=process.env.MP_ECO_OUTPUT??'/tmp/mp505-personal-arsenal';
const rendered=process.env.MP_ECO_RENDERED==='1';
const source=(await loadRuntime(process.env.MP_ECO_RUNTIME)).expectedCommit;
const uid=()=>randomUUID().replaceAll('-','');
const context=e=>Object.fromEntries(['mode','version','islandOwner','runEpoch'].map(k=>[k,e[k]]));
const root=fileURLToPath(new URL('../../../',import.meta.url));
const helperFiles=['frontend/scripts/authenticated-economy/personal-arsenal.mjs','frontend/scripts/authenticated-economy/clients.mjs',
 'frontend/scripts/authenticated-economy/runtime.mjs','frontend/scripts/authenticated-economy/observer.mjs','frontend/scripts/authenticated-economy/source.mjs',
 'backend/tools/authenticated_economy/observe.py','backend/tools/authenticated_economy/config.py'];
const hashes=()=>Object.fromEntries(helperFiles.map(path=>[path,createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex')]));
const report={productionSource:source,
 harnessSha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),
 helperHashesBefore:hashes(),
 sourceBefore:sourceEvidence(source),
 setup:'Real Auth identities and production game/session create/join. Explicit fresh treasury admission of 200. Only earned Captain level/points and island best-wave preconditions are installed as labeled test state; no claim that those milestones were naturally earned.',
 assertions:[],boundaries:['Authenticated transport assertions do not prove every rendered interaction, earned progression, captured-generation delayed completion, frozen combat loadouts or autonomous grace cleanup.']};
await mkdir(output,{recursive:true});let env;
function record(name,detail){report.assertions.push({name,...detail});console.log(name);}
try{
 env=await createClients({labels:['arsenal-owner','arsenal-member']});const [owner,member]=env.clients;
 console.log('Actual Auth pair ready');
 if(rendered)await land(owner.page,{create:true});else assert.equal((await api(owner.page,'/api/games',{method:'POST',body:{actionUid:uid()}})).status,200);
 const own=await api(owner.page,'/api/island');assert.equal(own.status,200);
 await admit(owner.actorId,{coins:200});
 if(rendered){await owner.page.reload({waitUntil:'domcontentloaded'});await land(owner.page);await land(member.page,{join:own.data.code});}
 else{
  assert.equal((await api(member.page,'/api/games/join',{method:'POST',body:{code:own.data.code,actionUid:uid()}})).status,200);
  const current=await api(owner.page,'/api/island');
  for(const client of [owner,member])assert.equal((await api(client.page,'/api/island/session/attach',{method:'POST',body:{economy:context(current.data.economy),sessionId:randomUUID(),expectedGeneration:'0',actionUid:uid()}})).status,200);
 }
 const view=()=>api(member.page,'/api/island/visit/'+encodeURIComponent(own.data.code));
 let snapshot=await view();for(let n=0;n<20&&!snapshot.data.personalCaptain;n++){await member.page.waitForTimeout(500);snapshot=await view();}
 assert.ok(snapshot.data.personalCaptain);
 const wallets=await observe('select player_id,balance from public.wallets where player_id=any($1::uuid[]) order by player_id',[env.clients.map(c=>c.actorId)]);
 await install('update public.personal_captain_profiles set level=5,won_wave_best=20,earned_points=10 where player_id=$1::uuid',[member.actorId],
  'Explicit advanced earned-profile fixture for role eligibility; not evidence of earned milestones');
 let profile=await api(member.page,'/api/captain');assert.equal(profile.status,200);
 const role=await api(member.page,'/api/captain/role',{method:'POST',body:{progressionVersion:1,expectedRevision:profile.data.captain.revision,actionUid:uid(),role:'engineer'}});assert.equal(role.status,200);
 snapshot=await view();assert.equal(snapshot.data.economy.treasury.availableCoins,'200');
 const commitments=[];
 for(const spot of ['wall_1','wall_2']){
  snapshot=await view();const quote=snapshot.data.quotes.build.find(q=>q.target.spot===spot&&q.available);assert.ok(quote);assert.equal(quote.intent.quotedCoins,'9');
  const built=await api(member.page,'/api/island/build',{method:'POST',body:{economy:context(snapshot.data.economy),actionUid:uid(),...quote.intent}});assert.equal(built.status,200);
  profile=await api(member.page,'/api/captain');commitments.push(profile.data.captain.engineerCommitment.id);
 }
 assert.equal(commitments[0],commitments[1]);
 profile=await api(member.page,'/api/captain');
 const blocked=await api(member.page,'/api/captain/role',{method:'POST',body:{progressionVersion:1,expectedRevision:profile.data.captain.revision,actionUid:uid(),role:'gunner'}});assert.equal(blocked.status,409);
 const respec=await api(member.page,'/api/captain/respec',{method:'POST',body:{progressionVersion:1,expectedRevision:profile.data.captain.revision,actionUid:uid()}});assert.equal(respec.status,200);assert.equal(respec.data.captain.role,'engineer');assert.equal(respec.data.captain.engineerCommitment.id,commitments[0]);
 const legacyRole=await api(member.page,'/api/island/role',{method:'POST',body:{role:'gunner'}});assert.equal(legacyRole.status,409);
 snapshot=await view();assert.equal(snapshot.data.economy.treasury.availableCoins,'182');
 record('free-engineer-role-respec-and-shared-discount-commitment',{layer:'authenticated transport',fixture:'Captain eligibility only',discountedPrices:['9','9'],commitmentId:commitments[0],roleRefused:blocked.status,legacyRoleRefused:legacyRole.status,availableCoins:'182'});
 const economy=context(snapshot.data.economy);
 const locked=await api(member.page,'/api/island/arsenal/buy',{method:'POST',body:{economy,actionUid:uid(),weapon:'pistols'}});assert.equal(locked.status,409);
 await install('update public.islands set wave_best=10 where player_id=$1::uuid',[owner.actorId],
  'Explicit saved island-unlock fixture, independent of the member personal Captain milestone fixture');
 let arsenal=await api(member.page,'/api/island/arsenal?code='+encodeURIComponent(own.data.code));assert.equal(arsenal.status,200);assert.equal(arsenal.data.unlockWave,10);
 const buyBody={economy,actionUid:uid(),weapon:'pistols'};
 const bought=await api(member.page,'/api/island/arsenal/buy',{method:'POST',body:buyBody});assert.equal(bought.status,200);
 const buyReplay=await api(member.page,'/api/island/arsenal/buy',{method:'POST',body:buyBody});assert.equal(buyReplay.status,200);
 arsenal=await api(member.page,'/api/island/arsenal?code='+encodeURIComponent(own.data.code));assert.equal(arsenal.data.total,1);assert.equal(arsenal.data.capacity,20);
 let copy=arsenal.data.copies[0];
 // Return a buy-carried copy so two actual members compete for one saved identity.
 if(copy.holder){const back=await api(member.page,'/api/island/arsenal/return',{method:'POST',body:{economy,actionUid:uid(),copy:copy.id,holderGeneration:copy.holderGeneration}});assert.equal(back.status,200);arsenal=await api(member.page,'/api/island/arsenal?code='+encodeURIComponent(own.data.code));copy=arsenal.data.copies[0];}
 const take={economy,copy:copy.id,holderGeneration:copy.holderGeneration};
 const raced=await Promise.all(env.clients.map(c=>api(c.page,'/api/island/arsenal/take',{method:'POST',body:{...take,actionUid:uid()}})));assert.deepEqual(raced.map(r=>r.status).sort(),[200,409]);
 const winner=env.clients[raced.findIndex(r=>r.status===200)];
 const state=await api(winner.page,'/api/island/arsenal?code='+encodeURIComponent(own.data.code));copy=state.data.copies[0];assert.equal(copy.holder,winner.actorId);assert.equal(state.data.total,1);
 const stale=await api(winner.page,'/api/island/arsenal/return',{method:'POST',body:{economy,actionUid:uid(),copy:copy.id,holderGeneration:take.holderGeneration}});assert.equal(stale.status,409);
 const current=await api(winner.page,'/api/island/arsenal?code='+encodeURIComponent(own.data.code));assert.equal(current.data.copies[0].holder,winner.actorId);assert.equal(current.data.total,1);
 if(rendered){await member.page.evaluate(()=>window.__island.island.pick('island_arsenal'));await member.page.waitForTimeout(1200);await capture(member.page,output,'shared-arsenal-after-race');}
 record('island-unlock-exact-buy-exclusive-copy-and-stale-tenure',{layer:rendered?'authenticated transport and rendered inventory':'authenticated transport',fixture:'Island unlock only',lockedStatus:locked.status,buyReplayStatus:buyReplay.status,capacity:20,total:1,raceStatuses:raced.map(r=>r.status),holderGeneration:copy.holderGeneration,staleReturn:stale.status,availableCoins:'122'});
 assert.equal((await view()).data.economy.treasury.availableCoins,'122');
 const after=await observe('select player_id,balance from public.wallets where player_id=any($1::uuid[]) order by player_id',[env.clients.map(c=>c.actorId)]);assert.deepEqual(after,wallets);
 report.walletsBefore=wallets;report.walletsAfter=after;report.status='passed';
}catch(error){report.status='failed';report.failure={name:error.name,message:error.message,stack:error.stack};process.exitCode=1;if(env)for(const c of env.clients)await capture(c.page,output,'failure-'+c.label).catch(()=>{});}
finally{if(env)await env.close();report.helperHashesAfter=hashes();report.helpersUnchanged=JSON.stringify(report.helperHashesAfter)===JSON.stringify(report.helperHashesBefore);try{report.sourceAfter=sourceEvidence(source);}catch{report.helpersUnchanged=false;}if(!report.helpersUnchanged){report.status='failed';report.helperFailure='Source changed during the run';process.exitCode=1;}await writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({status:report.status,assertions:report.assertions.length,report:output+'/report.json',failure:report.failure?.message}));
