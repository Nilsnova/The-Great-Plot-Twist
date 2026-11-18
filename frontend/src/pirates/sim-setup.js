// The start of a wave (createWave in sim.js): reads the options, builds the towers, walls and houses with their
// skills, the wave's event, finisher and rescue, plans the whole fleet up front (so the dice never depend on frame
// timing) and returns `sim`: the counters and flags the wave changes as it runs (sim.ticks, sim.islandHp, ...)
// together with everything built here. Every other part of the wave (sim-*.js) is a closure over this object.

import { CONFIG } from './sim-config.js';
import { finite, clamp, round2, distance, createRandom, seedNumber, coastPoint, readDefenses, skillOf, bonusOf,
  readCoast, readLanes, readHeart, readCrew, isAttackTower, lookoutsOf, lookoutsWith, reach, attackRanges } from './sim-read.js';
import { houseRoles, fleetOf, curveFor, shuffle } from './sim-fleet.js';
import { captainStats } from './captain-stats.js';
import { createEventRules } from './wave-events.js';
import { createFinisher } from './finisher/rules.js';
import { createRescue } from './finisher/rescue.js';
import { startHp } from './wall-health.js';
import { createTowerHealth } from './tower-health.js';
import { createBoarderPaths } from './boarder-paths.js';
import { blocksAsTower } from './tower-obstacles.js';
import { treeStats } from './tower-trees.js';
import { canFreeStructureRepair, readRecoveryPolicy } from './recovery-policy.js';

