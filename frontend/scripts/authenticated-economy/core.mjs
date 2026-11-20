// Bounded authenticated-provider acceptance. All mutations use real production HTTP/UI.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createClients,api,land,capture,loadRuntime} from './clients.mjs';
import {observe,admit} from './observer.mjs';
import {checkPrivateRealtime} from './private-realtime.mjs';
import {sourceEvidence} from './source.mjs';

const output=process.env.MP_ECO_OUTPUT??'/tmp/mp505-core';
const rendered=process.env.MP_ECO_RENDERED==='1';
const source=(await loadRuntime(process.env.MP_ECO_RUNTIME)).expectedCommit;
const uid=()=>randomUUID().replaceAll('-','');
const context=economy=>Object.fromEntries(['mode','version','islandOwner','runEpoch'].map(key=>[key,economy[key]]));
const root=fileURLToPath(new URL('../../../',import.meta.url));
const helperFiles=['frontend/scripts/authenticated-economy/core.mjs','frontend/scripts/authenticated-economy/clients.mjs',
 'frontend/scripts/authenticated-economy/runtime.mjs','frontend/scripts/authenticated-economy/observer.mjs',
 'frontend/scripts/authenticated-economy/private-realtime.mjs','frontend/scripts/authenticated-economy/source.mjs','backend/tools/authenticated_economy/observe.py',
 'backend/tools/authenticated_economy/config.py'];
