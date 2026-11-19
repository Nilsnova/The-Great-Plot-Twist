// Actual local-provider arsenal capacity, tenure and canonical holder-lifecycle acceptance.
// Budget, saved unlock and existing converted overflow are explicit disposable setup only.
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';

const argument = name => {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
};
const runtimePath = argument('--runtime');
const output = argument('--output');
if (!runtimePath || !output) throw Error('Use --runtime LOCAL_RUNTIME_JSON --output NEW_PRIVATE_DIRECTORY.');
const helperUrl = process.env.MP_ECO_API_HELPERS
  ? pathToFileURL(process.env.MP_ECO_API_HELPERS)
  : new URL('./authenticated-economy/api-clients.mjs', import.meta.url);
const observerUrl = process.env.MP_ECO_OBSERVER_HELPERS
  ? pathToFileURL(process.env.MP_ECO_OBSERVER_HELPERS)
  : new URL('./authenticated-economy/observer.mjs', import.meta.url);
const sourceUrl = new URL('./source.mjs', helperUrl);
const {createApiClients} = await import(helperUrl.href);
const {observe, install, admit} = await import(observerUrl.href);
const {sourceEvidence, servedSourceEvidence} = await import(sourceUrl.href);
const root = fileURLToPath(new URL('../../', import.meta.url));
const baseline = '64ee02b360d68836b2de9247121ab47dc6a3ecbf';
const sourceBefore = sourceEvidence(baseline, {checkoutRoot: root});
const sha256 = value => createHash('sha256').update(value).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const hashValue = value => sha256(JSON.stringify(canonical(value)));
const scenarioSha256 = sha256(await readFile(fileURLToPath(import.meta.url)));
const helperUrls = [helperUrl, observerUrl, sourceUrl, new URL('./runtime.mjs', helperUrl),
  new URL('../../../backend/tools/authenticated_economy/observe.py', helperUrl),
  new URL('../../../backend/tools/authenticated_economy/config.py', helperUrl),
  new URL('../../../backend/tools/authenticated_economy/application.py', helperUrl),
  new URL('../../../backend/tools/authenticated_economy/worker.py', helperUrl),
  new URL('../../../backend/tools/shared_session_worker.py', helperUrl),
  new URL('./record-source.mjs', helperUrl)];
