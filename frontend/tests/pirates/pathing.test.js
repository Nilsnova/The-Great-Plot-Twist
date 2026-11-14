// Walls, gaps and rerouting (T35, specs/T34-T35-targeting-pathing.md): closed rings, gaps, breach versus
// detour, a wall rebuilt while a boarder crosses, unreachable goals, no walking through standing walls,
// no endless loops, when a route is recomputed, and the same result for the same inputs.
import { describe, expect, it } from 'vitest';
import { breachCost, buildLayout, cellOf, centreOf, createGrid, spotAsSegment, standingWallAt, wallCells } from '../../src/pirates/path-grid.js';
import { buildField, createFieldCache, followPath, lineIsClear, nextStep } from '../../src/pirates/pathing.js';
import { createRandom } from '../../src/pirates/sim.js';

const PACE = { hackPerSecond: 2.5, speed: 2.8 }; // a wave-1 boarder (CONFIG.boarding hack and speed)
const GRID = createGrid({ minX: -12, minZ: -12, maxX: 12, maxZ: 12 });
const HEART = { x: .5, z: .5 };    // the centre of the middle cell
const EAST = { x: 10.5, z: .5 };   // a landing outside the ring, east of the heart

// A square ring of wall cells `radius` cells around the heart, one wall per side, minus the gap cells.
function ring(radius, { gaps = [], hp = 60, maxHp = 60 } = {}) {
  const sides = { east: [], north: [], south: [], west: [] };
  for (let dc = -radius; dc <= radius; dc++) {
    for (let dr = -radius; dr <= radius; dr++) {
      if (Math.max(Math.abs(dc), Math.abs(dr)) !== radius) continue;
      const point = { x: HEART.x + dc, z: HEART.z + dr };
      if (gaps.some(gap => gap.x === point.x && gap.z === point.z)) continue;
      const side = dc === radius ? 'east' : dc === -radius ? 'west' : dr < 0 ? 'north' : 'south';
      sides[side].push(point);
    }
  }
  return Object.entries(sides).map(([side, cells]) => ({ id: `wall_${side}`, cells, hp, maxHp }));
}
const plan = (walls, from = EAST, grid = GRID) => {
  const layout = buildLayout(grid, walls, PACE), field = buildField(grid, layout, HEART);
  return { layout, field, path: followPath(grid, layout, field, from) };
};
// Every standing wall cell the path enters must be a wall it breaks through (hacks down first).
function expectNoWalkingThrough({ layout, path }, grid = GRID) {
  for (const point of path.points) {
    const wall = standingWallAt(layout, cellOf(grid, point.x, point.z));
    if (wall) expect(path.breaches).toContain(wall.id);
  }
}

describe('walls on the grid', () => {
  it('reads a wall as its own cells, a from/to segment or a single point', () => {
    expect(wallCells(GRID, { cells: [{ x: 1.5, z: .5 }, { x: .5, z: .5 }, { x: .5, z: .5 }] })).toEqual([cellOf(GRID, .5, .5), cellOf(GRID, 1.5, .5)]);
    expect(wallCells(GRID, { from: { x: .5, z: .5 }, to: { x: 3.5, z: .5 } })).toHaveLength(4);
    expect(wallCells(GRID, { x: -18.5, z: -4 })).toEqual([]); // off the grid: no cells
    expect(wallCells(GRID, { x: 2.2, z: 2.7 })).toEqual([cellOf(GRID, 2.5, 2.5)]);
  });

  it('prices a breach as the hacking time in walking distance, changing only at quarter marks', () => {
    expect(breachCost({ hp: 60, maxHp: 60 }, GRID, PACE)).toBe(672); // 24 s of hacking = 67.2 units of walking
    expect(breachCost({ hp: 50, maxHp: 60 }, GRID, PACE)).toBe(672);
    expect(breachCost({ hp: 45, maxHp: 60 }, GRID, PACE)).toBe(504);
  });

  it('turns a fixed wall spot of today into a short wall across the way to the heart', () => {
    const wall = spotAsSegment({ id: 'wall_7', x: 8.5, z: 2, hp: 60 }, { x: 0, z: 2 }, 6);
    expect(wall.from).toEqual({ x: 8.5, z: -1 });
    expect(wall.to).toEqual({ x: 8.5, z: 5 });
    // A lone short wall is walked round, not hacked: today's isolated spots need T36's joined walls to block.
    const result = plan([{ ...wall, x: 4.5, z: .5, from: { x: 4.5, z: -2.5 }, to: { x: 4.5, z: 3.5 } }]);
    expect(result.path.breaches).toEqual([]);
  });

  it('lets the lower id own a cell two walls share, and makes a broken wall free to cross', () => {
    const layout = buildLayout(GRID, [{ id: 'wall_b', x: .5, z: .5, hp: 60 }, { id: 'wall_a', x: .5, z: .5, hp: 0 }], PACE);
    expect(layout.walls[layout.owner[cellOf(GRID, .5, .5)]].id).toBe('wall_a');
    expect(standingWallAt(layout, cellOf(GRID, .5, .5))).toBeNull();
  });
});