const hashes=()=>Object.fromEntries(helperFiles.map(path=>[path,createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex')]));
const report={sourceCommit:source,harnessSha256:createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),
 helperHashesBefore:hashes(),
 sourceBefore:sourceEvidence(source),
 setup:'Fresh real GoTrue accounts; production game creation/join and session attachment; explicit service-only fresh admission with a 30-coin last-funds fixture instead of the configured 200. No later balance/damage/time/outcome overrides.',
 provider:'Official GoTrue, PostgREST and Realtime with PostgreSQL 17 Alpine; no hosted operations.',
 assertions:[],boundaries:['Transport assertions are identified separately from rendered product actions. This bounded run does not complete the fifteen-scenario matrix.']};
await mkdir(output,{recursive:true});
let env;
function check(name,details){report.assertions.push({name,...details});console.log(name);}
async function dismiss(page){
 for(let attempt=0;attempt<4;attempt++){
  const got=page.locator('.goal-card[open]').getByRole('button',{name:'Got it',exact:true});
  if(await got.count())await got.click();
  const skip=page.getByRole('button',{name:'Skip',exact:true});
  if(await skip.count())await skip.first().click().catch(()=>{});
  await page.waitForTimeout(150);
 }
}
try{
 env=await createClients({labels:['core-owner','core-member','core-outsider']});
 const [owner,member,outsider]=env.clients;
 console.log('Actual Auth triplet ready');
 if(rendered)await land(owner.page,{create:true});
 else assert.equal((await api(owner.page,'/api/games',{method:'POST',body:{actionUid:uid()}})).status,200);
 let own=await api(owner.page,'/api/island');assert.equal(own.status,200);
 const code=own.data.code;
 await admit(owner.actorId,{coins:30});
 if(rendered){await owner.page.reload({waitUntil:'domcontentloaded'});await land(owner.page);await land(member.page,{join:code});}
 else {
  assert.equal((await api(member.page,'/api/games/join',{method:'POST',body:{code,actionUid:uid()}})).status,200);
  const current=await api(owner.page,'/api/island');
  for(const client of [owner,member])assert.equal((await api(client.page,'/api/island/session/attach',{method:'POST',body:{economy:context(current.data.economy),sessionId:randomUUID(),expectedGeneration:'0',actionUid:uid()}})).status,200);
 }
 const view=()=>api(member.page,'/api/island/visit/'+encodeURIComponent(code));
 let snapshot=await view();
 for(let attempt=0;attempt<10&&!snapshot.data.personalCaptain;attempt++){await member.page.waitForTimeout(500);snapshot=await view();}
 report.initialSnapshot=snapshot.data;assert.equal(snapshot.status,200);assert.equal(snapshot.data.economy.treasury.availableCoins,'30');
 check('actual-authenticated-pair-and-shared-entry',{layer:rendered?'rendered product':'authenticated transport setup',actors:env.clients.map(({label,actorId})=>({label,actorId})),code});
 try {
  const metadata=await api(member.page,'/api/island/session?islandOwner='+snapshot.data.economy.islandOwner+'&runEpoch='+snapshot.data.economy.runEpoch);assert.equal(metadata.status,200);
  const topic='live:place:'+metadata.data.session.place+':'+metadata.data.session.topicGeneration;
  const realtime=await checkPrivateRealtime({ownerPage:owner.page,memberPage:member.page,outsiderPage:outsider.page,runtime:env.runtime,topic,accessTokens:env.clients.map(client=>client.session.access_token)});
  check('real-private-realtime-membership-and-broadcast',{layer:'actual provider SDK/WebSocket',...realtime});
 }catch(error){report.realtimeFailure=error.message;console.log('Private Realtime probe failed independently; continuing financial transport assertions');}
 const initialWallets=await observe('select player_id,balance from public.wallets where player_id=any($1::uuid[]) order by player_id',[env.clients.map(c=>c.actorId)]);
 const old=await api(owner.page,'/api/island',{capability:null});assert.equal(old.status,409);
 const unknown=await api(owner.page,'/api/island',{capability:'999'});assert.equal(unknown.status,409);
 const offered=snapshot.data.quotes.build.find(q=>q.target.spot==='wall_1'&&q.available);assert.ok(offered);
 const body={economy:context(snapshot.data.economy),actionUid:uid(),...offered.intent};
 const oldWrite=await api(owner.page,'/api/island/build',{method:'POST',body,capability:null});assert.equal(oldWrite.status,409);
 const missingEpoch=await api(owner.page,'/api/island/build',{method:'POST',body:{...body,economy:{...body.economy,runEpoch:undefined}}});assert.equal(missingEpoch.status,422);
 const denied=await api(outsider.page,'/api/island/build',{method:'POST',body});assert.equal(denied.status,403);
 const forged=await api(member.page,'/api/island/build',{method:'POST',body:{...body,actorId:owner.actorId}});assert.equal(forged.status,422);
 check('old-client-and-forged-member-boundaries',{layer:'authenticated transport',statuses:{oldRead:old.status,unsupportedRead:unknown.status,oldWrite:oldWrite.status,missingEpoch:missingEpoch.status,outsider:denied.status,forgedActor:forged.status}});

 let acceptedBody=body,displayed=null;
 if(rendered){
  await dismiss(member.page);await member.page.evaluate(()=>window.__island.island.pick('wall_1'));
  const card=member.page.locator('.island-card[open]');await card.getByRole('button',{name:/^Build ·/}).waitFor({state:'visible'});
  displayed=await card.innerText();assert.match(displayed,/island treasury/i);assert.match(displayed,/10/);
  const request=member.page.waitForResponse(r=>r.url().endsWith('/api/island/build')&&r.request().method()==='POST');
  await card.getByRole('button',{name:/^Build ·/}).click({noWaitAfter:true});
  const response=await request;assert.equal(response.status(),200);acceptedBody=response.request().postDataJSON();
 }else assert.equal((await api(member.page,'/api/island/build',{method:'POST',body:acceptedBody})).status,200);
 snapshot=await view();assert.equal(snapshot.data.economy.treasury.availableCoins,'20');
 assert.equal(snapshot.data.spots.find(s=>s.id==='wall_1').built,true);
 if(rendered)await capture(member.page,output,'member-quoted-build');
 check('invited-member-exact-quoted-build',{layer:rendered?'rendered product':'authenticated transport',request:acceptedBody,availableCoins:'20',cardText:displayed});
 const replay=await api(member.page,'/api/island/build',{method:'POST',body:acceptedBody});assert.equal(replay.status,200);
 const changed=await api(member.page,'/api/island/build',{method:'POST',body:{...acceptedBody,quotedCoins:'11'}});assert.equal(changed.status,409);
 assert.equal((await view()).data.economy.treasury.availableCoins,'20');
 check('exact-request-retry-and-changed-replay',{layer:'authenticated transport',statuses:{same:replay.status,changed:changed.status},availableCoins:'20'});

 const profile=await api(member.page,'/api/captain');assert.equal(profile.status,200);
 const free=await api(member.page,'/api/captain/respec',{method:'POST',body:{progressionVersion:1,expectedRevision:profile.data.captain.revision,actionUid:uid()}});assert.equal(free.status,200);
 assert.equal((await view()).data.economy.treasury.availableCoins,'20');
 check('free-personal-respec',{layer:'authenticated transport',profile:free.data,availableCoins:'20'});
 const retired=await api(member.page,'/api/island/hire',{method:'POST',body:{economy:context(snapshot.data.economy),actionUid:uid(),crew:'carpenter'}});assert.equal(retired.status,409);
 check('carpenter-new-purchase-retired',{layer:'authenticated transport',status:retired.status,error:retired.data});

 // Three independently quoted actions compete for two affordable wall purchases.
 const ownerView=await api(owner.page,'/api/island');
 const quotes=snapshot.data.quotes.build.filter(q=>q.available&&q.target.spot!=='wall_1'&&q.target.kind==='wall').slice(0,3);
 assert.equal(quotes.length,3);
 const raced=await Promise.all(quotes.map((quote,index)=>api(index%2?owner.page:member.page,'/api/island/build',{method:'POST',body:{economy:context(ownerView.data.economy),actionUid:uid(),...quote.intent}})));
 assert.deepEqual(raced.map(r=>r.status).sort(),[200,200,409]);
 snapshot=await view();assert.equal(snapshot.data.economy.treasury.availableCoins,'0');
 check('concurrent-last-coins-across-two-real-members',{layer:'authenticated transport',statuses:raced.map(r=>r.status),availableCoins:'0',limit:'Construction-versus-construction only; purchase/wager/repair cross-domain race remains separate.'});
 const account=snapshot.data.economy.accountId;
 const ledger=await observe('select balance_coins,committed_coins,revision,(select coalesce(sum(balance_delta),0) from public.island_treasury_transactions t where t.account_id=a.id) as summed_balance_delta,(select coalesce(sum(committed_delta),0) from public.island_treasury_transactions t where t.account_id=a.id) as summed_committed_delta from public.island_economy_accounts a where id=$1::uuid',[account]);
 assert.equal(ledger[0].balance_coins,ledger[0].summed_balance_delta);assert.equal(ledger[0].committed_coins,ledger[0].summed_committed_delta);
 const finalWallets=await observe('select player_id,balance from public.wallets where player_id=any($1::uuid[]) order by player_id',[env.clients.map(c=>c.actorId)]);
 assert.deepEqual(finalWallets,initialWallets);
 check('independent-committed-ledger-and-wallet-conservation',{layer:'read-only real PostgreSQL observer',accountId:account,ledger:ledger[0],initialWallets,finalWallets});
 report.status=report.realtimeFailure?'partial':'passed';if(report.realtimeFailure)process.exitCode=1;
}catch(error){report.status='failed';report.failure={name:error.name,message:error.message,stack:error.stack};
 if(env)for(const client of env.clients)await capture(client.page,output,'failure-'+client.label).catch(()=>{});
 process.exitCode=1;
}finally{if(env)await env.close();report.helperHashesAfter=hashes();report.helpersUnchanged=JSON.stringify(report.helperHashesAfter)===JSON.stringify(report.helperHashesBefore);try{report.sourceAfter=sourceEvidence(source);}catch{report.helpersUnchanged=false;}if(!report.helpersUnchanged){report.status='failed';report.helperFailure='Source changed during the run';process.exitCode=1;}await writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({status:report.status,assertions:report.assertions.length,report:output+'/report.json',failure:report.failure?.message}));
