// Real Auth/production API proof: free visible Engineer selection, then the first physical build click.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright-core';
const runtimePath=process.argv[2],output=resolve(process.argv[3]);
const helpers=process.env.MP_ECO_AUTH_HELPERS;if(!helpers)throw Error('Explicit frozen provider helpers required');
const common=filename=>import(pathToFileURL(resolve(helpers,filename)));
const {createApiClients}=await common('api-clients.mjs'),{api,land}=await common('clients.mjs');
const {observe,install,admit}=await common('observer.mjs'),{sourceEvidence,servedSourceEvidence}=await common('source.mjs');
const candidate='74be485507fbdbf1eb662f96f11a40c5e902e507';
const baseline='64ee02b360d68836b2de9247121ab47dc6a3ecbf';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const helperHashes=async()=>Object.fromEntries(await Promise.all(['api-clients.mjs','clients.mjs','observer.mjs','runtime.mjs','source.mjs']
 .map(async name=>[name,hash(await readFile(resolve(helpers,name)))])));
const uid=()=> 'engineer_ui_'+randomUUID().replaceAll('-','');
await mkdir(output,{recursive:true,mode:0o700});
const report={startedAt:new Date().toISOString(),candidateFrontend:candidate,backendBaseline:baseline,
 scenarioSha256:hash(await readFile(new URL(import.meta.url))),sourceBefore:sourceEvidence(candidate,{checkoutRoot:root}),helpersBefore:await helperHashes(),cases:[],
 setup:'Real local GoTrue registrations and production JWT verification. Fresh5000coin service admission and saved personal level5/earned10 eligibility are explicit fixtures, not naturally earned progress. Other island owner uses API only. One Chromium process, sequential isolated contexts.',
 boundaries:['Actual SDK session restore through a same-origin proxy to the same TLS-authenticated provider; no fake bearer or response.','Visible Engineer role and Build mutations are physical pointer clicks; opening Captain/build cards uses the existing product selection methods.','No explicit island refresh, reload, travel or setup mutation occurs between visible role selection and the first Build click.','Candidate frontend74 is source-pinned separately from unchanged dependency-equivalent backend64; this is a bounded first-buy acceptance case.']};
let browser,env,activePage;
const read=(sql,params=[])=>observe(sql,params,{runtimePath});
const checked=answer=>{assert.equal(answer.status,200);return answer.data;};
async function bank(accountId){const rows=await read('select a.balance_coins::text as balance,a.committed_coins::text as held,'+
 '(select count(*)::int from public.island_treasury_transactions t where t.account_id=a.id) as transactions,'+
 '(select coalesce(sum(balance_delta),0)::text from public.island_treasury_transactions t where t.account_id=a.id) as ledger_balance '+
 'from public.island_economy_accounts a where a.id=$1::uuid',[accountId]);assert.equal(rows.length,1);assert.equal(rows[0].balance,rows[0].ledger_balance);return rows[0];}
