// Same real actor: normal rejoin/Menu Leave and automatic home control after definitive old-scope refusal.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright-core';
const [runtimePath,sessionsPath,outputArg]=process.argv.slice(2),output=resolve(outputArg);
const helpers=process.env.MP_ECO_AUTH_HELPERS;if(!helpers)throw Error('Explicit actual-provider helpers required');
const helper=name=>import(pathToFileURL(resolve(helpers,name)));
const {api,land}=await helper('clients.mjs'),{requestApi}=await helper('api-clients.mjs');
const {observe}=await helper('observer.mjs'),{sourceEvidence,servedSourceEvidence}=await helper('source.mjs');
const runtime=JSON.parse(await readFile(runtimePath,'utf8')),saved=JSON.parse(await readFile(sessionsPath,'utf8'));
assert.equal(runtime.project,'mp505');assert.equal(runtime.apiUrl,'http://127.0.0.1:58005');
const candidate='90a9a8227579c2be86cbe1d024fa75de7d61637e',baseline='64ee02b360d68836b2de9247121ab47dc6a3ecbf';
const root=fileURLToPath(new URL('../../../',import.meta.url)),hash=x=>createHash('sha256').update(x).digest('hex');
const hashes=async()=>Object.fromEntries(await Promise.all(['clients.mjs','api-clients.mjs','observer.mjs','runtime.mjs','source.mjs'].map(async name=>[name,hash(await readFile(resolve(helpers,name)))])));
const checked=r=>{assert.equal(r.status,200);return r.data;},clean=code=>String(code).replace(/^ISLE-/i,'').toUpperCase();
const read=(sql,params=[])=>observe(sql,params,{runtimePath});
const actor=saved.browser,host={...saved.host,runtime};
await mkdir(output,{recursive:true,mode:0o700});
const report={startedAt:new Date().toISOString(),candidateFrontend:candidate,backendBaseline:baseline,
 scenarioSha256:hash(await readFile(new URL(import.meta.url))),sourceBefore:sourceEvidence(candidate,{checkoutRoot:root}),helpersBefore:await hashes(),facts:[],frames:[],
 setup:'Exact privately retained real Auth actor and host, existing islands and balances; no registration, admission, grant, progression fixture, pending-queue clear or money mutation.',
 boundaries:['Genuine SDK setSession uses a transparent same-origin proxy to the same trusted real provider; product Auth retains its original HTTPS root.','Normal rendered Join and Menu Leave plus normal tutorial dismissal/tab focus only. No manual island.load, session.ensure or SDK topic call.','Raw tokens, controller proof values and topic names are omitted; passive actor-tagged frame refs and SHA256 topic fingerprints support correlation.']};
const note=name=>{report.facts.push({name,at:new Date().toISOString()});console.log(name);};
async function financial(){return {accounts:await read('select island_owner,id,run_epoch,balance_coins::text as balance,committed_coins::text as held,'+
 '(select count(*)::int from public.island_treasury_transactions t where t.account_id=a.id) as transactions,'+
 '(select coalesce(sum(balance_delta),0)::text from public.island_treasury_transactions t where t.account_id=a.id) as ledger_balance '+
 'from public.island_economy_accounts a where island_owner=any($1::uuid[]) and state=\'active\' order by island_owner',[[actor.actorId,host.actorId]]),
 wallets:await read('select player_id,balance,(select count(*)::int from public.wallet_transactions t where t.player_id=w.player_id) as transactions from public.wallets w where player_id=any($1::uuid[]) order by player_id',[[actor.actorId,host.actorId]])};}
