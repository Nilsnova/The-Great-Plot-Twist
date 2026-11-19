// Real anonymous GoTrue identities enter through the normal invited-guest admission gate.
// Only a separate local Auth instance/API enable the existing anonymous/demo capabilities.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createApiClients,requestApi} from './api-clients.mjs';
import {observe,install,admit} from './observer.mjs';
import {sourceEvidence,servedSourceEvidence} from './source.mjs';

const output=process.env.MP_ECO_OUTPUT??'/tmp/mp505-anonymous-member';
await mkdir(output,{recursive:false,mode:0o700});
const uid=()=>randomUUID().replaceAll('-','');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const context=e=>Object.fromEntries(['mode','version','islandOwner','runEpoch'].map(key=>[key,e[key]]));
const files=['anonymous-member.mjs','api-clients.mjs','observer.mjs','runtime.mjs','source.mjs',
 '../../../backend/tools/authenticated_economy/guest_application.py','../../../backend/tools/authenticated_economy/application.py',
 '../../../backend/tools/authenticated_economy/observe.py','../../../backend/tools/authenticated_economy/config.py'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async name=>[name,sha(await readFile(new URL(name,import.meta.url)))])));
const helpersBefore=await hashes(),startedAt=new Date().toISOString(),facts=[];
function check(reply,status,label){assert.equal(reply.status,status,label+': '+JSON.stringify(reply.data));return reply.data;}
function note(event,details){const row={event,at:new Date().toISOString(),...details};facts.push(row);console.log(JSON.stringify(row));}
let env;
try{
 env=await createApiClients({labels:['guest-island-owner']});
 const baseline=env.runtime.expectedCommit,sourceBefore=sourceEvidence(baseline);
 const sourceMetadata=JSON.parse(await readFile(env.runtime.directory+'/guest-api-source.json','utf8'));
 assert.equal(sourceMetadata.expectedProductionBaseline,baseline);assert.equal(sourceMetadata.demoFlag,true);assert.equal(sourceMetadata.demoMode,false);process.kill(sourceMetadata.processId,0);
 const serverEvidence={...sourceEvidence(baseline,{checkoutRoot:sourceMetadata.sourceRoot}),demoFlag:true,demoMode:false,wrapperSha256:sourceMetadata.wrapperSha256};
 const [owner]=env.clients;
 const side=client=>({...client,runtime:{...client.runtime,apiUrl:'http://127.0.0.1:58008'}});
 const sideOwner=side(owner);
 const call=(client,path,options)=>requestApi(client,path,options);
 async function anonymous(label){
  const response=await fetch('http://127.0.0.1:54426/signup',{method:'POST',redirect:'error',headers:{apikey:env.runtime.anonKey,'Content-Type':'application/json'},body:JSON.stringify({data:{acceptanceLabel:label}})});
  assert.equal(response.status,200,'Actual anonymous provider registration');
  const session=await response.json();assert.equal(session.user.is_anonymous,true);assert.ok(session.access_token);
  const verified=await fetch(env.runtime.providerUrl+'/auth/v1/user',{headers:{apikey:env.runtime.anonKey,Authorization:'Bearer '+session.access_token}});
  assert.equal(verified.status,200);const user=await verified.json();assert.equal(user.id,session.user.id);assert.equal(user.is_anonymous,true);
  return {kind:'api-only',label,actorId:user.id,session,runtime:{...env.runtime,apiUrl:'http://127.0.0.1:58008'}};
 }
 const [guest,outsider]=await Promise.all([anonymous('invited-guest'),anonymous('uninvited-guest')]);
 const game=check(await owner.request('/api/games',{method:'POST',body:{actionUid:uid()}}),200,'Owner creates');const code=game.game.code;
 const admitted=await admit(owner.actorId,{coins:2000});const economy=context(admitted.currentEconomy);
 await install('update public.islands set wave_best=20 where player_id=$1::uuid',[owner.actorId],'Explicit saved research-unlock fixture; not earned wave20 progress');
 const before=await call(guest,'/api/island/visit/'+encodeURIComponent(code));check(before,403,'Anonymous before admission');
 const badInvite=await call(guest,'/api/games/join',{method:'POST',body:{code:'ISLE-ZZZZZ',actionUid:uid()}});check(badInvite,404,'Unknown invitation');
 const notAdmitted=await observe('select count(*)::int as count from public.demo_guests where player_id=$1::uuid',[guest.actorId]);assert.equal(notAdmitted[0].count,0);
 const joined=check(await call(guest,'/api/games/join',{method:'POST',body:{code,actionUid:uid()}}),200,'Actual guest invitation');assert.equal(joined.admitted,true);
 const me=check(await call(guest,'/api/me'),200,'Actual provider identity after admission');assert.equal(me.id,guest.actorId);
 const guestRows=await observe('select count(*)::int as count from public.demo_guests where player_id=$1::uuid',[guest.actorId]);assert.equal(guestRows[0].count,1);
 const primaryDisabled=await requestApi({...guest,runtime:env.runtime},'/api/island/visit/'+encodeURIComponent(code));check(primaryDisabled,403,'Primary demo-off gate remains unchanged');
 const outside=await call(outsider,'/api/island/visit/'+encodeURIComponent(code));check(outside,403,'Uninvited anonymous identity');
 note('real-anonymous-identity-and-invitation-admission',{providerVerifiedAnonymous:true,beforeInvite:before.status,badInvite:badInvite.status,admittedCount:1,afterInvite:200,primaryDemoOff:primaryDisabled.status,uninvitedStatus:outside.status});

 for(const actor of [sideOwner,guest])check(await call(actor,'/api/island/session/attach',{method:'POST',body:{economy,sessionId:randomUUID(),expectedGeneration:'0',actionUid:uid()}}),200,'Canonical personal adoption');
 const walletRows=()=>observe('select player_id::text,balance::text from public.wallets where player_id=any($1::uuid[]) order by player_id',[[owner.actorId,guest.actorId,outsider.actorId]]);
 const walletsBefore=await walletRows();
 const view=async actor=>check(await call(actor,'/api/island/visit/'+encodeURIComponent(code)),200,'Shared guest view');
 const bank=async()=>{const rows=await observe('select balance_coins::text as balance,committed_coins::text as held,'
  +'(select coalesce(sum(balance_delta),0)::text from public.island_treasury_transactions where account_id=a.id) as ledger_balance '
  +'from public.island_economy_accounts a where id=$1::uuid',[admitted.currentEconomy.accountId]);assert.equal(rows[0].balance,rows[0].ledger_balance);return rows[0];};
 let expected=2000n;
 for(const [actor,spot] of [[guest,'wall_1'],[sideOwner,'wall_2']]){
  const quote=(await view(actor)).quotes.build.find(q=>q.target.spot===spot&&q.available);assert.ok(quote);
  check(await call(actor,'/api/island/build',{method:'POST',body:{economy,actionUid:uid(),...quote.intent}}),200,'Exact shared build');expected-=BigInt(quote.intent.quotedCoins);
 }
 const demolition=(await view(guest)).quotes.demolish.find(q=>q.target.spot==='wall_2'&&q.available);assert.ok(demolition);
 check(await call(guest,'/api/island/demolish',{method:'POST',body:{economy,actionUid:uid(),...demolition.intent}}),200,'Guest demolishes owner building');expected+=BigInt(demolition.intent.quotedCoins);
 async function research(actor,tier,change=false,excluded=null){
  const quote=(await view(actor)).quotes.research.find(q=>q.target.branch==='cannon'&&q.target.tier===tier&&q.target.change===change&&(excluded===null||q.target.choice!==excluded)&&q.available);assert.ok(quote);
  check(await call(actor,'/api/island/research',{method:'POST',body:{economy,actionUid:uid(),...quote.intent}}),200,'Research permission');expected-=BigInt(quote.intent.quotedCoins);return quote;
 }
 await research(sideOwner,1);const ownerChoice=await research(sideOwner,2);const guestChoice=await research(guest,2,true,ownerChoice.target.choice);
 assert.notEqual(guestChoice.target.choice,ownerChoice.target.choice);
 const reset=await call(guest,'/api/island/fresh-start',{method:'POST',body:{economy,actionUid:uid(),confirmCode:code}});check(reset,403,'Guest does not own island');
 assert.equal((await bank()).balance,String(expected));assert.deepEqual(await walletRows(),walletsBefore);
 note('admitted-anonymous-member-has-equal-spending-and-owner-fences',{guestBuild:200,guestDemolition:200,guestResearchChange:200,guestReset:reset.status,bank:await bank(),personalWalletsUnchanged:true});
 await writeFile(env.runtime.directory+'/guest-wager-client.json',JSON.stringify({actorId:guest.actorId,session:guest.session,economy,code,expectedCommit:baseline},null,2)+'\n',{mode:0o600});
 const helpersAfter=await hashes();assert.deepEqual(helpersAfter,helpersBefore);
 await writeFile(output+'/result.json',JSON.stringify({result:'passed',productionSource:baseline,startedAt,finishedAt:new Date().toISOString(),sourceBefore,sourceAfter:sourceEvidence(baseline),servedSourcesBefore:env.servedSources,servedSourcesAfter:servedSourceEvidence(env.runtime),guestServer:serverEvidence,secondaryAuthComposeSha256:sha(await readFile(env.runtime.directory+'/guest-compose.json')),helpersBefore,helpersAfter,facts,
  limitations:['Actual anonymous Auth and invited-class admission through a separate official GoTrue instance/demo-enabledAPI only; primary services remained frozen/demo-off.','API-only evidence; no anonymous browser login/rendered controls are claimed.','Fresh2000capital/savedresearchunlock are explicit fixtures, not earning/conversion.','The private optional wager client is not committed; successful guest HTTPbet is a separate case.']},null,2)+'\n',{mode:0o600});
}catch(error){process.exitCode=1;await writeFile(output+'/failure.json',JSON.stringify({result:'failed',startedAt,finishedAt:new Date().toISOString(),helpersBefore,facts,error:String(error),stack:error.stack},null,2)+'\n',{mode:0o600});throw error;}
finally{await env?.close();}