describe('closed rings and gaps', () => {
  it('breaks through exactly one wall of a closed ring', () => {
    const result = plan(ring(5));
    expect(result.path.reachable).toBe(true);
    expect(result.path.breaches).toEqual(['wall_east']);
    expectNoWalkingThrough(result);
  });

  it('a diagonal ring is as closed as a square one: no slipping between corner cells', () => {
    const cells = [];
    for (let dc = -5; dc <= 5; dc++) for (const dr of [5 - Math.abs(dc), Math.abs(dc) - 5]) cells.push({ x: HEART.x + dc, z: HEART.z + dr });
    const result = plan([{ id: 'wall_diamond', cells, hp: 60 }]);
    expect(result.path.breaches).toEqual(['wall_diamond']);
    expectNoWalkingThrough(result);
  });

  it('walks round to a gap when the detour is quicker than hacking', () => {
    const gap = { x: HEART.x - 5, z: HEART.z }; // on the far (west) side
    const result = plan(ring(5, { gaps: [gap] }));
    expect(result.path.breaches).toEqual([]);
    expect(result.path.points).toContainEqual(gap);
    expectNoWalkingThrough(result);
  });

  it('breaks through a weak wall when that is quicker than the detour to the gap', () => {
    const walls = ring(5, { gaps: [{ x: HEART.x - 5, z: HEART.z }] }).map(wall => (wall.id === 'wall_east' ? { ...wall, hp: 1, maxHp: 4 } : wall));
    expect(plan(walls).path.breaches).toEqual(['wall_east']);
  });

  it('takes the nearest of several gaps, and the same one of two equal gaps in any wall order', () => {
    const north = { x: HEART.x, z: HEART.z - 5 }, south = { x: HEART.x, z: HEART.z + 5 }, east = { x: HEART.x + 5, z: HEART.z };
    const near = plan(ring(5, { gaps: [north, south, east] }));
    expect(near.path.points).toContainEqual(east);
    expect(near.path.cost).toBe(100); // ten straight steps: no detour at all
    const equal = plan(ring(5, { gaps: [north, south] })), reversed = plan(ring(5, { gaps: [north, south] }).reverse());
    expect(equal.path.breaches).toEqual([]);
    expect(reversed.path).toEqual(equal.path);
    expect([north, south].filter(gap => equal.path.points.some(point => point.x === gap.x && point.z === gap.z))).toHaveLength(1);
  });
});

describe('rebuilt obstacles', () => {
  const gap = { x: HEART.x + 5, z: HEART.z };
  const closed = ring(5, { gaps: [gap] }).map(wall => (wall.id === 'wall_east' ? { ...wall, cells: [...wall.cells, gap] } : wall));

  it('a boarder standing in a gap when the wall is rebuilt around it steps out, never staying inside', () => {
    const { layout, field } = plan(closed);
    const inside = cellOf(GRID, gap.x, gap.z);
    expect(standingWallAt(layout, inside)?.id).toBe('wall_east');
    const next = nextStep(GRID, layout, field, inside);
    expect(next.wallId).toBeNull();
    expect(field.cost[next.index]).toBeLessThan(field.cost[inside]);
    expect(centreOf(GRID, next.index)).toEqual({ x: gap.x - 1, z: gap.z }); // it finishes crossing, inwards
  });

  it('a boarder heading for a gap that is rebuilt reroutes or breaches, never walking through', () => {
    const before = plan(ring(5, { gaps: [gap] }), { x: 8.5, z: .5 });
    expect(before.path.breaches).toEqual([]);
    const after = plan(closed, { x: 8.5, z: .5 });
    expect(after.layout.key).not.toBe(before.layout.key);
    expect(after.path.breaches).toEqual(['wall_east']);
    expectNoWalkingThrough(after);
  });
});

