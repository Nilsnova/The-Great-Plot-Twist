// Release check for the flag rescue (task T38, decision D044, specs/T38-T39-minigames-rescue.md) with two captains
// on one island, without live accounts: headless Chrome, one browser context, the fake server shared by both tabs
// (?islands=fake&fakeworld=…, fake-api.js), whose wave answers carry the rule rescue as backend/server/island/wave_rules.py
// does (the flag is retired, always on), and which honours `rescued` as routes/waves.py does, and
// the BroadcastChannel room. The island has no defenses but a wall and a house, so a wave is lost on its own (the
// heart falls or every captain goes down). Every page wraps its sim's step() and records every event with its tick.
// The scenarios, each reported PASS or FAIL with what was measured:
//   R rules     the bell's answer for wave 6 carries the rule rescue; both pages' controllers start the wave with it
//   A won       wave 6 is lost; both pages enter the rescue at the same tick with the same players and goal; the
//               battle stands still (sim time, heart, boarders and ships unchanged, no battle events); both captains
//               haul (real Space key events) and win; the same rescue events on both pages; each finish sends
//               survived false + rescued true; the next bell is best − 1, the best wave, flags, coins and buildings stay
//   B failed    wave 6 again, nobody hauls: both pages decide failed; no finish sends rescued; next bell best − 2
//   L low wave  wave 3 lost: no rescue, the wave ends at the tick the heart falls (or the crew goes down)
//   P point     Pirate Point wave 6 (a flagship wave, the answer still lists the rule): no rescue
//   C drop      wave 6 again: both haul, the friend's tab closes in the middle of the haul; the host's rescue keeps
//               its players and goal, is decided and finished; its outcome follows score ≥ goal
//   E           no browser errors
// Exit code 1 when any scenario fails.
//   node scripts/check-rescue-mp.js [folder]        (npm run test:rescue)
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openWorldBrowser, settle} from './world-browser-tools.js';
import {stubOfflineApi} from './api-browser-fixture.js';
import {stubWeather} from './weather-browser-fixture.js';

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const out = process.argv[2] ?? join(tmpdir(), 'tgpt-rescue', stamp);
await mkdir(out, {recursive: true});
const CODE = 'ISLE-K7Q2M';
const BEST = 5; // the island's best wave: the bell rings 6 (rescue from wave 4); best − 1 = 4, best − 2 = 3
const env = await openWorldBrowser({hmr: false}), context = env.page.context();
let pages = [];
const log = (...args) => console.log(...args);
const results = []; // {id, name, ok, lines}

