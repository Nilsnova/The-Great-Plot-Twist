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
  setup: 'One actual Chromium process with two isolated registered contexts; explicit fresh service admission5000 and saved unlock10. No simultaneous movement, natural earning, clock, HP or outcome claim.',
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
const frames = [];
const watch = (page,label) => page.on('websocket', socket => {
  const captureFrame = (direction, event) => {
    try {
      const frame = JSON.parse(String(event.payload));
      const topic = Array.isArray(frame) ? frame[2] : frame.topic;
      const kind = Array.isArray(frame) ? frame[3] : frame.event;
      const payload = Array.isArray(frame) ? frame[4] : frame.payload;
      if (typeof topic === 'string' && topic.includes('live:place:') && ['phx_join','phx_reply','phx_leave'].includes(kind))
        frames.push({label,direction,topic,kind,status: payload?.status ?? null,at:new Date().toISOString()});
    } catch {}
  };
  socket.on('framesent', event => captureFrame('sent', event));
  socket.on('framereceived', event => captureFrame('received', event));
});
const state = page => page.evaluate(() => ({mode:(window.__island.island.visiting ?? window.__island.island.island)?.economy?.mode,
  place:window.__island.island.roomPlace(),proof:window.__island.island.session.proof(),metadata:window.__island.island.session.metadata,activeWaveId:window.__island.island.flow.current?.wave?.waveId??null}));
