// The research tiers in the sim (docs/GAME-V3.md §5.1): a tier-2 bonus works on every tower of its kind on top
// of the tower's own skill, a tier-3 capstone is a skill a tower picks. Both ride on the island's spots
// (defense.bonus, defense.spec), so every screen fights the same island. Headless, at the sim's fixed tick.
import { describe, expect, it } from 'vitest';
import { CONFIG, createWave } from '../../src/pirates/sim.js';
import { crewMeasure, islandAt, researched, ring, runWave, tiered, towers, watchtower } from './balance-fixture.js';

const events = (list, type) => list.filter(event => event.type === type);
const cannon = (extra = {}) => ({ id: 'cannon_1', kind: 'cannon', level: 3, x: 15, z: 0, ...extra });
const tower = (defenses, i = 0) => createWave({ seed: 3, wave: 4, defenses }).state().towers[i];
// The gap between the 2nd and 3rd automatic shot of the first tower.
function gap(defenses, type = 'cannon_fired') {
  const sim = createWave({ seed: 3, wave: 4, defenses }), times = [];
  while (!sim.done && times.length < 3) times.push(...events(sim.step(.05), type).map(event => event.t));
  return times[2] - times[1];
}

describe('tier 2: one bonus for every tower of the kind', () => {
  it('Rapid II speeds up every cannon, a Rapid one to about −40% in all; Long guns reach further', () => {
    const base = gap([cannon()]), rapid = gap([cannon({ spec: 'rapid' })]);
    expect(gap([cannon({ bonus: 'rapid_2' })])).toBeLessThan(base);
    expect(gap([cannon({ spec: 'rapid', bonus: 'rapid_2' })])).toBeLessThan(rapid);
    expect(CONFIG.specs.rapid.reload * CONFIG.research.rapid_2.reload).toBeCloseTo(.63, 2);
    expect(tower([cannon({ bonus: 'long_guns' })]).range / tower([cannon()]).range).toBeCloseTo(CONFIG.research.long_guns.range, 1);
    // A bonus of another kind is no bonus; the state names the bonus.
    expect(tower([cannon({ bonus: 'heavy_shells' })])).toEqual(tower([cannon()]));
    expect(tower([cannon({ bonus: 'rapid_2' })]).bonus).toBe('rapid_2');
  });
  it('Quick fuse reloads every mortar faster, Heavy shells widen every blast', () => {
    const mortar = extra => ({ id: 'cannon_5', kind: 'mortar', level: 2, x: -15, z: -6, ...extra });
    const fired = extra => { const sim = createWave({ seed: 4, wave: 6, defenses: [mortar(extra)] }); const out = [];
      while (!sim.done && !out.length) out.push(...events(sim.step(.25), 'mortar_fired')); return out[0]; };
    expect(fired({ bonus: 'heavy_shells' }).radius).toBeCloseTo(CONFIG.mortar.radius * CONFIG.research.heavy_shells.radius, 2);
    expect(fired({}).radius).toBe(CONFIG.mortar.radius);
    expect(gap([mortar({ bonus: 'quick_fuse' })], 'mortar_fired')).toBeLessThan(gap([mortar({})], 'mortar_fired'));
  });
  it('Thick walls add strength to every wall, a Stone wall too; Mason drill speeds up repairs', () => {
    const wall = extra => ({ id: 'wall_1', kind: 'wall', level: 2, x: -18.5, z: -4, ...extra });
    const hp = extra => createWave({ seed: 1, wave: 1, defenses: [wall(extra)] }).state().walls[0].maxHp;
    expect(hp({ bonus: 'thick_walls' })).toBeCloseTo(hp({}) * CONFIG.research.thick_walls.hp, 1);
    expect(hp({ bonus: 'thick_walls', spec: 'stone' })).toBeCloseTo(hp({}) * 2 * CONFIG.research.thick_walls.hp, 1);
    const repaired = extra => {
      const sim = createWave({ seed: 2, wave: 6, defenses: [wall(extra)] });
      while (!sim.done && sim.state().walls[0].hp > sim.state().walls[0].maxHp - 60) sim.step(.05);
      const before = sim.state().walls[0].hp; sim.step(.05, [{ type: 'repair', wallId: 'wall_1' }]); sim.step(1);
      return sim.state().walls[0].hp - before;
    };
    expect(repaired({ bonus: 'mason_drill' })).toBeGreaterThan(repaired({}) * 1.3);
  });
  it('High tower lends more range; Lookout drill makes Spotter and Signal fire stronger', () => {
    const lent = extra => tower([cannon(), { ...watchtower(2), ...extra }]).range - tower([cannon()]).range;
    expect(lent({ bonus: 'high_tower' })).toBeGreaterThan(lent({}) * 1.2);
    const first = extra => { const sim = createWave({ seed: 3, wave: 4, defenses: [cannon(), { id: 'tower_1', kind: 'watchtower', level: 1, x: 10, z: 0, spec: 'spotter', ...extra }] });
      const out = []; while (!sim.done && !out.length) out.push(...events(sim.step(.25), 'cannon_fired')); return out[0]; };
    expect(first({ bonus: 'lookout_drill' }).damage).toBeCloseTo(24 * 1.25, 5);
    expect(first({}).damage).toBeCloseTo(24 * 1.15, 5);
  });
});

