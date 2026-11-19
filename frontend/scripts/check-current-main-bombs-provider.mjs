// Real provider carried-bomb acceptance on the original legacy protocol-2 producer.
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
const {observe, install} = await import(observer.href);
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
let rendered;
const uid = () => 'bomb_' + randomUUID().replaceAll('-', '');
const read = (statement, parameters = []) => observe(statement, parameters, {runtimePath});
const setup = (statement, parameters, purpose) => install(statement, parameters, purpose, {runtimePath});
function ok(reply, label) { assert.equal(reply.status, 200, label + ': ' + JSON.stringify(reply.data)); return reply.data; }
function note(event, detail = {}) { const row = {event, at: new Date().toISOString(), ...detail}; facts.push(row); console.log(JSON.stringify(row)); }
async function enter(page, options = {}) {
  try { await land(page, options); }
  catch (error) {
    if (error.name !== 'TimeoutError') throw error;
  }
  for (const name of ['Skip', 'Got it']) {
    const button = page.getByRole('button', {name, exact: true}).first();
    if (await button.isVisible().catch(() => false)) await button.click({noWaitAfter: true});
  }
  // A real completed Join may use the normalized code while HTTP includes its ISLE prefix.
  await page.waitForFunction(({join}) => {
    const island = window.__island?.island;
    const actual = island?.visiting?.code ?? island?.island?.code;
    const clean = value => String(value ?? '').replace(/^ISLE-/i, '').toUpperCase();
    return window.__island?.world.current?.id === 'home_islet' && !!actual
      && (!join || clean(actual) === clean(join));
  }, {join: options.join ?? null}, {timeout: 30000});
}
async function watch(page) {
  let found = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    const tutorial = page.getByRole('button', {name: 'Got it', exact: true}).first();
    if (await tutorial.isVisible().catch(() => false)) await tutorial.click({noWaitAfter: true});
    found = await page.evaluate(() => !!window.__island?.waves?.island?.wave);
    if (found) break;
    if (attempt % 10 === 0) await page.evaluate(() => window.__island?.island?.joinRunningWave());
    await page.waitForTimeout(500);
  }
  assert.ok(found, 'The real game did not attach its current wave after visible tutorial dismissal');
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
    const {readRules} = await import('/src/pirates/wave-rules.js');
    const {recoveryWaveDefenses} = await import('/src/pirates/recovery-snapshot.js');
    const {eventFor} = await import('/src/pirates/wave-events.js');
    const {simulationInputFromJournal} = await import('/src/pirates/recovery-transport.js');
    const {createWaveReplay, createReplayDriver} = await import('/src/pirates/wave-replay.js');
    const sim = createWave({...snapshot.createWave, ...readRules(snapshot.rules),
      seed: snapshot.seed, countdown: 0, defenses: recoveryWaveDefenses(snapshot),
      event: snapshot.createWave.event ?? eventFor(snapshot.createWave.wave, snapshot.seed),
      finishers: true, finisherPreparation: true, towerHealth: true,
      recoveryVersion: 1, waveProtocol: 2, recoveryStructures: snapshot.structures,
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
async function journal(actor, waveId, proof = null) {
  const query = new URLSearchParams({after: '0'});
  if (proof) for (const [key, value] of Object.entries({islandOwner: proof.economy.islandOwner,
    runEpoch: proof.economy.runEpoch, sessionId: proof.sessionId,
    connectionGeneration: proof.connectionGeneration})) query.set(key, value);
  const path = '/api/waves/' + waveId + '/events?' + query;
  const reply = actor.request ? await actor.request(path) : await api(actor.page, path);
  const page = ok(reply, 'Actual sealed journal page');
  assert.equal(page.events.length ? page.events.at(-1).serverSeq : 0, page.headSeq,
    'This bounded observation requires the whole actual prefix in one page');
  return {events: page.events, seal: page.sealedThroughTick};
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
  note('actual-registered-clients-ready', {independentBrowserProcesses: 2});
  await enter(owner.page, {create: true});
  const own = ok(await api(owner.page, '/api/island'), 'Legacy island');
  const code = own.code;
  await setup('select public.apply_wallet_transaction($1::uuid,5000,\'starting_coins\',$2)',
    [owner.actorId, uid()], 'Explicit extra disposable wallet budget for buying the test weapon; not natural income');
  await setup('update public.islands set wave_best=10,next_wave=1 where player_id=$1::uuid',
    [owner.actorId], 'Explicit saved wave-10 unlock and ordinary repeat-attempt fixture; no earned-progress claim');
  const purchased = ok(await api(owner.page, '/api/island/arsenal/buy', {method: 'POST',
    body: {weapon: 'fire_bombs', actionUid: uid(), code}}), 'Legacy fire-bomb purchase');
  assert.equal(purchased.carried, 'fire_bombs');
  note('real-legacy-purchase', {carried: purchased.carried, browserProcesses: 2});
  await owner.page.evaluate(async () => { await window.__island.island.load(); await window.__island.island.arsenal.refresh(); });
  await enter(mate.page, {join: code});
  const started = ok(await api(owner.page, '/api/waves/start', {method: 'POST', body: {
    where: code, waveProtocol: 2, actionUid: uid()}}), 'Actual legacy protocol-2 start');
  note('actual-legacy-start-api', {recoveryVersion: started.recoveryVersion, waveProtocol: started.waveProtocol});
  // Legacy games join an existing attempt on arrival, not by the native idle poll.
  // Invoke that ordinary authenticated current/join flow after the explicit API bell.
  for (const actor of [owner, mate]) await actor.page.evaluate(() => window.__island.island.joinRunningWave());
  const ownWave = await watch(owner.page);
  assert.equal(ownWave.native, false); assert.equal(ownWave.recoveryVersion, 1); assert.equal(ownWave.protocol, 2);
  const mateWave = await watch(mate.page);
  assert.equal(mateWave.waveId, ownWave.waveId);
  await owner.page.waitForFunction(() => window.__island.waves.island.state?.ships?.some(ship => ship.state === 'attacking'), null, {timeout: 90000});
  const queued = await owner.page.evaluate(() => {
    const wave = window.__island.waves.island.wave, target = wave.state.ships.find(ship => ship.state === 'attacking');
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
  const accepted = await journal(owner, ownWave.waveId);
  const shots = accepted.events.filter(row => row.payload?.command?.type === 'captain_shot');
  assert.equal(shots.length, 1); assert.equal(shots[0].payload.captain.weapon, 'fire_bombs');
  const one = await replay(owner.page, ownWave.snapshot, accepted.events, accepted.seal, ownWave.token);
  const two = await replay(mate.page, ownWave.snapshot, accepted.events, accepted.seal, ownWave.token);
  checkBomb(one); assert.deepEqual(two, one);
  note('legacy-area-blast-observed-on-both-real-clients', {journalShots: shots.length,
    journalWeapon: shots[0].payload.captain.weapon, fired: one.fired.length,
    blasts: one.blasts.length, damageEvents: one.damage.length,
    damageAmounts: one.damage.map(row => row.damage), identicalReplay: true});
  await owner.page.screenshot({path: output + '/legacy-after-area-blast.png'});
  await mate.context.setOffline(true);
  await mate.page.waitForTimeout(1000);
  const resumedPoll = mate.page.waitForResponse(response => new URL(response.url()).pathname ===
    '/api/waves/' + ownWave.waveId + '/events' && response.status() === 200, {timeout: 15000});
  await mate.context.setOffline(false);
  await resumedPoll;
  const liveAfterReconnect = await mate.page.evaluate(({waveId, token}) => {
    const wave = window.__island.waves.island.wave;
    return {sameWave: wave.info.waveId === waveId, sameParticipant: wave.info.participantToken === token,
      fired: window.bombObserved.filter(row => row.type === 'captain_fired' && row.weapon === 'fire_bombs').length,
      blasts: window.bombObserved.filter(row => row.type === 'captain_blast').length,
      damage: window.bombObserved.filter(row => ['ship_hit', 'boarder_hit'].includes(row.type)
        && String(row.by).startsWith('captain:')).map(row => row.damage)};
  }, {waveId: ownWave.waveId, token: mateWave.token});
  assert.equal(liveAfterReconnect.sameWave, true);
  assert.equal(liveAfterReconnect.sameParticipant, true);
  assert.equal(liveAfterReconnect.fired, 1);
  assert.equal(liveAfterReconnect.blasts, 1);
  assert.deepEqual(liveAfterReconnect.damage, one.damage.map(row => row.damage));
  const replayed = await replay(mate.page, ownWave.snapshot, accepted.events, accepted.seal, ownWave.token);
  checkBomb(replayed); assert.deepEqual(replayed, one);
  note('original-four-argument-recovery-producer', {recoveryVersion: 1, protocol: 2, nativeShared: false,
    weaponFromActualPurchase: purchased.carried, journalShots: shots.length,
    journalWeapon: shots[0].payload.captain.weapon, fired: one.fired.length, blasts: one.blasts.length,
    damageEvents: one.damage.length, damageAmounts: one.damage.map(row => row.damage),
    teammateEqual: true, reconnectedReplayEqual: true, duplicatePageAddsNoDamage: true,
    liveAfterReconnect, reconnectKind: 'Actual browser transport outage, not document reload'});

  const helpersAfter = await hashes(); assert.deepEqual(helpersAfter, helpersBefore);
  const report = {result: 'passed', productionSource: baseline, sourceBefore,
    sourceAfter: sourceEvidence(baseline, {checkoutRoot: root}), serving: servedSourceEvidence(rendered.runtime),
    scenarioSha256, helpersBefore, helpersAfter, startedAt, finishedAt: new Date().toISOString(), facts,
    limitations: ['Local current-main acceptance, not a hosted/deployed release.',
      'Wallet/shared budgets and saved unlock/repeat state are explicit setup; not natural progress.',
      'Normal move/shot intents use production authenticated transports. No journal, damage, HP, clock or outcome is fabricated.',
      'This covers the original four-argument legacy recovery producer; the different native shared-session producer is not claimed.',
      'SIM step observation only copies returned events. A real transport reconnect preserves the actual wave/token and event counts, alongside identical production replay of the accepted prefix; full document reload is not claimed.']};
  await writeFile(output + '/result.json', JSON.stringify(report, null, 2) + '\n', {mode: 0o600});
} catch (error) {
  for (const actor of rendered?.clients ?? []) {
    try { await actor.page.screenshot({path: output + '/failure-' + actor.label + '.png'}); } catch {}
  }
  await writeFile(output + '/failure.json', JSON.stringify({result: 'failed', productionSource: baseline,
    sourceBefore, scenarioSha256, startedAt, finishedAt: new Date().toISOString(), error: String(error), stack: error.stack, facts}, null, 2) + '\n');
  throw error;
} finally { await rendered?.close(); }
