// The campaign in the sim (docs/GAME-V3.md §4 and §5): the tower skills of the Tech hub, read from the island's
// spots, and the 100-wave curve with its tiers (raiders 12+, tougher bosses 15+, brutes 20+, ironclads 30+,
// dreadnoughts 50+, Redtide's own ship at 100). Headless, at the sim's fixed tick.
import { describe, expect, it } from 'vitest';
import { CONFIG, coastPoint, createWave, fleetOf, threatOf, tierFor } from '../../src/pirates/sim.js';
import { ISLANDS, measure, ring, runWave, towers, walls, watchtower } from './balance-fixture.js';

const events = (list, type) => list.filter(event => event.type === type);
// The full island with a skill on every tower (Heavy shot, Cluster, Stone shore walls and a Spiked ring, Spotter).
const specced = island => ({ ...island, defenses: island.defenses.map(item => ({ ...item,
  spec: { cannon: 'heavy', mortar: 'cluster', watchtower: 'spotter' }[item.kind] ?? (item.kind === 'wall' ? (/_(?:[7-9]|1[0-2])$/.test(item.id) ? 'spiked' : 'stone') : undefined) })) });
// n captains at level 5 with the Marksman skills and the long rifle on the lanes' beaches, each firing at the
// nearest ship or boarder in reach: "the whole crew" of a late wave.
function withCrew(island, wave, seed, n) {
  const sim = createWave({ seed, wave, ...island });
  const posts = Array.from({ length: n }, (_, i) => coastPoint([0, 90, 180, 45, 135, -45, -135, 0, 90, 180][i] * Math.PI / 180, .8));
  while (!sim.done) {
    const state = sim.state(), inputs = [];
    posts.forEach((post, i) => {
      let best = null, reach = 25;
      for (const target of [...state.boarders, ...state.ships]) { const d = Math.hypot(target.x - post.x, target.z - post.z); if (d < reach) { best = target; reach = d; } }
      if (best) inputs.push({ type: 'captain_shot', by: `c${i}`, targetId: best.id, level: 5, skills: ['steady_aim', 'long_barrel', 'quick_hands'], weapon: 'long_rifle', x: post.x, z: post.z });
    });
    sim.step(.25, inputs);
  }
  return sim.result();
}
const crewWins = (island, wave, n, seeds = 4) => Array.from({ length: seeds }, (_, i) => withCrew(island, wave, (i + 1) * 7919, n)).filter(r => r.survived).length;

