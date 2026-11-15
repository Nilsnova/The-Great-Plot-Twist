// Release check for the wave rules tower_health (T33, D049) and pathing (T34/T35, D040) with two captains on one
// island, without live accounts: headless Chrome, one browser context, the fake server shared by both tabs
// (?islands=fake&fakeworld=…, fake-api.js) with both flags on (&fakeflags=tower_health,pathing), so every wave
// answer carries rules: ['tower_health', 'pathing', 'tower_obstacles'] as the server's would, and the BroadcastChannel room.
// The host moves three cannons next to the heart, where the boarders walk past them. Scenarios, each PASS or FAIL:
//   1 rules    both tabs' controllers start the wave with towerHealth and pathing on; every cannon has hp
//   2 E        a captain stands at a damaged tower and presses E: it is repaired (tower_repaired) in both tabs; a
//              broken one is rebuilt with E once ready (tower_rebuilt) in both tabs
//   3 lockstep both tabs' sims agree tick for tick (tower hp, every boarder's position and state, the heart) and
//              have the same tower_damaged / tower_broken / tower_repaired / tower_rebuilt events
//   4 flip     a flag switched while a wave runs (pathing off, tower_health stays on) does not change the wave's
//              rules for a late joiner: join and current answer the kept set
//   K known server limit (wave_rules.py), reported on its own and not failing the run: a wave that started with
//              every rule flag off and a flag switched on mid-wave gives a late joiner rules the others do not play
//   E no browser errors
//   node scripts/check-rules-mp.js [folder]        (npm run test:rules)
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openWorldBrowser, settle} from './world-browser-tools.js';
import {stubOfflineApi} from './api-browser-fixture.js';
import {stubWeather} from './weather-browser-fixture.js';

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const out = process.argv[2] ?? join(tmpdir(), 'tgpt-rules', stamp);
await mkdir(out, {recursive: true});
const WORLD = `rules${Date.now().toString(36)}`;
const CODE = 'ISLE-K7Q2M';
const FLAGS = 'tower_health,pathing,tower_obstacles';
// Three cannons right by the heart (0, 2; its keep-out is 4 x 4), on the boarders' way in, and the shore walls.
const BEST = 14; // wave 15 against four level-1 cannons: boarders reach the heart and hack the cannons by it
const NEAR_HEART = {cannon_1: {x: 3, z: 2}, cannon_2: {x: -3, z: 2}, cannon_3: {x: 0, z: 6}};
const env = await openWorldBrowser({hmr: false}), context = env.page.context();
const pages = [];
const log = (...args) => console.log(...args);
const results = [];

