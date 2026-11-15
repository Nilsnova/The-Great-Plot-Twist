// Hireable guards and captain melee (decision D052, Nils' playtest 15 Nov: "once the pirates board the base it is
// quite overwhelming"). Guards are a crew kind: the island's hired count from the server at the wave start puts that
// many guards at posts around the heart; they fight boarders like a Barracks militia and can fall. The captain's
// cutlass: F, the button or a tap on a boarder swings at the nearest boarder in reach, and with no attack of yours
// for a second your captain swings by themself, slower. Both go through the same inputs, so every sim agrees.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONFIG, createWave, curveFor } from '../../src/pirates/sim.js';
import { AUTO_BLADE, createWaveController } from '../../src/pirates/controller.js';
import { CREW, CREW_IDS, readUnlocks } from '../../src/island/td-rules.js';
import { CREW_IDS as API_CREW_IDS } from '../../src/island/api.js';
import { crewModel } from '../../src/island/card-model.js';
import { readCrewParam } from '../../src/pirates/dev-harness.js';
import { createFakeIslandApi, createFakeWorld } from '../../src/pirates/fake-api.js';
import { ISLANDS } from './balance-fixture.js';

const GU = CONFIG.crew.guard;
const EAST = [{ id: 'east', bearing: 0 }];
const root = new URL('../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const run = (wave, until, inputs = () => [], limit = 12000) => {
  const all = [];
  for (let i = 0; i < limit && !wave.done; i++) {
    const step = wave.step(CONFIG.tick, inputs(i * CONFIG.tick, wave));
    all.push(...step);
    if (until?.(step, wave)) break;
  }
  return all;
};
const guardsOf = wave => wave.state().militia.filter(unit => unit.guard);
const fingerprint = wave => { const lines = []; for (let i = 0; i < 20000 && !wave.done; i++) lines.push(JSON.stringify(wave.step(.25, []))); return createHash('sha256').update(lines.join('\n')).digest('hex'); };

describe('guards: the data', () => {
  it('is a fourth crew kind: 60 coins, at most 3, the same on the server, the campaign and the migration', () => {
    expect(CREW_IDS).toEqual(['gunner', 'carpenter', 'lookout', 'guard']);
    expect(API_CREW_IDS).toEqual(CREW_IDS);
    expect(CREW.guard).toMatchObject({ name: 'Guard', price: 60, max: 3 });
    expect(GU.max).toBe(CREW.guard.max);
    const islands = JSON.parse(read('backend/content/islands.json'));
    expect(islands.crew.find(item => item.crew === 'guard')).toEqual({ crew: 'guard', name: 'Guard', coins: 60, max: 3 });
    for (const path of ['backend/content/campaign.json', 'frontend/src/campaign/campaign.json']) {
      expect(JSON.parse(read(path)).steps.find(step => step.wave === 6).opens).toContain('crew:guard');
    }
    expect(read('backend/server/island/catalogue.py')).toContain('CREW_KINDS = ("gunner", "carpenter", "lookout", "guard")');
    const sql = read('supabase/migrations/20261115140000_guard_crew.sql');
    expect(sql).toContain("p_crew not in ('gunner', 'carpenter', 'lookout', 'guard')");
    expect(sql).toContain('crew_guard between 0 and 10');
  });

  it('shows in the crew card after wave 6 like every crew member', () => {
    const locked = crewModel({ crew: {}, coins: 100, unlocks: readUnlocks({ unlocks: { wave: 5 } }) });
    expect(locked.rows.map(row => row.id)).not.toContain('guard');
    expect(locked.soon).toContain('Guard');
    const open = crewModel({ crew: { guard: 1 }, coins: 100, unlocks: readUnlocks({ unlocks: { wave: 6 } }) });
    expect(open.rows.find(row => row.id === 'guard')).toMatchObject({ name: 'Guard', owned: '1 of 3', button: 'Hire', disabled: false });
    const poor = crewModel({ crew: {}, coins: 20, unlocks: readUnlocks({ unlocks: { wave: 6 } }) });
    expect(poor.rows.find(row => row.id === 'guard').disabled).toBe(true);
    expect(readCrewParam('guard3,gunner')).toEqual({ gunner: 1, carpenter: 0, lookout: 0, guard: 3 });
  });

  it('is hired on the fake server: paid, up to 3, refused without coins', async () => {
    const world = createFakeWorld();
    const api = createFakeIslandApi({ world, unlocking: false });
    let island = await api.island();
    const player = world.players.get('me');
    player.coins = 200;
    for (let i = 1; i <= 3; i++) island = await api.hire({ crew: 'guard', actionUid: `guard-hire-${i}` });
    expect(island.crew.guard).toBe(3);
    expect(player.coins).toBe(200 - 3 * 60);
    await expect(api.hire({ crew: 'guard', actionUid: 'guard-hire-4' })).rejects.toMatchObject({ code: 'crew_full' });
    const poor = createFakeIslandApi({ world: createFakeWorld(), unlocking: false });
    await poor.island();
    await expect(poor.hire({ crew: 'guard', actionUid: 'guard-hire-9' })).resolves.toBeTruthy(); // 100 starting coins
    await expect(poor.hire({ crew: 'guard', actionUid: 'guard-hire-8' })).rejects.toMatchObject({ code: 'insufficient_funds' });
  });
});