describe('unreachable goals and no endless loops', () => {
  const moat = createGrid({ minX: -12, minZ: -12, maxX: 12, maxZ: 12,
    isWalkable: (x, z) => { const d = Math.max(Math.abs(x - HEART.x), Math.abs(z - HEART.z)); return d < 7 || d > 8; } });

  it('reports a heart cut off by water as unreachable instead of searching forever', () => {
    const result = plan([], EAST, moat);
    expect(result.path.reachable).toBe(false);
    expect(result.path.points).toEqual([]);
    expect(nextStep(moat, result.layout, result.field, cellOf(moat, EAST.x, EAST.z))).toBeNull();
    expect(result.field.cost[cellOf(moat, EAST.x, EAST.z)]).toBe(Infinity);
  });

  it('finds nothing when the goal itself is in the water', () => {
    const sea = createGrid({ minX: -12, minZ: -12, maxX: 12, maxZ: 12, isWalkable: x => x > 3 });
    const field = buildField(sea, buildLayout(sea, [], PACE), HEART);
    expect(field.cost.every(cost => cost === Infinity)).toBe(true);
  });

  it('every step from every cell lowers the cost left, so no boarder can walk in circles', () => {
    const { layout, field } = plan(ring(5, { gaps: [{ x: HEART.x, z: HEART.z - 5 }] }));
    for (let index = 0; index < GRID.cols * GRID.rows; index++) {
      const next = nextStep(GRID, layout, field, index);
      if (next) expect(field.cost[next.index]).toBeLessThan(field.cost[index]);
    }
  });
});

describe('when a route is recomputed', () => {
  it('rebuilds the field only when a wall is placed, moved, removed, broken, rebuilt or passes a quarter mark', () => {
    const cache = createFieldCache(GRID), wall = { id: 'wall_1', x: 3.5, z: .5, hp: 60, maxHp: 60 };
    const fieldAt = walls => cache.fieldFor(buildLayout(GRID, walls, PACE), HEART);
    fieldAt([wall]); fieldAt([wall]); fieldAt([{ ...wall, hp: 50 }]);
    expect(cache.builds).toBe(1); // the same layout, and 50 hp is still in the top quarter
    fieldAt([{ ...wall, hp: 40 }]); expect(cache.builds).toBe(2);
    fieldAt([{ ...wall, hp: 0 }]); expect(cache.builds).toBe(3);
    fieldAt([{ ...wall, hp: 24 }]); expect(cache.builds).toBe(4); // rebuilt
    fieldAt([{ ...wall, hp: 24, x: 4.5 }]); expect(cache.builds).toBe(5); // moved (T36 placement)
    fieldAt([]); expect(cache.builds).toBe(6);                    // removed
  });

  it('checks a straight approach for standing walls and water', () => {
    const wall = { id: 'wall_1', from: { x: 3.5, z: -2 }, to: { x: 3.5, z: 2 }, hp: 60 };
    expect(lineIsClear(GRID, buildLayout(GRID, [wall], PACE), { x: 6, z: .5 }, { x: 1, z: .5 })).toBe(false);
    expect(lineIsClear(GRID, buildLayout(GRID, [{ ...wall, hp: 0 }], PACE), { x: 6, z: .5 }, { x: 1, z: .5 })).toBe(true);
  });
});

describe('the same inputs give the same routes', () => {
  const randomWalls = seed => {
    const random = createRandom(seed);
    return Array.from({ length: 12 }, (_, i) => {
      const x = Math.round(random() * 18 - 9) + .5, z = Math.round(random() * 18 - 9) + .5;
      return { id: `wall_${i}`, from: { x, z }, to: { x: x + Math.round(random() * 6 - 3), z: z + Math.round(random() * 6 - 3) },
        hp: random() < .25 ? 0 : 60, maxHp: 60 };
    });
  };

  it('gives identical fields and paths for the same seed, whatever order the walls come in', () => {
    for (const seed of [1, 2, 3, 'late-wave']) {
      const walls = randomWalls(seed);
      const first = plan(walls), again = plan(randomWalls(seed)), shuffled = plan([...walls].reverse());
      expect(Array.from(again.field.cost)).toEqual(Array.from(first.field.cost));
      expect(Array.from(shuffled.field.cost)).toEqual(Array.from(first.field.cost));
      expect(shuffled.path).toEqual(first.path);
      expect(first.path.reachable).toBe(true);
      expectNoWalkingThrough(first);
    }
  });
});