describe('the tower skills (GAME-V3.md §5)', () => {
  const cannon = spec => [{ id: 'cannon_1', kind: 'cannon', level: 3, x: 15, z: 0, ...(spec ? { spec } : {}) }];
  const towerOf = (spec, extra = []) => createWave({ seed: 3, wave: 4, defenses: [...cannon(spec), ...extra] }).state().towers[0];
  it('Rapid reloads faster, Heavy shot hits harder and slower, a Spotter tower in reach adds 15%', () => {
    const plain = towerOf(), heavy = towerOf('heavy');
    const run = spec => createWave({ seed: 3, wave: 4, defenses: cannon(spec) });
    const fired = spec => { const sim = run(spec); const out = []; while (!sim.done && out.length < 2) out.push(...events(sim.step(.25), 'cannon_fired')); return out[0]; };
    expect(fired('heavy').damage).toBeCloseTo(24 * 1.6, 5);
    expect(fired(null).damage).toBe(24);
    const spotted = spec => createWave({ seed: 3, wave: 4, defenses: [...cannon('rapid'), { id: 'tower_1', kind: 'watchtower', level: 1, x: 10, z: 0, spec }] });
    const first = sim => { const out = []; while (!sim.done && !out.length) out.push(...events(sim.step(.25), 'cannon_fired')); return out[0]; };
    expect(first(spotted('spotter')).damage).toBeCloseTo(24 * 1.15, 5);
    expect(first(spotted('signal_fire')).damage).toBe(24);
    expect(heavy.range).toBe(plain.range);
    // The base reloads: Rapid ×0.7, Heavy ×1.25 (read through the cooldown between two automatic shots).
    const gap = spec => { const sim = run(spec); const times = []; while (!sim.done && times.length < 3) times.push(...events(sim.step(.05), 'cannon_fired').map(e => e.t)); return times[2] - times[1]; };
    const base = gap(null);
    expect(gap('rapid')).toBeLessThan(base);
    expect(gap('heavy')).toBeGreaterThan(base);
  });
  it('Long range reaches 12 farther; a skill of another kind is no skill', () => {
    const mortar = spec => createWave({ seed: 1, wave: 3, defenses: [{ id: 'cannon_5', kind: 'mortar', level: 1, x: -15, z: -6, ...(spec ? { spec } : {}) }] }).state().towers[0];
    expect(mortar('long_range').range - mortar().range).toBeCloseTo(CONFIG.specs.long_range.range, 1); // calm sea: no fog
    expect(mortar('rapid')).toEqual(mortar());
    expect(createWave({ seed: 1, wave: 1, defenses: cannon('stone') }).state().towers[0].spec).toBeUndefined();
  });
  it('Stone doubles a wall, Quick mend repairs twice as fast, Spiked hurts the boarders that hack it', () => {
    const wall = spec => ({ id: 'wall_1', kind: 'wall', level: 2, x: -18.5, z: -4, ...(spec ? { spec } : {}) });
    expect(createWave({ seed: 1, wave: 1, defenses: [wall('stone')] }).state().walls[0]).toMatchObject({ hp: 240, maxHp: 240, spec: 'stone' });
    // One player's repair of a badly beaten wall: hp gained in the first second.
    const repaired = spec => {
      const sim = createWave({ seed: 2, wave: 6, defenses: [wall(spec)] });
      while (!sim.done && sim.state().walls[0].hp > sim.state().walls[0].maxHp - 60) sim.step(.05);
      const before = sim.state().walls[0].hp; sim.step(.05, [{ type: 'repair', wallId: 'wall_1' }]); sim.step(1);
      return sim.state().walls[0].hp - before;
    };
    expect(repaired('quick_mend')).toBeGreaterThan(repaired(null) * 1.5);
    const spiked = runWave({ seed: 5, wave: 4, defenses: ring(6).map(item => ({ ...item, spec: 'spiked' })) });
    expect(spiked.events.some(event => event.type === 'boarder_hit' && event.spikes)).toBe(true);
    const plain = runWave({ seed: 5, wave: 4, defenses: ring(6) });
    expect(plain.events.some(event => event.spikes)).toBe(false);
  });
  it('Chain shot slows a ship it hits, Cluster bursts in three, a Fire pot burns the ground for 4 s', () => {
    const chain = runWave({ seed: 4, wave: 6, defenses: [...towers([['cannon', 3], ['cannon', 3]]).map(item => ({ ...item, spec: 'chain' }))] });
    expect(events(chain.events, 'ship_slowed').length).toBeGreaterThan(0);
    const mortar = spec => runWave({ seed: 4, wave: 6, defenses: towers([['mortar', 3]]).map(item => ({ ...item, spec })) }).events;
    const cluster = mortar('cluster'), fire = mortar('fire_pot');
    const shots = list => events(list, 'mortar_fired').length, blasts = list => events(list, 'mortar_impact').length;
    expect(blasts(cluster)).toBeGreaterThanOrEqual(shots(cluster) * 3 - 3);
    const lit = events(fire, 'fire_lit');
    expect(lit.length).toBeGreaterThan(0);
    expect(lit[0].until - lit[0].t).toBeCloseTo(CONFIG.specs.fire_pot.seconds, 1);
  });
  it('a Signal fire watchtower calls the ships out 5 s early, even without a lookout', () => {
    const sim = runWave({ seed: 1, wave: 2, defenses: [...towers([['cannon', 1]]), { ...watchtower(1), spec: 'signal_fire' }] });
    const warning = events(sim.events, 'ship_warning')[1], spawned = events(sim.events, 'ship_spawned')[1];
    expect(spawned.t - warning.t).toBeCloseTo(CONFIG.specs.signal_fire.warn, 1);
  });
  it('is deterministic: the same island with the same skills fights the same wave on every screen', () => {
    const island = specced(ISLANDS.full);
    const a = runWave({ seed: 11, wave: 31, ...island }), b = runWave({ seed: 11, wave: 31, ...island });
    expect(a.result).toEqual(b.result);
    expect(a.events.length).toBe(b.events.length);
  });
});

