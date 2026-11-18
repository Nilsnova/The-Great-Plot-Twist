// D056 "Every wall stands on a pirate path": the wall lanes are the sim's own routes (src/pirates/wall-lanes.js),
// both stored copies equal that derivation, every wall of the default layout and of a random legal layout stands on
// one, boarders hack those walls in the real sim, a gap-free line across a lane holds them, and no boarder ever
// stands inside a standing wall.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createWave } from '../../src/pirates/sim.js';
import { deriveWallLanes, laneRoutes, stoppedBearings } from '../../src/pirates/wall-lanes.js';
import { WALL_LANE_ROWS } from '../../src/island/wall-lanes.js';
import { checkMove, onWallLane, positionsOf, OFF_PATH } from '../../src/island/placement.js';
import { SPOTS } from '../../src/island/spots.js';

const server = JSON.parse(readFileSync(new URL('../../../backend/content/island_layout.json', import.meta.url), 'utf8'));
const WALL_IDS = SPOTS.filter(spot => spot.slot === 'wall').map(spot => spot.id);
const laneCells = () => WALL_LANE_ROWS.flatMap(([z, ...runs]) => {
  const out = [];
  for (let i = 0; i < runs.length; i += 2) for (let x = runs[i]; x <= runs[i + 1] + 1e-9; x += .5) out.push({ x, z });
  return out;
});

// One wave with these walls and the rule "pathing": hacks per wall, and every time a boarder stood inside a standing wall.
function play(walls, { wave, seed }) {
  const defenses = walls.map(([id, x, z]) => ({ id, kind: 'wall', level: 5, x, z }));
  const sim = createWave({ seed: seed * 7919, wave, defenses, pathing: true }), where = new Map(defenses.map(item => [item.id, item]));
  const hacks = {}, inside = [];
  while (!sim.done) {
    for (const event of sim.step(.25, [])) if (event.type === 'wall_damaged' && event.boarderId) hacks[event.wallId] = (hacks[event.wallId] ?? 0) + 1;
    const state = sim.state();
    for (const wall of state.walls) {
      const at = where.get(wall.id);
      if (!(wall.hp > 0) || !at) continue;
      for (const boarder of state.boarders) if (Math.abs(boarder.x - at.x) < 1 - 1e-6 && Math.abs(boarder.z - at.z) < 1 - 1e-6) inside.push(`${boarder.id} in ${wall.id}`);
    }
  }
  return { hacks, inside };
}

// A small seeded dice (no Math.random), so the "random" layout is the same on every run.
const dice = seed => () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

