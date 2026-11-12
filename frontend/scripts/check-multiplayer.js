// Players on one island (GAME-V3.md §2, TOWER-DEFENSE.md §6) without live accounts: headless Chrome,
// one browser context, the fake server shared by every tab (?islands=fake&fakeworld=…, fake-api.js) and
// the BroadcastChannel room with the live room's rules (pirates/room.js). Two pages first, then four:
//   the host presses Play › Create a game and the lobby opens; a friend presses Play › Join a game with
//   the code; both lobbies list both players online; the host presses Start and both lobbies close (the
//   narrator's game_started fires on both pages, once); the owner builds a cannon; the friend builds a wall
//   co-op and the owner's island shows it. Upgrades (11 Nov: "sometimes some upgrades were not visible"):
//   the owner upgrades a wall and the friend's map and card show the level within 2 s, then the friend
//   upgrades it on the owner's island and the owner's map and open card follow. Tower skills (GAME-V3.md §5):
//   after wave 8 the owner researches cannon skills at the Tech hub and picks Heavy shot for a cannon; the
//   friend's island answer and card show the same skill within 2 s, then the friend picks Rapid on the owner's
//   island and the owner's follows (the wave's sim reads the skill from the island). Tear down (GAME-V3.md §4.2): the
//   owner tears down the wall both paid for; his confirmation shows both refunds, the friend sees the empty spot, his
//   toast and his coins. Wave 3 with a second cannon
//   and the inner wall ring: the owner rings the bell; both run the same wave (the same ships at the same
//   tick, and the same boarders ashore: TOWER-DEFENSE.md §12); both captains fire their musket and each
//   shot reaches the other page; an upgrade in the wave's break shows on both; the host pauses the break
//   and the friend's break says "Paused by Nils"; after Resume both press "Next wave" at the same moment,
//   finish with loot and end up in one wave 2; two more friends open the ?game= link mid-wave, their lobby
//   closes by itself (the game is on) and they join the wave. Captain health (GAME-V3.md §3): in the first
//   wave the friend stands on the boarders until he falls, the owner walks up and holds E for 2 s (a short
//   hold first, let go: nothing is paid), pays 20 + 5 × wave and helps him up; both pages see the same
//   fall and the same revive at the same tick; the owner has picked the Medic role (captain tree): the friend's lobby shows
//   the 🩹 icon on Nils, the hold needs only 1.2 s and the friend stands up with 75% hp on both pages (screenshots at 1280 × 800 and 390 × 844). Ten players in one room are covered by the
//   unit tests (tests/island/games.test.js, tests/pirates/ten-players.test.js). v3 waves: wave 3's event (fog bank or
//   storm) is the same on both pages; the wave-5 boss finisher on four pages: every page hears every captain's
//   samples and decides the same scores and outcome.
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
  // A visit link or a joined code: wait until the host's island has answered (the join's visit read).
  await page.waitForFunction(joined => window.__island.waves && (!(joined || new URLSearchParams(location.search).get('visit')) || window.__island.island.visiting?.ownerName), !!join, {timeout: 30000});
  // What every page heard: the sim's musket shots, the loot answers, and a ship list per frame.
  await page.evaluate(() => {
    const g = window.__island; g.settings.hour = 12;
    window.__mp = {shots: [], loot: [], samples: [], heard: [], started: [], fell: [], revived: [], events: [], finishers: []};
    // v3 waves: the event each wave brought, and every finisher's outcome as this page's sim decided it.
    g.on('wave_event', event => window.__mp.events.push({wave: event.wave, event: event.event}));
    g.on('finisher_won', event => window.__mp.finishers.push({type: event.type, kind: event.kind, scores: event.scores, goals: event.goals}));
    g.on('finisher_failed', event => window.__mp.finishers.push({type: event.type, kind: event.kind, scores: event.scores, goals: event.goals, hp: event.hp}));
    g.on('captain_fell', event => window.__mp.fell.push({captainId: event.captainId, t: event.t}));
    g.on('captain_revived', event => window.__mp.revived.push({captainId: event.captainId, by: event.by, t: event.t, hp: event.hp}));
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
          ships: wave.state.ships.map(ship => ship.id).sort().join(','), hp: Math.round(wave.state.ships.reduce((sum, ship) => sum + ship.hp, 0)),
          boarders: (wave.state.boarders ?? []).map(item => item.id).sort().join(','), landed: wave.state.boardersLanded ?? 0,
          // A Barracks' militia (GAME-V3.md "Houses"): where each stands, its hp and what it does.
          militia: (wave.state.militia ?? []).map(item => `${item.id}@${item.x},${item.z}:${item.hp}:${item.state}`).join('|'),
          event: wave.state.event ? JSON.stringify(wave.state.event) : null});
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
// What a page shows of one spot: the level art on the map (island-cannon:<spot>, its brass pips) and the card's
// "Level n of m" with the price of the next level. The card is opened and closed again unless `keep`.
const mapOf = (captain, spot) => captain.page.evaluate(spot => {
  let level = 0, pips = 0;
  window.__island.scene.traverse(object => {
    if (/^island-(wall|cannon|mortar|watchtower|house):/.test(object.name) && object.name.endsWith(`:${spot}`)) level = object.userData.level ?? 0;
    if (object.name.startsWith(`island-pip:${spot}:`)) pips++;
  });
  return {level, pips};
}, spot);
const cardOf = (captain, spot, keep = false) => captain.page.evaluate(async ([spot, keep]) => {
  const game = window.__island.island;
  game.pick(spot); await new Promise(resolve => setTimeout(resolve, 80));
  const card = document.querySelector('.island-card[open]');
  const read = {pips: card?.querySelector('.island-pips')?.getAttribute('aria-label') ?? '', next: card?.querySelector('.island-next-label')?.textContent ?? ''};
  if (!keep) game.ui.close();
  return read;
}, [spot, keep]);
// Waits (at most 2 s) until the map shows `level` with that many pips, then reads the card; answers the ms it took.
async function shows(captain, spot, level, what) {
  const began = Date.now();
  const ok = async () => { const map = await mapOf(captain, spot); return map.level === level && map.pips === level; }; // a wall shows pips from level 2
  while (Date.now() - began < 2000 && !await ok()) await captain.page.waitForTimeout(100);
  assert.ok(await ok(), `${captain.name}'s map shows ${what} as level ${level}: ${JSON.stringify(await mapOf(captain, spot))}`);
  const card = await cardOf(captain, spot);
  assert.equal(card.pips, `Level ${level} of 5`, `${captain.name}'s card shows ${what} at level ${level}`);
  const took = Date.now() - began;
  assert.ok(took <= 2200, `${what} reached ${captain.name} within 2 s (${took} ms)`);
  return took;
}
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
// The same wave on two pages: for every sample of `a`, the sample of `b` at the same tick (±1) has the same
// ships and the same boarders ashore (boarding, TOWER-DEFENSE.md §12).
async function compare(a, b, waveId) {
  const [left, right] = await Promise.all([a, b].map(captain => captain.page.evaluate(id => window.__mp.samples.filter(item => item.waveId === id), waveId)));
  const byTick = new Map(right.map(item => [item.ticks, item]));
  const size = list => list.split(',').filter(Boolean).length;
  let checked = 0, same = 0, worst = 0, sameBoarders = 0, worstBoarders = 0, withBoarders = 0;
  for (const sample of left.filter((_, index) => index % 10 === 0)) {
    const other = byTick.get(sample.ticks) ?? byTick.get(sample.ticks - 1) ?? byTick.get(sample.ticks + 1);
    if (!other) continue;
    checked++;
    if (other.ships === sample.ships) same++;
    if (other.boarders === sample.boarders) sameBoarders++;
    if (sample.boarders) withBoarders++;
    worst = Math.max(worst, Math.abs(size(other.ships) - size(sample.ships)));
    worstBoarders = Math.max(worstBoarders, Math.abs(size(other.boarders) - size(sample.boarders)));
  }
  const landed = Math.max(0, ...left.map(item => item.landed));
  // The militia at exactly the same tick (they move every tick, so ±1 would differ).
  let militiaChecked = 0, sameMilitia = 0, fighting = 0;
  const exact = new Map(right.map(item => [item.ticks, item]));
  for (const sample of left.filter(item => item.militia)) {
    const other = exact.get(sample.ticks);
    if (!other) continue;
    militiaChecked++;
    if (other.militia === sample.militia) sameMilitia++;
    if (sample.militia.includes(':fighting')) fighting++;
  }
  return {checked, same, worst, sameBoarders, worstBoarders, withBoarders, landed, militiaChecked, sameMilitia, fighting};
}

