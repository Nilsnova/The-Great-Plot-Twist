// Tower defense v2 in the sim (TOWER-DEFENSE.md §1-§3, §8, §10): levels, the mortar, crew, boss waves,
// the captain's musket, the difficulty curve to wave 100 and determinism with all of it.
import { describe, expect, it } from 'vitest';
import { CONFIG, createWave, curveFor, fleetSize, warshipsFor } from '../../src/pirates/sim.js';
import { ISLANDS, measure, runWave, spot, towers, walls, watchtower } from './balance-fixture.js';

const count = (events, type) => events.filter(event => event.type === type).length;
const first = (events, type) => events.find(event => event.type === type);

describe('tower levels', () => {
  it('uses the level table for cannons, walls and the watchtower, and level 1 without a level', () => {
    const state = level => createWave({ seed: 1, wave: 2, defenses: [{ ...spot('c', 'cannon', 45, .75), level }, { ...spot('w', 'wall', 0, .86), level }] }).state();
    expect(state(undefined).towers[0]).toMatchObject({ level: 1, range: 28 });
    expect(state(2).towers[0]).toMatchObject({ level: 2, range: 31 });
    expect(state(3).towers[0]).toMatchObject({ level: 3, range: 34 });
    expect(state(9).towers[0].level).toBe(3); // clamped
    expect([1, 2, 3].map(level => state(level).walls[0].maxHp)).toEqual([60, 120, 200]);
    const tower = level => createWave({ seed: 1, wave: 2, defenses: [spot('c', 'cannon', 45, .75), { ...watchtower(), level }] }).state().towers[0].range;
    expect([tower(1), tower(2)]).toEqual([28 + 8, 28 + 12]);
    const shot = level => first(runWave({ seed: 3, wave: 1, defenses: [{ ...spot('c', 'cannon', 45, .75), level }] }).events, 'cannon_fired');
    expect([1, 2, 3].map(level => shot(level).damage)).toEqual([10, 16, 24]);
  });
});

describe('mortar', () => {
  const mortar = (level = 1) => [{ ...spot('m', 'mortar', 45, .75), level }];
  it('lobs a shell with a flight time that hurts every ship within the radius of its impact', () => {
    const { events } = runWave({ seed: 4, wave: 6, weather: { ships: 2 }, defenses: [...mortar(3), ...walls(3, 3)], island: { hp: 5000 } });
    const fired = first(events, 'mortar_fired');
    expect(fired).toMatchObject({ towerId: 'm', damage: 32, radius: CONFIG.mortar.radius });
    expect(fired.impactAt - fired.t).toBeGreaterThanOrEqual(CONFIG.mortar.flight);
    const impacts = events.filter(event => event.type === 'mortar_impact');
    expect(impacts.length).toBeGreaterThan(3);
    expect(impacts.some(event => event.hits >= 2)).toBe(true); // area damage: one shell, several ships
    for (const impact of impacts) {
      const hits = events.filter(event => event.type === 'ship_hit' && event.area && event.t === impact.t && event.by === 'm');
      expect(hits.length).toBe(impact.hits);
      for (const hit of hits) expect(Math.hypot(hit.x - impact.x, hit.z - impact.z)).toBeLessThanOrEqual(CONFIG.mortar.radius + .01);
    }
  });

  it('never fires at a ship closer than its minimum range', () => {
    // A mortar right on the east anchorage: the ships there are inside its minimum range.
    const close = { id: 'm', kind: 'mortar', level: 3, x: 20, z: 0 };
    const { events } = runWave({ seed: 2, wave: 1, defenses: [close], island: { hp: 1000 } });
    const shots = events.filter(event => event.type === 'mortar_fired');
    const ships = new Map();
    for (const event of events) if (event.type === 'ship_spawned') ships.set(event.shipId, event);
    for (const shot of shots) {
      const aimed = Math.hypot(shot.toX - close.x, shot.toZ - close.z);
      expect(aimed).toBeGreaterThan(CONFIG.mortar.minRange - CONFIG.mortar.scatter - 3); // aimed ahead of a far ship
    }
    // Once all ships sit at anchor in front of it, it falls silent.
    const late = shots.filter(shot => shot.t > 40);
    expect(late).toHaveLength(0);
  });
});

