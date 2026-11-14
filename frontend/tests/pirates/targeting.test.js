// Enemy target priorities (T34, specs/T34-T35-targeting-pathing.md): the target matrix per enemy type,
// captain limits, keeping and switching targets, equal-distance ties, dead/unreachable/destroyed/rebuilt
// targets and the same pick for the same inputs in any order.
import { describe, expect, it } from 'vitest';
import { TARGET_PROFILES, nearestWithin, pickTarget, profileFor } from '../../src/pirates/targeting.js';
import { CONFIG, createRandom } from '../../src/pirates/sim.js';
import { buildLayout, createGrid } from '../../src/pirates/path-grid.js';
import { lineIsClear } from '../../src/pirates/pathing.js';

const HEART = { x: 0, z: 0 };
const WALL = { id: 'wall_7', x: 4, z: 0, hp: 60, maxHp: 60 };
const captain = (id, x, z, extra = {}) => ({ id, x, z, hp: 100, ...extra });
const enemy = (extra = {}) => ({ id: 'boarder_1', x: 6, z: 0, ...extra });
const world = (extra = {}) => ({ captains: [], towers: [], blockingWall: null, heart: HEART, ...extra });

describe('target matrix by enemy type', () => {
  it('a boarder goes for a captain in reach first, then the wall in its way, then a tower, then the heart', () => {
    const all = world({ captains: [captain('a', 7, 0)], blockingWall: WALL, towers: [{ id: 'cannon_1', x: 6, z: 1, hp: 50 }] });
    expect(pickTarget(enemy(), all).kind).toBe('captain');
    expect(pickTarget(enemy(), { ...all, captains: [] }).kind).toBe('wall');
    expect(pickTarget(enemy(), { ...all, captains: [], blockingWall: null })).toMatchObject({ kind: 'tower', id: 'cannon_1' });
    expect(pickTarget(enemy(), world())).toEqual({ kind: 'heart', x: 0, z: 0 });
  });

  it('a brute (proposed) hacks the wall in its way before a captain and fights a captain only right next to it', () => {
    const brute = TARGET_PROFILES.brute;
    const all = world({ captains: [captain('a', 7, 0)], blockingWall: WALL });
    expect(pickTarget(enemy(), all, brute).kind).toBe('wall');
    expect(pickTarget(enemy(), { ...all, blockingWall: null }, brute).kind).toBe('captain'); // 1 unit away: within 1.5
    expect(pickTarget(enemy(), world({ captains: [captain('a', 8, 0)] }), brute).kind).toBe('heart'); // 2 units: walks on
  });

  it('uses the boarder profile for everyone unless brutes are switched on', () => {
    expect(profileFor({ brute: true })).toBe(TARGET_PROFILES.boarder);
    expect(profileFor({ brute: true }, { brutes: true })).toBe(TARGET_PROFILES.brute);
    expect(profileFor({}, { brutes: true })).toBe(TARGET_PROFILES.boarder);
  });

  it('keeps the boarder numbers equal to the captain-health numbers sim.js uses today', () => {
    const { reach, leash, crowd } = CONFIG.health;
    expect(TARGET_PROFILES.boarder).toMatchObject({ captainReach: reach, leash, crowd });
  });
});

describe('captain limits', () => {
  it('ignores captains who are down, away or out of hp, and captains beyond reach', () => {
    const list = [captain('a', 7, 0, { down: true }), captain('b', 7, 0, { away: true }), captain('c', 7, 0, { hp: 0 }), captain('d', 9.5, 0)];
    expect(pickTarget(enemy(), world({ captains: list })).kind).toBe('heart');
  });

  it('leaves a captain with a full crowd on them and takes the next one', () => {
    const crowdOf = (kind, id) => (id === 'a' ? 3 : 0);
    const picked = pickTarget(enemy(), world({ captains: [captain('a', 6.5, 0), captain('b', 8, 0)], crowdOf }));
    expect(picked).toMatchObject({ kind: 'captain', id: 'b' });
  });

  it('a Barracks militia counts like a captain', () => {
    const militia = { id: 'militia_1', militia: true, x: 7, z: 0, hp: 60 };
    expect(pickTarget(enemy(), world({ captains: [militia] }))).toMatchObject({ kind: 'captain', id: 'militia_1' });
  });
});

describe('keeping and switching targets', () => {
  it('stays on its captain within the leash although a nearer captain walks up', () => {
    const held = enemy({ target: { kind: 'captain', id: 'a' } });
    const picked = pickTarget(held, world({ captains: [captain('a', 10, 0), captain('b', 6.5, 0)] }));
    expect(picked).toMatchObject({ kind: 'captain', id: 'a' });
  });

  it('lets go of a captain past the leash and takes the next target', () => {
    const held = enemy({ target: { kind: 'captain', id: 'a' } });
    expect(pickTarget(held, world({ captains: [captain('a', 11.5, 0)], blockingWall: WALL })).kind).toBe('wall');
  });

  it('a boarder at a wall turns on a captain who comes within reach; a brute keeps hacking', () => {
    const hacking = enemy({ target: { kind: 'wall', id: 'wall_7' } });
    const near = world({ captains: [captain('a', 7, 1)], blockingWall: WALL });
    expect(pickTarget(hacking, near).kind).toBe('captain');
    expect(pickTarget(hacking, near, TARGET_PROFILES.brute).kind).toBe('wall');
  });

  it('drops a wall that is no longer in the way once the route goes round it', () => {
    const hacking = enemy({ target: { kind: 'wall', id: 'wall_7' } });
    expect(pickTarget(hacking, world({ blockingWall: null })).kind).toBe('heart');
  });
});

