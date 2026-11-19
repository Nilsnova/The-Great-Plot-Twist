// Targeted real-browser money controls. Only existing inspection selects the Harbor card.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {chromium} from 'playwright-core';
import {api,land} from './clients.mjs';
import {loadRuntime} from './runtime.mjs';
import {sourceEvidence,servedSourceEvidence} from './source.mjs';
import {observe} from './observer.mjs';

const directory=resolve(process.argv[2]),output=resolve(process.argv[3]),root=resolve(new URL('../../../',import.meta.url).pathname);
const runtime=await loadRuntime(),prepared=JSON.parse(await readFile(join(directory,'private-clients.json'),'utf8'));
const files=['frontend/scripts/authenticated-economy/visible-wagers.mjs','frontend/scripts/authenticated-economy/serve-visible-wagers.mjs',
 'frontend/scripts/authenticated-economy/prepare-visible-wagers.mjs','frontend/scripts/authenticated-economy/api-clients.mjs','frontend/scripts/authenticated-economy/clients.mjs',
 'frontend/scripts/authenticated-economy/source.mjs','frontend/scripts/authenticated-economy/runtime.mjs','frontend/scripts/authenticated-economy/observer.mjs',
 'backend/tools/authenticated_economy/wager_http_fixture.py','backend/tools/authenticated_economy/observe.py','backend/tools/authenticated_economy/config.py'];
const digest=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
async function hashes(){return Object.fromEntries(await Promise.all(files.map(async path=>[path,await digest(join(root,path))])));}
async function sources(){
 const side=JSON.parse(await readFile(join(directory,'side-api-source.json'),'utf8'));
 const frontend=JSON.parse(await readFile(join(directory,'side-frontend-source.json'),'utf8'));
 process.kill(side.processId,0);process.kill(frontend.processId,0);
 assert.equal(side.productionCandidate,runtime.expectedCommit);assert.equal(side.factorySha256,await digest(join(root,files[8])));
 assert.equal(frontend.privateViteCache,true);assert.equal(frontend.productProviderUrl,runtime.providerUrl);assert.equal(frontend.providerProxy,'http://127.0.0.1:55106/provider');assert.equal(frontend.providerTarget,runtime.providerUrl);assert.equal(frontend.providerTlsValidation,true);assert.equal(frontend.expectedProductionBaseline,runtime.expectedCommit);assert.equal(frontend.frontendUrl,'http://127.0.0.1:55106');assert.equal(frontend.apiProxy,'http://127.0.0.1:58006');
 assert.equal(frontend.wrapperSha256,await digest(join(root,files[1])));assert.equal(frontend.viteConfigSha256,await digest(join(root,'frontend/vite.config.js')));
 assert.equal(frontend.packageLockSha256,await digest(join(root,'frontend/package-lock.json')));
 return {side,frontend,protectedSource:sourceEvidence(runtime.expectedCommit),primary:servedSourceEvidence(runtime)};
}
const report={scenario:'visible-unrestricted-wagers',status:'running',startedAt:new Date().toISOString(),steps:[],limits:[
 'Two independent rendered browsers with actual provider SDK session restoration; normal development inspection selects existing cards only.',
 'All stakes/All in/confirmation/reset actions use native visible controls and physical pointer buttons, not direct financial requests.',
 'Own same-origin /provider proxy forwards genuine Auth/REST/Realtime with trusted TLS; no identity or payload fabrication.',
 'Saved Harbor record4 and one200grant are explicit initial setup; only external quote transport is a fixture.',
 'Default real UTC clocks and actual five-minute deadlines; ordinary scheduler HTTP is a service action, not a visible user control.',
 'No natural-price, football, anonymous-browser or complete fifteen-row acceptance claim.']};
