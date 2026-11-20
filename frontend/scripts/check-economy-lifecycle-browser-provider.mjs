// Actual registered-client browser acceptance for idle shared-island controls.
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';

const argument = name => process.argv[process.argv.indexOf(name) + 1];
const runtimePath = argument('--runtime'), output = argument('--output');
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
const context = economy => Object.fromEntries(['mode', 'version', 'islandOwner', 'runEpoch'].map(key => [key, economy[key]]));
const uid = () => 'idle_ui_' + randomUUID().replaceAll('-', '');
await mkdir(output, {recursive: false, mode: 0o700});
const report = {startedAt: new Date().toISOString(), baseline, scenarioSha256: hash(await readFile(new URL(import.meta.url))),
  sourceBefore: sourceEvidence(baseline, {checkoutRoot: root}), helpersBefore: await helperHashes(), facts: [],
  setup: 'One actual registered browser actor plus an actual API-only registered host. Two fresh service admissions200; host saved unlock10. Inspector selection opens real arsenal card; physical controls commit. No natural earning, combat movement, clock, HP or outcome claim.',
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
    for (const name of ['Skip', 'Got it']) {
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
const {createApiClients}=await import(new URL('./api-clients.mjs',helper).href);
let hostEnvironment;
const frames=[];
function watch(page){page.on('websocket',socket=>{
  for(const [event,direction] of [['framesent','sent'],['framereceived','received']])socket.on(event,frameEvent=>{
    try{const f=JSON.parse(String(frameEvent.payload));const topic=Array.isArray(f)?f[2]:f.topic,kind=Array.isArray(f)?f[3]:f.event,payload=Array.isArray(f)?f[4]:f.payload;
      if(typeof topic==='string'&&topic.includes('live:place:')&&['phx_join','phx_reply','phx_leave'].includes(kind))frames.push({actor:'browser',direction,topic,kind,ref:Array.isArray(f)?f[1]:f.ref,joinRef:Array.isArray(f)?f[0]:f.join_ref,status:payload?.status??null,at:new Date().toISOString()});
    }catch{}
  });
});}
const liveState=page=>page.evaluate(()=>({proof:window.__island.island.session.proof(),metadata:window.__island.island.session.metadata,
  place:window.__island.island.roomPlace(),activeWaveId:window.__island.island.flow.current?.wave?.waveId??null}));
async function checkpoint(){await writeFile(output+'/checkpoint.json',JSON.stringify(report,null,2)+'\n');}
try{
  environment=await createClients({labels:['arsenal-lifecycle-browser'],runtimePath,expectedCommit:baseline,independentBrowsers:false});
  hostEnvironment=await createApiClients({labels:['arsenal-lifecycle-host'],runtimePath,expectedCommit:baseline});
  const [browser]=environment.clients,[host]=hostEnvironment.clients;watch(browser.page);report.servedBefore=servedSourceEvidence(environment.runtime);
  await writeFile(output+'/private-sessions.json',JSON.stringify({runtimePath,browser:{actorId:browser.actorId,email:browser.email,password:browser.password,session:browser.session},host:{actorId:host.actorId,email:host.email,password:host.password,session:host.session}},null,2)+'\n',{mode:0o600});
  assert.equal((await host.request('/api/games',{method:'POST',body:{actionUid:uid()}})).status,200);
  const hostRead=await host.request('/api/island');assert.equal(hostRead.status,200);const hostCode=hostRead.data.code;
  await admit(host.actorId,{coins:200,runtimePath});
  await install('update public.islands set wave_best=10,next_wave=11 where player_id=$1::uuid',[host.actorId],'Explicit host saved arsenal unlock fixture; not earned progress',{runtimePath});
  assert.equal((await api(browser.page,'/api/games',{method:'POST',body:{actionUid:uid()}})).status,200);
  const ownRead=await api(browser.page,'/api/island');assert.equal(ownRead.status,200);const ownCode=ownRead.data.code;
  await admit(browser.actorId,{coins:200,runtimePath});
  await finishEntry(browser.page,{join:hostCode});
  await browser.page.waitForFunction(()=>!!window.__island.island.session.proof(),null,{timeout:20000});
  const before=await liveState(browser.page);const oldTopic='realtime:live:place:'+before.metadata.session.place+':'+before.metadata.session.topicGeneration;
  const inventory=async()=>{const r=await api(browser.page,'/api/island/arsenal?code='+encodeURIComponent(hostCode));assert.equal(r.status,200);return r.data;};
  await closeCards(browser.page);
  await browser.page.evaluate(()=>window.__island.island.pick('island_arsenal'));
  const card=browser.page.locator('.island-card-arsenal[open]');const shop=card.locator('.island-arsenal-type[data-weapon="pistols"]');
  await shop.waitFor({state:'visible'});const displayed=await shop.innerText();
  await mutation(browser.page,'/api/island/arsenal/buy',shop.getByRole('button',{name:/Buy/}));
  let stock=await inventory();assert.equal(stock.total,1);assert.equal(stock.copies[0].holder,browser.actorId);const copy=stock.copies[0].id;
  await mutation(browser.page,'/api/island/arsenal/return',card.locator('[data-focus="arsenal-return"]'));
  stock=await inventory();assert.equal(stock.copies[0].id,copy);assert.equal(stock.copies[0].holder,null);assert.equal(stock.stored,1);
  await mutation(browser.page,'/api/island/arsenal/take',card.locator('.island-arsenal-copy').getByRole('button',{name:/^Take/}));
  stock=await inventory();assert.equal(stock.copies[0].id,copy);assert.equal(stock.copies[0].holder,browser.actorId);assert.equal(stock.stored,0);
  await mutation(browser.page,'/api/island/arsenal/return',card.locator('[data-focus="arsenal-return"]'));
  stock=await inventory();assert.equal(stock.copies[0].id,copy);assert.equal(stock.copies[0].holder,null);assert.equal(stock.stored,1);
  const target=await host.request('/api/island');assert.equal(target.data.economy.treasury.availableCoins,'140');
  const finance=await read('select balance_coins::text,committed_coins::text,(select coalesce(sum(balance_delta),0)::text from public.island_treasury_transactions t where t.account_id=a.id) ledger,(select count(*) from public.island_treasury_transactions t where t.account_id=a.id and t.reason=\'weapon_purchase\') purchases from public.island_economy_accounts a where id=$1::uuid',[target.data.economy.accountId]);
  assert.deepEqual(finance,[{balance_coins:'140',committed_coins:'0',ledger:'140',purchases:1}]);
  await card.screenshot({path:output+'/visible-member-arsenal.png'});
  note('visible-member-arsenal-buy-return-take-return',{layer:'existing inspector selection then physical product controls, actual inventory and read-only ledger',displayed,sameCopy:true,total:1,stored:1,...finance[0]});await checkpoint();
  await closeCards(browser.page);await browser.page.locator('.hud-menu').click({noWaitAfter:true});const boundary=frames.length;
  const leaving=browser.page.waitForResponse(r=>new URL(r.url()).pathname==='/api/games/leave'&&r.request().method()==='POST');
  await browser.page.getByRole('button',{name:'Leave this game',exact:true}).click({noWaitAfter:true});assert.equal((await leaving).status(),200);
  await browser.page.waitForFunction(actor=>window.__island.island.session.proof()?.origin.islandOwner===actor,browser.actorId,{timeout:30000});
  for(let n=0;n<40&&!frames.slice(boundary).some(f=>f.direction==='sent'&&f.topic===oldTopic&&f.kind==='phx_leave');n++)await browser.page.waitForTimeout(250);
  assert.ok(frames.slice(boundary).some(f=>f.direction==='sent'&&f.topic===oldTopic&&f.kind==='phx_leave'));
  const home=await liveState(browser.page);assert.notEqual(home.place,before.place);assert.equal(home.proof.origin.islandOwner,browser.actorId);
  note('normal-member-leave-clears-old-product-topic-and-selects-own-island-session',{layer:'actual Menu Leave action, production sail-home/attach and post-click passive topic departure',oldTopicLeft:true,oldScopeCleared:true,freshOwnController:true});await checkpoint();
  const own=await api(browser.page,'/api/island');assert.equal(own.status,200);assert.equal(own.data.economy.treasury.availableCoins,'200');
  const body={economy:context(own.data.economy),sessionId:home.proof.sessionId,connectionGeneration:home.proof.connectionGeneration};
  const started=await api(browser.page,'/api/waves/start',{method:'POST',body:{...body,where:ownCode,waveProtocol:2,actionUid:uid()}});assert.equal(started.status,200);const waveId=started.data.waveId;
  report.wave={waveId,startedAt:new Date().toISOString(),initialSnapshot:started.data.initialSnapshot};
  const disconnect=browser.page.waitForResponse(r=>new URL(r.url()).pathname==='/api/island/session/disconnect'&&r.request().method()==='POST');
  await browser.page.evaluate(()=>window.__island.island.session.disconnect());assert.equal((await disconnect).status(),200);await browser.context.setOffline(true);
  note('real-browser-disconnect-unattended-grace-started',{layer:'production disconnect API and actual browser offline',waitMilliseconds:67000});await checkpoint();
  await new Promise(resolve=>setTimeout(resolve,67000));
  const closure=await read('select outcome,loot_coins::text from public.island_wave_closures where wave_id=$1::uuid',[waveId]);assert.deepEqual(closure,[{outcome:'abandoned',loot_coins:'0'}]);report.closureBeforeRestore=closure;
  await browser.context.setOffline(false);await browser.page.reload({waitUntil:'domcontentloaded'});await finishEntry(browser.page);
  await browser.page.waitForFunction(()=>!!window.__island.island.session.proof(),null,{timeout:20000});const restored=await liveState(browser.page);
  assert.notEqual(restored.activeWaveId,waveId);assert.equal(restored.proof.origin.islandOwner,browser.actorId);
  const assignment=await read('select assignment_wave_id from public.personal_captain_profiles where player_id=$1::uuid',[browser.actorId]);assert.equal(assignment[0].assignment_wave_id,null);
  const same=await read('select outcome,loot_coins::text from public.island_wave_closures where wave_id=$1::uuid',[waveId]);assert.deepEqual(same,closure);
  note('after-real-grace-browser-restore-keeps-old-attempt-closed',{layer:'real67s, independent worker closure, normal document restore, actual fresh proof and read-only assignment/closure',oldAttemptNotResurrected:true,oldFlowAbsent:true,oldAssignmentAbsent:true,freshIdleController:true,outcome:'abandoned',loot:'0'});await checkpoint();
  report.status='passed';
}catch(error){report.status='failed';report.failure={name:error.name,message:error.message,stack:error.stack};process.exitCode=1;
  if(environment)for(const client of environment.clients){await capture(client.page,output,'failure-'+client.label).catch(()=>{});await writeFile(output+'/failure-'+client.label+'.txt',await client.page.locator('body').innerText().catch(()=>'')).catch(()=>{});}
}finally{
  report.frames=frames;
  if(environment){report.servedAfter=servedSourceEvidence(environment.runtime);await environment.close();}if(hostEnvironment)await hostEnvironment.close();
  report.helpersAfter=await helperHashes();assert.deepEqual(report.helpersAfter,report.helpersBefore);report.sourceAfter=sourceEvidence(baseline,{checkoutRoot:root});report.finishedAt=new Date().toISOString();
  await writeFile(output+'/result.json',JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({status:report.status,facts:report.facts.length,failure:report.failure?.message,result:output+'/result.json'}));
