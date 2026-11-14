// Release check for the flag wall_recovery (tasks T29-T32 and T47, decision D039, specs/T29-T32-wall-recovery.md)
// with two captains on one island, without live accounts: headless Chrome, one browser context, the fake server
// shared by both tabs (?islands=fake&fakeworld=…, fake-api.js) with the flag on (&fakeflags=wall_recovery) and the
// BroadcastChannel room. The scenarios, each reported PASS or FAIL with what was measured:
//   1 damage   the host builds six shore walls and one cannon and rings wave 3; boarders and ships break walls; after
//              the wave the server keeps every wall's health and both cards (host on his island, the friend on it as
//              a member) show the same health for every damaged or destroyed wall
//   2 card     a damaged wall offers Repair, a destroyed one Rebuild, never Upgrade; an upgrade is refused
//              needs_repair for both captains and costs nothing
//   3 repair   the host repairs one damaged wall from its card with a double click and a retry with the same click
//              id: his coins drop once by the Repair price; a later click is refused intact and costs nothing; the
//              friend's card and answer show the wall whole
//   4 running  the next wave is rung: a Repair is refused wave_running and the card waits for the break
//   5 tick 0   both sims start that wave with the same hp for every wall (read at tick 0 in both tabs), the same
//              as the server's snapshot (maxHp × health / 100)
//   6 timer    the fake server's clock moves on past 10 minutes: a damaged wall counts as whole (card, answer,
//              upgrade allowed, the next wave's snapshot)
//   P pending integration fix: a client that reports a wall higher than the wave started it does not heal the wall.
//              On origin/main (14 Nov) the first finish is kept as sent, so this one is expected to FAIL until the
//              integration lane's change (walls may only go down) is merged and fake-api.js recordWalls() follows it.
//              It is reported on its own and does not fail the run.
// Exit code 1 when any scenario but P fails.
//   node scripts/check-wall-recovery-mp.js [folder]        (npm run test:walls)
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openWorldBrowser, settle} from './world-browser-tools.js';
import {stubOfflineApi} from './api-browser-fixture.js';
import {stubWeather} from './weather-browser-fixture.js';

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const out = process.argv[2] ?? join(tmpdir(), 'tgpt-wall-recovery', stamp);
await mkdir(out, {recursive: true});
const WORLD = `walls${Date.now().toString(36)}`;
const CODE = 'ISLE-K7Q2M';
const SHORE = ['wall_1', 'wall_2', 'wall_3', 'wall_4', 'wall_5', 'wall_6'];
const env = await openWorldBrowser({hmr: false}), context = env.page.context();
const pages = [];
const log = (...args) => console.log(...args);
const results = []; // {id, name, ok, pending, lines}

