// The scenarios of the wave sim's determinism fingerprint (sim-fingerprint.test.js): waves 1-60 (and 75, 90, 100),
// several seeds; every rule off, the production rules without and with structure recovery, and some partial sets. Each
// runs headless at one tick per step with scripted captains; a hash covers every tick's events and full state().
// allFingerprints() -> {scenario key: {hash, ticks, reason} | hash}.
import { createHash } from 'node:crypto';
import { coastPoint, createWave } from '../../src/pirates/sim.js';
import { readRules } from '../../src/pirates/wave-rules.js';

// The production rule set (SIM_RULES of fake-api.js) without and with structure recovery, every rule off, and some partial sets.
const PRODUCTION = ['tower_health', 'pathing', 'tower_obstacles', 'rescue', 'defenses_v2', 'ship_fire'];
const RULE_SETS = { plain: [], production: PRODUCTION, recovery: [...PRODUCTION, 'structure_recovery'],
  towers: ['tower_health'], paths: ['pathing'], obstacles: ['tower_health', 'pathing', 'tower_obstacles'], fire: ['ship_fire', 'rescue'] };
const EVENTS = ['fog_bank', 'storm', 'night_raid', 'pincer', 'fire_ships', 'armada', 'siege_barge', 'treasure_galleon', 'smugglers', 'kraken'];
const WEAPONS = ['musket', 'pistols', 'blunderbuss', 'long_rifle', 'fire_bombs'];
const SKILLS = ['steady_aim', 'long_barrel', 'quick_hands', 'cutlass', 'sweep', 'second_wind', 'quick_fix', 'long_reach', 'master_shipwright'];
const SPECS = {
  cannon: [undefined, 'rapid', 'heavy', 'chain', 'broadside', 'grapeshot', 'long_range'],
  mortar: [undefined, 'cluster', 'fire_pot', 'shockwave', 'inferno'],
  wall: [undefined, 'stone', 'spiked', 'quick_mend', 'bastion', 'thorns'],
  watchtower: [undefined, 'spotter', 'signal_fire', 'eagle_eye', 'war_drums'],
};
const BONUS = { cannon: [undefined, 'rapid_2', 'long_guns'], mortar: [undefined, 'quick_fuse', 'heavy_shells'],
  wall: [undefined, 'mason_drill', 'thick_walls'], watchtower: [undefined, 'lookout_drill', 'high_tower'] };
const ROLES = ['barracks', 'tavern', 'workshop'];

const at = (id, kind, bearing, radius, level) => {
  const p = coastPoint(bearing * Math.PI / 180, radius);
  return { id, kind, level, x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 };
};
const RING = [[8.5, 2], [4.5, 9], [-4, 9.5], [-9.5, -1], [-4, -5.5], [4, -5.5]];
const TOWER_SPOTS = [[45, .75], [135, .75], [-45, .75], [-135, .75], [0, .6], [90, .6], [180, .6], [20, .7], [160, .7], [110, .5], [-90, .55]];
const TOWER_KINDS = ['cannon', 'cannon', 'mortar', 'harpoon', 'culverin', 'swivel', 'cannon', 'mortar', 'swivel', 'harpoon', 'culverin'];

/** The island of one scenario: grows with the wave, every kind, skill, tier-2 bonus, upgrade tree and house role. */
function islandFor(wave, seed, recovery) {
  const level = Math.min(5, 1 + Math.floor(wave / 10)), pick = (list, k) => list[(wave + seed + k) % list.length];
  const towers = TOWER_SPOTS.slice(0, Math.min(TOWER_SPOTS.length, 2 + Math.floor(wave / 5)))
    .map(([bearing, radius], i) => ({ ...at(`tower_s${i + 1}`, TOWER_KINDS[i], bearing, radius, level),
      ...(SPECS[TOWER_KINDS[i]] ? { spec: pick(SPECS[TOWER_KINDS[i]], i) } : {}), ...(BONUS[TOWER_KINDS[i]] ? { bonus: pick(BONUS[TOWER_KINDS[i]], i) } : {}),
      ...(level === 5 && i % 2 === 0 ? { tree: { a: 1 + (i + seed) % 3, b: (i + wave) % 2 } } : {}) }));
  const shore = [-6, 84, 174, 6, 96, 186].slice(0, Math.min(6, 1 + Math.floor(wave / 6)))
    .map((bearing, i) => ({ ...at(`wall_${i + 1}`, 'wall', bearing, .86, level), spec: pick(SPECS.wall, i), bonus: pick(BONUS.wall, i),
      ...((wave + i) % 4 === 0 ? { health: (wave * 13 + i * 7) % 100 } : {}) }));
  const ring = wave >= 8 ? RING.slice(0, Math.min(6, Math.floor(wave / 8))).map(([x, z], i) => ({ id: `wall_${i + 7}`, kind: 'wall', level, x, z,
    spec: pick(SPECS.wall, i + 3) })) : [];
  const extras = [
    ...(wave >= 4 ? [{ id: 'tower_1', kind: 'watchtower', level, x: 0, z: -14, spec: pick(SPECS.watchtower, 0), bonus: pick(BONUS.watchtower, 0) }] : []),
    ...(wave >= 6 ? [{ id: 'house_1', kind: 'house', level: 2, x: 7, z: -6, spec: pick(ROLES, 0) },
      { id: 'house_2', kind: 'house', level: wave >= 20 ? 3 : 2, x: -8, z: -6, spec: pick(ROLES, 1) }] : []),
  ];
  let defenses = [...towers, ...shore, ...ring, ...extras];
  if (recovery) {
    defenses = defenses.map((item, i) => (item.kind === 'house' || item.kind === 'watchtower' ? item : { ...item,
      instanceId: `inst_${item.id}`, maxHP: item.kind === 'wall' ? 60 + level * 20 : 40 + level * 10,
      hpUnits: (i + wave) % 3 === 0 ? 1_000_000 : 300_000 + ((i * 97 + wave * 31) % 600_000), repairSeq: i % 2 }));
  }
  return defenses;
}

