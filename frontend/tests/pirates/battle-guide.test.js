// The battle guide (battle-guide.js, owner's playtest 15 Nov): where pirates land, the route they walk to the
// heart, the heart as the goal and the walls' bars. Drawing only: these tests check the pure helpers against the
// sim's own rules (sim.js landBoarder, boarder-paths.js) and that the drawing reads the state without changing it.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG, coastPoint, createWave } from '../../src/pirates/sim.js';
import { isOnLand } from '../../src/pirates/boarder-paths.js';
import { attackedWalls, bearingOf, createBattleGuide, guideRoute, guideRoutes, guideWalls, landingAt, laneLandings, routeDots,
  routeKey, waveLandings, wallBar } from '../../src/pirates/battle-guide.js';
import { ISLANDS } from './balance-fixture.js';

const HEART = CONFIG.boarding.heart;
// A closed square ring of 2 x 2 walls round the heart (0, 2): balance-rules.mjs's ring.
const RING = [[-3, 5], [-1, 5], [1, 5], [3, 5], [3, 3], [3, 1], [3, -1], [1, -1], [-1, -1], [-3, -1], [-3, 1], [-3, 3]]
  .map(([x, z], i) => ({ id: `wall_r${String(i).padStart(2, '0')}`, kind: 'wall', level: 1, x, z }));

describe('landings', () => {
  it('puts one landing on the beach of every sea lane, where landBoarder steps ashore', () => {
    const landings = laneLandings();
    expect(landings.map(item => item.id)).toEqual(CONFIG.lanes.map(lane => lane.id));
    for (const landing of landings) {
      expect(isOnLand(landing.x, landing.z, CONFIG.coast)).toBe(true);
      const p = coastPoint(landing.a, CONFIG.boarding.landRadius);
      expect(landing.x).toBeCloseTo(p.x, 1); expect(landing.z).toBeCloseTo(p.z, 1);
    }
    expect(landings[0].x).toBeGreaterThan(10); expect(landings[0].z).toBeCloseTo(0, 5); // east
  });
  it('finds the same landing from a lane\'s anchor point (the wave_started lanes)', () => {
    const lanes = CONFIG.lanes.map(lane => { const a = lane.bearing * Math.PI / 180, stop = coastPoint(a, CONFIG.stopRadius); return { id: lane.id, x: stop.x, z: stop.z }; });
    const fromWave = waveLandings(lanes), plain = laneLandings();
    fromWave.forEach((landing, i) => { expect(landing.x).toBeCloseTo(plain[i].x, 5); expect(landing.z).toBeCloseTo(plain[i].z, 5); });
    expect(bearingOf(coastPoint(1.1, 1.3))).toBeCloseTo(1.1, 9);
    expect(waveLandings([{ id: 'x', x: NaN, z: 1 }])).toEqual([]);
  });
  it('matches the beach point of every boarder a real wave lands', () => {
    const sim = createWave({ seed: 4242, wave: 6, pathing: true });
    const ships = new Map();
    for (let i = 0; i < 1200 && !sim.done; i++) {
      for (const event of sim.step(.25)) if (event.type === 'ship_anchored') ships.set(event.shipId, event);
      if (ships.size >= 3) break;
    }
    expect(ships.size).toBeGreaterThan(0);
    for (const ship of ships.values()) {
      const a = bearingOf({ x: ship.x, z: ship.z }), landing = landingAt(a);
      expect(isOnLand(landing.x, landing.z, CONFIG.coast)).toBe(true);
      expect(Math.hypot(landing.x, landing.z)).toBeLessThan(Math.hypot(ship.x, ship.z)); // the beach is inside the anchorage
    }
  });
});

