// One genuine rendered Match-board read; unavailable provider data never becomes a bet.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {chromium} from 'playwright-core';
import {api,land} from './clients.mjs';
import {createApiClients} from './api-clients.mjs';
import {install,admit,observe} from './observer.mjs';
import {sourceEvidence,servedSourceEvidence} from './source.mjs';

const directory=resolve(process.argv[2]),output=resolve(process.argv[3]);
const root=resolve(new URL('../../../',import.meta.url).pathname);
const files=['frontend/scripts/authenticated-economy/visible-match-unavailable.mjs',
 'frontend/scripts/authenticated-economy/serve-visible-wagers.mjs',
 'frontend/scripts/authenticated-economy/clients.mjs','frontend/scripts/authenticated-economy/api-clients.mjs',
 'frontend/scripts/authenticated-economy/source.mjs','frontend/scripts/authenticated-economy/runtime.mjs',
 'frontend/scripts/authenticated-economy/observer.mjs','backend/tools/authenticated_economy/observe.py',
 'backend/tools/authenticated_economy/wager_http_fixture.py','backend/tools/authenticated_economy/config.py'];
const hash=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async file=>[file,await hash(join(root,file))])));
const env=await createApiClients({labels:['visible-match-owner']});
const saved=env.clients[0],runtime=env.runtime;
await mkdir(output,{recursive:true});
const report={scenario:'visible-unavailable-football-board',status:'running',startedAt:new Date().toISOString(),
 limits:['One actual registered SDK-restored rendered client; native Match opening with physical pointer input.',
 'Saved record7 is an explicit initial eligibility fixture before normal200admission, not earned victories.',
 'The real configured football provider is unavailable; no football outcome, accepted stake or natural feed is claimed.',
 'Only initial SDK Auth transport uses the trusted-TLS same-origin proxy; product HTTPS issuer and API verifier stay real.']};
const persist=()=>writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
let browser;
async function sources(){
 const side=JSON.parse(await readFile(join(directory,'side-api-source.json'),'utf8'));
 const frontend=JSON.parse(await readFile(join(directory,'side-frontend-source.json'),'utf8'));
 process.kill(side.processId,0);process.kill(frontend.processId,0);
 assert.equal(side.productionCandidate,runtime.expectedCommit);
 assert.equal(side.factorySha256,await hash(join(root,files[8])));
 assert.equal(frontend.productProviderUrl,runtime.providerUrl);
 assert.equal(frontend.providerProxy,'http://127.0.0.1:55106/provider');
 assert.equal(frontend.providerTarget,runtime.providerUrl);assert.equal(frontend.providerTlsValidation,true);
 assert.equal(frontend.privateViteCache,true);assert.equal(frontend.apiProxy,'http://127.0.0.1:58006');
 assert.equal(frontend.wrapperSha256,await hash(join(root,files[1])));
 return{side,frontend,protected:sourceEvidence(runtime.expectedCommit),primary:servedSourceEvidence(runtime)};
}
async function point(locator){return locator.evaluate(e=>{e.scrollIntoView({block:'center',behavior:'instant'});const b=e.getBoundingClientRect(),x=b.x+b.width/2,y=b.y+b.height/2,h=document.elementFromPoint(x,y);return !e.disabled&&b.width>0&&b.height>0&&(h===e||e.contains(h))?{x,y}:null;});}
async function dismiss(page){
 const choices=[page.locator('.unlock-card[open]').getByRole('button',{name:/^Skip all /}),
  page.locator('.unlock-card[open],.goal-card[open]').getByRole('button',{name:'Got it',exact:true}),
  page.locator('.island-card-lobby[open] [data-focus="done"]')];
 for(const choicesAt of choices)for(let n=0;n<await choicesAt.count();n++)try{const p=await point(choicesAt.nth(n));if(p){await page.mouse.click(p.x,p.y);await page.waitForTimeout(150);return true;}}catch(error){if(!/detach|resolve|attached/i.test(error.message))throw error;}
 return false;
}
async function pointer(page,button){await button.waitFor({state:'visible',timeout:30000});for(let n=0;n<100;n++){
 try{const p=await point(button);if(p){await page.mouse.click(p.x,p.y);return;}}catch(error){if(!/detach|resolve|attached/i.test(error.message))throw error;}
 await dismiss(page);await page.waitForTimeout(100);
}throw Error('The native Match button never owned the physical pointer');}
async function snapshot(account){return{
 account:await observe('select balance_coins::text,committed_coins::text,revision::text from public.island_economy_accounts where id=$1::uuid',[account]),
 history:await observe('select count(*)::integer as entries,coalesce(sum(balance_delta),0)::text as balance,coalesce(sum(committed_delta),0)::text as held from public.island_treasury_transactions where account_id=$1::uuid',[account]),
 wagers:await observe('select count(*)::integer as count from public.island_wagers where account_id=$1::uuid',[account]),
 wallet:await observe('select balance::text,(select count(*)::integer from public.wallet_transactions where player_id=$1::uuid) as entries from public.wallets where player_id=$1::uuid',[saved.actorId])};}
