// Tower defense v2 around the sim: the run (break, Next wave, auto, lost run), the captain's musket in
// the room, four players in one wave, the v2 renderer and the v2 fake API (TOWER-DEFENSE.md §1, §7, §10, §11).
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createWave } from '../../src/pirates/sim.js';
import { AUTO_KEY, LOST_TITLE, captainTarget, createWaveController } from '../../src/pirates/controller.js';
import { createWaveRenderer, packAtlas } from '../../src/pirates/render.js';
import { readMessage, toMessage } from '../../src/pirates/sync.js';
import { TD_RULES, createFakeIslandApi, createFakeIslandTransport } from '../../src/pirates/fake-api.js';
import { withLevels } from '../../src/pirates/game-wiring.js';
import { ISLANDS, spot, towers, walls } from './balance-fixture.js';

const START = Date.UTC(2026, 10, 11, 12, 0, 0);
const info = (id, wave = 1) => ({ waveId: id, wave, seed: 77, startsAt: new Date(START + 10000).toISOString(), weather: { ships: 1, fog: 0 }, flagship: false });
const STRONG = [...towers([['cannon', 3], ['cannon', 3], ['cannon', 3]]), ...walls(3, 3)];

function harness({ defenses = STRONG, controller = {}, finishWave = vi.fn(async () => ({ loot: 15 })) } = {}) {
  const clock = { now: START }, timers = [], huds = [], bus = { on: () => () => {}, emit() {} };
  const waves = createWaveController({ bus, listen: false, getDefenses: () => defenses, now: () => clock.now, world: { scene: {}, container: {} },
    finishWave, createRenderer: () => ({ events() {}, update() {}, setVisible() {}, dispose() {} }),
    createHud: () => { const hud = { log: [], countdown() {}, bar() {}, prompt() {}, setVisible() {}, dispose() {}, boss(text) { hud.bossText = text || hud.bossText; },
      loot(value) { hud.lootValue = value; }, pause(value) { hud.paused = value; }, banner(title, line) { hud.log.push([title, line]); } }; huds.push(hud); return hud; },
    playCutscene: async () => {}, setTimer: (run, ms) => { const timer = { run, at: clock.now + ms }; timers.push(timer); return timer; },
    clearTimer: timer => { const i = timers.indexOf(timer); if (i >= 0) timers.splice(i, 1); },
    loadAuto: () => false, saveAuto: vi.fn(), ...controller });
  async function advance(ms, step = 100) {
    for (let t = 0; t < ms; t += step) {
      clock.now += step; waves.update(step / 1000);
      for (const timer of timers.filter(item => item.at <= clock.now)) { timers.splice(timers.indexOf(timer), 1); await timer.run(); }
      await Promise.resolve(); await Promise.resolve();
    }
  }
  return { clock, waves, huds, advance, finishWave };
}