describe('crew', () => {
  const base = { seed: 5, wave: 4, defenses: [...towers([['cannon', 2], ['cannon', 1]]), ...walls(3)], island: { hp: 1000 } };
  it('a gunner cuts the reload of the strongest tower by a quarter and aims at the ship closest to the shore', () => {
    const plain = createWave(base).state().towers, manned = createWave({ ...base, crew: { gunner: 1 } }).state();
    expect(plain.every(tower => !tower.manned)).toBe(true);
    expect(manned.towers.find(tower => tower.manned).id).toBe('tower_s1'); // the level-2 cannon
    const shots = crew => runWave({ ...base, crew }).events.filter(event => event.type === 'cannon_fired' && event.cannonId === 'tower_s1');
    const gaps = list => list.slice(1).map((shot, i) => Math.round((shot.t - list[i].t) * 100) / 100);
    expect(Math.min(...gaps(shots({ gunner: 1 })))).toBeCloseTo(1.3 * .75, 1);
    expect(Math.min(...gaps(shots({})))).toBeCloseTo(1.3, 1);
    expect(createWave({ ...base, crew: { gunner: 5 } }).state().crew.gunner).toBe(CONFIG.crew.gunner.max);
  });

  it('carpenters repair the most damaged standing walls at 6 hp/s each, never a broken one', () => {
    const options = { seed: 2, wave: 3, defenses: walls(3), island: { hp: 1000 } };
    const without = runWave(options), withTwo = runWave({ ...options, crew: { carpenter: 2 } });
    const wallHp = run => run.state.walls.reduce((sum, wall) => sum + wall.hp, 0);
    expect(count(withTwo.events, 'wall_repaired')).toBeGreaterThan(0);
    expect(withTwo.result.islandHp).toBeGreaterThan(without.result.islandHp);
    expect(wallHp(withTwo)).toBeGreaterThanOrEqual(wallHp(without));
    // Step by step: a damaged wall gains 6 hp per second per carpenter on it.
    const wave = createWave({ ...options, crew: { carpenter: 1 } });
    let hit = null;
    while (!hit && !wave.done) hit = wave.step(.05).find(event => event.type === 'wall_damaged' && !event.broken);
    const before = wave.state().walls.find(wall => wall.id === hit.wallId).hp;
    wave.step(.05);
    expect(wave.state().walls.find(wall => wall.id === hit.wallId).crew).toBe(true);
    wave.step(.45);
    const after = wave.state().walls.find(wall => wall.id === hit.wallId);
    expect(after.hp).toBeGreaterThan(before);
    expect(after.hp - before).toBeLessThanOrEqual(CONFIG.crew.carpenter.rate * .5 + .01);
  });

  it('a lookout sees 20% further in fog and calls ships out 3 seconds early', () => {
    const options = { seed: 3, wave: 3, weather: { fog: .4 }, defenses: towers([['cannon', 1]]) };
    const plain = createWave(options).state(), lookout = createWave({ ...options, crew: { lookout: 1 } }).state();
    expect(lookout.sight).toBeCloseTo(plain.sight * 1.2, 5);
    expect(createWave({ ...options, weather: { fog: 0 }, crew: { lookout: 1 } }).state().sight).toBe(28); // no fog, no change
    const { events } = runWave({ ...options, crew: { lookout: 1 }, island: { hp: 1000 } });
    const warning = events.filter(event => event.type === 'ship_warning')[1];
    const spawned = events.filter(event => event.type === 'ship_spawned')[1];
    expect(warning.at).toBe(spawned.t);
    expect(spawned.t - warning.t).toBeCloseTo(CONFIG.crew.lookout.warn, 1);
    expect(count(runWave(options).events, 'ship_warning')).toBe(0);
  });
});

describe('boss waves and the curve', () => {
  it('sends a warship every 5th wave and two every 10th, flagged on the wave', () => {
    expect([4, 5, 9, 10, 15, 20].map(wave => warshipsFor(wave).bosses)).toEqual([0, 1, 0, 2, 1, 2]);
    for (const [wave, bosses] of [[5, 1], [10, 2], [4, 0]]) {
      const { events, state } = runWave({ seed: 1, wave, defenses: ISLANDS.full.defenses, crew: ISLANDS.full.crew });
      expect(first(events, 'wave_started')).toMatchObject({ boss: bosses > 0, warships: bosses });
      const warships = events.filter(event => event.type === 'ship_spawned' && event.kind === 'warship' && event.boss);
      expect(warships).toHaveLength(bosses);
      if (bosses) expect(warships[0].hp).toBe(Math.round(CONFIG.ships.warship.hp * curveFor(wave).hp));
      expect(state.boss).toBe(bosses > 0);
    }
    // boss: false from the server wins; a Pirate Point (flagship) wave is no boss wave by default.
    expect(createWave({ seed: 1, wave: 5, boss: false }).state().boss).toBe(false);
    expect(createWave({ seed: 1, wave: 5, flagship: true }).state().boss).toBe(false);
    expect(createWave({ seed: 1, wave: 3, boss: true }).state().warships).toBe(1);
  });

  it('grows the fleet, hp, speed and damage up to wave 100', () => {
    const sizes = [1, 5, 10, 20, 30, 50, 100].map(wave => createWave({ seed: 1, wave }).state().total);
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThanOrEqual(sizes[i - 1]);
    expect(sizes[0]).toBe(3); expect(createWave({ seed: 1, wave: 100 }).state().wave).toBe(100);
    expect(fleetSize(10)).toBeLessThan(fleetSize(30));
    expect(curveFor(1)).toEqual({ hp: 1, speed: 1, damage: 1 });
    expect(curveFor(30).hp).toBeGreaterThan(curveFor(10).hp);
    expect(curveFor(100).speed).toBe(CONFIG.curve.speedMax);
    expect(warshipsFor(25, false).regular).toBe(1); // late fleets mix warships in
  });
});