describe('100-wave scaling (GAME-V3.md §4)', () => {
  it('grows monotonically: every wave is at least as hard as the one before, a boss wave harder than its neighbour', () => {
    const plain = Array.from({ length: 100 }, (_, i) => threatOf(i + 1, { boss: false }));
    for (let i = 1; i < plain.length; i++) expect(plain[i], `wave ${i + 1}`).toBeGreaterThanOrEqual(plain[i - 1]);
    for (let wave = 5; wave <= 100; wave += 5) expect(threatOf(wave), `boss wave ${wave}`).toBeGreaterThan(threatOf(wave, { boss: false }));
    expect(threatOf(100)).toBeGreaterThan(threatOf(99) * 1.2);
    expect(threatOf(10) / threatOf(1)).toBeGreaterThan(5);
  });
  it('brings the tiers: raiders at 12, tougher bosses at 15, brutes at 20, ironclads at 30, dreadnoughts at 50, Redtide at 100', () => {
    expect(fleetOf(11).kinds).not.toContain('raider');
    expect(fleetOf(12).kinds).toContain('raider');
    expect(fleetOf(29).kinds).not.toContain('ironclad');
    expect(fleetOf(30).kinds).toContain('ironclad');
    expect([14, 15, 30].map(wave => tierFor(wave).bossHp)).toEqual([1, 1.25, 1.5]);
    expect([tierFor(49).boss, tierFor(50).boss]).toEqual(['warship', 'dreadnought']);
    expect([tierFor(19).brutes, tierFor(20).brutes > 0]).toEqual([0, true]);
    const final = createWave({ seed: 1, wave: 100 });
    const started = events(final.step(.05), 'wave_started')[0];
    expect(started).toMatchObject({ wave: 100, boss: true, final: true });
  });
  it('runs every wave from 1 to 100 to its end with no exception, and every tier shows up', () => {
    const island = specced(ISLANDS.full), seen = new Set();
    for (let wave = 1; wave <= 100; wave++) {
      const sim = createWave({ seed: wave * 31, wave, ...island });
      let brute = false;
      while (!sim.done) {
        for (const event of sim.step(1)) if (event.type === 'ship_spawned') seen.add(event.kind);
        brute ||= sim.state().boarders.some(item => item.brute);
      }
      if (brute) seen.add('brute');
      const result = sim.result();
      expect(result.time, `wave ${wave}`).toBeLessThanOrEqual(CONFIG.maxTime);
      expect(Number.isFinite(result.islandHp)).toBe(true);
    }
    for (const kind of ['sloop', 'raider', 'brig', 'ironclad', 'warship', 'dreadnought', 'redtide', 'brute']) expect(seen.has(kind), kind).toBe(true);
  }, 60000);
  it('teaches in waves 1 to 5: two cannons and two walls hold wave 3, a small upgraded island the wave-4 and boss waves', () => {
    expect(measure(ISLANDS.first, 1).won).toBe(8);
    expect(measure({ defenses: [...towers([['cannon', 1], ['cannon', 1]]), ...walls(2)] }, 3).won).toBe(8);
    const four = { defenses: [...towers([['cannon', 2], ['cannon', 2], ['mortar', 1]]), ...walls(3, 2), watchtower(1)] };
    expect(measure(four, 4).won).toBe(8);
    expect(measure(four, 5).won).toBeGreaterThanOrEqual(7);
  });
  it('wave 30 needs research or the captains (wave 50 and later: tests/pirates/late-game.test.js)', () => {
    expect(measure(ISLANDS.full, 30, { seeds: 4 }).won).toBeLessThanOrEqual(1); // the full island alone mostly falls
    expect(crewWins(ISLANDS.full, 30, 4)).toBe(4);                        // four captains with it hold
    expect(measure(specced(ISLANDS.full), 30, { seeds: 4 }).won).toBeGreaterThan(0); // the skills alone hold some
    expect(crewWins(specced(ISLANDS.full), 50, 4)).toBe(0);               // four marksmen on level-3 towers are not enough at 50
  });
});
