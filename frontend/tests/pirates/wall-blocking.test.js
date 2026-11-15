// Walls block until broken (battle clarity, 15 Nov, D053; owner: "only once a wall breaks can pirates go forward ...
// it must never visually walk through a standing wall"). With the wave rule "pathing" a boarder's step stops BODY off
// a standing wall's footprint and it hacks that wall; a wall it heads for it walks right up to before hacking.
// Exceptions by design: a wall rebuilt round a boarder (it walks out) and a Shockwave push.
import { describe, expect, it } from 'vitest';
import { createWave } from '../../src/pirates/sim.js';
import { BODY, edgeDistance, wallInWay } from '../../src/pirates/boarder-paths.js';
import { ISLANDS, islandAt, researched } from './balance-fixture.js';

const RING = [[-3, 5], [-1, 5], [1, 5], [3, 5], [3, 3], [3, 1], [3, -1], [1, -1], [-1, -1], [-3, -1], [-3, 1], [-3, 3]];
const ringOf = island => {
  let i = 0;
  return { ...island, defenses: island.defenses.map(item => (item.kind === 'wall' && RING[i] ? { ...item, x: RING[i][0], z: RING[i++][1] } : item)) };
};
const noCarpenters = island => ({ ...island, crew: { ...(island.crew ?? {}), carpenter: 0 } });

/** Plays a wave with pathing and checks every boarder position against every standing wall, each tick. */
function watch(island, wave, seed) {
  const sim = createWave({ seed, wave, pathing: true, ...island });
  const where = new Map(island.defenses.filter(item => item.kind === 'wall').map(item => [item.id, item]));
  const out = { inside: [], hackGap: 0, hacks: 0, trace: [] };
  for (let i = 0; i < 20000 && !sim.done; i++) {
    sim.step(.25);
    const state = sim.state();
    for (const boarder of state.boarders) {
      for (const wall of state.walls) {
        if (!(wall.hp > 0)) continue;
        const at = where.get(wall.id);
        if (Math.abs(boarder.x - at.x) < 1 - .02 && Math.abs(boarder.z - at.z) < 1 - .02) out.inside.push(`${boarder.id} in ${wall.id} at ${state.time}`);
      }
      if (boarder.state === 'hacking' && boarder.wallId) { out.hacks++; out.hackGap = Math.max(out.hackGap, edgeDistance(boarder, where.get(boarder.wallId))); }
    }
    if (i % 8 === 0) out.trace.push(state.boarders.map(item => `${item.id}:${item.x},${item.z},${item.state}`).join(';'));
  }
  return out;
}

describe('walls block until broken (pathing)', () => {
  for (const [name, island, wave] of [['mid island', ISLANDS.mid, 10], ['full island on a closed ring', ringOf(noCarpenters(ISLANDS.full)), 35],
    ['researched level-5 island', noCarpenters(researched(islandAt(5))), 45]]) {
    it(`${name}, wave ${wave}: no boarder ever stands inside a standing wall, and each hacks from right at its wall`, () => {
      const run = watch(island, wave, 7919);
      expect(run.inside).toEqual([]);
      expect(run.hacks).toBeGreaterThan(0);
      expect(run.hackGap).toBeLessThanOrEqual(BODY + .2); // at the wall, not from 3 units away
    }, 60000);
  }
  it('plays the same for the same seed', () => {
    const island = ringOf(noCarpenters(ISLANDS.full));
    expect(watch(island, 20, 4242).trace).toEqual(watch(island, 20, 4242).trace);
  }, 60000);
});

describe('wallInWay', () => {
  const walls = [{ id: 'wall_a', x: 0, z: 0, hp: 10 }, { id: 'wall_b', x: 4, z: 0, hp: 10 }];
  it('stops a step BODY before the first standing wall on it', () => {
    const hit = wallInWay({ x: -5, z: 0 }, { x: 5, z: 0 }, walls);
    expect(hit.wall.id).toBe('wall_a');
    expect(-5 + 10 * hit.t).toBeCloseTo(-1 - BODY, 9);
  });
  it('lets a step pass beside a wall, through rubble, and out of a wall it stands in', () => {
    expect(wallInWay({ x: -5, z: 2 }, { x: 5, z: 2 }, walls)).toBeNull();
    expect(wallInWay({ x: -5, z: 0 }, { x: 5, z: 0 }, [{ ...walls[0], hp: 0 }, walls[1]]).wall.id).toBe('wall_b');
    expect(wallInWay({ x: .2, z: 0 }, { x: 2, z: 0 }, [walls[0]])).toBeNull();
  });
  it('keeps a boarder that already stands next to a wall out of its footprint', () => {
    const hit = wallInWay({ x: -1.2, z: 0 }, { x: 0, z: 0 }, walls);
    expect(hit.wall.id).toBe('wall_a');
    expect(-1.2 + 1.2 * hit.t).toBeCloseTo(-1, 9);
  });
});