describe('guards: the sim', () => {
  it('spawns as many guards as the crew holds (at most 3) at their posts around the heart, from the first tick', () => {
    const none = createWave({ seed: 3, wave: 10, lanes: EAST });
    none.step(CONFIG.tick);
    expect(none.state().militia).toEqual([]);
    expect(none.state().crew).toEqual({ gunner: 0, carpenter: 0, lookout: 0 }); // no guard key: old waves keep their state
    for (const [asked, got] of [[1, 1], [3, 3], [7, 3], [-1, 0], [1.5, 0], ['3', 0]]) {
      const wave = createWave({ seed: 3, wave: 10, lanes: EAST, crew: { guard: asked } });
      const events = wave.step(CONFIG.tick);
      expect(guardsOf(wave), String(asked)).toHaveLength(got);
      expect(events.filter(event => event.type === 'militia_out' && event.guard)).toHaveLength(got);
    }
    const wave = createWave({ seed: 3, wave: 10, lanes: EAST, crew: { guard: 3 }, heart: { x: 1, z: 2, ring: 12 } });
    wave.step(CONFIG.tick);
    const hp = Math.round(GU.hp * curveFor(10).damage); // tough against the blows of the wave, like a captain
    expect(guardsOf(wave).map(unit => unit.id)).toEqual(['guard_1', 'guard_2', 'guard_3']);
    for (const unit of guardsOf(wave)) {
      expect(Math.hypot(unit.x - 1, unit.z - 2)).toBeCloseTo(GU.post, 1);
      expect(unit).toMatchObject({ hp, maxHp: hp, houseId: null, state: 'idle' });
    }
  });

  it('keeps a Barracks militia as it was: militia first (militia_1, ...), the guards after them', () => {
    const barracks = { id: 'house_1', kind: 'house', level: 3, x: 7, z: -6, spec: 'barracks' };
    const wave = createWave({ seed: 3, wave: 10, lanes: EAST, defenses: [barracks], crew: { guard: 2 } });
    wave.step(CONFIG.tick);
    expect(wave.state().militia.map(unit => unit.id)).toEqual(['militia_1', 'militia_2', 'guard_1', 'guard_2']);
  });

  it('fights the boarders that come near the heart, and a guard can fall (back next wave)', () => {
    const options = { seed: 11, wave: 40, ...ISLANDS.small, crew: { guard: 3 }, island: { hp: 5000 } };
    const wave = createWave(options);
    const events = run(wave, () => false);
    const blows = events.filter(event => event.type === 'militia_struck' && event.militiaId.startsWith('guard_'));
    expect(blows.length).toBeGreaterThan(0);
    for (const blow of blows) expect(Math.hypot(blow.toX - blow.x, blow.toZ - blow.z)).toBeLessThanOrEqual(GU.reach + .5);
    expect(blows[0].damage).toBe(Math.round(GU.damage * curveFor(40).hp * 100) / 100);
    expect(events.some(event => event.type === 'boarder_down' || event.type === 'boarder_killed' || event.type === 'boarder_hit')).toBe(true);
    const fell = events.filter(event => event.type === 'militia_fell' && event.guard);
    expect(fell.length).toBeGreaterThan(0);
    expect(fell[0]).toMatchObject({ houseId: null, guard: true });
    // The next wave starts with all three again: the hire is kept.
    const next = createWave({ ...options, wave: 41 });
    next.step(CONFIG.tick);
    expect(guardsOf(next)).toHaveLength(3);
  });

  it('makes the wave play out differently with guards, the same on every screen for the same seed and crew', () => {
    const options = { seed: 7919, wave: 30, countdown: 0, ...ISLANDS.full };
    const withGuards = { ...options, crew: { ...options.crew, guard: 3 } };
    expect(fingerprint(createWave(withGuards))).toBe(fingerprint(createWave(withGuards)));
    expect(fingerprint(createWave(withGuards))).not.toBe(fingerprint(createWave(options)));
    // guard: 0 is the same wave as no guard key at all.
    expect(fingerprint(createWave({ ...options, crew: { ...options.crew, guard: 0 } }))).toBe(fingerprint(createWave(options)));
  });
});