// The front door's cards until the player stands in the lobby (the same steps as check-multiplayer.js): Skip the
// lore and the arrival, Got it on the goal card, and on the games card Create a game (host) or Join with the code.
async function openCaptain(name, playerId, {join = null} = {}) {
  const page = pages.length ? await context.newPage() : env.page, first = !pages.length;
  if (!first) {
    await stubOfflineApi(page); await stubWeather(page);
    page.on('pageerror', error => env.errors.push(`${name}: ${error.message}`));
    page.on('console', message => { if (message.type() === 'error') env.errors.push(`${name}: ${message.text()}`); });
  }
  await page.setViewportSize({width: 960, height: 600});
  await page.goto(`${env.url}/?islands=fake&fakeworld=${WORLD}&fakeplayer=${playerId}&fakename=${encodeURIComponent(name)}&fakeflags=wall_recovery`);
  if (first) { await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }); await page.reload(); }
  const captain = {name, page, playerId};
  pages.push(captain);
  await page.locator('#play').click();
  for (let i = 0; i < 20; i++) {
    await page.waitForFunction(() => document.querySelector('dialog.cutscene[open],.tutorial-card[open],.goal-card[open],.games-card[open],.island-card-lobby[open]'),
      null, {timeout: 60000, polling: 100});
    if (await page.locator('.island-card-lobby[open]').count()) break;
    if (await page.locator('.games-card[open]').count()) {
      await page.locator('.games-card[open] .games-create-button').waitFor();
      await page.waitForTimeout(400); // Continue (GET /api/games) fills in
      if (join) { await page.locator('.games-card[open] .games-code').fill(join); await page.locator('.games-card[open]').getByRole('button', {name: 'Join', exact: true}).click(); }
      else await page.locator('.games-card[open]').getByRole('button', {name: 'Create a game', exact: true}).click();
    }
    else if (await page.locator('.goal-card[open]').count()) await page.locator('.goal-card[open]').getByRole('button', {name: 'Got it', exact: true}).click();
    else if (await page.locator('dialog.cutscene[open],.tutorial-card[open]').count()) await page.getByRole('button', {name: 'Skip', exact: true}).click({timeout: 5000}).catch(() => {});
    await page.waitForTimeout(300);
  }
  await page.waitForFunction(joined => window.__island.waves && (!joined || window.__island.island.visiting?.ownerName), !!join, {timeout: 30000});
  // Every wave this page's controller starts: its walls from the server and every wall's hp at tick 0.
  await page.evaluate(() => {
    const g = window.__island; g.settings.hour = 12;
    window.__walls = {starts: [], finished: []};
    g.on('wave_controller_started', event => {
      const w = g.waves?.island.wave;
      if (event.flagship || !w) return;
      window.__walls.starts.push({waveId: event.waveId, wave: event.wave, ticks: w.ticks, walls: w.info.walls ?? null,
        hp: Object.fromEntries(w.state.walls.map(wall => [wall.id, wall.hp])), maxHp: Object.fromEntries(w.state.walls.map(wall => [wall.id, wall.maxHp]))});
    });
    g.on('wave_finish_answered', event => window.__walls.finished.push(event.waveId));
  });
  log(`${name} is in the lobby (${playerId})`);
  return captain;
}
const island = (captain, fn, arg) => captain.page.evaluate(([source, arg]) => (0, eval)(source)(window.__island.island, arg), [String(fn), arg]);
const waveOf = captain => captain.page.evaluate(() => { const w = window.__island.waves?.island.wave;
  return w ? {waveId: w.info.waveId, wave: w.info.wave, done: w.done, pause: !!w.pause, ticks: w.ticks, phase: w.state.phase} : null; });
async function until(captain, test, what, timeout = 240000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const state = await waveOf(captain); if (test(state)) return state; await captain.page.waitForTimeout(250); }
  throw new Error(`${captain.name}: timed out waiting for ${what}: ${JSON.stringify(await waveOf(captain))}`);
}
// The server's view (GET /api/island/walls) for one captain: own island for the host, the game's island for the friend.
const wallsOf = captain => island(captain, async (i, code) => { const answer = await i.api.walls(code ? {code} : {});
  return answer.ok ? answer.data : {error: answer.code}; }, captain.playerId === 'me' ? null : CODE);
const coinsOf = captain => island(captain, i => i.dev.read().coins);
const healthMap = data => Object.fromEntries((data.walls ?? []).map(wall => [wall.spot, wall.health]));
// What a captain's card shows for a wall: the box's label and line, the button, whether Upgrade is offered. The wall
// answer arrives just after the card opens (index.js readWalls), so wait until it shows `mode` (repair or upgrade).
const cardOf = (captain, spot, mode) => captain.page.evaluate(async ([spot, mode]) => {
  const game = window.__island.island;
  game.ui.close(); game.pick(spot);
  const read = () => { const card = document.querySelector('.island-card[open]');
    const repair = card?.querySelector('[data-focus="repair"]'), upgrade = card?.querySelector('[data-focus="upgrade"]');
    return {label: card?.querySelector('.island-next-label')?.textContent ?? '', stats: card?.querySelector('.island-next-stats')?.textContent ?? '',
      button: (repair ?? upgrade)?.textContent ?? '', disabled: (repair ?? upgrade)?.disabled ?? null, repair: !!repair, upgrade: !!upgrade,
      reason: card?.querySelector('.island-reason,.island-card-reason,.island-message')?.textContent ?? '', text: card?.textContent ?? ''}; };
  const end = Date.now() + 6000;
  let seen = read();
  while (Date.now() < end && !(mode === 'repair' ? seen.repair : seen.upgrade && !seen.repair)) { await new Promise(resolve => setTimeout(resolve, 100)); seen = read(); }
  await new Promise(resolve => setTimeout(resolve, 300)); // a late wall answer would still change it
  return read();
}, [spot, mode]);
const closeCard = captain => island(captain, i => { i.ui.close(); });
async function shot(name) {
  for (const captain of pages) { await settle(captain.page); await captain.page.screenshot({path: `${out}/${name}-${captain.playerId}.png`}); }
}
// One scenario: its lines are the evidence; an assertion that fails ends it as FAIL, the run goes on.
async function scenario(id, name, fn, {pending = false} = {}) {
  const lines = [];
  log(`\n[${id}] ${name}`);
  try { await fn(line => { lines.push(line); log(`  ${line}`); }); results.push({id, name, ok: true, pending, lines}); }
  catch (error) { lines.push(`FAILED: ${error.message.split('\n')[0]}`); log(`  FAILED: ${error.message}`); results.push({id, name, ok: false, pending, lines}); }
}
// Ring the bell on the host's page and play the wave to its end on both pages; answers the wave and how long it took.
async function playWave(host, ben) {
  const began = Date.now();
  const rung = await island(host, async i => { const answer = await i.ringBell(); return {ok: answer.ok, code: answer.code ?? null}; });
  assert.ok(rung.ok, `the host rang the bell (${JSON.stringify(rung)})`);
  const first = await until(host, state => state && !state.done && state.ticks >= 0, 'the wave on the host');
  await until(ben, state => state?.waveId === first.waveId, 'the friend in the same wave', 60000);
  return {waveId: first.waveId, wave: first.wave, began};
}
async function waveOver(waveId) {
  for (const captain of pages) {
    await until(captain, state => !state || state.waveId !== waveId || state.done, `the end of ${waveId}`);
    await captain.page.waitForFunction(id => window.__walls.finished.includes(id), waveId, {timeout: 60000, polling: 250}).catch(() => {});
  }
}
const below = data => (data.walls ?? []).filter(wall => wall.health < 100);

