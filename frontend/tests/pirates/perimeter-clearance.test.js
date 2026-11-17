import * as THREE from 'three';
import {describe, expect, it} from 'vitest';
import {createBoarderPaths, isOnLand, obstacleInWay} from '../../src/pirates/boarder-paths.js';
import {cellOf, standingWallAt} from '../../src/pirates/path-grid.js';
import {neighbours} from '../../src/pirates/pathing.js';
import {createBattleGuide, guideRoute, routeKey} from '../../src/pirates/battle-guide.js';
import {createWaveController} from '../../src/pirates/controller.js';
import {CONFIG} from '../../src/pirates/sim.js';

const wall = (id, x, z, hp = 60) => ({id, kind: 'wall', x, z, hp, maxHp: 60});
const make = (walls, options = {}) => {
  const paths = createBoarderPaths({coast: CONFIG.coast, heart: {x: 0, z: 2}, walls,
    pace: {hackPerSecond: 2.5, speed: 2.8}, perimeterWalls: true, ...options});
  paths.refresh(); return paths;
};
// Walk the actual waypoints through the simulator's continuous collision authority.
const walk = (paths, walls, from) => {
  let point = {...from}; const steps = [];
  for (let i = 0; i < 200; i++) {
    const next = paths.next(point);
    if (next.kind !== 'step') return {next, point, steps};
    expect(obstacleInWay(point, next, walls), JSON.stringify({point, next})).toBeNull();
    expect(isOnLand(next.x, next.z, CONFIG.coast)).toBe(true);
    steps.push(next); point = next;
  }
  throw new Error('Route did not terminate');
};

describe('perimeter clearance matches legal half-grid placement', () => {
  it.each([0, .5, 1])('walks a width-one gap at half-grid offset %s without attacking', offset => {
    const walls = [wall('wall_13', offset - 1.5, 6), wall('wall_14', offset + 1.5, 6)];
    const from = {x: offset, z: 8}, heart = {x: offset, z: 2}, paths = make(walls, {heart});
    expect(paths.grid.cell).toBe(.5);
    expect(paths.canReach(from, {x: offset, z: 4.5})).toBe(true);
    const result = walk(paths, walls, from);
    expect(result.next.kind).toBe('heart');
    expect(result.steps.filter(p => p.z >= 4.5).every(p => p.x === offset)).toBe(true);
    expect(guideRoute({from, heart, walls, perimeterWalls: true})).toMatchObject({reachable: true, breaches: []});
  });
  it('keeps a half-unit gap blocked, including an off-node continuous near miss', () => {
    const walls = [wall('wall_13', -1, 6), wall('wall_14', 1.5, 6)], paths = make(walls);
    const from = {x: .25, z: 8}, to = {x: .25, z: 4};
    expect(obstacleInWay(from, to, walls)).not.toBeNull();
    expect(paths.canReach(from, to)).toBe(false);
    const wide = make([wall('wall_13', -1.5, 6), wall('wall_14', 1.5, 6)]);
    expect(wide.canReach({x: .24, z: 8}, {x: .24, z: 4})).toBe(false);
  });
  it('preserves the original legacy raster and explicit-false route result', () => {
    const walls = [wall('wall_13', -1.5, 6), wall('wall_14', 1.5, 6)];
    const legacy = make(walls, {perimeterWalls: false});
    expect(legacy.grid.cell).toBe(1);
    expect(legacy.canReach({x: 0, z: 8}, {x: 0, z: 4.5})).toBe(false);
    expect(legacy.next({x: 0, z: 8})).toEqual({kind: 'step', x: 1.5, z: 7.5});
  });
  it('excludes a diagonal corner cut while allowing a continuous clear turn', () => {
    const walls = [wall('wall_13', 0, 0)], paths = make(walls, {heart: {x: 1, z: 2.5}});
    const a = {x: 1.5, z: 1}, b = {x: 1, z: 1.5};
    expect(obstacleInWay(a, b, walls)).not.toBeNull();
    expect(neighbours(paths.grid, paths.layout, cellOf(paths.grid, a.x, a.z))
      .some(n => n.index === cellOf(paths.grid, b.x, b.z))).toBe(false);
    expect(walk(paths, walls, {x: 2.5, z: 1}).next.kind).toBe('heart');
  });
  it('never lets rubble mask a standing neighbor, and refreshes breach/restoration', () => {
    const walls = [wall('wall_13', 0, 6, 0), wall('wall_14', 2, 6)], paths = make(walls);
    const overlap = cellOf(paths.grid, 1, 6);
    expect(standingWallAt(paths.layout, overlap)?.id).toBe('wall_14');
    const builds = paths.builds;
    for (let i = 0; i < 100; i++) paths.refresh();
    expect(paths.builds).toBe(builds);
    walls[1].hp = 0; paths.refresh();
    expect(standingWallAt(paths.layout, overlap)).toBeNull();
    expect(paths.canReach({x: 1, z: 8}, {x: 1, z: 4})).toBe(true);
    walls[0].hp = 60; paths.refresh();
    expect(standingWallAt(paths.layout, overlap)?.id).toBe('wall_13');
    expect(paths.builds).toBe(builds + 2);
    // A boarder already inside the restored piece can leave; new entry stays blocked.
    expect(walk(paths, walls, {x: 0, z: 6}).next.kind).toBe('heart');
    expect(paths.canReach({x: 0, z: 8}, {x: 0, z: 4})).toBe(false);
  });
  it('uses the same clearance for enabled towers and keeps beach routes on land', () => {
    const towers = [wall('cannon_1', -1.5, 6), wall('cannon_2', 1.5, 6)].map(p => ({...p, kind: 'cannon'}));
    const paths = make([], {towers, towerBlocking: true});
    expect(paths.canReach({x: 0, z: 8}, {x: 0, z: 4})).toBe(true);
    expect(walk(paths, towers, {x: 0, z: 8}).next.kind).toBe('heart');
    expect(walk(make([]), [], {x: 18, z: 0}).next.kind).toBe('heart');
    expect(make([]).canReach({x: 0, z: 2}, {x: 100, z: 100})).toBe(false);
  });
});

