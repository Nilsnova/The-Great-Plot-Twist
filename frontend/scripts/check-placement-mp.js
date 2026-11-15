// T36 flexible placement (specs/T36-flexible-placement.md, D041) with two players on one island, before the flag
// `placement` goes on in production. Headless Chrome, one browser context, the fake server shared by both tabs
// (?islands=fake&fakeworld=…, fake-api.js: its answers always say layout.movable true, as the server does with the
// flag on) and the BroadcastChannel room, as in check-multiplayer.js. The host creates a game and the friend joins
// it with the code; the host builds a wall and a cannon and moves both from their cards (Move › tap a square ›
// Place here): the friend's island answer and map show each new square within 2 s (check-multiplayer's bound for
// upgrades); the friend moves the cannon again on the host's island and the host's map follows within 2 s. Refused
// squares (the bar turns red, Place here is off, and the server answers the same code): the sea, another
// building's square, and a cannon that would close the heart's last way to the beach (a wall on the same square
// is fine: walls never block). The host rings the bell: both pages' sims fight the wall and the cannon on the
// squares the server holds (the defenses each sim was made with and the towers it reports, page by page); in the
// wave the card's Move is off with its reason, and a move sent anyway is refused with the server's wave_running
// message, on the bar and from the API. After the wave both pages reload and still show the moved squares.
// Last, with the flag wall_recovery on as well (a stand-in walls answer, real Chromium DOM): a damaged wall's card
// shows Repair and Move, a destroyed one Rebuild and Move; in a wave both are off with their reasons; the damaged
// wall moves and keeps its Repair; Repair brings Upgrade back, Move still there.
//   node scripts/check-placement-mp.js [folder]        (npm run test:placement; default captures/placement-mp)
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {openWorldBrowser, settle} from './world-browser-tools.js';
import {stubOfflineApi} from './api-browser-fixture.js';
import {stubWeather} from './weather-browser-fixture.js';

const out = process.argv[2] ?? 'captures/placement-mp';
await mkdir(out, {recursive: true});
const WORLD = `pl${Date.now().toString(36)}`;
const env = await openWorldBrowser({hmr: false}), context = env.page.context();
const pages = [], results = [];
const log = (...args) => console.log(...args);
// check-multiplayer.js: a change on one page reaches the other page's map within 2 s (200 ms for the reading).
const LIMIT_MS = 2000, SLACK_MS = 200;

