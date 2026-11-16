// Representative late-wave load: sustained boarder movement around, breaching and escaping rebuilt towers.
import {describe, expect, it} from 'vitest';
import {coastPoint, CONFIG, createRandom} from '../../src/pirates/sim.js';
import {createBoarderPaths} from '../../src/pirates/boarder-paths.js';

const BOARDERS = 300, TICKS = 3000, TICK = CONFIG.tick, LANDING = .8, REBUILD_EVERY = 80;
const B = CONFIG.boarding, PACE = {hackPerSecond: B.hack * 1.5, speed: B.speed * 1.3};
const HEART = {x: B.heart.x, z: B.heart.z};

function runTowerWave() {
  const coast = CONFIG.coast, ring = [[-2, -2], [0, -2], [2, -2], [2, 0], [2, 2], [0, 2], [-2, 2], [-2, 0]];
  const towers = ring.map(([x, z], i) => ({id: `cannon_${i + 1}`, kind: 'cannon', x: HEART.x + x, z: HEART.z + z, hp: 24, maxHp: 60}));
  const paths = createBoarderPaths({coast, heart: HEART, walls: [], towers, towerBlocking: true, pace: PACE});
  const random = createRandom('tower-late-wave');
  const landing = () => { const point = coastPoint(random() * 2 * Math.PI, LANDING, coast); return {x: point.x, z: point.z}; };
  const boarders = Array.from({length: BOARDERS}, (_, i) => {
    const point = coastPoint(i / BOARDERS * 2 * Math.PI, LANDING, coast);
    return {id: `boarder_${i + 1}`, x: point.x, z: point.z};
  });
  const counts = {heart: 0, stuck: 0, towerTargets: 0, rebuilt: 0, moved: 0};
  const started = performance.now();
  for (let tick = 0; tick < TICKS; tick++) {
    const broken = towers.filter(tower => tick % REBUILD_EVERY === 0 && tower.hp <= 0);
    for (const tower of broken) { tower.hp = Math.round(tower.maxHp * .4); counts.rebuilt++; }
    paths.refresh();
    const choices = boarders.map(boarder => ({boarder, next: paths.next(boarder)}));
    for (const {next} of choices.filter(choice => choice.next.kind === 'tower')) {
      const target = towers.find(tower => tower.id === next.towerId);
      target.hp = Math.max(0, target.hp - PACE.hackPerSecond * TICK);
      counts.towerTargets++;
    }
    for (const {boarder, next} of choices.filter(choice => choice.next.kind === 'heart')) {
      Object.assign(boarder, landing());
      counts.heart++;
    }
    for (const {boarder, next} of choices.filter(choice => choice.next.kind === 'step')) {
      const target = {x: next.x, z: next.z}, dx = target.x - boarder.x, dz = target.z - boarder.z;
      const distance = Math.hypot(dx, dz), move = Math.min(distance, PACE.speed * TICK);
      Object.assign(boarder, {x: boarder.x + dx / distance * move, z: boarder.z + dz / distance * move});
      counts.moved++;
    }
    counts.stuck += choices.filter(choice => choice.next.kind === 'none').length;
  }
  const ms = performance.now() - started;
  return {...counts, ms, builds: paths.builds, standing: towers.filter(tower => tower.hp > 0).length};
}

describe('late-wave tower obstacle performance', () => {
  it('keeps 300 boarders moving through a tower break and rebuild wave', () => {
    const result = runTowerWave(), perTick = result.ms / TICKS;
    console.log(`[T35 tower perf] ${BOARDERS} boarders × ${TICKS} ticks: ${result.ms.toFixed(0)} ms total, ` +
      `${perTick.toFixed(3)} ms per tick, ${result.builds} field builds, ${result.towerTargets} tower-target ticks, ` +
      `${result.rebuilt} rebuilds, ${result.heart} heart arrivals, ${result.moved} movement steps`);
    expect(result.towerTargets).toBeGreaterThan(0);
    expect(result.rebuilt).toBeGreaterThan(0);
    expect(result.heart).toBeGreaterThan(0);
    expect(result.moved).toBeGreaterThan(BOARDERS * 100);
    expect(result.stuck).toBe(0);
    expect(result.standing).toBeGreaterThan(0);
    expect(result.builds).toBeGreaterThan(2);
    expect(result.builds).toBeLessThan(TICKS / 10);
    expect(perTick).toBeLessThan(25);
  }, 120_000);
});
