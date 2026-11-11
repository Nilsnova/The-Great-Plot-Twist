// The pirate wave simulation (BUILD-PLAN 3.5): determinism, balance, weather, inputs.
import { describe, expect, it } from 'vitest';
import { CONFIG, coastPoint, createRandom, createWave } from '../../src/pirates/sim.js';

// Our own fixture of build spots on the home_islet coast (the island lane owns the real ones).
const at = (id, kind, bearing, radius) => {
  const p = coastPoint(bearing * Math.PI / 180, radius);
  return { id, kind, x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 };
};
const SPOTS = [
  at('cannon_1', 'cannon', -45, .75), at('cannon_2', 'cannon', 45, .75), at('cannon_3', 'cannon', 135, .75),
  at('cannon_4', 'cannon', -135, .75), at('wall_1', 'wall', 0, .86), at('wall_2', 'wall', 90, .86),
  at('wall_3', 'wall', 180, .86), at('wall_4', 'wall', -90, .86), { id: 'tower_1', kind: 'watchtower', x: 0, z: -6 },
  { id: 'house_1', kind: 'house', x: -4, z: 2 },
];
const pick = (...ids) => SPOTS.filter(spot => ids.includes(spot.id));

function play(options, { inputs = () => [], dt = 1 / 30, limit = 200 } = {}) {
  const wave = createWave(options), events = [];
  for (let time = 0; !wave.done && time < limit; time += dt) events.push(...wave.step(dt, inputs(wave, events)));
  return { wave, events, result: wave.result() };
}
const count = (events, type) => events.filter(event => event.type === type).length;