describe('wall lanes (D056)', () => {
  it('are the derivation from the sim, in the browser copy and in the server file alike', () => {
    expect(WALL_LANE_ROWS.map(row => [...row])).toEqual(deriveWallLanes());
    expect(server.wallLanes.rows).toEqual(WALL_LANE_ROWS.map(row => [...row]));
  }, 60_000);

  it('follow the routes of every sea lane: each route with no walls crosses them', () => {
    for (const route of laneRoutes()) {
      expect(route.points.some(point => laneCells().some(cell => Math.abs(cell.x - point.x) <= 1 && Math.abs(cell.z - point.z) <= 1)), String(route.bearing)).toBe(true);
    }
  });

  it('hold every wall of the default layout, and a wall alone on each of them stops boarders', () => {
    for (const id of WALL_IDS) {
      const spot = SPOTS.find(item => item.id === id);
      expect(onWallLane(spot.x, spot.z), id).toBe(true);
      expect(stoppedBearings(spot.x, spot.z).length, id).toBeGreaterThanOrEqual(3);
    }
  });

  it('refuse a wall off every path in Move mode, but not a tower', () => {
    const placed = positionsOf();
    expect(checkMove('wall_1', -4, -5.5, placed)).toEqual({ ok: false, code: 'off_path', message: OFF_PATH });
    expect(OFF_PATH).toBe('Walls go on a pirate path.');
    expect(checkMove('wall_1', -12, .5, placed)).toEqual({ ok: true });
    expect(checkMove('cannon_1', -4, -9, placed)).toEqual({ ok: true });
  });

  it('in the default layout: boarders hack every wall and never stand inside one', () => {
    const walls = WALL_IDS.map(id => { const spot = SPOTS.find(item => item.id === id); return [id, spot.x, spot.z]; });
    const hacks = {}, inside = [];
    for (const [wave, seed] of [[8, 1], [8, 2], [20, 1], [20, 2]]) {
      const run = play(walls, { wave, seed });
      for (const [id, n] of Object.entries(run.hacks)) hacks[id] = (hacks[id] ?? 0) + n;
      inside.push(...run.inside);
    }
    for (const id of WALL_IDS) expect(hacks[id] ?? 0, id).toBeGreaterThan(0);
    expect(inside).toEqual([]);
  }, 60_000);

  it('in a random legal layout: every wall stands on a route, boarders hack walls, none stands inside one', () => {
    const roll = dice(56), cells = laneCells(), placed = positionsOf();
    for (const id of WALL_IDS) {
      for (let tries = 0; tries < 500; tries++) {
        const cell = cells[Math.floor(roll() * cells.length)];
        if (checkMove(id, cell.x, cell.z, placed).ok) { placed[id] = { x: cell.x, z: cell.z }; break; }
      }
    }
    const walls = WALL_IDS.map(id => [id, placed[id].x, placed[id].z]);
    for (const [id, x, z] of walls) {
      expect(onWallLane(x, z), id).toBe(true);
      expect(stoppedBearings(x, z).length, id).toBeGreaterThanOrEqual(3);
    }
    const run = play(walls, { wave: 15, seed: 3 });
    expect(Object.values(run.hacks).reduce((sum, n) => sum + n, 0)).toBeGreaterThan(0);
    expect(run.inside).toEqual([]);
  }, 60_000);

  it('starts a pathing boarder on the seaward side when its landing starts inside a standing wall', () => {
    const wall = { id: 'wall_12', kind: 'wall', level: 5, x: 20, z: 1.5 };
    function landing(pathing, defenses) {
      const sim = createWave({ wave: 15, seed: 3 * 7919, pathing, defenses });
      while (!sim.done) {
        const event = sim.step(.25, []).find(event => event.type === 'boarder_landed' && event.boarderId === 'boarder_7');
        if (event) return event;
      }
      throw new Error('Expected the east-lane boarder to land');
    }
    const nominal = landing(true, []);
    expect(nominal).toMatchObject({ x: 20.73, z: 1.91 });
    expect(landing(false, [wall])).toEqual(nominal);
    const clear = landing(true, [wall]);
    expect(clear).toMatchObject({ t: nominal.t, shipId: nominal.shipId });
    expect(clear.x).toBeGreaterThanOrEqual(wall.x + 1);
  });

  it('a wall alone on a lane cell is hacked in the real sim (a sample of the cells)', () => {
    const cells = laneCells(), missed = [];
    for (let i = 0; i < cells.length; i += 37) {
      const { x, z } = cells[i];
      let hit = false;
      for (let seed = 1; seed <= 12 && !hit; seed++) hit = (play([['wall_1', x, z]], { wave: 15, seed }).hacks.wall_1 ?? 0) > 0;
      if (!hit) missed.push(`${x},${z}`);
    }
    expect(missed).toEqual([]);
  }, 120_000);

  it('a gap-free line across the east lane makes its boarders hack, not walk round', () => {
    const line = [-3, -1, 1, 3].map((z, i) => [`wall_${i + 1}`, 17, z]);
    for (const [, x, z] of line) expect(onWallLane(x, z)).toBe(true);
    for (const seed of [1, 2]) {
      const defenses = line.map(([id, x, z]) => ({ id, kind: 'wall', level: 5, x, z }));
      const sim = createWave({ seed: seed * 7919, wave: 8, defenses, pathing: true }), east = new Set();
      let hacks = 0, through = 0;
      while (!sim.done) {
        for (const event of sim.step(.25, [])) if (event.type === 'wall_damaged' && event.boarderId) hacks++;
        const state = sim.state(), standing = state.walls.every(wall => wall.hp > 0);
        for (const boarder of state.boarders) {
          if (boarder.x > 18.5) east.add(boarder.id);
          if (standing && east.has(boarder.id) && boarder.x < 15.7) through++;
        }
      }
      expect(east.size).toBeGreaterThan(0);
      expect(hacks).toBeGreaterThan(0);
      expect(through).toBe(0);
    }
  }, 60_000);
});