describe('the run between waves', () => {
  it('opens a 15-second break after a won wave; Next wave calls the start route and the run keeps its loot', async () => {
    const startNextWave = vi.fn(async () => ({ ok: true }));
    const h = harness({ controller: { startNextWave } });
    h.waves.start(info('w-1'));
    while (!h.waves.inBreak && h.clock.now < START + 200000) await h.advance(500);
    expect(h.waves.inBreak).toBe(true);
    await h.advance(300);
    const hud = h.huds[0];
    expect(hud.paused).toMatchObject({ title: 'Wave 1 won!', ready: true, auto: false });
    expect(hud.paused.seconds).toBeGreaterThan(13);
    expect(h.waves.runLoot).toBe(15);
    expect(hud.lootValue).toBe(15);
    expect(h.waves.next()).toBe(true);
    await h.advance(100);
    expect(startNextWave).toHaveBeenCalledTimes(1);
    expect(startNextWave.mock.calls[0][0]).toMatchObject({ wave: 2 });
    h.waves.start(info('w-2', 2)); // the start route's answer arrives as the next wave
    expect(h.waves.wave.info.waveId).toBe('w-2');
    expect(h.waves.runLoot).toBe(15); // the run goes on
  });

  it('starts the next wave by itself with Auto next wave on, and remembers the switch', async () => {
    const startNextWave = vi.fn(async () => ({ ok: true })), saveAuto = vi.fn();
    const h = harness({ controller: { startNextWave, saveAuto } });
    h.waves.setAuto(true);
    expect(saveAuto).toHaveBeenCalledWith(true);
    h.waves.start(info('w-1'));
    while (!h.waves.inBreak) await h.advance(500);
    await h.advance(14000);
    expect(startNextWave).not.toHaveBeenCalled();
    await h.advance(1500);
    expect(startNextWave).toHaveBeenCalledTimes(1);
    expect(AUTO_KEY).toBe('tgpt:pirates:auto-next');
  });

  it('closes the break when it ends without the switch; a refused start can be tried again', async () => {
    const startNextWave = vi.fn().mockResolvedValueOnce({ ok: false, code: 'wave_running', message: 'A wave is already under way on this island.' });
    const h = harness({ controller: { startNextWave } });
    h.waves.start(info('w-1'));
    while (!h.waves.inBreak) await h.advance(500);
    h.waves.next(); await h.advance(600);
    expect(h.huds[0].paused.line).toBe('A wave is already under way on this island.');
    expect(h.huds[0].paused.ready).toBe(true);
    await h.advance(16000);
    expect(h.waves.wave).toBe(null); // the break is over: ring the bell again
  });

  it('ends the run on a lost wave with a clear result and no break', async () => {
    const startNextWave = vi.fn();
    const h = harness({ defenses: [], controller: { startNextWave } });
    h.waves.start(info('w-lost'));
    await h.advance(140000, 250);
    expect(h.huds[0].log.some(([title, line]) => title === LOST_TITLE && /Rebuild and ring the bell again/.test(line))).toBe(true);
    expect(LOST_TITLE).toBe('The pirates broke through');
    expect(startNextWave).not.toHaveBeenCalled();
    expect(h.waves.wave).toBe(null);
  });

  it('warns of a boss wave', async () => {
    const h = harness({ defenses: ISLANDS.full.defenses });
    h.waves.start({ ...info('w-5', 5), boss: true });
    await h.advance(11000);
    expect(h.huds[0].bossText).toBe('⚠ Boss wave: a warship!');
    expect(h.waves.state.boss).toBe(true);
  });
});

describe('the captain and four players', () => {
  function room() {
    const members = [];
    return { join() {
      const handlers = new Map(), member = { handlers, inbox: [] }; members.push(member);
      return { send(type, payload) { for (const other of members) if (other !== member) other.inbox.push([type, payload]); },
        on(type, fn) { handlers.set(type, fn); return () => handlers.delete(type); } };
    }, deliver() { for (const member of members) for (const [type, payload] of member.inbox.splice(0)) member.handlers.get(type)?.(payload); } };
  }

  it('fires the musket at the nearest ship in range, synced as captain_shot', () => {
    const message = toMessage({ type: 'captain_shot', by: 'a', targetId: 'ship_2', level: 3, x: 4.5, z: -2 }, { by: 'a', seq: 1, tick: 20, waveId: 'w' });
    expect(message).toEqual({ type: 'captain_shot', payload: { by: 'a', seq: 1, t: 1, waveId: 'w', targetId: 'ship_2', level: 3, x: 4.5, z: -2 } });
    expect(readMessage(message.type, message.payload, 'w')).toMatchObject({ input: { type: 'captain_shot', by: 'a', level: 3 } });
    expect(readMessage(message.type, { ...message.payload, level: 9 }, 'w')).toBe(null);
    expect(readMessage(message.type, { ...message.payload, x: 'x' }, 'w')).toBe(null);
    const state = { ships: [{ id: 'near', x: 10, z: 0 }, { id: 'far', x: 30, z: 0 }] };
    expect(captainTarget({ x: 0, z: 0 }, state, 1)?.id).toBe('near');
    expect(captainTarget({ x: -10, z: 0 }, state, 1)).toBe(null);
    expect(captainTarget({ x: -10, z: 0 }, state, 5)?.id).toBe('near');
  });

  it('keeps four friends identical with cannon shots, repairs and captain shots from all of them', async () => {
    const shared = room(), logs = [[], [], [], []];
    const players = ['anna', 'ben', 'cleo', 'dan'].map((id, i) => {
      const position = { x: 17, z: -1.5 + i }; // on the east beach, by the east sea lane
      const h = harness({ defenses: [spot('cannon_2', 'cannon', -45, .75), ...walls(3)], controller: { room: shared.join(), playerId: id,
        world: { scene: {}, container: {}, player: { position } }, captainLevel: () => [5, 4, 5, 3][i], onEvents: list => logs[i].push(...list) } });
      return { h, position };
    });
    for (const { h } of players) h.waves.start(info('w-4', 3));
    let shots = 0;
    for (let step = 0; step < 1800 && players.some(({ h }) => h.waves.wave && !h.waves.wave.done); step++) {
      for (const { h } of players) { h.clock.now += 100; h.waves.update(.1); }
      players.forEach(({ h }, i) => {
        if (step % 8 === i * 2 && h.waves.shoot()) shots++;
        const hurt = h.waves.state?.walls?.find(wall => wall.hp < wall.maxHp && !wall.repairing);
        if (i === 2 && hurt) h.waves.repair(hurt.id);
      });
      if (step % 9 === 0 && players[1].h.waves.state?.ships?.[0]) players[1].h.waves.fire('cannon_2', players[1].h.waves.state.ships[0].id);
      shared.deliver();
      await Promise.resolve();
    }
    expect(shots).toBeGreaterThan(4);
    const fired = new Set(logs[0].filter(event => event.type === 'captain_fired').map(event => event.by));
    expect(fired.size).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < 4; i++) expect(logs[i]).toEqual(logs[0]);
    expect(logs[0].find(event => event.type === 'wave_ended')).toBeTruthy();
  });
});