await mkdir(output,{recursive:true});const persist=()=>writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
const check=async(name,facts={})=>{report.steps.push({name,at:new Date().toISOString(),...facts});await persist();console.log(name);};
const browsers=[],clients=[];
async function pointFor(locator){return locator.evaluate(element=>{element.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});const b=element.getBoundingClientRect(),x=b.x+b.width/2,y=b.y+b.height/2,hit=document.elementFromPoint(x,y);
 return !element.disabled&&b.width>0&&b.height>0&&(hit===element||element.contains(hit))?{x,y}:null;});}
async function dismissKnown(page){
 const candidates=[page.locator('.goal-card[open]').getByRole('button',{name:'Got it',exact:true}),page.locator('.island-card-lobby[open] [data-focus="done"]'),page.locator('dialog.cutscene[open],.tutorial-card[open]').getByRole('button',{name:'Skip',exact:true})];
 for(const candidate of candidates){for(let i=0;i<await candidate.count();i++){try{const point=await pointFor(candidate.nth(i));if(point){await page.mouse.click(point.x,point.y);await page.waitForTimeout(150);return true;}}catch(error){if(!/detach|resolve|attached/i.test(error.message))throw error;}}}return false;
}
async function pointer(page,locator){
 await locator.waitFor({state:'visible',timeout:15000});let point;
 for(let i=0;i<60&&!point;i++){
  try{point=await pointFor(locator);}catch(error){if(!/detach|resolve|attached/i.test(error.message))throw error;}
  if(!point){await dismissKnown(page);await page.waitForTimeout(100);}
 }
 assert.ok(point,'A visible enabled product button must own the actual pointer');await page.mouse.click(point.x,point.y);
}
async function guides(page){for(let i=0;i<12;i++){if(!await dismissKnown(page))return;}throw Error('Ordinary guide dismissal did not settle');}
async function closePanels(page){for(let i=0;i<8;i++){if(await dismissKnown(page))continue;const buttons=page.locator('dialog[open] > header').getByRole('button',{name:'Close dialog',exact:true});let closed=false;for(let n=await buttons.count()-1;n>=0;n--){try{const p=await pointFor(buttons.nth(n));if(p){await page.mouse.click(p.x,p.y);closed=true;break;}}catch(error){if(!/detach|resolve|attached/i.test(error.message))throw error;}}if(!closed)return;await page.waitForTimeout(150);}}
async function openMarket(page){await closePanels(page);await guides(page);await page.evaluate(()=>{const island=window.__island.island;island.ui.close();island.pick('island_harbor');});
 await pointer(page,page.locator('.island-card[open] [data-focus="stall-market"]'));await page.locator('.shared-harbor[open] [data-event="harbor-trust"] select').waitFor({timeout:30000});}
async function cardBank(page,available,held){await page.waitForFunction(({available,held})=>{
 const text=document.querySelector('.shared-harbor[open] .harbor-price')?.textContent??'';
 return new RegExp('Island available:.*\\b'+available+'\\b.*Held:.*\\b'+held+'\\b').test(text);
 },{available,held},{timeout:45000});return page.locator('.shared-harbor[open] .harbor-price').innerText();}
async function hudBank(page,available,held){await page.waitForFunction(({available,held})=>{
 const element=document.querySelector('.hud-coins[data-economy="shared"]'),text=element?.textContent??'';
 return text.includes('Island treasury')&&new RegExp('\\b'+available+'\\b').test(text)&&new RegExp('\\b'+held+' committed').test(text);
 },{available,held},{timeout:45000});return page.locator('.hud-coins[data-economy="shared"]').innerText();}