describe('pirate wave simulation', () => {
  it('gives the same wave for the same seed and inputs, whatever the frame rate', () => {
    const options = { seed: 1234, wave: 3, weather: { ships: 1.5, fog: .2 }, defenses: pick('cannon_2', 'cannon_3', 'wall_2') };
    const a = play(options, { dt: 1 / 60 }), b = play(options, { dt: 1 / 60 }), c = play(options, { dt: .25 });
    expect(b.events).toEqual(a.events);
    expect(c.result).toEqual(a.result);
    const other = play({ ...options, seed: 99 }, { dt: 1 / 60 });
    expect(other.events).not.toEqual(a.events);
    const random = createRandom('ISLE-K7Q2M');
    expect(random()).toBe(createRandom('ISLE-K7Q2M')());
  });

  it('lets one cannon win the first wave in 15 to 30 seconds (the faster pace of 11 Nov)', () => {
    for (const seed of [1, 2, 3, 42, 2147483646]) {
      const { result, events } = play({ seed, wave: 1, defenses: pick('cannon_2') });
      expect(result.survived).toBe(true);
      expect(result.shipsSunk).toBe(3);
      expect(result.time).toBeGreaterThanOrEqual(15); expect(result.time).toBeLessThanOrEqual(30);
      expect(events[0]).toMatchObject({ type: 'wave_started', wave: 1, ships: 3 });
      expect(events.at(-1)).toMatchObject({ type: 'wave_ended', reason: 'all_sunk', survived: true });
      expect(count(events, 'ship_sunk')).toBe(3);
    }
  });

  it('loses a wave with no defenses, and needs more defenses later', () => {
    // Wave 1 with nothing built: the boarders reach the heart and hurt it badly; wave 2 falls.
    const first = play({ seed: 5, wave: 1, defenses: [] });
    expect(first.result.islandHp).toBeLessThan(40);
    const hurt = first.events.filter(event => event.type === 'island_damaged');
    const byBoarders = hurt.filter(event => event.boarderId).reduce((sum, event) => sum + event.damage, 0);
    expect(byBoarders).toBeGreaterThan(hurt.reduce((sum, event) => sum + event.damage, 0) / 2); // mainly through boarders
    expect(hurt.find(event => event.boarderId)).toMatchObject({ damage: CONFIG.boarding.heartDamage });
    const { result, events, wave } = play({ seed: 5, wave: 2, defenses: [] });
    expect(result).toMatchObject({ survived: false, shipsSunk: 0, islandHp: 0 });
    expect(wave.done).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: 'wave_ended', reason: 'island_lost' });
    expect(play({ seed: 5, wave: 3, defenses: pick('cannon_2') }).result.survived).toBe(false);
    expect(play({ seed: 5, wave: 3, defenses: pick('cannon_1', 'cannon_2', 'cannon_3', 'wall_1', 'wall_2') }).result.survived).toBe(true);
    // Every wave ends within the time limit.
    expect(play({ seed: 5, wave: 50, weather: { ships: 3 }, defenses: SPOTS }).result.time).toBeLessThanOrEqual(CONFIG.maxTime);
  });

  it('sends more ships in a storm', () => {
    const calm = createWave({ seed: 8, wave: 2, weather: { ships: 1 } }).state().total;
    const storm = createWave({ seed: 8, wave: 2, weather: { ships: 1.5 } }).state().total;
    expect(calm).toBe(5); expect(storm).toBe(8);
    const spawned = play({ seed: 8, wave: 2, weather: { ships: 1.5 }, defenses: SPOTS }).events;
    expect(count(spawned, 'ship_spawned')).toBe(8);
  });

  it('shortens the sight range in fog, and a watchtower lengthens it', () => {
    // From wave 2 on (wave 1 keeps a minimum sight: see the fog balance test).
    const clear = createWave({ seed: 3, wave: 2, defenses: pick('cannon_2') }).state();
    const fog = createWave({ seed: 3, wave: 2, weather: { fog: .4 }, defenses: pick('cannon_2') }).state();
    const tower = createWave({ seed: 3, defenses: pick('cannon_2', 'tower_1') }).state();
    expect(fog.sight).toBeCloseTo(clear.sight * .6, 5);
    expect(tower.sight).toBe(CONFIG.cannon.range + CONFIG.cannon.towerBonus);
    const firstShot = options => play(options).events.find(event => event.type === 'cannon_fired');
    const near = firstShot({ seed: 3, wave: 2, weather: { fog: .4 }, defenses: pick('cannon_2') });
    const far = firstShot({ seed: 3, wave: 2, defenses: pick('cannon_2') });
    expect(near.t).toBeGreaterThan(far.t); // the pirates appear later
    const distance = event => Math.hypot(event.toX - event.x, event.toZ - event.z);
    expect(distance(near)).toBeLessThanOrEqual(fog.sight + CONFIG.cannon.missSpread + 2);
  });

  it('keeps the flagship afloat until the three lamps are lit, then sinks it quickly', () => {
    const options = { seed: 11, wave: 2, flagship: true, defenses: SPOTS };
    const unlit = play(options);
    expect(unlit.result.survived).toBe(false);
    const flagshipHits = unlit.events.filter(event => event.type === 'ship_hit' && event.kind === 'flagship');
    expect(flagshipHits.length).toBeGreaterThan(0);
    expect(flagshipHits.every(event => event.damage === 0 && event.blocked)).toBe(true);
    let litAt = null;
    const lit = play(options, { inputs: (wave, events) => {
      const ship = wave.state().ships.find(item => item.kind === 'flagship');
      if (litAt === null && ship?.state === 'attacking') { litAt = wave.state().time; return [{ type: 'lamps_lit' }, { type: 'lamps_lit' }]; }
      return [];
    } });
    expect(lit.result.survived).toBe(true);
    const sunk = lit.events.find(event => event.type === 'ship_sunk' && event.kind === 'flagship');
    expect(sunk.t - litAt).toBeLessThan(10);
    expect(lit.events.some(event => event.type === 'ship_hit' && event.source === 'lamps')).toBe(true);
    // Lamps on a wave without a flagship do nothing.
    const plain = play({ seed: 11, wave: 1, defenses: pick('cannon_2') }, { inputs: () => [{ type: 'lamps_lit' }] });
    expect(plain.events.some(event => event.source === 'lamps')).toBe(false);
  });

  it('does double damage with a manual shot and resets that cannon', () => {
    const wave = createWave({ seed: 4, wave: 1, defenses: pick('cannon_2') });
    let ship = null;
    for (let i = 0; i < 400 && !ship; i++) {
      wave.step(.05);
      ship = wave.state().ships.find(item => Math.hypot(item.x - SPOTS[1].x, item.z - SPOTS[1].z) < wave.state().sight);
    }
    expect(ship).toBeTruthy();
    wave.step(.6); // the cannon has just fired on its own; a manual shot may follow after the short cooldown
    expect(wave.state().cannons[0].reload).toBeLessThan(CONFIG.cannon.reload - .5);
    const events = wave.step(.05, [{ type: 'fire', cannonId: 'cannon_2', targetId: ship.id }]);
    const shot = events.find(event => event.type === 'cannon_fired' && event.manual);
    expect(shot).toMatchObject({ cannonId: 'cannon_2', targetId: ship.id, hit: true, damage: CONFIG.cannon.damage * 2 });
    expect(wave.state().cannons[0].reload).toBeGreaterThan(CONFIG.cannon.reload - .2);
    const later = [];
    for (let i = 0; i < 40; i++) later.push(...wave.step(.05));
    expect(later.find(event => event.type === 'ship_hit' && event.manual)).toMatchObject({ damage: 20, shipId: ship.id });
    // A second manual shot right away is refused by the cooldown.
    const spam = wave.step(.05, [{ type: 'fire', cannonId: 'cannon_2', targetId: wave.state().ships[0]?.id }]);
    expect(spam.filter(event => event.type === 'cannon_fired' && event.manual)).toHaveLength(0);
  });

  it('repairs a damaged wall over time', () => {
    const wave = createWave({ seed: 2, wave: 1, defenses: pick('wall_1', 'wall_2', 'wall_3', 'wall_4') });
    let damaged = null;
    for (let i = 0; i < 2000 && !damaged; i++) damaged = wave.step(.05).find(event => event.type === 'wall_damaged');
    expect(damaged).toBeTruthy();
    const before = wave.state().walls.find(wall => wall.id === damaged.wallId).hp;
    expect(before).toBeLessThan(CONFIG.wall.hp);
    const events = wave.step(.05, [{ type: 'repair', wallId: damaged.wallId }]);
    expect(wave.state().walls.find(wall => wall.id === damaged.wallId).repairing).toBe(true);
    for (let i = 0; i < 70; i++) events.push(...wave.step(.05));
    const repaired = events.find(event => event.type === 'wall_repaired');
    expect(repaired).toMatchObject({ wallId: damaged.wallId });
    expect(repaired.amount).toBeGreaterThan(0);
    expect(repaired.amount).toBeLessThanOrEqual(CONFIG.wall.repairRate * CONFIG.wall.repairSeconds + .01);
  });

  it('ignores invalid inputs and options safely', () => {
    const options = { seed: 6, wave: 2, defenses: pick('cannon_2', 'wall_2') };
    const clean = play(options);
    const junk = [null, 7, 'fire', [], {}, { type: 'fire' }, { type: 'fire', cannonId: 'cannon_9', targetId: 'ship_1' },
      { type: 'fire', cannonId: 'wall_2', targetId: 'ship_1' }, { type: 'fire', cannonId: 'cannon_2', targetId: 'ship_999' },
      { type: 'fire', cannonId: NaN, targetId: { id: 1 } }, { type: 'repair', wallId: 'cannon_2' }, { type: 'repair', wallId: 'wall_9' },
      { type: 'repair' }, { type: 'rebuild', wallId: 'cannon_2' }, { type: 'rebuild' }, { type: 'captain_strike', by: '<b>', x: 0, z: 0 },
      { type: 'captain_strike', by: 'p', x: NaN, z: 0 }, { type: 'captain_shot', by: 'p', targetId: 'boarder_999', level: 1, x: 0, z: 0 },
      { type: 'boom' }, { type: 'lamps_lit' }, { type: '__proto__' }];
    const noisy = play(options, { inputs: () => junk });
    expect(noisy.result).toEqual(clean.result);
    const wave = createWave(options);
    expect(wave.step(NaN, 'nope')).toEqual([]); expect(wave.step(-5, null)).toEqual([]); expect(wave.step(Infinity)).toEqual([]);
    const odd = createWave({ seed: undefined, wave: 'x', weather: { ships: NaN, fog: 9 }, island: { hp: -1 },
      defenses: [null, { id: 'c', kind: 'cannon', x: NaN, z: 0 }, { id: 'd', kind: 'laser', x: 0, z: 0 },
        { id: 'e', kind: 'cannon', x: 1, z: 1 }, { id: 'e', kind: 'cannon', x: 2, z: 2 }] }).state();
    expect(odd).toMatchObject({ wave: 1, islandHp: CONFIG.islandHp, fog: CONFIG.fog.max, total: 3 });
    expect(odd.cannons.map(cannon => cannon.id)).toEqual(['e']);
    expect(createWave().state().total).toBe(3);
  });

  it('counts down first, then reports every event with ids and positions', () => {
    const { events, wave } = play({ seed: 9, wave: 2, countdown: 3, defenses: pick('cannon_2', 'cannon_3', 'wall_2', 'wall_1') });
    expect(events.slice(0, 3).map(event => [event.type, event.secondsLeft])).toEqual([['wave_countdown', 3], ['wave_countdown', 2], ['wave_countdown', 1]]);
    expect(events[3].type).toBe('wave_started');
    expect(events[3].lanes).toHaveLength(2);
    const types = new Set(events.map(event => event.type));
    for (const type of ['ship_spawned', 'cannon_fired', 'ship_hit', 'ship_sunk', 'wave_ended']) expect(types.has(type)).toBe(true);
    for (const event of events.filter(item => item.type === 'ship_spawned')) {
      expect(event).toEqual(expect.objectContaining({ shipId: expect.stringMatching(/^ship_\d+$/), kind: 'sloop',
        x: expect.any(Number), z: expect.any(Number), toX: expect.any(Number), toZ: expect.any(Number) }));
    }
    expect(wave.state()).toMatchObject({ phase: 'ended', ships: [], sunk: 5, shipsLeft: 0 });
    expect(wave.state().wrecks).toHaveLength(5);
    expect(wave.step(1)).toEqual([]);
  });
});