try{
 report.hashesBefore=await hashes();report.sourcesBefore=await sources();
 const created=await saved.request('/api/games',{method:'POST',body:{actionUid:randomUUID().replaceAll('-','')}});assert.equal(created.status,200);
 await install('update public.islands set wave_best=7,next_wave=8 where player_id=$1::uuid returning wave_best',[saved.actorId],
  'Initial saved Match-board eligibility before fresh admission; no combat history or financial outcome is fabricated');
 await admit(saved.actorId,{coins:200});const view=await saved.request('/api/island');assert.equal(view.status,200);const account=view.data.economy.accountId;
 report.setup={record:7,nextWave:8,normalAdmissionCoins:'200',actualRegisteredIdentity:true};
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--ignore-certificate-errors-spki-list='+runtime.certificateSpki]});
 const page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(15000);
 await page.goto('http://127.0.0.1:55106',{waitUntil:'domcontentloaded'});
 await page.evaluate(async({key,session,id})=>{const{createAuthClient}=await import('/src/online/supabase-sdk.js');const c=createAuthClient('http://127.0.0.1:55106/provider',key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const r=await c.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token});if(r.error||r.data.user?.id!==id)throw Error('Actual SDK restoration refused');sessionStorage.setItem('plot-twist-auth-v1',JSON.stringify(r.data.session));c.auth.stopAutoRefresh();
 },{key:runtime.anonKey,session:saved.session,id:saved.actorId});
 await page.reload({waitUntil:'domcontentloaded'});let me;for(let n=0;n<60;n++){me=await api(page,'/api/me');if(me.status===200&&me.data.id===saved.actorId)break;await page.waitForTimeout(100);}assert.equal(me.status,200);assert.equal(me.data.id,saved.actorId);
 await land(page,{});await page.waitForFunction(a=>window.__island?.island.economy?.accountId===a,account,{timeout:45000});
 for(let n=0;n<12;n++){if(!await dismiss(page))break;}
 report.before=await snapshot(account);
 await page.evaluate(()=>{window.__island.island.ui.close();window.__island.island.pick('island_harbor');});
 const pending=page.waitForResponse(r=>{const u=new URL(r.url());return u.pathname==='/api/island/wagers'&&u.searchParams.get('product')==='football';},{timeout:30000}).then(reply=>({reply}),error=>({error}));
 await pointer(page,page.locator('.island-card[open] [data-focus="stall-match"]'));const response=await pending;if(response.error)throw response.error;
 const reply=await response.reply.json();assert.equal(response.reply.status(),200);assert.deepEqual(reply.choices,[]);assert.equal(reply.economy.accountId,account);
 const card=page.locator('.shared-harbor[open]');await card.getByText('Live events are unavailable. Your existing stakes remain recorded.',{exact:true}).waitFor();
 const text=await card.innerText();assert.match(text,/Island available:.*200.*Held:.*0/s);assert.equal(await card.getByRole('button',{name:'Place island stake',exact:true}).count(),0);
 await card.screenshot({path:join(output,'native-match-unavailable.png')});
 report.after=await snapshot(account);assert.deepEqual(report.after,report.before);assert.equal(report.after.wagers[0].count,0);
 report.observation={actualFootballReadStatus:200,choices:[],visibleText:text,noBetConfirmation:true,sharedAndPrivateHistoryUnchanged:true};report.status='passed';
}catch(error){report.status='failed';report.failure={name:error.name,message:error.message};process.exitCode=1;console.error(error.stack);}
finally{
 report.hashesAfter=await hashes();report.hashesUnchanged=JSON.stringify(report.hashesBefore)===JSON.stringify(report.hashesAfter);
 try{report.sourcesAfter=await sources();}catch(error){report.sourceFailure=error.message;report.status='failed';process.exitCode=1;}
 if(!report.hashesUnchanged){report.status='failed';process.exitCode=1;}
 if(browser)await browser.close();await env.close();report.finishedAt=new Date().toISOString();await persist();
}
console.log(JSON.stringify({status:report.status,failure:report.failure?.message}));