async function dismiss(page){for(let i=0;i<12;i++){
 for(const name of [/^Skip all/,'Skip','Got it']){const button=page.getByRole('button',{name,exact:typeof name==='string'}).first();if(await button.isVisible().catch(()=>false))await button.click({noWaitAfter:true,timeout:3000}).catch(()=>{});}
 if(await page.locator('dialog[open]').count())await page.keyboard.press('Escape');await page.waitForTimeout(100);
}}
async function visiblePost(page,path,button){
 const responseWait=page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()==='POST',{timeout:20000});
 const [response]=await Promise.all([responseWait,button.click({noWaitAfter:true})]);
 const value={path,status:response.status(),body:response.request().postDataJSON(),data:await response.json()};
 assert.equal(value.status,200,`${path}: ${JSON.stringify(value.data)}`);return value;
}
try{
 env=await createApiClients({labels:['engineer-own','engineer-visitor','engineer-host'],runtimePath,expectedCommit:baseline});
 report.primarySourcesBefore=servedSourceEvidence(env.runtime);
 execFileSync('git',['diff','--exit-code',baseline,candidate,'--','backend/server','backend/content','supabase/migrations',':(exclude)backend/server/tests'],{cwd:root,stdio:'pipe'});
 report.backendProductionDiff='empty';
 assert.ok(env.runtime.certificateSpki);
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  '--ignore-certificate-errors-spki-list='+env.runtime.certificateSpki]});
 for(const visiting of [false,true]){
  const actor=env.clients[visiting?1:0],owner=visiting?env.clients[2]:actor;
  const created=checked(await owner.request('/api/games',{method:'POST',body:{actionUid:uid()}}));
  const code=created.game.code;await admit(owner.actorId,{coins:5000,runtimePath});
  const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();activePage=page;page.setDefaultTimeout(15000);
  let buildRequests=0;page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname==='/api/island/build')buildRequests++;});
  const entry={visiting,actorId:actor.actorId,islandOwner:owner.actorId,code};report.cases.push(entry);
  await page.goto('http://127.0.0.1:55109',{waitUntil:'domcontentloaded'});
  const restored=await page.evaluate(async({session,key,actorId})=>{
   const {createAuthClient}=await import('/src/online/supabase-sdk.js');
   const client=createAuthClient(location.origin+'/provider',key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
   const restored=await client.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token});
   if(restored.error||restored.data.user?.id!==actorId)throw Error('Actual SDK session restore failed');
   sessionStorage.setItem('plot-twist-auth-v1',JSON.stringify(restored.data.session));client.auth.stopAutoRefresh();return restored.data.user.id;
  },{session:actor.session,key:env.runtime.anonKey,actorId:actor.actorId});assert.equal(restored,actor.actorId);
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(async()=>{const {session}=await import('/src/online/session.js');return session.isSignedIn();});
  entry.verifierStatuses=[];
  let me;
  for(let attempt=0;attempt<30;attempt++){
   me=await api(page,'/api/me');entry.verifierStatuses.push(me.status);
   if(me.status===200&&me.data.id===actor.actorId)break;
   await page.waitForTimeout(100);
  }
  assert.equal(checked(me).id,actor.actorId);
  await land(page,visiting?{join:code}:{});await dismiss(page);
  entry.renderedSelection=await page.evaluate(()=>{const island=window.__island.island;return {code:(island.visiting??island.island).code,visiting:!!island.visiting};});
  assert.equal(entry.renderedSelection.code.replace(/^ISLE-/i,''),code.replace(/^ISLE-/i,''));assert.equal(entry.renderedSelection.visiting,visiting);
  for(let i=0;i<30;i++){const captain=await api(page,'/api/captain');if(captain.status===200)break;await page.waitForTimeout(200);}
  await install('update public.personal_captain_profiles set level=5,won_wave_best=20,earned_points=10 where player_id=$1::uuid',[actor.actorId],
   'Explicit saved personal eligibility for visible Engineer selection; no earned milestone claim',{runtimePath});
  await page.evaluate(async()=>{await window.__island.island.load();});await dismiss(page);
  const snapshotPath=visiting?'/api/island/visit/'+encodeURIComponent(code):'/api/island';
  const snapshot=checked(await api(page,snapshotPath));assert.equal(snapshot.economy.treasury.availableCoins,'5000');
  const before=await bank(snapshot.economy.accountId);entry.before=before;
  await page.evaluate(()=>window.__island.island.openCaptain());
  const captain=page.locator('.island-card-captain[open]');
  await captain.locator('[data-focus="tab-skills"]').click({noWaitAfter:true});await captain.locator('[data-role="engineer"]').click({noWaitAfter:true});
  entry.role=await visiblePost(page,'/api/captain/role',captain.locator('[data-focus="role"]'));
  await page.waitForFunction(()=>{const island=window.__island.island;return island.island?.captain?.role==='engineer'&&!(island.visiting??island.island).quotesStale;});
  await page.keyboard.press('Escape');await page.evaluate(()=>window.__island.island.pick('wall_1'));
  const card=page.locator('.island-card-build[open]'),button=card.getByRole('button',{name:/^Build ·/});
  entry.displayed=await button.innerText();assert.match(entry.displayed,/9/);
  await card.screenshot({path:join(output,visiting?'visitor-first-quote.png':'owner-first-quote.png')});
  entry.build=await visiblePost(page,'/api/island/build',button);assert.equal(entry.build.body.quotedCoins,'9');
  assert.equal(entry.build.data.receipt.result.chargedCoins,'9');
  const after=await bank(snapshot.economy.accountId);entry.after=after;
  assert.equal(before.balance,'5000');assert.equal(after.balance,'4991');assert.equal(after.held,before.held);assert.equal(after.transactions,before.transactions+1);
  const payments=await read('select count(*)::int as n from public.island_construction_receipts where actor_id=$1::uuid and action_uid=$2',[actor.actorId,entry.build.body.actionUid]);
  assert.equal(payments[0].n,1);entry.exactReceiptCount=payments[0].n;
  assert.equal(buildRequests,1);entry.buildRequests=buildRequests;
  entry.result='passed';await context.close();activePage=null;console.log(visiting?'visitor-first-build-passed':'owner-first-build-passed');
 }
 report.result='passed';
}catch(error){report.result='failed';report.failure={name:error.name,message:error.message};if(activePage)await activePage.screenshot({path:join(output,'failure.png')}).catch(()=>{});throw error;}
finally{
 await browser?.close();await env?.close();
 report.sourceAfter=sourceEvidence(candidate,{checkoutRoot:root});
 report.primarySourcesAfter=env?servedSourceEvidence(env.runtime):null;
 report.helpersAfter=await helperHashes();assert.deepEqual(report.helpersAfter,report.helpersBefore);
 assert.equal(report.scenarioSha256,hash(await readFile(new URL(import.meta.url))));
 report.finishedAt=new Date().toISOString();await writeFile(join(output,'result.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
}