// The front door's cards until the player stands on the island (check-multiplayer.js openCaptain): Skip the lore,
// Got it on the goal card, and on the games card Create a game (host), Join with the code, or Continue (a reload).
async function enter(captain, {create = false, join = null} = {}) {
  const {page} = captain;
  await page.locator('#play').click();
  const landed = () => page.evaluate(() => !!document.querySelector('.island-card-lobby[open]')
    || (window.__island?.world.current?.id === 'home_islet' && !!window.__island.island?.island && !document.querySelector('dialog[open]')));
  for (let i = 0; i < 30; i++) {
    await page.waitForFunction(() => document.querySelector('dialog.cutscene[open],.tutorial-card[open],.goal-card[open],.games-card[open],.island-card-lobby[open]')
      || (window.__island?.world.current?.id === 'home_islet' && window.__island.island?.island && !document.querySelector('dialog[open]')), null, {timeout: 60000, polling: 100});
    if (await page.locator('.games-card[open]').count()) {
      await page.locator('.games-card[open] .games-create-button').waitFor();
      await page.waitForTimeout(400); // Continue (GET /api/games) fills in
      const resume = page.locator('.games-card[open] .games-pick');
      if (!create && !join && await resume.count()) await resume.first().click();
      else if (join) { await page.locator('.games-card[open] .games-code').fill(join); await page.locator('.games-card[open]').getByRole('button', {name: 'Join', exact: true}).click(); }
      else await page.locator('.games-card[open]').getByRole('button', {name: 'Create a game', exact: true}).click();
    }
    else if (await page.locator('.goal-card[open]').count()) await page.locator('.goal-card[open]').getByRole('button', {name: 'Got it', exact: true}).click();
    else if (await page.locator('dialog.cutscene[open],.tutorial-card[open]').count()) await page.getByRole('button', {name: 'Skip', exact: true}).click({timeout: 5000}).catch(() => {});
    else if (await landed()) break;
    await page.waitForTimeout(300);
  }
  // The friend plays on the host's island: wait until it has answered (the join's visit read).
  await page.waitForFunction(friend => (friend ? !!window.__island.island.visiting?.spots : !!window.__island.island.island?.spots), captain.playerId !== 'me', {timeout: 30000, polling: 100});
  await page.evaluate(() => { window.__island.settings.hour = 12; });
}
async function openCaptain(name, playerId, options) {
  const page = pages.length ? await context.newPage() : env.page, first = !pages.length;
  if (!first) {
    await stubOfflineApi(page); await stubWeather(page);
    page.on('pageerror', error => env.errors.push(`${name}: ${error.message}`));
    page.on('console', message => { if (message.type() === 'error') env.errors.push(`${name}: ${message.text()}`); });
  }
  await page.setViewportSize({width: 960, height: 600});
  await page.goto(`${env.url}/?islands=fake&fakeworld=${WORLD}&fakeplayer=${playerId}&fakename=${encodeURIComponent(name)}`);
  if (first) { await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }); await page.reload(); }
  const captain = {name, page, playerId};
  pages.push(captain);
  await enter(captain, options);
  log(`${name} is on the island (${playerId})`);
  return captain;
}
const island = (captain, fn, arg) => captain.page.evaluate(([source, arg]) => (0, eval)(source)(window.__island.island, arg), [String(fn), arg]);
const shot = async name => {
  for (const captain of pages) { await settle(captain.page); await captain.page.screenshot({path: `${out}/${name}-${captain.playerId}.png`}); }
  log(`screenshots ${name}`);
};
// Where a page has one spot: the island answer's x/z (the host's own island, the friend's visit) and the building
// the map draws for it (the real art, island-<kind>:<spot>, at its ground x/z: art.js placeArt), or null while none is drawn.
const placeOf = (captain, spot) => captain.page.evaluate(spot => {
  const i = window.__island.island, target = i.visiting?.spots ? i.visiting : i.island;
  const answer = target?.spots?.find(item => item.id === spot) ?? null;
  let map = null;
  window.__island.scene.traverse(object => {
    if (/^island-(wall|cannon|mortar|harpoon|watchtower|house):/.test(object.name) && object.name.endsWith(`:${spot}`)
      && object.visible && object.userData.level !== undefined) map = {x: object.userData.ground.x, z: object.userData.ground.z};
  });
  return {answer: answer && Number.isFinite(answer.x) ? {x: answer.x, z: answer.z} : null, map};
}, spot);
const near = (a, b) => !!a && Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6;
// Waits (at most 2 s) until the answer and the map of `captain` show `spot` at `at`; answers the ms it took.
async function seesAt(captain, spot, at, what, began = Date.now()) {
  const ok = async () => { const seen = await placeOf(captain, spot); return near(seen.answer, at) && near(seen.map, at); };
  while (Date.now() - began < LIMIT_MS && !await ok()) await captain.page.waitForTimeout(50);
  const seen = await placeOf(captain, spot), took = Date.now() - began;
  // Too late: measure when it did arrive (up to 15 s), for the report; the check still fails.
  let late = '';
  if (!(near(seen.answer, at) && near(seen.map, at))) {
    while (Date.now() - began < 15000 && !await ok()) await captain.page.waitForTimeout(100);
    late = await ok() ? ` (it arrived after ${Date.now() - began} ms)` : ' (not even after 15 s)';
  }
  assert.ok(near(seen.answer, at), `${captain.name}'s island answer has ${what} at ${at.x},${at.z} within 2 s: ${JSON.stringify(seen)}${late}`);
  assert.ok(near(seen.map, at), `${captain.name}'s map draws ${what} at ${at.x},${at.z} within 2 s: ${JSON.stringify(seen)}${late}`);
  assert.ok(took <= LIMIT_MS + SLACK_MS, `${what} reached ${captain.name} within 2 s (${took} ms)`);
  return took;
}
// The Move flow of the card: open the spot's card, press Move, tap the square (world.js onGround does the same for a
// real tap, capture-placement.js checks that) and read the bar.
async function pickSquare(captain, spot, at) {
  const {page} = captain;
  await island(captain, (i, spot) => i.pick(spot), spot);
  await page.locator('.island-card[open] .island-move').click();
  await page.locator('.island-move-bar:not([hidden])').waitFor();
  await page.evaluate(at => window.__island.island.moveMode.tap(at.x, at.z), at);
  return page.evaluate(() => { const bar = document.querySelector('.island-move-bar');
    return {refused: bar.classList.contains('is-refused'), status: bar.querySelector('.island-move-status').textContent,
      place: !bar.querySelector('.island-move-place').disabled, title: bar.querySelector('.island-move-title').textContent}; });
}
// Place here; answers the time the server's answer was in (the bar closes then), where the other page's clock
// starts, as check-multiplayer.js starts it when the upgrade's call has answered.
async function place(captain, spot, at) {
  const {page} = captain;
  const clicked = Date.now();
  await page.locator('.island-move-place').click();
  await page.locator('.island-move-bar').waitFor({state: 'hidden', timeout: 10000});
  // On a visit the page reads the island again after the move (index.js took): wait for that answer too.
  await page.waitForFunction(([spot, at]) => { const i = window.__island.island, target = i.visiting?.spots ? i.visiting : i.island;
    const answer = target?.spots?.find(item => item.id === spot); return answer?.x === at.x && answer?.z === at.z; }, [spot, at], {timeout: 10000, polling: 50}).catch(() => {});
  const answered = Date.now();
  const seen = await placeOf(captain, spot);
  assert.ok(near(seen.answer, at), `${captain.name}'s own answer has ${spot} at ${at.x},${at.z} after Place here: ${JSON.stringify(seen)}`);
  log(`${captain.name} placed ${spot}: the server answered ${answered - clicked} ms after the click`);
  return answered;
}
const cancel = captain => captain.page.locator('.island-move-cancel').click();
const code = captain => (captain.playerId === 'me' ? null : 'ISLE-K7Q2M');
const apiMove = (captain, spot, at) => island(captain, (i, [spot, at, code]) => i.api.move({spot, x: at.x, z: at.z, code}), [spot, at, code(captain)]);
const waveOf = captain => captain.page.evaluate(() => { const w = window.__island.waves?.island.wave;
  return w ? {waveId: w.info.waveId, wave: w.info.wave, ships: w.state.ships.length, done: w.done, ticks: w.ticks} : null; });