async function openCaptain(name, playerId, {join = null} = {}) {
  const page = pages.length ? await context.newPage() : env.page, first = !pages.length;
  if (!first) {
    await stubOfflineApi(page); await stubWeather(page);
    page.on('pageerror', error => env.errors.push(`${name}: ${error.message}`));
    page.on('console', message => { if (message.type() === 'error') env.errors.push(`${name}: ${message.text()}`); });
  }
  await page.setViewportSize({width: 960, height: 600});
  await page.goto(`${env.url}/?islands=fake&fakeworld=${WORLD}&fakeplayer=${playerId}&fakename=${encodeURIComponent(name)}&fakeflags=${FLAGS}`);
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
      await page.waitForTimeout(400);
      if (join) { await page.locator('.games-card[open] .games-code').fill(join); await page.locator('.games-card[open]').getByRole('button', {name: 'Join', exact: true}).click(); }
      else await page.locator('.games-card[open]').getByRole('button', {name: 'Create a game', exact: true}).click();
    }
    else if (await page.locator('.goal-card[open]').count()) await page.locator('.goal-card[open]').getByRole('button', {name: 'Got it', exact: true}).click();
    else if (await page.locator('dialog.cutscene[open],.tutorial-card[open]').count()) await page.getByRole('button', {name: 'Skip', exact: true}).click({timeout: 5000}).catch(() => {});
    await page.waitForTimeout(300);
  }
  await page.waitForFunction(joined => window.__island.waves && (!joined || window.__island.island.visiting?.ownerName), !!join, {timeout: 30000});
  // Every wave this page's controller starts: its rules, and a digest of the sim after every tick it steps.
  await page.evaluate(() => {
    const g = window.__island; g.settings.hour = 12;
    window.__rules = {starts: [], ticks: {}, events: {}};
    g.on('wave_controller_started', event => {
      const w = g.waves?.island.wave;
      if (event.flagship || !w) return;
      const ticks = window.__rules.ticks[event.waveId] = {}, events = window.__rules.events[event.waveId] = [];
      window.__rules.starts.push({waveId: event.waveId, wave: event.wave, rules: {...w.info.rules},
        towers: w.state.towers.map(tower => ({id: tower.id, kind: tower.kind, hp: tower.hp ?? null, maxHp: tower.maxHp ?? null}))});
      const step = w.sim.step.bind(w.sim);
      w.sim.step = (dt, inputs) => {
        const tick = w.ticks, out = step(dt, inputs), s = w.sim.state();
        ticks[tick] = JSON.stringify([s.islandHp, s.towers.map(t => [t.id, t.hp, t.broken ? 1 : 0]),
          s.boarders.map(b => [b.id, b.x, b.z, b.state, b.wallId ?? '', b.towerId ?? '']), s.walls.map(x => x.hp)]);
        for (const e of out) if (/^tower_(damaged|broken|repaired|rebuilt)$/.test(e.type)) events.push(`${tick}:${e.type}:${e.towerId}:${e.hp ?? ''}`);
        return out;
      };
    });
  });
  log(`${name} is in the lobby (${playerId})`);
  return captain;
}
const island = (captain, fn, arg) => captain.page.evaluate(([source, arg]) => (0, eval)(source)(window.__island.island, arg), [String(fn), arg]);
const waveOf = captain => captain.page.evaluate(() => { const w = window.__island.waves?.island.wave;
  return w ? {waveId: w.info.waveId, wave: w.info.wave, done: w.done, ticks: w.ticks, phase: w.state.phase,
    towers: w.state.towers.map(t => ({id: t.id, x: t.x, z: t.z, hp: t.hp, maxHp: t.maxHp, broken: t.broken, rebuildReady: t.rebuildReady, repairing: t.repairing}))} : null; });
