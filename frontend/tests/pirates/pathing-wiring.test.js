// The T34/T35 routes wired into the wave (sim.js option pathing, the server's rule "pathing"; decision
// D040, proposed): walls stand on their T36 footprints, boarders take a gap or break through a closed
// ring, never stand inside a standing wall, and the same seed and inputs give the same wave. Without the
// option the fixed routes stay (D040 option A).
import { describe, expect, it } from 'vitest';
import { createWave } from '../../src/pirates/sim.js';
import { towerEdgeDistance } from '../../src/pirates/tower-obstacles.js';
import { WALL_ENGAGE, WALL_FOOTPRINT, createBoarderPaths, footprintPoints, isOnLand, obstacleInWay } from '../../src/pirates/boarder-paths.js';
import { cellOf, standingWallAt } from '../../src/pirates/path-grid.js';
import { FOOTPRINTS } from '../../src/island/placement.js';
import { surfaces } from '../../src/world/places/surfaces.js';
import { walls as shoreWalls, ring } from './balance-fixture.js';

const COAST = { ...surfaces.home_islet };
const HEART = { x: 0, z: 2 };
// A closed square ring of 2 x 2 walls, edge to edge, 6 units around the heart (24 walls, outside the keep-out).
function closedRing(hp = 1) {
  const out = [];
  for (let x = -6; x <= 6; x += 2) for (let z = -4; z <= 8; z += 2) {
    if (Math.abs(x) === 6 || z === -4 || z === 8) out.push({ id: `wall_${String(out.length + 1).padStart(2, '0')}`, kind: 'wall', level: hp, x, z });
  }
  return out;
}
const run = (options, until = () => false) => {
  const wave = createWave({ seed: 21, wave: 4, island: { hp: 5000 }, ...options });
  const events = [];
  while (!wave.done && !until(wave)) events.push(...wave.step(.25));
  return { wave, events };
};

describe('the island grid for boarders', () => {
  it('uses the T36 wall footprint and marks only the cells a wall covers', () => {
    expect(WALL_FOOTPRINT).toBe(FOOTPRINTS.wall);
    const points = footprintPoints({ x: 8.5, z: 2 });
    expect(points).toHaveLength(16);
    expect(Math.min(...points.map(p => p.x))).toBeCloseTo(7.75);
    expect(Math.max(...points.map(p => p.x))).toBeCloseTo(9.25);
  });

  it('knows land from sea by the same coast as the ships', () => {
    expect(isOnLand(0, 2, COAST)).toBe(true);
    expect(isOnLand(COAST.rx * 1.3, 0, COAST)).toBe(false);
  });

  it('breaks through one wall of a closed ring, hacks a lone wall across its way and walks past one beside it', () => {
    const ringWalls = closedRing().map(item => ({ ...item, hp: 60, maxHp: 60 }));
    const paths = createBoarderPaths({ coast: COAST, heart: HEART, walls: ringWalls, pace: { hackPerSecond: 2.5, speed: 2.8 } });
    paths.refresh();
    const boarder = { x: 15, z: 2 }, breaches = new Set();
    for (let i = 0; i < 200; i++) {
      const way = paths.next(boarder);
      if (way.kind === 'heart' || way.kind === 'none') break;
      if (way.kind === 'wall') { breaches.add(way.wallId); ringWalls.find(w => w.id === way.wallId).hp = 0; paths.refresh(); continue; }
      boarder.x = way.x; boarder.z = way.z;
    }
    expect(breaches.size).toBe(1);
    // The balance retune (WALL_ENGAGE, specs/T33-T35-balance.md): a lone wall across the straight way to the
    // heart is hacked, as on the fixed routes; one beside the way is walked past.
    const across = [{ id: 'wall_1', x: 10, z: 2, hp: 60, maxHp: 60 }];
    const blocked = createBoarderPaths({ coast: COAST, heart: HEART, walls: across, pace: { hackPerSecond: 2.5, speed: 2.8 } });
    blocked.refresh();
    const hacker = { x: 15, z: 2 };
    let hacked = null;
    for (let i = 0; i < 200 && !hacked; i++) {
      const way = blocked.next(hacker);
      if (way.kind === 'wall') hacked = way.wallId;
      if (way.kind !== 'step') break;
      hacker.x = way.x; hacker.z = way.z;
    }
    expect(hacked).toBe('wall_1');
    expect(Math.abs(hacker.x - 10) - 1).toBeLessThanOrEqual(WALL_ENGAGE + 1e-9);
    const beside = [{ id: 'wall_1', x: 10, z: 7, hp: 60, maxHp: 60 }];
    const round = createBoarderPaths({ coast: COAST, heart: HEART, walls: beside, pace: { hackPerSecond: 2.5, speed: 2.8 } });
    round.refresh();
    const walker = { x: 15, z: 2 };
    for (let i = 0; i < 200; i++) {
      const way = round.next(walker);
      expect(way.kind).not.toBe('wall');
      if (way.kind !== 'step') break;
      walker.x = way.x; walker.z = way.z;
    }
  });

  it('treats a closed ring of cheap standing towers as a breakable route obstacle', () => {
    const towers = [];
    for (let x = -6; x <= 6; x += 2) for (let z = -4; z <= 8; z += 2) {
      if (Math.abs(x) === 6 || z === -4 || z === 8) {
        towers.push({id: `cannon_${String(towers.length + 1).padStart(2, '0')}`, kind: 'cannon', x, z, hp: 1, maxHp: 1});
      }
    }
    const paths = createBoarderPaths({coast: COAST, heart: HEART, walls: [], towers, towerBlocking: true,
      pace: {hackPerSecond: 2.5, speed: 2.8}});
    paths.refresh();
    const boarder = {x: 15, z: 2};
    let target = null;
    for (let i = 0; i < 200 && !target; i++) {
      const way = paths.next(boarder);
      if (way.kind === 'tower') target = way.towerId;
      if (way.kind !== 'step') break;
      boarder.x = way.x; boarder.z = way.z;
    }
    expect(target).not.toBeNull();
    expect(target).toMatch(/^cannon_/);
  });

  it('adds an initially broken tower back to the route field when it is rebuilt', () => {
    const towers = closedRing().map((item, index) => ({...item, id: `cannon_${index + 1}`, kind: 'cannon', hp: 0, maxHp: 80}));
    const paths = createBoarderPaths({coast: COAST, heart: HEART, walls: [], towers, towerBlocking: true,
      pace: {hackPerSecond: 2.5, speed: 2.8}});
    paths.refresh();
    for (const tower of towers) tower.hp = 1;
    paths.refresh();
    const boarder = {x: 15, z: 2};
    let target = null;
    for (let i = 0; i < 200 && !target; i++) {
      const way = paths.next(boarder);
      if (way.kind === 'tower') target = way.towerId;
      if (way.kind !== 'step') break;
      boarder.x = way.x; boarder.z = way.z;
    }
    expect(target).toMatch(/^cannon_/);
  });

  it('lets a boarder step out when a tower rebuilds around its current cell', () => {
    const tower = {id: 'cannon_1', kind: 'cannon', x: 0, z: 0, hp: 20, maxHp: 80};
    const paths = createBoarderPaths({coast: COAST, heart: HEART, walls: [], towers: [tower], towerBlocking: true,
      pace: {hackPerSecond: 2.5, speed: 2.8}});
    paths.refresh();
    const boarder = {x: 0, z: 0}, way = paths.next(boarder);
    expect(way.kind).toBe('step');
    expect(towerEdgeDistance({x: way.x, z: way.z}, tower)).toBeGreaterThan(0);
  });

  it('escapes a rebuilt tower in a five-tower cross and reaches heart without crossing another footprint', () => {
    const towers = [[8, 2], [6, 2], [10, 2], [8, 0], [8, 4]].map(([x, z], index) => ({
      id: `cannon_${index + 1}`, kind: 'cannon', x, z, hp: 60, maxHp: 80,
    }));
    const paths = createBoarderPaths({coast: {rx: 20, rz: 22, seed: 3}, heart: HEART, walls: [], towers, towerBlocking: true,
      pace: {hackPerSecond: 2.5, speed: 2.8}});
    paths.refresh();
    const boarder = {x: 8, z: 2}, first = paths.next(boarder), kinds = [first.kind];
    expect(first.kind).not.toBe('none');
    const actions = {
      step: way => {
        const to = {x: way.x, z: way.z};
        expect(obstacleInWay(boarder, to, towers)).toBeNull();
        Object.assign(boarder, to);
      },
      tower: way => { towers.find(tower => tower.id === way.towerId).hp = 0; },
      wall: () => {},
      heart: () => {},
      none: () => {},
    };
    for (let tick = 0; tick < 200 && !kinds.includes('heart'); tick++) {
      paths.refresh();
      const way = paths.next(boarder);
      kinds.push(way.kind);
      actions[way.kind](way);
    }
    expect(kinds).toContain('heart');
    expect(kinds).not.toContain('none');
  });

});

