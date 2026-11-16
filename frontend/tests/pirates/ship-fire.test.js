// T50 (the owner's play-test, 16 Nov): with the wave rule ship_fire a ship at anchor fires at a real wall, tower or
// the heart (src/pirates/ship-fire.js, TARGET_PROFILES.ship), its ball flies and the impact costs that target hp,
// never a shot at an empty beach. Headless at the sim's fixed tick; balance with the fixtures of balance-fixture.js.
import { describe, expect, it } from 'vitest';
import { CONFIG, coastPoint, createWave } from '../../src/pirates/sim.js';
import { SHIP_FIRE, createShipFire } from '../../src/pirates/ship-fire.js';
import { TARGET_PROFILES } from '../../src/pirates/targeting.js';
import { captainStats } from '../../src/pirates/captain-stats.js';
import { ISLANDS, crewMeasure, islandAt, researched, runWave, spot, towers } from './balance-fixture.js';

const LIVE = { towerHealth: true, pathing: true };        // the rules on in production (16 Nov)
const FIRE = { ...LIVE, shipFire: true };
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8].map(n => n * 7919);
const shots = events => events.filter(e => e.type === 'ship_fired');

describe('ship fire: the targets (ship-fire.js)', () => {
  const hooks = () => {
    const log = [];
    return { log, hitWall: (wall, damage) => { log.push(['wall', wall.id, damage]); wall.hp -= damage; },
      hurtIsland: damage => log.push(['heart', damage]), hurtCaptain: (hero, damage) => log.push(['captain', hero.id, damage]) };
  };
  const tower = (id, x, z, hp = 80) => ({ id, x, z, hp, maxHp: 80 });
  const health = { isTarget: item => item.hp > 0, hit: (item, damage, by, events) => { item.hp -= damage; events.push({ type: 'tower_damaged', towerId: item.id, damage }); } };
  const ship = { id: 'ship_1', kind: 'sloop', x: 21.6, z: 0, damage: 3 };

  it('aims by the T34 order for ships: the wall on its beach, else a tower by its beach, else the heart, else nothing', () => {
    const h = hooks(), walls = [{ id: 'wall_3', x: 19, z: -1, hp: 60 }], list = [tower('cannon_6', 14.5, -3)];
    const fire = createShipFire({ enabled: true, walls, towers: list, towerHealth: health, heart: { x: 0, z: 2 }, ...h });
    expect(fire.pick(ship)).toMatchObject({ kind: 'wall', item: { id: 'wall_3' } });
    walls[0].hp = 0;
    expect(fire.pick(ship)).toMatchObject({ kind: 'tower', item: { id: 'cannon_6' } });
    list[0].hp = 0;
    expect(fire.pick(ship)).toMatchObject({ kind: 'heart' });
    // A corner tower is not "by its beach": beyond towerReach the ship goes for the heart.
    const far = createShipFire({ enabled: true, towers: [tower('cannon_2', 13, -15)], towerHealth: health, heart: { x: 0, z: 2 }, ...h });
    expect(far.pick(ship).kind).toBe('heart');
    // Nothing in reach (a heart 30 units off): no shot at all, no event.
    const none = createShipFire({ enabled: true, heart: { x: -10, z: 2 }, ...h }), events = [];
    expect(none.pick(ship)).toBeNull();
    expect(none.aim(ship, 0, events)).toBe(false);
    expect(events).toEqual([]);
    expect(TARGET_PROFILES.ship.order).toEqual(['wall', 'tower', 'heart']);
  });

  it('the ball flies; a target that broke meanwhile takes nothing, and captains next to the impact take a little', () => {
    const h = hooks(), walls = [{ id: 'wall_3', x: 19, z: -1, hp: 60 }];
    const captains = [{ id: 'b', x: 19.5, z: -1 }, { id: 'a', x: 19, z: -.5 }, { id: 'far', x: 15, z: -1 }];
    const fire = createShipFire({ enabled: true, walls, heart: { x: 0, z: 2 }, captains: () => captains, powerOf: () => 3, ...h }), events = [];
    expect(fire.aim(ship, 10, events)).toBe(true);
    const [fired] = events;
    expect(fired).toMatchObject({ type: 'ship_fired', shipId: 'ship_1', target: 'wall', targetId: 'wall_3', toX: 19, toZ: -1, damage: 3, power: 3 });
    expect(fired.impactAt).toBeCloseTo(10 + Math.hypot(2.6, 1) / SHIP_FIRE.shotSpeed, 2);
    fire.land(10, events);
    expect(h.log).toEqual([]); // still in the air
    fire.land(fired.impactAt, events);
    expect(h.log).toEqual([['wall', 'wall_3', 3], ['captain', 'a', .75], ['captain', 'b', .75]]); // id order; 'far' is out of the splash
    expect(fire.state()).toEqual([]);
    // A second ball, then the wall breaks before it lands: it lands in the rubble.
    fire.aim(ship, 20, events); walls[0].hp = 0; h.log.length = 0;
    fire.land(30, events);
    expect(h.log.filter(([kind]) => kind === 'wall')).toEqual([]);
  });

  it('is inert without the rule', () => {
    const fire = createShipFire({ enabled: false });
    expect(fire.enabled).toBe(false);
    expect(fire.aim(ship, 0, [])).toBe(false);
  });
});