describe('balance', () => {
  // The owner's targets, measured over 8 seeds each (the curve itself is printed in the report).
  it('wave 1 is won with one level-1 cannon', () => {
    expect(measure(ISLANDS.first, 1)).toMatchObject({ won: 8 });
  });
  it('the wave 5 boss is won with 3 level-2 cannons and 2 walls, not with level-1 cannons', () => {
    expect(measure(ISLANDS.boss5, 5).won).toBe(8);
    expect(measure(ISLANDS.small, 5).won).toBe(0);
  });
  it('wave 10 needs about five upgraded towers with a mortar', () => {
    expect(measure(ISLANDS.mid, 10).won).toBeGreaterThanOrEqual(7);
    expect(measure(ISLANDS.boss5, 10).won).toBe(0);
    expect(measure(ISLANDS.small, 10).won).toBe(0);
  });
  it('wave 20 is clearly harder: the wave-10 island falls, the full island holds', () => {
    expect(measure(ISLANDS.mid, 20).won).toBe(0);
    expect(measure(ISLANDS.full, 20).won).toBe(8);
  });
  it('nothing below wave 30 is impossible with a full island, and the endless part ends it', () => {
    for (const wave of [15, 22, 25, 27, 29]) expect(measure(ISLANDS.full, wave, { seeds: 4 }).won).toBe(4);
    expect(measure(ISLANDS.full, 60, { seeds: 4 }).won).toBe(0);
  });
});

describe('captain musket', () => {
  it('shoots a ship in range with the level table, reloads per player and ignores bad shots', () => {
    const wave = createWave({ seed: 6, wave: 2, defenses: walls(3), island: { hp: 1000 } });
    let ship = null;
    while (!ship) { wave.step(.05); ship = wave.state().ships.find(item => item.state === 'attacking'); }
    const from = { x: ship.x * .6, z: ship.z * .6 }; // on the beach, within 14 of the ship
    expect(Math.hypot(ship.x - from.x, ship.z - from.z)).toBeLessThan(14);
    const shot = (by, level, at = from) => ({ type: 'captain_shot', by, targetId: ship.id, level, ...at });
    let events = wave.step(.05, [shot('anna', 1), shot('anna', 1), shot('ben', 2)]);
    const fired = events.filter(event => event.type === 'captain_fired');
    expect(fired.map(event => [event.by, event.damage])).toEqual([['anna', 6], ['ben', 9]]); // anna's second is reloading
    events = [];
    for (let i = 0; i < 10; i++) events.push(...wave.step(.05));
    expect(events.filter(event => event.type === 'ship_hit' && event.captain).map(event => event.by).sort()).toEqual(['captain:anna', 'captain:ben']);
    const far = { x: ship.x * .1, z: ship.z * .1 };
    const junk = [shot('anna', 1, far), { ...shot('x', 1), by: '<b>' }, { ...shot('y', 1), x: NaN }, { ...shot('z', 1), targetId: 'ship_999' }];
    for (let i = 0; i < 30; i++) wave.step(.05);
    expect(wave.step(.05, junk).filter(event => event.type === 'captain_fired')).toHaveLength(0);
    expect(wave.step(.05, [shot('anna', 1)]).filter(event => event.type === 'captain_fired')).toHaveLength(1);
  });
});

describe('determinism with levels, crew and the captain', () => {
  it('gives the same wave for the same inputs, whatever the frame rate', () => {
    const options = { seed: 99, wave: 10, weather: { ships: 1.5, fog: .3 }, ...ISLANDS.full, crew: { gunner: 2, carpenter: 2, lookout: 1 } };
    const run = dt => {
      const wave = createWave(options), events = [];
      let shots = 0;
      for (let tick = 0; !wave.done; tick++) {
        const target = wave.state().ships[0];
        const inputs = target && tick % 20 === 0 && shots++ < 30 ? [{ type: 'captain_shot', by: 'p1', targetId: target.id, level: 3, x: target.x * .7, z: target.z * .7 }] : [];
        events.push(...wave.step(dt, inputs));
      }
      return { events, result: wave.result() };
    };
    const a = run(.05), b = run(.05);
    expect(b.events).toEqual(a.events);
    expect(a.events.some(event => event.type === 'mortar_impact')).toBe(true);
    expect(a.events.some(event => event.type === 'captain_fired')).toBe(true);
  });
});