describe('tier 3: the capstones', () => {
  it('Broadside hits harder and fires two balls every 4th shot', () => {
    const sim = createWave({ seed: 3, wave: 6, defenses: [cannon({ spec: 'broadside' })] }), fired = [];
    while (!sim.done && fired.length < 10) fired.push(...events(sim.step(.25), 'cannon_fired'));
    expect(fired[0].damage).toBeCloseTo(24 * CONFIG.specs.broadside.damage, 5);
    expect(fired.filter(event => event.broadside).length).toBeGreaterThanOrEqual(2);
  });
  it('Grapeshot shreds the boarders around the one it hits', () => {
    const island = { defenses: [...towers([['cannon', 3], ['cannon', 3]]).map(item => ({ ...item, spec: 'grapeshot' })), ...ring(6)] };
    const run = runWave({ seed: 5, wave: 9, ...island });
    expect(run.events.some(event => event.type === 'boarder_hit' && event.grape)).toBe(true);
  });
  it('Shockwave throws boarders back, Inferno lights a wider fire than a Fire pot', () => {
    const mortars = spec => ({ defenses: [...towers([['mortar', 3], ['mortar', 3]]).map(item => ({ ...item, spec })), ...ring(6)] });
    expect(events(runWave({ seed: 5, wave: 15, ...mortars('shockwave') }).events, 'boarder_pushed').length).toBeGreaterThan(0); // the ones the blast does not kill
    const lit = events(runWave({ seed: 4, wave: 6, ...mortars('inferno') }).events, 'fire_lit');
    expect(lit[0]).toMatchObject({ inferno: true, radius: CONFIG.specs.inferno.radius });
    expect(CONFIG.specs.inferno.radius).toBeGreaterThan(CONFIG.specs.fire_pot.radius);
  });
  it('Bastion walls are stronger and mend themselves; Thorns hurt the boarders that hack them', () => {
    const wall = spec => ({ id: 'wall_1', kind: 'wall', level: 2, x: -18.5, z: -4, spec });
    expect(createWave({ seed: 1, wave: 1, defenses: [wall('bastion')] }).state().walls[0].maxHp).toBeCloseTo(120 * 1.5, 1);
    const sim = createWave({ seed: 2, wave: 6, defenses: [wall('bastion')] });
    while (!sim.done && sim.state().walls[0].hp > sim.state().walls[0].maxHp - 40) sim.step(.05);
    let low = sim.state().walls[0].hp, mended = false;
    for (let i = 0; i < 400 && !sim.done && !mended; i++) { sim.step(.05); const hp = sim.state().walls[0].hp; mended = hp > low && hp > 0; low = Math.min(low, hp); }
    expect(mended).toBe(true);
    const thorns = runWave({ seed: 5, wave: 4, defenses: ring(6).map(item => ({ ...item, spec: 'thorns' })) });
    expect(thorns.events.some(event => event.type === 'boarder_hit' && event.spikes)).toBe(true);
  });
  it('Eagle eye and War drums help the towers in reach of the watchtower', () => {
    const near = spec => [cannon(), { id: 'tower_1', kind: 'watchtower', level: 1, x: 10, z: 0, spec }];
    expect(tower(near('eagle_eye')).range).toBeGreaterThan(tower(near(undefined)).range * 1.15);
    expect(gap(near('war_drums'))).toBeLessThan(gap(near(undefined)));
  });
});

// The late game with tiers 2 and 3 (GAME-V3.md §5.1, the table there): they help a crew from wave 30 to 100,
// but they do not win alone: the towers alone and a weak setup still lose from 50, four captains lose 90+.
describe('the tiers in the late game', () => {
  const STRONG = tiered(islandAt(5)), PLAIN = researched(islandAt(5));
  it('the full crew keeps more heart at wave 100 than with tier 1 only, and wave 100 still hurts', () => {
    const tiers = crewMeasure(STRONG, 100, 10), plain = crewMeasure(PLAIN, 100, 10);
    expect(tiers.won).toBe(4);
    expect(tiers.hp).toBeGreaterThan(plain.hp + 5);
    expect(tiers.hp).toBeLessThan(70);
  }, 120000);
  it('does not trivialise the late waves: towers alone, four captains at 90+ and a weak island lose', () => {
    expect(crewMeasure(STRONG, 50, 0).won).toBeLessThan(2);
    expect(crewMeasure(STRONG, 70, 0).won).toBe(0);
    expect(crewMeasure(STRONG, 100, 4).won).toBe(0);
    expect(crewMeasure(tiered(islandAt(3)), 50, 4).won).toBe(0);
  }, 120000);
});
