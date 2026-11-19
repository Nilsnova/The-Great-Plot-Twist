// Actual SDK/browser legacy accounting and a physically played shared ship round.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createClients,api,land} from './clients.mjs';
import {observe,install,admit} from './observer.mjs';
import {sourceEvidence,servedSourceEvidence} from './source.mjs';
const candidate='92e7c3b6d68a8636a638606a605efa534ea3fb83',production='64ee02b360d68836b2de9247121ab47dc6a3ecbf';
const runtimePath='/tmp/mp505-provider/runtime.json',output=process.env.MP_ECO_OUTPUT??'/tmp/mp505-ship-legacy-browser';
const root=fileURLToPath(new URL('../../../',import.meta.url)),uid=()=>randomUUID().replaceAll('-','');
const digest=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
const files=['frontend/scripts/authenticated-economy/ship-legacy-browser.mjs','frontend/scripts/authenticated-economy/ship-legacy-front.mjs',
 'backend/tools/authenticated_economy/ship_legacy_side.py','frontend/scripts/authenticated-economy/clients.mjs',
 'frontend/scripts/authenticated-economy/observer.mjs','frontend/scripts/authenticated-economy/runtime.mjs','frontend/scripts/authenticated-economy/source.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async p=>[p,await digest(root+p)])));
const report={scenario:'rendered-ship-and-legacy-browser',status:'running',startedAt:new Date().toISOString(),expectedTestSource:candidate,
 servedProductionCandidate:production,sourceBefore:sourceEvidence(candidate,{checkoutRoot:root}),equivalenceBefore:sourceEvidence(production,{checkoutRoot:root}),
 hashesBefore:await hashes(),steps:[],limits:[
 'One real SDK/restored production-browser actor; no ten-browser cap rerun or human-play claim.',
 'Saved best30/completed wreck and fresh shared admission are explicit local eligibility fixtures, not earned wins/repair payments/conversion.',
 'The ship round uses ordinary physical Fire inputs, real requestAnimationFrame time and unchanged scoring; no stars/result/clock injection.',
 'The side API explicitly enables the demo feature and disables recovery admission, with demo_mode false; actual product services remain unchanged.',
 'The existing oneisland=0 travel opt-out exposes the normal sea-chart controls for this legacy compatibility observation.'
]};
let env;
await mkdir(output,{recursive:true});
const save=()=>writeFile(output+'/result.json',JSON.stringify(report,null,2)+'\n');
const note=async(name,facts)=>{report.steps.push({name,...facts});await save();console.log(name);};
const ok=(answer,status=200)=>{assert.equal(answer.status,status,JSON.stringify(answer.data));return answer.data;};
async function finishEntry(page){
 for(let attempt=0;attempt<90;attempt++){
  const selectors=['.island-card-lobby[open]','.goal-card[open]','.tutorial-card[open]','dialog.cutscene[open]','.shell-screen[open]'];
  let acted=false;
  for(const selector of selectors){const dialog=page.locator(selector);if(!await dialog.count())continue;
   for(const name of ['Look around first','Done','Got it','Skip','Start playing','Resume']){const button=dialog.getByRole('button',{name,exact:true}).first();
    if(await button.isVisible().catch(()=>false)){await button.click({noWaitAfter:true});acted=true;break;}}
   if(acted)break;
  }
  if(!acted&&await page.evaluate(()=>window.__island?.world.current?.id==='home_islet'&&!!window.__island.island.island))return;
  await page.waitForTimeout(150);
 }
 throw Error('Ordinary visible entry did not complete');
}
async function pointer(page,selector){const locator=typeof selector==='string'?page.locator(selector).first():selector;await locator.scrollIntoViewIfNeeded();
 const hit=await locator.evaluate(node=>{const r=node.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
  return {x,y,enabled:!node.disabled,hit:node===document.elementFromPoint(x,y)||node.contains(document.elementFromPoint(x,y))};});
 assert.ok(hit.enabled&&hit.hit,'A physical UI action must hit its current enabled control');await page.mouse.click(hit.x,hit.y);}
try{
 env=await createClients({labels:['ship-legacy-owner'],runtimePath,expectedCommit:production});const actor=env.clients[0],page=actor.page;
 report.servedPrimaryBefore=env.servedSources;
 await page.context().addInitScript(session=>{if(location.origin==='http://127.0.0.1:55107'&&!sessionStorage.getItem('plot-twist-auth-v1'))sessionStorage.setItem('plot-twist-auth-v1',JSON.stringify(session));},actor.session);
 await page.goto('http://127.0.0.1:55107/?oneisland=0',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(async()=>{const {session}=await import('/src/online/session.js');return session.isSignedIn();});
 assert.equal(ok(await api(page,'/api/me')).id,actor.actorId);
 await land(page,{create:true});await finishEntry(page);
 const wallet=async()=>(await observe(`select balance::text as balance,(select count(*)::integer from public.wallet_transactions t where t.player_id=w.player_id) as entries
  from public.wallets w where player_id=$1::uuid`,[actor.actorId],{runtimePath}))[0];
 let island=ok(await api(page,'/api/island'));assert.ok(!island.economy||island.economy.mode==='personal_legacy');
 const initialWallet=await wallet();
 await page.evaluate(()=>window.__island.island.pick('wall_1'));
 const personalCard=await page.locator('.island-card[open]').innerText();assert.match(personalCard,/10/);
 const builtPromise=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/island/build'&&r.request().method()==='POST');
 await pointer(page,'.island-card[open] [data-focus="build"]');const build=await builtPromise;assert.equal(build.status(),200);
 const afterBuild=await wallet();assert.equal(BigInt(afterBuild.balance),BigInt(initialWallet.balance)-10n);
 await note('positive personal island construction through real card',{initialWallet,afterBuild,card:personalCard,transportStatus:200});
 await page.keyboard.press('Escape');
 await install('update public.islands set wave_best=30,next_wave=31,wreck_paid=500 where player_id=$1::uuid',[actor.actorId],
  'Saved ship/Harbor eligibility and completed wreck only, before shared admission; no earned combat/repaired-wreck receipt claim.',{runtimePath});
 await page.evaluate(()=>window.__island.island.load());
 await page.evaluate(()=>window.__island.island.openHarbor());
 const harbor=await page.locator('.island-card[open]').innerText();assert.match(harbor,/Harbor|Harbour/);
 await note('legacy Harbor reachable with personal funding',{card:harbor,hud:await page.locator('.hud-coins').getAttribute('aria-label'),wallet:await wallet()});
 await page.keyboard.press('Escape');await page.keyboard.press('m');await page.locator('.sea-chart[open] .fast-travel').check();
 await pointer(page,'.sea-chart[open] [data-place="lighthouse_isle"]');
 await page.waitForFunction(()=>window.__island?.world.current?.id==='lighthouse_isle'&&!!window.__island.island.point);
 const point=ok(await api(page,'/api/pirate-point')),spot=point.spots.find(s=>!s.built&&s.kinds.includes('wall'))??point.spots.find(s=>!s.built);
 assert.ok(spot,'A fresh eligible global Pirate Point spot is required for this bounded positive UI action');
 await page.evaluate(id=>window.__island.island.pick(id),spot.id);
 const pointBefore=await wallet(),pointCard=await page.locator('.island-card[open]').innerText();
 const pointPromise=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/pirate-point/build'&&r.request().method()==='POST');
 const choice=await page.locator('.island-card[open] [data-focus="build"]').count()?'.island-card[open] [data-focus="build"]':'.island-card[open] .island-choice:not([disabled])';
 await pointer(page,choice);const pointResponse=await pointPromise;assert.equal(pointResponse.status(),200);
 const pointBody=pointResponse.request().postDataJSON(),pointAfter=await wallet();
 const paidPoint=BigInt(pointBefore.balance)-BigInt(pointAfter.balance);assert.ok(paidPoint>0n);
 await note('positive Pirate Point card purchase retains personal funding',{spot:spot.id,kind:pointBody.kind,paidCoins:paidPoint.toString(),before:pointBefore,after:pointAfter,card:pointCard});
 await page.keyboard.press('Escape');await page.keyboard.press('m');await pointer(page,'.sea-chart[open] [data-place="home_islet"]');
 await page.waitForFunction(()=>window.__island?.world.current?.id==='home_islet');
 const legacyCurrent=ok(await api(page,'/api/waves/current?where=own&waveProtocol=1'));assert.equal(legacyCurrent,null);
 await note('supported protocol-one idle browser transport',{status:200,currentWave:null,
  boundary:'Idle transport proof only; no legacy animation/finish is inferred by this row.'});
 const privateBeforeAdmission=await wallet();await admit(actor.actorId,{coins:200,runtimePath});
 await page.evaluate(()=>window.__island.island.load());
 await page.waitForFunction(()=>window.__island?.island.economy?.mode==='island_shared'&&!!window.__island.island.session.proof());
 const shared=ok(await api(page,'/api/island')),origin=shared.economy;assert.equal(origin.treasury.availableCoins,'200');
 const bank=async()=>(await observe(`select a.balance_coins::text as balance,a.committed_coins::text as committed,a.revision::text as revision,
  coalesce(sum(t.balance_delta),0)::text as ledger_balance,coalesce(sum(t.committed_delta),0)::text as ledger_committed,count(t.id)::text as entries
  from public.island_economy_accounts a left join public.island_treasury_transactions t on t.account_id=a.id where a.id=$1::uuid group by a.id`,[origin.accountId],{runtimePath}))[0];
 const beforeFences={bank:await bank(),wallet:await wallet()},fences=[];
 for(const [label,path,options,expected] of [
  ['missing capability','/api/island',{capability:null},409],['unsupported capability','/api/island',{capability:'999'},409],
  ['old protocol on admitted shared island','/api/waves/start',{method:'POST',body:{where:'own',waveProtocol:1,actionUid:uid()}},409],
 ]){const reply=await api(page,path,options);ok(reply,expected);fences.push({label,status:reply.status,code:reply.data.error.code});}
 assert.deepEqual({bank:await bank(),wallet:await wallet()},beforeFences);
 await note('old-client browser requests fail closed after admission',{fences,unchangedMoney:true});
 await page.evaluate(()=>window.__island.island.openWreck());
 await page.locator('.island-card[open] [data-focus="boat-broadside"]:not([disabled])').waitFor();
 const shipCard=await page.locator('.island-card[open]').innerText();assert.match(shipCard,/Island/);
 const startResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/island/boat/start'&&r.request().method()==='POST');
 await pointer(page,'.island-card[open] [data-focus="boat-broadside"]');const started=await startResponse;assert.equal(started.status(),200);
 const startedBody=await started.json();assert.equal(startedBody.receipt.origin.accountId,origin.accountId);
 await page.waitForFunction(()=>document.querySelector('.boat-game')?.dataset.phase==='play');
 const entered=await page.evaluate(()=>performance.now());
 const centers=await page.evaluate(async code=>{const r=await import('/src/pirates/boat/rules.js');return r.passesOf(r.boatSalt(code,30,'broadside'),r.boatDifficulty('broadside',30)).map(p=>Math.floor((p.from+p.to)/2)*100);},shared.code);
 const claimResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/island/boat/claim'&&r.request().method()==='POST',{timeout:35000});
 const inputs=[];
 for(const targetMs of centers){const now=await page.evaluate(()=>performance.now());if(entered+targetMs>now)await page.waitForTimeout(entered+targetMs-now);
  await pointer(page,'.boat-fire');inputs.push({targetMs,actualMs:await page.evaluate(()=>performance.now())-entered});}
 const claimed=await claimResponse;assert.equal(claimed.status(),200);const claim=await claimed.json(),claimBody=claimed.request().postDataJSON();
 assert.ok(claimBody.stars>=1,'Physically played round must earn at least one star for positive accounting proof');
 assert.equal(claim.receipt.origin.accountId,origin.accountId);assert.equal(claim.receipt.result.stars,claimBody.stars);
 const earned=BigInt(claim.receipt.result.coins);assert.ok(earned>0n);const finalBank=await bank();
 assert.equal(BigInt(finalBank.balance),200n+earned);assert.equal(finalBank.balance,finalBank.ledger_balance);assert.equal(finalBank.committed,finalBank.ledger_committed);
 assert.equal(finalBank.revision,finalBank.entries);assert.deepEqual(await wallet(),privateBeforeAdmission);
 await page.locator('.boat-result:not([hidden])').waitFor();
 await page.waitForFunction(()=>document.querySelector('.boat-result-line')?.textContent.includes('Island treasury'));
 const resultText=await page.locator('.boat-result').innerText();assert.match(resultText,/Island treasury/);
 await page.locator('.boat-game').screenshot({path:output+'/shared-ship-result.png'});
 await pointer(page,'.boat-shore');
 await note('physically played shared boat round claims only island funds',{card:shipCard,stars:claimBody.stars,coins:earned.toString(),inputs,
  resultText,bank:finalBank,privateWalletUnchanged:true,roundStartedThroughUI:true,claimSubmittedByUnchangedScene:true});
 const classCode=(await readFile('/tmp/mp505-ship-legacy/class-code','utf8')).trim();
 const anonymous=JSON.parse(await readFile('/tmp/mp505-ship-legacy/anonymous-session.json','utf8'));
 assert.equal(anonymous.user.is_anonymous,true);
 await page.evaluate(session=>{sessionStorage.clear();sessionStorage.setItem('plot-twist-auth-v1',JSON.stringify(session));},anonymous);
 const admittedResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/demo/join'&&r.request().method()==='POST',{timeout:30000});
 await page.goto('http://127.0.0.1:55107/?oneisland=0&join='+encodeURIComponent(classCode),{waitUntil:'domcontentloaded'});
 await page.locator('.join-form input[name="code"]').waitFor();
 await pointer(page,'.join-form button[type="submit"]');
 const admitted=await admittedResponse;assert.equal(admitted.status(),200);assert.equal((await admitted.json()).admitted,true);
 for(let attempt=0;attempt<90;attempt++){
  for(const name of ['Skip','Got it','Resume']){const button=page.getByRole('button',{name,exact:true}).first();
   if(await button.isVisible().catch(()=>false))await button.click({noWaitAfter:true});}
  if(await page.evaluate(()=>window.__island?.world.current?.id==='saltreach_harbor'&&!!window.__island.classDemo))break;
  await page.waitForTimeout(150);
 }
 assert.equal(await page.evaluate(()=>window.__island.world.current.id),'saltreach_harbor');
 const guestWho=ok(await api(page,'/api/me'));assert.equal(guestWho.id,anonymous.user.id);
 const guestBefore=(await observe('select balance::text as balance from public.wallets where player_id=$1::uuid',[anonymous.user.id],{runtimePath}))[0];
 const guestMarket=ok(await api(page,'/api/market/calls'));
 assert.equal(String(guestMarket.coins),guestBefore.balance);
 assert.equal(await page.locator('.hud-coins[data-economy="shared"]').count(),0);
 await pointer(page,'.hud-menu');await pointer(page,page.locator('.shell-screen[open]').getByRole('button',{name:'Harbor',exact:true}));
 await pointer(page,'dialog[open] [data-key="stall:market"]');
 await page.locator('.market-modal[open]').waitFor();
 await page.waitForFunction(balance=>document.querySelector('.market-modal[open]')?.textContent.includes(balance),guestBefore.balance);
 const classMarketCard=await page.locator('.market-modal[open]').innerText();assert.ok(classMarketCard.includes(guestBefore.balance));
 await page.locator('.market-modal[open]').screenshot({path:output+'/class-personal-market.png'});
 const bankAfterClass=await bank();assert.deepEqual(bankAfterClass,finalBank);assert.deepEqual(await wallet(),privateBeforeAdmission);
 await note('genuine anonymous class-code UI enters personal Harbor',{actualAnonymousProvider:true,admissionThroughVisibleJoin:true,
  actualPlace:'saltreach_harbor',personalCoins:guestBefore.balance,marketCoins:String(guestMarket.coins),marketCard:classMarketCard,sharedBankUnchanged:true,
  hostSetup:'One real registered local host was explicitly allowlisted only on the side API; normal host code endpoint generated the disposable code.'});
 report.status='passed';
}catch(error){report.status='failed';report.error={name:error.name,message:error.message};process.exitCode=1;}
finally{await env?.close();report.finishedAt=new Date().toISOString();report.hashesAfter=await hashes();
 if(JSON.stringify(report.hashesBefore)!==JSON.stringify(report.hashesAfter)){report.status='failed';report.sourceFailure='Measured helper/launcher/scenario changed';process.exitCode=1;}
 try{report.sourceAfter=sourceEvidence(candidate,{checkoutRoot:root});report.equivalenceAfter=sourceEvidence(production,{checkoutRoot:root});}
 catch(error){report.status='failed';report.sourceFailure=String(error);process.exitCode=1;}
 await save();}
console.log(JSON.stringify({status:report.status,error:report.error?.message,steps:report.steps.length}));
