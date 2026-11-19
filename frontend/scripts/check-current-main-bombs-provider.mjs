// Real provider fire-bomb journal acceptance, with legacy and native producers identified separately.
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
const arg = name => { const at = process.argv.indexOf(name); return at < 0 ? null : process.argv[at + 1]; };
const runtimePath = arg('--runtime'), output = arg('--output');
if (!runtimePath || !output) throw Error('Use --runtime LOCAL_RUNTIME_JSON --output NEW_PRIVATE_DIRECTORY.');
const helpers = process.env.MP_ECO_AUTH_HELPERS ? pathToFileURL(process.env.MP_ECO_AUTH_HELPERS)
  : new URL('./authenticated-economy/clients.mjs', import.meta.url);
const observer = new URL('./observer.mjs', helpers);
const {createClients, api, land} = await import(helpers.href);
const {createApiClients} = await import(new URL('./api-clients.mjs', helpers).href);
const {observe, install, admit} = await import(observer.href);
const {sourceEvidence, servedSourceEvidence} = await import(new URL('./source.mjs', helpers).href);
const root = fileURLToPath(new URL('../../', import.meta.url));
const baseline = '64ee02b360d68836b2de9247121ab47dc6a3ecbf';
const sourceBefore = sourceEvidence(baseline, {checkoutRoot: root});
const sha256 = value => createHash('sha256').update(value).digest('hex');
const scenarioSha256 = sha256(await readFile(fileURLToPath(import.meta.url)));
async function hashes() {
  const result = {};
  for (const name of ['clients.mjs', 'api-clients.mjs', 'observer.mjs', 'runtime.mjs', 'source.mjs'])
    result[name] = sha256(await readFile(new URL('./' + name, helpers)));
  for (const name of ['observe.py', 'config.py']) result[name] = sha256(await readFile(
    new URL('../../../backend/tools/authenticated_economy/' + name, helpers)));
  return result;
}
const helpersBefore = await hashes();
await mkdir(output, {recursive: false, mode: 0o700});
const startedAt = new Date().toISOString(), facts = [];
let rendered, native;
const uid = () => 'bomb_' + randomUUID().replaceAll('-', '');
const read = (statement, parameters = []) => observe(statement, parameters, {runtimePath});
const setup = (statement, parameters, purpose) => install(statement, parameters, purpose, {runtimePath});
function ok(reply, label) { assert.equal(reply.status, 200, label + ': ' + JSON.stringify(reply.data)); return reply.data; }
function note(event, detail = {}) { const row = {event, at: new Date().toISOString(), ...detail}; facts.push(row); console.log(JSON.stringify(row)); }
async function watch(page) {
  await page.waitForFunction(() => !!window.__island?.waves?.island?.wave, null, {timeout: 45000});
  return page.evaluate(() => {
    const controller = window.__island.waves.island, wave = controller.wave;
    controller.autoBlade = false;
    window.bombObserved = [];
    const step = wave.sim.step.bind(wave.sim);
    wave.sim.step = (...args) => { const result = step(...args);
      window.bombObserved.push(...result.filter(row => ['captain_fired', 'captain_blast', 'ship_hit', 'boarder_hit'].includes(row.type)));
      return result;
    };
    return {waveId: wave.info.waveId, native: wave.info.nativeShared === true,
      recoveryVersion: wave.info.recoveryVersion, protocol: wave.info.waveProtocol,
      token: wave.info.participantToken, snapshot: wave.info.initialSnapshot};
  });
}
async function replay(page, snapshot, events, sealedThroughTick, token) {
  return page.evaluate(async ({snapshot, events, sealedThroughTick, token}) => {
    const {createWave} = await import('/src/pirates/sim.js');
    const {simulationInputFromJournal} = await import('/src/pirates/recovery-transport.js');
    const {createWaveReplay, createReplayDriver} = await import('/src/pirates/wave-replay.js');
    const sim = createWave({...snapshot.createWave, rules: snapshot.rules, recoveryVersion: 1, waveProtocol: 2,
      recoveryStructures: snapshot.structures,
      ...(snapshot.captainInitialState ? {canonicalCaptains: snapshot.captainInitialState,
        canonicalLoadouts: Object.fromEntries(snapshot.participants.map(row => [row.participantToken, row.captain]))} : {})});
    const journal = createWaveReplay();
    if (!journal.addPage({headSeq: events.length ? events.at(-1).serverSeq : 0, sealedThroughTick, events}))
      throw Error('Actual journal is not a complete replay prefix');
    // Adding the identical accepted prefix again must not apply an input twice.
    if (!journal.addPage({headSeq: events.length ? events.at(-1).serverSeq : 0, sealedThroughTick, events}))
      throw Error('Actual identical journal page was not repeatable');
    const driver = createReplayDriver(journal), observed = [];
    driver.advanceThrough(sealedThroughTick, (_tick, rows) => {
      observed.push(...sim.step(.05, rows.map(simulationInputFromJournal).filter(Boolean)));
    });
    return {fired: observed.filter(row => row.type === 'captain_fired' && row.by === token),
      blasts: observed.filter(row => row.type === 'captain_blast' && row.by === 'captain:' + token),
      damage: observed.filter(row => ['ship_hit', 'boarder_hit'].includes(row.type) && row.by === 'captain:' + token),
      ships: sim.state().ships.map(row => ({id: row.id, x: row.x, z: row.z, hp: row.hp})),
      boarders: sim.state().boarders.map(row => ({id: row.id, x: row.x, z: row.z, hp: row.hp}))};
  }, {snapshot, events, sealedThroughTick, token});
}
async function journal(owner, waveId) {
  const rows = await read('select server_seq::int as "serverSeq",effective_tick as "effectiveTick",type, '
    + 'participant_token::text as "participantToken",payload from public.recovery_wave_events '
    + 'where wave_id=$1::uuid order by server_seq', [waveId]);
  const clock = await read('select greatest(-1,floor(extract(epoch from (clock_timestamp()-starts_at))/.05)::int-1) as tick '
    + 'from public.wave_runs where id=$1::uuid', [waveId]);
  return {events: rows, seal: Math.min(18000, clock[0].tick)};
}
function checkBomb(result) {
  assert.equal(result.fired.length, 1);
  assert.equal(result.fired[0].weapon, 'fire_bombs');
  assert.equal(result.fired[0].mode, 'area');
  assert.equal(result.blasts.length, 1);
  assert.ok(result.blasts[0].hits > 0, 'Area blast did not hit a natural target');
  assert.ok(result.damage.length > 0);
  assert.ok(result.damage.every(row => row.damage > 0 && row.damage <= result.fired[0].damage));
}
try {
  rendered = await createClients({labels: ['bomb-owner', 'bomb-mate'], runtimePath,
    expectedCommit: baseline, independentBrowsers: true});
  const [owner, mate] = rendered.clients;
  await land(owner.page, {create: true});
  const own = ok(await api(owner.page, '/api/island'), 'Legacy island');
  const code = own.code;
  await setup('select public.apply_wallet_transaction($1::uuid,5000,\'starting_coins\',$2)',
    [owner.actorId, uid()], 'Explicit extra disposable wallet budget for buying the test weapon; not natural income');
  await setup('update public.islands set wave_best=10,next_wave=1 where player_id=$1::uuid',
    [owner.actorId], 'Explicit saved unlock and ordinary repeat-attempt fixture; no earned-progress claim');
  const purchased = ok(await api(owner.page, '/api/island/arsenal/buy', {method: 'POST',
    body: {weapon: 'fire_bombs', actionUid: uid(), code}}), 'Legacy fire-bomb purchase');
  assert.equal(purchased.carried, 'fire_bombs');
  note('real-legacy-purchase', {carried: purchased.carried, browserProcesses: 2});
  await owner.page.evaluate(async () => { await window.__island.island.load(); await window.__island.island.arsenal.refresh(); });
  await land(mate.page, {join: code});
  const started = ok(await api(owner.page, '/api/waves/start', {method: 'POST', body: {
    where: code, waveProtocol: 2, actionUid: uid()}}), 'Actual legacy protocol-2 start');
  note('actual-legacy-start-api', {recoveryVersion: started.recoveryVersion, waveProtocol: started.waveProtocol});
  const ownWave = await watch(owner.page);
  assert.equal(ownWave.native, false); assert.equal(ownWave.recoveryVersion, 1); assert.equal(ownWave.protocol, 2);
  const mateWave = await watch(mate.page);
  assert.equal(mateWave.waveId, ownWave.waveId);
  await owner.page.waitForFunction(() => window.__island.waves.island.state?.ships?.length > 0, null, {timeout: 90000});
  const queued = await owner.page.evaluate(() => {
    const wave = window.__island.waves.island.wave, target = wave.state.ships[0];
    const tick = Math.max(wave.ticks + 4, (wave.recoveryReplay.sealedThroughTick ?? -1) + 1);
    const commands = [{type: 'captain_move', x: target.x + 3, z: target.z},
      {type: 'captain_shot', targetId: target.id, x: target.x + 3, z: target.z,
        ax: target.x, az: target.z, seen: wave.ticks}];
    for (const command of commands) wave.recoveryPending.push({inputUid: 'bomb_' + crypto.randomUUID().replaceAll('-', ''),
      actorCounter: ++wave.actorCounter, tick, command});
    wave.recoveryFlushNow = true;
    return {target: target.id, tick};
  });
  await owner.page.waitForFunction(() => window.bombObserved.some(row => row.type === 'captain_blast' && row.hits > 0), null, {timeout: 30000});
  await mate.page.waitForFunction(() => window.bombObserved.some(row => row.type === 'captain_blast' && row.hits > 0), null, {timeout: 30000});
  const accepted = await journal(owner.actorId, ownWave.waveId);
  const shots = accepted.events.filter(row => row.payload?.command?.type === 'captain_shot');
  assert.equal(shots.length, 1); assert.equal(shots[0].payload.captain.weapon, 'fire_bombs');
  const one = await replay(owner.page, ownWave.snapshot, accepted.events, accepted.seal, ownWave.token);
  const two = await replay(mate.page, ownWave.snapshot, accepted.events, accepted.seal, ownWave.token);
  checkBomb(one); assert.deepEqual(two, one);
  await owner.page.screenshot({path: output + '/legacy-after-area-blast.png'});
  await mate.page.reload({waitUntil: 'domcontentloaded'}); await land(mate.page); await watch(mate.page);
  const replayed = await replay(mate.page, ownWave.snapshot, accepted.events, accepted.seal, ownWave.token);
  checkBomb(replayed); assert.deepEqual(replayed, one);
  note('original-four-argument-recovery-producer', {recoveryVersion: 1, protocol: 2, nativeShared: false,
    weaponFromActualPurchase: purchased.carried, journalShots: shots.length,
    journalWeapon: shots[0].payload.captain.weapon, fired: one.fired.length, blasts: one.blasts.length,
    damageEvents: one.damage.length, damageAmounts: one.damage.map(row => row.damage),
    teammateEqual: true, reconnectedReplayEqual: true, duplicatePageAddsNoDamage: true});

  native = await createApiClients({labels: ['native-bomb-owner', 'native-bomb-mate'], runtimePath, expectedCommit: baseline});
  const [host, guest] = native.clients;
  const nativeGame = ok(await host.request('/api/games', {method: 'POST', body: {actionUid: uid()}}), 'Native create');
  const admitted = await admit(host.actorId, {coins: 5000, runtimePath});
  const economy = Object.fromEntries(['mode', 'version', 'islandOwner', 'runEpoch'].map(key => [key, admitted.currentEconomy[key]]));
  await setup('update public.islands set wave_best=10,next_wave=1 where player_id=$1::uuid', [host.actorId], 'Saved native unlock/repeat fixture only');
  ok(await guest.request('/api/games/join', {method: 'POST', body: {code: nativeGame.game.code, actionUid: uid()}}), 'Native join');
  const proofs = [];
  for (const actor of [host, guest]) {
    const response = ok(await actor.request('/api/island/session/attach', {method: 'POST', body: {
      economy, sessionId: randomUUID(), expectedGeneration: '0', actionUid: uid()}}), 'Native attach');
    proofs.push({economy, sessionId: response.session.sessionId, connectionGeneration: response.session.connectionGeneration});
  }
  const buy = ok(await host.request('/api/island/arsenal/buy', {method: 'POST', body: {economy, weapon: 'fire_bombs', actionUid: uid()}}), 'Native bombs');
  const wave = ok(await host.request('/api/waves/start', {method: 'POST', body: {...proofs[0],
    where: nativeGame.game.code, waveProtocol: 2, actionUid: uid()}}), 'Native bell');
  let prefix, pre;
  for (let attempt = 0; attempt < 45; attempt++) {
    for (const [index, actor] of [host, guest].entries()) ok(await actor.request('/api/island/session/heartbeat', {method: 'POST', body: proofs[index]}), 'Native heartbeat');
    prefix = await journal(host.actorId, wave.waveId);
    if (prefix.seal >= 0) pre = await replay(owner.page, wave.initialSnapshot, prefix.events, prefix.seal, wave.participantToken);
    if (pre?.ships.length) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.ok(pre?.ships.length, 'No natural native ship spawned');
  const target = pre.ships[0], tick = prefix.seal + 1;
  const inputs = [{inputUid: uid(), actorCounter: 1, tick, command: {type: 'captain_move', x: target.x + 3, z: target.z}},
    {inputUid: uid(), actorCounter: 2, tick, command: {type: 'captain_shot', targetId: target.id,
      x: target.x + 3, z: target.z, ax: target.x, az: target.z, seen: Math.max(0, prefix.seal)}}];
  const appended = ok(await host.request('/api/waves/' + wave.waveId + '/inputs', {method: 'POST', body: {...proofs[0], waveProtocol: 2, inputs}}), 'Native normal inputs');
  assert.equal(appended.accepted.at(-1).payload.captain.weapon, 'fire_bombs');
  await new Promise(resolve => setTimeout(resolve, 3000));
  prefix = await journal(host.actorId, wave.waveId);
  const nativeOne = await replay(owner.page, wave.initialSnapshot, prefix.events, prefix.seal, wave.participantToken);
  const nativeTwo = await replay(mate.page, wave.initialSnapshot, prefix.events, prefix.seal, wave.participantToken);
  checkBomb(nativeOne); assert.deepEqual(nativeTwo, nativeOne);
  note('shared-native-frozen-loadout-producer', {copyBought: buy.receipt.result.weapon,
    producer: 'shared_session_api.append_inputs', journalWeapon: appended.accepted.at(-1).payload.captain.weapon,
    fired: nativeOne.fired.length, blasts: nativeOne.blasts.length, damageEvents: nativeOne.damage.length,
    damageAmounts: nativeOne.damage.map(row => row.damage), identicalTwoPageReplay: true,
    layer: 'Real registered native API inputs plus actual production SIM/replay on both rendered clients; native UI entry is not claimed.'});
  const helpersAfter = await hashes(); assert.deepEqual(helpersAfter, helpersBefore);
  const report = {result: 'passed', productionSource: baseline, sourceBefore,
    sourceAfter: sourceEvidence(baseline, {checkoutRoot: root}), serving: servedSourceEvidence(rendered.runtime),
    scenarioSha256, helpersBefore, helpersAfter, startedAt, finishedAt: new Date().toISOString(), facts,
    limitations: ['Local current-main acceptance, not a hosted/deployed release.',
      'Wallet/shared budgets and saved unlock/repeat state are explicit setup; not natural progress.',
      'Normal move/shot intents use production authenticated transports. No journal, damage, HP, clock or outcome is fabricated.',
      'Legacy uses two independently rendered actual games; native uses separate real Auth/API actors and production deterministic replay, not a second native UI journey.',
      'SIM step observation only copies returned events; reconnect comparison reconstructs the same actual accepted prefix with the production replay driver.']};
  await writeFile(output + '/result.json', JSON.stringify(report, null, 2) + '\n', {mode: 0o600});
} catch (error) {
  for (const actor of rendered?.clients ?? []) {
    try { await actor.page.screenshot({path: output + '/failure-' + actor.label + '.png'}); } catch {}
  }
  await writeFile(output + '/failure.json', JSON.stringify({result: 'failed', productionSource: baseline,
    sourceBefore, scenarioSha256, startedAt, finishedAt: new Date().toISOString(), error: String(error), stack: error.stack, facts}, null, 2) + '\n');
  throw error;
} finally { await rendered?.close(); await native?.close(); }
