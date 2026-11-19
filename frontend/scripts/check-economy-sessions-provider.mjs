// Bounded real-provider controller, duplicate-tab and retained-session acceptance.
// Uses ordinary Auth/API/UI actions; only fresh shared admission is explicit setup.
import {createHash, randomUUID} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';

const argument = name => {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
};
const runtimePath = argument('--runtime');
const output = argument('--output');
if (!runtimePath || !output) throw Error('Use --runtime LOCAL_RUNTIME_JSON --output PRIVATE_DIRECTORY.');
const helperUrl = process.env.MP_ECO_AUTH_HELPERS
  ? pathToFileURL(process.env.MP_ECO_AUTH_HELPERS)
  : new URL('./authenticated-economy/clients.mjs', import.meta.url);
const observerUrl = process.env.MP_ECO_OBSERVER_HELPERS
  ? pathToFileURL(process.env.MP_ECO_OBSERVER_HELPERS)
  : new URL('./authenticated-economy/observer.mjs', import.meta.url);
const {createClients, api, land} = await import(helperUrl.href);
const {observe, admit} = await import(observerUrl.href);
const sourceUrl = new URL('./source.mjs', helperUrl);
const {sourceEvidence} = await import(sourceUrl.href);
const root = fileURLToPath(new URL('../../', import.meta.url));
const productionSource = '82abc298570ce5436c721a992f538c16d04c30e5';
const sourceBefore = sourceEvidence(productionSource, {checkoutRoot: root});
const source = sourceBefore.actualCheckoutHead;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const scenarioSha256 = sha256(await readFile(fileURLToPath(import.meta.url)));
const helperHashes = {};
for (const url of [helperUrl, observerUrl, new URL('./runtime.mjs', helperUrl), sourceUrl]) {
  helperHashes[fileURLToPath(url).split('/').pop()] = sha256(await readFile(fileURLToPath(url)));
}
await mkdir(output, {recursive: false, mode: 0o700});
const startedAt = new Date().toISOString();
const facts = [];
const limitations = [];
let fixture;
let duplicate;
const require = (condition, message) => { if (!condition) throw Error(message); };
const note = (event, details = {}) => {
  const fact = {event, at: new Date().toISOString(), ...details};
  facts.push(fact);
  console.log(JSON.stringify(fact));
};
const read = (statement, parameters = []) => observe(statement, parameters, {runtimePath});
const proof = page => page.evaluate(() => window.__island?.island?.session?.proof() ?? null);
const origin = record => Object.fromEntries(['mode', 'version', 'islandOwner', 'runEpoch']
  .map(key => [key, record.origin[key]]));
const proofBody = record => ({economy: origin(record), sessionId: record.sessionId,
  connectionGeneration: record.connectionGeneration});
const sessionQuery = record => '/api/island/session?' + new URLSearchParams({
  islandOwner: record.origin.islandOwner, runEpoch: record.origin.runEpoch,
  sessionId: record.sessionId, connectionGeneration: record.connectionGeneration});
async function waitProof(page) {
  await page.waitForFunction(() => !!window.__island?.island?.session?.proof(), null, {timeout: 30000});
  return proof(page);
}
async function slot(waveId, player) {
  const rows = await read('select participant_token::text as token, hp_units, down, fall_id::text, '
    + 'down_at_tick, x::text, z::text, cooldowns, state_through_tick, state_input_head::text, '
    + 'revive_basis_seq::text, status, connection_generation::text from public.shared_session_slots '
    + 'where wave_id=$1::uuid and player_id=$2::uuid', [waveId, player]);
  require(rows.length === 1, 'Frozen Captain slot is missing');
  return rows[0];
}
function retained(row) {
  return Object.fromEntries(['token', 'hp_units', 'down', 'fall_id', 'down_at_tick', 'x', 'z',
    'cooldowns', 'state_through_tick', 'state_input_head', 'revive_basis_seq'].map(key => [key, row[key]]));
}

