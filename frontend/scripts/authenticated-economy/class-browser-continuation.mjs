// Continue only the real class-code/Harbor UI observation; reuse all prepared actors and money.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
import {api} from './clients.mjs';
import {loadRuntime} from './runtime.mjs';
import {observe} from './observer.mjs';
import {sourceEvidence,servedSourceEvidence} from './source.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url)),output=process.env.MP_ECO_OUTPUT??'/tmp/mp505-class-browser-continuation';
const runtime=await loadRuntime('/tmp/mp505-provider/runtime.json'),baseline='64ee02b360d68836b2de9247121ab47dc6a3ecbf';
const anonymous=JSON.parse(await readFile('/tmp/mp505-ship-legacy/anonymous-session.json','utf8'));
const host=JSON.parse(await readFile('/tmp/mp505-ship-legacy/host-client.json','utf8'));
const code=(await readFile('/tmp/mp505-ship-legacy/class-code','utf8')).trim();
const files=['frontend/scripts/authenticated-economy/class-browser-continuation.mjs','frontend/scripts/authenticated-economy/ship-legacy-front.mjs',
 'backend/tools/authenticated_economy/ship_legacy_side.py','frontend/scripts/authenticated-economy/clients.mjs',
 'frontend/scripts/authenticated-economy/observer.mjs','frontend/scripts/authenticated-economy/runtime.mjs','frontend/scripts/authenticated-economy/source.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async f=>[f,createHash('sha256').update(await readFile(root+f)).digest('hex')])));
const prior=await readFile('/tmp/mp505-ship-legacy-browser-run-6/result.json');
const report={scenario:'class-browser-continuation',status:'running',startedAt:new Date().toISOString(),sourceBefore:sourceEvidence(baseline,{checkoutRoot:root}),
 hashesBefore:await hashes(),priorFailedDriverSha256:createHash('sha256').update(prior).digest('hex'),limits:[
 'Tiny continuation only; the earlier optional-positive-score assertion remains failed. Its actual0-star HTTP claim is a separate valid zero-reward UI observation.',
 'The same already-created actual anonymous and registered host actors are reused; no reset, new signup, new grant or fabricated Auth response.',
 'One local configured host allowlist and real host code endpoint are explicit class setup. Product provider configuration remains original HTTPS; initial SDK uses a transparent same-provider proxy.'
]};
const read=(sql,args)=>observe(sql,args),money=async()=>{
 const [row]=await read(`select a.balance_coins::text as balance,a.committed_coins::text as held,
  (select coalesce(sum(t.balance_delta),0)::text from public.island_treasury_transactions t where t.account_id=a.id) as ledger,
  (select balance::text from public.wallets where player_id=s.island_owner) as owner_private
  from public.island_economy_state s join public.island_economy_accounts a on a.id=s.current_account_id where s.island_owner=$1::uuid`,[host.actorId]);return row;};
await mkdir(output,{recursive:true});let browser,page;
try{
 assert.equal(anonymous.user.is_anonymous,true);report.before=await money();report.primaryBefore=servedSourceEvidence(runtime);
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  '--ignore-certificate-errors-spki-list='+runtime.certificateSpki]});page=await browser.newPage({viewport:{width:1280,height:800}});page.setDefaultTimeout(15000);
 await page.goto('http://127.0.0.1:55107/?oneisland=0',{waitUntil:'domcontentloaded'});
 await page.evaluate(async({session,key})=>{const {createAuthClient}=await import('/src/online/supabase-sdk.js');
  const client=createAuthClient(location.origin+'/provider',key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const answer=await client.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token});
  if(answer.error||answer.data.user?.id!==session.user.id)throw Error('Actual anonymous SDK restoration refused');
  sessionStorage.clear();sessionStorage.setItem('plot-twist-auth-v1',JSON.stringify(answer.data.session));client.auth.stopAutoRefresh();
 },{session:anonymous,key:runtime.anonKey});
 const joined=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/demo/join'&&r.request().method()==='POST',{timeout:20000}).then(reply=>({reply}),error=>({error}));
 await page.goto('http://127.0.0.1:55107/?oneisland=0&join='+encodeURIComponent(code),{waitUntil:'domcontentloaded'});
 await page.locator('.join-form button[type="submit"]').click();const answer=await joined;if(answer.error)throw answer.error;
 assert.equal(answer.reply.status(),200);assert.equal((await answer.reply.json()).admitted,true);
 for(let i=0;i<90;i++){
  let clicked=false;for(const name of [/^Skip all/,'Got it','Skip','Resume']){
   const button=page.locator('dialog[open]').getByRole('button',{name,exact:typeof name==='string'}).first();
   if(await button.isVisible().catch(()=>false)){await button.click({noWaitAfter:true});clicked=true;break;}}
  if(!clicked&&await page.evaluate(()=>window.__island?.world.current?.id==='saltreach_harbor'&&!!window.__island.classDemo))break;
  await page.waitForTimeout(100);
 }
 assert.equal(await page.evaluate(()=>window.__island.world.current.id),'saltreach_harbor');
 let who;for(let i=0;i<30;i++){who=await api(page,'/api/me');if(who.status===200&&who.data.id===anonymous.user.id)break;await page.waitForTimeout(100);}
 assert.equal(who.status,200);assert.equal(who.data.id,anonymous.user.id);
 const beforeGuest=(await read('select balance::text as balance from public.wallets where player_id=$1::uuid',[anonymous.user.id]))[0];
 await page.locator('.hud-menu').click();await page.locator('.shell-screen[open]').getByRole('button',{name:'Harbor',exact:true}).click();
 await page.locator('dialog[open] [data-key="stall:market"]').click();
 await page.waitForFunction(balance=>document.querySelector('.market-modal[open] .harbor-balance')?.textContent.includes(balance),beforeGuest.balance);
 const marketText=await page.locator('.market-modal[open]').innerText();
 const calls=await api(page,'/api/market/calls');assert.equal(calls.status,200);assert.equal(String(calls.data.balance),beforeGuest.balance);
 report.after=await money();assert.deepEqual(report.after,report.before);
 const afterGuest=(await read('select balance::text as balance from public.wallets where player_id=$1::uuid',[anonymous.user.id]))[0];assert.deepEqual(afterGuest,beforeGuest);
 await page.locator('.market-modal[open]').screenshot({path:output+'/class-personal-market.png'});
 report.observation={actualAnonymousSDKVerified:true,visibleClassJoinStatus:200,place:'saltreach_harbor',classLayerLoaded:true,
  visiblePersonalMarket:marketText,personalBalance:beforeGuest.balance,sharedBankAndOriginalOwnerWalletUnchanged:true,guestWalletUnchanged:true};report.status='passed';
}catch(error){report.status='failed';report.error={name:error.name,message:error.message};await page?.screenshot({path:output+'/failure-private.png'}).catch(()=>{});process.exitCode=1;}
finally{await browser?.close();report.finishedAt=new Date().toISOString();report.hashesAfter=await hashes();
 report.sourceAfter=sourceEvidence(baseline,{checkoutRoot:root});report.primaryAfter=servedSourceEvidence(runtime);
 if(JSON.stringify(report.hashesBefore)!==JSON.stringify(report.hashesAfter)){report.status='failed';report.sourceFailure='Measured bytes changed';process.exitCode=1;}
 await writeFile(output+'/result.json',JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({status:report.status,error:report.error?.message}));