describe('routes', () => {
  it('walks an open island from every landing to the heart in steps of one cell, on land', () => {
    for (const route of guideRoutes({ landings: laneLandings(), walls: [], wave: 10 })) {
      expect(route.reachable).toBe(true);
      expect(route.breaches).toEqual([]);
      const last = route.points[route.points.length - 1];
      expect(last).toEqual({ x: HEART.x, z: HEART.z });
      for (let i = 1; i < route.points.length - 1; i++) {
        const a = route.points[i - 1], b = route.points[i];
        expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThan(1.5);
        expect(isOnLand(b.x, b.z, CONFIG.coast)).toBe(true);
      }
    }
  });
  it('breaks through the closed ring (and only through its standing walls) to reach the heart', () => {
    const walls = guideWalls(RING), ids = new Set(RING.map(wall => wall.id));
    for (const route of guideRoutes({ landings: laneLandings(), walls, wave: 30 })) {
      expect(route.reachable).toBe(true);
      expect(route.breaches.length).toBeGreaterThanOrEqual(1);
      for (const breach of route.breaches) expect(ids.has(breach.wallId)).toBe(true);
    }
    // A broken wall of the ring is a gap: the east route, which hacked it, now walks through it with no axe.
    const open = guideWalls(RING, RING.map(wall => ({ id: wall.id, hp: wall.id === 'wall_r05' ? 0 : 60, maxHp: 60 })));
    const east = guideRoutes({ landings: laneLandings(), walls: open, wave: 30 })[0];
    expect(east).toMatchObject({ id: 'east', reachable: true, breaches: [] });
    expect(east.points.some(point => Math.abs(point.x - 3) < 1 && Math.abs(point.z - 1) < 1)).toBe(true);
  });
  it('never puts a dot inside a standing wall it does not breach', () => {
    const walls = guideWalls(ISLANDS.full.defenses);
    for (const route of guideRoutes({ landings: laneLandings(), walls, wave: 10 })) {
      const hacked = new Set(route.breaches.map(item => item.wallId));
      for (const point of route.points) for (const wall of walls) {
        if (hacked.has(wall.id)) continue;
        expect(Math.abs(point.x - wall.x) < 1 && Math.abs(point.z - wall.z) < 1, `${route.id} at ${point.x},${point.z} inside ${wall.id}`).toBe(false);
      }
    }
  });
  it('names the walls the first boarder of a real wave hacks on its way in', () => {
    // The sim with the wave rule "pathing" on the closed ring: the first boarder ashore walks alone for a while, so
    // the walls it hacks are the ones the guide draws an axe on for its landing.
    for (const seed of [7919, 4242]) {
      const sim = createWave({ seed, wave: 3, pathing: true, defenses: RING });
      const anchored = new Map(), hacked = [];
      let first = null, landing = null;
      for (let i = 0; i < 2400 && !sim.done; i++) {
        for (const event of sim.step(.05)) {
          if (event.type === 'ship_anchored') anchored.set(event.shipId, event);
          if (event.type === 'boarder_landed' && !first) { first = event.boarderId; const ship = anchored.get(event.shipId); landing = landingAt(bearingOf(ship)); }
          if (event.type === 'wall_damaged' && event.boarderId === first && hacked[hacked.length - 1] !== event.wallId) hacked.push(event.wallId);
        }
        if (first && !sim.state().boarders.some(item => item.id === first)) break;
      }
      expect(first).not.toBeNull();
      const route = guideRoute({ from: landing, walls: guideWalls(RING), wave: 3 });
      expect(hacked.length, `seed ${seed}`).toBeGreaterThan(0);
      expect(route.breaches.map(item => item.wallId), `seed ${seed}`).toEqual(hacked);
    }
  });
  it('is the same route for the same walls, whatever their order', () => {
    const walls = guideWalls(ISLANDS.full.defenses), from = laneLandings()[1];
    expect(guideRoute({ from, walls, wave: 12 })).toEqual(guideRoute({ from, walls: [...walls].reverse(), wave: 12 }));
  });
  it('lays dots one unit apart along the way, in order', () => {
    const dots = routeDots([{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: 3, z: 2.5 }]);
    expect(dots.map(dot => dot.along)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(dots[4]).toMatchObject({ x: 3, z: 1, dx: 0, dz: 1 });
  });
  it('works the routes out again only when a wall passes a quarter of its hp, is broken or moves', () => {
    const landings = laneLandings(), walls = guideWalls(RING);
    const key = routeKey(landings, walls, 5);
    expect(routeKey(landings, walls.map(wall => ({ ...wall, hp: wall.hp - 1 })), 5)).toBe(key);
    expect(routeKey(landings, walls.map((wall, i) => (i ? wall : { ...wall, hp: wall.maxHp * .7 })), 5)).not.toBe(key);
    expect(routeKey(landings, walls.map((wall, i) => (i ? wall : { ...wall, x: wall.x + .5 })), 5)).not.toBe(key);
    expect(routeKey(landings, walls, 6)).not.toBe(key);
  });
});

describe('walls', () => {
  it('reads each wall\'s hp from the sim and its full hp from its level and health', () => {
    const walls = guideWalls([{ id: 'wall_1', kind: 'wall', level: 2, x: 1, z: 2 }, { id: 'cannon_1', kind: 'cannon', x: 0, z: 0 },
      { id: 'wall_0', kind: 'wall', level: 1, x: 3, z: 4, health: 50 }]);
    expect(walls.map(wall => wall.id)).toEqual(['wall_0', 'wall_1']);
    expect(walls[0]).toMatchObject({ hp: CONFIG.levels.wall[0].hp / 2, maxHp: CONFIG.levels.wall[0].hp });
    expect(walls[1]).toMatchObject({ hp: CONFIG.levels.wall[1].hp, maxHp: CONFIG.levels.wall[1].hp, level: 2 });
    expect(guideWalls([{ id: 'wall_1', kind: 'wall', x: 1, z: 2 }], [{ id: 'wall_1', hp: 7, maxHp: 70 }])[0]).toMatchObject({ hp: 7, maxHp: 70 });
  });
  it('shows a bar on a hurt or hacked wall only: green, yellow, red; none on a broken one', () => {
    expect(wallBar({ hp: 60, maxHp: 60 })).toBeNull();
    expect(wallBar({ hp: 60, maxHp: 60 }, true)).toEqual({ share: 1, level: 'good' });
    expect(wallBar({ hp: 30, maxHp: 60 }).level).toBe('low');
    expect(wallBar({ hp: 10, maxHp: 60 }).level).toBe('bad');
    expect(wallBar({ hp: 0, maxHp: 60 }, true)).toBeNull();
    expect([...attackedWalls([{ state: 'hacking', wallId: 'wall_2' }, { state: 'walking', wallId: null }, { state: 'hacking', towerId: 't' }])]).toEqual(['wall_2']);
  });
});

describe('drawing', () => {
  const scene = () => new THREE.Scene();
  it('draws faint landings, routes and the heart between waves, and nothing when hidden', () => {
    const s = scene(), guide = createBattleGuide({ scene: s });
    guide.update({ mode: 'preview', defenses: ISLANDS.full.defenses, wave: 4, dt: .016 });
    const preview = guide.stats();
    expect(preview.routes).toHaveLength(3);
    expect(preview.ground).toBeGreaterThan(30); expect(preview.air).toBeGreaterThanOrEqual(4); // three skulls and the heart
    guide.update(null);
    expect(guide.stats()).toMatchObject({ ground: 0, air: 0 });
    guide.dispose();
    expect(s.getObjectByName('battle-guide')).toBeUndefined();
  });
  it('in a wave adds a bar over a hacked wall and a rubble badge over a broken one, and leaves the state alone', () => {
    const guide = createBattleGuide({ scene: scene() });
    const defenses = RING, stateWalls = RING.map((wall, i) => ({ id: wall.id, hp: i === 0 ? 0 : 60, maxHp: 60 }));
    const boarders = [{ id: 'boarder_1', state: 'hacking', wallId: 'wall_r03', x: 3, z: 6 }];
    const frozen = JSON.stringify({ defenses, stateWalls, boarders });
    guide.update({ mode: 'wave', lanes: null, defenses, stateWalls, boarders, heart: HEART, wave: 8, dt: .016 });
    const withMarks = guide.stats().air;
    guide.update({ mode: 'wave', lanes: null, defenses, stateWalls: RING.map(wall => ({ id: wall.id, hp: 60, maxHp: 60 })), boarders: [], heart: HEART, wave: 8, dt: .016 });
    expect(withMarks - guide.stats().air).toBe(2 + 1); // the bar (two boxes) and the rubble badge
    expect(JSON.stringify({ defenses, stateWalls, boarders })).toBe(frozen);
    guide.dispose();
  });
});