// The front door's cards until the player stands in the lobby (check-wall-recovery-mp.js): Skip the lore and the
// arrival, Got it on the goal card, and on the games card Create a game (host) or Join with the code.
async function openCaptain(name, playerId, {world, flags = 'rescue', join = null, fresh = false} = {}) {
  const page = fresh ? env.page : await context.newPage();
  if (!fresh) {
    await stubOfflineApi(page); await stubWeather(page);
    page.on('pageerror', error => env.errors.push(`${name}: ${error.message}`));
    page.on('console', message => { if (message.type() === 'error') env.errors.push(`${name}: ${message.text()}`); });
  }
  await page.setViewportSize({width: 960, height: 600});
  await page.goto(`${env.url}/?islands=fake&fakeworld=${world}&fakeplayer=${playerId}&fakename=${encodeURIComponent(name)}${flags ? `&fakeflags=${flags}` : ''}`);
  if (fresh) { await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }); await page.reload(); }
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
  await page.evaluate(async () => {
    const g = window.__island; g.settings.hour = 12;
    const rec = window.__rescue = {waves: {}, finishes: [], answered: [], haul: 'none'};
    // Every wave this page's controllers start: its rules, and every event of its sim with the tick it came in.
    const controllers = () => [g.waves?.island, g.waves?.point?.controller].filter(Boolean);
    const snap = s => ({time: s.time, islandHp: s.islandHp, sunk: s.sunk, boarders: JSON.stringify(s.boarders), ships: JSON.stringify(s.ships)});
    g.on('wave_controller_started', event => {
      const w = controllers().map(item => item.wave).find(item => item?.info.waveId === event.waveId);
      if (!w || rec.waves[event.waveId]) return;
      const item = rec.waves[event.waveId] = {wave: event.wave, flagship: event.flagship, rules: {...w.info.rules}, count: 0, hash: 2166136261,
        types: [], key: [], during: [], ended: null, lastDamage: null, fell: [], checkpoints: []};
      const step = w.sim.step.bind(w.sim);
      w.sim.step = (dt, inputs) => {
        const tick = w.ticks, events = step(dt, inputs);
        for (const e of events) {
          const text = `${tick}|${JSON.stringify(e)}`;
          for (let k = 0; k < text.length; k++) item.hash = Math.imul(item.hash ^ text.charCodeAt(k), 16777619) >>> 0;
          item.count++;
          const rescueOn = item.key.some(k => k.type === 'rescue_started') && !item.key.some(k => k.type === 'rescue_ended');
          if (rescueOn && !e.type.startsWith('rescue_')) item.during.push(e.type);
          if (e.type.startsWith('rescue_') || e.type === 'wave_ended') item.key.push({tick, ...e, state: snap(w.sim.state())});
          if (e.type === 'wave_ended') item.ended = {tick, ...e};
          if (e.type === 'island_damaged') item.lastDamage = {tick, hp: e.hp};
          if (e.type === 'captain_fell') item.fell.push({tick, captainId: e.captainId});
        }
        if (tick % 200 === 0) item.checkpoints.push([tick, item.hash, item.count]);
        return events;
      };
    });
    g.on('wave_finish_answered', event => rec.answered.push(event));
    // Every finish this page sends (POST /api/waves/finish through the island API).
    const api = g.island.api, finish = api.finishWave.bind(api);
    api.finishWave = body => { rec.finishes.push(JSON.parse(JSON.stringify(body))); return finish(body); };
    // The haul bot (check-multiplayer.js): real Space key events, held while the needle is below the green zone.
    const rules = await import('/src/pirates/finisher/rules.js');
    let held = false;
    const press = want => { if (want !== held) { held = want; window.dispatchEvent(new KeyboardEvent(want ? 'keydown' : 'keyup', {code: 'Space', key: ' ', bubbles: true})); } };
    const loop = () => {
      requestAnimationFrame(loop);
      const c = g.waves?.island, f = c?.state?.finisher, scene = c?.wave?.finisher?.scene;
      if (rec.haul !== 'good' || !f || f.kind !== 'rescue' || !scene || f.phase !== 'task') { press(false); return; }
      const task = f.tasks[0];
      press(scene.needle < rules.zoneAt(f.sample - task.from + 2, f.salt, f.difficulty?.rescue?.speed ?? 1));
    };
    loop();
  });
  log(`${name} is in the lobby (${playerId})`);
  return captain;
}
const island = (captain, fn, arg) => captain.page.evaluate(([source, arg]) => (0, eval)(source)(window.__island.island, arg), [String(fn), arg]);
const recOf = (captain, waveId) => captain.page.evaluate(id => window.__rescue.waves[id] ?? null, waveId);
const finishesOf = (captain, waveId) => captain.page.evaluate(id => window.__rescue.finishes.filter(body => body.waveId === id), waveId);
const answeredOf = (captain, waveId) => captain.page.evaluate(id => window.__rescue.answered.some(item => item.waveId === id), waveId);
const rescueState = captain => captain.page.evaluate(() => { const f = window.__island.waves?.island?.state?.finisher;
  return f?.kind === 'rescue' ? {phase: f.phase, players: f.players, goal: f.tasks[0].goal, score: f.tasks[0].score, outcome: f.outcome, sample: f.sample} : null; });
const setHaul = (captain, mode) => captain.page.evaluate(mode => { window.__rescue.haul = mode; }, mode);
const ownIsland = captain => island(captain, async i => { const a = await i.api.getIsland(); return a.ok ? a.data : {error: a.code}; });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// page.waitForFunction with what it waited for in the error.
const waitOn = (captain, fn, arg, what, timeout = 60000) => captain.page.waitForFunction(fn, arg, {timeout, polling: 250})
  .catch(error => { throw new Error(`${captain.name}: ${what}: ${error.message.split('\n')[0]}`); });