describe('captain melee: the sim', () => {
  // The first boarder ashore, and a strike from `dx` west of it.
  const ashore = () => {
    const wave = createWave({ seed: 2, wave: 3, lanes: EAST, island: { hp: 1000 } });
    run(wave, (step, w) => w.state().boarders.length > 0);
    return { wave, boarder: wave.state().boarders[0] };
  };
  const strike = (boarder, dx = 1, extra = {}) => ({ type: 'captain_strike', by: 'p1', targetId: boarder.id, level: 1, x: boarder.x - dx, z: boarder.z, ...extra });
  const blows = events => events.filter(event => event.type === 'captain_struck');

  it('hits a boarder in reach only (reach + slack), once per reload', () => {
    const near = ashore();
    expect(blows(near.wave.step(CONFIG.tick, [strike(near.boarder, 1)]))).toHaveLength(1);
    expect(blows(near.wave.step(CONFIG.tick, [strike(near.boarder, 1)]))).toHaveLength(0); // the reload
    const far = ashore();
    const out = CONFIG.captain.cutlass.reach + CONFIG.captain.cutlass.slack + .3;
    expect(blows(far.wave.step(CONFIG.tick, [strike(far.boarder, out)]))).toHaveLength(0);
  });

  it('gives the same result for the same seed and the same strikes', () => {
    const play = () => {
      const wave = createWave({ seed: 5, wave: 8, lanes: EAST, island: { hp: 1000 } }), lines = [];
      for (let i = 0; i < 4000 && !wave.done; i++) {
        const boarder = wave.state().boarders[0];
        const inputs = [{ type: 'captain_move', by: 'p1', x: 20, z: 0 }];
        if (boarder && i % 10 === 0) inputs.push(strike(boarder, 1));
        lines.push(JSON.stringify(wave.step(CONFIG.tick, inputs)));
      }
      return createHash('sha256').update(lines.join('\n')).digest('hex');
    };
    expect(play()).toBe(play());
  });
});

