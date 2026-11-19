// Isolated real-provider zero-budget recovery; market terms/outcome and saved unlocks are labeled fixtures.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL,fileURLToPath} from 'node:url';
const argument=name=>{const index=process.argv.indexOf(name);return index<0?null:process.argv[index+1];};
const runtimePath=argument('--runtime'),directory=argument('--output');
if(!runtimePath||!directory)throw Error('Use --runtime LOCAL_RUNTIME_JSON --output EVIDENCE_DIRECTORY.');
const helpers=process.env.MP_ECO_AUTH_HELPERS?pathToFileURL(process.env.MP_ECO_AUTH_HELPERS):new URL('./authenticated-economy/clients.mjs',import.meta.url);
const observer=process.env.MP_ECO_OBSERVER_HELPERS?pathToFileURL(process.env.MP_ECO_OBSERVER_HELPERS):new URL('./authenticated-economy/observer.mjs',import.meta.url);
const {createClients,api,land}=await import(helpers.href),{observe,install,admit}=await import(observer.href);
const root=fileURLToPath(new URL('../../',import.meta.url));
const source=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const harnessSha256=createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex');
const production='3bdd8eda16470795fdedd68c42fffab54e5f2ced';
execFileSync('git',['diff','--exit-code',production,'HEAD','--','frontend/src','backend/server',':(exclude)backend/server/tests'],{cwd:root,stdio:'pipe'});
await mkdir(directory,{recursive:true});
const facts=[],requests=[],startedAt=new Date().toISOString();let fixture;
const assert=(value,message)=>{if(!value)throw Error(message);};
const options={runtimePath};
const read=(sql,parameters=[])=>observe(sql,parameters,options);
const seed=(sql,parameters,purpose)=>install(sql,parameters,purpose,options);
const note=(event,details={})=>{facts.push({event,at:new Date().toISOString(),...details});console.log(JSON.stringify({event,...details}));};
const current=async(owner)=>{const rows=await read('select s.current_account_id as account,s.run_epoch as epoch,a.balance_coins::text as balance,a.committed_coins::text as held,(a.balance_coins-a.committed_coins)::text as available from public.island_economy_state s join public.island_economy_accounts a on a.id=s.current_account_id where s.island_owner=$1::uuid',[owner]);assert(rows.length===1,'Missing original current account');return rows[0];};
try{
 fixture=await createClients({labels:['zero-owner','zero-member'],runtimePath});
 note('actual-provider-identities-ready');
 const [owner,member]=fixture.clients;
 for(const client of fixture.clients)client.page.on('request',request=>{const url=new URL(request.url());if(url.pathname.startsWith('/api/')&&request.method()==='POST'){
  let body;try{body=request.postDataJSON();}catch{}requests.push({client:client.label,path:url.pathname,uid:body?.actionUid??null});}});
 await land(owner.page,{create:true});
 note('owner-game-created');
 let own=await api(owner.page,'/api/island');assert(own.status===200,'Owner island did not load');const code=own.data.code;
 await admit(owner.actorId,{coins:200,runtimePath});
 await seed('update public.islands set wave_best=30,next_wave=31,wreck_paid=0 where player_id=$1::uuid',[owner.actorId],
  'Advanced saved-island unlock fixture for bounded zero-funds acceptance; not a naturally reached record');
 await owner.page.evaluate(async()=>{await window.__island.island.load();await window.__island.island.session.ensure();});
 note('owner-shared-read-refreshed');
 await land(member.page,{join:code});
 note('member-game-joined');
 await member.page.waitForFunction(()=>!!window.__island?.island?.session?.proof(),null,{timeout:30000});
 const snapshot=async()=>{const answer=await api(member.page,'/api/island/visit/'+code);assert(answer.status===200,'Member shared snapshot refused');return answer.data;};
 async function mutate(action,selector,number){const row=await snapshot(),quote=row.quotes[action].find(quote=>Object.entries(selector).every(([key,value])=>quote.target[key]===value));
  assert(quote?.available,'The ordinary '+action+' quote is unavailable');const economy=Object.fromEntries(['mode','version','islandOwner','runEpoch'].map(key=>[key,row.economy[key]]));
  const answer=await api(member.page,'/api/island/'+action,{method:'POST',body:{...quote.intent,economy,code,actionUid:'zero_provider_'+action+'_'+number}});assert(answer.status===200,'Ordinary '+action+' failed: '+answer.status);return answer.data;}
 await mutate('build',{spot:'wall_1',kind:'wall'},1);await mutate('build',{spot:'cannon_1',kind:'cannon'},2);
 await mutate('demolish',{spot:'wall_1'},3);await mutate('demolish',{spot:'cannon_1'},4);
 const afterDemolition=await snapshot(),original=await current(owner.actorId);
 assert(!afterDemolition.spots.some(row=>row.built),'A paid defense survived full demolition');assert(original.available==='180'&&original.held==='0','Actual-cost demolition sequence did not conserve 180');
 note('real-authenticated-core-actions',{balance:original.balance,held:original.held,available:original.available,defenses:0});
 const opening=await seed("with moment as (select clock_timestamp() as value) select public.island_wager_open($1::uuid,$2::uuid,$3::uuid,$4,'market_call','harbor-trust','up',$5::numeric,jsonb_build_object('asset','harbor-trust','price','100','source','live','fetchedAt',moment.value,'quotedAt',moment.value)) as result from moment",
  [member.actorId,owner.actorId,original.epoch,'zero_provider_all_in_001',original.available],
  'Trusted fixture market terms for the actual shared wager transaction; no natural feed or Harbor HTTP success is claimed');
 const opened=opening[0]?.result;assert(opened?.status==='done','Fixture-backed valid all-in opening refused');
 const wager=opened.receipt.result.wager;
 assert((await current(owner.actorId)).available==='0','All-in did not reserve every available coin');
 note('fixture-backed-all-in',{stake:wager.stake,settleAt:wager.settleAt,terms:'Synthetic trusted market reading; actual product transaction and actual wait'});
 const due=Date.parse(wager.settleAt);assert(Number.isFinite(due)&&due-Date.now()<370000,'Unexpected market settlement wait');
 while(Date.now()<=due){const remaining=Math.max(0,due-Date.now());note('waiting-normal-market-clock',{remainingSeconds:Math.ceil(remaining/1000)});await new Promise(resolve=>setTimeout(resolve,Math.min(30000,remaining+50)));}
 const losing=await seed("with moment as (select clock_timestamp() as value) select public.island_wager_settle($1::uuid,jsonb_build_object('asset','harbor-trust','price','99','source','live','fetchedAt',moment.value,'quotedAt',moment.value)) as result from moment",
  [wager.id],'Synthetic trusted losing market reading after the actual due time; not natural-feed acceptance');
 assert(losing[0]?.result?.receipt?.result?.settlement?.outcome==='lost','Fixture-backed loss did not settle');
 assert((await current(owner.actorId)).balance==='0'&&(await current(owner.actorId)).held==='0','Lost all-in left cash or commitments');
 await member.page.evaluate(()=>window.__island.island.refreshDefended());
 const departed=await owner.page.evaluate(()=>window.__island.island.session.leave());assert(departed?.ok!==false,'Owner control departure refused');await owner.page.goto('about:blank');
 await member.page.evaluate(()=>window.__island.island.session.ensure());
 const authority=await read('select public.island_economy_authority($1::uuid,$2::uuid) as value',[member.actorId,owner.actorId]);
 assert(authority[0].value.session_leader_id===member.actorId,'Absent owner still controls the bell');
 await member.page.evaluate(()=>window.__island.island.pick('island_bell'));
 const button=member.page.locator('.island-card[open] [data-focus="bell"]');assert(await button.isEnabled(),'Zero balance blocked the ordinary bell');
 await member.page.screenshot({path:directory+'/zero-member-normal-bell.png'});
 const [response]=await Promise.all([member.page.waitForResponse(reply=>new URL(reply.url()).pathname==='/api/waves/start'&&reply.request().method()==='POST'),button.click()]);
 assert(response.status()===200,'Actual rendered member bell failed');const wave=await response.json();
 assert(wave.wave===31&&!wave.initialSnapshot.structures.length&&wave.initialSnapshot.participants.length===1,'Free attempt changed ordinary wave, defenses or frozen roster');
 assert((await current(owner.actorId)).balance==='0','Free attempt created or charged money');note('rendered-zero-budget-normal-bell',{wave:wave.wave,participants:wave.initialSnapshot.participants.length});
 const limit=Date.now()+180000;let closure;
 while(Date.now()<limit){const rows=await read('select outcome,loot_coins::text as loot from public.island_wave_closures where wave_id=$1::uuid',[wave.waveId]);if(rows.length){closure=rows[0];break;}await new Promise(resolve=>setTimeout(resolve,2000));}
 assert(closure&&closure.outcome==='lost'&&closure.loot==='0','No natural zero-defense loss was observed within the bounded wait');
 assert((await current(owner.actorId)).balance==='0','Natural loss created a bailout');note('natural-zero-defense-loss',closure);
 await owner.page.goto(fixture.runtime.frontendUrl,{waitUntil:'domcontentloaded'});await land(owner.page);await owner.page.waitForFunction(()=>!!window.__island?.island?.island);
 const beforePersonal=await api(owner.page,'/api/captain'),oldWallets=await read('select player_id,balance::text from public.wallets where player_id in ($1::uuid,$2::uuid) order by player_id',[owner.actorId,member.actorId]);
 const origin={mode:'island_shared',version:1,islandOwner:owner.actorId,runEpoch:original.epoch};
 const forbidden=await api(member.page,'/api/island/fresh-start',{method:'POST',body:{economy:origin,confirmCode:code,actionUid:'zero_provider_member_reset_001'}});assert(forbidden.status===403,'Member leader gained reset ownership');
 const body={economy:origin,confirmCode:code,actionUid:'zero_provider_owner_reset_001'};
 const reset=await api(owner.page,'/api/island/fresh-start',{method:'POST',body});assert(reset.status===200,'Owner reset at zero was refused');
 const replay=await api(owner.page,'/api/island/fresh-start',{method:'POST',body});assert(replay.status===200&&replay.data.repeat===true,'Original owner reset did not replay');
 const replacement=await current(owner.actorId);assert(replacement.account!==original.account&&replacement.epoch!==original.epoch&&replacement.balance==='200'&&replacement.held==='0','Replacement budget/epoch mismatch');
 const old=await read('select balance_coins::text as balance,committed_coins::text as held,state from public.island_economy_accounts where id=$1::uuid',[original.account]);assert(old[0].balance==='0'&&old[0].held==='0'&&old[0].state==='retired','Old cash was recreated or moved');
 const grants=await read("select count(*)::int as count from public.island_treasury_transactions where account_id=$1::uuid and reason='starting_coins'",[replacement.account]);assert(grants[0].count===1,'Reset grant multiplied');
 const afterPersonal=await api(owner.page,'/api/captain'),newWallets=await read('select player_id,balance::text from public.wallets where player_id in ($1::uuid,$2::uuid) order by player_id',[owner.actorId,member.actorId]);
 assert(JSON.stringify(beforePersonal.data)===JSON.stringify(afterPersonal.data)&&JSON.stringify(oldWallets)===JSON.stringify(newWallets),'Reset changed personal progress or wallets');
 note('real-authenticated-owner-reset',{newBudget:replacement.balance,grantCount:grants[0].count,oldBudget:old[0].balance});
 const report={result:'passed',source,productionSource:production,harnessSha256,startedAt,finishedAt:new Date().toISOString(),facts,requests,limitations:['Advanced unlock/retained saved state and market terms/outcome are explicit installer fixtures.','Market settlement waited for the actual server due time; no natural market-feed result is claimed.','Construction/demolition and owner reset used real authenticated production HTTP; zero-budget bell used the actual rendered member control.','Natural zero-defense defeat was observed separately; no arbitrary recovery wave or outcome override was used for that attempt.','No hosted service, conversion, deployment or public activation.']};
 await writeFile(directory+'/result.json',JSON.stringify(report,null,2)+'\n');
}catch(error){const displays=[];for(const client of fixture?.clients??[]){try{displays.push({client:client.label,url:client.page.url(),state:await client.page.evaluate(()=>({world:window.__island?.world.current?.id,ownCode:window.__island?.island?.island?.code,dialogs:[...document.querySelectorAll('dialog[open]')].map(row=>({className:row.className,text:row.innerText.slice(0,800)}))}))});await client.page.screenshot({path:directory+'/'+client.label+'-failure.png'});}catch{}}
 await writeFile(directory+'/failure.json',JSON.stringify({result:'failed',source,productionSource:production,harnessSha256,startedAt,finishedAt:new Date().toISOString(),error:String(error),facts,requests,displays},null,2)+'\n');throw error;}
finally{await fixture?.close();}
