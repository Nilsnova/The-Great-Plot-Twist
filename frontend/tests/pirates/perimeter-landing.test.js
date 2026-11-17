import {describe, expect, it} from 'vitest';
import {CONFIG, createWave} from '../../src/pirates/sim.js';
import ringFixture from './fixtures/perimeter-ring.json';
import {exteriorWallLanding} from '../../src/pirates/perimeter-landing.js';
import {BODY, wallInWay} from '../../src/pirates/boarder-paths.js';

const ring = ringFixture.ring.map(([x, z], i) => ({id: `wall_${i + 1}`, kind: 'wall', level: 1, x, z}));
function play(options = {}) {
  const sim = createWave({seed: 15838, wave: 8, pathing: true, defenses: ring, crew: {carpenter: 0}, ...options});
  const where = new Map(ring.map(wall => [wall.id, wall]));
  const out = {spawnedInside: [], walkingInside: [], stalledWalking: [], spawns: [], hacks: 0, breaches: 0, heartEntries: [], trace: []};
  const waiting = new Map();
  for (let tick = 0; tick < 4000 && !sim.done; tick++) {
    const events = sim.step(CONFIG.tick), state = sim.state();
    const standing = state.walls.filter(wall => wall.hp > 0).map(wall => where.get(wall.id));
    const inside = p => standing.filter(wall => Math.abs(p.x - wall.x) < .98 && Math.abs(p.z - wall.z) < .98).map(wall => wall.id);
    for (const event of events) {
      if (event.type === 'boarder_landed') {
        out.spawns.push([event.boarderId, event.x, event.z]);
        for (const wall of inside(event)) out.spawnedInside.push([event.boarderId, wall]);
      }
      if (event.type === 'island_damaged' && event.boarderId) out.heartEntries.push(event.boarderId);
      if (event.type === 'wall_damaged' && event.boarderId) { out.hacks++; if (event.broken) out.breaches++; }
    }
    for (const unit of state.boarders) {
      for (const wall of inside(unit)) out.walkingInside.push([unit.id, wall]);
      const old = waiting.get(unit.id), still = old && old.x === unit.x && old.z === unit.z && unit.state === 'walking';
      const count = still ? old.count + 1 : 0;
      waiting.set(unit.id, {x: unit.x, z: unit.z, count});
      if (count === 40) out.stalledWalking.push(unit.id);
    }
    if (tick % 10 === 0) out.trace.push(JSON.stringify([state.boarders, state.walls]));
  }
  return {...out, done: sim.done, result: sim.result()};
}

