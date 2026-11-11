// Players on one island (GAME-V3.md §2, TOWER-DEFENSE.md §6) without live accounts: headless Chrome,
// one browser context, the fake server shared by every tab (?islands=fake&fakeworld=…, fake-api.js) and
// the BroadcastChannel room with the live room's rules (pirates/room.js). Two pages first, then four:
//   the host presses Play › Create a game and the lobby opens; a friend presses Play › Join a game with
//   the code; both lobbies list both players online; the host presses Start and both lobbies close (the
//   narrator's game_started fires on both pages); the owner builds a cannon; the friend builds a wall
//   co-op and the owner's island shows it; the owner rings the bell; both run the same wave (the same ships
//   at the same tick); both captains fire their musket and each shot reaches the other page; both finish
//   with loot; the host pauses the break and the friend's break says "Paused by Nils"; after Resume both
//   press "Next wave" at the same moment and end up in one wave 2; two more friends open the ?game= link
//   mid-wave, their lobby closes by itself (the game is on) and they join the wave. Ten players in one
//   room are covered by the unit tests (tests/island/games.test.js, tests/pirates/ten-players.test.js).
//   node scripts/check-multiplayer.js [folder]        (npm run test:mp)
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {openWorldBrowser, settle} from './world-browser-tools.js';
import {stubOfflineApi} from './api-browser-fixture.js';
import {stubWeather} from './weather-browser-fixture.js';

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const out = process.argv[2] ?? `/Users/nilslenke/Developer/fri6-integration/td-shots/mp/check-${stamp}`;
await mkdir(out, {recursive: true});
const WORLD = `mp${Date.now().toString(36)}`;
const env = await openWorldBrowser(), context = env.page.context();
const pages = [];
const log = (...args) => console.log(...args);

