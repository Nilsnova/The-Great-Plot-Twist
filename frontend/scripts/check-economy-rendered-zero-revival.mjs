// Ordinary rendered zero-budget revival over a declared saved wall ring.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const arg=name=>{const n=process.argv.indexOf(name);return n<0?null:process.argv[n+1];};
const runtimePath=arg('--runtime'),output=arg('--output'),expectedCommit=arg('--expected-commit');
if(!runtimePath||!output||!/^[a-f0-9]{40}$/.test(expectedCommit??''))throw Error('Use --runtime LOCAL_JSON --output PRIVATE_DIRECTORY --expected-commit FULL_SHA.');
const helper=process.env.MP_ECO_RENDER_HELPERS?pathToFileURL(process.env.MP_ECO_RENDER_HELPERS):new URL('./authenticated-economy/clients.mjs',import.meta.url);
const {createClients,api,land}=await import(helper.href),{observe,install,admit}=await import(new URL('./observer.mjs',helper));
const {servedSourceEvidence,sourceEvidence}=await import(new URL('./source.mjs',helper)),{loadRuntime}=await import(new URL('./runtime.mjs',helper));
const runtime=await loadRuntime(runtimePath);assert.equal(runtime.expectedCommit,expectedCommit);
const root=fileURLToPath(new URL('../../',import.meta.url));sourceEvidence(expectedCommit,{checkoutRoot:root});
const sourceBefore=servedSourceEvidence(runtime),source=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sha=bytes=>createHash('sha256').update(bytes).digest('hex'),scenarioSha256=sha(await readFile(new URL(import.meta.url)));
const helperUrls=[helper,new URL('./observer.mjs',helper),new URL('./runtime.mjs',helper),new URL('./source.mjs',helper)],helperHashes=Object.fromEntries(await Promise.all(helperUrls.map(async url=>[fileURLToPath(url).split('/').pop(),sha(await readFile(url))])));
await mkdir(output,{recursive:false,mode:0o700});const startedAt=new Date().toISOString(),facts=[],revivals=[];let ownerEnv,memberEnv;
const read=(sql,parameters=[])=>observe(sql,parameters,{runtimePath});
function note(event,detail={}){facts.push({event,at:new Date().toISOString(),...detail});console.log(JSON.stringify({event,...detail}));}
async function entry(page){
 const end=Date.now()+60000;let readySince=null;
 while(Date.now()<end){const action=await page.evaluate(()=>{
  const lobby=document.querySelector('.island-card-lobby[open]');if(lobby){const b=[...lobby.querySelectorAll('button')].find(n=>['Look around first','Done'].includes(n.textContent.trim()));if(b){b.click();return 'done';}}
  for(const s of ['dialog.cutscene[open]','.goal-card[open]','.tutorial-card[open]','.shell-screen[open]']){const d=document.querySelector(s),b=d&&[...d.querySelectorAll('button')].find(n=>['Skip','Got it','Resume','Start playing'].includes(n.textContent.trim()));if(b){b.click();return 'continue';}}
  const g=window.__island;return g?.world.current?.id==='home_islet'&&(g.island?.visiting??g.island?.island)&&!document.querySelector('dialog[open]')?'ready':null;
 });if(action==='done')return;if(action==='ready'){readySince??=Date.now();if(Date.now()-readySince>1500)return;}else readySince=null;await page.waitForTimeout(100);}
 throw Error('Ordinary front door did not reach its final lobby acknowledgement');
}
async function enter(page,options={}){
 for(let attempt=0;attempt<4;attempt++){
  try{await land(page,options);await entry(page);return;}
  catch(error){if(error.name==='TimeoutError'&&await page.evaluate(()=>{const g=window.__island;return g?.world.current?.id==='home_islet'&&!!(g.island?.visiting??g.island?.island);})) {await entry(page);return;}const skip=page.getByRole('button',{name:'Skip',exact:true}).first();
   if(error.name!=='TimeoutError'||!await skip.isVisible().catch(()=>false))throw error;
   await skip.click();await page.waitForTimeout(150);
  }
 }
 throw Error('Ordinary front door kept replacing the game dialog');
}
async function walk(page,x,z){
 await page.bringToFront();await page.evaluate(()=>document.activeElement?.blur?.());
 for(const axis of ['x','z']){const end=Date.now()+10000;while(Date.now()<end){const p=await page.evaluate(()=>({x:window.__island.player.position.x,z:window.__island.player.position.z})),delta=(axis==='x'?x:z)-p[axis];if(Math.abs(delta)<.5)break;
  const key=axis==='x'?(delta>0?'d':'a'):(delta>0?'s':'w');await page.keyboard.down(key);await page.waitForTimeout(Math.min(500,Math.max(100,Math.abs(delta)*150)));await page.keyboard.up(key);
 }}
}
const movement=new Map();
async function dismissUnlockedGuides(page){
 for(let turn=0;turn<9;turn++){
  const skipAll=page.getByRole('button',{name:/^Skip all\b/}).first();
  if(await skipAll.isVisible().catch(()=>false)){await skipAll.click();continue;}
  const got=page.getByRole('button',{name:'Got it',exact:true}).first();
  if(await got.isVisible().catch(()=>false)){await got.click();continue;}
  const tutorial=page.locator('.tutorial-card[open],dialog.cutscene[open]').getByRole('button',{name:'Skip',exact:true}).first();
  if(await tutorial.isVisible().catch(()=>false)){await tutorial.click();continue;}
  await page.waitForTimeout(150);
 }
}
async function calibrate(page){
 const vectors=[];await page.bringToFront();await page.evaluate(()=>document.activeElement?.blur?.());
 for(const key of ['d','w','a','s']){const before=await page.evaluate(()=>({x:window.__island.player.position.x,z:window.__island.player.position.z}));
  await page.keyboard.down(key);await page.waitForTimeout(180);await page.keyboard.up(key);const after=await page.evaluate(()=>({x:window.__island.player.position.x,z:window.__island.player.position.z}));
  const x=after.x-before.x,z=after.z-before.z,length=Math.hypot(x,z);if(length>.01)vectors.push({key,x:x/length,z:z/length});
 }assert.ok(vectors.length>=2,'Ordinary WASD did not move the rendered player');movement.set(page,vectors);
}
async function steer(page,x,z){
 const position=await page.evaluate(()=>({x:window.__island.player.position.x,z:window.__island.player.position.z})),dx=x-position.x,dz=z-position.z;
 if(Math.hypot(dx,dz)<.7)return;const direction=movement.get(page).reduce((best,row)=>!best||row.x*dx+row.z*dz>best.x*dx+best.z*dz?row:best,null);
 await page.keyboard.down(direction.key);await page.waitForTimeout(160);await page.keyboard.up(direction.key);
}
async function state(page){return page.evaluate(()=>{const w=window.__island?.waves?.island,current=w?.wave;return {id:current?.info.participantToken??w?.playerId,down:w?.captainDown??false,done:current?.done??false,party:current?.state.party??[],action:current?.action?.kind??null,share:w?.revive?.share??0};});}
try{
 ownerEnv=await createClients({labels:['render-zero-owner'],runtimePath});memberEnv=await createClients({labels:['render-zero-member'],runtimePath});const owner=ownerEnv.clients[0],member=memberEnv.clients[0];
 await enter(owner.page,{create:true});const own=await api(owner.page,'/api/island');assert.equal(own.status,200);const code=own.data.code;
 await install('insert into public.islets(player_id,timber) values($1::uuid,0) on conflict do nothing',[owner.actorId],'Saved defensive-island fixture anchor before shared admission',{runtimePath});
 await install("insert into public.islet_buildings(player_id,plot,building_type,level,coins_paid,timber_paid,ref) select $1::uuid,'wall_'||n,'wall',5,0,0,'fixture_saved_wall_'||n from generate_series(1,12) n",[owner.actorId],
  'Twelve saved level-five walls before zero-capital admission; no live HP, purchase, refund or conversion claim',{runtimePath});
 await install('update public.islands set wave_best=5,next_wave=6 where player_id=$1::uuid',[owner.actorId],'Saved wave-six progression before shared admission; no actual win or personal progress is claimed',{runtimePath});
 const admitted=await admit(owner.actorId,{coins:0,runtimePath}),account=admitted.currentEconomy.accountId;
 await owner.page.reload({waitUntil:'domcontentloaded'});await enter(owner.page);await enter(member.page,{join:code});
 for(const actor of [owner,member]){await actor.page.evaluate(async()=>{await window.__island.island.load();await window.__island.island.session.ensure();});await dismissUnlockedGuides(actor.page);await calibrate(actor.page);await actor.page.evaluate(()=>{window.__island.waves.island.autoBlade=false;});
  actor.page.on('response',async response=>{if(new URL(response.url()).pathname==='/api/island/revive'&&response.request().method()==='POST'){const data=await response.json().catch(()=>null);revivals.push({actor:actor.label,status:response.status(),repeat:data?.repeat??null,eventSeq:data?.receipt?.result?.eventSeq??null,restoredHPUnits:data?.receipt?.result?.restoredHPUnits??null});}});
 }
 await owner.page.evaluate(()=>window.__island.island.pick('island_bell'));const button=owner.page.locator('.island-card[open] [data-focus="bell"]');await button.waitFor({state:'visible'});
 const response=owner.page.waitForResponse(r=>new URL(r.url()).pathname==='/api/waves/start'&&r.request().method()==='POST');await button.click();const started=await response;assert.equal(started.status(),200);const wave=await started.json();
 const money=async()=>({account:await read('select balance_coins::text as balance,committed_coins::text as held,revision::text,(select count(*)::int from public.island_treasury_transactions t where t.account_id=a.id) as transactions from public.island_economy_accounts a where id=$1::uuid',[account]),wallets:await read('select player_id,balance::text,(select count(*)::int from public.wallet_transactions t where t.player_id=w.player_id) as transactions from public.wallets w where player_id=any($1::uuid[]) order by player_id',[[owner.actorId,member.actorId]]),quota:await read('select paid_used from public.recovery_wave_states where wave_id=$1::uuid',[wave.waveId])});
 const before=await money();assert.equal(before.account[0].balance,'0');assert.equal(before.account[0].held,'0');
 note('ordinary-rendered-zero-budget-bell',{wave:wave.wave,participants:wave.initialSnapshot.participants.length,treasury:'0',savedWalls:wave.initialSnapshot.structures.filter(row=>row.kind==='wall').length});
 const end=Date.now()+150000;let helperActor,targetActor,fall;
 let inspectedAt=0;
 while(Date.now()<end){const a=await state(owner.page),b=await state(member.page);if(a.done||b.done)throw Error('Natural attempt ended before a rendered teammate hold');
  if(a.down&&!b.down){helperActor=member;targetActor=owner;fall=a;break;}if(b.down&&!a.down){helperActor=owner;targetActor=member;fall=b;break;}
  const target=await owner.page.evaluate(()=>{const g=window.__island,p=g.player.position,rows=g.waves.island.wave?.state.boarders??[];return rows.reduce((best,row)=>!best||Math.hypot(row.x-p.x,row.z-p.z)<Math.hypot(best.x-p.x,best.z-p.z)?row:best,null);});
  if(Date.now()-inspectedAt>10000){note('read-only-rendered-encounter',{party:a.party.map(row=>({x:row.x,z:row.z,hp:row.hp,down:row.down})),boarder:target?{x:target.x,z:target.z,hp:target.hp,state:target.state,foe:target.foe??null}:null,frontier:await owner.page.evaluate(()=>{const g=window.__island,w=g.waves.island.wave;return {renderedPosition:{x:g.player.position.x,z:g.player.position.z},ticks:w?.ticks,simTime:w?.state?.time,blockedDialogs:[...document.querySelectorAll('dialog[open]')].map(d=>d.className)};})});inspectedAt=Date.now();}
  if(target){await steer(owner.page,target.x,target.z);const p=await owner.page.evaluate(()=>({x:window.__island.player.position.x,z:window.__island.player.position.z}));await steer(member.page,p.x+1,p.z);}else await owner.page.waitForTimeout(150);
 }
 assert.ok(helperActor,'No natural rendered fall in the bounded attempt');const viewed=await state(helperActor.page),fallen=viewed.party.find(row=>row.id===fall.id);assert.ok(fallen?.down);
 for(let step=0;step<8;step++){const p=await helperActor.page.evaluate(()=>({x:window.__island.player.position.x,z:window.__island.player.position.z}));if(Math.hypot(p.x-fallen.x,p.z-fallen.z)<2.4)break;await steer(helperActor.page,fallen.x+1,fallen.z);}await helperActor.page.waitForFunction(()=>window.__island.waves.island.wave?.action?.kind==='revive',null,{timeout:5000});
 await helperActor.page.screenshot({path:output+'/before-zero-hold.png'});await helperActor.page.evaluate(()=>document.activeElement?.blur?.());
 await helperActor.page.keyboard.down('e');
 const until=Date.now()+12000;while(Date.now()<until&&!revivals.some(row=>row.status===200)){await helperActor.page.waitForTimeout(100);}
 await helperActor.page.keyboard.up('e');assert.ok(revivals.some(row=>row.status===200),'No actual rendered E-hold revival completed');
 for(const actor of [helperActor,targetActor])await actor.page.waitForFunction(token=>window.__island.waves.island.state?.party?.some(row=>row.id===token&&!row.down&&row.hp>0),fall.id,{timeout:5000});
 await helperActor.page.screenshot({path:output+'/after-zero-hold-helper.png'});await targetActor.page.screenshot({path:output+'/after-zero-hold-target.png'});
 assert.deepEqual(await money(),before);const events=await read("select count(*)::int as count from public.recovery_wave_events where wave_id=$1::uuid and event_kind='captain_revive'",[wave.waveId]);assert.equal(events[0].count,1);
 note('ordinary-rendered-e-hold-restored-paired-captains-at-zero',{helper:helperActor.label,target:targetActor.label,acceptedRevival:revivals.find(row=>row.status===200),journalEvents:1,pairedStanding:true,treasury:'0',moneyAndQuotaUnchanged:true});
 const sourceAfter=servedSourceEvidence(runtime);for(const url of helperUrls)assert.equal(sha(await readFile(url)),helperHashes[fileURLToPath(url).split('/').pop()]);
 await writeFile(output+'/result.json',JSON.stringify({result:'passed',source,expectedCommit,scenarioSha256,helperHashes,sourceBefore,sourceAfter,startedAt,finishedAt:new Date().toISOString(),facts,revivals,accounting:before,limitations:['Twelve saved level-five walls and wave-six progression are explicit pre-admission fixtures, followed by fresh zero-capital admission.','All movement, bell and E hold use actual rendered keyboard/pointer paths. No HP, fall, journal, outcome, clock, position teleport, response interception. The supported controller.autoBlade=false test control suppresses automatic cutlass input; enemy damage and fall remain normal simulation events.','No shared grant or history edit occurs after admission; both Captains use normal saved progression.','Development inspection selects the ordinary bell card; the accepted bell uses its real pointer button.','No hosted migration, deployment, conversion or activation.']},null,2)+'\n',{mode:0o600});
}catch(error){for(const env of [ownerEnv,memberEnv])for(const actor of env?.clients??[])await actor.page.screenshot({path:output+'/'+actor.label+'-failure.png'}).catch(()=>{});await writeFile(output+'/failure.json',JSON.stringify({result:'failed',source,expectedCommit,scenarioSha256,helperHashes,sourceBefore,startedAt,finishedAt:new Date().toISOString(),error:String(error),facts,revivals},null,2)+'\n',{mode:0o600});throw error;}
finally{await ownerEnv?.close();await memberEnv?.close();}