/** Options of one scenario's createWave. */
function optionsFor(wave, seed, set) {
  const rules = RULE_SETS[set];
  const recovery = rules.includes('structure_recovery');
  const defenses = islandFor(wave, seed, recovery);
  return {
    seed: seed * 7919 + wave, wave, defenses, ...readRules(rules),
    crew: { gunner: wave % 3, carpenter: (wave + seed) % 3, lookout: (wave + seed) % 2, guard: wave >= 10 ? (wave + seed) % 4 : 0 },
    weather: { ships: [1, 1.2, .8][seed % 3], fog: [0, .3, .5][(wave + seed) % 3] },
    countdown: wave % 7 === 0 ? 3 : 0, flagship: wave % 17 === 0 && seed === 1,
    event: wave % 3 === 0 ? EVENTS[(wave / 3 + seed) % EVENTS.length] : null, finishers: true,
    gapMs: players => 4000 + players * 1000, finisherPreparation: wave % 2 === 0,
    ...(recovery ? { recoveryVersion: 1, waveProtocol: 2,
      recoveryStructures: [{ instanceId: 'inst_gone', spot: 'wall_99', hpUnits: 500_000, maxHP: 80, repairSeq: 1 }] } : {}),
  };
}

// Where the scripted captains stand, in order.
const POSTS = [...RING.map(([x, z]) => ({ x: x * .8, z: 2 + (z - 2) * .8 })), ...[0, 90, 180].map(b => coastPoint(b * Math.PI / 180, .55)), { x: 0, z: 2 }];

/** Inputs of one tick from the state: n captains who move, fight, rebuild, repair, revive; manual fire and the lamps. */
function inputsFor(state, tick, n, wave, recovery) {
  const inputs = [];
  if (state.phase !== 'running') return inputs;
  for (let i = 0; i < n; i++) {
    const by = `c${i}`, post = POSTS[(i + wave) % POSTS.length], weapon = WEAPONS[(i + wave) % WEAPONS.length];
    const skills = SKILLS.slice(0, (i * 3 + wave) % (SKILLS.length + 1)), level = 1 + (i + wave) % 5;
    const sway = Math.sin(tick / 40 + i) * 1.5;
    if (tick % 4 === i % 4) inputs.push({ type: 'captain_move', by, x: post.x + sway, z: post.z, colour: i, ...(tick % 900 === 450 && i === 1 ? { away: true } : {}) });
    const me = state.party?.find(hero => hero.id === by);
    if (me?.down) continue;
    const fallen = state.party?.find(hero => hero.down && hero.id !== by);
    if (fallen && tick % 10 === 0) inputs.push({ type: 'captain_revive', by, targetId: fallen.id, x: fallen.x + .5, z: fallen.z, skills });
    const broken = state.walls.find(item => item.hp <= 0 && item.rebuildReady);
    if (broken && tick % 6 === 0) inputs.push({ type: 'rebuild', wallId: broken.id, skills });
    const hurt = state.walls.find(item => item.hp > 0 && item.hp < item.maxHp);
    if (hurt && tick % 25 === i) inputs.push({ type: 'repair', wallId: hurt.id, skills });
    const tower = state.towers.find(item => item.broken || (item.hp !== undefined && item.hp < item.maxHp));
    if (tower && tick % 30 === i) inputs.push({ type: tower.broken ? 'rebuild' : 'repair', wallId: tower.id, skills });
    const close = state.boarders.find(item => Math.hypot(item.x - post.x, item.z - post.z) < 3);
    if (close) { inputs.push({ type: 'captain_strike', by, targetId: close.id, level, skills, x: post.x + sway, z: post.z, ...(recovery ? { seen: Math.round(state.time / .05) - 3 } : {}) }); continue; }
    let best = null, reach = 30;
    for (const target of [...state.boarders, ...state.ships]) { const d = Math.hypot(target.x - post.x, target.z - post.z); if (d < reach) { best = target; reach = d; } }
    if (best) inputs.push({ type: 'captain_shot', by, targetId: best.id, level, skills, weapon, x: post.x + sway, z: post.z, ax: best.x, az: best.z,
      ...(recovery ? { seen: Math.round(state.time / .05) - 5 } : {}) });
  }
  const ship = state.ships[0];
  if (ship && state.cannons.length && tick % 17 === 0) inputs.push({ type: 'fire', cannonId: state.cannons[tick % state.cannons.length].id, targetId: ship.id });
  if (tick === 400) inputs.push({ type: 'lamps_lit' });
  if (state.finisher?.task && n && tick % 5 === 0) inputs.push({ type: 'finisher_input', by: 'c0', from: Math.max(0, Math.floor(state.finisher.s ?? 0)), marks: [1, 0, 1, 1] });
  if (recovery && tick % 300 === 150) {
    const wall = state.walls[(tick / 300 | 0) % Math.max(1, state.walls.length)];
    if (wall) inputs.push({ type: 'structure_repaired', event: { type: 'structure_repaired', serverSeq: tick, effectiveTick: tick,
      payload: { spot: wall.id, instanceId: `inst_${wall.id}`, hpUnits: 1_000_000, maxHP: wall.maxHp, repairSeq: 2 + tick } } });
  }
  return inputs;
}