// The musket fires from the captain's own body (owner, 12 Nov): the owner's character and, on the friend's
// page, the owner's figure switch to the musket pose; no second captain is drawn where the shot was fired.
// poseSeen answers where the pose mesh is on screen ({x, y} in px), or null when none showed within 3 s.
const poseSeen = (page, figure) => page.waitForFunction(figure => { let at = null;
  const g = window.__island, {innerWidth: w, innerHeight: h} = window;
  g.scene.traverse(item => { if (at || item.name !== 'captain-pose' || !item.visible || (item.parent?.parent?.name === 'other-captains') !== figure) return;
    const p = item.getWorldPosition(item.position.clone()).project(g.camera); at = {x: (p.x + 1) / 2 * w, y: (1 - p.y) / 2 * h, frame: item.userData.pose}; });
  return at; }, figure, {timeout: 3000, polling: 16}).then(handle => handle.jsonValue(), () => null);
// A close crop around the pose (the screenshots' "zoomed in" view), as wide as a third of the page.
const zoomClip = (page, at) => { const {width, height} = page.viewportSize(), w = Math.round(width / 3), h = Math.round(w * .7);
  return {x: Math.max(0, Math.min(width - w, at.x - w / 2)), y: Math.max(0, Math.min(height - h, at.y - h * .65)), width: w, height: h}; };