// The controller with a player and a room that records what it sends (as in health.test.js).
const START = Date.UTC(2026, 10, 15, 12, 0, 0);
const INFO = { waveId: 'w-g', wave: 3, seed: 21, startsAt: new Date(START + 1000).toISOString(), weather: { kind: 'calm', ships: 1, fog: 0 }, flagship: false };
function harness() {
  const clock = { now: START }, sent = [], handlers = new Map(), keys = new Map();
  const room = { send: (type, payload) => { sent.push({ type, payload }); return true; },
    on: (type, handler) => { handlers.set(type, handler); return () => handlers.delete(type); } };
  const player = { x: 30, z: 0 };
  const hud = { countdown() {}, bar() {}, banner() {}, setVisible() {}, dispose() {}, musket() {}, loot() {}, boss() {}, prompt() {}, health() {}, down() {}, marks() {} };
  const target = { addEventListener: (type, handler) => keys.set(type, handler), removeEventListener() {} };
  const controller = createWaveController({ bus: { on: () => () => {}, emit() {} }, room, playerId: 'p-me', now: () => clock.now,
    world: { scene: {}, container: {}, player: { position: player } }, keyTarget: target,
    getDefenses: () => [], createRenderer: () => ({ events() {}, update() {}, setVisible() {}, dispose() {} }),
    createHud: () => hud, setTimer: () => 0, clearTimer() {} });
  const advance = async ms => { for (let t = 0; t < ms; t += 50) { clock.now += 50; controller.update(.05); await Promise.resolve(); } };
  return { clock, sent, player, controller, advance };
}
const strikes = h => h.sent.filter(item => item.type === 'captain_strike');
// Walk the player onto the first boarder ashore and keep them on it (no attack pressed).
async function standOnBoarder(h, ms) {
  for (let t = 0; t < ms; t += 50) {
    const boarder = h.controller.state?.boarders?.[0];
    if (boarder) { h.player.x = boarder.x - .5; h.player.z = boarder.z; }
    await h.advance(50);
  }
}

describe('captain melee: the controller', () => {
  it('swings the cutlass by itself at a boarder in reach, slower than F, as a normal captain_strike', async () => {
    const h = harness();
    h.controller.start(INFO);
    await h.advance(1100);
    for (let i = 0; i < 1200 && !h.controller.state?.boarders?.length; i++) await h.advance(50);
    expect(h.controller.state.boarders.length).toBeGreaterThan(0);
    await standOnBoarder(h, 6000);
    const sent = strikes(h);
    expect(sent.length).toBeGreaterThan(1);
    for (const item of sent) expect(item.payload).toMatchObject({ by: 'p-me', level: 1 });
    for (let i = 1; i < sent.length; i++) expect(sent[i].payload.t - sent[i - 1].payload.t).toBeGreaterThanOrEqual(AUTO_BLADE.reload - 1e-6);
    expect(AUTO_BLADE.reload).toBeGreaterThan(CONFIG.captain.cutlass.reload);
  });

  it('sends nothing on its own with no boarder in reach', async () => {
    const h = harness();
    h.controller.start(INFO);
    h.player.x = 0; h.player.z = 30; // far from every landing
    await h.advance(20000);
    expect(strikes(h)).toHaveLength(0);
  });

  it('F next to a boarder swings at once; the automatic swing waits a second after your own attack', async () => {
    const h = harness();
    h.controller.start(INFO);
    await h.advance(1100);
    for (let i = 0; i < 1200 && !h.controller.state?.boarders?.length; i++) await h.advance(50);
    const boarder = h.controller.state.boarders[0];
    h.player.x = boarder.x - .5; h.player.z = boarder.z;
    expect(h.controller.shoot()).toBe(true);
    expect(strikes(h)).toHaveLength(1);
    const first = strikes(h)[0].payload.t;
    await standOnBoarder(h, 900);
    expect(strikes(h).filter(item => item.payload.t > first + 1e-6 && item.payload.t < first + AUTO_BLADE.after - .1)).toHaveLength(0);
  });

  it('a tap on a boarder further away swings at the one in reach instead of firing the musket', async () => {
    const h = harness();
    h.controller.start(INFO);
    await h.advance(1100);
    for (let i = 0; i < 2000 && (h.controller.state?.boarders?.length ?? 0) < 2; i++) await h.advance(50);
    const [near, far] = h.controller.state.boarders;
    h.player.x = near.x - .5; h.player.z = near.z;
    expect(Math.hypot(far.x - h.player.x, far.z - h.player.z)).toBeGreaterThan(CONFIG.captain.cutlass.reach);
    expect(h.controller.shoot(far.id)).toBe(true);
    expect(strikes(h).at(-1).payload.targetId).toBe(near.id);
    expect(h.sent.some(item => item.type === 'captain_shot')).toBe(false);
  });
});
