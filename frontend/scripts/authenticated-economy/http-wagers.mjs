// Actual authenticated HTTP financial flow; only the separately running quote provider transport is a fixture.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';

const options=process.argv.slice(2);
const arg=name=>{const i=options.indexOf(name);if(i<0||!options[i+1])throw Error('Required option '+name);return resolve(options[i+1]);};
const harness=arg('--harness-root'),runtimePath=arg('--runtime'),directory=arg('--side-directory'),output=arg('--output');
const root=resolve(new URL('../../../',import.meta.url).pathname);
const helper=name=>import(pathToFileURL(join(harness,'frontend/scripts/authenticated-economy',name)).href);
const {createApiClients}=await helper('api-clients.mjs'),{observe,install,admit}=await helper('observer.mjs');
const {servedSourceEvidence,sourceEvidence}=await helper('source.mjs');
const freeze=JSON.parse(await readFile(join(resolve(runtimePath,'..'),'helper-freeze.json'),'utf8'));
const digest=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
const ownPaths=['frontend/scripts/authenticated-economy/http-wagers.mjs','backend/tools/authenticated_economy/wager_http_fixture.py',
 'backend/tools/authenticated_economy/application.py','backend/tools/authenticated_economy/config.py'];
async function hashes(){const result={};for(const path of ownPaths)result[path]=await digest(join(root,path));
 for(const [path,expected] of Object.entries(freeze.hashes)){const actual=await digest(join(harness,path));assert.equal(actual,expected,path);result['prepared:'+path]=actual;}return result;}
const uid=()=>randomUUID().replaceAll('-','');
const context=e=>Object.fromEntries(['mode','version','islandOwner','runEpoch'].map(k=>[k,e[k]]));
const checked=(r,status=200)=>{assert.equal(r.status,status,JSON.stringify(r.data));return r.data;};
const sql=(statement,params=[])=>observe(statement,params,{runtimePath});
const report={scenario:'authenticated-http-market-wagers',status:'running',assertions:[],limits:[
 'Only external Binance quote transport is a declared increasing-price fixture; it is not a natural feed.',
 'Saved Harbor record4 is a pre-admission eligibility fixture, not earned combat progression.',
 'Real GoTrue tokens, unmodified production HTTP/financial handlers, defaultUTCclocks and actual five-minute deadlines.',
 'API-only; no rendered UI or football/natural-return claim. Global scheduler counts can include other disposable fixture wagers.']};
await mkdir(output,{recursive:true});
const persist=()=>writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
const check=async(name,facts)=>{report.assertions.push({name,...facts});await persist();console.log(name);};
let environment;
async function side(client,path,{method='GET',body}={}){
 assert.ok(path.startsWith('/api/'));const headers={Authorization:'Bearer '+client.session.access_token,'X-Island-Economy-Version':'1'};
 if(body!==undefined)headers['Content-Type']='application/json';
 const response=await fetch('http://127.0.0.1:58006'+path,{method,headers,redirect:'error',...(body===undefined?{}:{body:JSON.stringify(body)})});
 return {status:response.status,data:await response.json()};
}
async function sources(){const sideSource=JSON.parse(await readFile(join(directory,'side-api-source.json'),'utf8'));process.kill(sideSource.processId,0);
 assert.equal(sideSource.factorySha256,await digest(join(root,ownPaths[1])));assert.equal(sideSource.port,58006);
 assert.equal(sideSource.productionCandidate,freeze.expectedCommit);assert.equal(sideSource.demoFeatureFlag,true);assert.equal(sideSource.demoMode,false);
 return {primary:servedSourceEvidence(environment.runtime),side:{...sideSource,...sourceEvidence(freeze.expectedCommit,{checkoutRoot:root})}};}
async function money(account){const rows=await sql(`select a.state,a.balance_coins::text as balance,a.committed_coins::text as committed,
 (a.balance_coins-a.committed_coins)::text as available,a.revision::text as revision,coalesce(sum(t.balance_delta),0)::text as summed_balance,
 coalesce(sum(t.committed_delta),0)::text as summed_committed,count(t.id)::text as entries from public.island_economy_accounts a
 left join public.island_treasury_transactions t on t.account_id=a.id where a.id=$1::uuid group by a.id`,[account]);
 assert.equal(rows.length,1);const r=rows[0];assert.equal(r.balance,r.summed_balance);assert.equal(r.committed,r.summed_committed);assert.equal(r.revision,r.entries);return r;}