async function musketPose(host, ben) {
  const sizes = [[1280, 800], [390, 844]], seen = {own: [], figure: []};
  let probe = null;
  for (const [width, height] of sizes) {
    await host.page.setViewportSize({width, height}); await ben.page.setViewportSize({width, height});
    const size = `${width}x${height}`;
    let own = false, figure = false;
    for (let attempt = 0; attempt < 4 && !(own && figure); attempt++) {
      const spot = await host.page.evaluate(() => { const ships = window.__island.waves.island.wave?.state?.ships ?? [];
        if (!ships.length) return null; const ship = ships.reduce((a, b) => (Math.hypot(a.x, a.z) < Math.hypot(b.x, b.z) ? a : b)), d = Math.hypot(ship.x, ship.z);
        return {id: ship.id, x: ship.x * 14 / d, z: ship.z * 14 / d, bx: ship.x * 10 / d, bz: ship.z * 10 / d}; });
      if (!spot) break;
      await stand(host, spot); await stand(ben, {x: spot.bx, z: spot.bz});
      // ?islands=fake has no live presence, so the friend's page draws no figure for the owner (a shooter
      // without a figure shows only the flash, tracer and puff). Stand one in for it where the owner is,
      // under his member id (his lobby colour), through the presence's own simulate().
      await ben.page.evaluate(([x, z, id]) => { const g = window.__island, place = g.island.presencePlace('home_islet');
        g.experience.simulate({status: 'live', place, others: [{id, name: 'Nils', x, y: z, facing: 'front', moving: false, place}], hiddenCount: 0, sampledAt: Date.now()}); },
        [spot.x, spot.z, host.playerId]);
      await host.page.waitForTimeout(1500); // the friend's page hears where the owner stands
      let fired = false;
      // At the ship by its id: the gun, never the cutlass (with no id a boarder in reach gets the blade).
      for (let i = 0; i < 20 && !fired; i++) { fired = await host.page.evaluate(id => window.__island.waves.island.shoot(id), spot.id); if (!fired) await host.page.waitForTimeout(300); }
      if (!fired) continue;
      const [mine, theirs] = await Promise.all([poseSeen(host.page, false), poseSeen(ben.page, true)]);
      if (mine && !own) {
        await host.page.screenshot({path: `${out}/05b-musket-pose-own-zoom-${size}.png`, clip: zoomClip(host.page, mine)});
        await host.page.screenshot({path: `${out}/05b-musket-pose-own-${size}.png`});
        seen.own.push(`${size} ${mine.frame}`); own = true;
      }
      if (theirs && !figure) {
        await ben.page.screenshot({path: `${out}/05b-musket-pose-teammate-zoom-${size}.png`, clip: zoomClip(ben.page, theirs)});
        await ben.page.screenshot({path: `${out}/05b-musket-pose-teammate-${size}.png`});
        seen.figure.push(`${size} ${theirs.frame}`); figure = true;
      }
      if (!theirs) probe = await ben.page.evaluate(() => { const g = window.__island, w = g.waves;
        return {figures: g.experience.figures(), party: (w.island.state?.party ?? []).map(h => ({id: h.id, colour: h.colour, present: h.present, x: h.x, z: h.z})), mine: w.island.playerId}; });
      await host.page.waitForTimeout(700); // the pose is over before the next shot
    }
  }
  await ben.page.evaluate(() => window.__island.experience.simulate(null));
  for (const captain of [host, ben]) await captain.page.setViewportSize({width: 960, height: 600});
  return {seen, probe};
}
const results = [];
const captainShots = [];
// Where nobody fights: north of the heart, away from the three sea lanes (east, south, west).
const SAFE = {x: 0, z: -12};
const stand = (captain, at) => captain.page.evaluate(at => { const g = window.__island; g.player.position.set(at.x, g.world.current.groundHeight?.(at.x, at.z) ?? 1.03, at.z); }, at);
const myCaptain = captain => captain.page.evaluate(() => { const w = window.__island.waves.island;
  return {id: w.playerId, captain: w.captain, down: w.captainDown, revive: w.revive, party: w.state?.party ?? []}; });