describe('ship fire in the sim (the wave rule ship_fire)', () => {
  const harpoon = [spot('cannon_6', 'harpoon', 0, .6)]; // by the east beach; a harpoon never shoots an anchored ship

  it('without the rule a wave plays exactly as before (ships shell the beach in front of them)', () => {
    const off = runWave({ seed: 7919, wave: 1, ...LIVE }), omitted = runWave({ seed: 7919, wave: 1, ...LIVE, shipFire: false });
    expect(JSON.stringify(off.events)).toBe(JSON.stringify(omitted.events));
    expect(shots(off.events)).toEqual([]);
    expect(off.state.shipShots).toBeUndefined();
    const shell = off.events.find(e => e.type === 'island_damaged' && e.shipId);
    expect(shell.damage).toBeCloseTo(3 * CONFIG.boarding.shellShare, 1);
  });

  it('every shot aims at something real: a standing wall, a standing tower or the heart', () => {
    for (const island of [{ defenses: [] }, { defenses: harpoon }, ISLANDS.first, ISLANDS.boss5, ISLANDS.mid]) {
      for (const wave of [1, 3, 5, 10]) {
        const sim = createWave({ seed: 7919, wave, ...island, ...FIRE });
        while (!sim.done) {
          const before = sim.state();
          for (const e of sim.step(.05)) {
            if (e.type !== 'ship_fired') continue;
            if (e.target === 'heart') expect([e.toX, e.toZ]).toEqual([before.heart.x, before.heart.z]);
            else {
              const item = (e.target === 'wall' ? before.walls : before.towers).find(entry => entry.id === e.targetId);
              expect(item?.hp, `${e.target} ${e.targetId}`).toBeGreaterThan(0);
              const placed = island.defenses.find(entry => entry.id === e.targetId);
              expect([e.toX, e.toZ]).toEqual([Math.round(placed.x * 100) / 100, Math.round(placed.z * 100) / 100]);
            }
          }
        }
      }
    }
  });

  it('a ball on the heart costs its ♥, and ignoring the ships now loses wave 1', () => {
    const { events, result } = runWave({ seed: 7919, wave: 1, defenses: [], ...FIRE });
    const hits = events.filter(e => e.type === 'island_damaged' && e.shipId);
    expect(hits.length).toBeGreaterThan(10);
    expect(hits.every(e => e.landed && e.x === CONFIG.boarding.heart.x && e.z === CONFIG.boarding.heart.z)).toBe(true);
    expect(hits.slice(0, -1).every(e => Math.abs(e.damage - 3 * SHIP_FIRE.heart) < 1e-9)).toBe(true); // a sloop: 0.6 ♥ (the last one what was left)
    expect(shots(events).every(e => e.target === 'heart')).toBe(true);
    expect(result.survived).toBe(false);
    // Before the rule the same wave was held with a sliver of the heart: the ships' shots did next to nothing.
    expect(runWave({ seed: 7919, wave: 1, defenses: [], ...LIVE }).result.survived).toBe(true);
  });

  it('a ball on a tower costs it hp under the tower-health rules; once it is broken the ships turn to the heart', () => {
    const { events } = runWave({ seed: 7919, wave: 1, defenses: harpoon, ...FIRE });
    const hits = events.filter(e => e.type === 'tower_damaged' && String(e.by).startsWith('ship_'));
    expect(hits.length).toBeGreaterThan(5);
    expect(hits[0]).toMatchObject({ towerId: 'cannon_6', damage: 3 * SHIP_FIRE.tower, maxHp: 60 });
    const broke = events.findIndex(e => e.type === 'tower_broken' && String(e.by).startsWith('ship_'));
    expect(broke).toBeGreaterThan(0);
    const after = shots(events.slice(broke));
    expect(after.length).toBeGreaterThan(0);
    expect(after.every(e => e.target === 'heart')).toBe(true);
    // Without tower health a tower has no hp and is no target: the same ships shoot the heart from the start.
    expect(shots(runWave({ seed: 7919, wave: 1, defenses: harpoon, pathing: true, shipFire: true }).events).every(e => e.target === 'heart')).toBe(true);
  });

  it('a shore wall on the beach is shelled first, as before the rule', () => {
    const wall = spot('wall_3', 'wall', 0, .95);
    const { events } = runWave({ seed: 7919, wave: 1, defenses: [wall, ...harpoon], ...FIRE });
    const first = shots(events)[0];
    expect(first).toMatchObject({ target: 'wall', targetId: 'wall_3' });
    expect(events.find(e => e.type === 'wall_damaged' && e.shipId)).toMatchObject({ wallId: 'wall_3', landed: true, damage: 3 });
  });

  it('a captain next to the impact takes a little; one away from it nothing', () => {
    const heart = CONFIG.boarding.heart;
    const run = at => runWave({ seed: 7919, wave: 1, defenses: [], ...FIRE }, () => [{ type: 'captain_move', by: 'c0', x: at.x, z: at.z }]).events
      .filter(e => e.type === 'captain_hit' && e.shipId);
    const near = run(heart), far = run({ x: 0, z: -14 });
    expect(near.length).toBeGreaterThan(0);
    expect(near[0]).toMatchObject({ captainId: 'c0', damage: 3 * SHIP_FIRE.splash.share });
    expect(far).toEqual([]);
  });

  it('is the same wave on every screen: the same seed and inputs give the same shots and heart, whatever the frame rate', () => {
    const play = dt => {
      const sim = createWave({ seed: 4242, wave: 3, ...ISLANDS.first, ...FIRE }), events = [];
      let k = 0;
      while (!sim.done) events.push(...sim.step(dt, k++ % 4 === 0 ? [{ type: 'captain_move', by: 'c0', x: 0, z: 2 }] : []));
      return { events: events.filter(e => e.type !== 'captain_move'), result: sim.result() };
    };
    // Inputs are fed per step, so compare runs with the same dt for the inputs, and pure runs across frame rates.
    expect(JSON.stringify(play(.25))).toBe(JSON.stringify(play(.25)));
    const pure = dt => { const sim = createWave({ seed: 4242, wave: 3, ...ISLANDS.first, ...FIRE }), events = []; while (!sim.done) events.push(...sim.step(dt)); return events; };
    const a = pure(.05), b = pure(.4);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(shots(a).length).toBeGreaterThan(0);
  });
});