async function scenario(id, name, fn) {
  const lines = [];
  log(`\n[${id}] ${name}`);
  try { await fn(line => { lines.push(line); log(`  ${line}`); }); results.push({id, name, ok: true, lines}); }
  catch (error) { lines.push(`FAILED: ${error.message.split('\n')[0]}`); log(`  FAILED: ${error.message}`); results.push({id, name, ok: false, lines}); }
}
async function shot(name) {
  for (const captain of pages) { if (captain.page.isClosed()) continue; await settle(captain.page); await captain.page.screenshot({path: `${out}/${name}-${captain.playerId}.png`}); }
}
// Click "Skip practice" (T28) wherever it shows while a rescue prepares.
async function skipPractice(captains) {
  for (const captain of captains) {
    if (captain.page.isClosed()) continue;
    const button = captain.page.getByRole('button', {name: 'Skip practice', exact: true});
    if (await button.isVisible().catch(() => false)) await button.click().catch(() => {});
  }
}
// The island between waves: no wave on either page's island controller.
async function idle(captains) {
  for (const captain of captains) {
    await waitOn(captain, () => !window.__island.waves?.island?.wave || window.__island.waves.island.wave.finished, null, 'no island wave running');
  }
}
// Ring the bell on the host's page; both pages in the wave; play it to the end (rescue included). onRescue(captains)
// runs once when every page shows the rescue's task phase. Answers {waveId, wave, answer, seconds}.
async function playWave(captains, {haul = 'none', onRescue = null, timeout = 360000} = {}) {
  const [host] = captains, began = Date.now();
  await idle(captains);
  for (const captain of captains) await setHaul(captain, haul);
  const rung = await island(host, async i => { const a = await i.ringBell(); return {ok: a.ok, code: a.code ?? null, data: a.data ?? null}; });
  assert.ok(rung.ok, `the host rang the bell (${JSON.stringify(rung)})`);
  const {waveId, wave} = rung.data;
  for (const captain of captains) {
    await waitOn(captain, id => !!window.__rescue.waves[id], waveId, `in wave ${waveId}`);
  }
  let task = false;
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const live = captains.filter(captain => !captain.page.isClosed());
    await skipPractice(live);
    const states = await Promise.all(live.map(rescueState));
    if (!task && onRescue && states.length === captains.length && states.every(s => s && (s.phase === 'task'))) { task = true; await onRescue(captains); continue; }
    const ended = await Promise.all(captains.filter(captain => !captain.page.isClosed()).map(captain => recOf(captain, waveId).then(item => !!item?.ended)));
    if (ended.every(Boolean)) break;
    await sleep(250);
  }
  for (const captain of captains.filter(item => !item.page.isClosed())) {
    assert.ok((await recOf(captain, waveId))?.ended, `${captain.name}: wave ${wave} ended within ${timeout / 1000} s`);
    await waitOn(captain, id => window.__rescue.answered.some(item => item.waveId === id), waveId, `the finish of ${waveId} answered`);
  }
  return {waveId, wave, answer: rung.data, seconds: Math.round((Date.now() - began) / 1000)};
}
const setBest = (host, best) => island(host, async (i, best) => { i.dev.setWaveBest(best); await i.load(); }, best);
const rescueEvents = item => item.key.filter(e => e.type.startsWith('rescue_')).map(({state, ...e}) => e);
const types = item => item.key.map(e => e.type);
// The two pages ran the same sim: the same events in the same ticks (hash over every event and its tick).
function sameRun(a, b, note, label) {
  note(`${label}: host ${a.count} events (hash ${a.hash.toString(16)}), friend ${b.count} events (hash ${b.hash.toString(16)})`);
  assert.deepEqual(b.key.map(({state, ...e}) => e), a.key.map(({state, ...e}) => e), `${label}: the same rescue and end events, ticks and fields on both pages`);
  if (a.hash !== b.hash || a.count !== b.count) {
    const first = a.checkpoints.find(([tick, hash], k) => b.checkpoints[k]?.[0] === tick && b.checkpoints[k][1] !== hash);
    assert.fail(`${label}: the event streams differ (first differing checkpoint ${JSON.stringify(first)})`);
  }
}
// The battle stood still while the rescue ran: the sim's time, heart, boarders and ships the same at its end.
function frozen(item, note, label) {
  const start = item.key.find(e => e.type === 'rescue_started'), stop = item.key.find(e => e.type === 'rescue_ended');
  assert.ok(start && stop, `${label}: the rescue started and ended`);
  assert.deepEqual(stop.state, start.state, `${label}: time, heart, boarders and ships unchanged during the rescue`);
  assert.deepEqual(item.during, [], `${label}: no battle event during the rescue`);
  note(`${label}: frozen from tick ${start.tick} to ${stop.tick} (${((stop.tick - start.tick) / 20).toFixed(1)} s): sim time ${start.state.time} → ${stop.state.time}, heart ${start.state.islandHp} → ${stop.state.islandHp}`);
}