async function screenshot(page,name,selector='.shared-harbor[open]'){await page.locator(selector).screenshot({path:join(output,name+'.png')});}
async function place(client,stake,direction,{all=false}={}){
 const page=client.page,box=page.locator('.shared-harbor[open] [data-event="harbor-trust"]');
 await box.locator('select').selectOption(direction);
 if(all)await pointer(page,box.getByRole('button',{name:'All in for Bitcoin',exact:true}));else await box.locator('input.shared-harbor-amount').fill(stake);
 assert.equal(await box.locator('input.shared-harbor-amount').inputValue(),stake);
 const pending=page.waitForResponse(r=>r.url().endsWith('/api/island/wagers/market')&&r.request().method()==='POST',{timeout:30000}).then(reply=>({reply}),error=>({error}));
 await pointer(page,box.getByRole('button',{name:'Place island stake',exact:true}));const settled=await pending;if(settled.error)throw settled.error;
 const reply=settled.reply,data=await reply.json();assert.equal(reply.status(),200,JSON.stringify(data));const body=reply.request().postDataJSON();
 assert.equal(body.stake,stake);assert.equal(body.direction,direction);assert.equal(data.receipt.result.wager.stake,stake);
 assert.equal(data.receipt.actorId,client.actorId);assert.equal(data.receipt.origin.accountId,prepared.economy.accountId);assert.equal(data.receipt.origin.runEpoch,prepared.economy.runEpoch);
 return {label:client.label,body,receipt:data.receipt};
}
async function settings(page){await closePanels(page);await guides(page);await pointer(page,page.getByRole('button',{name:'Menu',exact:true}));
 await pointer(page,page.locator('.shell-screen[open]').getByRole('button',{name:'Settings',exact:true}));await page.locator('.shell-screen[open] .island-reset').waitFor({timeout:20000});return page.locator('.shell-screen[open] .island-reset');}
const sql=(s,p=[])=>observe(s,p);
async function money(account){const rows=await sql(`select a.state,a.balance_coins::text as balance,a.committed_coins::text as held,a.revision::text as revision,
 coalesce(sum(t.balance_delta),0)::text as ledger_balance,coalesce(sum(t.committed_delta),0)::text as ledger_held,count(t.id)::text as entries
 from public.island_economy_accounts a left join public.island_treasury_transactions t on t.account_id=a.id where a.id=$1::uuid group by a.id`,[account]);const r=rows[0];assert.equal(r.balance,r.ledger_balance);assert.equal(r.held,r.ledger_held);assert.equal(r.revision,r.entries);return r;}
const wallets=()=>sql(`select w.player_id,w.balance::text as balance,(select count(*)::integer from public.wallet_transactions t where t.player_id=w.player_id) as entries,
 coalesce((select sum(t.delta)::text from public.wallet_transactions t where t.player_id=w.player_id),'0') as summed from public.wallets w where player_id=any($1::uuid[]) order by player_id`,[prepared.clients.map(c=>c.actorId)]);
async function settle(opened){const deadline=Math.max(...opened.map(o=>Date.parse(o.receipt.result.wager.settleAt)))+1500;const start=Date.now();report.waitingFor=opened.map(o=>o.receipt.result.wager.settleAt);await persist();
 while(Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,Math.min(5000,deadline-Date.now())));
 const token=(await readFile(join(directory,'cron-token'),'utf8')).trim();const response=await fetch('http://127.0.0.1:58006/api/internal/island-wagers/settle',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+token}});assert.equal(response.status,200);report.waitingFor=null;return {elapsedWaitSeconds:Math.round((Date.now()-start)/10)/100,scheduler:await response.json()};}
