// A late-wave load for the new targeting and pathing modules (T34/T35, specs/T34-T35-targeting-pathing.md):
// 300 boarders at once on the home islet's coast grid, today's twelve wall spots as short walls, hacking,
// walls rebuilt during the wave and twelve moving captains, for a whole 150 s wave of 50 ms ticks. It
// checks the routes stay correct under load and prints the measured time, so reviewers can compare.
import { describe, expect, it } from 'vitest';
import { CONFIG, coastPoint, createRandom } from '../../src/pirates/sim.js';
import { buildLayout, cellOf, centreOf, createGrid, spotAsSegment, standingWallAt } from '../../src/pirates/path-grid.js';
import { createFieldCache, lineIsClear, nextStep } from '../../src/pirates/pathing.js';
import { pickTarget } from '../../src/pirates/targeting.js';

const B = CONFIG.boarding, HEART = { x: B.heart.x, z: B.heart.z }, TICK = CONFIG.tick;
const LANDING = .8; // coast radii: a little inland of sim.js's landRadius, so every start is a land cell
const BOARDERS = 300, TICKS = Math.round(CONFIG.maxTime / TICK), REBUILD_EVERY = 100, SPAN = 6;
const PACE = { hackPerSecond: B.hack * 1.5, speed: B.speed * 1.3 }; // about wave 100's curve
// Today's wall spots (island/spots.js): six shore walls as short walls, and the six inner-ring spots
// joined into one closed ring round the heart, the kind of layout flexible placement (T36) allows.
const SHORE = [[-18.5, -4], [4, -19.5], [18.5, -3], [-6, 18.5], [12, 18], [-5, -19.5]];
const RING = [[8.5, 2], [4.5, 9], [-4, 9.5], [-9.5, -1], [-4, -5.5], [4, -5.5]];
const LEVEL_5_HP = CONFIG.levels.wall[4].hp;

function lateWalls() {
  const shore = SHORE.map(([x, z], i) => spotAsSegment({ id: `wall_${i + 1}`, x, z, hp: LEVEL_5_HP, maxHp: LEVEL_5_HP }, HEART, SPAN));
  const ring = RING.map(([x, z], i) => {
    const [nx, nz] = RING[(i + 1) % RING.length];
    return { id: `wall_${i + 7}`, from: { x, z }, to: { x: nx, z: nz }, hp: LEVEL_5_HP, maxHp: LEVEL_5_HP };
  });
  return [...shore, ...ring];
}

function setUp() {
  const coast = CONFIG.coast, grid = createGrid({ minX: -24, minZ: -24, maxX: 24, maxZ: 24,
    isWalkable: (x, z) => (x / coast.rx) ** 2 + (z / coast.rz) ** 2 <= 1 });
  const walls = lateWalls();
  const random = createRandom('late-wave');
  const landing = () => { const point = coastPoint(random() * 2 * Math.PI, LANDING); return { x: point.x, z: point.z }; };
  const boarders = Array.from({ length: BOARDERS }, (_, i) => ({ id: `boarder_${i + 1}`, ...landing(), target: null }));
  return { grid, walls, boarders, landing, cache: createFieldCache(grid) };
}

// The twelve captains walk in a circle round the heart, so targets keep changing.
const captainsAt = tick => Array.from({ length: 12 }, (_, i) => {
  const a = i / 12 * 2 * Math.PI + tick * .002;
  return { id: `captain_${i + 1}`, x: HEART.x + Math.cos(a) * 9, z: HEART.z + Math.sin(a) * 9, hp: 100 };
});

// One tick of one boarder in this simple model: pick a target, then hack, stand and fight, or walk.
function tickBoarder(boarder, world, state) {
  const here = cellOf(state.grid, boarder.x, boarder.z), step = nextStep(state.grid, state.layout, state.field, here);
  const blockingWall = step?.wallId ? state.walls.find(wall => wall.id === step.wallId) : null;
  boarder.target = pickTarget(boarder, { ...world, blockingWall });
  if (boarder.target.kind === 'wall') { blockingWall.hp = Math.max(0, blockingWall.hp - PACE.hackPerSecond * TICK); return 'hacking'; }
  if (boarder.target.kind === 'captain') return 'fighting';
  if (!step) return here === state.field.goalIndex ? 'home' : 'stuck';
  const goal = centreOf(state.grid, step.index), dx = goal.x - boarder.x, dz = goal.z - boarder.z, d = Math.hypot(dx, dz);
  const move = Math.min(d, PACE.speed * TICK);
  if (d > 0) { boarder.x += dx / d * move; boarder.z += dz / d * move; }
  return 'walking';
}

function runLateWave() {
  const state = setUp();
  const counts = { home: 0, stuck: 0, insideWall: 0, rebuilt: 0 };
  const started = performance.now();
  for (let tick = 0; tick < TICKS; tick++) {
    if (tick % REBUILD_EVERY === 0) {
      const broken = state.walls.find(wall => wall.hp <= 0);
      if (broken) { broken.hp = broken.maxHp * .4; counts.rebuilt++; }
    }
    state.layout = buildLayout(state.grid, state.walls, PACE);
    state.field = state.cache.fieldFor(state.layout, HEART);
    const world = { captains: captainsAt(tick), towers: [], heart: HEART,
      canReach: (from, to) => lineIsClear(state.grid, state.layout, from, to) };
    for (const boarder of state.boarders) {
      const was = cellOf(state.grid, boarder.x, boarder.z);
      const outcome = tickBoarder(boarder, world, state);
      const now = cellOf(state.grid, boarder.x, boarder.z);
      // Walked into a wall that still stands (one hacked to 0 earlier in this tick is rubble already).
      const wall = now !== was ? standingWallAt(state.layout, now) : null;
      if (wall && state.walls.find(item => item.id === wall.id).hp > 0) counts.insideWall++;
      if (outcome === 'stuck') counts.stuck++;
      if (outcome === 'home') { counts.home++; Object.assign(boarder, state.landing(), { target: null }); }
    }
  }
  return { ...counts, ms: performance.now() - started, builds: state.cache.builds };
}

describe('late-wave performance of targeting and pathing', () => {
  it('handles 300 boarders for a whole wave: correct routes, few field rebuilds, a small cost per tick', () => {
    const result = runLateWave(), perTick = result.ms / TICKS;
    console.log(`[T35 perf] ${BOARDERS} boarders × ${TICKS} ticks: ${result.ms.toFixed(0)} ms total, ` +
      `${perTick.toFixed(3)} ms per tick, ${result.builds} field builds, ${result.home} reached the heart, ${result.rebuilt} walls rebuilt`);
    expect(result.insideWall).toBe(0);
    expect(result.stuck).toBe(0);
    expect(result.home).toBeGreaterThan(0);     // the closed ring is breached and boarders get through
    expect(result.rebuilt).toBeGreaterThan(0);  // walls broke and were rebuilt during the wave
    expect(result.builds).toBeLessThan(TICKS / 10); // the field is rebuilt on wall changes, not every tick
    expect(perTick).toBeLessThan(25); // generous for slow test machines; the measured figure is printed above
  });
});