async function until(captain, test, what, timeout = 120000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const state = await waveOf(captain); if (test(state)) return state; await captain.page.waitForTimeout(250); }
  throw new Error(`${captain.name}: timed out waiting for ${what}: ${JSON.stringify(await waveOf(captain))}`);
}
// What a page's running sim fights with: the defenses it was made with and the towers its state reports.
const simOf = captain => captain.page.evaluate(() => { const w = window.__island.waves.island.wave;
  return {defenses: w.defenses.map(item => ({id: item.id, kind: item.kind, level: item.level, x: item.x, z: item.z})).sort((a, b) => (a.id < b.id ? -1 : 1)),
    towers: w.state.towers.map(item => ({id: item.id, x: item.x, z: item.z}))}; });

const WALL = 'wall_1', CANNON = 'cannon_1';
const WALL_AT = {x: -13, z: 1}, CANNON_AT = {x: -8, z: -10}, FRIEND_AT = {x: -10, z: -10.5};
try {
  // 1 The host creates a game, the friend joins it with the code, the host presses Start.
  const host = await openCaptain('Nils', 'me', {create: true});
  const ben = await openCaptain('Ben', 'ben', {join: 'k7q2m'});
  assert.equal(await island(ben, i => i.visiting.ownerName), 'Nils');
  for (const captain of pages) {
    await captain.page.waitForFunction(() => document.querySelectorAll('.island-card-lobby[open] .island-lobby-player.is-online').length === 2, null, {timeout: 30000, polling: 250});
  }
  await host.page.locator('.island-card-lobby[open] .island-lobby-start').click();
  for (const captain of pages) await captain.page.waitForFunction(() => window.__island.island.ui.open !== 'lobby', null, {timeout: 15000, polling: 100});
  for (const captain of pages) await captain.page.waitForFunction(() => window.__island.island.roomPlace() === 'isle_k7q2m', null, {timeout: 5000});
  for (const captain of pages) {
    assert.equal(await island(captain, i => (i.visiting?.spots ? i.visiting : i.island).layout?.movable), true, `${captain.name}'s answer says layout.movable`);
  }
  // 2 The host builds a wall and a cannon on their fixed spots; the friend sees both.
  await island(host, async i => { i.dev.setCoins(400); await i.load(); await i.build('wall_1', 'wall'); await i.build('cannon_1', 'cannon'); });
  await ben.page.waitForFunction(() => ['wall_1', 'cannon_1'].every(id => window.__island.island.visiting?.spots?.find(spot => spot.id === id)?.built), null, {timeout: 5000, polling: 100});
  for (const captain of pages) await captain.page.waitForFunction(() => { let n = 0; window.__island.scene.traverse(o => { if (/^island-(wall|cannon):(wall_1|cannon_1)$/.test(o.name) && o.visible && o.userData.level !== undefined) n++; }); return n === 2; }, null, {timeout: 30000, polling: 200});
  const fixedWall = await placeOf(ben, WALL);
  assert.deepEqual(fixedWall, {answer: null, map: {x: -18.5, z: -1}}, 'an unmoved wall stands on its fixed spot (no x/z in the answer)');
  await shot('01-built');
  // 3 The host moves the wall and the cannon from their cards; the friend's answer and map follow within 2 s.
  const wallBar = await pickSquare(host, WALL, WALL_AT);
  assert.deepEqual(wallBar, {refused: false, status: 'This square is free.', place: true, title: 'Move Wall'});
  const wallTook = await seesAt(ben, WALL, WALL_AT, "the host's moved wall", await place(host, WALL, WALL_AT));
  results.push(`host moved ${WALL} to ${WALL_AT.x},${WALL_AT.z}: the friend's answer and map after ${wallTook} ms`);
  await pickSquare(host, CANNON, CANNON_AT);
  const cannonTook = await seesAt(ben, CANNON, CANNON_AT, "the host's moved cannon", await place(host, CANNON, CANNON_AT));
  results.push(`host moved ${CANNON} to ${CANNON_AT.x},${CANNON_AT.z}: the friend's answer and map after ${cannonTook} ms`);
  await shot('02-host-moved');
  // 4 The friend moves the cannon again on the host's island; the host's answer and map follow within 2 s.
  const friendBar = await pickSquare(ben, CANNON, FRIEND_AT);
  assert.equal(friendBar.place, true, `the friend may place the cannon: ${JSON.stringify(friendBar)}`);
  const friendTook = await seesAt(host, CANNON, FRIEND_AT, "the friend's moved cannon", await place(ben, CANNON, FRIEND_AT));
  results.push(`friend moved ${CANNON} to ${FRIEND_AT.x},${FRIEND_AT.z}: the host's answer and map after ${friendTook} ms`);
  await shot('03-friend-moved');
  // 5 Refused squares: the bar says why and Place here is off; the server refuses the same square with the same code.
  const refusals = [];
  async function refused(captain, spot, at, wanted, message) {
    const bar = await pickSquare(captain, spot, at);
    assert.deepEqual({refused: bar.refused, status: bar.status, place: bar.place}, {refused: true, status: message, place: false}, `${captain.name}'s bar refuses ${spot} at ${at.x},${at.z}`);
    await captain.page.screenshot({path: `${out}/04-refused-${wanted}-${captain.playerId}.png`});
    await cancel(captain);
    const answer = await apiMove(captain, spot, at);
    assert.deepEqual({ok: answer.ok, status: answer.status, code: answer.code, message: answer.message}, {ok: false, status: 409, code: wanted, message}, `the server refuses ${spot} at ${at.x},${at.z}`);
    refusals.push(`${spot}→${at.x},${at.z} ${answer.status} ${answer.code} "${answer.message}"`);
  }
  await refused(host, WALL, {x: 28, z: 0}, 'not_on_land', 'Buildings stand on land, not in the sea.');
  await refused(ben, WALL, FRIEND_AT, 'place_taken', 'Another building stands there.');
  // A ring of empty tower and house spots round the heart with one gap (each step is legal), then the cannon in the gap.
  const RING = [['cannon_2', -1, -1], ['cannon_3', 1, -1], ['cannon_4', 3, -1], ['cannon_5', -3, 5], ['cannon_6', -1, 5], ['cannon_7', 1, 5], ['house_1', 4.5, 2], ['house_2', -4, 2]];
  for (const [spot, x, z] of RING) { const answer = await apiMove(host, spot, {x, z}); assert.equal(answer.ok, true, `ring step ${spot}: ${answer.message}`); }
  // Straight API calls change nothing on screen: both pages read the island again (as after a room message).
  const reread = () => Promise.all(pages.map(captain => island(captain, i => i.refreshDefended())));
  await reread();
  await refused(host, CANNON, {x: 3, z: 5}, 'blocks_route', 'That would wall the heart in. Leave the pirates a way through.');
  await refused(ben, CANNON, {x: 3, z: 5}, 'blocks_route', 'That would wall the heart in. Leave the pirates a way through.');
  // D056: a wall stands only on a pirate path; that gap is off every wall lane, so the bar and the server refuse it.
  await refused(host, WALL, {x: 3, z: 5}, 'off_path', 'Walls go on a pirate path.');
  // Back to the fixed spots (the spots that are not built do not fight, but the wave should see a normal island).
  const FIXED = {cannon_2: [13, -15], cannon_3: [15.5, 14], cannon_4: [-15.5, 14.5], cannon_5: [-15, -6], cannon_6: [14.5, -3], cannon_7: [4.5, 16.5], house_1: [7, -6], house_2: [-8, -6]};
  for (const [spot] of [...RING].reverse()) { const [x, z] = FIXED[spot]; const answer = await apiMove(host, spot, {x, z}); assert.equal(answer.ok, true, `back ${spot}: ${answer.message}`); }
  await reread();
  results.push(`refused: ${refusals.join('; ')}`);
  // Both pages agree on the island before the bell.
  for (const captain of pages) { assert.ok(near((await placeOf(captain, WALL)).answer, WALL_AT)); assert.ok(near((await placeOf(captain, CANNON)).answer, FRIEND_AT)); }
  // 6 The host rings the bell; both pages run the same wave, and both sims fight from the moved squares.
  await island(host, i => i.ringBell());
  const first = await until(host, state => state?.ships > 0, 'the first ships', 90000);
  await until(ben, state => state?.waveId === first.waveId && state.ticks > 0, 'the friend in the same wave', 30000);
  const [hostSim, benSim] = [await simOf(host), await simOf(ben)];
  assert.deepEqual(hostSim, benSim, 'both sims fight with the same defenses on the same squares');
  assert.deepEqual(hostSim.defenses, [{id: CANNON, kind: 'cannon', level: 1, ...FRIEND_AT}, {id: WALL, kind: 'wall', level: 1, ...WALL_AT}], 'the sims fight the moved squares');
  assert.deepEqual(hostSim.towers, [{id: CANNON, ...FRIEND_AT}], "the sim's cannon stands where it was moved");
  results.push(`wave ${first.wave} (${first.waveId}): both sims ${JSON.stringify(hostSim.defenses)}`);
  // 7 In the wave: the card's Move is off with its reason; Move mode does not start; a move sent anyway is refused.
  for (const captain of pages) {
    const card = await island(captain, async (i, spot) => { i.pick(spot); await new Promise(resolve => setTimeout(resolve, 80));
      const button = document.querySelector('.island-card[open] .island-move');
      const read = {disabled: button?.disabled ?? null, why: document.querySelector('.island-card[open] .island-move-why')?.textContent ?? '', start: i.startMove(spot)};
      i.ui.close(); return read; }, CANNON);
    assert.deepEqual(card, {disabled: true, why: 'You can move it between waves.', start: false}, `${captain.name}'s card waits for the break`);
  }
  // The bar sends it anyway (Move mode started by hand): the server's refusal stands on the bar, nothing moves.
  await ben.page.evaluate(() => { const mode = window.__island.island.moveMode; mode.start('wall_1'); mode.tap(-13, -1); });
  const sent = await ben.page.evaluate(() => window.__island.island.moveMode.confirm());
  const waveBar = await ben.page.evaluate(() => ({status: document.querySelector('.island-move-status').textContent, refused: document.querySelector('.island-move-bar').classList.contains('is-refused')}));
  assert.deepEqual({ok: sent.ok, status: sent.status, code: sent.code}, {ok: false, status: 409, code: 'wave_running'}, 'a move in the wave is refused');
  assert.deepEqual(waveBar, {status: 'A wave is under way. Move buildings between waves.', refused: true}, "the friend's bar shows the wave_running message");
  await ben.page.screenshot({path: `${out}/05-wave-running-ben.png`});
  await cancel(ben);
  const hostSent = await apiMove(host, CANNON, CANNON_AT);
  assert.deepEqual({ok: hostSent.ok, code: hostSent.code, message: hostSent.message}, {ok: false, code: 'wave_running', message: 'A wave is under way. Move buildings between waves.'});
  for (const captain of pages) { assert.ok(near((await placeOf(captain, WALL)).answer, WALL_AT)); assert.ok(near((await placeOf(captain, CANNON)).answer, FRIEND_AT)); }
  results.push(`in the wave: Move off on both cards ("You can move it between waves."), the friend's bar and the host's API got 409 wave_running "${sent.message}"`);
  // 8 After the wave both pages reload: the moved squares stay (answer and map).
  for (const captain of pages) await until(captain, state => state?.done, 'the end of the wave', 300000);
  for (const captain of pages) {
    await captain.page.reload();
    await enter(captain);
    for (const [spot, at] of [[WALL, WALL_AT], [CANNON, FRIEND_AT]]) {
      await captain.page.waitForFunction(spot => { let drawn = false; window.__island.scene.traverse(o => { if (o.name.endsWith(`:${spot}`) && /^island-(wall|cannon):/.test(o.name) && o.visible && o.userData.level !== undefined) drawn = true; }); return drawn; }, spot, {timeout: 30000, polling: 200});
      const seen = await placeOf(captain, spot);
      assert.ok(near(seen.answer, at) && near(seen.map, at), `${captain.name} still has ${spot} at ${at.x},${at.z} after a reload: ${JSON.stringify(seen)}`);
    }
  }
  results.push('reload: both pages still show the wall and the cannon on the moved squares');
  await shot('06-after-reload');
  // 9 Placement and wall recovery together (both flags on): the wall card with Repair or Rebuild keeps Move.
  const card = await context.newPage();
  await stubOfflineApi(card);
  card.on('pageerror', error => env.errors.push(`recovery: ${error.message}`));
  await card.route('**/placement-harness', route => route.fulfill({contentType: 'text/html', body: '<!doctype html><html><body></body></html>'}));
  await card.goto(`${env.url}/placement-harness`);
  await card.addScriptTag({type: 'module', content: 'window.harnessImport = path => import(path);'});
  await card.waitForFunction(() => typeof window.harnessImport === 'function');
  const recovery = await card.evaluate(async () => {
    const {createIsland} = await window.harnessImport('/src/island/index.js');
    const {createFakeIslandTransport} = await window.harnessImport('/src/pirates/fake-api.js');
    const {on, emit} = await window.harnessImport('/src/core/events.js');
    const base = createFakeIslandTransport();
    // The walls answer of the server with wall_recovery on (GET /api/island/walls, POST /api/island/repair).
    let health = 40;
    const walls = () => ({ok: true, status: 200, data: {coins: base.dev.read().coins, walls: [{spot: 'wall_1', level: 1, health,
      recoversAt: health < 100 ? new Date(Date.now() + 6 * 60000).toISOString() : null, repairCost: health < 100 ? 4 : null}]}});
    const transport = {get: path => (path.startsWith('/api/island/walls') ? Promise.resolve(walls()) : base.get(path)),
      post: (path, body) => (path === '/api/island/repair' ? Promise.resolve((health = 100, walls())) : base.post(path, body)), get dev() { return base.dev; }};
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport, storage: null, menu: () => () => {}, wallRecovery: () => true});
    await island.load();
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const card = () => document.querySelector('.island-card[open]');
    const read = () => ({main: card().querySelector('[data-focus="repair"],[data-focus="upgrade"]')?.textContent ?? null,
      mainOff: card().querySelector('[data-focus="repair"],[data-focus="upgrade"]')?.disabled ?? null,
      label: card().querySelector('.island-next-label')?.textContent ?? '', reason: card().querySelector('.island-reason')?.textContent ?? '',
      move: card().querySelector('.island-move')?.textContent ?? null, moveOff: card().querySelector('.island-move')?.disabled ?? null,
      moveWhy: card().querySelector('.island-move-why')?.textContent ?? ''});
    transport.dev.setWaveBest(3); transport.dev.setCoins(500); await island.load();
    island.pick('wall_1'); card().querySelector('[data-focus="build"]').click(); await wait(60); island.ui.close();
    island.pick('wall_1'); await wait(60);
    const damaged = read();
    island.setBattle(true); await wait(30);
    const inWave = read();
    island.setBattle(false); await wait(30);
    // Move the damaged wall: the card's Move, a free square, Place here; the card still offers Repair afterwards.
    card().querySelector('.island-move').click(); await wait(30);
    island.moveMode.tap(-16, -8); await island.moveMode.confirm();
    const moved = island.island.spots.find(spot => spot.id === 'wall_1');
    island.pick('wall_1'); await wait(60);
    const afterMove = read();
    health = 0; island.ui.close(); island.pick('wall_1'); await wait(60);
    const destroyed = read();
    card().querySelector('[data-focus="repair"]').click(); await wait(80);
    island.ui.close(); island.pick('wall_1'); await wait(60);
    const repaired = read();
    island.ui.close(); island.dispose();
    return {damaged, inWave, moved: {x: moved.x, z: moved.z}, afterMove, destroyed, repaired};
  });
  assert.deepEqual(recovery.damaged, {main: 'Repair · 🪙 4', mainOff: false, label: 'Damaged · health 40%', reason: '', move: 'Move', moveOff: false, moveWhy: ''}, 'a damaged wall shows Repair and Move');
  assert.deepEqual(recovery.inWave, {main: 'Repair · 🪙 4', mainOff: true, label: 'Damaged · health 40%',
    reason: 'You can repair it between waves. During a wave, press E at the wall.', move: 'Move', moveOff: true, moveWhy: 'You can move it between waves.'}, 'in a wave Repair and Move wait for the break');
  assert.deepEqual(recovery.moved, {x: -16, z: -8}, 'the damaged wall moved');
  assert.deepEqual(recovery.afterMove, recovery.damaged, 'the moved wall keeps its Repair and Move');
  assert.deepEqual({main: recovery.destroyed.main, label: recovery.destroyed.label, move: recovery.destroyed.move, moveOff: recovery.destroyed.moveOff}, {main: 'Rebuild · 🪙 4', label: 'Destroyed', move: 'Move', moveOff: false}, 'a destroyed wall shows Rebuild and Move');
  assert.deepEqual({main: recovery.repaired.main, mainOff: recovery.repaired.mainOff, move: recovery.repaired.move, moveOff: recovery.repaired.moveOff}, {main: 'Upgrade', mainOff: false, move: 'Move', moveOff: false}, 'after Repair the card offers Upgrade and Move again');
  results.push(`wall recovery + placement: damaged "${recovery.damaged.main}" + Move; in a wave both off ("${recovery.inWave.moveWhy}"); moved to -16,-8 and kept Repair; destroyed "${recovery.destroyed.main}" + Move; repaired: "${recovery.repaired.main}" + Move`);
  await card.close();
  const errors = env.errors.filter(text => !/Failed to load resource/.test(text));
  assert.deepEqual(errors, [], 'No browser errors');
  for (const line of results) log(line);
  log('check-placement-mp: all passed');
} catch (error) {
  for (const captain of pages) await captain.page.screenshot({path: `${out}/failure-${captain.playerId}.png`}).catch(() => {});
  for (const line of results) log(line);
  throw error;
} finally { await env.close(); }