async function helperHashes() {
  const hashes = {};
  for (const url of helperUrls) hashes[fileURLToPath(url).split('/').pop()] = sha256(await readFile(url));
  return hashes;
}
await mkdir(output, {recursive: false, mode: 0o700});
const helpersBefore = await helperHashes();
const facts = [];
const startedAt = new Date().toISOString();
let environment;
let timer;
let heartbeatFlight;
let heartbeatFailure;
const sessions = new Map();
const uid = () => 'arsenal_' + randomUUID().replaceAll('-', '');
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const read = (statement, parameters = []) => observe(statement, parameters, {runtimePath});
const setup = (statement, parameters, purpose) => install(statement, parameters, purpose, {runtimePath});
const call = (actor, path, options) => actor.request(path, options);
const note = (event, details = {}) => {
  const fact = {event, at: new Date().toISOString(), ...details};
  facts.push(fact);
  console.log(JSON.stringify(fact));
};
function assertStatus(reply, expected, label) {
  assert.equal(reply.status, expected, label + ': ' + JSON.stringify(reply.data));
  return reply.data;
}
function assertion(envelope) {
  return Object.fromEntries(['mode', 'version', 'islandOwner', 'runEpoch'].map(key => [key, envelope[key]]));
}
function proof(actor, economy) {
  const session = sessions.get(actor.actorId);
  return {economy, sessionId: session.sessionId, connectionGeneration: session.connectionGeneration};
}
async function heartbeat(actors, economy) {
  for (const actor of actors) {
    if (!sessions.has(actor.actorId)) continue;
    assertStatus(await call(actor, '/api/island/session/heartbeat', {
      method: 'POST', body: proof(actor, economy)}), 200, 'Controller heartbeat');
  }
}
function maintain(actors, economy) {
  timer = setInterval(() => {
    if (heartbeatFlight || heartbeatFailure) return;
    heartbeatFlight = heartbeat(actors, economy).catch(error => { heartbeatFailure = error; })
      .finally(() => { heartbeatFlight = null; });
  }, 5000);
}
async function stopHeartbeats() {
  clearInterval(timer);
  timer = null;
  if (heartbeatFlight) await heartbeatFlight;
  if (heartbeatFailure) throw heartbeatFailure;
}
async function inventory(actor, code) {
  return assertStatus(await call(actor, '/api/island/arsenal?code=' + encodeURIComponent(code)), 200, 'Shared inventory');
}
async function move(actor, economy, kind, copy, actionUid = uid()) {
  const body = {economy, actionUid, copy: copy.id, holderGeneration: copy.holderGeneration};
  return call(actor, '/api/island/arsenal/' + kind, {method: 'POST', body});
}
async function copies(owner) {
  return read('select id::text,copy_no,weapon,holder::text,holder_generation::text, '
    + 'pending_return_wave_id::text,disconnected_until::text from public.arsenal_copies '
    + 'where island_owner=$1::uuid order by copy_no', [owner]);
}
async function money(account) {
  const rows = await read('select balance_coins::text as balance,committed_coins::text as held, '
    + 'revision::text, (select coalesce(sum(balance_delta),0)::text '
    + 'from public.island_treasury_transactions where account_id=a.id) as ledger_balance, '
    + '(select coalesce(sum(committed_delta),0)::text from public.island_treasury_transactions '
    + 'where account_id=a.id) as ledger_held, (select count(*)::int '
    + 'from public.island_treasury_transactions where account_id=a.id and kind=\'spend\') as purchases '
    + 'from public.island_economy_accounts a where id=$1::uuid', [account]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].balance, rows[0].ledger_balance);
  assert.equal(rows[0].held, rows[0].ledger_held);
  return rows[0];
}
async function workerSource(runtime) {
  const recorded = JSON.parse(await readFile(runtime.directory + '/worker-source.json', 'utf8'));
  assert.equal(recorded.expectedProductionBaseline, baseline);
  assert.equal(recorded.service, 'worker');
  process.kill(recorded.processId, 0);
  const current = sourceEvidence(baseline, {checkoutRoot: recorded.sourceRoot});
  return {service: 'worker', ...current, recordedAt: recorded.recordedAt, processAlive: true};
}