try{
 report.hashesBefore=await hashes();report.sourcesBefore=await sources();
 for(const saved of prepared.clients){
  const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--ignore-certificate-errors-spki-list='+runtime.certificateSpki]});browsers.push(browser);
  const page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(15000);await page.goto('http://127.0.0.1:55106',{waitUntil:'domcontentloaded'});
  await page.evaluate(async({url,key,session,actorId})=>{const {createAuthClient}=await import('/src/online/supabase-sdk.js');const client=createAuthClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
   const result=await client.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token});if(result.error||!result.data.session||result.data.user?.id!==actorId)throw Error('Actual provider SDK session restoration failed: '+(result.error?.status??'identity'));sessionStorage.setItem('plot-twist-auth-v1',JSON.stringify(result.data.session));client.auth.stopAutoRefresh();
  },{url:'http://127.0.0.1:55106/provider',key:runtime.anonKey,session:saved.session,actorId:saved.actorId});
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(async()=>{const {session}=await import('/src/online/session.js');return session.isSignedIn();},null,{timeout:30000});
  let me;for(let attempt=0;attempt<60;attempt++){me=await api(page,'/api/me');if(me.status===200&&me.data.id===saved.actorId)break;await page.waitForTimeout(100);}
  assert.equal(me.status,200,'Normal asynchronous Auth restore must reach production /api/me200');assert.equal(me.data.id,saved.actorId);
  clients.push({label:saved.label,actorId:saved.actorId,page});
 }
 const [owner,member]=clients;
 for(const client of clients){await land(client.page,client===member?{join:prepared.code}:{});await client.page.waitForFunction(owner=>window.__island?.island.economy?.islandOwner===owner&&window.__island.island.economy.mode==='island_shared',owner.actorId,{timeout:45000});await openMarket(client.page);await cardBank(client.page,'200','0');}
 const privateBefore=await wallets();const account=prepared.economy.accountId;
 await check('two actual SDK-restored independent rendered clients show one shared bank',{browserProcesses:2,bankTexts:await Promise.all(clients.map(c=>cardBank(c.page,'200','0')))});
 const one=await place(member,'1','up');await Promise.all(clients.map(c=>cardBank(c.page,'199','1')));
 const second=await place(owner,'1','down');await Promise.all(clients.map(c=>cardBank(c.page,'198','2')));
 const all=await place(member,'198','up',{all:true});await Promise.all(clients.map(c=>cardBank(c.page,'0','200')));
 assert.equal(new Set([one,second,all].map(r=>r.receipt.result.wager.id)).size,3);await screenshot(owner.page,'owner-all-funds-held');await screenshot(member.page,'member-all-funds-held');
 await check('visible one-coin, separate same-event and All in controls reserve exactly the island budget',{requests:[one,second,all],bankTexts:await Promise.all(clients.map(c=>cardBank(c.page,'0','200'))),account:await money(account)});
 const memberSettings=await settings(member.page);assert.match(await memberSettings.innerText(),/Only the host can reset/);assert.equal(await memberSettings.locator('input.island-reset-code').count(),0);await screenshot(member.page,'member-reset-owner-only','.island-reset');
 await closePanels(member.page);await member.page.reload({waitUntil:'domcontentloaded'});await land(member.page,{join:prepared.code});await member.page.waitForFunction(owner=>window.__island?.island.economy?.islandOwner===owner,owner.actorId,{timeout:45000});await openMarket(member.page);await cardBank(member.page,'0','200');
 assert.equal((await api(member.page,'/api/me')).data.id,member.actorId);await screenshot(member.page,'member-real-reload-pending-stakes');
 await check('ordinary member reload restores actual SDK session and pending bank; owner-only reset view',{bankText:await cardBank(member.page,'0','200'),identityRestored:true,memberResetControlAbsent:true});
 const firstWait=await settle([one,second,all]);await Promise.all(clients.map(c=>cardBank(c.page,'398','0')));await screenshot(owner.page,'owner-first-settlement');await screenshot(member.page,'member-first-settlement');
 const rows=await sql(`select w.selection,w.stake::text as stake,s.outcome,s.returned_payout::text as payout from public.island_wagers w join public.island_wager_settlements s on s.wager_id=w.id where w.id=any($1::uuid[]) order by w.stake,w.selection`,[[one,second,all].map(o=>o.receipt.result.wager.id)]);
 assert.deepEqual(rows.map(r=>[r.stake,r.selection,r.outcome,r.payout]),[['1','down','lost','0'],['1','up','won','2'],['198','up','won','396']]);
 await check('first actual maturity appears in both rendered banks and activity',{...firstWait,settlements:rows,bankTexts:await Promise.all(clients.map(c=>cardBank(c.page,'398','0')))});
 const reinvested=await place(owner,'398','up',{all:true});await Promise.all(clients.map(c=>cardBank(c.page,'0','398')));await screenshot(owner.page,'owner-all-proceeds-reinvested');
 const section=await settings(owner.page);assert.match(await section.innerText(),/pending wager returns stay in the retired run/);await section.locator('input.island-reset-code').fill(prepared.code);await screenshot(owner.page,'owner-reset-confirmation','.island-reset');
 const pendingReset=owner.page.waitForResponse(r=>r.url().endsWith('/api/island/fresh-start')&&r.request().method()==='POST',{timeout:30000}).then(reply=>({reply}),error=>({error}));
 await pointer(owner.page,section.getByRole('button',{name:'Reset my island',exact:true}));const rr=await pendingReset;if(rr.error)throw rr.error;const reset=await rr.reply.json();assert.equal(rr.reply.status(),200,JSON.stringify(reset));
 await closePanels(owner.page);await guides(owner.page);await hudBank(owner.page,'200','0');const current=await owner.page.evaluate(()=>window.__island.island.economy);assert.notEqual(current.accountId,account);
 await closePanels(member.page);await guides(member.page);let memberAdoption='automatic';
 try{await member.page.waitForFunction(account=>window.__island?.island.economy?.accountId===account,current.accountId,{timeout:30000});await hudBank(member.page,'200','0');}
 catch{memberAdoption='ordinary-reload-required';await member.page.reload({waitUntil:'domcontentloaded'});await land(member.page,{join:prepared.code});await member.page.waitForFunction(account=>window.__island?.island.economy?.accountId===account,current.accountId,{timeout:45000});await hudBank(member.page,'200','0');}
 await screenshot(owner.page,'owner-new-run-bank','.hud-coins');await screenshot(member.page,'member-new-run-bank','.hud-coins');
 await check('visible owner reset preserves the new rendered bank while reinvestment remains in the old run',{reinvestment:reinvested,resetReceipt:reset.receipt,memberAdoption,bankTexts:await Promise.all(clients.map(c=>hudBank(c.page,'200','0'))),newAccount:await money(current.accountId)});
 const finalWait=await settle([reinvested]);const final=await sql('select outcome,returned_payout::text as payout from public.island_wager_settlements where wager_id=$1::uuid',[reinvested.receipt.result.wager.id]);assert.deepEqual(final,[{outcome:'won',payout:'796'}]);
 await Promise.all(clients.map(c=>hudBank(c.page,'200','0')));const old=await money(account),replacement=await money(current.accountId);assert.equal(old.balance,'796');assert.equal(old.state,'retired');assert.equal(replacement.balance,'200');assert.equal(replacement.entries,'1');assert.deepEqual(await wallets(),privateBefore);
 await screenshot(owner.page,'owner-bank-after-retired-payout','.hud-coins');await screenshot(member.page,'member-bank-after-retired-payout','.hud-coins');
 await check('second actual maturity stays retired and both current rendered banks stay200',{...finalWait,settlement:final,old,replacement,bankTexts:await Promise.all(clients.map(c=>hudBank(c.page,'200','0'))),privateWalletHistoriesUnchanged:true});report.status='passed';
}catch(error){report.status='failed';report.failure={name:error.name,message:error.message};process.exitCode=1;console.error(error.stack);for(const c of clients)await c.page.screenshot({path:join(output,c.label+'-failure.png')}).catch(()=>{});}
finally{report.hashesAfter=await hashes();report.hashesUnchanged=JSON.stringify(report.hashesAfter)===JSON.stringify(report.hashesBefore);try{report.sourcesAfter=await sources();}catch(error){report.sourceFailure=error.message;report.status='failed';process.exitCode=1;}
 if(!report.hashesUnchanged){report.status='failed';process.exitCode=1;}for(const b of browsers)await b.close();report.finishedAt=new Date().toISOString();await persist();}
console.log(JSON.stringify({status:report.status,steps:report.steps.length,failure:report.failure?.message}));