async function wallets(actors){return sql(`select w.player_id,w.balance::text as balance,(select count(*)::text from public.wallet_transactions t where t.player_id=w.player_id) as entries,
 coalesce((select sum(t.delta)::text from public.wallet_transactions t where t.player_id=w.player_id),'0') as summed from public.wallets w where w.player_id=any($1::uuid[]) order by w.player_id`,[actors]);}
async function scheduler(){const token=(await readFile(join(directory,'cron-token'),'utf8')).trim();const response=await fetch('http://127.0.0.1:58006/api/internal/island-wagers/settle',{
 method:'POST',headers:{Authorization:'Bearer '+token},redirect:'error'});assert.equal(response.status,200);return response.json();}
async function waitForSettlement(rows){const deadline=Math.max(...rows.map(r=>Date.parse(r.reply.receipt.result.wager.settleAt)))+1500;
 const started=Date.now();report.waitingFor=rows.map(r=>r.reply.receipt.result.wager.settleAt);await persist();
 while(Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,Math.min(5000,deadline-Date.now())));
 const wake=await scheduler();report.waitingFor=null;return {elapsedWaitSeconds:Math.round((Date.now()-started)/10)/100,wake};}
try{
 report.hashesBefore=await hashes();
 environment=await createApiClients({labels:['http-wager-owner','http-wager-member'],runtimePath,expectedCommit:freeze.expectedCommit});
 report.sourceBefore=await sources();report.productionCandidate=freeze.expectedCommit;report.preparedHelperCommit=freeze.helperCommit;
 const [owner,member]=environment.clients;
 for(const client of environment.clients)assert.equal(checked(await side(client,'/api/me')).id,client.actorId);
 checked(await side(owner,'/api/games',{method:'POST',body:{actionUid:uid()}}));const initial=checked(await side(owner,'/api/island'));
 await install('update public.islands set wave_best=4,next_wave=5 where player_id=$1::uuid returning wave_best',[owner.actorId],
  'Initial saved Harbor eligibility fixture atrecord4 before admission; no victory or history row is fabricated',{runtimePath});
 await admit(owner.actorId,{coins:200,runtimePath});checked(await side(member,'/api/games/join',{method:'POST',body:{code:initial.code,actionUid:uid()}}));
 const view=checked(await side(owner,'/api/island')),economy=view.economy,intent=context(economy),account=economy.accountId;
 const privateBefore=await wallets(environment.clients.map(c=>c.actorId));assert.equal(privateBefore.length,2);
 const listing=checked(await side(member,'/api/island/wagers?islandOwner='+owner.actorId+'&product=market_call&runEpoch='+economy.runEpoch));
 assert.equal(listing.choices.find(c=>c.id==='harbor-trust').open,true);
 await check('real Auth on side API and an actual open trusted-quote offer',{port:58006,quoteFixtureOnly:true,demoFeatureFlag:true,demoMode:false,startingCoins:'200'});
 async function open(client,stake,direction){const body={economy:intent,actionUid:uid(),asset:'harbor-trust',direction,stake:String(stake)};
  const reply=checked(await side(client,'/api/island/wagers/market',{method:'POST',body}));assert.equal(reply.receipt.result.wager.stake,String(stake));
  assert.equal(reply.receipt.origin.accountId,account);return {client,body,reply};}
 const first=await open(member,1,'up'),second=await open(owner,1,'down'),all=await open(member,198,'up');const opened=[first,second,all];
 const held=await money(account);assert.equal(held.available,'0');assert.equal(held.committed,'200');
 const replay=checked(await side(member,'/api/island/wagers/market',{method:'POST',body:first.body}));assert.equal(replay.repeat,true);assert.deepEqual(replay.receipt,first.reply.receipt);
 const changed=checked(await side(member,'/api/island/wagers/market',{method:'POST',body:{...first.body,stake:'2'}}),409);assert.equal(changed.error.code,'idempotency_conflict');
 const noFunds=checked(await side(owner,'/api/island/wagers/market',{method:'POST',body:{...second.body,actionUid:uid(),stake:'1'}}),409);assert.equal(noFunds.error.code,'insufficient_funds');
 assert.deepEqual(await money(account),held);
 await check('one coin, independent same-event positions and all available budget open through HTTP',{receipts:opened.map(r=>r.reply.receipt),held,exactReplay:true,changedCode:changed.error.code,unaffordableCode:noFunds.error.code});
 const firstWait=await waitForSettlement(opened);
 const settlements=await sql(`select w.selection,w.stake::text as stake,s.outcome,s.returned_payout::text as payout from public.island_wagers w join public.island_wager_settlements s on s.wager_id=w.id where w.id=any($1::uuid[]) order by w.stake,w.selection`,[opened.map(r=>r.reply.receipt.result.wager.id)]);
 assert.equal(settlements.length,3);assert.deepEqual(settlements.map(r=>[r.stake,r.selection,r.outcome,r.payout]),[['1','down','lost','0'],['1','up','won','2'],['198','up','won','396']]);
 const won=await money(account);assert.equal(won.available,'398');assert.equal(won.committed,'0');
 await scheduler();assert.deepEqual(await money(account),won);
 await check('first real five-minute maturity settles through normal CRON HTTP exactly once',{...firstWait,settlements,account:won});
 const reinvested=await open(owner,398,'up');assert.equal((await money(account)).available,'0');
 const resetBody={economy:intent,confirmCode:initial.code,actionUid:uid()};const reset=checked(await side(owner,'/api/island/fresh-start',{method:'POST',body:resetBody}));
 assert.equal(reset.repeat,false);const replacement=checked(await side(owner,'/api/island')).economy;assert.notEqual(replacement.accountId,account);assert.equal(replacement.treasury.availableCoins,'200');
 const newBefore=await money(replacement.accountId),oldBefore=await money(account);assert.equal(oldBefore.state,'retired');
 const historical=checked(await side(owner,'/api/island/wagers/market',{method:'POST',body:reinvested.body}));assert.equal(historical.repeat,true);assert.deepEqual(historical.receipt,reinvested.reply.receipt);assert.equal(historical.currentEconomy,null);
 const oldFresh=checked(await side(member,'/api/island/wagers/market',{method:'POST',body:{...first.body,actionUid:uid()}}),409);
 assert.ok(['economy_epoch_mismatch','economy_path_unavailable'].includes(oldFresh.error.code));assert.deepEqual(await money(replacement.accountId),newBefore);assert.deepEqual(await money(account),oldBefore);
 await check('entire winnings reinvest and actual owner reset preserve original scope',{reinvested:reinvested.reply.receipt,oldFreshCode:oldFresh.error.code,oldBefore,newBefore,historicalReplay:true});
 const secondWait=await waitForSettlement([reinvested]);
 const late=await sql('select outcome,returned_payout::text as payout from public.island_wager_settlements where wager_id=$1::uuid',[reinvested.reply.receipt.result.wager.id]);
 assert.deepEqual(late,[{outcome:'won',payout:'796'}]);const finalOld=await money(account);assert.equal(finalOld.balance,'796');assert.equal(finalOld.committed,'0');
 assert.deepEqual(await money(replacement.accountId),newBefore);const resetAgain=checked(await side(owner,'/api/island/fresh-start',{method:'POST',body:resetBody}));assert.equal(resetAgain.repeat,true);assert.deepEqual(resetAgain.receipt,reset.receipt);
 assert.deepEqual(await money(replacement.accountId),newBefore);assert.deepEqual(await wallets(environment.clients.map(c=>c.actorId)),privateBefore);
 await check('second real maturity credits only the retired origin and preserves private wallets',{...secondWait,late,old:finalOld,replacement:newBefore,privateWalletHistoriesUnchanged:true,oneReplacementGrant:true});
 report.status='passed';
}catch(error){report.status='failed';report.failure={name:error.name,message:error.message};process.exitCode=1;console.error(error.stack);}
finally{
 if(environment){report.sourceAfter=await sources();await environment.close();}
 report.hashesAfter=await hashes();report.hashesUnchanged=JSON.stringify(report.hashesAfter)===JSON.stringify(report.hashesBefore);
 if(!report.hashesUnchanged){report.status='failed';report.sourceFailure='A measured factory/scenario/helper source changed';process.exitCode=1;}
 await persist();
}
console.log(JSON.stringify({status:report.status,assertions:report.assertions.length,failure:report.failure?.message}));