async function until(captain, test, what, timeout = 240000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const state = await waveOf(captain); if (test(state)) return state; await captain.page.waitForTimeout(200); }
  throw new Error(`${captain.name}: timed out waiting for ${what}`);
}
async function scenario(id, name, fn, {pending = false} = {}) {
  const lines = [];
  log(`\n[${id}] ${name}`);
  try { await fn(line => { lines.push(line); log(`  ${line}`); }); results.push({id, name, ok: true, pending, lines}); }
  catch (error) { lines.push(`FAILED: ${error.message.split('\n')[0]}`); log(`  FAILED: ${error.message}`); results.push({id, name, ok: false, pending, lines}); }
}
async function ring(host, ben, {best = BEST} = {}) {
  await island(host, async (i, best) => { i.dev.setWaveBest(best); await i.load(); }, best);
  let rung = null;
  for (let i = 0; i < 60; i++) { // the last wave closes on the server once its finishes are in
    rung = await island(host, async i => { const answer = await i.ringBell(); return {ok: answer.ok, code: answer.code ?? null}; });
    if (rung.ok || rung.code !== 'wave_running') break;
    await host.page.waitForTimeout(500);
  }
  assert.ok(rung.ok, `the host rang the bell (${JSON.stringify(rung)})`);
  const first = await until(host, state => state && !state.done && state.ticks >= 0, 'the wave on the host');
  await until(ben, state => state?.waveId === first.waveId, 'the friend in the same wave', 60000);
  return first;
}
const waveOver = async waveId => { for (const captain of pages) await until(captain, state => !state || state.waveId !== waveId || state.done, `the end of ${waveId}`); };
// Stand next to a tower (on the side away from the heart) and press E.
async function pressE(captain, tower) {
  await captain.page.bringToFront(); // a tab in the background draws no frames, and the frame finds the E action
  await captain.page.evaluate(([x, z]) => { const g = window.__island; g.player.position.set(x, g.world.current.groundHeight?.(x, z) ?? 1.03, z); }, [tower.x + Math.sign(tower.x || 1) * 1.6, tower.z + (tower.x ? 0 : 1.6)]);
  await captain.page.waitForTimeout(400); // the controller reads the new position and finds the action
  const action = await captain.page.evaluate(() => { document.activeElement?.blur?.(); const a = window.__island.waves?.island.wave?.action; return a ? `${a.kind} ${a.wallId ?? ''}` : null; });
  await captain.page.keyboard.press('KeyE');
  return action;
}
// Both captains wait on the hill north of the heart, out of the boarders' way, so the boarders reach the towers.
const toHill = captain => captain.page.evaluate(() => { const g = window.__island; g.player.position.set(-2, g.world.current.groundHeight?.(-2, -11) ?? 1.03, -11); });
const eventsOf = (captain, waveId) => captain.page.evaluate(id => window.__rules.events[id] ?? [], waveId);

