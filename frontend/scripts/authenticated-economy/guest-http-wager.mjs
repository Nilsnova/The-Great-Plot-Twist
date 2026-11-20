// A real anonymous provider token, already invited by the product, opens one actual HTTP wager.
// The supplied private client file is never copied or printed.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);if(i<0)throw Error('Required '+name);return resolve(args[i+1]);};
const clientFile=option('--client-file'),harness=option('--harness-root'),sideDir=option('--side-directory'),output=option('--output');
const {observe}=await import(pathToFileURL(join(harness,'frontend/scripts/authenticated-economy/observer.mjs')).href);
const {sourceEvidence}=await import(pathToFileURL(join(harness,'frontend/scripts/authenticated-economy/source.mjs')).href);
const root=resolve(new URL('../../../',import.meta.url).pathname);
const digest=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
const self=new URL(import.meta.url),factory=join(root,'backend/tools/authenticated_economy/wager_http_fixture.py');
const report={scenario:'real-anonymous-invited-guest-http-wager',status:'running',limits:[
 'Actual anonymous GoTrue identity/invitation was prepared separately; this case verifies the actual token against the side production API.',
 'Only external quote transport is a declared fixture; no natural-feed, rendered UI or football result claim.',
 'One-coin opening/replay only; no settlement claim is made by this bounded guest case.']};
const privateData=JSON.parse(await readFile(clientFile,'utf8'));
function find(value,predicate){if(value&&typeof value==='object'){if(predicate(value))return value;for(const nested of Object.values(value)){const got=find(nested,predicate);if(got)return got;}}return null;}
const session=find(privateData,v=>typeof v.access_token==='string'),e=find(privateData,v=>v.mode==='island_shared'&&typeof v.islandOwner==='string'&&typeof v.runEpoch==='string');
assert.ok(session&&e,'The supplied private file must contain the actual session and selected island context');
const claims=JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url'));
assert.equal(claims.is_anonymous,true);assert.equal(claims.role,'authenticated');
async function request(path,body){const response=await fetch('http://127.0.0.1:58006'+path,{method:body?'POST':'GET',redirect:'error',headers:{Authorization:'Bearer '+session.access_token,
 'X-Island-Economy-Version':'1',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;}
const listingPath='/api/island/wagers?islandOwner='+e.islandOwner+'&runEpoch='+e.runEpoch+'&product=market_call';
const wallet=()=>observe(`select balance::text as balance,(select count(*)::integer from public.wallet_transactions t where t.player_id=w.player_id) as entries,
 coalesce((select sum(t.delta)::text from public.wallet_transactions t where t.player_id=w.player_id),'0') as summed from public.wallets w where player_id=$1::uuid`,[claims.sub]);
try{
 report.hashesBefore={scenario:await digest(self),factory:await digest(factory)};
 report.sourceBefore=sourceEvidence('64ee02b360d68836b2de9247121ab47dc6a3ecbf',{checkoutRoot:root});
 const manifest=JSON.parse(await readFile(join(sideDir,'side-api-source.json'),'utf8'));assert.equal(manifest.factorySha256,report.hashesBefore.factory);assert.equal(manifest.demoFeatureFlag,true);assert.equal(manifest.demoMode,false);process.kill(manifest.processId,0);
 const who=await request('/api/me');assert.equal(who.id,claims.sub);
 const before=await request(listingPath);assert.equal(before.choices.find(c=>c.id==='harbor-trust').open,true);
 const walletsBefore=await wallet();assert.equal(walletsBefore.length,1);
 const body={economy:Object.fromEntries(['mode','version','islandOwner','runEpoch'].map(k=>[k,e[k]])),actionUid:randomUUID().replaceAll('-',''),asset:'harbor-trust',direction:'up',stake:'1'};
 const opened=await request('/api/island/wagers/market',body);assert.equal(opened.receipt.result.wager.stake,'1');assert.equal(opened.receipt.actorId,claims.sub);
 assert.equal(opened.receipt.origin.accountId,before.economy.accountId);assert.equal(opened.receipt.result.financialReceipt.balanceDelta,'0');assert.equal(opened.receipt.result.financialReceipt.committedDelta,'1');
 const after=await request(listingPath);assert.equal(BigInt(after.economy.treasury.availableCoins),BigInt(before.economy.treasury.availableCoins)-1n);
 const replay=await request('/api/island/wagers/market',body);assert.equal(replay.repeat,true);assert.deepEqual(replay.receipt,opened.receipt);
 assert.deepEqual(await wallet(),walletsBefore);
 report.result={actualAnonymousTokenVerified:true,invitedGuestStakeHTTP:200,stake:'1',beforeAvailable:before.economy.treasury.availableCoins,
 afterAvailable:after.economy.treasury.availableCoins,receipt:opened.receipt,exactReplay:true,privateWalletHistoryUnchanged:true,demoFeatureFlag:true,demoMode:false};report.status='passed';
}catch(error){report.status='failed';report.failure={name:error.name,message:error.message};process.exitCode=1;}
finally{report.hashesAfter={scenario:await digest(self),factory:await digest(factory)};report.hashesUnchanged=JSON.stringify(report.hashesBefore)===JSON.stringify(report.hashesAfter);
 if(!report.hashesUnchanged){report.status='failed';process.exitCode=1;}await writeFile(output,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({status:report.status,stake:report.result?.stake,before:report.result?.beforeAvailable,after:report.result?.afterAvailable,failure:report.failure?.message}));
