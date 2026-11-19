// Actual registered-client browser acceptance for idle shared-island controls.
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';

const argument = name => process.argv[process.argv.indexOf(name) + 1];
const runtimePath = argument('--runtime'), output = argument('--output');
const savedPath=argument('--sessions');if(!process.argv.includes('--sessions'))throw Error('Use --sessions PRIVATE_ACTUAL_SESSIONS_JSON.');
if (!process.argv.includes('--runtime') || !process.argv.includes('--output')) throw Error('Use --runtime LOCAL_RUNTIME_JSON --output NEW_PRIVATE_DIRECTORY.');
const helper = process.env.MP_ECO_AUTH_HELPERS ? pathToFileURL(process.env.MP_ECO_AUTH_HELPERS)
  : new URL('./authenticated-economy/clients.mjs', import.meta.url);
const observer = process.env.MP_ECO_OBSERVER_HELPERS ? pathToFileURL(process.env.MP_ECO_OBSERVER_HELPERS)
  : new URL('./observer.mjs', helper);
const {createClients, api, land, capture} = await import(helper.href);
const {observe, install, admit} = await import(observer.href);
const {sourceEvidence, servedSourceEvidence} = await import(new URL('./source.mjs', helper).href);
const baseline = '64ee02b360d68836b2de9247121ab47dc6a3ecbf';
const root = fileURLToPath(new URL('../../', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const helperUrls = [helper, observer, new URL('./runtime.mjs', helper), new URL('./source.mjs', helper),
  new URL('../../../backend/tools/authenticated_economy/observe.py', helper),
  new URL('../../../backend/tools/authenticated_economy/config.py', helper)];
const helperHashes = async () => Object.fromEntries(await Promise.all(helperUrls.map(async url => [fileURLToPath(url).split('/').pop(), hash(await readFile(url))])));
const economyAssertion = economy => Object.fromEntries(['mode', 'version', 'islandOwner', 'runEpoch'].map(key => [key, economy[key]]));
const uid = () => 'idle_ui_' + randomUUID().replaceAll('-', '');
await mkdir(output, {recursive: false, mode: 0o700});
const report = {startedAt: new Date().toISOString(), baseline, scenarioSha256: hash(await readFile(new URL(import.meta.url))),
  sourceBefore: sourceEvidence(baseline, {checkoutRoot: root}), helpersBefore: await helperHashes(), facts: [],
  setup: 'Staged continuation with the exact privately retained actual Auth sessions and existing two islands from the preceding arsenal witness. No new registration, grant, unlock or financial fixture. Normal UI join, leave, tab focus, bell transport, real grace and document restore.',
  boundaries: ['Visible product mutations are distinguished from browser-authenticated fetch probes and read-only PostgreSQL observations.',
    'Local actual-provider candidate only; no hosted application, full multiplayer matrix or combat acceptance claim.']};
let environment;
const note = (event, details = {}) => { report.facts.push({event, at: new Date().toISOString(), ...details}); console.log(event); };
const read = (sql, params = []) => observe(sql, params, {runtimePath});
const clean = code => String(code ?? '').replace(/^ISLE-/i, '').toUpperCase();
async function finishEntry(page, options = {}) {
  try { await land(page, options); } catch (error) { if (error.name !== 'TimeoutError') throw error; }
  for (let attempt = 0; attempt < 20; attempt++) {
    const skipAll = page.getByRole('button', {name: /^Skip all/}).first();
    if (await skipAll.isVisible().catch(() => false)) await skipAll.click({noWaitAfter: true});
    for (const name of ['Skip', 'Got it', 'Skip tutorial']) {
      const button = page.getByRole('button', {name, exact: true}).first();
      if (await button.isVisible().catch(() => false)) {
        try { await button.click({noWaitAfter: true, timeout: 5000}); }
        catch (error) { if (error.name !== 'TimeoutError') throw error; (report.entryClickTimeouts ??= []).push({name, message: error.message}); }
      }
    }
    const lobby = page.locator('.island-card-lobby[open] .island-lobby-start');
    if (await lobby.isVisible().catch(() => false)) await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
  const current = await page.evaluate(() => ({place: window.__island?.world.current?.id,
    code: (window.__island?.island?.visiting ?? window.__island?.island?.island)?.code}));
  assert.equal(current.place, 'home_islet');
  if (options.join) assert.equal(clean(current.code), clean(options.join));
}
async function closeCards(page) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const skipAll = page.getByRole('button', {name: /^Skip all/}).first();
    if (await skipAll.isVisible().catch(() => false)) await skipAll.click({noWaitAfter: true});
    const gotIt = page.locator('.unlock-card[open]').getByRole('button', {name: 'Got it', exact: true});
    if (await gotIt.isVisible().catch(() => false)) await gotIt.click({noWaitAfter: true});
    await page.waitForTimeout(100);
  }
  for (let attempt = 0; attempt < 4 && await page.locator('dialog[open]').count(); attempt++) {
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  }
}
async function refresh(page) {
  await page.evaluate(async () => { await window.__island.island.load(); await window.__island.island.session.ensure(); });
  await page.waitForFunction(() => !!window.__island?.island?.session?.proof(), null, {timeout: 20000});
}
async function mutation(page, path, button) {
  const pending = page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === 'POST', {timeout: 20000});
  await button.click({noWaitAfter: true});
  const response = await pending;
  const data = await response.json();
  (report.visibleRequests ??= []).push({path, status: response.status(), body: response.request().postDataJSON(), data});
  console.log('Visible request ' + path + ' ' + response.status());
  if (response.status() !== 200) report.refusedVisibleAttempt = {path, status: response.status(), body: response.request().postDataJSON(), data};
  assert.equal(response.status(), 200, path + ': ' + JSON.stringify(data));
  return {status: response.status(), body: response.request().postDataJSON(), data};
}
async function settings(page) {
  await closeCards(page);
  await page.locator('.hud-menu').click({noWaitAfter: true});
  await page.getByRole('button', {name: 'Settings', exact: true}).click({noWaitAfter: true});
  await page.locator('.island-reset').waitFor({state: 'visible'});
}
const {createRequire}=await import('node:module');
const {chromium}=createRequire(helper)('playwright-core');
const {loadRuntime}=await import(helper.href);
const {requestApi}=await import(new URL('./api-clients.mjs',helper).href);
const saved=JSON.parse(await readFile(savedPath,'utf8'));const runtime=await loadRuntime(runtimePath);
let browser,page;const frames=[];
const watch=page=>page.on('websocket',socket=>{
 for(const [event,direction] of [['framesent','sent'],['framereceived','received']])socket.on(event,e=>{try{
  const f=JSON.parse(String(e.payload)),topic=Array.isArray(f)?f[2]:f.topic,kind=Array.isArray(f)?f[3]:f.event,payload=Array.isArray(f)?f[4]:f.payload;
  if(typeof topic==='string'&&topic.includes('live:place:')&&['phx_join','phx_reply','phx_leave'].includes(kind))frames.push({actor:'retained-browser',direction,topic,kind,ref:Array.isArray(f)?f[1]:f.ref,joinRef:Array.isArray(f)?f[0]:f.join_ref,status:payload?.status??null,at:new Date().toISOString()});
 }catch{}});
});
const state=()=>page.evaluate(()=>({proof:window.__island.island.session.proof(),sessionState:window.__island.island.session.state,metadata:window.__island.island.session.metadata,place:window.__island.island.roomPlace(),activeWaveId:window.__island.island.flow.current?.wave?.waveId??null,hidden:document.hidden,visiting:!!window.__island.island.visiting}));
const checkpoint=async()=>writeFile(output+'/checkpoint.json',JSON.stringify(report,null,2)+'\n');
try{
 report.servedBefore=servedSourceEvidence(runtime);
 const host={...saved.host,runtime},actor=saved.browser;
 const hostRead=await requestApi(host,'/api/island');assert.equal(hostRead.status,200);const hostCode=hostRead.data.code;
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--ignore-certificate-errors-spki-list='+runtime.certificateSpki]});
 const context=await browser.newContext({viewport:{width:1280,height:800}});page=await context.newPage();watch(page);
 await page.goto(runtime.frontendUrl,{waitUntil:'domcontentloaded'});
 await page.evaluate(session=>sessionStorage.setItem('plot-twist-auth-v1',JSON.stringify(session)),actor.session);
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(async()=>{const{session}=await import('/src/online/session.js');return session.isSignedIn();},null,{timeout:30000});
 const me=await api(page,'/api/me');assert.equal(me.status,200);assert.equal(me.data.id,actor.actorId);
 await finishEntry(page,{join:hostCode});
 const blank=await context.newPage();await blank.bringToFront();await page.bringToFront();await blank.close();
 await page.waitForFunction(()=>!!window.__island.island.session.proof(),null,{timeout:30000});
 const before=await state(),oldTopic='realtime:live:place:'+before.metadata.session.place+':'+before.metadata.session.topicGeneration;
 for(let n=0;n<40&&!frames.some(f=>f.direction==='sent'&&f.topic===oldTopic&&f.kind==='phx_join');n++)await page.waitForTimeout(250);
 const join=frames.find(f=>f.direction==='sent'&&f.topic===oldTopic&&f.kind==='phx_join');assert.ok(join);
 assert.ok(frames.some(f=>f.direction==='received'&&f.topic===oldTopic&&f.kind==='phx_reply'&&f.ref===join.ref&&f.status==='ok'));
 note('same-actual-actor-ordinary-rejoin-has-ref-correlated-product-canonical-channel',{layer:'normal UI rejoin and passive pre-navigation observer',sameActualActor:true,acceptedProductJoin:true,joinReplyRefCorrelated:true});await checkpoint();
 await closeCards(page);await page.locator('.hud-menu').click({noWaitAfter:true});const boundary=frames.length;
 const leaving=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/games/leave'&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Leave this game',exact:true}).click({noWaitAfter:true});assert.equal((await leaving).status(),200);
 await finishEntry(page);
 const focusTab=await context.newPage();await focusTab.bringToFront();await page.bringToFront();await focusTab.close();
 report.afterLeave=await state();await checkpoint();
 await page.waitForFunction(id=>window.__island.island.session.proof()?.origin.islandOwner===id,actor.actorId,{timeout:30000});
 for(let n=0;n<40&&!frames.slice(boundary).some(f=>f.direction==='sent'&&f.topic===oldTopic&&f.kind==='phx_leave');n++)await page.waitForTimeout(250);
 assert.ok(frames.slice(boundary).some(f=>f.direction==='sent'&&f.topic===oldTopic&&f.kind==='phx_leave'));
 const home=await state();assert.notEqual(home.place,before.place);assert.equal(home.proof.origin.islandOwner,actor.actorId);
 note('normal-member-leave-clears-old-topic-and-ordinary-focus-adopts-own-session',{layer:'actual Menu Leave, production sail-home, normal guide dismissal/tab focus and post-click passive leave',oldTopicLeft:true,oldScopeCleared:true,freshOwnController:true,trigger:'normal Skip tutorial where shown, then actual tab focus; no SDK topic/session.ensure/island.load call'});await checkpoint();
 const own=await api(page,'/api/island');assert.equal(own.status,200);assert.equal(own.data.economy.treasury.availableCoins,'200');
 const proof={economy:economyAssertion(own.data.economy),sessionId:home.proof.sessionId,connectionGeneration:home.proof.connectionGeneration};
 const started=await api(page,'/api/waves/start',{method:'POST',body:{...proof,where:own.data.code,waveProtocol:2,actionUid:uid()}});assert.equal(started.status,200);const waveId=started.data.waveId;
 report.wave={waveId,startedAt:new Date().toISOString(),initialSnapshot:started.data.initialSnapshot};
 const disconnected=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/island/session/disconnect'&&r.request().method()==='POST');
 await page.evaluate(()=>window.__island.island.session.disconnect());assert.equal((await disconnected).status(),200);await context.setOffline(true);
 note('real-retained-browser-disconnect-and67-second-grace',{layer:'normal production disconnect API and actual browser offline',waitMilliseconds:67000});await checkpoint();
 await new Promise(resolve=>setTimeout(resolve,67000));
 const closed=await read('select outcome,loot_coins::text from public.island_wave_closures where wave_id=$1::uuid',[waveId]);assert.deepEqual(closed,[{outcome:'abandoned',loot_coins:'0'}]);report.closureBeforeRestore=closed;await checkpoint();
 await context.setOffline(false);await page.reload({waitUntil:'domcontentloaded'});await finishEntry(page);
 await page.waitForFunction(()=>!!window.__island.island.session.proof(),null,{timeout:30000});const restored=await state();report.restored=restored;
 assert.notEqual(restored.activeWaveId,waveId);assert.equal(restored.proof.origin.islandOwner,actor.actorId);
 const assignment=await read('select assignment_wave_id from public.personal_captain_profiles where player_id=$1::uuid',[actor.actorId]);assert.equal(assignment[0].assignment_wave_id,null);
 const closedAfter=await read('select outcome,loot_coins::text from public.island_wave_closures where wave_id=$1::uuid',[waveId]);assert.deepEqual(closedAfter,closed);
 note('after-real-grace-normal-browser-restoration-does-not-resurrect-old-attempt',{layer:'real67s, independent worker closure, ordinary document restore and fresh actual proof/flow/assignment',oldAttemptRemainsClosed:true,oldFlowAbsent:true,oldAssignmentAbsent:true,freshIdleController:true,outcome:'abandoned',loot:'0'});await checkpoint();report.status='passed';
}catch(error){report.status='failed';report.failure={name:error.name,message:error.message,stack:error.stack};process.exitCode=1;if(page){await capture(page,output,'failure').catch(()=>{});await writeFile(output+'/failure.txt',await page.locator('body').innerText().catch(()=>'')).catch(()=>{});report.failureState=await state().catch(()=>null);}}
finally{report.frames=frames;if(browser)await browser.close();report.servedAfter=servedSourceEvidence(runtime);report.helpersAfter=await helperHashes();assert.deepEqual(report.helpersAfter,report.helpersBefore);report.sourceAfter=sourceEvidence(baseline,{checkoutRoot:root});report.finishedAt=new Date().toISOString();await writeFile(output+'/result.json',JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({status:report.status,facts:report.facts.length,failure:report.failure?.message,result:output+'/result.json'}));
