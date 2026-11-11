// Scripted islands for the balance tests and the measured curve (TOWER-DEFENSE.md §2, §3, §8): build
// spots on the home_islet coast like the island lane's, with levels, and a headless wave runner.
import { coastPoint, createWave } from '../../src/pirates/sim.js';

export const spot = (id, kind, bearing, radius, level = 1) => {
  const p = coastPoint(bearing * Math.PI / 180, radius);
  return { id, kind, level, x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 };
};
// Walls one per sea lane first (east 0°, south 90°, west 180°), then a second, towers on the corners and at the lanes.
const WALL_BEARINGS = [-6, 84, 174, 6, 96, 186];
const TOWER_BEARINGS = [45, 135, -45, -135, 0, 90, 180];
export const walls = (n, level = 1) => WALL_BEARINGS.slice(0, n).map((b, i) => spot(`wall_${i + 1}`, 'wall', b, .86, level));
export const towers = (list) => list.map(([kind, level], i) => spot(`tower_s${i + 1}`, kind, TOWER_BEARINGS[i], i < 4 ? .75 : .6, level));
export const watchtower = (level = 1) => ({ id: 'tower_1', kind: 'watchtower', level, x: 0, z: -14 });
export const houses = () => [{ id: 'house_1', kind: 'house', level: 1, x: 7, z: -6 }, { id: 'house_2', kind: 'house', level: 1, x: -8, z: -6 }];

export const ISLANDS = {
  // One level-1 cannon on the first corner.
  first: { defenses: towers([['cannon', 1]]) },
  // Three level-2 cannons and two walls.
  boss5: { defenses: [...towers([['cannon', 2], ['cannon', 2], ['cannon', 2]]), ...walls(2)] },
  // Three level-1 cannons and two walls: too little for wave 10.
  small: { defenses: [...towers([['cannon', 1], ['cannon', 1], ['cannon', 1]]), ...walls(2)] },
  // Five upgraded towers with a mortar, four level-2 walls and a watchtower.
  mid: { defenses: [...towers([['cannon', 2], ['cannon', 2], ['cannon', 2], ['cannon', 2], ['mortar', 2]]), ...walls(4, 2), watchtower(1)] },
  // All 16 spots, mostly level 3, two gunners and two carpenters.
  full: {
    defenses: [...towers([['cannon', 3], ['cannon', 3], ['cannon', 3], ['cannon', 3], ['mortar', 3], ['mortar', 3], ['cannon', 2]]),
      ...walls(6, 3), watchtower(2), ...houses()],
    crew: { gunner: 2, carpenter: 2, lookout: 0 },
  },
};

/** Runs one wave headless at the fixed tick; inputs(wave) may return inputs for each step. */
export function runWave(options, inputs = () => []) {
  const wave = createWave(options);
  const events = [];
  while (!wave.done) events.push(...wave.step(.25, inputs(wave)));
  return { result: wave.result(), state: wave.state(), events };
}

/** Survival over `seeds` seeds: {won, of, hp (mean island hp left), time (mean seconds)}. */
export function measure(island, wave, { seeds = 8, weather } = {}) {
  let won = 0, hp = 0, time = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const { result } = runWave({ seed: seed * 7919, wave, weather, ...island });
    if (result.survived) won++;
    hp += result.islandHp; time += result.time;
  }
  return { won, of: seeds, hp: Math.round(hp / seeds), time: Math.round(time / seeds) };
}