// The narrator's caption sits where the wave's prompt is: skip it before a screenshot of the prompt.
const quiet = captain => captain.page.evaluate(() => document.querySelector('.narrator-card:not([hidden]) .narrator-skip')?.click());
// Screenshots of the owner and the friend at the two sizes the brief asks for; the game goes back to 960 × 600.
async function sized(name, captains) {
  for (const [label, size] of [['1280x800', {width: 1280, height: 800}], ['390x844', {width: 390, height: 844}]]) {
    for (const captain of captains) {
      await quiet(captain);
      await captain.page.setViewportSize(size); await captain.page.waitForTimeout(250); await settle(captain.page);
      await captain.page.screenshot({path: `${out}/${name}-${label}-${captain.playerId}.png`});
    }
  }
  for (const captain of captains) await captain.page.setViewportSize({width: 960, height: 600});
}
// GAME-V3.md §3: the friend falls on the boarders, the owner helps him up (a short hold that charges nothing
// first), and both pages see the same fall and the same revive at the same tick.
async function captainHealth(host, ben, wave) {
  const lines = [];
  await stand(host, SAFE);
  const benId = (await myCaptain(ben)).id, hostId = (await myCaptain(host)).id;
  // Both captains are in the wave with full hp, on both pages.
  for (const captain of [host, ben]) {
    await captain.page.waitForFunction(ids => { const party = window.__island.waves.island.state?.party ?? [];
      return ids.every(id => party.some(hero => hero.id === id && hero.present)); }, [hostId, benId], {timeout: 15000, polling: 200});
  }
  // The friend stands on the nearest boarder until he falls.
  let snapped = false;
  const end = Date.now() + 120000;
  while (Date.now() < end) {
    const state = await ben.page.evaluate(() => { const w = window.__island.waves.island, s = w.wave;
      if (!s || s.done) return {over: true};
      const boarders = s.state.boarders ?? [];
      const target = boarders.reduce((best, b) => (!best || Math.hypot(b.x, b.z - 2) < Math.hypot(best.x, best.z - 2) ? b : best), null);
      if (target && !w.captainDown) { const g = window.__island; g.player.position.set(target.x + .4, g.world.current.groundHeight?.(target.x, target.z) ?? 1.03, target.z); }
      return {down: w.captainDown, hp: w.captain?.hp ?? null, boarders: boarders.length};
    });
    if (state.over) throw new Error('the wave ended before the friend fell');
    if (!snapped && state.hp !== null && state.hp < 90) { snapped = true; await sized('07-captain-hp-bar', [ben, host]); }
    if (state.down) break;
    await ben.page.waitForTimeout(300);
  }
  const fallenAt = await ben.page.evaluate(id => window.__mp.fell.find(item => item.captainId === id), benId);
  assert.ok(fallenAt, 'the friend fell');
  await host.page.waitForFunction(id => window.__mp.fell.some(item => item.captainId === id), benId, {timeout: 5000, polling: 100});
  const hostFell = await host.page.evaluate(id => window.__mp.fell.find(item => item.captainId === id), benId);
  lines.push(`captain health: the friend fell at sim time ${fallenAt.t} s on his page, ${hostFell.t} s on the owner's`);
  assert.equal(hostFell.t, fallenAt.t, 'both pages saw the fall at the same tick');
  // A fallen captain cannot walk: the page keeps him where he fell.
  const pinned = await ben.page.evaluate(() => { const g = window.__island, p = g.player.position, was = {x: p.x, z: p.z};
    p.set(p.x + 5, p.y, p.z + 5); return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() =>
      resolve(Math.hypot(g.player.position.x - was.x, g.player.position.z - was.z))))); });
  assert.ok(pinned < .01, `the fallen captain stays where he fell (moved ${pinned})`);
  assert.equal(await ben.page.locator('.pirate-down:not([hidden])').count(), 1, 'the friend sees "You have fallen"');
  await host.page.waitForFunction(() => document.querySelectorAll('.pirate-mark').length > 0, null, {timeout: 5000, polling: 100});
  await sized('08-fallen-captain-ring-timer', [ben, host]);
  // The owner walks up to him (where the owner's sim has him) and holds E.
  const benHere = (await myCaptain(host)).party.find(hero => hero.id === benId);
  await stand(host, {x: benHere.x + 1.2, z: benHere.z});
  await host.page.waitForFunction(() => window.__island.waves.island.wave?.action?.kind === 'revive', null, {timeout: 5000, polling: 100});
  const coins = async () => host.page.evaluate(() => window.__island.island.dev.read().coins);
  const before = await coins();
  for (const [label, size] of [['1280x800', {width: 1280, height: 800}], ['390x844', {width: 390, height: 844}]]) {
    await host.page.setViewportSize(size); await host.page.waitForTimeout(250);
    await stand(host, {x: benHere.x + 1.2, z: benHere.z});
    await host.page.evaluate(() => document.activeElement?.blur?.()); // E goes to the game, not a button
    await quiet(host);
    // Wait on the game's own progress, not on wall-clock time: on a busy machine frames stall, so a fixed wait
    // read 0 (nothing drawn yet) or overshot into a finished revive. Let go as soon as the ring is a third full.
    await host.page.keyboard.down('KeyE');
    const share = await host.page.waitForFunction(() => { const s = window.__island.waves.island.revive?.share ?? 0;
      return s >= .3 ? s : false; }, null, {timeout: 20000, polling: 30}).then(handle => handle.jsonValue()).catch(() => 0);
    await host.page.keyboard.up('KeyE');
    await host.page.screenshot({path: `${out}/09-revive-in-progress-${label}-${host.playerId}.png`});
    await host.page.waitForTimeout(300);
    assert.ok(share >= .3 && share < 1, `the hold fills (${share})`);
  }
  await host.page.setViewportSize({width: 960, height: 600}); await host.page.waitForTimeout(250);
  assert.equal(await coins(), before, 'a hold that lets go pays nothing');
  await stand(host, {x: benHere.x + 1.2, z: benHere.z});
  await host.page.evaluate(() => document.activeElement?.blur?.());
  // Hold until the revive lands (sim time), however slow the machine is.
  await host.page.keyboard.down('KeyE');
  await host.page.waitForFunction(id => window.__mp.revived.some(item => item.captainId === id), benId, {timeout: 30000, polling: 100});
  await host.page.keyboard.up('KeyE');
  for (const captain of [host, ben]) await captain.page.waitForFunction(id => window.__mp.revived.some(item => item.captainId === id), benId, {timeout: 8000, polling: 100});
  const [hostRevived, benRevived] = await Promise.all([host, ben].map(captain => captain.page.evaluate(id => window.__mp.revived.find(item => item.captainId === id), benId)));
  const paid = before - await coins();
  lines.push(`captain health: the owner helped him up for 🪙 ${paid} at sim time ${hostRevived.t} s (the friend's page ${benRevived.t} s), by ${hostRevived.by === hostId ? 'the owner' : hostRevived.by}`);
  assert.equal(benRevived.t, hostRevived.t, 'both pages saw the revive at the same tick');
  const maxHp = (await myCaptain(host)).party.find(hero => hero.id === benId).maxHp;
  assert.equal(hostRevived.hp, Math.round(maxHp * .75), 'a Medic\'s help-up gives back 75% hp');
  assert.equal(benRevived.hp, hostRevived.hp, 'both pages agree on the hp');
  lines.push(`captain tree: the Medic helped him up after a 1.6 s hold, hp ${hostRevived.hp} of ${maxHp} on both pages`);
  assert.equal(paid, 20 + 5 * wave.wave, 'the helper paid 20 + 5 × wave');
  assert.equal((await myCaptain(ben)).down, false, 'the friend is back on his feet');
  await shot('10-revived');
  await stand(ben, SAFE); await stand(host, SAFE);
  return lines;
}
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
  // 2a Captain tree (docs/GAME-V3.md, Captain tree and roles): the host reaches captain level 3 and picks Medic; the
  // friend's lobby shows the role icon next to Nils. The faster help-up (1.2 s) is proved in the revive below.
  await island(host, async i => { i.dev.setCaptain(3); await i.load(); const answer = await i.takeRole('medic'); return answer; });
  assert.equal(await island(host, i => i.captainLoadout().skills.includes('medic')), true, 'the medic role is in the host\'s loadout');
  await ben.page.evaluate(() => window.__island.island.openLobby());
  await ben.page.waitForFunction(() => document.querySelector('.island-card-lobby[open] .island-lobby-player[data-captain-role="medic"] .island-lobby-role'), null, {timeout: 15000, polling: 200});
  const medicRow = await ben.page.evaluate(() => { const row = document.querySelector('.island-card-lobby[open] .island-lobby-player[data-captain-role="medic"]');
    return {name: row.querySelector('.island-lobby-name').textContent, icon: row.querySelector('.island-lobby-role').textContent, label: row.querySelector('.island-lobby-role').getAttribute('aria-label')}; });
  assert.deepEqual(medicRow, {name: 'Nils (you)'.replace(' (you)', ''), icon: '🩹', label: 'Medic'}, 'the friend sees the Medic icon on Nils');
  results.push(`captain tree: the friend's lobby shows ${medicRow.icon} ${medicRow.label} on ${medicRow.name}`);
  await shot('01b-lobby-role-icons');
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
  // 2b Upgrades are seen on the other page within 2 s: the owner's, then the friend's on the owner's island.
  await island(host, async i => { i.dev.setWaveBest(5); i.dev.setCoins(900); await i.load(); });
  await island(ben, async i => { i.dev.setWaveBest(5); i.dev.setCoins(900); await i.load(); });
  // The inner wall ring opens after wave 5 (GAME-V3.md §4): the owner raises it now, for the wave further down.
  await island(host, async i => { for (const id of ['wall_7', 'wall_8', 'wall_9', 'wall_10', 'wall_11', 'wall_12']) await i.build(id, 'wall'); });
  assert.deepEqual(await mapOf(ben, 'wall_2'), {level: 1, pips: 0});
  await island(host, async i => i.upgrade('wall_2'));
  const ownerUpgrade = await shows(ben, 'wall_2', 2, 'the owner\'s wall');
  results.push(`owner upgrade to level 2 on the friend's map and card after ${ownerUpgrade} ms`);
  await shot('02b-owner-upgrade');
  await cardOf(host, 'wall_2', true); // the owner keeps the card open while the friend upgrades
  await island(ben, async i => i.upgrade('wall_2'));
  const upgradedAt = Date.now();
  await host.page.waitForFunction(() => document.querySelector('.island-card[open] .island-pips')?.getAttribute('aria-label') === 'Level 3 of 5', null, {timeout: 2000, polling: 100});
  await shows(host, 'wall_2', 3, 'the wall the friend upgraded');
  const friendUpgrade = Date.now() - upgradedAt;
  await shows(ben, 'wall_2', 3, 'the wall the friend upgraded');
  results.push(`friend upgrade to level 3 on the owner's map and open card after ${friendUpgrade} ms`);
  await shot('02c-friend-upgrade');
  // 2c Tower skills (GAME-V3.md §5): research at the Tech hub (after wave 8), then a skill per tower, seen on both screens.
  const specOf = (captain, spot) => captain.page.evaluate(spot => {
    const i = window.__island.island, target = i.visiting?.spots ? i.visiting : i.island;
    return target?.spots?.find(item => item.id === spot)?.spec ?? null;
  }, spot);
  const skillCard = (captain, spot) => captain.page.evaluate(async spot => {
    const game = window.__island.island; game.pick(spot); await new Promise(resolve => setTimeout(resolve, 80));
    const card = document.querySelector('.island-card[open]');
    const read = {title: card?.querySelector('.island-skills-title')?.textContent ?? '',
      active: card?.querySelector('.island-spec.is-active')?.dataset.spec ?? null};
    game.ui.close();
    return read;
  }, spot);
  async function seesSpec(captain, spot, spec, what) {
    const began = Date.now();
    while (Date.now() - began < 2000 && await specOf(captain, spot) !== spec) await captain.page.waitForTimeout(100);
    assert.equal(await specOf(captain, spot), spec, `${captain.name}'s island shows ${what} as ${spec}`);
    const card = await skillCard(captain, spot);
    assert.equal(card.active, spec, `${captain.name}'s card marks ${spec} for ${what}`);
    const took = Date.now() - began;
    assert.ok(took <= 2200, `${what} reached ${captain.name} within 2 s (${took} ms)`);
    return {took, title: card.title};
  }
  await island(host, async i => { i.dev.setWaveBest(8); i.dev.setCoins(900); await i.load(); });
  await island(ben, async i => { await i.load(); });
  await island(host, async i => { await i.research('cannon'); });
  assert.deepEqual(await host.page.evaluate(() => [...window.__island.island.campaign.research.done]), ['cannon'], 'the owner researched cannon skills');
  await island(host, async i => { await i.specialise('cannon_1', 'heavy'); });
  const heavy = await seesSpec(ben, 'cannon_1', 'heavy', "the owner's cannon skill");
  results.push(`tower skill: the owner's Heavy shot on cannon_1 on the friend's island and card after ${heavy.took} ms ("${heavy.title}")`);
  await shot('02d-tower-skill');
  await island(ben, async i => { await i.specialise('cannon_1', 'rapid'); });
  const rapid = await seesSpec(host, 'cannon_1', 'rapid', "the friend's cannon skill");
  results.push(`tower skill: the friend's Rapid on the owner's cannon_1 on the owner's island and card after ${rapid.took} ms`);
  // 2d Research tiers (GAME-V3.md §5.1): the owner picks tier 2 of the cannons (Long guns), the friend picks the tier-3
  // capstone (Grapeshot) on the owner's island and gives cannon_1 that skill; both pages then hold the same research
  // and hand the wave the same defenses (checked again in the running wave's sim below).
  await island(host, async i => { i.dev.setWaveBest(26); i.dev.setCoins(3000); await i.load(); });
  await island(ben, async i => { i.dev.setCoins(3000); await i.load(); });
  const researchOn = captain => captain.page.evaluate(() => ({tiers: window.__island.island.campaign.research.tiers.cannon,
    cannons: window.__island.island.defenses().filter(item => item.kind === 'cannon')}));
  await island(host, async i => { await i.research({branch: 'cannon', tier: 2, choice: 'long_guns'}); });
  const tierAt = Date.now();
  await ben.page.waitForFunction(() => window.__island.island.campaign.research.tiers.cannon.tier2 === 'long_guns', null, {timeout: 5000, polling: 100});
  results.push(`research tier 2: the owner's Long guns on the friend's island after ${Date.now() - tierAt} ms`);
  await island(ben, async i => { await i.research({branch: 'cannon', tier: 3, choice: 'grapeshot'}); await i.specialise('cannon_1', 'grapeshot'); });
  await seesSpec(host, 'cannon_1', 'grapeshot', "the friend's capstone");
  const [hostResearch, benResearch] = [await researchOn(host), await researchOn(ben)];
  assert.deepEqual(hostResearch, benResearch, 'both pages hold the same research and hand the wave the same cannons');
  assert.deepEqual(hostResearch.tiers, {tier: 3, tier2: 'long_guns', tier3: 'grapeshot'}, 'tier 3 of the cannons, chosen on the friend\'s page');
  assert.ok(hostResearch.cannons.some(item => item.id === 'cannon_1' && item.spec === 'grapeshot' && item.bonus === 'long_guns'), 'cannon_1 fights with Grapeshot and Long guns');
  results.push('research tier 3: the friend\'s Grapeshot and cannon_1\'s pick are the same research and defenses on both pages');
  await shot('02e-research-tiers');
  // 2e House roles (GAME-V3.md "Houses"): below level 2 the card says what comes; at level 2 the owner picks the
  // Barracks on house_1 and the friend sees it on the map and the card; it fights in wave 3 below.
  await island(host, async i => { await i.build('house_1', 'house'); });
  const lowCard = await host.page.evaluate(async () => {
    const game = window.__island.island; game.pick('house_1'); await new Promise(resolve => setTimeout(resolve, 80));
    const line = document.querySelector('.island-card[open] .island-skills-line')?.textContent ?? ''; game.ui.close(); return line;
  });
  assert.equal(lowCard, 'Level 2: choose Barracks, Tavern or Workshop.', 'a level-1 house says what comes at level 2');
  await island(host, async i => { await i.upgrade('house_1'); await i.specialise('house_1', 'barracks'); });
  const barracks = await seesSpec(ben, 'house_1', 'barracks', "the owner's house role");
  const looks = await ben.page.evaluate(() => { let art = ''; window.__island.scene.traverse(object => { if (object.name === 'island-house:house_1') art = object.userData.art; }); return art; });
  assert.equal(looks, 'island-house-barracks', "the friend's map shows the Barracks look");
  results.push(`house role: the owner's Barracks on house_1 on the friend's island, card ("${barracks.title}") and map (${looks}) after ${barracks.took} ms`);
  await island(ben, async i => { await i.specialise('house_1', 'workshop'); });
  const workshop = await seesSpec(host, 'house_1', 'workshop', "the friend's house role");
  results.push(`house role: the friend's Workshop on house_1 on the owner's island and card after ${workshop.took} ms`);
  await island(host, async i => { await i.specialise('house_1', 'barracks'); });
  await seesSpec(ben, 'house_1', 'barracks', "the owner's house role again");
  // 2d Tear down (GAME-V3.md §4.2): wall_2 was built by the friend (🪙 10), raised by the owner (🪙 20) and by the
  // friend (🪙 40). The owner tears it down from its card: the confirmation shows both refunds, the friend's island
  // shows the empty spot and his toast within 2 s, and his coins are 🪙 25 more. Then the owner builds it up again.
  const benCoins = () => ben.page.evaluate(() => window.__island.island.island?.coins ?? null);
  const benBefore = await benCoins();
  await host.page.evaluate(async () => {
    const game = window.__island.island; game.pick('wall_2'); await new Promise(resolve => setTimeout(resolve, 80));
    document.querySelector('.island-card[open] .island-teardown').click();
  });
  await host.page.waitForFunction(() => document.querySelectorAll('.island-card-demolish[open] .island-refund').length === 2, null, {timeout: 5000, polling: 100});
  const confirmation = await host.page.evaluate(() => ({question: document.querySelector('.island-card-demolish[open] .island-demolish-question').textContent,
    lines: [...document.querySelectorAll('.island-card-demolish[open] .island-refund')].map(item => item.textContent),
    focus: document.activeElement?.dataset?.focus ?? ''}));
  assert.deepEqual(confirmation, {question: 'Tear down this Wall (level 3)?', lines: ['You get back 🪙 10.', 'Ben gets back 🪙 25.'], focus: 'keep'});
  await sized('02e-teardown-confirm', [host]);
  await host.page.locator('.island-card-demolish[open] [data-focus="confirm"]').click();
  const tornAt = Date.now();
  await ben.page.waitForFunction(() => window.__island.island.visiting?.spots?.find(spot => spot.id === 'wall_2')?.built === false, null, {timeout: 2000, polling: 50});
  const emptyAfter = Date.now() - tornAt;
  await ben.page.waitForFunction(() => /^Nils tore down the Wall\. You got back 🪙 25\.$/.test(window.__island.island.ui.toastText), null, {timeout: 3000, polling: 50});
  const benToast = await ben.page.evaluate(() => window.__island.island.ui.toastText);
  await ben.page.waitForFunction(before => window.__island.island.island?.coins === before + 25, benBefore, {timeout: 3000, polling: 100});
  assert.deepEqual(await mapOf(ben, 'wall_2'), {level: 0, pips: 0}, "the friend's map shows no wall on wall_2");
  assert.deepEqual(await mapOf(host, 'wall_2'), {level: 0, pips: 0}, "the owner's map shows no wall on wall_2");
  results.push(`tear down: the owner's confirmation "${confirmation.question}" ${confirmation.lines.join(' ')}; the friend's island showed the empty spot after ${emptyAfter} ms, his toast "${benToast}", his coins ${benBefore} → ${benBefore + 25}`);
  await sized('02f-teardown-after', [host, ben]);
  await island(host, async i => { await i.build('wall_2', 'wall'); await i.upgrade('wall_2'); await i.upgrade('wall_2'); });
  await shows(ben, 'wall_2', 3, 'the wall built up again');
  // 3 Wave 3 (more ships, so both muskets find a target) with one more cannon and the inner wall ring
  // (TOWER-DEFENSE.md §12: two cannons let boarders come ashore, the ring holds them); the owner rings.
  await island(host, async i => { i.dev.setWaveBest(2); i.dev.setCoins(400); await i.load(); await i.build('cannon_2', 'cannon'); });
  await ben.page.waitForFunction(() => window.__island.island.visiting?.spots?.find(spot => spot.id === 'wall_12')?.built, null, {timeout: 5000, polling: 100});
  await island(host, async i => i.ringBell());
  const first = await until(host, state => state?.ships > 0, 'the first ships', 60000);
  const benWave = await until(ben, state => state?.waveId === first.waveId && state.ships > 0, 'the friend in the same wave', 30000);
  results.push(`wave ${first.wave} (${first.waveId}) on both pages: ${first.ships} / ${benWave.ships} ships`);
  // The tiers act the same in both sims: the same towers with the same skill, bonus and reach.
  const simTowers = captain => captain.page.evaluate(() => window.__island.waves.island.wave.state.towers.map(item => ({id: item.id, spec: item.spec ?? null, bonus: item.bonus ?? null, range: item.range})));
  const [hostTowers, benTowers] = [await simTowers(host), await simTowers(ben)];
  assert.deepEqual(hostTowers, benTowers, 'both sims fight with the same towers');
  assert.ok(hostTowers.some(item => item.id === 'cannon_1' && item.spec === 'grapeshot' && item.bonus === 'long_guns'), 'the wave\'s cannon_1 has Grapeshot and Long guns');
  results.push(`research in the wave: ${hostTowers.length} towers alike in both sims, cannon_1 ${JSON.stringify(hostTowers.find(item => item.id === 'cannon_1'))}`);
  // 4 Both captains fire; each shot reaches the other page.
  const hostShot = await musket(host), benShot = await musket(ben);
  assert.ok(hostShot && benShot, 'both captains could fire');
  await stand(host, SAFE); await stand(ben, SAFE); // nobody stands on the beach doing nothing
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
  // 4b Captain health: the friend falls, the owner helps him up for coins, both pages agree.
  const health = await captainHealth(host, ben, first);
  results.push(...health);
  // 5 Everybody finishes with loot, then both press "Next wave" at the same moment.
  // The break lasts 15 s: press Next wave on both pages first, look at the loot after.
  for (const captain of pages) await until(captain, state => state?.pause, 'the break', 240000);
  // An upgrade in the break (the wave's own drawing hides the island's sprites): both pages show it at once.
  await island(host, async i => i.upgrade('cannon_2'));
  const postLevels = captain => captain.page.evaluate(() => window.__island.waves.island.wave?.renderer?.levels?.().cannon_2 ?? 0);
  for (const captain of [host, ben]) await captain.page.waitForFunction(() => window.__island.waves.island.wave?.renderer?.levels?.().cannon_2 === 2, null, {timeout: 2500, polling: 100});
  results.push(`upgrade in the break: cannon_2 is level ${await postLevels(host)} / ${await postLevels(ben)} in the wave's drawing on both pages`);
  await shot('04-break-upgrade');
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
  results.push(`wave 1 boarders owner/friend: ${sync1.sameBoarders}/${sync1.checked} samples with the same boarders ashore (${sync1.withBoarders} with boarders, ${sync1.landed} landed), worst count gap ${sync1.worstBoarders}`);
  assert.ok(sync1.checked >= 5 && sync1.same / sync1.checked >= .9 && sync1.worst <= 1, 'the two pages ran the same wave');
  assert.ok(sync1.landed > 0 && sync1.withBoarders > 0, 'boarders came ashore in the synced wave');
  assert.ok(sync1.sameBoarders / sync1.checked >= .9 && sync1.worstBoarders <= 1, 'the two pages saw the same boarders');
  results.push(`wave 1 militia owner/friend: ${sync1.sameMilitia}/${sync1.militiaChecked} samples at the same tick identical (place, hp, state), ${sync1.fighting} fighting`);
  assert.ok(sync1.militiaChecked >= 5 && sync1.sameMilitia === sync1.militiaChecked, "the Barracks' militia did the same on both pages");
  // Whether a militia meets a boarder depends on where this wave's boarders land; the fight itself is covered by
  // tests/pirates/houses.test.js. Here only the sync is required: both pages show the militia the same.
  if (!sync1.fighting) results.push("wave 1 militia: no boarder came near the Barracks in this wave's samples");
  // v3 waves (GAME-V3.md §4.2): wave 3 always brings an event (fog bank or storm); both pages ran the same one,
  // with the same event state, and the samples above (the same ships at the same tick) are of that event wave.
  const eventsSeen = await Promise.all([host, ben].map(captain => captain.page.evaluate(wave => window.__mp.events.filter(item => item.wave === wave), first.wave)));
  const eventState = await Promise.all([host, ben].map(captain => captain.page.evaluate(id => window.__mp.samples.find(item => item.waveId === id && item.event)?.event ?? null, first.waveId)));
  results.push(`wave ${first.wave} event: owner ${JSON.stringify(eventsSeen[0])}, friend ${JSON.stringify(eventsSeen[1])}`);
  assert.equal(eventsSeen[0].length, 1, 'the event wave announced its event once');
  assert.deepEqual(eventsSeen[1], eventsSeen[0], 'both pages ran the same event');
  assert.ok(eventState[0] && eventState[0] === eventState[1], 'both pages hold the same event state');
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
  {
    const {seen, probe} = await musketPose(host, ben);
    results.push(`musket pose: the owner's own body posed at ${seen.own.join(', ') || 'no size'}, his figure on the friend's page at ${seen.figure.join(', ') || 'no size'}`);
    if (probe) results.push(`musket pose probe on the friend's page: ${JSON.stringify(probe)}`);
    assert.equal(seen.own.length, 2, "the owner's own character takes the musket pose when he fires (both sizes)");
    assert.ok([...seen.own, ...seen.figure].every(item => /musket-[12]$/.test(item)), `the poses are the musket's: ${[...seen.own, ...seen.figure]}`);
    assert.ok(seen.figure.length >= 1, "the owner's figure on the friend's page takes the musket pose");
  }
  for (const captain of [ben, ana, max]) {
    const sync = await compare(host, captain, second.waveId);
    results.push(`wave 2 sync owner/${captain.name}: ${sync.same}/${sync.checked} same ships, ${sync.sameBoarders}/${sync.checked} same boarders, worst count gap ${sync.worst} / ${sync.worstBoarders}`);
    assert.ok(sync.checked >= 3 && sync.worst <= 1 && sync.worstBoarders <= 1, `${captain.name} runs the owner's wave 2`);
  }
  for (const captain of pages) await until(captain, state => !state || state.pause || state.done, 'the end of wave 2', 240000);
  await shot('06-wave2-end');
  // 7 v3 waves (GAME-V3.md §4.3): the wave-5 boss finisher on four pages. Every captain plays the haul through real
  // key events; every page must hear every captain's samples and decide the same scores and the same outcome.
  await island(host, async i => { i.dev.setWaveBest(4); i.dev.setCoins(900); await i.load(); });
  for (const captain of pages) await captain.page.waitForFunction(() => !window.__island.waves.island.wave || window.__island.waves.island.wave.done, null, {timeout: 60000});
  await island(host, async i => i.ringBell());
  const boss = await until(host, state => state?.wave === 5 && state.ships > 0, 'the boss wave 5', 60000);
  for (const captain of pages) await until(captain, state => state?.waveId === boss.waveId, `${captain.name} in the boss wave`, 30000);
  for (const captain of pages) {
    await stand(captain, SAFE);
    await captain.page.evaluate(async () => {
      const rules = await import('/src/pirates/finisher/rules.js');
      let held = false;
      const step = () => {
        requestAnimationFrame(step);
        const c = window.__island.waves.island, f = c.state?.finisher, scene = c.wave?.finisher?.scene;
        if (!f || !scene || f.phase !== 'task' || f.tasks[f.task].task !== 'haul') return;
        const want = scene.needle < rules.zoneAt(f.sample - f.tasks[f.task].from + 2, f.salt);
        if (want !== held) { held = want; window.dispatchEvent(new KeyboardEvent(want ? 'keydown' : 'keyup', {code: 'Space', bubbles: true})); }
      };
      step();
    });
  }
  const finisherOf = captain => captain.page.evaluate(() => { const f = window.__island.waves.island.state?.finisher;
    return f ? {kind: f.kind, phase: f.phase, players: f.players, heard: f.heard, outcome: f.outcome, scores: f.tasks.map(t => t.players)} : null; });
  const ids = await Promise.all(pages.map(captain => captain.page.evaluate(() => window.__island.waves.island.playerId)));
  for (const captain of pages) await captain.page.waitForFunction(() => window.__island.waves.island.state?.finisher?.phase === 'task', null, {timeout: 200000, polling: 200});
  await host.page.waitForTimeout(4000);
  await shot('07-finisher-haul-mid-task');
  const midway = await Promise.all(pages.map(finisherOf));
  results.push(`finisher: ${midway[0].kind} for ${midway[0].players.join(', ')}; heard so far ${midway.map(item => item.heard.length).join(' / ')}`);
  for (const item of midway) assert.deepEqual([...item.players].sort(), [...ids].sort(), 'every captain in the wave is in the finisher');
  for (const captain of pages) await captain.page.waitForFunction(() => window.__mp.finishers.length > 0, null, {timeout: 60000, polling: 100});
  const outcomes = await Promise.all(pages.map(captain => captain.page.evaluate(() => window.__mp.finishers[0])));
  results.push(`finisher outcome on the four pages: ${outcomes.map(item => `${item.type} ${item.scores}/${item.goals}`).join(' · ')}`);
  for (const item of outcomes.slice(1)) assert.deepEqual(item, outcomes[0], 'every page decided the same finisher');
  const heard = await Promise.all(pages.map(finisherOf));
  for (const [index, item] of heard.entries()) {
    if (!item) continue; // the outro may be over on a fast page
    assert.deepEqual([...item.heard].sort(), [...ids].sort(), `${pages[index].name}'s page heard every captain's samples`);
    for (const id of ids) assert.ok((item.scores[0][id] ?? 0) > 0, `${pages[index].name}'s page counts ${id}'s input`);
  }
  await shot('07-finisher-outcome');
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