export function setupWave(options = {}) {
  const C = CONFIG, B = C.boarding, random = createRandom(options?.seed);
  // Recovery v1 pauses every free structure repair path. An unknown version pair fails closed.
  const recoveryPolicy = readRecoveryPolicy(options);
  const REWIND_TICKS = 40, seenAt = new Map(); // recovery waves: where each ship and boarder was, per tick
  const freeStructureRepair = canFreeStructureRepair(recoveryPolicy);
  const captainStatsFor = (level, skills, weapon) => captainStats(level, skills, weapon,
    { recoveryVersion: recoveryPolicy === 'structure-recovery-v1' ? 1 : 0 });
  const recoveryStructureState = new Map((recoveryPolicy === 'structure-recovery-v1' && Array.isArray(options?.recoveryStructures)
    ? options.recoveryStructures : []).filter(item => typeof item?.instanceId === 'string').map(item => [item.instanceId, { ...item }]));
  // The boarders draw from their own stream, so the fleet and the cannons' rolls do not depend on them.
  const crowd = createRandom((seedNumber(options?.seed) ^ 0x2545f491) >>> 0);
  const heart = readHeart(options?.heart);
  const waveNumber = clamp(Math.trunc(finite(options?.wave) ? options.wave : 1), 1, C.maxWave);
  const shipFactor = clamp(finite(options?.weather?.ships) ? options.weather.ships : 1, C.weather.minShips, C.weather.maxShips);
  const fog = clamp(finite(options?.weather?.fog) ? options.weather.fog : 0, 0, C.fog.max);
  const maxHp = finite(options?.island?.hp) && options.island.hp > 0 ? options.island.hp : C.islandHp;
  const countdown = finite(options?.countdown) ? clamp(options.countdown, 0, 60) : 0;
  const withFlagship = options?.flagship === true;
  const boss = typeof options?.boss === 'boolean' ? options.boss : !withFlagship && waveNumber % C.boss.every === 0;
  const defenses = readDefenses(options?.defenses, { culverin: options?.defensesV2 === true }), crew = readCrew(options?.crew);
  const curve = curveFor(waveNumber);
  // v3 waves: the wave's event (none without options.event, never with the flagship) and the boss finisher.
  const happening = createEventRules(withFlagship ? null : options?.event, { seed: options?.seed, wave: waveNumber, curve, coastPoint,
    coast: readCoast(options?.coast), heart, defenses, stopRadius: C.stopRadius, spawnRadius: C.spawnRadius, firstSpawn: C.fleet.firstSpawn });
  const finisher = createFinisher({ wave: waveNumber, seed: options?.seed, enabled: options?.finishers === true && !withFlagship,
    preparation: options?.finisherPreparation === true, gapMs: typeof options?.gapMs === 'function' ? options.gapMs : null, trigger: options?.finisherTrigger }); // trigger: the demo harness only
  // T38: a lost wave from wave 4 (not Pirate Point) first offers the captains still on the island one co-op haul.
  const rescue = createRescue({ wave: waveNumber, seed: options?.seed, enabled: options?.rescue === true && !withFlagship,
    preparation: options?.finisherPreparation === true, gapMs: typeof options?.gapMs === 'function' ? options.gapMs : null });
  const lookouts = lookoutsOf(defenses), { towerBonus, rangeFor } = attackRanges(lookouts);
  const boost = Math.max(1, ...lookouts.map(item => C.levels.watchtower[item.level - 1].boost ?? 1));
  const S = C.specs, near = spec => lookoutsWith(lookouts, spec);
  const spotters = near('spotter'), drummers = near('war_drums');
  const signal = Math.max(0, ...near('signal_fire').map(item => item.skill.warn));
  let fogShare = waveNumber === 1 ? Math.max(1 - fog, C.fog.firstWaveSight) : 1 - fog;
  if (crew.lookout && fog > 0) fogShare = Math.min(1, fogShare * C.crew.lookout.sight);
  const warnLead = (crew.lookout ? C.crew.lookout.warn : 0) + signal;
  const coast = readCoast(options?.coast), laneList = readLanes(options?.lanes);
  // Cannons, mortars, harpoons, culverins and swivel nests, in id order; the gunners man the strongest (damage per second, then level).
  const firstReload = { mortar: C.mortar.firstReload, harpoon: C.harpoon.firstReload, culverin: C.culverin.firstReload, swivel: C.swivel.firstReload };
  const towers = defenses.filter(item => isAttackTower(item.kind)).map(item => {
    const stats = C.levels[item.kind][item.level - 1], spec = skillOf(item, C);
    const range = rangeFor(item, stats.range, spec.range ?? 0);
    // A spotter watchtower in reach adds its share of damage (GAME-V3.md §5); the skill's own numbers on top.
    const spotted = reach(spotters, item)?.skill.damage ?? 1, drums = reach(drummers, item)?.skill.reload ?? 1;
    // D055: the tower's upgrade tree. A tower without one keeps the old sums exactly (no factor is applied at all).
    const tree = item.tree ? treeStats(item.kind, item.tree) : null, grown = (value, key) => (tree ? value * tree[key] : value);
    const radius = item.kind === 'mortar' ? round2(grown(C.mortar.radius * bonusOf(item, 'radius', C), 'radius')) : undefined;
    const damage = round2(grown(stats.damage * (spec.damage ?? 1) * spotted * boost, 'damage'));
    const baseReload = round2(grown(stats.reload * C.pace.reload * (spec.reload ?? 1) * bonusOf(item, 'reload', C) * drums, 'reload'));
    return { ...item, skill: spec, damage, baseReload,
      range, sight: range * fogShare * happening.sightOf(item, defenses), manned: false, reload: firstReload[item.kind] ?? 0, lastShot: -Infinity, shots: 0,
      ...(radius !== undefined ? { radius } : {}),
      ...(item.kind === 'harpoon' ? { slow: { slow: tree ? round2(stats.slow + tree.slow) : stats.slow, seconds: tree ? round2(stats.seconds + tree.seconds) : stats.seconds } } : {}),
      ...(item.kind === 'swivel' ? { pellets: stats.pellets + (tree?.pellets ?? 0) } : {}) };
  });
  const strength = tower => tower.damage / tower.baseReload * (tower.kind === 'mortar' ? 1.5 : 1);
  // Gunners stay on cannons and mortars (not on a harpoon tower, a culverin or a swivel nest).
  towers.filter(item => item.kind !== 'harpoon' && item.kind !== 'culverin' && item.kind !== 'swivel').sort((a, b) => strength(b) - strength(a) || b.level - a.level || (a.id < b.id ? -1 : 1))
    .slice(0, crew.gunner).forEach(tower => { tower.manned = true; tower.baseReload = round2(tower.baseReload * C.crew.gunner.reload); });
  const cannons = towers.filter(item => item.kind === 'cannon'), mortars = towers.filter(item => item.kind === 'mortar');
  // The sight the island shows (fog edge, the manual-fire reach): the level-1 cannon's, or the best cannon's.
  const sight = Math.max(C.cannon.range + towerBonus, ...cannons.map(item => item.range)) * fogShare;
  // The house roles (CONFIG.houses): the houses of level 2 and up that picked one, in id order.
  const HO = C.houses, roles = houseRoles(defenses), withRole = role => roles.filter(item => item.role === role);
  const barracks = withRole('barracks'), taverns = withRole('tavern'), workshops = withRole('workshop');
  const W = HO.workshop, housesNear = (list, item, radius) => list.filter(house => distance(house.x, house.z, item.x, item.z) <= radius + 1e-9).length;
  const walls = defenses.filter(item => item.kind === 'wall').map(item => {
    const skill = skillOf(item, C), baseHp = round2(C.levels.wall[item.level - 1].hp * (skill.hp ?? 1) * bonusOf(item, 'hp', C));
    const hp = recoveryPolicy === 'structure-recovery-v1' && finite(item.maxHP) && item.maxHP > 0 ? item.maxHP : baseHp;
    // Workshops in reach: faster repairs, a shorter rebuild, and a broken wall that mends by itself.
    const shops = housesNear(workshops, item, W.radius), sooner = 1 - Math.min(W.maxFaster, W.faster * shops);
    // D039: the wall's hp starts at the share its last wave left it (0: broken, to be rebuilt); maxHp is its level's.
    const initialHp = recoveryPolicy === 'structure-recovery-v1' && Number.isInteger(item.hpUnits)
      ? hp * item.hpUnits / 1_000_000 : startHp(hp, item.health);
    return { ...item, skill, repairBoost: round2((skill.repair ?? 1) * bonusOf(item, 'repair', C)), hp: initialHp, maxHp: hp, repairLeft: 0, repaired: 0, crew: false, rebuildAt: -Infinity, rebuilding: 0,
      inner: distance(item.x, item.z, heart.x, heart.z) <= heart.ring, bearing: Math.atan2(item.z - heart.z, item.x - heart.x),
      workshop: shops, boost: round2(1 + Math.min(W.maxRepair, W.repair * shops)), sooner: round2(sooner),
      cooldown: round2(C.wall.rebuildCooldown * sooner), mendAfter: shops ? Math.max(W.minMend, W.mend / shops) : Infinity, mending: 0 };
  });
  const cannonById = new Map(cannons.map(item => [item.id, item]));
  // T33: tower hp (inert unless the wave carries the rule): no dice, so the fleet's random stream is untouched.
  const towerHealth = createTowerHealth({ enabled: options?.towerHealth === true, towers, now: () => now(), tick: C.tick,
    recoveryVersion: options?.recoveryVersion });
  const towerById = new Map(towers.map(item => [item.id, item]));
  const wallById = new Map(walls.map(item => [item.id, item]));
  const wallsInOrder = [...walls].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)); // walls are already in id order; kept explicit
  // T35: what stops a step under tower_obstacles: the walls, then the towers the path field also treats as obstacles.
  const blockingObjects = [...wallsInOrder, ...towers.filter(tower => blocksAsTower(tower.kind))];
  // T35: the routes over the walls (null without the option: today's fixed routes). No dice.
  const towerBlocking = options?.towerObstacles === true && options?.pathing === true && towerHealth.enabled;
  const paths = options?.pathing === true ? createBoarderPaths({ coast: readCoast(options?.coast), heart, walls,
    towers, towerBlocking,
    pace: { hackPerSecond: B.hack * curve.damage / B.hackEvery, speed: B.speed * curve.speed } }) : null;

  // Where a gunboat anchors (CONFIG.gunboat): the first point of its course where the nearest tower is as
  // far off as it can shoot (`range`), or, if it can, just outside the reach of the nearest cannon, but never
  // farther out than `outRadius` coast radii, so it anchors on screen and in reach of the captains. No dice.
  const jammed = (tower, t) => tower.jammedUntil !== undefined && tower.jammedUntil > t + 1e-9;
  function gunboatStand(from, to, a) {
    const G = C.gunboat, span = distance(from.x, from.z, to.x, to.z), steps = Math.max(1, Math.ceil(span / G.step));
    const nearest = (list, x, z) => list.reduce((best, item) => (!best || distance(item.x, item.z, x, z) < distance(best.x, best.z, x, z) ? item : best), null);
    if (!towers.length) return to;
    const out = coastPoint(a, G.outRadius, coast), first = Math.max(1, Math.ceil(distance(from.x, from.z, out.x, out.z) / span * steps));
    for (let i = first; i < steps; i++) {
      const x = from.x + (to.x - from.x) * i / steps, z = from.z + (to.z - from.z) * i / steps;
      const cannon = nearest(cannons, x, z), reach = Math.min(G.range - 1, cannon ? cannon.range + G.margin : G.range - 1);
      const tower = nearest(towers, x, z);
      if (distance(tower.x, tower.z, x, z) <= reach) return { x: round2(x), z: round2(z) };
    }
    return to;
  }

  // The fleet is planned up front, so the random sequence never depends on frame timing.
  const lanes = laneList.map(lane => {
    const a = lane.bearing * Math.PI / 180, stop = coastPoint(a, C.stopRadius, coast);
    const cover = towers.length ? Math.min(...towers.map(c => distance(c.x, c.z, stop.x, stop.z))) : 0;
    return { id: lane.id, a, stop, cover };
  });
  shuffle(lanes, random);
  if (towers.length) lanes.sort((a, b) => a.cover - b.cover); // the first waves come where the guns are
  const laneCount = clamp(C.fleet.lanesPerWave * waveNumber, 1, lanes.length);
  const { count, kinds: fleetKinds, bosses, tier } = fleetOf(waveNumber, { shipFactor, boss });
  // Gunboats come after the first ships, with the fleet already close: the others are shuffled as ever (v3 waves: fire ships, the armada), then
  // the boats are set in at the 7th, 12th, 17th place and so on. A wave without gunboats is dealt exactly as before.
  const kinds = shuffle(happening.kinds(fleetKinds.filter(kind => kind !== 'gunboat')), random);
  fleetKinds.filter(kind => kind === 'gunboat').forEach((kind, i) => kinds.splice(Math.min(kinds.length, 6 + i * 5), 0, kind));
  const gap = happening.gap(Math.min(Math.max(C.fleet.minGap, C.fleet.gap - C.fleet.gapPerWave * (waveNumber - 1)),
    C.fleet.window / (happening.id ? kinds.length : count)));
  const plan = kinds.map((kind, index) => ({ kind, lane: lanes[index % laneCount], at: C.fleet.firstSpawn + index * gap }));
  for (let i = 0; i < bosses; i++) {
    // The boss sails in after a few escorts; a second one a little later on another lane.
    const at = C.fleet.firstSpawn + (Math.min(C.boss.afterShips, count) + i * 3) * gap;
    plan.push({ kind: tier.boss, boss: true, lane: lanes[i % laneCount], at }); // where the guns are, like the flagship
  }
  // Wave 100, the final battle (GAME-V3.md §4): Captain Redtide sails in himself, after his bosses.
  if (tier.final && !withFlagship) {
    plan.push({ kind: 'redtide', boss: true, final: true, lane: lanes[0], at: C.fleet.firstSpawn + (Math.min(C.boss.afterShips, count) + bosses * 3) * gap });
  }
  if (withFlagship) {
    const at = C.fleet.firstSpawn + Math.min(C.flagship.afterShips, count) * gap;
    plan.push({ kind: 'flagship', lane: lanes[0], at });
  }
  const eventLanes = happening.plan(plan, { lanes, laneCount, gap }); // v3 waves: the event's ships and lanes
  plan.sort((a, b) => a.at - b.at);
  for (const entry of plan) {
    if (entry.fixed) continue; // an event ship with its own route (the galleon)
    const a = entry.lane.a + (random() * 2 - 1) * (entry.spread ?? C.laneSpread) * Math.PI / 180;
    const stopR = C.stopRadius + (random() * 2 - 1) * C.stopJitter;
    entry.a = a; entry.from = coastPoint(a, C.spawnRadius, coast);
    entry.to = entry.toward ?? coastPoint(a, entry.stop ?? (['flagship', 'warship', 'dreadnought', 'redtide'].includes(entry.kind) ? C.stopRadius + .1 : stopR), coast);
    if (entry.kind === 'gunboat') entry.to = gunboatStand(entry.from, entry.to, entry.a); // after the dice above, so no other ship's dice move
  }

  // The wave's counters and flags, shared by every part of the wave (sim.ticks, sim.islandHp, ...).
  const sim = { ticks: 0, rest: 0, nextSpawn: 0, nextWarn: 0, nextShipId: 1, sunk: 0, islandHp: maxHp, done: false,
    started: countdown === 0 ? null : false, lastCountdown: null, lampsLit: false, endReason: null,
    nextBoarderId: 1, killed: 0, landed: 0, militiaFell: 0, queued: [] };
  const ships = [], wrecks = [], balls = [], shells = [], captains = new Map(), blades = new Map(), boarders = [], fires = [];
  // Captain health (GAME-V3.md §3): id -> {id, x, z, hp, maxHp, down, downAt, seen, colour, away}.
  const H = C.health, party = new Map();
  // The Barracks' militia (CONFIG.houses.barracks): {id, militia: true, houseId, homeX, homeZ, x, z, hp, maxHp,
  // damage, state: idle|walking|fighting, foe, hitIn, facing}. They walk out at the start of the wave.
  const militia = [], militiaById = new Map();
  const now = () => round2(sim.ticks * C.tick);
  const flagshipAfloat = () => ships.some(ship => ship.kind === 'flagship') ||
    plan.slice(sim.nextSpawn).some(entry => entry.kind === 'flagship');
  const statsOf = kind => C.ships[kind] ?? happening.statsOf(kind);
  return Object.assign(sim, { C, B, random, recoveryPolicy, REWIND_TICKS, seenAt, freeStructureRepair,
    captainStatsFor, recoveryStructureState, crowd, heart, waveNumber, fog, maxHp, countdown, withFlagship, boss,
    crew, curve, happening, finisher, rescue, S, fogShare, warnLead, coast, towers, cannons, sight, HO, roles,
    barracks, taverns, W, housesNear, walls, cannonById, towerHealth, towerById, wallById, wallsInOrder,
    blockingObjects, towerBlocking, paths, jammed, lanes, laneCount, bosses, tier, plan, eventLanes, ships, wrecks,
    balls, shells, captains, blades, boarders, fires, H, party, militia, militiaById, now, flagshipAfloat, statsOf });
}