// The front door's cards until the player stands on the island: Skip the lore and the pages, Got it on the
// goal card, and on the games card Create a game (host) or Join a game with the code (join).
async function openCaptain(name, playerId, visit = null, {create = false, join = null} = {}) {
  const page = pages.length ? await context.newPage() : env.page, first = !pages.length;
  if (!first) {
    await stubOfflineApi(page); await stubWeather(page);
    page.on('pageerror', error => env.errors.push(`${name}: ${error.message}`));
    page.on('console', message => { if (message.type() === 'error') env.errors.push(`${name}: ${message.text()}`); });
  }
  await page.setViewportSize({width: 960, height: 600});
  const query = `?islands=fake&fakeworld=${WORLD}&fakeplayer=${playerId}&fakename=${encodeURIComponent(name)}${visit ? `&visit=${visit}` : ''}`;
  await page.goto(`${env.url}/${query}`);
  if (first) { await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }); await page.reload(); }
  const captain = {name, page, playerId};
  pages.push(captain);
  if (visit) {
    // The friend's landing (shell/invite.js) opens after the first paint; Join sails to the island.
    const join = page.locator('button.invite-join');
    await join.waitFor({timeout: 30000}); await page.waitForTimeout(500);
    for (let i = 0; i < 5 && await join.isVisible().catch(() => false); i++) { await join.click().catch(() => {}); await page.waitForTimeout(1500); }
  }
  else await page.locator('#play').click();
  for (let i = 0; i < 12; i++) {
    await page.waitForFunction(() => document.querySelector('dialog.cutscene[open],.tutorial-card[open],.goal-card[open],.games-card[open],.island-card-lobby[open]')
      || (window.__island?.world.current?.id === 'home_islet' && window.__island.island?.island && !document.querySelector('dialog[open]')), null, {timeout: 60000, polling: 100});
    if (await page.locator('.games-card[open]').count()) {
      await page.locator('.games-card[open] .games-create-button').waitFor();
      await page.waitForTimeout(400); // Continue (GET /api/games) fills in
      captainShots.push(page.screenshot({path: `${out}/00-games-card-${playerId}.png`}));
      if (join) { await page.locator('.games-card[open] .games-code').fill(join); await page.locator('.games-card[open]').getByRole('button', {name: 'Join', exact: true}).click(); }
      else await page.locator('.games-card[open]').getByRole('button', {name: 'Create a game', exact: true}).click();
    }
    else if (await page.locator('.goal-card[open]').count()) await page.locator('.goal-card[open]').getByRole('button', {name: 'Got it', exact: true}).click();
    else if (await page.locator('dialog.cutscene[open],.tutorial-card[open]').count()) await page.getByRole('button', {name: 'Skip', exact: true}).click();
    else break;
    await page.waitForTimeout(300);
  }
  await page.waitForFunction(() => window.__island.waves && (!new URLSearchParams(location.search).get('visit') || window.__island.island.visiting?.ownerName), null, {timeout: 30000});
  // What every page heard: the sim's musket shots, the loot answers, and a ship list per frame.
  await page.evaluate(() => {
    const g = window.__island; g.settings.hour = 12;
    window.__mp = {shots: [], loot: [], samples: [], heard: [], started: []};
    g.on('game_started', event => window.__mp.started.push(event));
    // What crossed the island room from the other tabs (the raw BroadcastChannel of pirates/room.js).
    const channel = new BroadcastChannel('tgpt:live:place:isle_k7q2m:1');
    channel.onmessage = event => window.__mp.heard.push(event.data?.type);
    g.on('captain_fired', event => window.__mp.shots.push({by: event.by, targetId: event.targetId}));
    g.on('wave_finish_answered', event => window.__mp.loot.push({waveId: event.waveId, loot: event.loot}));
    const sample = () => {
      const wave = g.waves?.island.wave;
      if (wave && !wave.done && wave.ticks > 0) {
        const last = window.__mp.samples.at(-1);
        if (!last || last.ticks !== wave.ticks) window.__mp.samples.push({waveId: wave.info.waveId, ticks: wave.ticks,
          ships: wave.state.ships.map(ship => ship.id).sort().join(','), hp: Math.round(wave.state.ships.reduce((sum, ship) => sum + ship.hp, 0))});
        if (window.__mp.samples.length > 6000) window.__mp.samples.splice(0, 3000);
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  log(`${name} is on the island (${playerId})`);
  return captain;
}
const island = (captain, fn, arg) => captain.page.evaluate(([source, arg]) => (0, eval)(source)(window.__island.island, arg), [String(fn), arg]);
const waveOf = captain => captain.page.evaluate(() => { const w = window.__island.waves?.island.wave;
  return w ? {waveId: w.info.waveId, wave: w.info.wave, ships: w.state.ships.length, done: w.done, pause: !!w.pause, ticks: w.ticks, phase: w.state.phase} : null; });
async function until(captain, test, what, timeout = 120000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const state = await waveOf(captain); if (test(state)) return state; await captain.page.waitForTimeout(250); }
  throw new Error(`${captain.name}: timed out waiting for ${what}: ${JSON.stringify(await waveOf(captain))}`);
}
const shot = async name => {
  for (const captain of pages) { await settle(captain.page); await captain.page.screenshot({path: `${out}/${name}-${captain.playerId}.png`}); }
  log(`screenshots ${name}`);
};
const spotBuilt = (captain, spot) => captain.page.evaluate(spot => {
  const i = window.__island.island, target = i.visiting?.spots ? i.visiting : i.island;
  return !!target?.spots?.find(item => item.id === spot)?.built;
}, spot);
// Fire the musket: stand on the beach in front of the nearest ship, wait until it is in range, press F.
async function musket(captain) {
  const {page} = captain;
  await page.waitForFunction(() => window.__island.waves.island.wave?.state?.ships?.length > 0, null, {timeout: 60000, polling: 200});
  for (let attempt = 0; attempt < 40; attempt++) {
    const fired = await page.evaluate(() => {
      const g = window.__island, wave = g.waves.island.wave, ships = wave?.state?.ships ?? [];
      if (!ships.length) return false;
      const ship = ships.reduce((a, b) => (Math.hypot(a.x, a.z) < Math.hypot(b.x, b.z) ? a : b)), d = Math.hypot(ship.x, ship.z);
      const x = ship.x * 14 / d, z = ship.z * 14 / d; g.player.position.set(x, g.world.current.groundHeight?.(x, z) ?? 1.03, z);
      return g.waves.island.shoot();
    });
    if (fired) return true;
    await page.waitForTimeout(500);
  }
  return false;
}
// The same wave on two pages: for every sample of `a`, the sample of `b` at the same tick (±1) has the same ships.
async function compare(a, b, waveId) {
  const [left, right] = await Promise.all([a, b].map(captain => captain.page.evaluate(id => window.__mp.samples.filter(item => item.waveId === id), waveId)));
  const byTick = new Map(right.map(item => [item.ticks, item]));
  let checked = 0, same = 0, worst = 0;
  for (const sample of left.filter((_, index) => index % 10 === 0)) {
    const other = byTick.get(sample.ticks) ?? byTick.get(sample.ticks - 1) ?? byTick.get(sample.ticks + 1);
    if (!other) continue;
    checked++;
    if (other.ships === sample.ships) same++;
    worst = Math.max(worst, Math.abs(other.ships.split(',').filter(Boolean).length - sample.ships.split(',').filter(Boolean).length));
  }
  return {checked, same, worst};
}

const results = [];
const captainShots = [];
const lobbyOf = captain => captain.page.evaluate(() => ({open: window.__island.island.ui.open === 'lobby',
  rows: [...document.querySelectorAll('.island-card-lobby[open] .island-lobby-player')].map(row => `${row.querySelector('.island-lobby-name').textContent}:${row.classList.contains('is-online') ? 'online' : 'away'}`),
  start: document.querySelector('.island-card-lobby[open] .island-lobby-start')?.disabled ?? null}));
try {
  // 1 The host creates a game (Play › Create a game): the lobby opens over the island.
  const host = await openCaptain('Nils', 'me', null, {create: true});
  assert.equal(await island(host, i => i.island.code), 'ISLE-K7Q2M');
  await host.page.waitForFunction(() => window.__island.island.ui.open === 'lobby' && document.querySelector('.island-lobby-player'), null, {timeout: 15000});
  // 2 A friend joins with the code (Play › Join a game).
  const ben = await openCaptain('Ben', 'ben', null, {join: 'k7q2m'});
  assert.equal(await island(ben, i => i.visiting.ownerName), 'Nils');
  await ben.page.waitForFunction(() => window.__island.island.ui.open === 'lobby', null, {timeout: 15000});
  // Both lobbies list both players online (the room's hello), and only the host may Start.
  for (const captain of pages) {
    await captain.page.waitForFunction(() => [...document.querySelectorAll('.island-card-lobby[open] .island-lobby-player.is-online')].length === 2, null, {timeout: 30000, polling: 250});
  }
  const lobbies = {host: await lobbyOf(host), ben: await lobbyOf(ben)};
  results.push(`lobbies: host ${lobbies.host.rows.join(', ')} (Start ${lobbies.host.start ? 'off' : 'on'}); friend ${lobbies.ben.rows.join(', ')} (Start ${lobbies.ben.start ? 'off' : 'on'})`);
  assert.deepEqual(lobbies.host.rows, ['Nils (you):online', 'Ben:online']);
  assert.equal(lobbies.host.start, false, 'the host may start');
  assert.equal(lobbies.ben.start, true, 'a friend waits for the host');
  await shot('01-lobby-two-captains');
  // 3 Start: every lobby closes and game_started fires on every page.
  await host.page.locator('.island-card-lobby[open] .island-lobby-start').click();
  for (const captain of pages) {
    await captain.page.waitForFunction(() => window.__island.island.ui.open !== 'lobby' && window.__mp.started.length === 1, null, {timeout: 15000, polling: 100});
  }
  results.push(`Start: both lobbies closed, game_started ${JSON.stringify(await host.page.evaluate(() => window.__mp.started[0].first))} (first) on both pages`);
  await island(host, async i => i.build('cannon_1', 'cannon'));
  assert.ok(await spotBuilt(host, 'cannon_1'), 'the owner built a cannon');
  await ben.page.waitForFunction(() => window.__island.island.visiting?.spots?.find(spot => spot.id === 'cannon_1')?.built, null, {timeout: 5000, polling: 100});
  // Both captains are in the island's room (live:place:isle_k7q2m:1).
  for (const captain of pages) await captain.page.waitForFunction(() => window.__island.island.roomPlace() === 'isle_k7q2m', null, {timeout: 5000});
  await shot('01-two-captains');
  // 2 Co-op: the friend builds a wall on the owner's island; the owner's island shows it within seconds.
  await island(ben, async i => i.build('wall_2', 'wall'));
  const builtAt = Date.now();
  await host.page.waitForFunction(() => window.__island.island.island.spots.find(spot => spot.id === 'wall_2')?.built, null, {timeout: 5000, polling: 100});
  results.push(`co-op wall on the owner's island after ${Date.now() - builtAt} ms`);
  await shot('02-coop-wall');
  // 3 Wave 3 (more ships, so both muskets find a target) with two more cannons; the owner rings.
  await island(host, async i => { i.dev.setWaveBest(2); i.dev.setCoins(400); await i.load(); await i.build('cannon_2', 'cannon'); await i.build('cannon_3', 'cannon'); });
  await ben.page.waitForFunction(() => window.__island.island.visiting?.spots?.find(spot => spot.id === 'cannon_3')?.built, null, {timeout: 5000, polling: 100});
  await island(host, async i => i.ringBell());
  const first = await until(host, state => state?.ships > 0, 'the first ships', 60000);
  const benWave = await until(ben, state => state?.waveId === first.waveId && state.ships > 0, 'the friend in the same wave', 30000);
  results.push(`wave ${first.wave} (${first.waveId}) on both pages: ${first.ships} / ${benWave.ships} ships`);
  // 4 Both captains fire; each shot reaches the other page.
  const hostShot = await musket(host), benShot = await musket(ben);
  assert.ok(hostShot && benShot, 'both captains could fire');
  await host.page.waitForTimeout(1500);
  const shotsOn = captain => captain.page.evaluate(() => window.__mp.shots.map(item => item.by));
  const hostId = await host.page.evaluate(() => window.__island.waves.island.wave?.info && window.__mp.shots[0]?.by);
  const [hostHeard, benHeard] = [await shotsOn(host), await shotsOn(ben)];
  const roomShots = captain => captain.page.evaluate(() => window.__mp.heard.filter(type => type === 'captain_shot').length);
  const [toHost, toBen] = [await roomShots(host), await roomShots(ben)];
  results.push(`musket shots through the room: ${toHost} reached the owner, ${toBen} reached the friend`);
  assert.ok(toHost >= 1 && toBen >= 1, 'each captain\'s musket shot reached the other page');
  // In the sim a shot lands only if its ship still floats 0.2 s later (a cannon may sink it first).
  if (!hostHeard.length && !benHeard.length) results.push('note: both musket targets sank before the shots landed');
  results.push(`musket shots: owner's sim ${hostHeard.length} from ${new Set(hostHeard).size} captains, friend's sim ${benHeard.length} from ${new Set(benHeard).size} (first by ${hostId})`);
  await shot('03-wave1-muskets');
  // 5 Everybody finishes with loot, then both press "Next wave" at the same moment.
  // The break lasts 15 s: press Next wave on both pages first, look at the loot after.
  for (const captain of pages) await until(captain, state => state?.pause, 'the break', 240000);
  // The host pauses the break for the whole room; the friend's break says who paused and waits.
  await host.page.locator('.pirate-break:not([hidden]) .pirate-hold').click();
  await ben.page.waitForFunction(() => document.querySelector('.pirate-break:not([hidden]) .pirate-break-line')?.textContent === 'Paused by Nils', null, {timeout: 10000, polling: 100});
  await ben.page.waitForTimeout(9000); // longer than the 8-second break
  assert.ok(await ben.page.evaluate(() => window.__island.waves.island.inBreak), 'the paused break stays open');
  await shot('04-paused-break');
  results.push('Pause: the friend\'s break said "Paused by Nils" and stayed open past its 8 seconds');
  await host.page.locator('.pirate-break:not([hidden]) .pirate-hold').click();
  await ben.page.waitForFunction(() => !document.querySelector('.pirate-break.is-paused'), null, {timeout: 10000, polling: 100});
  await Promise.all([host, ben].map(captain => captain.page.waitForFunction(() => window.__island.waves.island.wave?.pause?.ready === true, null, {timeout: 14000})));
  await Promise.all([host, ben].map(captain => captain.page.evaluate(() => window.__island.waves.island.next())));
  for (const captain of pages) await captain.page.waitForFunction(id => window.__mp.loot.some(item => item.waveId === id && item.loot > 0), first.waveId, {timeout: 30000});
  const loot = await Promise.all(pages.map(captain => captain.page.evaluate(id => window.__mp.loot.find(item => item.waveId === id).loot, first.waveId)));
  results.push(`wave 1 loot: ${pages.map((captain, index) => `${captain.name} ${loot[index]}`).join(', ')}`);
  const sync1 = await compare(host, ben, first.waveId);
  results.push(`wave 1 sync owner/friend: ${sync1.same}/${sync1.checked} samples with the same ships at the same tick, worst count gap ${sync1.worst}`);
  assert.ok(sync1.checked >= 5 && sync1.same / sync1.checked >= .9 && sync1.worst <= 1, 'the two pages ran the same wave');
  const second = await until(host, state => state && state.waveId !== first.waveId && !state.pause, 'wave 2 on the owner\'s page', 30000);
  await until(ben, state => state?.waveId === second.waveId, 'the friend in the owner\'s wave 2 (both pressed Next wave)', 30000);
  results.push(`both pressed Next wave: one wave ${second.wave} (${second.waveId}) on both pages`);
  // 6 Two more friends open the game link (?game=ISLE-K7Q2M) mid-wave and join it.
  await until(host, state => state?.ticks > 20, 'wave 2 under way', 60000);
  // Both load at once (a page takes a while to load; the wave must still run when they land).
  const [ana, max] = await Promise.all([openCaptain('Ana', 'ana', 'ISLE-K7Q2M'), openCaptain('Max', 'max', 'ISLE-K7Q2M')]);
  for (const captain of [ana, max]) {
    const joined = await until(captain, state => state?.waveId === second.waveId, `${captain.name} joining the running wave mid-wave`, 30000);
    results.push(`${captain.name} joined wave ${second.wave} mid-wave at tick ${joined.ticks}`);
    // The game is on already: the room tells the late friend, and their lobby closes by itself.
    // (game_started may fire before this page's listener above, so the room state says it.)
    await captain.page.waitForFunction(() => window.__island.island.ui.open !== 'lobby' && window.__island.island.game?.started === true, null, {timeout: 20000, polling: 200});
  }
  results.push('late friends: their lobbies closed by themselves (the room said the game is on)');
  const members = await host.page.evaluate(async () => (await window.__island.island.api.lobby('ISLE-K7Q2M')).data.members.map(member => member.name));
  results.push(`members: ${members.join(', ')}`);
  assert.deepEqual([...members].sort(), ['Ana', 'Ben', 'Max', 'Nils'], 'all four are members of the game');
  await host.page.waitForTimeout(3000);
  await shot('05-four-captains-mid-wave');
  for (const captain of [ben, ana, max]) {
    const sync = await compare(host, captain, second.waveId);
    results.push(`wave 2 sync owner/${captain.name}: ${sync.same}/${sync.checked} same, worst count gap ${sync.worst}`);
    assert.ok(sync.checked >= 3 && sync.worst <= 1, `${captain.name} runs the owner's wave 2`);
  }
  for (const captain of pages) await until(captain, state => !state || state.pause || state.done, 'the end of wave 2', 240000);
  await shot('06-wave2-end');
  await Promise.all(captainShots);
  const audio = env.errors.filter(text => /AudioContext|audio device/i.test(text));
  const errors = env.errors.filter(text => !/Failed to load resource/.test(text) && !audio.includes(text));
  assert.deepEqual(errors, [], 'no browser errors');
  log('\nRESULTS'); for (const line of results) log(`  ${line}`);
  log(`\ncheck-multiplayer: OK (${pages.length} pages), screenshots in ${out}`);
} catch (error) {
  log('\nRESULTS SO FAR'); for (const line of results) log(`  ${line}`);
  for (const captain of pages) {
    await captain.page.screenshot({path: `${out}/failure-${captain.playerId}.png`}).catch(() => {});
    log(captain.name, JSON.stringify(await waveOf(captain).catch(() => null)), JSON.stringify(await captain.page.evaluate(() => ({place: window.__island?.world.current?.id,
      own: !!window.__island?.island?.island, visiting: window.__island?.island?.visiting, dialogs: [...document.querySelectorAll('dialog[open]')].map(d => d.className)})).catch(error => error.message)));
  }
  log('errors:', env.errors);
  throw error;
} finally { await env.close(); }