describe('a wave with pathing', () => {
  it('without the option every wave plays exactly as before (option A)', () => {
    const defenses = [...shoreWalls(3), ...ring(6)];
    expect(run({ defenses, pathing: false }).events).toEqual(run({ defenses }).events);
  });

  it('the same seed and inputs replay the same wave with pathing on', () => {
    const defenses = [...shoreWalls(3), ...ring(6), ...closedRing()];
    const one = run({ defenses, pathing: true }), two = run({ defenses, pathing: true });
    expect(two.events).toEqual(one.events);
    expect(one.events.some(event => event.type === 'boarder_landed')).toBe(true);
    expect(one.events.some(event => event.type === 'island_damaged' && event.boarderId)).toBe(true); // they get through, nobody is stuck
  });

  it('boarders hack the closed ring and never walk inside a standing wall', () => {
    const defenses = closedRing();
    const wave = createWave({ seed: 21, wave: 4, island: { hp: 5000 }, defenses, pathing: true });
    // A checker with the same footprints, fed the wave's wall hp every 10 ticks.
    const live = defenses.map(item => ({ ...item, hp: 1, maxHp: 1 }));
    const checker = createBoarderPaths({ coast: COAST, heart: HEART, walls: live, pace: { hackPerSecond: 2.5, speed: 2.8 } });
    const events = [];
    for (let i = 0; i < 3000 && !wave.done; i++) {
      events.push(...wave.step(.05));
      if (i % 10) continue;
      const state = wave.state();
      for (const wall of live) wall.hp = state.walls.find(item => item.id === wall.id).hp;
      checker.refresh();
      for (const boarder of state.boarders) {
        const cell = cellOf(checker.grid, boarder.x, boarder.z);
        if (cell >= 0 && boarder.state === 'walking') expect(standingWallAt(checker.layout, cell)).toBeNull();
      }
    }
    expect(events.some(event => event.type === 'wall_damaged' && event.boarderId)).toBe(true);
  }, 60000);
});