it('invalidates guide routes when geometry mode changes and returns to the same legacy result', () => {
  const defenses = [wall('wall_13', -1.5, 6), wall('wall_14', 1.5, 6)].map(p => ({...p, level: 1}));
  const view = {mode: 'preview', defenses, wave: 3, dt: .016};
  const guide = createBattleGuide({scene: new THREE.Scene()});
  try {
    guide.update(view); const old = guide.stats().routes;
    guide.update({...view, perimeterWalls: true}); const changed = guide.stats().routes;
    expect(changed).not.toEqual(old);
    guide.update(view); expect(guide.stats().routes).toEqual(old);
    expect(routeKey([], defenses, 3, [], false, true)).not.toBe(routeKey([], defenses, 3));
  } finally { guide.dispose(); }
});

it('reads owner mode only for preview; an active legacy wave cannot inherit later island policy', async () => {
  let policy = true; const views = [];
  const c = createWaveController({listen: false, world: {scene: {}}, guide: true, getPerimeterWalls: () => policy,
    createGuide: () => ({update: v => views.push(v), setVisible() {}, dispose() {}}),
    createRenderer: () => ({update() {}, events() {}, setVisible() {}, dispose() {}}),
    createHud: () => ({countdown() {}, bar() {}, prompt() {}, setVisible() {}, dispose() {}}),
    loadAuto: () => false, now: () => Date.parse('2026-11-17T12:00:00Z')});
  try {
    c.update(.01); await Promise.resolve(); c.update(.01);
    expect(views.at(-1)).toMatchObject({mode: 'preview', perimeterWalls: true});
    policy = null; c.update(.01); expect(views.at(-1)).toBeNull();
    policy = true;
    c.start({waveId: 'legacy', wave: 1, seed: 1, startsAtMs: Date.parse('2026-11-17T12:00:00Z'), serverTimeMs: null, rules: {}});
    c.update(.01);
    expect(views.at(-1)).toMatchObject({mode: 'wave', perimeterWalls: false});
    const startsAt = '2026-11-17T12:00:00Z'; policy = false;
    c.start({waveId: 'demo', wave: 1, seed: 1, startsAtMs: Date.parse(startsAt), serverTimeMs: null,
      rules: {pathing: true}, perimeterDemo: {version: 1, waveId: 'demo', wave: 1, seed: 1, startsAt,
        islandEpoch: '12345678-1234-4234-8234-123456789abc', pathing: true, perimeterWalls: true,
        defenses: [], crew: {gunner: 0, carpenter: 0, lookout: 0, guard: 0}}});
    c.update(.01);
    expect(views.at(-1)).toMatchObject({mode: 'wave', perimeterWalls: true});
  } finally {c.dispose(); await Promise.resolve();}
});