describe('the v2 renderer', () => {
  it('draws mortars, warships, levels, crew and the musket in the same few layers and leaves nothing behind', () => {
    const scene = new THREE.Scene(), defenses = [...ISLANDS.full.defenses];
    const renderer = createWaveRenderer({ scene, atlas: { texture: new THREE.Texture(), ...packAtlas() }, defenses, fx: () => null });
    const posts = defenses.filter(item => item.kind !== 'house').length;
    expect(renderer.root.children.length).toBe(3 + posts + 1);
    const sim = createWave({ seed: 3, wave: 10, weather: { ships: 2 }, ...ISLANDS.full, crew: { gunner: 2, carpenter: 2, lookout: 1 } });
    const peak = { instances: 0, shells: 0, bursts: 0 };
    let time = 0, tick = 0;
    while (!sim.done) {
      const target = sim.state().ships[0];
      const inputs = target && tick++ % 30 === 0 ? [{ type: 'captain_shot', by: 'me', targetId: target.id, level: 5, x: target.x * .8, z: target.z * .8 }] : [];
      renderer.events(sim.step(1 / 30, inputs)); time += 1 / 30;
      renderer.update({ state: sim.state(), simTime: time, dt: 1 / 30, captain: { x: 10, z: 5, share: .5 } });
      const stats = renderer.stats();
      for (const key of Object.keys(peak)) peak[key] = Math.max(peak[key], stats[key]);
    }
    expect(peak.shells).toBeGreaterThan(0); expect(peak.bursts).toBeGreaterThan(0);
    expect(peak.instances).toBeLessThan(320);
    for (let i = 0; i < 400; i++) renderer.update({ state: sim.state(), simTime: time += 1 / 30, dt: 1 / 30 });
    expect(renderer.stats()).toMatchObject({ balls: 0, shells: 0, bursts: 0, tracers: 0, splashes: 0, sinkers: 0 });
    renderer.dispose();
    expect(scene.children.length).toBe(0);
  });
});