try {
  environment = await createApiClients({labels: ['arsenal-owner', 'arsenal-member',
    'arsenal-victim', 'arsenal-challenger'], runtimePath, expectedCommit: baseline});
  const actors = environment.clients;
  const workerBefore = await workerSource(environment.runtime);
  const [owner, member, victim, challenger] = actors;
  const created = assertStatus(await call(owner, '/api/games', {method: 'POST', body: {actionUid: uid()}}), 200, 'Create game');
  const code = created.game.code;
  const admitted = await admit(owner.actorId, {coins: 5000, runtimePath});
  const envelope = admitted.currentEconomy;
  const economy = assertion(envelope);
  await setup('update public.islands set wave_best=10,next_wave=11 where player_id=$1::uuid',
    [owner.actorId], 'Saved island unlock fixture for arsenal eligibility; not naturally earned progress');
  for (const actor of actors.slice(1)) assertStatus(await call(actor, '/api/games/join', {
    method: 'POST', body: {code, actionUid: uid()}}), 200, 'Join game');
  for (const actor of actors) {
    const answer = assertStatus(await call(actor, '/api/island/session/attach', {method: 'POST', body: {
      economy, sessionId: randomUUID(), expectedGeneration: '0', actionUid: uid()}}), 200, 'Attach controller');
    assert.equal(answer.session.isController, true);
    sessions.set(actor.actorId, answer.session);
  }
  maintain(actors, economy);
  const walletsBefore = await read('select player_id::text,balance::text from public.wallets '
    + 'where player_id=any($1::uuid[]) order by player_id', [actors.map(actor => actor.actorId)]);
  const first = await inventory(owner, code);
  assert.equal(first.total, 0);
  const prices = Object.fromEntries(first.types.map(type => [type.id, BigInt(type.priceCoins)]));
  let spending = 0n;
  let originalBuy;
  for (let number = 0; number < 20; number++) {
    const actor = actors[number % actors.length];
    const weapon = number % 2 === 0 ? 'pistols' : 'long_rifle';
    const body = {economy, actionUid: uid(), weapon};
    const bought = assertStatus(await call(actor, '/api/island/arsenal/buy', {method: 'POST', body}), 200, 'Purchase copy');
    assert.equal(bought.receipt.origin.accountId, envelope.accountId);
    assert.equal(bought.receipt.origin.runEpoch, envelope.runEpoch);
    assert.equal(BigInt(bought.receipt.result.priceCoins), prices[weapon]);
    spending += prices[weapon];
    originalBuy ??= {actor, body, receipt: bought.receipt};
  }
  const full = await inventory(owner, code);
  assert.equal(full.total, 20);
  assert.equal(full.capacity, 20);
  assert.equal(full.stored, 16);
  assert.equal(full.copies.filter(copy => copy.holder !== null).length, 4);
  const paid = await money(envelope.accountId);
  assert.equal(paid.balance, String(5000n - spending));
  assert.equal(paid.purchases, 20);
  const overUid = uid();
  const refused = await call(member, '/api/island/arsenal/buy', {method: 'POST', body: {
    economy, actionUid: overUid, weapon: 'pistols'}});
  assertStatus(refused, 409, 'Twenty-first copy');
  assert.equal(refused.data.error.code, 'arsenal_full');
  assert.deepEqual(await money(envelope.accountId), paid);
  const rootCount = await read('select count(*)::int as count from public.island_economy_operations '
    + 'where actor_id=$1::uuid and action_uid=$2', [member.actorId, overUid]);
  assert.equal(rootCount[0].count, 0);
  const replay = assertStatus(await call(originalBuy.actor, '/api/island/arsenal/buy', {
    method: 'POST', body: originalBuy.body}), 200, 'Original purchase retry');
  assert.equal(replay.repeat, true);
  assert.deepEqual(replay.receipt, originalBuy.receipt);
  assert.deepEqual(await money(envelope.accountId), paid);
  note('twenty-total-including-carried-not-twenty-stored', {total: 20, stored: 16,
    carried: 4, refusedTwentyFirst: refused.status, purchaseCount: paid.purchases,
    chargedCoins: String(spending), balance: paid.balance, exactReplay: true});

  const selected = full.copies.find(copy => copy.holder === null);
  const previous = new Map(full.copies.filter(copy => copy.holder).map(copy => [copy.holder, copy]));
  const raced = await Promise.all([owner, member].map(actor => move(actor, economy, 'take', selected)));
  assert.deepEqual(raced.map(reply => reply.status).sort(), [200, 409]);
  const winner = [owner, member][raced.findIndex(reply => reply.status === 200)];
  let changed = await inventory(winner, code);
  const acquired = changed.copies.find(copy => copy.id === selected.id);
  const returnedOld = changed.copies.find(copy => copy.id === previous.get(winner.actorId).id);
  assert.equal(acquired.holder, winner.actorId);
  assert.equal(BigInt(acquired.holderGeneration), BigInt(selected.holderGeneration) + 1n);
  assert.equal(returnedOld.holder, null);
  assert.equal(BigInt(returnedOld.holderGeneration), BigInt(previous.get(winner.actorId).holderGeneration) + 1n);
  assert.equal(changed.total, 20);
  const stale = await move(winner, economy, 'return', selected);
  assertStatus(stale, 409, 'Obsolete copy generation');
  assert.equal(stale.data.error.code, 'stale_holder');
  assertStatus(await move(winner, economy, 'return', acquired), 200, 'Return at full inventory');
  changed = await inventory(winner, code);
  assert.equal(changed.carried, 'musket');
  assert.equal(changed.total, 20);
  const available = changed.copies.find(copy => copy.id === selected.id);
  assertStatus(await move(winner, economy, 'take', available), 200, 'Take returned copy');
  assert.deepEqual(await money(envelope.accountId), paid);
  note('exclusive-copy-race-atomic-full-swap-and-free-basic', {raceStatuses: raced.map(reply => reply.status),
    total: 20, staleTenureStatus: stale.status, returnedAtCapacity: true, freeBasicObserved: true});

  await setup('insert into public.arsenal_copies '
    + '(island_owner,copy_no,weapon,source,economy_account_id,economy_run_epoch) '
    + 'select $1::uuid,n,\'pistols\',\'converted\',$2::uuid,$3::uuid from generate_series(21,24)n',
  [owner.actorId, envelope.accountId, envelope.runEpoch],
  'Four explicit existing converted-copy fixtures model grandfathered overflow; no purchase, migration or historical receipt is fabricated');
  const overflow = await inventory(winner, code);
  assert.equal(overflow.total, 24);
  const identityHash = hashValue(overflow.copies.map(copy => copy.id).sort());
  const held = overflow.copies.find(copy => copy.holder === winner.actorId);
  assertStatus(await move(winner, economy, 'return', held), 200, 'Grandfathered overflow return');
  changed = await inventory(winner, code);
  assert.equal(changed.total, 24);
  assertStatus(await move(winner, economy, 'take', changed.copies.find(copy => copy.id === held.id)),
    200, 'Grandfathered overflow take');
  const excessBuy = await call(challenger, '/api/island/arsenal/buy', {method: 'POST', body: {
    economy, actionUid: uid(), weapon: 'pistols'}});
  assertStatus(excessBuy, 409, 'Purchase over grandfathered capacity');
  assert.equal(excessBuy.data.error.code, 'arsenal_full');
  assert.equal(hashValue((await copies(owner.actorId)).map(copy => copy.id).sort()), identityHash);
  note('grandfathered-overflow-preserved-with-unrestricted-returns', {total: 24,
    identityHash, returnedAndRetaken: true, newPurchaseStatus: excessBuy.status});

  await stopHeartbeats();
  await heartbeat(actors, economy);
  const preWave = await inventory(owner, code);
  const expectedLoadouts = new Map(preWave.copies.filter(copy => copy.holder).map(copy => [copy.holder, copy]));
  assert.equal(expectedLoadouts.size, 4);
  const started = assertStatus(await call(owner, '/api/waves/start', {method: 'POST', body: {
    ...proof(owner, economy), where: code, waveProtocol: 2, actionUid: uid()}}), 200, 'Canonical bell');
  assert.equal(started.wave, 11);
  assert.equal(started.initialSnapshot.participants.length, 4);
  const initialHash = hashValue(started.initialSnapshot);
  const frozen = await read('select player_id::text,copy_id::text,copy_generation::text,frozen_captain '
    + 'from public.shared_session_slots where wave_id=$1::uuid order by player_id', [started.waveId]);
  for (const row of frozen) {
    const expected = expectedLoadouts.get(row.player_id);
    assert.equal(row.copy_id, expected.id);
    assert.equal(row.copy_generation, expected.holderGeneration);
    assert.equal(row.frozen_captain.weapon, expected.weapon);
  }
  const during = await move(challenger, economy, 'take', preWave.copies.find(copy => copy.holder === null));
  assertStatus(during, 409, 'Reservation inventory mutation');
  assert.equal(during.data.error.code, 'wave_running');
  note('canonical-bell-froze-four-exact-loadouts', {wave: started.wave, participants: frozen.length,
    frozenLoadoutHash: hashValue(frozen), mutationStatus: during.status, initialSnapshotHash: initialHash});

  const departed = assertStatus(await call(member, '/api/games/leave', {method: 'POST', body: {code}}), 200, 'Member departure');
  assert.equal(departed.left, true);
  sessions.delete(member.actorId);
  const memberCopy = (await copies(owner.actorId)).find(copy => copy.holder === member.actorId);
  assert.equal(memberCopy.pending_return_wave_id, started.waveId);
  const deleteResult = assertStatus(await call(victim, '/api/me', {method: 'DELETE', body: {confirm: true}}), 200, 'Nonowner account deletion');
  assert.equal(deleteResult.deleted, true);
  sessions.delete(victim.actorId);
  const removed = await read('select (select count(*)::int from auth.users where id=$1::uuid) as auth_count, '
    + '(select count(*)::int from public.profiles where id=$1::uuid) as profile_count', [victim.actorId]);
  assert.deepEqual(removed[0], {auth_count: 0, profile_count: 0});
  const pending = await copies(owner.actorId);
  const victimCopy = pending.find(copy => copy.holder === victim.actorId);
  assert.equal(victimCopy.pending_return_wave_id, started.waveId);
  assert.equal(pending.length, 24);
  assert.equal(hashValue(pending.map(copy => copy.id).sort()), identityHash);
  note('departed-and-deleted-holders-kept-pending-copies', {total: 24,
    pendingCopies: pending.filter(copy => copy.pending_return_wave_id === started.waveId).length,
    authDeleted: true, profileDeleted: true});

  for (const actor of [owner, challenger]) assertStatus(await call(actor, '/api/island/session/disconnect', {
    method: 'POST', body: proof(actor, economy)}), 200, 'Disconnect retained controller');
  const disconnectBefore = await read('select player_id::text,grace_until::text '
    + 'from public.shared_session_controls where player_id=any($1::uuid[]) order by player_id',
  [[owner.actorId, challenger.actorId]]);
  assertStatus(await call(owner, '/api/island/session/disconnect', {method: 'POST',
    body: proof(owner, economy)}), 200, 'Repeated disconnect');
  const disconnectAfter = await read('select player_id::text,grace_until::text '
    + 'from public.shared_session_controls where player_id=any($1::uuid[]) order by player_id',
  [[owner.actorId, challenger.actorId]]);
  assert.deepEqual(disconnectAfter, disconnectBefore);
  note('all-clients-stopped-with-fixed-real-grace', {remainingControllers: 2,
    repeatedDisconnectDidNotExtendDeadline: true, browserProcesses: 0,
    observation: 'No player API or arsenal read occurs during the following real grace wait.'});
  // The common independently running production worker owns deadline normalization/closure.
  // This driver neither invokes a closure nor changes a clock, outcome, HP or journal.
  await pause(67000);
  const closed = await read('select outcome,loot_coins::text from public.island_wave_closures '
    + 'where wave_id=$1::uuid', [started.waveId]);
  assert.equal(closed.length, 1, 'Independent worker did not close the unattended attempt');
  assert.equal(closed[0].outcome, 'abandoned');
  assert.equal(closed[0].loot_coins, '0');
  const settled = await copies(owner.actorId);
  assert.equal(settled.length, 24);
  assert.equal(hashValue(settled.map(copy => copy.id).sort()), identityHash);
  assert.equal(settled.filter(copy => copy.holder !== null).length, 0);
  assert.equal(settled.filter(copy => copy.pending_return_wave_id !== null).length, 0);
  for (const copy of settled) {
    const earlier = preWave.copies.find(row => row.id === copy.id);
    assert.equal(BigInt(copy.holder_generation), BigInt(earlier.holderGeneration)
      + (earlier.holder === null ? 0n : 1n), 'Canonical return must advance each original held tenure once');
  }
  const snapshotAfter = await read('select initial_snapshot from public.recovery_wave_states where wave_id=$1::uuid', [started.waveId]);
  assert.equal(hashValue(snapshotAfter[0].initial_snapshot), initialHash);
  const frozenAfter = await read('select player_id::text,copy_id::text,copy_generation::text,frozen_captain '
    + 'from public.shared_session_slots where wave_id=$1::uuid order by player_id', [started.waveId]);
  assert.deepEqual(frozenAfter, frozen);
  assert.deepEqual(await money(envelope.accountId), paid);
  const walletsAfter = await read('select player_id::text,balance::text from public.wallets '
    + 'where player_id=any($1::uuid[]) order by player_id', [[owner.actorId, member.actorId, challenger.actorId]]);
  assert.deepEqual(walletsAfter, walletsBefore.filter(row => row.player_id !== victim.actorId));
  note('independent-worker-settled-all-original-pending-copies', {outcome: closed[0].outcome,
    lootCoins: closed[0].loot_coins, total: 24, stored: 24, identityHash,
    frozenSnapshotUnchanged: true, frozenLoadoutsUnchanged: true,
    continuingPersonalWalletsUnchanged: true, money: await money(envelope.accountId)});

  const finalView = await inventory(owner, code);
  assert.equal(finalView.total, 24);
  assert.equal(finalView.stored, 24);
  const deletedHolderCopy = finalView.copies.find(copy => copy.id === victimCopy.id);
  const finalRace = await Promise.all([owner, challenger].map(actor => move(actor, economy, 'take', deletedHolderCopy)));
  assert.deepEqual(finalRace.map(reply => reply.status).sort(), [200, 409]);
  assert.equal((await copies(owner.actorId)).length, 24);
  assert.deepEqual(await money(envelope.accountId), paid);
  note('deleted-holder-copy-reused-once-after-canonical-close', {raceStatuses: finalRace.map(reply => reply.status),
    total: 24, exactSavedIdentityRetained: true});

  const helpersAfter = await helperHashes();
  assert.deepEqual(helpersAfter, helpersBefore, 'Imported helper closure changed during the run');
  const sourceAfter = sourceEvidence(baseline, {checkoutRoot: root});
  const servedSourcesAfter = servedSourceEvidence(environment.runtime);
  const workerAfter = await workerSource(environment.runtime);
  const report = {result: 'passed', sourceBefore, sourceAfter, productionSource: baseline,
    servedSourcesBefore: environment.servedSources, servedSourcesAfter, workerBefore, workerAfter,
    scenarioSha256, helpersBefore, helpersAfter, startedAt, finishedAt: new Date().toISOString(), facts,
    limitations: ['Fresh 5000-coin budget, saved wave10 unlock and four converted overflow copies are explicit setup, not earning/conversion evidence.',
      'No browser rendering, natural combat win, HP/fall, injected outcome, accelerated clock or immutable-history edit is used.',
      'Unattended canonical abandonment depends on the separately running common production worker; its PID/source evidence belongs to the provider harness.',
      'This bounded arsenal case does not establish other authenticated acceptance rows, hosted deployment or activation.']};
  await writeFile(output + '/result.json', JSON.stringify(report, null, 2) + '\n', {mode: 0o600});
} catch (error) {
  process.exitCode = 1;
  await writeFile(output + '/failure.json', JSON.stringify({result: 'failed', sourceBefore,
    productionSource: baseline, scenarioSha256, helpersBefore, startedAt, finishedAt: new Date().toISOString(),
    error: String(error), stack: error.stack, facts}, null, 2) + '\n', {mode: 0o600});
  throw error;
} finally {
  clearInterval(timer);
  if (heartbeatFlight) await heartbeatFlight;
  await environment?.close?.();
}