describe('equal-distance ties and input order', () => {
  it('gives two captains at the same distance to the lower id, whatever the list order', () => {
    const left = captain('captain_b', 6, 2), right = captain('captain_a', 6, -2);
    expect(pickTarget(enemy(), world({ captains: [left, right] }))).toMatchObject({ id: 'captain_a' });
    expect(pickTarget(enemy(), world({ captains: [right, left] }))).toMatchObject({ id: 'captain_a' });
  });

  it('gives two towers at the same distance to the lower id', () => {
    const towers = [{ id: 'cannon_3', x: 6, z: 1, hp: 10 }, { id: 'cannon_2', x: 6, z: -1, hp: 10 }];
    expect(pickTarget(enemy(), world({ towers, heart: null }))).toMatchObject({ kind: 'tower', id: 'cannon_2' });
  });

  it('nearestWithin treats distances closer than a billionth as equal', () => {
    const list = [{ id: 'b', x: 1, z: 0 }, { id: 'a', x: 1 + 1e-12, z: 0 }];
    expect(nearestWithin({ x: 0, z: 0 }, list, 5, () => true).id).toBe('a');
  });

  it('picks the same targets for the same seed and inputs, in any order', () => {
    const random = createRandom('t34');
    for (let round = 0; round < 200; round++) {
      const captains = Array.from({ length: 5 }, (_, i) => captain(`c${i}`, Math.round(random() * 8), Math.round(random() * 8), { down: random() < .2 }));
      const towers = Array.from({ length: 3 }, (_, i) => ({ id: `t${i}`, x: Math.round(random() * 8), z: Math.round(random() * 8), hp: random() < .3 ? 0 : 10 }));
      const at = enemy({ x: Math.round(random() * 8), z: Math.round(random() * 8) });
      const first = pickTarget(at, world({ captains, towers }));
      const again = pickTarget(at, world({ captains: [...captains].reverse(), towers: [...towers].reverse() }));
      expect(again).toEqual(first);
    }
  });
});

describe('dead, unreachable, destroyed and rebuilt targets', () => {
  it('a captain who falls is dropped at once', () => {
    const held = enemy({ target: { kind: 'captain', id: 'a' } });
    expect(pickTarget(held, world({ captains: [captain('a', 7, 0, { down: true, hp: 0 })] })).kind).toBe('heart');
  });

  it('a revived captain is a target again', () => {
    expect(pickTarget(enemy(), world({ captains: [captain('a', 7, 0, { hp: 50 })] })).kind).toBe('captain');
  });

  it('skips a captain behind a standing wall and goes for them once the wall is broken', () => {
    const grid = createGrid({ minX: -12, minZ: -12, maxX: 12, maxZ: 12 });
    const pace = { hackPerSecond: 2.5, speed: 2.8 };
    const wall = { id: 'wall_1', from: { x: 5.5, z: -3 }, to: { x: 5.5, z: 3 }, hp: 60, maxHp: 60 };
    const reachWith = layout => (from, to) => lineIsClear(grid, layout, from, to);
    const hero = captain('a', 4.5, 0), at = enemy({ x: 6.5 });
    expect(pickTarget(at, world({ captains: [hero], canReach: reachWith(buildLayout(grid, [wall], pace)) })).kind).toBe('heart');
    const broken = buildLayout(grid, [{ ...wall, hp: 0 }], pace);
    expect(pickTarget(at, world({ captains: [hero], canReach: reachWith(broken) })).kind).toBe('captain');
  });

  it('has nothing to go for when the heart cannot be reached and nothing else is near', () => {
    expect(pickTarget(enemy(), world({ heartReachable: false }))).toEqual({ kind: 'none' });
  });

  it('ignores towers without hp (before T33) and destroyed towers, and takes a rebuilt tower again', () => {
    const tower = { id: 'cannon_1', x: 6, z: 1 };
    expect(pickTarget(enemy(), world({ towers: [tower] })).kind).toBe('heart');
    expect(pickTarget(enemy(), world({ towers: [{ ...tower, hp: 0 }] })).kind).toBe('heart');
    const held = enemy({ target: { kind: 'tower', id: 'cannon_1' } });
    expect(pickTarget(held, world({ towers: [{ ...tower, hp: 0 }] })).kind).toBe('heart');
    expect(pickTarget(enemy(), world({ towers: [{ ...tower, hp: 30 }] }))).toMatchObject({ kind: 'tower', id: 'cannon_1' });
  });

  it('leaves a broken wall for the heart and hacks the same wall again once it is rebuilt', () => {
    const held = enemy({ target: { kind: 'wall', id: 'wall_7' } });
    expect(pickTarget(held, world({ blockingWall: { ...WALL, hp: 0 } })).kind).toBe('heart');
    expect(pickTarget(enemy(), world({ blockingWall: { ...WALL, hp: 24 } }))).toMatchObject({ kind: 'wall', id: 'wall_7' });
  });
});
