// Real local Auth/API origin scenario; trusted market terms and outcomes are explicit fixtures.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

const argument=name=>{const index=process.argv.indexOf(name);return index<0?null:process.argv[index+1];};
const runtimePath=argument('--runtime'),output=argument('--output');
if(!runtimePath||!output)throw Error('Use --runtime LOCAL_RUNTIME_JSON --output EVIDENCE_DIRECTORY.');
const helper=process.env.MP_ECO_AUTH_HELPERS?pathToFileURL(process.env.MP_ECO_AUTH_HELPERS):new URL('./authenticated-economy/clients.mjs',import.meta.url);
const observer=process.env.MP_ECO_OBSERVER_HELPERS?pathToFileURL(process.env.MP_ECO_OBSERVER_HELPERS):new URL('./authenticated-economy/observer.mjs',import.meta.url);
const {loadRuntime}=await import(helper.href),{observe,install,admit}=await import(observer.href);
const runtime=await loadRuntime(runtimePath);
const root=fileURLToPath(new URL('../../',import.meta.url));
const source=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const productionSource='3bdd8eda16470795fdedd68c42fffab54e5f2ced';
execFileSync('git',['diff','--exit-code',productionSource,'HEAD','--','frontend/src','backend/server','supabase/migrations',':(exclude)backend/server/tests'],{cwd:root,stdio:'pipe'});
const harnessSha256=createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex');
const facts=[],requests=[],startedAt=new Date().toISOString();
await mkdir(output,{recursive:true});
const uid=()=>randomUUID().replaceAll('-','');
const read=(sql,parameters=[])=>observe(sql,parameters,{runtimePath});
const seed=(sql,parameters,purpose)=>install(sql,parameters,purpose,{runtimePath});
function note(event,details={}){facts.push({event,at:new Date().toISOString(),...details});console.log(JSON.stringify({event,...details}));}
async function register(label){
 const email=`${label}-${randomBytes(6).toString('hex')}@example.test`,password=randomBytes(24).toString('base64url');
 const response=await fetch(runtime.providerUrl+'/auth/v1/signup',{method:'POST',headers:{apikey:runtime.anonKey,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
 const session=await response.json();
 assert.equal(response.status,200,'Actual local provider registration failed');
 assert.ok(session.access_token&&session.user?.id,'Actual provider did not return a registered session');
 return {label,actorId:session.user.id,token:session.access_token};
}
async function api(actor,path,{method='GET',body}={}){
 const response=await fetch(runtime.apiUrl+path,{method,headers:{Authorization:'Bearer '+actor.token,'X-Island-Economy-Version':'1',...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await response.json().catch(()=>null);
 requests.push({actor:actor.label,path,method,status:response.status,errorCode:data?.error?.code??null});
 return {status:response.status,data};
}
async function current(owner){
 const rows=await read('select s.current_account_id as account,s.run_epoch as epoch,a.balance_coins::text as balance,a.committed_coins::text as held,(a.balance_coins-a.committed_coins)::text as available from public.island_economy_state s join public.island_economy_accounts a on a.id=s.current_account_id where s.island_owner=$1::uuid',[owner]);
 assert.equal(rows.length,1);return rows[0];
}
async function account(id){
 const rows=await read('select id,state,balance_coins::text as balance,committed_coins::text as held,(select coalesce(sum(t.balance_delta),0)::text from public.island_treasury_transactions t where t.account_id=a.id) as "ledgerBalance",(select coalesce(sum(t.committed_delta),0)::text from public.island_treasury_transactions t where t.account_id=a.id) as "ledgerHeld" from public.island_economy_accounts a where id=$1::uuid',[id]);
 assert.equal(rows.length,1);assert.equal(rows[0].balance,rows[0].ledgerBalance);assert.equal(rows[0].held,rows[0].ledgerHeld);return rows[0];
}
async function openFixture(actor,owner,epoch,actionUid,stake){
 const rows=await seed("with moment as (select clock_timestamp() as value) select public.island_wager_open($1::uuid,$2::uuid,$3::uuid,$4,'market_call','harbor-trust','up',$5::numeric,jsonb_build_object('asset','harbor-trust','price','100','source','live','fetchedAt',moment.value,'quotedAt',moment.value)) as result from moment",
  [actor.actorId,owner.actorId,epoch,actionUid,stake],'Synthetic trusted opening reading; actual product transaction, not natural market HTTP opening');
 return rows[0].result;
}
async function settleFixture(wager){
 assert.ok(Date.now()>=Date.parse(wager.settleAt),'Refusing accelerated market settlement');
 const rows=await seed("with moment as (select clock_timestamp() as value) select public.island_wager_settle($1::uuid,jsonb_build_object('asset','harbor-trust','price','101','source','live','fetchedAt',moment.value,'quotedAt',moment.value)) as result from moment",
  [wager.id],'Synthetic trusted winning reading after the real due time; no natural market outcome is claimed');
 return rows[0].result;
}
async function waitFor(wagers){
 const due=Math.max(...wagers.map(row=>Date.parse(row.settleAt)));
 assert.ok(Number.isFinite(due)&&due-Date.now()<370000,'Unexpected five-minute product deadline');
 while(Date.now()<=due){const remaining=due-Date.now();note('waiting-actual-market-clock',{remainingSeconds:Math.ceil(remaining/1000)});await new Promise(resolve=>setTimeout(resolve,Math.min(30000,remaining+50)));}
}
try{
 const owner=await register('origin-owner'),member=await register('origin-member');
 for(const actor of [owner,member]){const me=await api(actor,'/api/me');assert.equal(me.status,200);assert.equal(me.data.id,actor.actorId);}
 note('actual-provider-bearer-identities',{layer:'actual GoTrue registration and production HTTP verifier',actors:[owner.actorId,member.actorId]});
 const created=await api(owner,'/api/games',{method:'POST',body:{actionUid:uid()}});assert.equal(created.status,200);const code=created.data.game.code;
 await admit(owner.actorId,{coins:200,runtimePath});
 const admittedOwner=await api(owner,'/api/island');assert.equal(admittedOwner.status,200);
 await seed('update public.islands set wave_best=30,next_wave=31 where player_id=$1::uuid',[owner.actorId],'Advanced saved-island Harbor unlock fixture; not naturally earned progress');
 const joined=await api(member,'/api/games/join',{method:'POST',body:{code,actionUid:uid()}});assert.equal(joined.status,200);
 const view=await api(member,'/api/island/visit/'+code);assert.equal(view.status,200);
 const original=await current(owner.actorId),economy={mode:'island_shared',version:1,islandOwner:owner.actorId,runEpoch:original.epoch};
 for(const actor of [owner,member]){
  const attached=await api(actor,'/api/island/session/attach',{method:'POST',body:{economy,sessionId:randomUUID(),expectedGeneration:'0',actionUid:uid()}});
  assert.equal(attached.status,200);
 }
 const wallets=await read('select player_id,balance::text from public.wallets where player_id in ($1::uuid,$2::uuid) order by player_id',[owner.actorId,member.actorId]);
 const captainBefore=await api(owner,'/api/captain');assert.equal(captainBefore.status,200);
 const nativeBody={economy,actionUid:uid(),asset:'harbor-trust',direction:'up',stake:'1'};
 const native=await api(member,'/api/island/wagers/market',{method:'POST',body:nativeBody});
 note('actual-http-market-opener',{layer:'authenticated production HTTP; no source override',status:native.status,errorCode:native.data?.error?.code??null});
 assert.ok([200,409,503].includes(native.status),'Unexpected live-source availability response');
 const smallBody=native.status===200?nativeBody:{...nativeBody,actionUid:uid()};
 const small=native.status===200?native.data:await openFixture(member,owner,original.epoch,smallBody.actionUid,'1');
 assert.equal(small.status,'done');const one=small.receipt.result.wager;
 assert.equal(one.stake,'1');assert.equal(one.accountId,original.account);assert.equal(one.runEpoch,original.epoch);
 const remaining=await current(owner.actorId);assert.equal(remaining.available,'199');
 const allBody={economy,actionUid:uid(),asset:'harbor-trust',direction:'up',stake:remaining.available};
 const all=await openFixture(member,owner,original.epoch,allBody.actionUid,allBody.stake);assert.equal(all.status,'done');const large=all.receipt.result.wager;
 assert.notEqual(one.id,large.id);assert.equal((await current(owner.actorId)).available,'0');
 const refusal=await openFixture(member,owner,original.epoch,uid(),'1');assert.equal(refusal.status,'refused');assert.equal(refusal.reason,'insufficient_funds');
 for(const body of [smallBody,allBody]){
  const replay=await api(member,'/api/island/wagers/market',{method:'POST',body});assert.equal(replay.status,200);assert.equal(replay.data.repeat,true);assert.equal(replay.data.receipt.result.wager.stake,body.stake);
  const conflict=await api(member,'/api/island/wagers/market',{method:'POST',body:{...body,stake:'2'}});assert.equal(conflict.status,409);assert.equal(conflict.data.error.code,'idempotency_conflict');
 }
 note('one-coin-all-available-separate-event-retries',{layer:'fixture-backed real SQL opening plus actual authenticated HTTP retry',oneCoin:one.stake,allAvailable:large.stake,account:await account(original.account)});
 await waitFor([one]);
 const first=await settleFixture(one);assert.equal(first.receipt.result.settlement.outcome,'won');assert.equal(first.receipt.result.settlement.returnedPayout,'2');
 const winnings=await current(owner.actorId);assert.equal(winnings.available,'2');
 const reinvestBody={economy,actionUid:uid(),asset:'harbor-trust',direction:'up',stake:winnings.available};
 const reinvest=await openFixture(member,owner,original.epoch,reinvestBody.actionUid,reinvestBody.stake);assert.equal(reinvest.status,'done');const last=reinvest.receipt.result.wager;
 assert.equal((await current(owner.actorId)).available,'0');
 note('actual-due-payout-reinvested',{layer:'fixture-backed SQL after unmodified five-minute clock',payout:'2',reinvested:last.stake,account:await account(original.account)});
 const resetBody={economy,confirmCode:code,actionUid:uid()};
 const denied=await api(member,'/api/island/fresh-start',{method:'POST',body:resetBody});assert.equal(denied.status,403);
 const reset=await api(owner,'/api/island/fresh-start',{method:'POST',body:resetBody});assert.equal(reset.status,200);assert.equal(reset.data.currentEconomy,null);
 const repeatedReset=await api(owner,'/api/island/fresh-start',{method:'POST',body:resetBody});assert.equal(repeatedReset.status,200);assert.equal(repeatedReset.data.repeat,true);
 const replacement=await current(owner.actorId);assert.notEqual(replacement.account,original.account);assert.notEqual(replacement.epoch,original.epoch);assert.equal(replacement.balance,'200');assert.equal(replacement.held,'0');
 const retired=await account(original.account);assert.equal(retired.state,'retired');assert.equal(retired.held,'201');
 const settledLarge=await settleFixture(large);assert.equal(settledLarge.receipt.origin.accountId,original.account);assert.equal(settledLarge.receipt.origin.runEpoch,original.epoch);assert.equal(settledLarge.receipt.result.settlement.returnedPayout,'398');
 const settledLargeAgain=await settleFixture(large);assert.equal(settledLargeAgain.repeat,true);assert.deepEqual(settledLargeAgain.receipt,settledLarge.receipt);
 const lateReplay=await api(member,'/api/island/wagers/market',{method:'POST',body:allBody});assert.equal(lateReplay.status,200);assert.equal(lateReplay.data.repeat,true);assert.equal(lateReplay.data.currentEconomy,null);assert.equal(lateReplay.data.receipt.origin.accountId,original.account);
 assert.deepEqual(await current(owner.actorId),replacement);
 note('owner-reset-with-open-commitments-and-old-account-settlement',{layer:'actual owner HTTP reset/retry and fixture-backed settlement',memberResetStatus:denied.status,replacement,retiredAfterSettlement:await account(original.account)});
 await waitFor([last]);
 const final=await settleFixture(last);assert.equal(final.receipt.result.settlement.returnedPayout,'4');
 const repeatedFinal=await settleFixture(last);assert.equal(repeatedFinal.repeat,true);assert.deepEqual(repeatedFinal.receipt,final.receipt);
 assert.deepEqual(await current(owner.actorId),replacement);
 const oldFinal=await account(original.account);assert.equal(oldFinal.balance,'402');assert.equal(oldFinal.held,'0');
 const grants=await read("select count(*)::int as count from public.island_treasury_transactions where account_id=$1::uuid and reason='starting_coins'",[replacement.account]);assert.equal(grants[0].count,1);
 const walletAfter=await read('select player_id,balance::text from public.wallets where player_id in ($1::uuid,$2::uuid) order by player_id',[owner.actorId,member.actorId]);assert.deepEqual(walletAfter,wallets);
 const captainAfter=await api(owner,'/api/captain');assert.deepEqual(captainAfter.data,captainBefore.data);
 const page=await api(member,'/api/island/wagers?islandOwner='+owner.actorId+'&product=market_call');assert.equal(page.status,200);assert.equal(page.data.economy.accountId,replacement.account);assert.deepEqual(page.data.items,[]);
 note('retired-origin-completion-isolated-from-current-run',{layer:'committed SQL observer and authenticated current-run page',oldAccount:oldFinal,currentAccount:await account(replacement.account),startingGrantCount:grants[0].count,personalWalletsUnchanged:true,personalCaptainUnchanged:true});
 await writeFile(output+'/result.json',JSON.stringify({result:'passed',source,productionSource,harnessSha256,startedAt,finishedAt:new Date().toISOString(),facts,requests,limitations:['No browser rendering or natural market-feed outcome is claimed.','Admission, advanced unlock and trusted price readings are explicit disposable fixtures.','Financial mutations use existing real SQL product functions; resets/retries/readbacks use real registered-session production HTTP.','Only one-coin/all-available/reinvestment/original-account-reset observations are covered; other acceptance rows remain independent.','No immutable financial row, product clock, HP or outcome column was edited; no hosted service, migration or activation.']},null,2)+'\n');
}catch(error){await writeFile(output+'/failure.json',JSON.stringify({result:'failed',source,productionSource,harnessSha256,startedAt,finishedAt:new Date().toISOString(),failure:{name:error.name,message:error.message,stack:error.stack},facts,requests},null,2)+'\n');throw error;}