let host = null, ben = null, damaged = null, destroyed = null, nextWave = null;
try {
  host = await openCaptain('Nils', 'me');
  assert.equal(await island(host, i => i.island.code), CODE);
  ben = await openCaptain('Ben', 'ben', {join: 'k7q2m'});
  for (const captain of pages) {
    await captain.page.waitForFunction(() => [...document.querySelectorAll('.island-card-lobby[open] .island-lobby-player.is-online')].length === 2, null, {timeout: 30000, polling: 250});
  }
  await host.page.locator('.island-card-lobby[open] .island-lobby-start').click();
  for (const captain of pages) await captain.page.waitForFunction(() => window.__island.island.ui.open !== 'lobby', null, {timeout: 15000, polling: 100});
  // Six shore walls and one cannon (wave 3 then breaks some walls and damages others: sim.js, measured headless).
  await island(host, async i => { i.dev.setCoins(900); i.dev.setWaveBest(2); await i.load();
    for (const id of ['wall_1', 'wall_2', 'wall_3', 'wall_4', 'wall_5', 'wall_6']) await i.build(id, 'wall');
    await i.build('cannon_1', 'cannon'); });
  await island(ben, async i => { i.dev.setCoins(900); await i.load(); });
  await ben.page.waitForFunction(() => window.__island.island.visiting?.spots?.find(spot => spot.id === 'wall_6')?.built, null, {timeout: 10000, polling: 100});

  await scenario('1', 'walls take damage in a wave; both cards show the same health after it', async note => {
    const before = await wallsOf(host);
    assert.deepEqual(healthMap(before), Object.fromEntries(SHORE.map(id => [id, 100])), 'all six walls are whole before the first wave');
    // Up to three waves of wave 3 until one wall is damaged (1-99) and two more are below 100 (damage stays between them).
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (attempt > 1) await island(host, async i => { i.dev.setWaveBest(2); await i.load(); });
      const wave = await playWave(host, ben);
      await waveOver(wave.waveId);
      const after = await wallsOf(host);
      note(`wave ${wave.wave} (${wave.waveId}) took ${Math.round((Date.now() - wave.began) / 1000)} s; the server keeps ${JSON.stringify(healthMap(after))}`);
      if (below(after).some(wall => wall.health > 0) && below(after).length >= 3) break;
    }
    const after = await wallsOf(host), friend = await wallsOf(ben);
    assert.deepEqual(healthMap(friend), healthMap(after), 'the friend\'s answer for the game\'s island is the same');
    damaged = below(after).find(wall => wall.health > 0) ?? null;
    destroyed = below(after).find(wall => wall.health === 0) ?? null;
    assert.ok(damaged, 'one wall is damaged (health 1-99)');
    for (const wall of below(after)) {
      const [mine, theirs] = [await cardOf(host, wall.spot, 'repair'), await cardOf(ben, wall.spot, 'repair')];
      await closeCard(host); await closeCard(ben);
      assert.equal(theirs.label, mine.label, `${wall.spot}: the same health on both cards`);
      assert.equal(theirs.button, mine.button, `${wall.spot}: the same price on both cards`);
      const expected = wall.health === 0 ? 'Destroyed' : `Damaged · health ${wall.health}%`;
      assert.equal(mine.label, expected, `${wall.spot}: the card says ${expected}`);
      note(`${wall.spot}: host card "${mine.label}" / "${mine.button}", friend card "${theirs.label}" / "${theirs.button}"`);
    }
    await shot('01-after-wave');
  });

  await scenario('2', 'the card offers Repair (damaged) / Rebuild (destroyed), never Upgrade; upgrade refused needs_repair', async note => {
    assert.ok(damaged, 'a damaged wall from scenario 1');
    const data = await wallsOf(host);
    for (const wall of below(data)) {
      for (const captain of [host, ben]) {
        const card = await cardOf(captain, wall.spot, 'repair'); await closeCard(captain);
        const word = wall.health === 0 ? 'Rebuild' : 'Repair';
        assert.ok(card.repair && !card.upgrade, `${captain.name}'s card of ${wall.spot} offers ${word} and no Upgrade: ${JSON.stringify(card)}`);
        assert.equal(card.button, `${word} · 🪙 ${wall.repairCost}`, `${captain.name}'s ${wall.spot} button`);
      }
      note(`${wall.spot} (health ${wall.health}): both cards "${wall.health === 0 ? 'Rebuild' : 'Repair'} · 🪙 ${wall.repairCost}", no Upgrade button`);
    }
    if (!destroyed) note('note: no wall was destroyed in these waves, so Rebuild was not seen');
    for (const [captain, code] of [[host, null], [ben, CODE]]) {
      const coins = await coinsOf(captain);
      const answer = await island(captain, async (i, [spot, code]) => { const a = await i.api.upgrade(code ? {spot, code} : {spot});
        return {ok: a.ok, status: a.status, code: a.code ?? null}; }, [damaged.spot, code]);
      assert.deepEqual(answer, {ok: false, status: 409, code: 'needs_repair'}, `${captain.name}'s upgrade of ${damaged.spot}`);
      assert.equal(await coinsOf(captain), coins, `${captain.name}'s refused upgrade cost nothing`);
      note(`${captain.name}: upgrade of ${damaged.spot} → ${answer.status} ${answer.code}, coins ${coins} → ${coins}`);
    }
    const level = (await wallsOf(host)).walls.find(wall => wall.spot === damaged.spot).level;
    assert.equal(level, damaged.level, 'the refused upgrades left the level');
  });

  await scenario('3', 'the host repairs a wall and pays once (double click and retry); the friend sees it whole', async note => {
    assert.ok(damaged, 'a damaged wall from scenario 1');
    const price = (await wallsOf(host)).walls.find(wall => wall.spot === damaged.spot).repairCost;
    const before = await coinsOf(host);
    // Two clicks on the card's button in one go, and the client's retry of the same Repair (same click id) at once.
    const clicks = await host.page.evaluate(async spot => {
      const game = window.__island.island; game.ui.close(); game.pick(spot);
      const end = Date.now() + 6000;
      let button = null;
      while (Date.now() < end && !(button = document.querySelector('.island-card[open] [data-focus="repair"]:not([disabled])'))) await new Promise(resolve => setTimeout(resolve, 100));
      if (!button) return {clicked: false};
      button.click(); button.click();
      const retry = await game.api.repairWall({spot});
      return {clicked: true, retry: {ok: retry.ok, code: retry.code ?? null, health: retry.data?.walls?.find(wall => wall.spot === spot)?.health ?? null}};
    }, damaged.spot);
    assert.ok(clicks.clicked, 'the Repair button was there and enabled');
    await host.page.waitForFunction(() => /^Wall repaired/.test(window.__island.island.ui.toastText), null, {timeout: 10000, polling: 100});
    await host.page.waitForTimeout(800);
    const after = await coinsOf(host);
    note(`host coins ${before} → ${after} (Repair price 🪙 ${price}); the retry with the same click id answered ${JSON.stringify(clicks.retry)}`);
    assert.equal(before - after, price, 'the double click and the retry paid exactly once');
    const again = await island(host, async (i, spot) => { const a = await i.api.repairWall({spot}); return {ok: a.ok, code: a.code ?? null}; }, damaged.spot);
    assert.deepEqual(again, {ok: false, code: 'intact'}, 'a later click is refused intact');
    assert.equal(await coinsOf(host), after, 'the refused click cost nothing');
    note(`a later click → ${again.code}, coins stay ${after}`);
    await closeCard(host);
    const theirs = await wallsOf(ben);
    assert.equal(healthMap(theirs)[damaged.spot], 100, 'the friend\'s answer shows the wall whole');
    const card = await cardOf(ben, damaged.spot, 'upgrade'); await closeCard(ben);
    assert.ok(card.upgrade && !card.repair, `the friend's card of ${damaged.spot} offers Upgrade again: ${JSON.stringify(card)}`);
    note(`friend: ${damaged.spot} health 100, card "${card.label}" / "${card.button}"`);
    await shot('03-repaired');
  });

  await scenario('4', 'a Repair is refused while a wave runs', async note => {
    const data = await wallsOf(host);
    const wall = below(data)[0];
    assert.ok(wall, 'a wall below 100 is left for the next wave');
    await island(host, async i => { i.dev.setWaveBest(2); await i.load(); }); // wave 3 again (a lost wave goes 2 back)
    const before = await coinsOf(host);
    nextWave = await playWave(host, ben);
    const answer = await island(host, async (i, spot) => { const a = await i.api.repairWall({spot}); return {ok: a.ok, status: a.status, code: a.code ?? null}; }, wall.spot);
    assert.deepEqual(answer, {ok: false, status: 409, code: 'wave_running'}, 'the Repair during the wave');
    assert.equal(await coinsOf(host), before, 'the refused Repair cost nothing');
    const card = await cardOf(host, wall.spot, 'repair'); await closeCard(host);
    assert.equal(card.disabled, true, 'the card\'s button waits for the break');
    assert.match(card.text, /between waves/, 'the card says to repair it between waves');
    note(`wave ${nextWave.wave} (${nextWave.waveId}): Repair of ${wall.spot} → ${answer.status} ${answer.code}, coins ${before} → ${before}; card button disabled ("${card.button}")`);
  });

  // P runs inside the wave of scenario 4: the friend's page sends the first finish with one wall higher than it started.
  let tampered = null;
  await scenario('P', 'pending integration fix: a client reporting higher wall health than the wave started with does not heal the walls', async note => {
    assert.ok(nextWave, 'the wave of scenario 4 runs');
    const start = await ben.page.evaluate(id => window.__walls.starts.find(item => item.waveId === id)?.walls ?? null, nextWave.waveId);
    assert.ok(start, 'the friend\'s wave came with walls');
    const target = Object.keys(start).sort().find(id => start[id] < 100);
    assert.ok(target, 'a wall started this wave below 100');
    const sent = {...start, [target]: 100};
    // As early as the server takes a finish (10 s after startsAt), before any honest finish.
    let answer = null;
    const end = Date.now() + 60000;
    while (Date.now() < end) {
      answer = await island(ben, async (i, [waveId, walls]) => { const a = await i.api.finishWave({waveId, survived: false, shipsSunk: 0, walls});
        return {ok: a.ok, code: a.code ?? null}; }, [nextWave.waveId, sent]);
      if (answer.ok || answer.code !== 'wave_too_early') break;
      await ben.page.waitForTimeout(400);
    }
    const honestFirst = await host.page.evaluate(id => window.__walls.finished.includes(id), nextWave.waveId);
    note(`the friend sent the first finish ${JSON.stringify(answer)} with ${target}: ${start[target]} → 100 (host had finished first: ${honestFirst})`);
    assert.ok(answer.ok && !honestFirst, 'the tampered finish was the first one');
    await waveOver(nextWave.waveId);
    const kept = healthMap(await wallsOf(host));
    tampered = {target, start: start[target], kept: kept[target]};
    note(`server keeps ${target} at ${kept[target]} (the wave started it at ${start[target]})`);
    assert.ok(kept[target] <= start[target], `${target} was not healed by the report (kept ${kept[target]}, started ${start[target]})`);
  }, {pending: true});

  await scenario('5', 'both sims start the next wave with identical wall hp at tick 0', async note => {
    assert.ok(nextWave, 'the wave of scenario 4 ran');
    const [mine, theirs] = await Promise.all([host, ben].map(captain => captain.page.evaluate(id => window.__walls.starts.find(item => item.waveId === id) ?? null, nextWave.waveId)));
    assert.ok(mine && theirs, 'both controllers started the wave');
    assert.equal(mine.ticks, 0); assert.equal(theirs.ticks, 0);
    assert.deepEqual(theirs.walls, mine.walls, 'the same walls from the server on both pages');
    assert.deepEqual(theirs.hp, mine.hp, 'the same hp for every wall at tick 0');
    for (const [id, hp] of Object.entries(mine.hp)) {
      const health = mine.walls?.[id] ?? 100, expected = Math.round(mine.maxHp[id] * health / 100 * 100) / 100;
      assert.equal(hp, expected, `${id} starts at maxHp × ${health}% (${expected})`);
    }
    note(`wave ${nextWave.wave}: server walls ${JSON.stringify(mine.walls)}`);
    note(`tick 0 hp host ${JSON.stringify(mine.hp)} / friend ${JSON.stringify(theirs.hp)}`);
  });

  await scenario('6', 'timed recovery: past 10 minutes on the server clock a damaged wall counts as whole', async note => {
    for (const captain of pages) await until(captain, state => !state || state.done, 'the end of the last wave');
    const data = await wallsOf(host);
    const wall = below(data).find(item => item.spot !== tampered?.target) ?? below(data)[0];
    assert.ok(wall, `a wall below 100 (${JSON.stringify(healthMap(data))})`);
    note(`${wall.spot}: health ${wall.health}, mends at ${wall.recoversAt}`);
    await island(host, async (i, ms) => { await i.dev.advanceClock(ms); }, 10 * 60 * 1000 + 5000);
    const later = await wallsOf(host), friend = await wallsOf(ben);
    const now = later.walls.find(item => item.spot === wall.spot);
    assert.deepEqual({health: now.health, recoversAt: now.recoversAt, repairCost: now.repairCost}, {health: 100, recoversAt: null, repairCost: null}, 'whole after the timer');
    assert.equal(healthMap(friend)[wall.spot], 100, 'whole for the friend too');
    for (const captain of [host, ben]) {
      const card = await cardOf(captain, wall.spot, 'upgrade'); await closeCard(captain);
      assert.ok(card.upgrade && !card.repair, `${captain.name}'s card offers Upgrade: ${JSON.stringify(card)}`);
      note(`${captain.name}'s card of ${wall.spot}: "${card.label}" / "${card.button}"`);
    }
    const coins = await coinsOf(host);
    const upgraded = await island(host, async (i, spot) => { const a = await i.api.upgrade({spot}); return {ok: a.ok, code: a.code ?? null,
      level: a.data?.spots?.find(item => item.id === spot)?.level ?? null}; }, wall.spot);
    assert.ok(upgraded.ok, `the upgrade of the mended wall is allowed (${JSON.stringify(upgraded)})`);
    assert.equal(upgraded.level, wall.level + 1);
    note(`upgrade of ${wall.spot} → level ${upgraded.level}, coins ${coins} → ${await coinsOf(host)}`);
    const snapshot = await island(host, async () => window.__island.island.dev.startWaveAt('ISLE-K7Q2M'));
    assert.ok(snapshot?.walls, 'the next wave answer carries walls');
    assert.equal(snapshot.walls[wall.spot], 100, 'the next wave starts the mended wall whole');
    note(`the next wave's snapshot: ${JSON.stringify(snapshot.walls)}`);
  });

  const audio = env.errors.filter(text => /AudioContext|audio device/i.test(text));
  const errors = env.errors.filter(text => !/Failed to load resource/.test(text) && !audio.includes(text));
  results.push({id: 'E', name: 'no browser errors', ok: errors.length === 0, pending: false, lines: errors.slice(0, 5)});
} catch (error) {
  log('\nSTOPPED:', error.message);
  for (const captain of pages) await captain.page.screenshot({path: `${out}/failure-${captain.playerId}.png`}).catch(() => {});
  log('errors:', env.errors);
  results.push({id: 'X', name: 'set-up', ok: false, pending: false, lines: [error.message.split('\n')[0]]});
} finally { await env.close(); }

log('\nRESULTS');
for (const item of results.filter(entry => !entry.pending)) {
  log(`  ${item.ok ? 'PASS' : 'FAIL'}  [${item.id}] ${item.name}`); for (const line of item.lines) log(`          ${line}`);
}
log('PENDING INTEGRATION FIX (an expected failure does not fail the run)');
for (const item of results.filter(entry => entry.pending)) {
  log(`  ${item.ok ? 'PASS' : 'FAIL (expected until the fix lands)'}  [${item.id}] ${item.name}`); for (const line of item.lines) log(`          ${line}`);
}
const failed = results.filter(entry => !entry.pending && !entry.ok);
log(`\ncheck-wall-recovery-mp: ${failed.length ? `FAILED (${failed.map(item => item.id).join(', ')})` : 'OK'}, screenshots in ${out}`);
process.exitCode = failed.length ? 1 : 0;