async function reenter(page, options = {}) {
  await closeCards(page); await page.locator('.hud-menu').click({noWaitAfter:true});
  await page.getByRole('button',{name:'Return to title',exact:true}).click({noWaitAfter:true});
  await finishEntry(page,options);
}
try {
  environment = await createClients({labels:['transition-owner','transition-member'],runtimePath,expectedCommit:baseline,independentBrowsers:false});
  const [owner,member]=environment.clients; watch(owner.page,'owner');watch(member.page,'member');
  report.servedBefore=servedSourceEvidence(environment.runtime);
  await finishEntry(owner.page,{create:true});
  const before=await api(owner.page,'/api/island'); assert.equal(before.status,200); const code=before.data.code;
  await finishEntry(member.page,{join:code});
  const legacy=await state(member.page); assert.equal(legacy.mode,'personal_legacy');
  const frameBoundary=frames.length;
  await admit(owner.actorId,{coins:5000,runtimePath});
  await install('update public.islands set wave_best=10,next_wave=11 where player_id=$1::uuid',[owner.actorId],
    'Explicit saved crew-unlock fixture; not natural progression',{runtimePath});
  // Ordinary front-door resume causes the product to read accepted new metadata. No manual SDK room or island.load call.
  await owner.page.bringToFront(); await reenter(owner.page);
  await member.page.bringToFront(); await reenter(member.page,{join:code});
  await member.page.waitForFunction(()=>!!window.__island.island.session.proof(),null,{timeout:20000});
  const shared=await state(member.page); assert.equal(shared.mode,'island_shared');assert.ok(shared.proof);
  const expected='realtime:live:place:'+shared.metadata.session.place+':'+shared.metadata.session.topicGeneration;
  for(let n=0;n<40&&!frames.slice(frameBoundary).some(f=>f.label==='member'&&f.direction==='received'&&f.topic===expected&&f.kind==='phx_reply'&&f.status==='ok');n++)await member.page.waitForTimeout(250);
  assert.ok(frames.slice(frameBoundary).some(f=>f.label==='member'&&f.direction==='sent'&&f.topic===expected&&f.kind==='phx_join'));
  assert.ok(frames.slice(frameBoundary).some(f=>f.label==='member'&&f.direction==='received'&&f.topic===expected&&f.kind==='phx_reply'&&f.status==='ok'));
  note('ordinary-resume-adopts-admitted-shared-session-and-product-private-topic',{layer:'real UI resume, actual accepted session metadata and passive WebSocket frames',legacyMode:legacy.mode,sharedMode:shared.mode,canonicalPlace:shared.place,acceptedCanonicalJoin:true,discovery:'Menu Return to title, then normal Continue/Join; no manual island.load or SDK topic'});
  const visit=async()=>{const r=await api(member.page,'/api/island/visit/'+encodeURIComponent(code));assert.equal(r.status,200);return r.data;};
  let view=await visit(); const account=view.economy.accountId;
  await closeCards(member.page);await member.page.locator('.hud-menu').click({noWaitAfter:true});
  await member.page.getByRole('button',{name:'Crew',exact:true}).click({noWaitAfter:true});
  const card=member.page.locator('.island-card-crew[open]');
  for(const crew of ['gunner','guard']){
    const row=card.locator('[data-crew="'+crew+'"]');
    await row.waitFor({state:'visible'});const shown=await row.innerText();const old=view.economy.treasury.availableCoins;
    const result=await mutation(member.page,'/api/island/hire',row.locator('button'));
    view=await visit();assert.equal(BigInt(old)-BigInt(view.economy.treasury.availableCoins),BigInt(result.data.receipt.result.chargedCoins));
    assert.equal(view.crew[crew],1);note('visible-invited-member-crew-'+crew,{layer:'visible product and committed shared read',displayed:shown,charge:result.data.receipt.result.chargedCoins,available:view.economy.treasury.availableCoins});
  }
  await card.screenshot({path:output+'/member-crew.png'});
  const ledger=await read('select balance_coins::text,(select coalesce(sum(balance_delta),0)::text from public.island_treasury_transactions t where t.account_id=a.id) ledger from public.island_economy_accounts a where id=$1::uuid',[account]);
  assert.equal(ledger[0].balance_coins,ledger[0].ledger);
  note('crew-independent-ledger-conservation',{layer:'read-only PostgreSQL',...ledger[0]});
  await closeCards(member.page);await member.page.locator('.hud-menu').click({noWaitAfter:true});
  await member.page.getByRole('button',{name:'Arsenal',exact:true}).click({noWaitAfter:true});
  const arsenalCard=member.page.locator('.island-card-arsenal[open]');
  await mutation(member.page,'/api/island/arsenal/buy',arsenalCard.locator('.island-arsenal-type[data-weapon="pistols"]').getByRole('button',{name:/Buy/}));
  const inventory=async()=>{const r=await api(member.page,'/api/island/arsenal?code='+encodeURIComponent(code));assert.equal(r.status,200);return r.data;};
  let stock=await inventory();assert.equal(stock.total,1);assert.equal(stock.copies[0].holder,member.actorId);const copy=stock.copies[0].id;
  await mutation(member.page,'/api/island/arsenal/return',arsenalCard.locator('[data-focus="arsenal-return"]'));
  stock=await inventory();assert.equal(stock.copies[0].id,copy);assert.equal(stock.copies[0].holder,null);assert.equal(stock.stored,1);
  await mutation(member.page,'/api/island/arsenal/take',arsenalCard.locator('.island-arsenal-copy').getByRole('button',{name:/^Take/}));
  stock=await inventory();assert.equal(stock.copies[0].id,copy);assert.equal(stock.copies[0].holder,member.actorId);assert.equal(stock.stored,0);
  await mutation(member.page,'/api/island/arsenal/return',arsenalCard.locator('[data-focus="arsenal-return"]'));
  stock=await inventory();assert.equal(stock.copies[0].id,copy);assert.equal(stock.copies[0].holder,null);assert.equal(stock.stored,1);
  const afterArsenal=await visit();assert.equal(afterArsenal.economy.treasury.availableCoins,'4840');
  const purchase=await read('select count(*) purchases,coalesce(sum(balance_delta),0)::text delta from public.island_treasury_transactions where account_id=$1::uuid and reason=\'weapon_purchase\'',[account]);
  assert.equal(purchase[0].purchases,1);assert.equal(purchase[0].delta,'-60');
  await arsenalCard.screenshot({path:output+'/member-visible-arsenal-stored.png'});
  note('visible-member-arsenal-buy-return-take-return-conserves-copy-and-one-debit',{layer:'ordinary rendered product, actual inventory and independent ledger',sameCopy:true,total:1,stored:1,purchases:1,delta:'-60',available:'4840'});
  await closeCards(member.page);await member.page.locator('.hud-menu').click({noWaitAfter:true});
  const leaveBoundary=frames.length;
  const leaving=member.page.waitForResponse(r=>new URL(r.url()).pathname==='/api/games/leave'&&r.request().method()==='POST');
  await member.page.getByRole('button',{name:'Leave this game',exact:true}).click({noWaitAfter:true});
  assert.equal((await leaving).status(),200);
  await member.page.waitForFunction(()=>!window.__island.island.visiting,null,{timeout:20000});
  for(let n=0;n<40&&!frames.slice(leaveBoundary).some(f=>f.label==='member'&&f.direction==='sent'&&f.topic===expected&&f.kind==='phx_leave');n++)await member.page.waitForTimeout(250);
  assert.ok(frames.slice(leaveBoundary).some(f=>f.label==='member'&&f.direction==='sent'&&f.topic===expected&&f.kind==='phx_leave'));
  const departed=await state(member.page);assert.notEqual(departed.place,shared.place);
  note('visible-member-leave-revokes-product-session-and-leaves-old-topic',{layer:'ordinary Menu action, actual HTTP200 and passive WebSocket leave',oldPlaceCleared:true,canonicalTopicLeft:true,proofCleared:!departed.proof});
  await member.context.close();
  await owner.page.bringToFront();
  await owner.page.waitForFunction(()=>!!window.__island.island.session.proof(),null,{timeout:20000});
  const ownerState=await state(owner.page);const ownView=await api(owner.page,'/api/island');assert.equal(ownView.status,200);
  const proof={economy:context(ownView.data.economy),sessionId:ownerState.proof.sessionId,connectionGeneration:ownerState.proof.connectionGeneration};
  const started=await api(owner.page,'/api/waves/start',{method:'POST',body:{...proof,where:code,waveProtocol:2,actionUid:uid()}});assert.equal(started.status,200);
  const waveId=started.data.waveId;report.wave={waveId,initialSnapshot:started.data.initialSnapshot};
  const disconnect=owner.page.waitForResponse(r=>new URL(r.url()).pathname==='/api/island/session/disconnect'&&r.request().method()==='POST');
  await owner.page.evaluate(()=>window.__island.island.session.disconnect());assert.equal((await disconnect).status(),200);
  await owner.context.setOffline(true);
  note('real-disconnect-before-unattended-grace',{layer:'production client disconnect and actual browser offline',waitMilliseconds:67000});
  await new Promise(resolve=>setTimeout(resolve,67000));
  const closed=await read('select outcome,loot_coins::text from public.island_wave_closures where wave_id=$1::uuid',[waveId]);assert.equal(closed.length,1);assert.equal(closed[0].outcome,'abandoned');assert.equal(closed[0].loot_coins,'0');
  await owner.context.setOffline(false);await owner.page.reload({waitUntil:'domcontentloaded'});await finishEntry(owner.page);
  await owner.page.waitForFunction(()=>!!window.__island.island.session.proof(),null,{timeout:20000});
  const restored=await state(owner.page);
  assert.notEqual(restored.activeWaveId,waveId);
  const assignment=await read('select assignment_wave_id from public.personal_captain_profiles where player_id=$1::uuid',[owner.actorId]);assert.equal(assignment[0].assignment_wave_id,null);
  const stillClosed=await read('select outcome,loot_coins::text from public.island_wave_closures where wave_id=$1::uuid',[waveId]);assert.deepEqual(stillClosed,closed);
  note('real-grace-expiry-browser-restoration-does-not-resurrect-old-attempt',{layer:'real67s, independent canonical worker closure, ordinary document restore and actual fresh controller metadata',oldAttemptClosed:true,outcome:'abandoned',loot:'0',freshController:true,oldReservationAbsent:true});
  report.status='passed';
}catch(error){report.status='failed';report.failure={name:error.name,message:error.message,stack:error.stack};process.exitCode=1;
  if(environment)for(const client of environment.clients)if(!client.page.isClosed()){
    await capture(client.page,output,'failure-'+client.label).catch(()=>{});
    await writeFile(output+'/failure-'+client.label+'.txt',await client.page.locator('body').innerText().catch(()=>'')).catch(()=>{});
  }
}finally{
  report.frames=frames;
  if(environment){report.servedAfter=servedSourceEvidence(environment.runtime);await environment.close();}
  report.helpersAfter=await helperHashes();assert.deepEqual(report.helpersAfter,report.helpersBefore);
  report.sourceAfter=sourceEvidence(baseline,{checkoutRoot:root});report.finishedAt=new Date().toISOString();
  await writeFile(output+'/result.json',JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({status:report.status,facts:report.facts.length,failure:report.failure?.message,result:output+'/result.json'}));
