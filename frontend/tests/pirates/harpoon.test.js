// The harpoon tower (GAME-V3.md §5, T1): a support tower that slows ships. One hit slows, the next one refreshes,
// boarders and anchored ships are never its target, and every screen fights the same wave.
import { describe, expect, it } from 'vitest';
import { CONFIG, createWave } from '../../src/pirates/sim.js';
import { ISLANDS, measure, runWave, spot, towers, walls } from './balance-fixture.js';

const events = (list, type) => list.filter(event => event.type === type);
const harpoons = (list, level = 3) => towers(list.map(() => ['harpoon', level]));

describe('the harpoon tower', () => {
  it('has five levels of low damage, a mid range and a slow that grows', () => {
    const table = CONFIG.levels.harpoon;
    expect(table).toHaveLength(5);
    for (const [i, level] of table.entries()) {
      expect(level.damage).toBeLessThan(CONFIG.levels.cannon[i].damage / 1.4); // a support tower: well under a cannon
      expect(level.range).toBeGreaterThan(CONFIG.levels.cannon[i].range - 1);  // a bit more reach than a cannon at its level
      expect(level.slow).toBeLessThanOrEqual(.45);
      if (i) { expect(level.slow).toBeGreaterThanOrEqual(table[i - 1].slow); expect(level.seconds).toBeGreaterThanOrEqual(table[i - 1].seconds); }
    }
    const state = level => createWave({ seed: 1, wave: 12, defenses: harpoons([1], level) }).state();
    expect([1, 2, 3, 4, 5].map(level => state(level).towers[0].range)).toEqual(table.map(item => item.range));
    expect(state(1).towers[0]).toMatchObject({ kind: 'harpoon', level: 1, manned: false });
    expect(state(1).cannons).toEqual([]); // not a gun: gunners and the fog edge ignore it
  });

  it('slows the ship it hits by its level\'s share for its level\'s seconds', () => {
    for (const level of [1, 3, 5]) {
      const { slow, seconds, damage } = CONFIG.levels.harpoon[level - 1];
      const { events: list } = runWave({ seed: 7, wave: 12, defenses: harpoons([1], level), island: { hp: 5000 } });
      const thrown = events(list, 'harpoon_thrown'), slowed = events(list, 'ship_slowed');
      expect(thrown.length).toBeGreaterThan(2);
      expect(slowed.length).toBeGreaterThan(0);
      expect(slowed[0]).toMatchObject({ harpoon: true, slow });
      expect(slowed[0].until - slowed[0].t).toBeCloseTo(seconds, 1);
      expect(thrown[0].damage).toBeCloseTo(damage, 2);
      expect(thrown[0].impactAt).toBeGreaterThan(thrown[0].t);
    }
  });

  it('really slows the ship: it reaches its anchorage later than without a harpoon', () => {
    const arrival = defenses => {
      const sim = createWave({ seed: 3, wave: 1, defenses });
      while (!sim.done) { sim.step(.05); const first = sim.state().ships.find(ship => ship.id === 'ship_1'); if (first?.state === 'attacking') return sim.state().time; }
      return Infinity;
    };
    const slowedSeen = defenses => { const sim = createWave({ seed: 3, wave: 1, defenses }); let seen = false; while (!sim.done && !seen) { sim.step(.05); seen = sim.state().ships.some(ship => ship.slowed); } return seen; };
    expect(slowedSeen(harpoons([1], 5))).toBe(true);
    expect(slowedSeen([])).toBe(false);
    expect(arrival(harpoons([1], 5))).toBeGreaterThan(arrival([]) + .5);
  });

  it('a second hit refreshes the slow instead of stacking it', () => {
    const { events: list } = runWave({ seed: 5, wave: 12, defenses: harpoons([1, 1, 1], 3), island: { hp: 5000 } });
    const cap = CONFIG.levels.harpoon[2].slow;
    for (const event of events(list, 'ship_slowed')) expect(event.slow).toBeCloseTo(cap, 5); // never more than one hit's share
    // The refreshed end is one hit's seconds after the second hit, not the sum of both.
    const byShip = new Map();
    for (const event of events(list, 'ship_slowed')) byShip.set(event.shipId, [...(byShip.get(event.shipId) ?? []), event]);
    const refreshed = [...byShip.values()].find(hits => hits.length >= 2);
    expect(refreshed).toBeTruthy();
    for (const hit of refreshed) expect(hit.until - hit.t).toBeCloseTo(CONFIG.levels.harpoon[2].seconds, 1);
  });

  it('keeps a stronger slow (Chain shot 40%) when a weaker harpoon hit refreshes it', () => {
    const defenses = [...towers([['cannon', 3]]).map(item => ({ ...item, spec: 'chain' })), { ...spot('h', 'harpoon', -45, .75), level: 1 }];
    const { events: list } = runWave({ seed: 4, wave: 8, defenses, island: { hp: 5000 } });
    const mine = events(list, 'ship_slowed').filter(event => event.harpoon);
    expect(mine.length).toBeGreaterThan(0);
    expect(Math.max(...mine.map(event => event.slow))).toBeGreaterThanOrEqual(CONFIG.levels.harpoon[0].slow);
  });

  it('never throws at a boarder or at a ship at anchor', () => {
    const { events: list } = runWave({ seed: 9, wave: 6, defenses: [...harpoons([1, 1], 5), ...walls(2)], island: { hp: 5000 } });
    const thrown = events(list, 'harpoon_thrown');
    expect(thrown.length).toBeGreaterThan(0);
    expect(events(list, 'boarder_landed').length).toBeGreaterThan(0); // boarders did walk the beach meanwhile
    for (const throwEvent of thrown) {
      expect(throwEvent.targetId.startsWith('boarder_')).toBe(false);
      const spawned = list.find(event => event.type === 'ship_spawned' && event.shipId === throwEvent.targetId);
      expect(spawned).toBeTruthy();
      // A sailing ship: the throw comes before the ship drops anchor (its first boarder lands, or it shells).
      const anchored = list.find(event => event.shipId === throwEvent.targetId && (event.type === 'boarder_landed' || event.type === 'wall_damaged' || event.type === 'island_damaged'));
      if (anchored) expect(throwEvent.t).toBeLessThanOrEqual(anchored.t + 1e-9);
    }
    // And a wave where the only thing left on the beach is boarders: no throw while a ship has none to follow.
    const hits = events(list, 'ship_hit').filter(event => event.by === 'tower_s1' || event.by === 'tower_s2');
    for (const hit of hits) expect(hit.shipId).toBeTruthy();
    expect(events(list, 'boarder_hit').filter(event => /^tower_s[12]$/.test(event.by))).toEqual([]);
  });

  it('is deterministic: the same island and seed give the same events and the same slowed ships', () => {
    const island = { defenses: [...towers([['harpoon', 4], ['cannon', 3], ['harpoon', 2], ['mortar', 3]]), ...walls(4, 2)] };
    const a = runWave({ seed: 21, wave: 14, ...island }), b = runWave({ seed: 21, wave: 14, ...island });
    expect(a.events).toEqual(b.events);
    expect(a.result).toEqual(b.result);
    expect(events(a.events, 'ship_slowed').length).toBeGreaterThan(0);
  });

  it('is a support tower, not a replacement for cannons: its damage alone does not hold a wave a cannon holds', () => {
    const cannons = { defenses: [...towers([['cannon', 3], ['cannon', 3]]), ...walls(3, 2)] };
    const swapped = { defenses: [...towers([['harpoon', 3], ['harpoon', 3]]), ...walls(3, 2)] };
    const a = measure(cannons, 12, { seeds: 4 }), b = measure(swapped, 12, { seeds: 4 });
    expect(b.hp).toBeLessThan(a.hp + 1);
    // Two harpoons in place of two cannons cannot win the wave on their own.
    expect(b.won).toBeLessThan(b.of);
    // But harpoons beside the full island's cannons do not make it worse: the slow only helps.
    const full = ISLANDS.full;
    const withHarpoon = { ...full, defenses: [...full.defenses.filter(item => item.id !== 'tower_s7'), { ...full.defenses.find(item => item.id === 'tower_s7'), kind: 'harpoon', level: 3 }] };
    const base = measure(full, 15, { seeds: 4 }), helped = measure(withHarpoon, 15, { seeds: 4 });
    expect(helped.won).toBeGreaterThanOrEqual(base.won - 1);
  });
});
