// Scripted islands for the balance tests and the measured curve (TOWER-DEFENSE.md §2, §3, §8): build
// spots on the home_islet coast like the island lane's, with levels, and a headless wave runner.
import { coastPoint, createWave } from '../../src/pirates/sim.js';
import { captainStats } from '../../src/pirates/captain-stats.js';

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
// The inner ring around the heart (src/island/spots.js wall_7…wall_12): east, south-east, south-west, west, north-west, north-east.
const RING = [[8.5, 2], [4.5, 9], [-4, 9.5], [-9.5, -1], [-4, -5.5], [4, -5.5]];
export const ring = (n = 6, level = 1) => RING.slice(0, n).map(([x, z], i) => ({ id: `wall_${i + 7}`, kind: 'wall', level, x, z }));
export const houses = () => [{ id: 'house_1', kind: 'house', level: 1, x: 7, z: -6 }, { id: 'house_2', kind: 'house', level: 1, x: -8, z: -6 }];

export const ISLANDS = {
  // One level-1 cannon on the first corner.
  first: { defenses: towers([['cannon', 1]]) },
  // Three level-2 cannons, two shore walls and the inner ring (level 1) against the boarders.
  boss5: { defenses: [...towers([['cannon', 2], ['cannon', 2], ['cannon', 2]]), ...walls(2), ...ring(6)] },
  // Three level-1 cannons and two walls: too little for wave 10.
  small: { defenses: [...towers([['cannon', 1], ['cannon', 1], ['cannon', 1]]), ...walls(2)] },
  // Five upgraded towers with a mortar, four level-2 walls and a watchtower.
  mid: { defenses: [...towers([['cannon', 2], ['cannon', 2], ['cannon', 2], ['cannon', 2], ['mortar', 2]]), ...walls(4, 2), watchtower(1)] },
  // All 22 spots (the inner ring too), mostly level 3, two gunners and two carpenters.
  full: {
    defenses: [...towers([['cannon', 3], ['cannon', 3], ['cannon', 3], ['cannon', 3], ['mortar', 3], ['mortar', 3], ['cannon', 2]]),
      ...walls(6, 3), ...ring(6, 3), watchtower(2), ...houses()],
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

// --- The late game (docs/GAME-V3.md §4.1): the tower tiers, research and a crew of captains who fight ---
// The whole island at one tier: four cannons, three mortars, the six shore walls and the inner ring, the
// watchtower (its level up to 5) and two level-2 houses, with two gunners, two carpenters and the lookout.
export const islandAt = level => ({
  defenses: [...towers([['cannon', level], ['cannon', level], ['cannon', level], ['cannon', level], ['mortar', level], ['mortar', level], ['mortar', level]]),
    ...walls(6, level), ...ring(6, level), watchtower(level), ...houses().map(item => ({ ...item, level: 2 }))],
  crew: { gunner: 2, carpenter: 2, lookout: 1 },
});
// Research done, a skill on every building: Heavy shot, Cluster, Stone shore walls and a Spiked ring, Spotter.
export const researched = island => ({ ...island, defenses: island.defenses.map(item => ({ ...item,
  spec: { cannon: 'heavy', mortar: 'cluster', watchtower: 'spotter' }[item.kind] ?? (item.kind === 'wall' ? (/_(?:[7-9]|1[0-2])$/.test(item.id) ? 'spiked' : 'stone') : undefined) })) });
// Every captain skill (18 points: won wave 36 or more), level-5 muskets, half with the long rifle, half with fire bombs.
export const ALL_SKILLS = ['steady_aim', 'long_barrel', 'quick_hands', 'cutlass', 'sweep', 'second_wind', 'quick_fix', 'long_reach', 'master_shipwright'];
// Where the captains stand, in order: by the six ring walls (east, south-east, south-west, west, north-west,
// north-east), then on the three beaches, then at the heart.
const POSTS = [...RING.map(([x, z]) => ({ x: x * .8, z: 2 + (z - 2) * .8 })), ...[0, 90, 180].map(b => coastPoint(b * Math.PI / 180, .55)), { x: 0, z: 2 }];
/**
 * One wave with `n` captains who fight like a strong crew: each stands at a post (and sends where, so boarders
 * go for them and they can fall; nobody helps a fallen one up here), rebuilds a broken wall next to them, swings
 * the cutlass at a boarder within reach, else fires at the nearest ship or boarder in range. Returns the sim's
 * result and how the wave ended.
 */
export function crewWave(island, wave, seed, n, { skills = ALL_SKILLS, level = 5, weapon = i => (i % 2 ? 'fire_bombs' : 'long_rifle') } = {}) {
  const sim = createWave({ seed, wave, ...island }), posts = POSTS.slice(0, n), ranges = posts.map((_, i) => captainStats(level, skills, weapon(i)).range);
  let tick = 0, reason = null;
  while (!sim.done) {
    const state = sim.state(), inputs = [];
    posts.forEach((post, i) => {
      const by = `c${i}`;
      if (tick % 2 === 0) inputs.push({ type: 'captain_move', by, x: post.x, z: post.z });
      if (state.party?.find(hero => hero.id === by)?.down) return;
      const broken = state.walls.find(item => item.hp <= 0 && Math.hypot(item.x - post.x, item.z - post.z) < 3.4);
      if (broken) inputs.push({ type: 'rebuild', wallId: broken.id, skills });
      const close = state.boarders.find(item => Math.hypot(item.x - post.x, item.z - post.z) < 2.6);
      if (close) { inputs.push({ type: 'captain_strike', by, targetId: close.id, level, skills, x: post.x, z: post.z }); return; }
      let best = null, reach = ranges[i];
      for (const target of [...state.boarders, ...state.ships]) { const d = Math.hypot(target.x - post.x, target.z - post.z); if (d < reach) { best = target; reach = d; } }
      if (best) inputs.push({ type: 'captain_shot', by, targetId: best.id, level, skills, weapon: weapon(i), x: post.x, z: post.z, ax: best.x, az: best.z });
    });
    for (const event of sim.step(.25, inputs)) if (event.type === 'wave_ended') reason = event.reason;
    tick++;
  }
  return { ...sim.result(), reason };
}
/** crewWave over `seeds` seeds: {won, of, hp (mean heart left)}. */
export function crewMeasure(island, wave, n, { seeds = 4, ...options } = {}) {
  let won = 0, hp = 0;
  for (let i = 1; i <= seeds; i++) { const result = crewWave(island, wave, i * 7919, n, options); if (result.survived) won++; hp += result.islandHp; }
  return { won, of: seeds, hp: Math.round(hp / seeds) };
}