let host = null, ben = null, first = null, played = null;
try {
  host = await openCaptain('Nils', 'me');
  assert.equal(await island(host, i => i.island.code), CODE);
  ben = await openCaptain('Ben', 'ben', {join: 'k7q2m'});
  for (const captain of pages) {
    await captain.page.waitForFunction(() => [...document.querySelectorAll('.island-card-lobby[open] .island-lobby-player.is-online')].length === 2, null, {timeout: 30000, polling: 250});
  }
  await host.page.locator('.island-card-lobby[open] .island-lobby-start').click();
  for (const captain of pages) await captain.page.waitForFunction(() => window.__island.island.ui.open !== 'lobby', null, {timeout: 15000, polling: 100});
  const moved = await island(host, async (i, near) => {
    i.dev.setCoins(5000); i.dev.setWaveBest(7); await i.load();
    for (const id of ['wall_1', 'wall_2', 'wall_3', 'wall_4', 'wall_5', 'wall_6']) await i.build(id, 'wall');
    for (const id of ['cannon_1', 'cannon_2', 'cannon_3', 'cannon_4']) await i.build(id, 'cannon');
    const answers = {};
    for (const [spot, at] of Object.entries(near)) { const a = await i.api.move({spot, x: at.x, z: at.z}); answers[spot] = a.ok ? 'ok' : a.code; }
    await i.load();
    return answers;
  }, NEAR_HEART);
  log(`cannons moved next to the heart: ${JSON.stringify(moved)}`);
  await island(ben, async i => { await i.load(); });
  await ben.page.waitForFunction(() => window.__island.island.visiting?.spots?.find(spot => spot.id === 'cannon_3')?.built, null, {timeout: 10000, polling: 100});
  first = await ring(host, ben);

  await scenario('1', 'both tabs start the wave with rules tower_health and pathing; every cannon has hp', async note => {
    const starts = await Promise.all(pages.map(captain => captain.page.evaluate(id => window.__rules.starts.find(item => item.waveId === id), first.waveId)));
    for (const [i, start] of starts.entries()) {
      assert.ok(start, `${pages[i].name}'s controller started ${first.waveId}`);
      assert.equal(start.rules.towerHealth, true, `${pages[i].name}: towerHealth`);
      assert.equal(start.rules.pathing, true, `${pages[i].name}: pathing`);
      assert.equal(start.rules.towerObstacles, true, `${pages[i].name}: towerObstacles`);
      assert.ok(start.towers.filter(t => t.kind === 'cannon').every(t => t.maxHp > 0), `${pages[i].name}: cannons have hp ${JSON.stringify(start.towers)}`);
    }
    assert.deepEqual(starts[1].towers, starts[0].towers, 'the same towers and hp in both tabs');
    note(`wave ${first.wave} (${first.waveId}): rules ${JSON.stringify(starts[0].rules)}; towers ${starts[0].towers.map(t => `${t.id} ${t.hp}/${t.maxHp}`).join(', ')}`);
  });

  await scenario('2', 'E at a damaged tower repairs it, E at a broken one rebuilds it, in both tabs', async note => {
    let repaired = false, rebuilt = false, sawBroken = false;
    for (let attempt = 1; attempt <= 3 && !repaired; attempt++) {
    if (attempt > 1) { await waveOver(first.waveId); first = await ring(host, ben); }
    played = first; repaired = false; rebuilt = false; sawBroken = false;
    for (const captain of pages) await toHill(captain);
    const end = Date.now() + 200000;
    while (Date.now() < end && !(repaired && (rebuilt || !sawBroken))) {
      const state = await waveOf(host);
      if (!state || state.done || state.waveId !== first.waveId) break;
      const broken = state.towers.find(t => t.maxHp > 0 && t.broken && t.rebuildReady);
      const damaged = state.towers.find(t => t.maxHp > 0 && !t.broken && t.hp < t.maxHp && !t.repairing);
      if (state.towers.some(t => t.broken)) sawBroken = true;
      if (!rebuilt && broken) {
        await pressE(host, broken);
        const ok = await host.page.waitForFunction(([id, tower]) => (window.__rules.events[id] ?? []).some(e => e.includes(`:tower_rebuilt:${tower}:`)), [first.waveId, broken.id], {timeout: 4000, polling: 100}).then(() => true, () => false);
        if (ok) { rebuilt = true; note(`host pressed E at broken ${broken.id}: tower_rebuilt`); }
        await toHill(host);
      } else if (!repaired && damaged) {
        const action = await pressE(host, damaged);
        const ok = await host.page.waitForFunction(([id, tower]) => (window.__rules.events[id] ?? []).some(e => e.includes(`:tower_repaired:${tower}:`)), [first.waveId, damaged.id], {timeout: 5000, polling: 100}).then(() => true, () => false);
        if (ok) { repaired = true; note(`host pressed E at ${damaged.id} (hp ${damaged.hp}/${damaged.maxHp}, prompt "${action}"): tower_repaired`); }
        else note(`E at ${damaged.id} (hp ${damaged.hp}/${damaged.maxHp}) gave no repair; the prompt was "${action}"`);
        await toHill(host);
      }
      await host.page.waitForTimeout(150);
    }
    note(`attempt ${attempt}: wave ${first.wave} (${first.waveId}), repaired ${repaired}, broken seen ${sawBroken}, rebuilt ${rebuilt}`);
    }
    assert.ok(repaired, 'a damaged tower was repaired with E');
    if (!sawBroken) note('note: no tower broke in this wave, so a rebuild was not seen');
    else assert.ok(rebuilt, 'a broken tower was rebuilt with E');
    const theirs = await eventsOf(ben, first.waveId);
    assert.ok(theirs.some(e => e.includes(':tower_repaired:')), 'the friend\'s sim repaired it too');
    if (rebuilt) assert.ok(theirs.some(e => e.includes(':tower_rebuilt:')), 'the friend\'s sim rebuilt it too');
    note(`friend's sim: ${theirs.filter(e => /repaired|rebuilt/.test(e)).join(', ')}`);
    await settle(host.page); await host.page.screenshot({path: `${out}/02-towers-host.png`}); await ben.page.screenshot({path: `${out}/02-towers-ben.png`});
  });

  await scenario('3', 'both sims agree tick for tick: tower hp, broken towers, boarder paths, the heart', async note => {
    const wave = played ?? first;
    await waveOver(wave.waveId);
    const [a, b] = await Promise.all(pages.map(captain => captain.page.evaluate(id => window.__rules.ticks[id], wave.waveId)));
    const shared = Object.keys(a).filter(tick => tick in b).map(Number).sort((x, y) => x - y);
    assert.ok(shared.length > 200, `enough shared ticks (${shared.length})`);
    const differ = shared.find(tick => a[tick] !== b[tick]);
    assert.equal(differ, undefined, `tick ${differ}: host ${a[differ]?.slice(0, 300)} / friend ${b[differ]?.slice(0, 300)}`);
    const [ea, eb] = [await eventsOf(host, wave.waveId), await eventsOf(ben, wave.waveId)];
    assert.deepEqual(eb, ea, 'the same tower events');
    const count = type => ea.filter(e => e.includes(`:${type}:`)).length;
    const boarders = JSON.parse(a[shared[Math.floor(shared.length / 2)]])[2].length;
    note(`${shared.length} ticks compared (${shared[0]}…${shared[shared.length - 1]}), all equal; tower events in both: damaged ${count('tower_damaged')}, broken ${count('tower_broken')}, repaired ${count('tower_repaired')}, rebuilt ${count('tower_rebuilt')}; ${boarders} boarders mid-wave`);
  });

  await scenario('4', 'a flag switched mid-wave does not change the wave\'s rules for a late joiner', async note => {
    const wave = await ring(host, ben);
    await island(host, async i => { await i.dev.setFlag('pathing', false); });
    const answers = await island(ben, async (i, waveId) => { const j = await i.api.joinWave({waveId}); const c = await i.api.currentWave({where: 'ISLE-K7Q2M'});
      return {join: j.data?.rules ?? j.rules ?? null, current: c?.data?.rules ?? c?.rules ?? null, ok: j.ok}; }, wave.waveId);
    note(`wave ${wave.wave} (${wave.waveId}) started with both flags; pathing switched off mid-wave; late join answers ${JSON.stringify(answers)}`);
    assert.deepEqual(answers.join, ['tower_health', 'pathing', 'tower_obstacles'], 'join answers the kept set');
    assert.deepEqual(answers.current, ['tower_health', 'pathing', 'tower_obstacles'], 'current answers the kept set');
    await island(host, async i => { await i.dev.setFlag('pathing', true); });
    await waveOver(wave.waveId);
  });

  await scenario('K', 'known server limit: a wave started with every rule flag off, a flag switched on mid-wave', async note => {
    await island(host, async i => { await i.dev.setFlag('pathing', false); await i.dev.setFlag('tower_health', false); });
    const wave = await ring(host, ben);
    await island(host, async i => { await i.dev.setFlag('pathing', true); await i.dev.setFlag('tower_health', true); });
    const answer = await island(ben, async (i, waveId) => { const j = await i.api.joinWave({waveId}); return j.data?.rules ?? j.rules ?? null; }, wave.waveId);
    note(`wave ${wave.wave} started with no rules; flags switched on mid-wave; a late join answers rules ${JSON.stringify(answer)}`);
    await waveOver(wave.waveId);
    assert.equal(answer, null, 'the late joiner gets no rules (the wave started without any)');
  }, {pending: true});

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
log('KNOWN LIMIT (reported, does not fail the run)');
for (const item of results.filter(entry => entry.pending)) {
  log(`  ${item.ok ? 'PASS' : 'FAIL (known limit)'}  [${item.id}] ${item.name}`); for (const line of item.lines) log(`          ${line}`);
}
const failed = results.filter(entry => !entry.pending && !entry.ok);
log(`\ncheck-rules-mp: ${failed.length ? `FAILED (${failed.map(item => item.id).join(', ')})` : 'OK'}, screenshots in ${out}`);
process.exitCode = failed.length ? 1 : 0;