let host = null, ben = null;
try {
  const WORLD = `rescue${Date.now().toString(36)}`;
  host = await openCaptain('Nils', 'me', {world: WORLD, fresh: true});
  assert.equal(await island(host, i => i.island.code), CODE);
  ben = await openCaptain('Ben', 'ben', {world: WORLD, join: 'k7q2m'});
  for (const captain of pages) {
    await captain.page.waitForFunction(() => [...document.querySelectorAll('.island-card-lobby[open] .island-lobby-player.is-online')].length === 2, null, {timeout: 30000, polling: 250});
  }
  await host.page.locator('.island-card-lobby[open] .island-lobby-start').click();
  for (const captain of pages) await captain.page.waitForFunction(() => window.__island.island.ui.open !== 'lobby', null, {timeout: 15000, polling: 100});
  // A wall and a house: they must still stand (same level) after every lost wave; they cannot hold wave 6.
  const built = await island(host, async (i, best) => { i.dev.setCoins(900); i.dev.setWaveBest(best); await i.load();
    const answers = [];
    for (const [spot, kind] of [['wall_1', 'wall'], ['house_1', 'house']]) { const a = await i.build(spot, kind); answers.push(`${spot}:${JSON.stringify(a ?? null)}`); }
    return answers; }, BEST);
  log(`built ${built.join(', ')}`);
  const before = await ownIsland(host);
  const keep = {spots: before.spots.filter(spot => spot.built).map(spot => `${spot.id}:${spot.kind}:${spot.level}`).sort()};
  log(`kept buildings: ${keep.spots.join(', ')}`);

  let waveA = null;
  await scenario('A', 'won rescue: same tick and goal on both pages, battle frozen, rescued:true, next bell best − 1, nothing else lost', async note => {
    await setBest(host, BEST);
    const coins = [await island(host, i => i.dev.read().coins), await island(ben, i => i.dev.read().coins)];
    const flags = (await ownIsland(host)).flags;
    waveA = await playWave([host, ben], {haul: 'good', onRescue: async () => { await sleep(3000); await shot('A-rescue-haul'); }});
    note(`wave ${waveA.wave} (${waveA.waveId}) took ${waveA.seconds} s; answer rules ${JSON.stringify(waveA.answer.rules)}`);
    const [a, b] = [await recOf(host, waveA.waveId), await recOf(ben, waveA.waveId)];
    // R is checked from the same wave (scenario R below reads waveA).
    const startA = a.key.find(e => e.type === 'rescue_started'), startB = b.key.find(e => e.type === 'rescue_started');
    assert.ok(startA && startB, `both pages offered the rescue (host ${types(a)}, friend ${types(b)})`);
    note(`rescue_started host tick ${startA.tick} / friend tick ${startB.tick}, reason ${startA.reason}, players ${startA.players}, goal ${startA.goal} / ${startB.goal}`);
    assert.equal(startB.tick, startA.tick, 'both pages enter the rescue at the same tick');
    assert.deepEqual(startB.players, startA.players, 'the same players');
    // Both captains (their sim ids) are in the rescue: the two ids the pages' controllers play as.
    const simIds = (await Promise.all([host, ben].map(captain => captain.page.evaluate(() => window.__island.waves.island.playerId)))).sort();
    assert.deepEqual([...startA.players].sort(), simIds, 'both captains play the rescue');
    assert.equal(startB.goal, startA.goal, 'the same goal');
    assert.ok(['island_lost', 'captains_fallen'].includes(startA.reason));
    frozen(a, note, 'host'); frozen(b, note, 'friend');
    sameRun(a, b, note, `wave ${waveA.wave}`);
    const won = rescueEvents(a).find(e => e.type === 'rescue_won' || e.type === 'rescue_failed');
    note(`outcome on both pages: ${won.type} score ${won.score}/${won.goal}`);
    assert.equal(won.type, 'rescue_won', 'both captains hauled and saved the treasure');
    assert.equal(a.ended.survived, false, 'the wave stays lost'); assert.equal(a.ended.rescued, true);
    assert.ok(a.ended.tick > a.key.find(e => e.type === 'rescue_ended').tick - 1, 'the wave ended after the rescue');
    for (const captain of [host, ben]) {
      const sent = await finishesOf(captain, waveA.waveId);
      note(`${captain.name}'s finish: ${JSON.stringify(sent)}`);
      assert.equal(sent.length, 1, `${captain.name} finished once`);
      assert.equal(sent[0].survived, false); assert.equal(sent[0].rescued, true, `${captain.name}'s finish sends rescued: true`);
    }
    const after = await ownIsland(host);
    note(`server: best ${after.waveBest}, nextWave ${after.nextWave}, flags ${flags} → ${after.flags}; coins host ${coins[0]} → ${after.coins}, friend ${coins[1]} → ${await island(ben, i => i.dev.read().coins)}`);
    assert.equal(after.nextWave, BEST - 1, 'the next bell rings best − 1');
    assert.equal(after.waveBest, BEST, 'the best wave is not lowered');
    assert.equal(after.flags, flags, 'no flag for a lost wave');
    assert.equal(after.coins, coins[0], 'the host\'s coins are kept (no loot, nothing taken)');
    assert.equal(await island(ben, i => i.dev.read().coins), coins[1], 'the friend\'s coins are kept');
    assert.deepEqual(after.spots.filter(spot => spot.built).map(spot => `${spot.id}:${spot.kind}:${spot.level}`).sort(), keep.spots, 'the buildings stay, same kind and level');
    const friendView = await island(ben, async (i, code) => { const a = await i.api.visit(code); return a.ok ? a.data.waveBest : a.code; }, CODE);
    note(`friend reads the island's best wave ${friendView}`);
    assert.equal(friendView, BEST, 'the friend reads the same best wave');
  });

  await scenario('R', 'the wave answer carries the rule rescue; both controllers start with it', async note => {
    assert.ok(waveA, 'the wave of scenario A');
    assert.ok(waveA.answer.rules?.includes('rescue'), 'the bell\'s answer lists the rule');
    for (const captain of [host, ben]) {
      const item = await recOf(captain, waveA.waveId);
      assert.equal(item.rules.rescue, true, `${captain.name}'s controller plays the rule`);
      note(`${captain.name}: controller rules ${JSON.stringify(item.rules)}`);
    }
  });

  await scenario('B', 'failed rescue: both pages decide failed, no rescued in the finish, next bell best − 2', async note => {
    await setBest(host, BEST);
    const wave = await playWave([host, ben], {haul: 'none'});
    const [a, b] = [await recOf(host, wave.waveId), await recOf(ben, wave.waveId)];
    note(`wave ${wave.wave} (${wave.waveId}) took ${wave.seconds} s`);
    const start = a.key.find(e => e.type === 'rescue_started');
    assert.ok(start, 'the rescue was offered');
    assert.equal(b.key.find(e => e.type === 'rescue_started')?.tick, start.tick, 'the same tick on both pages');
    frozen(a, note, 'host'); frozen(b, note, 'friend');
    sameRun(a, b, note, `wave ${wave.wave}`);
    const decided = rescueEvents(a).find(e => e.type === 'rescue_won' || e.type === 'rescue_failed');
    note(`outcome on both pages: ${decided.type} score ${decided.score}/${decided.goal}`);
    assert.equal(decided.type, 'rescue_failed');
    assert.equal(a.ended.survived, false); assert.equal(a.ended.rescued, undefined);
    for (const captain of [host, ben]) {
      const sent = await finishesOf(captain, wave.waveId);
      assert.equal(sent.length, 1); assert.equal(sent[0].survived, false); assert.equal('rescued' in sent[0], false, `${captain.name} sends no rescued`);
    }
    const after = await ownIsland(host);
    note(`server: best ${after.waveBest}, nextWave ${after.nextWave}`);
    assert.equal(after.nextWave, BEST - 2, 'the next bell rings best − 2');
    assert.equal(after.waveBest, BEST, 'the best wave is not lowered');
  });

  await scenario('L', 'below wave 4: a lost wave 3 ends at once, no rescue', async note => {
    await setBest(host, 2);
    const wave = await playWave([host, ben], {haul: 'good'});
    assert.equal(wave.wave, 3);
    assert.ok(wave.answer.rules?.includes('rescue'), 'the rule is on for the wave');
    for (const captain of [host, ben]) {
      const item = await recOf(captain, wave.waveId);
      assert.deepEqual(types(item), ['wave_ended'], `${captain.name}: no rescue event`);
      assert.equal(item.ended.survived, false, `${captain.name}: wave 3 was lost (${item.ended.reason})`);
      const at = item.ended.reason === 'island_lost' ? item.lastDamage?.tick : item.fell.at(-1)?.tick;
      assert.equal(item.ended.tick, at, `${captain.name}: the wave ended at the tick of the ${item.ended.reason === 'island_lost' ? 'heart\'s last damage' : 'last fall'}`);
      note(`${captain.name}: wave ${wave.wave} ${item.ended.reason} at tick ${item.ended.tick} (last damage tick ${item.lastDamage?.tick}), finish ${JSON.stringify(await finishesOf(captain, wave.waveId))}`);
    }
    const after = await ownIsland(host);
    note(`server: best ${after.waveBest}, nextWave ${after.nextWave}`);
    assert.equal(after.nextWave, 1);
  });

  await scenario('P', 'Pirate Point wave 6 (flagship): no rescue', async note => {
    await idle([host, ben]);
    await island(host, async i => { i.dev.setPointBest(5); });
    await host.page.evaluate(async () => { await window.__island.world.goTo('lighthouse_isle', {fast: true}); });
    await host.page.waitForFunction(() => window.__island.world.current?.id === 'lighthouse_isle' && !window.__island.world.busy, null, {timeout: 30000});
    await host.page.evaluate(() => window.__island.island.ui.close());
    const began = Date.now();
    const rung = await host.page.evaluate(async () => { const a = await window.__island.waves.point.ringBell(); return a && typeof a === 'object' ? {ok: a.ok ?? true} : {ok: !!a}; });
    for (let i = 0; i < 3; i++) { await host.page.waitForTimeout(1500); if (await host.page.locator('dialog.cutscene[open]').count()) await host.page.getByRole('button', {name: 'Skip', exact: true}).click().catch(() => {}); }
    const waveId = await host.page.waitForFunction(() => Object.entries(window.__rescue.waves).find(([, item]) => item.flagship)?.[0], null, {timeout: 60000, polling: 250}).then(handle => handle.jsonValue());
    note(`Pirate Point bell ${JSON.stringify(rung)}; wave ${waveId}`);
    await host.page.waitForFunction(id => !!window.__rescue.waves[id].ended, waveId, {timeout: 600000, polling: 500});
    const item = await recOf(host, waveId);
    note(`wave ${item.wave} (flagship ${item.flagship}) ended ${item.ended.reason} survived ${item.ended.survived} at tick ${item.ended.tick} after ${Math.round((Date.now() - began) / 1000)} s; rescue events: ${JSON.stringify(rescueEvents(item))}; controller rules ${JSON.stringify(item.rules)}`);
    assert.equal(item.wave, 6); assert.equal(item.flagship, true);
    assert.equal(item.rules.rescue, true, 'the rule was on for the Pirate Point wave');
    assert.deepEqual(rescueEvents(item), [], 'no rescue on Pirate Point');
    if (['island_lost', 'captains_fallen'].includes(item.ended.reason)) {
      const at = item.ended.reason === 'island_lost' ? item.lastDamage?.tick : item.fell.at(-1)?.tick;
      assert.equal(item.ended.tick, at, 'a lost Pirate Point wave ends at once');
    } else note(`note: the flagship wave ended ${item.ended.reason} (not a rescue reason), so the island_lost exclusion on Pirate Point is covered by tests/pirates/rescue-sim.test.js only`);
  });
  // Back home for the next scenario, whatever P found.
  await host.page.waitForFunction(() => !window.__island.waves?.point?.controller?.wave || window.__island.waves.point.controller.wave.finished, null, {timeout: 600000, polling: 250}).catch(() => {});
  await host.page.evaluate(async () => { await window.__island.world.goTo('home_islet', {fast: true}); });
  await waitOn(host, () => window.__island.world.current?.id === 'home_islet' && !window.__island.world.busy, null, 'back on the home island');
  await host.page.evaluate(() => window.__island.island.ui.close());

  await scenario('C', 'a captain drops mid-rescue: goal and players stay, the other captain finishes it', async note => {
    await setBest(host, BEST);
    let at = null;
    const wave = await playWave([host, ben], {haul: 'good', onRescue: async () => {
      // Half of the haul (5 s of 10), then the friend's tab closes.
      await host.page.waitForFunction(() => (window.__island.waves.island.state?.finisher?.sample ?? 0) >= 70, null, {timeout: 30000, polling: 50});
      at = {host: await rescueState(host), ben: await rescueState(ben)};
      await ben.page.close();
      note(`the friend's tab closed at sample ${at.host.sample}: goal ${at.host.goal}, score ${at.host.score} (friend saw ${at.ben.score}), players ${at.host.players}`);
    }});
    const a = await recOf(host, wave.waveId);
    const start = a.key.find(e => e.type === 'rescue_started'), decided = rescueEvents(a).find(e => e.type === 'rescue_won' || e.type === 'rescue_failed');
    assert.ok(at, 'the friend dropped during the haul');
    assert.ok(start && decided, `the host's rescue was decided (${types(a)})`);
    assert.deepEqual(at.host.players, start.players, 'the players stay as they were at the start');
    assert.equal(decided.goal, start.goal, 'the goal is unchanged after the drop');
    assert.equal(decided.type === 'rescue_won', decided.score >= decided.goal, 'the outcome follows score ≥ goal');
    frozen(a, note, 'host');
    const sent = await finishesOf(host, wave.waveId);
    note(`host: ${decided.type} ${decided.score}/${decided.goal} (goal at start ${start.goal}); finish ${JSON.stringify(sent)}`);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].rescued === true, decided.type === 'rescue_won', 'the finish follows the outcome');
    const after = await ownIsland(host);
    note(`server: best ${after.waveBest}, nextWave ${after.nextWave}`);
    assert.equal(after.nextWave, decided.type === 'rescue_won' ? BEST - 1 : BEST - 2);
    assert.equal(after.waveBest, BEST);
    pages = pages.filter(captain => captain !== ben);
  });

  const audio = env.errors.filter(text => /AudioContext|audio device/i.test(text));
  const errors = env.errors.filter(text => !/Failed to load resource/.test(text) && !audio.includes(text));
  results.push({id: 'E', name: 'no browser errors', ok: errors.length === 0, lines: errors.slice(0, 5)});
} catch (error) {
  log('\nSTOPPED:', error.message);
  for (const captain of pages) await captain.page.screenshot({path: `${out}/failure-${captain.playerId}.png`}).catch(() => {});
  log('errors:', env.errors);
  results.push({id: 'X', name: 'set-up', ok: false, lines: [error.message.split('\n')[0]]});
} finally { await env.close(); }

log('\nRESULTS');
for (const item of results) { log(`  ${item.ok ? 'PASS' : 'FAIL'}  [${item.id}] ${item.name}`); for (const line of item.lines) log(`          ${line}`); }
const failed = results.filter(entry => !entry.ok);
log(`\ncheck-rescue-mp: ${failed.length ? `FAILED (${failed.map(item => item.id).join(', ')})` : 'OK'}, screenshots in ${out}`);
process.exitCode = failed.length ? 1 : 0;