// A new player who fights: one level-1 captain who strikes a boarder next to them, else shoots the nearest pirate in
// musket range, else walks (5 units a second, staying on the island) towards it.
function newPlayerWave(island, wave, seed) {
  const sim = createWave({ seed, wave, ...island, ...FIRE }), gun = captainStats(1, []), me = { x: 0, z: 2 };
  const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  let t = 0, ready = 0;
  while (!sim.done) {
    const s = sim.state(), inputs = [{ type: 'captain_move', by: 'c0', x: me.x, z: me.z }];
    if (!s.party?.find(hero => hero.id === 'c0')?.down) {
      const close = s.boarders.find(item => d(item, me) < 2.6);
      const foe = [...s.boarders, ...s.ships].sort((a, b) => d(a, me) - d(b, me))[0];
      if (close) inputs.push({ type: 'captain_strike', by: 'c0', targetId: close.id, level: 1, skills: [], x: me.x, z: me.z });
      else if (foe && d(foe, me) <= gun.range) {
        if (t >= ready) { inputs.push({ type: 'captain_shot', by: 'c0', targetId: foe.id, level: 1, skills: [], x: me.x, z: me.z, ax: foe.x, az: foe.z }); ready = t + gun.reload; }
      } else if (foe) {
        const step = Math.min(1.25, d(foe, me)), dist = d(foe, me);
        let x = me.x + (foe.x - me.x) / dist * step, z = me.z + (foe.z - me.z) / dist * step;
        const edge = coastPoint(Math.atan2(z / CONFIG.coast.rz, x / CONFIG.coast.rx), .85);
        if (Math.hypot(x, z) > Math.hypot(edge.x, edge.z)) { x = edge.x; z = edge.z; }
        me.x = x; me.z = z;
      }
    }
    sim.step(.25, inputs); t += .25;
  }
  return sim.result();
}

describe('ship fire: balance', () => {
  const won = (fn) => SEEDS.filter(seed => fn(seed).survived).length;
  const two = { defenses: towers([['cannon', 1], ['cannon', 1]]) };

  it('waves 1 to 3 stay winnable for a new player who builds a cannon or two', () => {
    for (const wave of [1, 2, 3]) {
      expect(won(seed => runWave({ seed, wave, ...two, ...FIRE }).result), `two cannons alone, wave ${wave}`).toBe(8);
      expect(won(seed => newPlayerWave(ISLANDS.first, wave, seed)), `one cannon and a captain who fights, wave ${wave}`).toBeGreaterThanOrEqual(wave < 3 ? 8 : 6);
    }
  }, 60000);

  it('ignoring the ships now costs the wave: nothing built and nobody shooting loses wave 1 (it was held before)', () => {
    expect(won(seed => runWave({ seed, wave: 1, defenses: [], ...FIRE }).result)).toBe(0);
    expect(won(seed => runWave({ seed, wave: 1, defenses: [], ...LIVE }).result)).toBe(8);
  }, 60000);

  it('a strong, full crew still wins waves 30, 50, 70 and the final battle; the heart still takes a beating at 100', () => {
    const strong = { ...researched(islandAt(5)), ...FIRE };
    for (const wave of [30, 50, 70]) expect(crewMeasure(strong, wave, 10), `wave ${wave}`).toMatchObject({ won: 4 });
    const final = crewMeasure(strong, 100, 10);
    expect(final.won).toBe(4);
    expect(final.hp).toBeLessThan(90);
  }, 180000);
});
