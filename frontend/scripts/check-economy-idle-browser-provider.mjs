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
  setup: 'Real registered GoTrue pair and normal game entry; explicit fresh service admission with 5000 test coins and saved island unlock50. No naturally earned unlock, combat, clock, HP or outcome claim.',
  boundaries: ['An explicit normal product refresh follows free role selection; run3 separately demonstrates the unrefreshed first-click stale construction quote on this unchanged product source.','Visible product mutations are distinguished from browser-authenticated fetch probes and read-only PostgreSQL observations.',
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
      if (await button.isVisible().catch(() => false)) await button.click({noWaitAfter: true, timeout: 3000});
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
  console.log('Creating actual registered browser pair');
  environment = await createClients({labels: ['idle-owner', 'idle-member'], runtimePath, expectedCommit: baseline, independentBrowsers: true});
  const [owner, member] = environment.clients;
  report.servedBefore = servedSourceEvidence(environment.runtime);
  console.log('Entering owner game');
  await finishEntry(owner.page, {create: true});
  let initial = await api(owner.page, '/api/island'); assert.equal(initial.status, 200);
  const code = initial.data.code;
  await admit(owner.actorId, {coins: 5000, runtimePath});
  await install('update public.islands set wave_best=50,next_wave=51 where player_id=$1::uuid', [owner.actorId],
    'Explicit saved-unlock fixture for idle build/research/arsenal controls; no natural progress claim', {runtimePath});
  await refresh(owner.page);
  console.log('Entering invited member game');
  await finishEntry(member.page, {join: code});
  await refresh(member.page);
  const visit = () => api(member.page, '/api/island/visit/' + encodeURIComponent(code));
  const snapshot = async () => { const answer = await visit(); assert.equal(answer.status, 200); return answer.data; };
  let view = await snapshot();
  const oldAccount = view.economy.accountId, oldEpoch = view.economy.runEpoch;
  const walletsBefore = await read('select player_id,balance from public.wallets where player_id=any($1::uuid[]) order by player_id', [[owner.actorId, member.actorId]]);
  let captainBefore = await api(member.page, '/api/captain'); assert.equal(captainBefore.status, 200);
  await install('update public.personal_captain_profiles set level=5,won_wave_best=20,earned_points=10 where player_id=$1::uuid', [member.actorId],
    'Explicit existing earned-profile eligibility fixture for visible free Engineer selection; not earned-wave evidence', {runtimePath});
  await refresh(member.page); await closeCards(member.page);
  await member.page.evaluate(() => window.__island.island.openCaptain());
  const captainCard = member.page.locator('.island-card-captain[open]');
  await captainCard.locator('[data-focus="tab-skills"]').click({noWaitAfter: true});
  await captainCard.locator('[data-role="engineer"]').click({noWaitAfter: true});
  const roleText = await captainCard.locator('.island-role').innerText();
  await mutation(member.page, '/api/captain/role', captainCard.locator('[data-focus="role"]'));
  assert.equal((await snapshot()).economy.treasury.availableCoins, '5000');
  note('visible-free-personal-engineer-selection', {layer: 'rendered product', displayed: roleText, available: '5000', fixture: 'Existing personal eligibility only'});
  for (const client of [owner, member]) {
    const purse = client.page.locator('.hud-coins[data-economy="shared"]');
    await purse.waitFor({state: 'visible'}); assert.match(await purse.innerText(), /Island treasury/);
    assert.match(await purse.innerText(), /5,?000/);
  }
  note('visible-shared-bank-on-two-registered-clients', {layer: 'rendered product', available: '5000', committed: '0'});

  // Explicit normal product refresh after personal role selection; source64 has a separately retained first-click stale-quote finding.
  await refresh(member.page);
  await closeCards(member.page);
  await member.page.evaluate(() => window.__island.island.pick('wall_1'));
  const buildCard = member.page.locator('.island-card-build[open]');
  const buildText = await buildCard.innerText(); assert.match(buildText, /island treasury/i);
  await buildCard.screenshot({path: output + '/member-quoted-build.png'});
  const built = await mutation(member.page, '/api/island/build', buildCard.getByRole('button', {name: /^Build ·/}));
  view = await snapshot(); assert.equal(view.spots.find(spot => spot.id === 'wall_1').built, true);
  assert.equal(built.body.quotedCoins, '9');
  const afterBuild = view.economy.treasury.availableCoins;
  assert.equal(BigInt(afterBuild), 5000n - BigInt(built.body.quotedCoins));
  note('visible-invited-member-quoted-build', {layer: 'rendered product', quote: built.body.quotedCoins, available: afterBuild, cardText: buildText});
  const retry = await api(member.page, '/api/island/build', {method: 'POST', body: built.body}); assert.equal(retry.status, 200);
  const changed = await api(member.page, '/api/island/build', {method: 'POST', body: {...built.body, quotedCoins: String(BigInt(built.body.quotedCoins) + 1n)}}); assert.equal(changed.status, 409);
  const old = await api(member.page, '/api/island/visit/' + encodeURIComponent(code), {capability: null}); assert.equal(old.status, 409);
  assert.equal((await snapshot()).economy.treasury.availableCoins, afterBuild);
  note('browser-originated-exact-retry-and-old-client-probes', {layer: 'authenticated fetch from actual browser', sameUid: retry.status, changedUidIntent: changed.status, oldClientRead: old.status, noExtraDebit: true});

  await closeCards(member.page); await member.page.evaluate(() => window.__island.island.openCaptain());
  await captainCard.locator('[data-focus="tab-skills"]').click({noWaitAfter: true});
  await captainCard.locator('[data-role="gunner"]').click({noWaitAfter: true});
  assert.equal(await captainCard.locator('[data-focus="role"]').isDisabled(), true);
  const bound = await api(member.page, '/api/captain'); assert.ok(bound.data.captain.engineerCommitment);
  note('visible-discount-commits-engineer-role', {layer: 'rendered product plus actual personal read', discountedBuild: built.body.quotedCoins,
    displayed: await captainCard.locator('.island-role').innerText(), commitmentState: bound.data.captain.engineerCommitment.state, roleSwitchDisabled: true});
  await closeCards(member.page); await member.page.evaluate(() => window.__island.island.openTechHub());
  const tech = member.page.locator('.island-card-tech[open]');
  for (const option of ['cannon-1', 'rapid_2', 'long_guns']) {
    await tech.locator('[data-option="' + option + '"]').click({noWaitAfter: true});
    const text = await tech.locator('.island-tech-detail').innerText();
    const researched = await mutation(member.page, '/api/island/research', tech.locator('[data-focus="research-' + option + '"]'));
    view = await snapshot();
    note('visible-member-research-' + option, {layer: 'rendered product', displayed: text, intent: researched.body, research: view.research.find(row => row.branch === 'cannon'), available: view.economy.treasury.availableCoins});
  }
  assert.equal(view.research.find(row => row.branch === 'cannon').choice2, 'long_guns');
  await tech.screenshot({path: output + '/member-research-reversal.png'});

  await closeCards(member.page); await member.page.evaluate(() => window.__island.island.pick('wall_1'));
  await member.page.locator('.island-card-build[open] [data-focus="demolish"]').click({noWaitAfter: true});
  const demolish = member.page.locator('.island-card-demolish[open]');
  const demolitionText = await demolish.innerText();
  const beforeDemolition = view.economy.treasury.availableCoins;
  const torn = await mutation(member.page, '/api/island/demolish', demolish.locator('[data-focus="confirm"]'));
  view = await snapshot(); assert.equal(view.spots.find(spot => spot.id === 'wall_1').built, false);
  note('visible-invited-member-confirmed-demolition', {layer: 'rendered product', displayed: demolitionText,
    before: beforeDemolition, after: view.economy.treasury.availableCoins, intent: torn.body});

  await closeCards(member.page); await member.page.evaluate(() => window.__island.island.arsenal.open());
  const arsenal = member.page.locator('.island-card-arsenal[open]');
  const weapon = arsenal.locator('.island-arsenal-type[data-weapon="pistols"]');
  const weaponText = await weapon.innerText();
  await mutation(member.page, '/api/island/arsenal/buy', weapon.getByRole('button', {name: /Buy/}));
  await arsenal.locator('[data-focus="arsenal-return"]').waitFor({state: 'visible'});
  await mutation(member.page, '/api/island/arsenal/return', arsenal.locator('[data-focus="arsenal-return"]'));
  const stock = await api(member.page, '/api/island/arsenal?code=' + encodeURIComponent(code)); assert.equal(stock.status, 200);
  assert.equal(stock.data.total, 1); assert.equal(stock.data.copies[0].holder, null);
  await mutation(member.page, '/api/island/arsenal/take', arsenal.locator('.island-arsenal-copy').getByRole('button', {name: /^Take/}));
  const carried = await api(member.page, '/api/island/arsenal?code=' + encodeURIComponent(code));
  assert.equal(carried.data.copies[0].holder, member.actorId);
  await mutation(member.page, '/api/island/arsenal/return', arsenal.locator('[data-focus="arsenal-return"]'));
  note('visible-member-shared-arsenal-buy-and-return', {layer: 'rendered product', displayed: weaponText, total: stock.data.total, stored: stock.data.stored});
  await arsenal.screenshot({path: output + '/member-arsenal-return.png'});

  captainBefore = await api(member.page, '/api/captain');
  await settings(member.page);
  const memberReset = await member.page.locator('.island-reset').innerText(); assert.match(memberReset, /Only the host/);
  assert.equal(await member.page.locator('.island-reset input').count(), 0);
  note('visible-settings-member-cannot-reset', {layer: 'rendered product', displayed: memberReset});
  await closeCards(member.page);
  // Keep an actual old-epoch building selection open while the owner resets.
  await member.page.evaluate(() => window.__island.island.pick('wall_2'));
  await refresh(owner.page);
  await settings(owner.page);
  const resetSection = owner.page.locator('.island-reset');
  const resetText = await resetSection.innerText(); assert.match(resetText, /pending wager returns stay in the retired run/);
  await resetSection.locator('input').fill(code);
  const reset = await mutation(owner.page, '/api/island/fresh-start', resetSection.locator('.island-reset-button'));
  assert.equal(reset.data.receipt.result.startingCoins, '200');
  // A normal subsequent island read is an explicit lifecycle refresh, not claimed instantaneous push delivery.
  await refresh(member.page);
  view = await snapshot(); assert.notEqual(view.economy.runEpoch, oldEpoch); assert.notEqual(view.economy.accountId, oldAccount);
  assert.equal(view.economy.treasury.availableCoins, '200'); assert.equal(view.research.find(row => row.branch === 'cannon').tier, 0);
  const resetStock = await api(member.page, '/api/island/arsenal?code=' + encodeURIComponent(code)); assert.equal(resetStock.data.total, 0);
  const peerState = await member.page.evaluate(() => ({text: document.querySelector('.hud-coins')?.innerText,
    openSelection: !!document.querySelector('.island-card-build[open]'), economy: window.__island.island.visiting?.economy}));
  assert.match(peerState.text, /200/); assert.equal(peerState.openSelection, false); assert.equal(peerState.economy.runEpoch, view.economy.runEpoch);
  assert.deepEqual((await api(member.page, '/api/captain')).data, captainBefore.data);
  note('visible-owner-reset-and-peer-read-clears-old-selection', {layer: 'rendered Settings mutation plus normal product refresh', startingCoins: '200', newEpoch: true, peerSelectionClosed: true, peerBankUpdated: true, personalCaptainUnchanged: true, displayed: resetText});
  await capture(member.page, output, 'peer-after-owner-reset');
  const accounting = await read('select id,state,balance_coins,committed_coins,(select coalesce(sum(balance_delta),0) from public.island_treasury_transactions t where t.account_id=a.id) ledger_balance,(select count(*) from public.island_treasury_transactions t where t.account_id=a.id and t.reason=\'starting_coins\') grants from public.island_economy_accounts a where island_owner=$1::uuid order by created_at', [owner.actorId]);
  assert.equal(accounting.length, 2);
  for (const row of accounting) { assert.equal(row.balance_coins, row.ledger_balance); assert.equal(row.grants, 1); }
  assert.deepEqual(accounting.map(row => row.state), ['retired', 'active']);
  const walletsAfter = await read('select player_id,balance from public.wallets where player_id=any($1::uuid[]) order by player_id', [[owner.actorId, member.actorId]]);
  assert.deepEqual(walletsAfter, walletsBefore);
  note('independent-reset-account-ledger-and-wallet-conservation', {layer: 'read-only PostgreSQL', accounts: accounting, walletsUnchanged: true});

  await closeCards(owner.page); await settings(owner.page);
  await owner.page.locator('.account-summary').getByRole('button', {name: 'Account', exact: true}).click({noWaitAfter: true});
  const account = owner.page.locator('.account-modal[open]');
  await account.getByRole('button', {name: 'Delete my data', exact: true}).click({noWaitAfter: true});
  const firstDelete = owner.page.waitForResponse(response => new URL(response.url()).pathname === '/api/me' && response.request().method() === 'DELETE');
  await account.getByRole('button', {name: 'Confirm deletion', exact: true}).click({noWaitAfter: true});
  assert.equal((await firstDelete).status(), 409);
  const deletionText = await account.locator('.account-delete-confirm').innerText(); assert.match(deletionText, /not be transferred/);
  const pendingDelete = owner.page.waitForResponse(response => new URL(response.url()).pathname === '/api/me' && response.request().method() === 'DELETE');
  await account.getByRole('button', {name: 'Delete account and island', exact: true}).click({noWaitAfter: true});
  const deleted = await pendingDelete; assert.equal(deleted.status(), 200);
  await member.page.evaluate(() => window.__island.island.load());
  const gone = await visit(); assert.equal(gone.status, 404);
  const peerGone = await member.page.evaluate(() => ({visiting: !!window.__island.island.visiting,
    treasury: document.querySelector('.hud-coins')?.innerText, selection: !!document.querySelector('.island-card-build[open]')}));
  assert.equal(peerGone.visiting, false); assert.equal(peerGone.selection, false); assert.doesNotMatch(peerGone.treasury, /200/);
  assert.deepEqual((await api(member.page, '/api/captain')).data, captainBefore.data);
  const presence = await read('select (select count(*) from public.profiles where id=$1::uuid) profiles,(select count(*) from auth.users where id=$1::uuid) auth_users,(select count(*) from public.islands where player_id=$1::uuid) islands', [owner.actorId]);
  assert.deepEqual(presence, [{profiles: 0, auth_users: 0, islands: 0}]);
  note('visible-owner-account-island-confirmation-and-peer-clearance', {layer: 'rendered product, normal product refresh and independent PostgreSQL', firstStatus: 409, finalStatus: 200, peerVisit: gone.status, peerCleared: peerGone, personalCaptainUnchanged: true, displayed: deletionText, deletedRows: presence[0]});
  await capture(member.page, output, 'peer-after-owner-deletion');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = {name: error.name, message: error.message, stack: error.stack};
  if (environment) for (const client of environment.clients) {
    await capture(client.page, output, 'failure-' + client.label).catch(() => {});
    await writeFile(output + '/failure-' + client.label + '.txt', await client.page.locator('body').innerText().catch(() => '')).catch(() => {});
  }
  process.exitCode = 1;
} finally {
  if (environment) { report.servedAfter = servedSourceEvidence(environment.runtime); await environment.close(); }
  report.helpersAfter = await helperHashes(); assert.deepEqual(report.helpersAfter, report.helpersBefore);
  report.sourceAfter = sourceEvidence(baseline, {checkoutRoot: root});
  report.finishedAt = new Date().toISOString();
  await writeFile(output + '/result.json', JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({status: report.status, facts: report.facts.length, failure: report.failure?.message, result: output + '/result.json'}));