async function dismiss(page){for(let i=0;i<12;i++){
 for(const name of [/^Skip all/,'Skip','Got it','Skip tutorial']){const b=page.getByRole('button',{name,exact:typeof name==='string'}).first();if(await b.isVisible().catch(()=>false))await b.click({timeout:3000,noWaitAfter:true}).catch(e=>{if(e.name!=='TimeoutError')throw e;});}
 if(await page.locator('dialog[open]').count())await page.keyboard.press('Escape');await page.waitForTimeout(100);
}}
async function entry(page,options={}){await land(page,options);await dismiss(page);}
async function focus(context,page){const blank=await context.newPage();await blank.bringToFront();await page.bringToFront();await blank.close();}
let browser,page,postLeave=false;const rawFrames=[];
try{
 report.primarySourceBefore=servedSourceEvidence(runtime);
 execFileSync('git',['diff','--exit-code',baseline,candidate,'--','backend/server','backend/content','supabase/migrations',':(exclude)backend/server/tests'],{cwd:root,stdio:'pipe'});
 report.backendProductionDiff='empty';
 const hostView=checked(await requestApi(host,'/api/island')),hostCode=hostView.code;
 report.before=await financial();
 assert.equal(report.before.accounts.find(a=>a.island_owner===host.actorId).balance,'140');
 assert.equal(report.before.accounts.find(a=>a.island_owner===actor.actorId).balance,'200');
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--ignore-certificate-errors-spki-list='+runtime.certificateSpki]});
 const context=await browser.newContext({viewport:{width:1280,height:800}});page=await context.newPage();page.setDefaultTimeout(15000);
 page.on('websocket',socket=>{for(const[event,direction]of[['framesent','sent'],['framereceived','received']])socket.on(event,e=>{try{
  const f=JSON.parse(String(e.payload)),topic=Array.isArray(f)?f[2]:f.topic,kind=Array.isArray(f)?f[3]:f.event,payload=Array.isArray(f)?f[4]:f.payload;
  if(typeof topic==='string'&&topic.includes('live:place:')&&['phx_join','phx_reply','phx_leave'].includes(kind)){
   const frame={actor:'retained-member',direction,topicSha256:hash(topic),kind,ref:Array.isArray(f)?f[1]:f.ref,joinRef:Array.isArray(f)?f[0]:f.join_ref,status:payload?.status??null,postLeave,at:new Date().toISOString()};
   report.frames.push(frame);rawFrames.push({...frame,topic});
  }
 }catch{}});});
 await page.goto('http://127.0.0.1:55109',{waitUntil:'domcontentloaded'});
 const restored=await page.evaluate(async({session,key,expectedActor})=>{
  const {createAuthClient}=await import('/src/online/supabase-sdk.js');
  const client=createAuthClient(location.origin+'/provider',key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const result=await client.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token});
  if(result.error||result.data.user?.id!==expectedActor)throw Error('Actual retained actor SDK restoration failed');
  sessionStorage.setItem('plot-twist-auth-v1',JSON.stringify(result.data.session));client.auth.stopAutoRefresh();return result.data.user.id===expectedActor;
 },{session:actor.session,key:runtime.anonKey,expectedActor:actor.actorId});assert.equal(restored,true);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(async()=>{const {session}=await import('/src/online/session.js');return session.isSignedIn();});
 let me;report.verifierStatuses=[];for(let n=0;n<60;n++){me=await api(page,'/api/me');report.verifierStatuses.push(me.status);if(me.status===200&&me.data.id===actor.actorId)break;await page.waitForTimeout(100);}
 assert.equal(checked(me).id,actor.actorId);note('same-actual-actor-restored-and-verified');
 await entry(page,{join:hostCode});await focus(context,page);
 await page.waitForFunction(owner=>window.__island.island.session.proof()?.origin.islandOwner===owner,host.actorId,{timeout:30000});
 const old=await page.evaluate(()=>({proof:window.__island.island.session.proof(),metadata:window.__island.island.session.metadata,visiting:!!window.__island.island.visiting}));
 assert.equal(old.visiting,true);const oldTopic='realtime:live:place:'+old.metadata.session.place+':1';
 for(let n=0;n<40&&!rawFrames.some(f=>f.topic===oldTopic&&f.direction==='sent'&&f.kind==='phx_join');n++)await page.waitForTimeout(250);
 const joined=rawFrames.find(f=>f.topic===oldTopic&&f.direction==='sent'&&f.kind==='phx_join');assert.ok(joined);
 for(let n=0;n<40&&!rawFrames.some(f=>f.topic===oldTopic&&f.direction==='received'&&f.kind==='phx_reply'&&f.ref===joined.ref&&f.status==='ok');n++)await page.waitForTimeout(250);
 assert.ok(rawFrames.some(f=>f.topic===oldTopic&&f.direction==='received'&&f.kind==='phx_reply'&&f.ref===joined.ref&&f.status==='ok'));
 report.oldAcceptedJoin={topicSha256:hash(oldTopic),ref:joined.ref,replyRefMatched:true};note('normal-rejoin-has-accepted-product-canonical-topic');
 await dismiss(page);await page.locator('.hud-menu').click({noWaitAfter:true});
 const oldDeparture=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/island/session/leave'&&r.request().method()==='POST'&&r.request().postDataJSON()?.economy?.islandOwner===host.actorId,{timeout:20000});
 const membershipLeave=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/games/leave'&&r.request().method()==='POST',{timeout:20000});
 postLeave=true;report.leaveClickedAt=new Date().toISOString();
 const [left]=await Promise.all([membershipLeave,page.getByRole('button',{name:'Leave this game',exact:true}).click({noWaitAfter:true})]);
 assert.equal(left.status(),200);report.membershipLeave={path:'/api/games/leave',status:left.status()};
 const departure=await oldDeparture,departureBody=departure.request().postDataJSON(),departureData=await departure.json();
 const code=departureData.error?.code??departureData.code;
 report.oldDeparture={path:'/api/island/session/leave',status:departure.status(),code,
 originalOwnerMatched:departureBody.economy.islandOwner===host.actorId,
 originalSessionMatched:departureBody.sessionId===old.proof.sessionId,
 originalGenerationMatched:departureBody.connectionGeneration===old.proof.connectionGeneration,
 actionUidSha256:hash(departureBody.actionUid),sameAuthenticatedActor:true};
 assert.equal(departure.status(),403);assert.equal(code,'not_member');
 assert.equal(report.oldDeparture.originalSessionMatched,true);assert.equal(report.oldDeparture.originalGenerationMatched,true);
 await entry(page);await focus(context,page);
 await page.waitForFunction(owner=>window.__island.island.session.proof()?.origin.islandOwner===owner,actor.actorId,{timeout:20000});
 const home=await page.evaluate(()=>{const island=window.__island.island;return {proof:island.session.proof(),metadata:island.session.metadata,state:island.session.state,visiting:!!island.visiting,place:island.roomPlace()};});
 assert.equal(home.visiting,false);assert.equal(home.state.phase,'controller');assert.equal(home.proof.origin.islandOwner,actor.actorId);
 report.home={sameActor:home.proof.actorId===actor.actorId,ownerMatched:true,visiting:false,phase:home.state.phase,freshControlRead:home.metadata.session.isController,roomPlaceChanged:home.place!==old.metadata.session.place,available:checked(await api(page,'/api/island')).economy.treasury.availableCoins};
 assert.equal(report.home.available,'200');assert.equal(report.home.freshControlRead,true);
 const leftFrame=rawFrames.find(f=>f.postLeave&&f.topic===oldTopic&&f.direction==='sent'&&f.kind==='phx_leave');assert.ok(leftFrame);
 report.oldTopicLeft={topicSha256:hash(oldTopic),postClick:true,joinRef:leftFrame.joinRef,ref:leftFrame.ref};
 report.after=await financial();assert.deepEqual(report.after,report.before);
 report.recoveryMilliseconds=Date.now()-Date.parse(report.leaveClickedAt);
 assert.ok(report.recoveryMilliseconds<30000);await page.screenshot({path:join(output,'home-controller-after-membership-leave.png')});
 note('normal-leave-retires-403-not-member-and-automatically-controls-own-island');report.result='passed';
}catch(error){report.result='failed';report.failure={name:error.name,message:error.message};if(page)await page.screenshot({path:join(output,'failure.png')}).catch(()=>{});process.exitCode=1;}
finally{await browser?.close();report.sourceAfter=sourceEvidence(candidate,{checkoutRoot:root});report.primarySourceAfter=servedSourceEvidence(runtime);report.helpersAfter=await hashes();assert.deepEqual(report.helpersAfter,report.helpersBefore);assert.equal(report.scenarioSha256,hash(await readFile(new URL(import.meta.url))));report.finishedAt=new Date().toISOString();await writeFile(join(output,'result.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});}