describe('the v2 fake API', () => {
  const clock = () => { let now = START; return { now: () => now, advance: s => { now += s * 1000; } }; };
  it('answers levels, prices, crew, captain and unlocks, and upgrades, hires and refuses like §7', async () => {
    const api = createFakeIslandApi({ version: 2 });
    const island = await api.island();
    expect(island.spots).toHaveLength(16);
    expect(island.spots.find(item => item.id === 'tower_s5')).toMatchObject({ kinds: ['cannon', 'mortar'], level: 0, built: false });
    expect(island).toMatchObject({ crew: { gunner: 0, carpenter: 0, lookout: 0 }, nextWave: 1, captain: { level: 1, nextPrice: 20 },
      prices: { build: { mortar: 60 }, upgrade: { cannon: [60, 120] }, crew: { gunner: 40 } } });
    const code = async promise => { try { await promise; } catch (error) { return error.code; } return 'ok'; };
    expect(await code(api.build({ spot: 'tower_s5', kind: 'mortar', actionUid: 'b1' }))).toBe('locked'); // after wave 3
    expect(await code(api.build({ spot: 'wall_5', kind: 'mortar', actionUid: 'b2' }))).toBe('wrong_kind');
    expect((await api.build({ spot: 'cannon_1', kind: 'cannon', actionUid: 'b3' })).coins).toBe(70);
    expect(await code(api.upgrade({ spot: 'cannon_1', actionUid: 'u1' }))).toBe('locked'); // level 2 after wave 2
    expect(await code(api.upgrade({ spot: 'wall_1', actionUid: 'u2' }))).toBe('not_built');
    expect(await code(api.hire({ crew: 'gunner', actionUid: 'h1' }))).toBe('locked');
    const world = api; void world;
  });

  it('runs waves to 100 with boss flags, double boss loot and the restart rule, plus Pirate Point builds and invites', async () => {
    const time = clock(), transport = createFakeIslandTransport({ now: time.now, version: 2, coins: 2000 });
    const api = transport.api;
    transport.dev.setWaveBest(8);
    const pay = async survived => {
      const wave = await api.startWave({ where: 'own', actionUid: `s${Math.random().toString(36).slice(2, 10)}` });
      time.advance(40);
      return { wave, done: await api.finishWave({ waveId: wave.waveId, survived, shipsSunk: 3 }) };
    };
    const ninth = await pay(true);
    expect(ninth.wave).toMatchObject({ wave: 9, boss: false });
    const tenth = await pay(true);
    expect(tenth.wave).toMatchObject({ wave: 10, boss: true });
    expect(tenth.done.loot).toBe((10 + 5 * 10) * 2);
    const lost = await pay(false);
    expect(lost.wave.wave).toBe(11); expect(lost.done.loot).toBe(0);
    expect((await api.island()).nextWave).toBe(8); // best 10 − 2
    // Everything is unlocked now: upgrade, mortar, crew, captain.
    await api.build({ spot: 'tower_s5', kind: 'mortar', actionUid: 'm1' });
    expect((await api.upgrade({ spot: 'tower_s5', actionUid: 'm2' })).spots.find(item => item.id === 'tower_s5')).toMatchObject({ kind: 'mortar', level: 2, upgradeCost: 240 });
    await api.upgrade({ spot: 'tower_s5', actionUid: 'm3' });
    await expect(api.upgrade({ spot: 'tower_s5', actionUid: 'm4' })).rejects.toMatchObject({ code: 'max_level' });
    await api.hire({ crew: 'lookout', actionUid: 'l1' });
    await expect(api.hire({ crew: 'lookout', actionUid: 'l2' })).rejects.toMatchObject({ code: 'crew_full' });
    expect((await api.captain({ actionUid: 'c1' })).captain).toEqual({ level: 2, nextPrice: 40 });
    const point = await api.piratePointBuild({ spot: 'pp_tower_1', kind: 'mortar', actionUid: 'p1' });
    expect(point.spots.find(item => item.id === 'pp_tower_1')).toMatchObject({ kind: 'mortar', level: 1, built: true });
    expect((await api.piratePointUpgrade({ spot: 'pp_tower_1', actionUid: 'p2' })).spots[4].level).toBe(2);
    expect(await api.inviteJoin({ code: 'ISLE-FR3ND', actionUid: 'i1' })).toEqual({ admitted: true, island: { code: 'ISLE-FR3ND', ownerName: 'Captain Gull' } });
    await expect(api.inviteJoin({ code: 'ISLE-ZZZZZ', actionUid: 'i2' })).rejects.toMatchObject({ code: 'no_such_island' });
    // The transport answers the same routes like online/api.js.
    expect(await transport.post('/api/island/hire', { crew: 'gunner', actionUid: 'hire-0001' })).toMatchObject({ ok: true, data: { crew: { gunner: 1 } } });
    expect(await transport.get('/api/pirate-point')).toMatchObject({ ok: true, data: { spots: expect.any(Array) } });
    expect(TD_RULES.highestWave).toBe(100);
    // Levels reach the sim through the wiring even when the island lane leaves them out.
    expect(withLevels([{ id: 'tower_s5', kind: 'mortar', x: 1, z: 2 }], await api.island())).toEqual([{ id: 'tower_s5', kind: 'mortar', x: 1, z: 2, level: 3 }]);
  });
});