describe('perimeter-wave shore entry', () => {
  it('reproduces the legacy new-spawn bypass in the measured coastal ring', () => {
    const legacy = play();
    expect(legacy.spawnedInside.length).toBeGreaterThan(0);
    expect(legacy.spawnedInside[0]).toEqual(['boarder_7', 'wall_2']);
  });
  it.each([7919, 15838, 23757, 31676])('keeps seed %s exterior to standing pieces with actual breach progress', seed => {
    const selected = play({perimeterWalls: true, seed});
    expect(selected.spawnedInside).toEqual([]);
    expect(selected.walkingInside).toEqual([]);
    expect(selected.stalledWalking).toEqual([]);
    expect(selected.hacks).toBeGreaterThan(0);
    expect(selected.breaches).toBeGreaterThan(0);
    expect(selected.done).toBe(true);
  });
  it('preserves absent/false legacy traces and repeats selected-mode inputs deterministically', () => {
    expect(play({perimeterWalls: false})).toEqual(play());
    expect(play({perimeterWalls: true, seed: 4242})).toEqual(play({perimeterWalls: true, seed: 4242}));
  });
  it('refuses an unsupported perimeter rule without pathing', () => {
    expect(() => createWave({perimeterWalls: true})).toThrow('Perimeter walls require pathing.');
    expect(() => createWave({perimeterWalls: true, pathing: false})).toThrow('Perimeter walls require pathing.');
  });
  it.each(['gap', 'rubble'])('permits real entry through a deliberate western %s', mode => {
    const entrance = wall => wall.x < -17 && Math.abs(wall.z) <= 5;
    const defenses = mode === 'gap' ? ring.filter(wall => !entrance(wall)) : ring.map(wall => entrance(wall) ? {...wall, health: 0} : wall);
    const run = play({perimeterWalls: true, defenses, lanes: [{id: 'west', bearing: 180}]});
    expect(run.spawnedInside).toEqual([]);
    expect(run.walkingInside).toEqual([]);
    expect(run.stalledWalking).toEqual([]);
    expect(run.heartEntries.length).toBeGreaterThan(0);
    expect(run.done).toBe(true);
  });
  it('retains actual repaired-footprint occupant egress while protecting later new entries', () => {
    const wall = {id: 'wall_2', kind: 'wall', level: 1, x: -18.5, z: 0, hpUnits: 0, maxHP: 60, instanceId: 'coast-wall', repairSeq: 0};
    const sim = createWave({seed: 15838, wave: 8, pathing: true, perimeterWalls: true, defenses: [wall], recoveryVersion: 1, waveProtocol: 2});
    const inside = unit => Math.abs(unit.x - wall.x) < .98 && Math.abs(unit.z - wall.z) < .98;
    let occupant;
    for (let tick = 0; tick < 800 && !sim.done; tick++) {
      sim.step(CONFIG.tick); occupant = sim.state().boarders.find(inside); if (occupant) break;
    }
    expect(occupant).toBeDefined();
    expect(sim.applyRecoveryEvent({serverSeq: 1, effectiveTick: Math.round(sim.state().time / CONFIG.tick), type: 'structure_repaired', payload: {
      spot: wall.id, instanceId: wall.instanceId, hpUnits: 1_000_000, maxHP: 60, repairSeq: 1,
    }})).toBe(true);
    let leftStandingFootprint = false;
    for (let tick = 0; tick < 40 && !sim.done; tick++) {
      sim.step(CONFIG.tick);
      const state = sim.state(), unit = state.boarders.find(item => item.id === occupant.id);
      if (unit && !inside(unit) && state.walls[0].hp > 0) { leftStandingFootprint = true; break; }
    }
    expect(leftStandingFootprint).toBe(true);
  });
});

const standing = (id, x, z) => ({id, kind: 'wall', x, z, hp: 60});
describe('guaranteed-exterior first-barrier geometry', () => {
  it('clamps before the outermost wall even if the old candidate is already beyond both footprints', () => {
    const start = {x: 0, z: 0}, landing = {x: 1, z: 0};
    const walls = [standing('inner', -2, 0), standing('outer', -5, 0)];
    const at = exteriorWallLanding(start, landing, walls);
    expect(at.x).toBeLessThan(-6 - BODY); expect(at.z).toBe(0);
    expect(exteriorWallLanding(start, landing, [...walls].reverse())).toEqual(at);
  });
  it('preserves the original empty route or actual gap and passes rubble without inventing a barrier', () => {
    const start = {x: -4, z: 0}, landing = {x: -3, z: 0};
    expect(exteriorWallLanding(start, landing, [])).toBe(start);
    expect(exteriorWallLanding(start, landing, [standing('north', -5, -3), standing('south', -5, 3)])).toBe(start);
    expect(exteriorWallLanding(start, landing, [{...standing('broken', -5, 0), hp: 0}])).toBe(start);
  });
  it('supports degenerate ray inputs and leaves the old inside-occupant exception intact', () => {
    const wall = standing('restored', 0, 0), at = exteriorWallLanding({x: 0, z: 0}, {x: 0, z: 0}, [wall]);
    expect(Number.isFinite(at.x) && Number.isFinite(at.z)).toBe(true);
    expect(Math.abs(at.x)).toBeGreaterThan(1 + BODY);
    expect(wallInWay({x: .2, z: 0}, {x: 2, z: 0}, [wall])).toBeNull();
  });
});