try {
  fixture = await createClients({labels: ['session-owner', 'session-member'], runtimePath});
  const [owner, member] = fixture.clients;
  await land(owner.page, {create: true});
  const own = await api(owner.page, '/api/island');
  require(own.status === 200, 'Owner game did not load');
  const code = own.data.code;
  await admit(owner.actorId, {coins: 200, runtimePath});
  await owner.page.evaluate(async () => {
    await window.__island.island.load();
    await window.__island.island.session.ensure();
  });
  await waitProof(owner.page);
  await land(member.page, {join: code});
  let original = await waitProof(member.page);
  const departure = await owner.page.evaluate(() => window.__island.island.session.leave());
  require(departure?.ok === true, 'Original owner controller did not explicitly depart');
  await owner.page.close();
  note('real-authenticated-member-controller', {generation: original.connectionGeneration});

  const anonymousRead = await api(member.page, '/api/island/session?' + new URLSearchParams({
    islandOwner: original.origin.islandOwner, runEpoch: original.origin.runEpoch}));
  require(anonymousRead.status === 200 && anonymousRead.data.session.isSpectator
    && anonymousRead.data.session.sessionId === null
    && anonymousRead.data.session.connectionGeneration === null, 'Proof-free read exposed control');
  const controllerRead = await api(member.page, sessionQuery(original));
  require(controllerRead.status === 200 && controllerRead.data.session.isController,
    'Fresh original proof did not control');
  const duplicateAttach = await api(member.page, '/api/island/session/attach', {method: 'POST', body: {
    economy: origin(original), sessionId: randomUUID(), expectedGeneration: '0',
    actionUid: 'session_duplicate_' + randomUUID().replaceAll('-', '')}});
  require(duplicateAttach.status === 409 && duplicateAttach.data.error.code === 'controller_held',
    'A second session acquired the occupied actor lease');
  note('duplicate-session-and-proofless-read-refused', {duplicateStatus: duplicateAttach.status,
    prooflessController: false});

  const ownSecond = await api(member.page, '/api/games', {method: 'POST', body: {}});
  require(ownSecond.status === 200, 'Member could not create its ordinary own game');
  const other = await admit(member.actorId, {coins: 200, runtimePath});
  const secondOrigin = other.currentEconomy;
  const cross = await api(member.page, '/api/island/session/attach', {method: 'POST', body: {
    economy: Object.fromEntries(['mode', 'version', 'islandOwner', 'runEpoch']
      .map(key => [key, secondOrigin[key]])),
    sessionId: randomUUID(), expectedGeneration: '0',
    actionUid: 'session_cross_' + randomUUID().replaceAll('-', '')}});
  require(cross.status === 409 && cross.data.error.code === 'controller_held',
    'A second island acquired the occupied actor lease');
  note('cross-island-global-control-refused', {status: cross.status});

  const opening = member.page.waitForEvent('popup');
  await member.page.evaluate(() => window.open(location.href, '_blank'));
  duplicate = await opening;
  await duplicate.waitForLoadState('domcontentloaded');
  await land(duplicate);
  await member.page.bringToFront();
  await member.page.evaluate(() => window.__island.island.session.ensure());
  original = await waitProof(member.page);
  await duplicate.waitForFunction(() => ['spectator', 'waiting', 'unavailable']
    .includes(window.__island?.island?.session?.state.phase), null, {timeout: 30000});
  const cloned = await proof(duplicate);
  require(cloned === null, 'Browser-cloned tab exposed simultaneous controller proof');
  const stillController = await api(member.page, sessionQuery(original));
  require(stillController.status === 200 && stillController.data.session.isController,
    'The original document lost current authority during the duplicate-tab assertion');
  const duplicateState = await duplicate.evaluate(() => ({
    state: window.__island.island.session.state.phase,
    signedIn: !!sessionStorage.getItem('plot-twist-auth-v1')}));
  require(duplicateState.signedIn, 'Popup did not clone the real authenticated session');
  note('browser-cloned-tab-remained-read-only', {phase: duplicateState.state, controller: false});
  await duplicate.close();
  duplicate = null;

  await member.page.evaluate(() => window.__island.island.pick('island_bell'));
  const bell = member.page.locator('.island-card[open] [data-focus="bell"]');
  require(await bell.isEnabled(), 'Invited leader normal bell is not available');
  const [started] = await Promise.all([member.page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/waves/start' && response.request().method() === 'POST'), bell.click()]);
  require(started.status() === 200, 'Normal rendered bell refused');
  const wave = await started.json();
  require(wave.wave === 1 && wave.initialSnapshot.participants.length === 1,
    'Normal first attempt changed wave or roster');
  await member.page.keyboard.down('d');
  await member.page.waitForTimeout(1500);
  await member.page.keyboard.up('d');
  await member.page.waitForTimeout((wave.countdownSeconds + 4) * 1000);
  await member.page.keyboard.down('d');
  await member.page.waitForTimeout(1200);
  await member.page.keyboard.up('d');
  await member.page.waitForTimeout(2000);
  const before = await slot(wave.waveId, member.actorId);
  require(before.status === 'active' && before.state_through_tick >= 0, 'No natural Captain checkpoint yet');
  note('natural-gameplay-checkpoint-observed', {hpUnits: before.hp_units, down: before.down,
    x: before.x, z: before.z, cooldownKeys: Object.keys(before.cooldowns), throughTick: before.state_through_tick});

  // A real browser transport outage holds the accepted state; no response or state is fabricated.
  const disconnected = member.page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/island/session/disconnect');
  await member.page.evaluate(() => window.__island.island.session.disconnect());
  require((await disconnected).status() === 200, 'Explicit disconnect refused');
  await member.context.setOffline(true);
  await member.page.waitForTimeout(1000);
  const absent = await slot(wave.waveId, member.actorId);
  require(absent.status === 'grace', 'Disconnect did not retain the slot in real grace');
  const lease = await read('select grace_until>clock_timestamp() as unexpired, '
    + 'extract(epoch from (grace_until-clock_timestamp())) as seconds_remaining '
    + 'from public.shared_session_controls where player_id=$1::uuid', [member.actorId]);
  require(lease[0]?.unexpired === true, 'Real reconnect grace already elapsed');
  // Hold only new gameplay writes during fresh attachment/read, isolating the retained-state observation.
  await member.page.route('**/api/waves/*/inputs', route => route.abort('internetdisconnected'));
  await member.page.route('**/api/waves/*/captains', route => route.abort('internetdisconnected'));
  await member.context.setOffline(false);
  await member.page.reload({waitUntil: 'domcontentloaded'});
  await land(member.page);
  const resumed = await waitProof(member.page);
  const after = await slot(wave.waveId, member.actorId);
  require(after.status === 'active' && resumed.sessionId === original.sessionId
    && BigInt(resumed.connectionGeneration) > BigInt(original.connectionGeneration),
    'Reconnect did not rotate current authority');
  require(JSON.stringify(retained(after)) === JSON.stringify(retained(absent)),
    'Reconnect changed the accepted Captain facts while gameplay writes were partitioned');
  const obsolete = await api(member.page, '/api/island/session/heartbeat', {method: 'POST', body: proofBody(original)});
  require(obsolete.status === 409 && obsolete.data.error.code === 'stale_controller',
    'Obsolete pre-reconnect proof retained control');
  note('retained-grace-reconnect-preserved-captain', {oldGeneration: original.connectionGeneration,
    newGeneration: resumed.connectionGeneration, hpUnits: after.hp_units, down: after.down,
    x: after.x, z: after.z, cooldownKeys: Object.keys(after.cooldowns),
    graceSecondsRemaining: lease[0].seconds_remaining, staleProofStatus: obsolete.status});
  await member.page.unroute('**/api/waves/*/inputs');
  await member.page.unroute('**/api/waves/*/captains');
  const left = await member.page.evaluate(() => window.__island.island.session.leave());
  require(left?.ok === true, 'Explicit current departure refused');
  const withdrawn = await slot(wave.waveId, member.actorId);
  require(withdrawn.status === 'withdrawn', 'Explicit departure retained active fighter control');
  const balances = await read('select a.balance_coins::text as balance,a.committed_coins::text as committed, '
    + '(select coalesce(sum(t.balance_delta),0)::text from public.island_treasury_transactions t '
    + 'where t.account_id=a.id) as ledger_balance from public.island_economy_accounts a '
    + 'where a.id in ($1::uuid,$2::uuid) order by a.island_owner',
  [original.origin.accountId, secondOrigin.accountId]);
  require(balances.length === 2 && balances.every(row => row.balance === '200'
    && row.committed === '0' && row.ledger_balance === row.balance), 'Session actions changed island funds');
  note('explicit-departure-withdrew-fighter-and-conserved-both-treasuries', {accounts: 2, balanceEach: '200'});
  limitations.push('Fresh shared admission is explicit service-only setup; all identities use actual local provider Auth.');
  limitations.push('One natural wave1 attempt was observed; no outcome, HP, fall, clock, cooldown or position was injected.');
  limitations.push('Reconnect comparison temporarily aborts new input/Captain-report transport while reading retained facts; no fake response is supplied.');
  if (!after.down) limitations.push('No naturally fallen state was reached; fallen reconnect/revival is not proved by this journey.');
  if (!Object.keys(after.cooldowns).length) limitations.push('Observed cooldown state was empty; nonempty cooldown persistence is not proved.');
  limitations.push('This bounded case does not establish the full authenticated acceptance matrix, grace expiry, all-browser-gone settlement or production readiness.');
  const sourceAfter = sourceEvidence(productionSource, {checkoutRoot: root});
  const report = {result: 'passed', source, productionSource, sourceBefore, sourceAfter, scenarioSha256, helperHashes,
    startedAt, finishedAt: new Date().toISOString(), facts, limitations};
  await writeFile(output + '/result.json', JSON.stringify(report, null, 2) + '\n', {mode: 0o600});
} catch (error) {
  await writeFile(output + '/failure.json', JSON.stringify({result: 'failed', source,
    productionSource, sourceBefore, scenarioSha256, helperHashes, startedAt, finishedAt: new Date().toISOString(),
    error: String(error), facts}, null, 2) + '\n', {mode: 0o600});
  throw error;
} finally {
  await duplicate?.close().catch(() => {});
  await fixture?.close();
}
