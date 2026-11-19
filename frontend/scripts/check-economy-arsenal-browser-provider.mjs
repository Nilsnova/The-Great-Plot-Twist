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
  setup: 'One actual registered owner browser; real Auth/API game creation, explicit fresh service admission200 and saved arsenal unlock10. Normal rendered arsenal actions; no natural earning, combat, clock, HP or outcome claim.',
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
try {
  environment=await createClients({labels:['visible-arsenal-owner'],runtimePath,expectedCommit:baseline,independentBrowsers:false});
  const [owner]=environment.clients;report.servedBefore=servedSourceEvidence(environment.runtime);
  assert.equal((await api(owner.page,'/api/games',{method:'POST',body:{actionUid:uid()}})).status,200);
  const initial=await api(owner.page,'/api/island');assert.equal(initial.status,200);const code=initial.data.code;
  await admit(owner.actorId,{coins:200,runtimePath});
  await install('update public.islands set wave_best=10,next_wave=11 where player_id=$1::uuid',[owner.actorId],
    'Explicit saved arsenal unlock fixture; not naturally earned progress',{runtimePath});
  await finishEntry(owner.page);await closeCards(owner.page);
  await owner.page.locator('.hud-menu').click({noWaitAfter:true});
  await owner.page.getByRole('button',{name:'Arsenal',exact:true}).click({noWaitAfter:true});
  const card=owner.page.locator('.island-card-arsenal[open]');
  const item=card.locator('.island-arsenal-type[data-weapon="pistols"]');
  await item.waitFor({state:'visible'});const shown=await item.innerText();
  await mutation(owner.page,'/api/island/arsenal/buy',item.getByRole('button',{name:/Buy/}));
  const inventory=async()=>{const r=await api(owner.page,'/api/island/arsenal?code='+encodeURIComponent(code));assert.equal(r.status,200);return r.data;};
  let stock=await inventory();assert.equal(stock.total,1);assert.equal(stock.copies[0].holder,owner.actorId);const copy=stock.copies[0].id;
  note('visible-shared-arsenal-purchase-carried-exact-copy',{layer:'rendered product and real inventory read',displayed:shown,total:1,carriedByBuyer:true,charge:'60'});
  await mutation(owner.page,'/api/island/arsenal/return',card.locator('[data-focus="arsenal-return"]'));
  stock=await inventory();assert.equal(stock.copies[0].id,copy);assert.equal(stock.copies[0].holder,null);assert.equal(stock.stored,1);
  note('visible-return-stores-original-copy',{layer:'rendered product and real inventory read',total:1,stored:1,sameCopy:true});
  await mutation(owner.page,'/api/island/arsenal/take',card.locator('.island-arsenal-copy').getByRole('button',{name:/^Take/}));
  stock=await inventory();assert.equal(stock.copies[0].id,copy);assert.equal(stock.copies[0].holder,owner.actorId);assert.equal(stock.stored,0);
  note('visible-take-carries-the-same-stored-copy',{layer:'rendered product and real inventory read',total:1,stored:0,sameCopy:true,holderIsBuyer:true});
  await mutation(owner.page,'/api/island/arsenal/return',card.locator('[data-focus="arsenal-return"]'));
  stock=await inventory();assert.equal(stock.copies[0].id,copy);assert.equal(stock.copies[0].holder,null);assert.equal(stock.stored,1);
  const view=await api(owner.page,'/api/island');assert.equal(view.data.economy.treasury.availableCoins,'140');
  const money=await read('select balance_coins::text,committed_coins::text,(select coalesce(sum(balance_delta),0)::text from public.island_treasury_transactions t where t.account_id=a.id) ledger,(select count(*) from public.island_treasury_transactions t where t.account_id=a.id and t.reason=\'weapon_purchase\') purchases from public.island_economy_accounts a where id=$1::uuid',[view.data.economy.accountId]);
  assert.equal(money[0].balance_coins,'140');assert.equal(money[0].committed_coins,'0');assert.equal(money[0].ledger,'140');assert.equal(money[0].purchases,1);
  await card.screenshot({path:output+'/visible-arsenal-stored-copy.png'});
  note('one-purchase-debit-and-all-visible-tenures-conserve-copy',{layer:'independent read-only PostgreSQL plus visible inventory',...money[0],total:1,stored:1,sameCopy:true});
  report.status='passed';
}catch(error){report.status='failed';report.failure={name:error.name,message:error.message,stack:error.stack};process.exitCode=1;
  if(environment)for(const client of environment.clients){await capture(client.page,output,'failure-'+client.label).catch(()=>{});await writeFile(output+'/failure-'+client.label+'.txt',await client.page.locator('body').innerText().catch(()=>'')).catch(()=>{});}
}finally{
  if(environment){report.servedAfter=servedSourceEvidence(environment.runtime);await environment.close();}
  report.helpersAfter=await helperHashes();assert.deepEqual(report.helpersAfter,report.helpersBefore);
  report.sourceAfter=sourceEvidence(baseline,{checkoutRoot:root});report.finishedAt=new Date().toISOString();
  await writeFile(output+'/result.json',JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({status:report.status,facts:report.facts.length,failure:report.failure?.message,result:output+'/result.json'}));