/** One scenario: the hash of every tick's events and state, the tick count and the result. */
function fingerprint(wave, seed, set) {
  const options = optionsFor(wave, seed, set), recovery = options.recoveryVersion === 1;
  const sim = createWave(options), hash = createHash('sha256'), n = (wave + seed) % 5;
  let tick = 0;
  hash.update(JSON.stringify(sim.state()));
  while (!sim.done && tick < 20_000) {
    const state = sim.state();
    const events = sim.step(.05, inputsFor(state, tick, n, wave, recovery));
    hash.update(JSON.stringify(events));
    hash.update(JSON.stringify(sim.state()));
    if (recovery && tick % 200 === 0) hash.update(JSON.stringify(sim.recoveryHealthVector()));
    tick++;
  }
  // A few steps of other lengths (more ticks per step, and a step after the end).
  hash.update(JSON.stringify(sim.step(1.3, [])));
  hash.update(JSON.stringify({ result: sim.result(), endReason: sim.endReason, done: sim.done }));
  return { hash: hash.digest('hex').slice(0, 24), ticks: tick, reason: sim.endReason };
}

/** A multi-tick-per-step run: the same wave stepped by uneven dt, so the tick loop inside step() is covered too. */
function unevenFingerprint(wave, seed, set) {
  const sim = createWave(optionsFor(wave, seed, set)), hash = createHash('sha256');
  const dts = [.25, .05, .1, .033, .5, .0, -1, .2];
  let k = 0;
  while (!sim.done && k < 10_000) {
    const state = sim.state();
    hash.update(JSON.stringify(sim.step(dts[k % dts.length], inputsFor(state, k, 3, wave, false))));
    hash.update(JSON.stringify(sim.state()));
    k++;
  }
  hash.update(JSON.stringify(sim.result()));
  return hash.digest('hex').slice(0, 24);
}

const SCENARIOS = [];
for (const set of ['plain', 'production', 'recovery']) {
  for (let wave = 1; wave <= 60; wave++) SCENARIOS.push({ wave, seed: 1, set });
  for (const seed of [2, 3]) for (let wave = 2; wave <= 60; wave += 5) SCENARIOS.push({ wave, seed, set });
  for (const wave of [75, 90, 100]) SCENARIOS.push({ wave, seed: 1, set });
}
for (const set of ['towers', 'paths', 'obstacles', 'fire']) for (const wave of [10, 25, 40]) SCENARIOS.push({ wave, seed: 2, set });
const key = ({ wave, seed, set }) => `${set}:w${wave}:s${seed}`;

export function allFingerprints() {
  const got = {};
  for (const scenario of SCENARIOS) got[key(scenario)] = fingerprint(scenario.wave, scenario.seed, scenario.set);
  for (const wave of [5, 12, 30]) for (const set of ['plain', 'production']) got[`uneven:${set}:w${wave}`] = unevenFingerprint(wave, 4, set);
  return got;
}
