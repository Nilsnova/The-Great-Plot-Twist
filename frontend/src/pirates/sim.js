// The pirate wave simulation (BUILD-PLAN 3.5). Pure and deterministic: a seeded random number
// generator, a fixed 50 ms tick and no Math.random, clock, DOM or Three.js, so every player on the
// same island who feeds the same inputs sees the same wave.
//
// Units are world units of the home_islet place (1 unit = 16 px), island-local: x to the east,
// +z towards the camera (south), the island centre at 0,0. The coast is the canonical ellipse of
// places/surfaces.js. Ships sail in on three sea lanes, stop just off the shore and attack the
// nearest standing wall, else the island. Cannons fire on their own at the nearest ship they can see.
import { surfaces } from '../world/places/surfaces.js';
import { captainStats, readSkills } from './captain-stats.js';
import { readBonus, readSpec } from '../campaign/tech.js';
import { ROLE_RADIUS, barracksPosts, inHouseReach } from '../campaign/houses.js';
// v3 waves (GAME-V3.md §4.2, §4.3): the wave's event and the boss finisher, each in its own module.
import { createEventRules } from './wave-events.js';
import { createFinisher } from './finisher/rules.js';
// T38 (D044, proposed): the last-chance rescue after a lost wave, only with the wave option rescue (the rule "rescue").
import { createRescue } from './finisher/rescue.js';
// D039 (proposed): a wall starts the wave with the health its last wave left it (wall-health.js).
import { readHealth, startHp } from './wall-health.js';
// T33 (D049, proposed): towers with hp, only with the wave option towerHealth (the server's rule "tower_health").
import { createTowerHealth } from './tower-health.js';
// T50: ships at anchor fire at a real wall, tower or the heart, only with the wave option shipFire (the rule "ship_fire").
import { createShipFire } from './ship-fire.js';
// T34 (D040, proposed): what a boarder goes for, here: a tower in reach (with tower health).
import { TARGET_PROFILES, nearestWithin } from './targeting.js';
// T35 (D040, proposed): routes over the real wall layout, only with the wave option pathing (the rule "pathing").
import { BODY, createBoarderPaths, edgeDistance, obstacleInWay, wallInWay } from './boarder-paths.js';
import { blocksAsTower, towerApproachPoint, towerEdgeDistance } from './tower-obstacles.js';
// T43 (D048, proposed): the culverin, a long gun, only with the wave option defensesV2 (the rule "defenses_v2").
import { DEFENSES_V2 } from './defenses-v2.js';
// D055: the upgrade trees after level 5 (two paths of three tiers each, src/pirates/tower-trees.js).
import { readTree, treeStats } from './tower-trees.js';
import { canFreeStructureRepair, readRecoveryPolicy } from './recovery-policy.js';

const freeze = value => {
  for (const inner of Object.values(value)) if (inner && typeof inner === 'object') freeze(inner);
  return Object.freeze(value);
};

// Every balance number in one place. Times in seconds, distances in world units.
export const CONFIG = freeze({
  tick: 0.05,                 // fixed simulation step; step(dt) runs whole ticks
  maxStep: 30,                // at most this many seconds are simulated per step() call
  maxTime: 150,               // the pirates sail off after this; the wave ends (the island held)
  islandHp: 100,
  coast: { ...surfaces.home_islet }, // rx, rz, seed of the home_islet coastline
  lanes: [                    // bearing in degrees: 0 east, 90 south (towards the camera), 180 west
    { id: 'east', bearing: 0 }, { id: 'south', bearing: 90 }, { id: 'west', bearing: 180 },
  ],
  spawnRadius: 1.9,           // in coast radii: where ships appear
  stopRadius: 1.08,           // in coast radii: where ships drop anchor, just off the sand
  stopJitter: 0.04,           // ± coast radii, so ships on one lane do not stack
  laneSpread: 9,              // ± degrees around the lane bearing
  fleet: {
    // ships = (base + perWave × (min(wave, steepUntil) − 1) + latePerWave × (wave − steepUntil)) × weather.ships
    base: 3, perWave: 2, steepUntil: 6, latePerWave: 0.6, max: 36,
    // Spawn timing: the faster pace of 11 Nov (owner: "more fast paced"): about 45% closer together.
    firstSpawn: 1.5, gap: 4.4, gapPerWave: 0.4, minGap: .8, window: 36,
    lanesPerWave: 1,          // wave 1 uses 1 lane, wave 2 two lanes, wave 3+ all three
    brigFromWave: 3, brigShare: 0.15, brigMaxShare: 0.5,
  },
  // Faster pace (11 Nov): speeds 30% up and hulls about 25% lighter than the first build, since the
  // boarders are now the main threat. crew: boarders aboard (TOWER-DEFENSE.md §12).
  ships: {
    sloop: { hp: 24, speed: 2.6, damage: 3, interval: 1.5, crew: 2 },
    brig: { hp: 60, speed: 1.7, damage: 6, interval: 2, crew: 3 },
    flagship: { hp: 600, speed: 1.05, damage: 10, interval: 2.5, crew: 4 },
    warship: { hp: 200, speed: 1.45, damage: 10, interval: 2, crew: 6 },
    // The campaign's tiers (docs/GAME-V3.md §4): new pirate types as stat variants with their own look.
    raider: { hp: 18, speed: 3.4, damage: 3, interval: 1.3, crew: 2 },       // wave 12+: fast red-sailed sloops
    ironclad: { hp: 150, speed: 1.35, damage: 8, interval: 2, crew: 4 },     // wave 30+: iron-plated brigs
    dreadnought: { hp: 400, speed: 1.2, damage: 14, interval: 2, crew: 9 },  // wave 50+: the boss warships (no extra boss hp)
    redtide: { hp: 1200, speed: 1.0, damage: 18, interval: 2, crew: 12 },    // wave 100: Captain Redtide's own ship (1200 × the hp curve)
    // wave 16+: a small, fast, fragile boat that jams towers from afar (CONFIG.gunboat); no damage, no crew. interval = seconds between shots.
    gunboat: { hp: 20, speed: 3.2, damage: 0, interval: 4.5, crew: 0 },
  },
  // The gunboat (docs/GAME-V3.md §4.1): it sails in to `range` of the nearest tower, or if it can to just
  // outside the reach of the nearest cannon (`margin`), and anchors there. Every `interval` seconds
  // (CONFIG.ships.gunboat; the first shot `aim` seconds after it anchors) it fires at the nearest tower that is not jammed already and jams it for `jam`
  // seconds: the tower does not reload or fire, then works again. A hit does no hp damage (towers have none).
  // A gunboat that no gun reaches does not hold the wave up: the pirates sail off after maxTime like any other.
  gunboat: { range: 42, margin: 1.5, jam: 3, step: .5, outRadius: 1.2, aim: .8 },
  // Boarding (TOWER-DEFENSE.md §12): an anchored ship lets its crew climb out one by one; they walk inland
  // to the island's heart, hack every standing wall in their way, and a boarder who reaches the heart
  // hurts the island and is gone. Ships at anchor shell the walls in reach; with none in reach they only
  // shell the island lightly (shellShare), so the heart is lost mainly through boarders.
  boarding: {
    heart: { x: 0, z: 2, ring: 12 }, // home_islet: the crossroads between the houses, the cabin and the bell;
                              // walls within `ring` of it are the inner ring, the rest are shore walls
    interval: 1.2,            // seconds between two boarders climbing out of one ship
    crewEvery: 15,            // one more boarder per ship every 15 waves (wave 16, 31, …)
    crewLateFrom: 46, crewLateEvery: 30, // from wave 46 one more only every 30 waves (76): the crowd stays fightable
    crewMax: 12,
    landRadius: .9,           // in coast radii: where they step onto the beach
    fan: 30,                  // ± degrees: they fan out inland from their landing
    gateAngle: 50,            // a ring wall stands in the way of boarders heading within this many degrees of it
    shoreGate: 7,             // a shore wall this close to their landing stands in their way
    meadow: 6,                // with no ring wall in the way they cross the ring this far from the heart
    contact: 1.1,             // they hack a wall from this far in front of it
    spread: .7,               // ± units sideways, so a crowd at a wall does not stand in one spot
    hp: 20, speed: 2.8, hack: 2.5, hackEvery: 1, heartDamage: 14, heartRadius: 1.2,
    shellShare: .015,          // an anchored ship with no wall in reach shells the island at this share
  },
  // The difficulty curve to wave 100: hp, speed and damage grow with the wave number (× per ship kind).
  curve: {
    // hp × (1 + each step's perWave over the waves it covers, [from, perWave]): +7% a wave from wave 4 (waves
    // 1–29 as TOWER-DEFENSE.md §8), +28% a wave from 30 to 50 (levels 4–5, research and the whole crew answer
    // it), then the hulls stay and the crowd, the warships and the tiers carry the rest, so a full, strong
    // crew can still win the final battle (GAME-V3.md §4.1, tests/pirates/late-game.test.js).
    hpSteps: [[4, 0.07], [30, 0.28], [50, 0]],
    speedPerWave: 0.004, speedMax: 1.35,
    damageFrom: 10, damagePerWave: 0.04,
    damageLateFrom: 30, damageLatePerWave: 0.01, // past wave 30 the hits grow slower: the tiers and the numbers carry it
    warshipsFrom: 21, warshipsEvery: 15, // regular warships in the fleet: one more every 15 waves from wave 21
  },
  boss: { every: 5, doubleEvery: 10, afterShips: 3 }, // every 5th wave a warship, every 10th two
  // The tiers of the campaign (docs/GAME-V3.md §4, waves 12, 15, 20, 30, 50 and 100). Shares grow by `grow`
  // per wave from their first wave up to `max`; a share of sloops sails as raiders, of brigs as ironclads, of
  // boarders as brutes (every n-th boarder, no dice, so every screen agrees).
  tiers: {
    raiders: { from: 12, share: .2, grow: .01, max: .45 },
    bossHp: [[15, 1.25], [30, 1.5]],            // the boss warships are tougher from these waves on
    brutes: { from: 20, share: .2, grow: .005, max: .35, hp: 2.2, speed: .8, hack: 1.6, heart: 1.5 },
    ironclads: { from: 30, share: .2, grow: .01, max: .6 },
    gunboats: { from: 16, share: .05, grow: .004, max: .08 }, // a share of the escorts, sailing on top of the fleet (at least one)
    dreadnoughtsFrom: 50,                       // the boss warships are dreadnoughts from here on
    final: 100,                                 // the final battle: Redtide's own ship with the bosses
  },
  // Towers by level (index 0 = level 1). Cannon: one ball at one ship. Mortar: a shell on an arc that
  // hurts every ship within `radius` of the impact, never at ships closer than minRange.
  // Levels 4 and 5 (the tower tiers of the campaign, docs/GAME-V3.md §4.1) open after waves 12, 15 and 20.
  // A watchtower's boost multiplies the damage of every cannon and mortar (levels 3 to 5).
  levels: {
    cannon: [{ damage: 10, range: 28, reload: 1.5 }, { damage: 16, range: 31, reload: 1.3 }, { damage: 24, range: 34, reload: 1.1 },
      { damage: 30, range: 36, reload: 1.05 }, { damage: 38, range: 38, reload: 1.0 }],
    mortar: [{ damage: 14, range: 36, reload: 3.5 }, { damage: 22, range: 40, reload: 3.0 }, { damage: 32, range: 44, reload: 2.6 },
      { damage: 42, range: 46, reload: 2.4 }, { damage: 54, range: 48, reload: 2.2 }],
    wall: [{ hp: 60 }, { hp: 120 }, { hp: 200 }, { hp: 300 }, { hp: 420 }],
    watchtower: [{ range: 8, boost: 1 }, { range: 12, boost: 1 }, { range: 14, boost: 1.05 }, { range: 16, boost: 1.1 }, { range: 18, boost: 1.15 }],
    house: [{}, {}, {}], // level 3 (after wave 5): more loot, and a Barracks sends two tougher militia (CONFIG.houses)
    // The harpoon tower (GAME-V3.md §5, T1): a support tower. It hits one sailing ship for little damage and slows it
    // (`slow` of its speed for `seconds`; a new hit refreshes, never stacks). It never aims at boarders or anchored ships.
    harpoon: [{ damage: 2, range: 30, reload: 2.6, slow: .25, seconds: 2.5 }, { damage: 3, range: 32, reload: 2.4, slow: .3, seconds: 2.5 },
      { damage: 4, range: 34, reload: 2.2, slow: .35, seconds: 3 }, { damage: 5, range: 36, reload: 2.0, slow: .4, seconds: 3.5 },
      { damage: 7, range: 38, reload: 1.8, slow: .45, seconds: 4 }],
    // The culverin (T43, D048 proposed; src/pirates/defenses-v2.js): a long gun. Very long reach, slow, hard single shots
    // at ships only, never closer than CONFIG.culverin.minRange. One table for the cards and the sim.
    culverin: DEFENSES_V2.culverin.levels.map(({ damage, range, reload }) => ({ damage, range, reload })),
    // The swivel-gun nest (D055): a short-range, fast anti-boarder tower. Every shot is `pellets` pellets of `damage`
    // at boarders on the island only (never a ship): one at the boarder nearest the heart in range, the rest at the
    // boarders around it (CONFIG.swivel.spread), the leftovers at the same one. Always a hit (no dice).
    swivel: [{ damage: 3, range: 13, reload: .9, pellets: 3 }, { damage: 4, range: 14, reload: .85, pellets: 3 },
      { damage: 6, range: 15, reload: .8, pellets: 3 }, { damage: 8, range: 16, reload: .75, pellets: 3 },
      { damage: 10, range: 17, reload: .7, pellets: 3 }],
  },
  // The swivel nest's pellets: they fly fast and always hit; the first shot of a wave; the spread round its target.
  // A watchtower's range bonus does not reach it (it would make a short gun a long one); its damage boost does. No gunner.
  swivel: { shotSpeed: 40, firstReload: .4, spread: 2.5 },
  harpoon: { speed: 32, firstReload: .6 }, // the harpoon's flight (units a second); the first throw comes soon after the wave starts
  // The culverin's shot: its flight (units a second, always a hit), the first shot of a wave and the closest ship it takes.
  culverin: { minRange: DEFENSES_V2.culverin.minRange, shotSpeed: DEFENSES_V2.culverin.shotSpeed, firstReload: DEFENSES_V2.culverin.firstReload },
  mortar: { radius: 4, minRange: 8, flight: 1.3, flightPerUnit: 0.025, scatter: 1.2, firstReload: 1 },
  crew: {
    gunner: { max: 2, reload: 0.75 },        // reload × 0.75 on the strongest towers, aims at the ship closest to the shore
    carpenter: { max: 2, rate: 6, rebuild: 8 }, // hp per second on the most damaged walls; a broken wall takes 8 s to rebuild
    lookout: { max: 1, sight: 1.2, warn: 3 }, // sight × 1.2 in fog; ships are announced 3 s before they appear
    // Guards (D052): hired defenders with a cutlass who fight boarders near the heart, like a Barracks militia.
    // Each stands at one of three posts `post` units around the heart (fixed bearings `bearings`, degrees), goes
    // for the boarder nearest their post within `guard`, lets go past `leash` and walks back with none in reach.
    // hp grows with the wave's damage curve (so a guard lasts about as long as a captain under the same blows) and
    // the blow with the hp curve (like the militia's); boarders fight a guard like a captain and can kill it. A fallen guard is back at the next wave (a hire is kept, like every crew member).
    guard: { max: 3, hp: 30, damage: 3, every: 1, reach: 1.1, guard: 4, leash: 6, speed: 2.8, post: 2.4, bearings: [-90, 30, 150] },
  },
  // Every player's musket (TOWER-DEFENSE.md §10), measured from the shooter's position at send time, and
  // the cutlass (§12) for a boarder within reach. The base numbers live here; captainStats() in
  // captain-stats.js scales them by the skills (§14) and the weapon (§15).
  captain: {
    levels: [{ damage: 6, range: 14, reload: 1.2 }, { damage: 9, range: 15, reload: 1.05 }, { damage: 13, range: 16, reload: 0.9 },
      { damage: 18, range: 18, reload: 0.75 }, { damage: 24, range: 20, reload: 0.6 }],
    shotSpeed: 45,
    cutlass: {
      reach: 2.2,             // the swing's radius round the captain: every boarder this close is hit (a sweep, 15 Nov)
      slack: .8,              // the sim accepts a little more: the boarder walks on during the input's lead
      reload: .75,
      levels: [{ damage: 14 }, { damage: 18 }, { damage: 24 }, { damage: 30 }, { damage: 38 }],
    },
  },
  // Captain health (GAME-V3.md §3, lane H). Every captain who sent a position (captain_move) has hp. A
  // boarder within `reach` of a standing captain goes for the nearest one (at most `crowd` boarders on one
  // captain; the rest walk on to the heart), strikes from `contact` once every `every` seconds (damage × the
  // wave's damage curve) and lets go when the captain is more than `leash` away. `most` captains per wave. At 0 hp the captain falls: no moving, shooting or building. A
  // teammate within revive.reach who holds E for revive.hold seconds (and pays 20 + 5 × wave coins on the
  // server) stands them up with revive.share of their hp; a new wave starts everybody at full hp. A captain
  // not heard for `stale` seconds is away (no target, not counted). Every captain down: the wave is lost.
  health: {
    hp: 100, reach: 3, leash: 5, contact: 1, damage: 4, every: 1, crowd: 3, stale: 8, most: 12,
    revive: { reach: 2.2, slack: .8, hold: 2, share: .5, base: 20, perWave: 5 },
  },
  flagship: {
    afterShips: 2,            // appears after this many escorts
    armor: 0,                 // damage multiplier before the three lamps are lit
    exposed: 3,               // damage multiplier after lamps_lit
    beamShare: 0.5,           // the beam takes this share of its full hp at once
    beamBurn: 40,             // then this much every beamEvery seconds
    beamEvery: 1,
  },
  cannon: {
    damage: 10, reload: 1.5, range: 28, towerBonus: 8, accuracy: 0.85, ballSpeed: 24,
    boarderAccuracy: .55,     // a ball at a small pirate on foot misses more often than at a hull (§12)
    manualMultiplier: 2, manualCooldown: 0.5, missSpread: 2.5,
  },
  fog: { max: 0.9,            // sight = range × (1 − fog)
    firstWaveSight: 0.7 },    // wave 1 always sees at least this share of the range: one cannon wins it in fog
  weather: { minShips: 0.5, maxShips: 3 },
  // reach: a ship shells walls this close; rebuild: a broken wall comes back at this share of its hp,
  // and the same wall cannot be rebuilt again for rebuildCooldown seconds.
  wall: { hp: 60, reach: 8, repairRate: 10, repairSeconds: 3, rebuild: .4, rebuildCooldown: 5 },
  // The faster pace (11 Nov): every cannon and mortar reloads in 70% of its table time (§2's reloads × 0.7).
  pace: { reload: .7 },
  maxWave: 100,
  // The tower skills of the Tech hub (docs/GAME-V3.md §5), one per building, read from the island's spots
  // (defense.spec), so every screen fights the same island.
  specs: {
    rapid: { reload: .7 },                       // cannon: reload −30%
    heavy: { damage: 1.6, reload: 1.25 },        // cannon: damage +60%, slower
    chain: { slow: .4, seconds: 3 },             // cannon: a hit slows the ship 40% for 3 s
    cluster: { blasts: 3, damage: .55, radius: 2.8, spread: 2.4 }, // mortar: 3 smaller blasts around the impact
    fire_pot: { seconds: 4, radius: 3, share: .3, every: .5 },     // mortar: the ground burns 4 s (share of the shell's damage per second)
    long_range: { range: 12 },                   // mortar: +12 range
    stone: { hp: 2 },                            // wall: hp ×2
    spiked: { damage: 5 },                       // wall: a boarder takes this (× the hp curve) at every hack
    quick_mend: { repair: 2 },                   // wall: repairs ×2 (a player's and the carpenter's)
    spotter: { damage: 1.15, radius: 22 },       // watchtower: +15% damage to the towers within radius
    signal_fire: { warn: 5 },                    // watchtower: ships show 5 s earlier
    // Tier 3, the capstones (GAME-V3.md §5.1): the island picks one of two per kind, then a tower may pick it.
    broadside: { every: 4, damage: 1.2 },        // cannon: damage +20%, and every 4th shot fires a second ball at the same target
    grapeshot: { radius: 3, share: .6, accuracy: .85 }, // cannon: a hit on a boarder hurts every boarder within radius (share of the damage); aims better at boarders
    shockwave: { push: 3 },                      // mortar: every boarder a blast hits is thrown this far back, away from the heart
    inferno: { seconds: 5, radius: 4, share: .4, every: .5 }, // mortar: every shell sets the ground on fire (wider and hotter than Fire pot)
    bastion: { hp: 1.5, mend: .005 },            // wall: hp ×1.5, and a standing wall mends 0.5% of its hp a second
    thorns: { damage: 12 },                      // wall: a hacking boarder takes this (× the hp curve) at every hack
    eagle_eye: { range: 1.2, radius: 22 },       // watchtower: range ×1.2 for the towers within radius
    war_drums: { reload: .9, radius: 22 },       // watchtower: reload ×0.9 (about 11% more shots) for the towers within radius
  },
  // Tier 2 of the Tech hub (GAME-V3.md §5.1): the island picks one of two bonuses per kind (defense.bonus, read
  // from the island's research on every screen). A bonus multiplies a number of every tower of the kind, on top
  // of its own skill (reload, range, radius, hp, repair); a drill (lookout_drill) replaces the numbers of the
  // kind's tier-1 skills instead.
  research: {
    rapid_2: { reload: .9 },                     // every cannon: reload ×0.9 (a Rapid one ×0.7 × 0.9, about −37%)
    long_guns: { range: 1.15 },                   // every cannon: range ×1.15
    quick_fuse: { reload: .88 },                 // every mortar: reload ×0.88
    heavy_shells: { radius: 1.2 },               // every mortar: blast radius ×1.2
    mason_drill: { repair: 1.5 },                // every wall: repairs ×1.5 (a player's and the carpenter's)
    thick_walls: { hp: 1.15 },                   // every wall: hp ×1.15
    lookout_drill: { spotter: { damage: 1.25, radius: 22 }, signal_fire: { warn: 8 } },
    high_tower: { range: 1.3 },                  // the watchtower's range bonus ×1.3
  },
  // The house roles (docs/GAME-V3.md "Houses"), picked on a house's card from level 2 and read from the island's
  // spots like a tower skill (defense.spec), so every screen fights the same island. Two houses may pick the
  // same role: the effects stack up to the caps below. Distances from the house's spot.
  houses: {
    level: 2,
    // Barracks: a level-2 Barracks sends 1 militia out of its door at the start of a wave, a level-3 one 2 tougher
    // ones (`units`, `hp`, `damage` by house level, index 0 = level 1), at most `max` on the island. Each goes for
    // the boarder nearest its door within `guard`, lets go past `leash` and walks home with none in reach. hp and
    // the blow grow with the wave's hp curve (like the boarders); boarders fight a militia like a captain
    // (GAME-V3.md §3) and can kill it. A fallen militia is back at the next wave.
    barracks: { units: [0, 1, 2], hp: [0, 60, 80], damage: [0, 7, 9], max: 3, every: 1, reach: 1.1,
      guard: ROLE_RADIUS.barracks, leash: ROLE_RADIUS.barracks + 2, speed: 2.6, door: 1.6 },
    // Tavern: a standing captain within `radius` gains `heal` hp a second per Tavern, at most `max` together;
    // with a Tavern on the island a revive costs `revive` percent less (the server checks it: wave_revive()).
    tavern: { radius: ROLE_RADIUS.tavern, heal: 2, max: 3, revive: 25 },
    // Workshop: a wall within `radius` repairs `repair` faster per Workshop (at most maxRepair), is rebuilt
    // (the cooldown, the carpenter's work) `faster` sooner per Workshop (at most maxFaster), and a broken one
    // comes back by itself at `share` of its hp after `mend` seconds (8 with two Workshops).
    workshop: { radius: ROLE_RADIUS.workshop, repair: .3, maxRepair: .5, faster: .3, maxFaster: .45, mend: 12, minMend: 8, share: .25 },
  },
});

const KINDS = new Set(['wall', 'cannon', 'mortar', 'harpoon', 'culverin', 'swivel', 'watchtower', 'house']);
const PRIMARY_TARGETS = {
  cannon: ['ships', 'boarders'],
  mortar: ['ships', 'boarders'],
  harpoon: ['sailing-ships'],
  culverin: ['ships'],
  swivel: ['boarders'],
};
const isAttackTower = kind => Object.hasOwn(PRIMARY_TARGETS, kind);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const round2 = value => Math.round(value * 100) / 100;
const distance = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); };
const clusterBlastDamage = (shellDamage, cluster) => round2(shellDamage * cluster.damage);

// mulberry32: a tiny, well-mixed 32-bit generator.
export function createRandom(seed) {
  let state = seedNumber(seed) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seedNumber(seed) {
  if (finite(seed)) return Math.trunc(seed);
  let hash = 2166136261; // FNV-1a over the text, so a string seed works too
  for (const char of String(seed ?? '')) hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
  return hash;
}

// A point on the canonical coast (surfaces.js), `radius` coast radii out at angle `a`.
export function coastPoint(a, radius = 1, coast = CONFIG.coast) {
  const edge = 1 + .055 * Math.sin(a * 5 + coast.seed) + .035 * Math.cos(a * 7);
  return { x: coast.rx * edge * radius * Math.cos(a), z: coast.rz * edge * radius * Math.sin(a) };
}

// culverin: false (the default) drops every culverin, as a sim that does not know the kind would (T43: only a wave
// whose rules say "defenses_v2" fights with one, so every client of a wave fights the same island).
function readDefenses(list, { culverin = false } = {}) {
  const seen = new Set(), out = [];
  for (const item of Array.isArray(list) ? list : []) {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id || seen.has(item.id)) continue;
    if (!KINDS.has(item.kind) || !finite(item.x) || !finite(item.z)) continue;
    if (item.kind === 'culverin' && !culverin) continue;
    const levels = CONFIG.levels[item.kind].length, level = Number.isInteger(item.level) ? clamp(item.level, 1, levels) : 1;
    const spec = readSpec(item.kind, item.spec); // a skill of another kind is no skill
    const bonus = readBonus(item.kind, item.bonus); // the island's tier-2 pick for this kind (GAME-V3.md §5.1)
    const health = item.kind === 'wall' ? readHealth(item.health) : 100; // D039: 0..100, whole without one
    const tree = level === levels ? readTree(item.kind, item.tree) : null; // D055: a tree grows on a level-5 tower only
    const recoveredHp = Number.isInteger(item.hpUnits) && item.hpUnits >= 0 && item.hpUnits <= 1_000_000
      && finite(item.maxHP) && item.maxHP > 0 && typeof item.instanceId === 'string'
      && Number.isInteger(item.repairSeq) && item.repairSeq >= 0
      ? { hpUnits: item.hpUnits, maxHP: item.maxHP, instanceId: item.instanceId, repairSeq: item.repairSeq } : {};
    seen.add(item.id); out.push({ id: item.id, kind: item.kind, level, x: item.x, z: item.z, ...(spec ? { spec } : {}), ...(bonus ? { bonus } : {}), ...(health < 100 ? { health } : {}),
      ...recoveredHp,
      ...(tree ? { tree } : {}) });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// The numbers of a defense's skill: its tier-1 skill (or capstone) as CONFIG.specs says, or as its island's
// drill (tier 2) replaces them. {} for no skill.
export function skillOf(item, C = CONFIG) {
  return { ...(C.specs[item?.spec] ?? {}), ...(C.research[item?.bonus]?.[item?.spec] ?? {}) };
}
const bonusOf = (item, key, C = CONFIG) => C.research[item?.bonus]?.[key] ?? 1;

const lookoutsOf = defenses => defenses.filter(item => item.kind === 'watchtower');
const lookoutsWith = (lookouts, spec) => lookouts.filter(item => item.spec === spec).map(item => ({ ...item, skill: skillOf(item) }));
const reach = (list, item) => list.find(tower => distance(tower.x, tower.z, item.x, item.z) <= tower.skill.radius);

function attackRanges(lookouts) {
  const towerBonus = Math.max(0, ...lookouts.map(item => round2(CONFIG.levels.watchtower[item.level - 1].range * bonusOf(item, 'range'))));
  const eagles = lookoutsWith(lookouts, 'eagle_eye');
  return { towerBonus, rangeFor(item, baseRange, specRange) {
    const eagle = reach(eagles, item)?.skill.range ?? 1;
    // Culverins and swivels receive nearby Eagle eye but omit the global Watchtower bonus.
    if (item.kind === 'culverin' || item.kind === 'swivel') return round2(baseRange * eagle + specRange);
    const upgraded = item.kind === 'cannon' ? baseRange * bonusOf(item, 'range') : baseRange;
    return round2((upgraded + towerBonus) * eagle + specRange);
  } };
}

function coverageProfile({ id, kind, level, x, z }, range) {
  return { id, kind, level, x, z, range, minRange: CONFIG[kind]?.minRange ?? 0, targets: [...PRIMARY_TARGETS[kind]] };
}

function clearWeatherCoverage(item, rangeFor) {
  const { kind, level } = item;
  const range = rangeFor(item, CONFIG.levels[kind][level - 1].range, skillOf(item).range ?? 0);
  return coverageProfile(item, range);
}

/** The selected defense's clear-weather primary acquisition geometry. Actual sight and target eligibility are wave rules. */
export function previewDefenseCoverage(defenses, selectedId, { defensesV2 = false } = {}) {
  const items = readDefenses(defenses, { culverin: defensesV2 === true });
  const item = items.find(row => row.id === selectedId && isAttackTower(row.kind));
  return item ? clearWeatherCoverage(item, attackRanges(lookoutsOf(items)).rangeFor) : null;
}

/** Clear-weather acquisition geometry for the same installed defenses as the selected preview. */
export function previewDefenseCoverages(defenses, { defensesV2 = false } = {}) {
  const items = readDefenses(defenses, { culverin: defensesV2 === true });
  const { rangeFor } = attackRanges(lookoutsOf(items));
  return items.filter(item => isAttackTower(item.kind)).map(item => clearWeatherCoverage(item, rangeFor));
}

// Nominal stats for a complete accepted layout. Sight, targets in motion and other wave state are applied later.
function effectiveAttackTowers(defenses, lookouts, gunnerCount) {
  const C = CONFIG, { towerBonus, rangeFor } = attackRanges(lookouts);
  const spotters = lookoutsWith(lookouts, 'spotter'), drummers = lookoutsWith(lookouts, 'war_drums');
  const boost = Math.max(1, ...lookouts.map(item => C.levels.watchtower[item.level - 1].boost ?? 1));
  const towers = defenses.filter(item => isAttackTower(item.kind)).map(item => {
    const stats = C.levels[item.kind][item.level - 1], spec = skillOf(item, C);
    const range = rangeFor(item, stats.range, spec.range ?? 0);
    const spotted = reach(spotters, item)?.skill.damage ?? 1, drums = reach(drummers, item)?.skill.reload ?? 1;
    // D055: a tower without a tree keeps the old sums exactly (no factor is applied at all).
    const tree = item.tree ? treeStats(item.kind, item.tree) : null, grown = (value, key) => (tree ? value * tree[key] : value);
    const radius = item.kind === 'mortar' ? round2(grown(C.mortar.radius * bonusOf(item, 'radius', C), 'radius')) : undefined;
    const damage = round2(grown(stats.damage * (spec.damage ?? 1) * spotted * boost, 'damage'));
    const baseReload = round2(grown(stats.reload * C.pace.reload * (spec.reload ?? 1) * bonusOf(item, 'reload', C) * drums, 'reload'));
    return { ...item, skill: spec, damage, baseReload, range, manned: false,
      ...(radius !== undefined ? { radius } : {}),
      ...(item.kind === 'harpoon' ? { slow: { slow: tree ? round2(stats.slow + tree.slow) : stats.slow, seconds: tree ? round2(stats.seconds + tree.seconds) : stats.seconds } } : {}),
      ...(item.kind === 'swivel' ? { pellets: stats.pellets + (tree?.pellets ?? 0) } : {}) };
  });
  const strength = tower => tower.damage / tower.baseReload * (tower.kind === 'mortar' ? 1.5 : 1);
  // The strongest cannon or mortar gets the Gunner, with level and then id breaking ties.
  towers.filter(item => item.kind === 'cannon' || item.kind === 'mortar')
    .sort((a, b) => strength(b) - strength(a) || b.level - a.level || (a.id < b.id ? -1 : 1))
    .slice(0, gunnerCount).forEach(tower => { tower.manned = true; tower.baseReload = round2(tower.baseReload * C.crew.gunner.reload); });
  return { towerBonus, towers };
}

/**
 * Compare one next level on the currently accepted island layout. The caller supplies the current
 * selection, crew and rules from the same island response. This projects nominal automatic fire
 * for a future wave, without estimating weather-dependent sight, total damage or a purchase.
 */
export function previewDefenseUpgrade({ defenses, selectedId, currentLevel, gunnerCount, defensesV2 } = {}) {
  if (!Array.isArray(defenses) || typeof selectedId !== 'string' || !selectedId
    || !Number.isInteger(currentLevel) || currentLevel < 1
    || !Number.isInteger(gunnerCount) || gunnerCount < 0 || gunnerCount > CONFIG.crew.gunner.max
    || typeof defensesV2 !== 'boolean') return null;
  const selected = defenses.find(item => item?.id === selectedId);
  if (!selected || !isAttackTower(selected.kind) || selected.level !== currentLevel
    || currentLevel >= CONFIG.levels[selected.kind].length || (selected.kind === 'culverin' && !defensesV2)
    || !finite(selected.x) || !finite(selected.z)) return null;

  const current = readDefenses(defenses, { culverin: defensesV2 });
  const next = readDefenses(defenses.map(item => item === selected ? { ...item, level: currentLevel + 1 } : item),
    { culverin: defensesV2 });
  const lookouts = lookoutsOf(current);
  const before = effectiveAttackTowers(current, lookouts, gunnerCount).towers;
  const after = effectiveAttackTowers(next, lookouts, gunnerCount).towers;
  const afterById = new Map(after.map(tower => [tower.id, tower]));
  const readStats = ({ level, range, damage, baseReload, manned, spec, skill }) =>
    ({ level, range, damage: spec === 'cluster' ? clusterBlastDamage(damage, skill) : damage, reloadSeconds: baseReload, manned });
  const attack = before.find(tower => tower.id === selectedId);
  const gunnerChanges = before.filter(tower => tower.id !== selectedId && tower.manned !== afterById.get(tower.id).manned)
    .map(tower => ({ id: tower.id, manned: afterById.get(tower.id).manned }));
  const kind = attack.kind;
  return { id: selectedId, kind, damageUnit: kind === 'swivel' ? 'pellet' : kind === 'mortar' ? 'blast' : 'projectile',
    before: readStats(attack), after: readStats(afterById.get(selectedId)), gunnerChanges };
}

// Another island's coast (Pirate Point on lighthouse_isle): {rx, rz, seed}, else the home_islet coast.
function readCoast(coast) {
  if (!coast || typeof coast !== 'object') return CONFIG.coast;
  const { rx, rz, seed } = coast;
  if (![rx, rz].every(value => finite(value) && value >= 5 && value <= 60) || !finite(seed)) return CONFIG.coast;
  return { rx, rz, seed };
}
// Other sea lanes: 1 to 4 of {id, bearing in degrees}, else CONFIG.lanes.
function readLanes(lanes) {
  if (!Array.isArray(lanes) || lanes.length < 1 || lanes.length > 4) return CONFIG.lanes;
  const out = lanes.filter(lane => lane && typeof lane.id === 'string' && lane.id && finite(lane.bearing))
    .map(lane => ({ id: lane.id, bearing: lane.bearing }));
  return out.length === lanes.length && new Set(out.map(lane => lane.id)).size === out.length ? out : CONFIG.lanes;
}

// The island's heart the boarders walk to: {x, z, ring?} in island-local units, else CONFIG.boarding.heart.
function readHeart(heart) {
  const fallback = CONFIG.boarding.heart;
  if (!heart || typeof heart !== 'object' || ![heart.x, heart.z].every(value => finite(value) && Math.abs(value) <= 60)) return fallback;
  const ring = finite(heart.ring) && heart.ring >= 0 && heart.ring <= 40 ? heart.ring : fallback.ring;
  return { x: heart.x, z: heart.z, ring };
}
/** How many boarders one ship of `kind` carries on `wave`. */
export function crewFor(kind, wave) {
  const B = CONFIG.boarding, base = CONFIG.ships[kind]?.crew ?? 0;
  const early = Math.floor(Math.max(0, Math.min(wave, B.crewLateFrom - 1) - 1) / B.crewEvery);
  const late = wave >= B.crewLateFrom ? 1 + Math.floor((wave - B.crewLateFrom) / B.crewLateEvery) : 0;
  return base ? Math.min(B.crewMax, base + early + late) : 0;
}
const angleGap = (a, b) => Math.abs(((a - b) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);

const count01 = (value, max) => (Number.isInteger(value) ? clamp(value, 0, max) : 0);
function readCrew(crew) {
  const C = CONFIG.crew;
  // Guards (D052) only appear in the crew when hired, so a wave without guards keeps its exact old state.
  const guard = count01(crew?.guard, C.guard.max);
  return { gunner: count01(crew?.gunner, C.gunner.max), carpenter: count01(crew?.carpenter, C.carpenter.max),
    lookout: count01(crew?.lookout, C.lookout.max), ...(guard ? { guard } : {}) };
}
/** The warships of a wave: 1 on every 5th wave, 2 on every 10th, plus regular ones late in the game. */
export function warshipsFor(wave, boss = wave % CONFIG.boss.every === 0) {
  const B = CONFIG.boss, K = CONFIG.curve;
  const bosses = boss ? (wave % B.doubleEvery === 0 ? 2 : 1) : 0;
  const regular = wave >= K.warshipsFrom ? 1 + Math.floor((wave - K.warshipsFrom) / K.warshipsEvery) : 0;
  return { bosses, regular };
}
/** The coins a revive costs on `wave` (paid by the reviver, checked by the server): 20 + 5 × wave, 25% less
 * (rounded down, as wave_revive() does) on an island with a Tavern. */
export function revivePrice(wave, { tavern = false } = {}) {
  const R = CONFIG.health.revive, n = Number.isInteger(wave) && wave > 0 ? Math.min(wave, CONFIG.maxWave) : 1;
  const price = R.base + R.perWave * n;
  return tavern ? Math.floor(price * (100 - CONFIG.houses.tavern.revive) / 100) : price;
}
/** The houses of an island's defenses that act with a role (level 2 and up): [{id, role, level, x, z}] in id order. */
export function houseRoles(defenses) {
  return readDefenses(defenses).filter(item => item.kind === 'house' && item.level >= CONFIG.houses.level && item.spec)
    .map(item => ({ id: item.id, role: item.spec, level: item.level, x: item.x, z: item.z }));
}
/** True when the island has a Tavern (the revive discount of wave_revive()). */
export const hasTavern = defenses => houseRoles(defenses).some(item => item.role === 'tavern');

/** The share of a tier at `wave` (0 before it begins). */
export function tierShare(tier, wave) {
  return wave < tier.from ? 0 : Math.min(tier.max, tier.share + tier.grow * (wave - tier.from));
}
/** The pirate types of a wave, without the dice (docs/GAME-V3.md §4): {raiders, ironclads, brutes} shares and the
 * boss kind and hp multiplier. */
export function tierFor(wave) {
  const T = CONFIG.tiers;
  const bossHp = T.bossHp.reduce((value, [from, k]) => (wave >= from ? k : value), 1);
  return { raiders: tierShare(T.raiders, wave), ironclads: tierShare(T.ironclads, wave), brutes: tierShare(T.brutes, wave),
    gunboats: tierShare(T.gunboats, wave), boss: wave >= T.dreadnoughtsFrom ? 'dreadnought' : 'warship', bossHp, final: wave >= T.final };
}
/**
 * The ships of a wave before the dice (the plan of createWave shuffles them): {count, kinds (the escorts and
 * regular warships), bosses, tier}. The campaign's tiers: some sloops sail as raiders (12+), some brigs as
 * ironclads (30+), with the same list length, so the dice of the waves before a tier are untouched. Gunboats (16+) are
 * added to the list, so the boarders of a wave do not change.
 */
export function fleetOf(wave, { shipFactor = 1, boss = wave % CONFIG.boss.every === 0 } = {}) {
  const C = CONFIG, count = clamp(Math.round(fleetSize(wave) * shipFactor), 1, C.fleet.max);
  const brigs = wave >= C.fleet.brigFromWave
    ? Math.round(count * Math.min(C.fleet.brigMaxShare, (wave - C.fleet.brigFromWave + 1) * C.fleet.brigShare)) : 0;
  const { bosses, regular } = warshipsFor(wave, boss);
  const escorts = Math.max(0, count - regular), tier = tierFor(wave);
  const sloops = escorts - Math.min(brigs, escorts), brigsIn = Math.min(brigs, escorts);
  const raiders = Math.round(sloops * tier.raiders), ironclads = Math.round(brigsIn * tier.ironclads);
  const kinds = [...Array(sloops - raiders).fill('sloop'), ...Array(raiders).fill('raider'),
    ...Array(brigsIn - ironclads).fill('brig'), ...Array(ironclads).fill('ironclad'), ...Array(Math.min(regular, count)).fill('warship')];
  // Gunboats (16+) sail on top of the fleet, so the boarders of a wave stay what they were (a gunboat has no crew):
  // a small share of the escorts, at least one.
  if (tier.gunboats > 0) kinds.push(...Array(Math.max(1, Math.round(escorts * tier.gunboats))).fill('gunboat'));
  return { count, kinds, bosses, tier };
}
/**
 * How hard a wave is, as one number (docs/GAME-V3.md §4, the scaling test): every ship's hull and every
 * boarder's hp, weighted by how fast they come and how hard they hit. Pure, no dice.
 */
export function threatOf(wave, { boss = wave % CONFIG.boss.every === 0 } = {}) {
  const C = CONFIG, curve = curveFor(wave), { kinds, bosses, tier } = fleetOf(wave, { boss });
  const brute = tier.brutes, boarderHp = C.boarding.hp * curve.hp * (1 + brute * (C.tiers.brutes.hp - 1));
  const one = (kind, bossy) => {
    const stats = C.ships[kind], hp = stats.hp * curve.hp * (bossy && kind === 'warship' ? tier.bossHp : 1);
    return (hp * (stats.speed * curve.speed) ** .5 + crewFor(kind, wave) * boarderHp) * curve.damage;
  };
  let total = kinds.reduce((sum, kind) => sum + one(kind, false), 0);
  for (let i = 0; i < bosses; i++) total += one(tier.boss, true);
  if (tier.final) total += one('redtide', true);
  return Math.round(total);
}
/** The fleet's size before the weather: steep for the first waves, then slower. */
export function fleetSize(wave) {
  const F = CONFIG.fleet;
  return F.base + F.perWave * (Math.min(wave, F.steepUntil) - 1) + F.latePerWave * Math.max(0, wave - F.steepUntil);
}
/** Ship hp, speed and damage multipliers for a wave number. */
export function curveFor(wave) {
  const K = CONFIG.curve;
  return {
    hp: round2(1 + K.hpSteps.reduce((sum, [from, perWave], i) =>
      sum + perWave * Math.max(0, Math.min(wave, K.hpSteps[i + 1]?.[0] ?? Infinity) - from), 0)),
    speed: round2(Math.min(K.speedMax, 1 + K.speedPerWave * (wave - 1))),
    damage: round2(1 + K.damagePerWave * Math.max(0, Math.min(wave, K.damageLateFrom) - K.damageFrom)
      + K.damageLatePerWave * Math.max(0, wave - K.damageLateFrom)),
  };
}

function shuffle(list, random) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/**
 * createWave({seed, wave, weather: {ships, fog}, island: {hp}, defenses: [{id, kind, level, x, z, health?}],
 *   crew: {gunner, carpenter, lookout, guard?}, boss, flagship, countdown, coast, lanes}).
 * level (1-5) and crew are optional: an old caller without them gets level 1 and no crew. A wall's health
 * (0-100, D039) is the percent its last wave left it; without one it starts whole. boss is
 * optional too: without it every 5th wave is a boss wave (TOWER-DEFENSE.md §1), never with the flagship.
 * Inputs to step(): {type: 'fire', cannonId, targetId}, {type: 'repair', wallId, skills},
 * {type: 'rebuild', wallId, skills}, {type: 'lamps_lit'},
 * {type: 'captain_shot', by, targetId, level, skills, weapon, x, z, ax, az} (the shooter's own position, captain
 * level, skills and weapon; targetId a ship or a boarder and/or the aim point ax, az) and
 * {type: 'captain_strike', by, targetId, level, skills, x, z} (the cutlass, a boarder within reach). The
 * skills are the sender's own (captain-stats.js). heart: {x, z, ring} where the boarders walk (TOWER-DEFENSE.md §12).
 * Captain health (GAME-V3.md §3): {type: 'captain_move', by, x, z, colour?, away?} says where a captain stands
 * (the first one adds them to the wave with full hp; away: true takes them out) and
 * {type: 'captain_revive', by, targetId, x, z} stands a fallen teammate up (the server charged the reviver).
 * v3 waves: event (an id of wave-events.js, eventFor(wave, seed) in the controller) brings the wave's event;
 * finishers: true lets a boss below a quarter of its hull start a finisher (finisher/rules.js), whose input is
 * {type: 'finisher_input', by, from, marks, easy?}; gapMs(players) is the room's wave gap (its grace time).
 * towerHealth: true (T33, D049; the wave's rule "tower_health" from the server, the same on every client) gives
 * cannons, mortars and harpoons hp (tower-health.js): boarders hack a tower in their reach, a broken one stops
 * firing, and repair / rebuild inputs whose wallId names a tower repair or rebuild it.
 * pathing: true (T34/T35, D040; the wave's rule "pathing") walks boarders over a grid of the island past the walls'
 * footprints (boarder-paths.js): a gap when it is quicker, else through the cheapest wall; no captain or tower
 * through a standing wall. Without it the fixed routes of landBoarder stay (D040 option A).
 * defensesV2: true (T43, D048; the wave's rule "defenses_v2") lets culverins in `defenses` fight: a long gun on a
 * tower spot that shoots gunboats and siege barges first, then the ship with the most hp. Without it a culverin
 * in `defenses` is ignored, and a wave without a culverin plays exactly as before either way.
 * shipFire: true (T50; the wave's rule "ship_fire") makes a ship at anchor fire at a real target (ship-fire.js): the wall
 * on its beach, else the nearest standing tower (with towerHealth), else the heart, each in reach; the ball flies and
 * its impact costs that target hp (the heart its ♥, captains next to it a little). With nothing in reach it holds its
 * fire. Without it a ship shells the nearest wall in reach, else the island at CONFIG.boarding.shellShare, as before.
 */
export function createWave(options = {}) {
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
  const lookouts = lookoutsOf(defenses), S = C.specs;
  const signal = Math.max(0, ...lookoutsWith(lookouts, 'signal_fire').map(item => item.skill.warn));
  let fogShare = waveNumber === 1 ? Math.max(1 - fog, C.fog.firstWaveSight) : 1 - fog;
  if (crew.lookout && fog > 0) fogShare = Math.min(1, fogShare * C.crew.lookout.sight);
  const warnLead = (crew.lookout ? C.crew.lookout.warn : 0) + signal;
  const coast = readCoast(options?.coast), laneList = readLanes(options?.lanes);
  const { towerBonus, towers: configured } = effectiveAttackTowers(defenses, lookouts, crew.gunner);
  const firstReload = { mortar: C.mortar.firstReload, harpoon: C.harpoon.firstReload, culverin: C.culverin.firstReload, swivel: C.swivel.firstReload };
  const towers = configured.map(tower => ({ ...tower, sight: tower.range * fogShare * happening.sightOf(tower, defenses),
    reload: firstReload[tower.kind] ?? 0, lastShot: -Infinity, shots: 0 }));
  const cannons = towers.filter(item => item.kind === 'cannon'), mortars = towers.filter(item => item.kind === 'mortar');
  // The sight the island shows (fog edge, the manual-fire reach): the level-1 cannon's, or the best cannon's.
  const sight = Math.max(C.cannon.range + towerBonus, ...cannons.map(item => item.range)) * fogShare;
  // The house roles (CONFIG.houses): the houses of level 2 and up that picked one, in id order.
  const HO = C.houses, roles = houseRoles(defenses), withRole = role => roles.filter(item => item.role === role);
  const barracks = withRole('barracks'), taverns = withRole('tavern'), workshops = withRole('workshop');
  const W = HO.workshop, housesNear = (list, item, radius) => list.filter(house => inHouseReach(house, item, radius)).length;
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

  let ticks = 0, rest = 0, nextSpawn = 0, nextWarn = 0, nextShipId = 1, sunk = 0, islandHp = maxHp, done = false;
  let started = countdown === 0 ? null : false, lastCountdown = null, lampsLit = false, endReason = null;
  let nextBoarderId = 1, killed = 0, landed = 0;
  const ships = [], wrecks = [], balls = [], shells = [], captains = new Map(), blades = new Map(), boarders = [], fires = [];
  // Captain health (GAME-V3.md §3): id -> {id, x, z, hp, maxHp, down, downAt, seen, colour, away}.
  const H = C.health, party = new Map();
  // The Barracks' militia (CONFIG.houses.barracks): {id, militia: true, houseId, homeX, homeZ, x, z, hp, maxHp,
  // damage, state: idle|walking|fighting, foe, hitIn, facing}. They walk out at the start of the wave.
  const militia = [], militiaById = new Map();
  let militiaFell = 0;
  let queued = [];
  const now = () => round2(ticks * C.tick);
  const flagshipAfloat = () => ships.some(ship => ship.kind === 'flagship') ||
    plan.slice(nextSpawn).some(entry => entry.kind === 'flagship');
  const statsOf = kind => C.ships[kind] ?? happening.statsOf(kind);

  function damageShip(ship, amount, by, events, extra = {}) {
    let damage = amount;
    if (ship.kind === 'flagship' && extra.source !== 'lamps') damage *= lampsLit ? C.flagship.exposed : C.flagship.armor;
    damage = Math.min(ship.hp, round2(damage));
    ship.hp = round2(ship.hp - damage);
    // v3 waves: a boss below a quarter of its hull is held at 1 hp for its finisher (finisher/rules.js).
    if (finisher.watch(ship) || finisher.holds(ship)) { const before = ship.hp + damage; ship.hp = Math.max(1, ship.hp); damage = round2(before - ship.hp); }
    events.push({ type: 'ship_hit', t: now(), shipId: ship.id, kind: ship.kind, by, damage, hp: ship.hp,
      x: round2(ship.x), z: round2(ship.z), blocked: damage === 0, ...extra });
    if (ship.hp > 0) return;
    ships.splice(ships.indexOf(ship), 1); sunk++;
    wrecks.push({ id: ship.id, kind: ship.kind, x: round2(ship.x), z: round2(ship.z), t: now() });
    events.push({ type: 'ship_sunk', t: now(), shipId: ship.id, kind: ship.kind, by, boss: ship.boss, x: round2(ship.x), z: round2(ship.z),
      ...(ship.crew > 0 ? { crewLost: ship.crew } : {}), ...(extra.finisher ? { finisher: true } : {}) });
    happening.onSunk(ship, events);
  }
  // A gunboat at anchor: every `interval` it jams the nearest tower in range that is not jammed yet (else the
  // nearest one, which only starts its jam again). Towers have no hp, so nothing is damaged.
  function gunboatFire(ship, t, events) {
    if ((ship.attackIn -= C.tick) > 1e-9) return;
    ship.attackIn += statsOf(ship.kind).interval;
    const G = C.gunboat;
    let free = null, freeD = Infinity, any = null, anyD = Infinity;
    for (const tower of towers) {
      if (!towerHealth.canFire(tower)) continue; // T33: a broken tower is not worth jamming
      const d = distance(tower.x, tower.z, ship.x, ship.z);
      if (d > G.range + 1e-9) continue;
      if (d < anyD) { any = tower; anyD = d; }
      if (!jammed(tower, t) && d < freeD) { free = tower; freeD = d; }
    }
    const target = free ?? any;
    if (!target) return;
    target.jammedUntil = round2(t + G.jam);
    events.push({ type: 'gunboat_fired', t: now(), shipId: ship.id, targetId: target.id, x: round2(ship.x), z: round2(ship.z), toX: target.x, toZ: target.z });
    events.push({ type: 'tower_jammed', t: now(), towerId: target.id, shipId: ship.id, until: target.jammedUntil, x: target.x, z: target.z });
  }
  function damageBoarder(boarder, amount, by, events, extra = {}) {
    const damage = Math.min(boarder.hp, round2(amount));
    boarder.hp = round2(boarder.hp - damage);
    events.push({ type: 'boarder_hit', t: now(), boarderId: boarder.id, by, damage, hp: boarder.hp, x: round2(boarder.x), z: round2(boarder.z), ...extra });
    if (boarder.hp > 0) return;
    boarders.splice(boarders.indexOf(boarder), 1); killed++;
    events.push({ type: 'boarder_killed', t: now(), boarderId: boarder.id, by, x: round2(boarder.x), z: round2(boarder.z), ...extra });
  }
  // v3 waves: what the wave's event and the finisher may do to the battle (wave-events.js, finisher/rules.js).
  function hitWall(wall, amount, events, extra = {}) {
    const damage = Math.min(wall.hp, round2(amount));
    wall.hp = round2(Math.max(0, wall.hp - damage));
    if (wall.hp === 0) { wall.repairLeft = 0; wall.rebuilding = 0; }
    events.push({ type: 'wall_damaged', t: now(), wallId: wall.id, damage, hp: wall.hp, broken: wall.hp === 0, x: wall.x, z: wall.z, ...extra });
  }
  function hurtIsland(amount, events, extra = {}) {
    const damage = Math.min(islandHp, round2(amount));
    islandHp = round2(islandHp - damage);
    events.push({ type: 'island_damaged', t: now(), damage, hp: islandHp, x: heart.x, z: heart.z, ...extra });
    if (islandHp <= 0) end('island_lost', events);
  }
  const removeShip = ship => { const at = ships.indexOf(ship); if (at >= 0) ships.splice(at, 1); };
  happening.bind({ ships, walls, towers, tick: C.tick, now: () => now(), newShipId: () => `ship_${nextShipId++}`, remove: removeShip, hitWall, hurtIsland });
  finisher.bind({ party, ships, presentAt: (hero, t) => presentAt(hero, t), damageShip, now: () => now() });
  // T50: the ship fire of the wave rule ship_fire (inert without it). No dice.
  const shipFire = createShipFire({ enabled: options?.shipFire === true, walls, towers, towerHealth, heart, wallReach: C.wall.reach,
    hitWall, hurtIsland, hurtCaptain: (hero, damage, shipId, events) => woundCaptain(hero, damage, { shipId }, events),
    captains: () => { const t = ticks * C.tick; return [...party.values()].filter(hero => !hero.down && presentAt(hero, t)); }, now: () => now(),
    powerOf: ship => statsOf(ship.kind)?.damage ?? ship.damage });
  rescue.bind({ party, presentAt: (hero, t) => presentAt(hero, t), now: () => now(), heart });
  const damageTarget = (target, amount, by, events, extra) => (target.boarder
    ? damageBoarder(target, amount, by, events, extra) : damageShip(target, amount, by, events, extra));
  const findTarget = id => (typeof id !== 'string' ? undefined
    : id.startsWith('boarder_') ? boarders.find(item => item.id === id) : ships.find(item => item.id === id));

  // Where a ship or a boarder will be after `seconds`: along its course, stopping at its anchor or wall.
  const ahead = (target, seconds) => {
    if (target.boarder) return target.state === 'walking'
      ? { x: target.x + target.vx * seconds, z: target.z + target.vz * seconds } : { x: target.x, z: target.z };
    const lead = target.state === 'sailing' ? Math.min(target.speed * seconds, target.left) : 0;
    return { x: target.x + target.dx * lead, z: target.z + target.dz * lead };
  };
  const targetKey = target => (target.boarder ? { boarderId: target.id } : { shipId: target.id });

  function fire(cannon, target, manual, events) {
    const flight = distance(cannon.x, cannon.z, target.x, target.z) / C.cannon.ballSpeed;
    const aim = ahead(target, flight);
    let toX = aim.x, toZ = aim.z;
    const hit = manual || random() < (target.boarder ? cannon.skill?.accuracy ?? C.cannon.boarderAccuracy : C.cannon.accuracy) * happening.aim(target);
    if (!hit) { const a = random() * Math.PI * 2, r = 1 + random() * (C.cannon.missSpread - 1); toX += Math.cos(a) * r; toZ += Math.sin(a) * r; }
    const blown = !hit && happening.drift(1); // v3 waves: the storm's wind carries a miss away
    if (blown) { toX += blown.x; toZ += blown.z; }
    const damage = cannon.damage * (manual ? C.cannon.manualMultiplier : 1);
    const impactAt = round2(ticks * C.tick + flight);
    const ball = { cannonId: cannon.id, targetId: target.id, ...targetKey(target), hit, damage, manual, impactAt,
      ...(cannon.spec === 'chain' && !target.boarder ? { chain: cannon.skill } : {}),
      ...(cannon.spec === 'grapeshot' && target.boarder ? { grape: cannon.skill } : {}) };
    // Broadside (tier 3): every n-th shot is two balls (the second one rides the same aim, no extra dice).
    const volley = cannon.spec === 'broadside' && (cannon.shots + 1) % cannon.skill.every === 0 ? 2 : 1;
    for (let k = 0; k < volley; k++) balls.push({ ...ball });
    cannon.reload = cannon.baseReload; cannon.lastShot = ticks * C.tick; cannon.shots++;
    for (let k = 0; k < volley; k++) {
      events.push({ type: 'cannon_fired', t: now(), cannonId: cannon.id, targetId: target.id, manual, hit, damage, level: cannon.level,
        x: cannon.x, z: cannon.z + k * .8, toX: round2(toX), toZ: round2(toZ + k * .8), impactAt, ...(target.boarder ? { boarder: true } : {}),
        ...(volley > 1 ? { broadside: true } : {}) });
    }
  }

  function lob(mortar, target, events) {
    const d = distance(mortar.x, mortar.z, target.x, target.z), flight = round2(C.mortar.flight + d * C.mortar.flightPerUnit);
    const aim = ahead(target, flight), a = random() * Math.PI * 2, r = random() * (C.mortar.scatter + happening.scatter());
    const blown = happening.drift(.5) ?? { x: 0, z: 0 }; // v3 waves: the storm pushes the shells downwind
    const toX = round2(aim.x + Math.cos(a) * r + blown.x), toZ = round2(aim.z + Math.sin(a) * r + blown.z), impactAt = round2(ticks * C.tick + flight);
    const radius = mortar.radius ?? C.mortar.radius;
    shells.push({ towerId: mortar.id, x: mortar.x, z: mortar.z, toX, toZ, damage: mortar.damage, impactAt, from: now(),
      ...(radius !== C.mortar.radius ? { radius } : {}),
      ...(['cluster', 'fire_pot', 'shockwave', 'inferno'].includes(mortar.spec) ? { spec: mortar.spec, skill: mortar.skill } : {}) });
    mortar.reload = mortar.baseReload; mortar.lastShot = ticks * C.tick; mortar.shots++;
    events.push({ type: 'mortar_fired', t: now(), towerId: mortar.id, targetId: target.id, damage: mortar.damage, level: mortar.level,
      x: mortar.x, z: mortar.z, toX, toZ, impactAt, radius });
  }

  const roped = ship => balls.some(ball => ball.harpoon && ball.targetId === ship.id); // a harpoon is already on its way
  const slowedUntil = ship => ship.slowUntil ?? -Infinity;
  // The harpoon tower throws (T1): always a hit (a rope, no dice, so the random stream is untouched), a quick flat flight.
  function throwHarpoon(tower, target, events) {
    const flight = distance(tower.x, tower.z, target.x, target.z) / C.harpoon.speed, aim = ahead(target, flight);
    const impactAt = round2(ticks * C.tick + flight);
    balls.push({ cannonId: tower.id, targetId: target.id, ...targetKey(target), hit: true, damage: tower.damage, manual: false, impactAt, harpoon: tower.slow });
    tower.reload = tower.baseReload; tower.lastShot = ticks * C.tick; tower.shots++;
    events.push({ type: 'harpoon_thrown', t: now(), towerId: tower.id, targetId: target.id, damage: tower.damage, level: tower.level,
      x: tower.x, z: tower.z, toX: round2(aim.x), toZ: round2(aim.z), impactAt });
  }
  // The culverin fires (T43): like the harpoon, always a hit (no dice, so the random stream is untouched), a fast flat
  // flight aimed ahead of the ship. The ball lands through the same impact code as a cannon's (ship_hit, ship_sunk).
  function fireCulverin(tower, target, events) {
    const flight = distance(tower.x, tower.z, target.x, target.z) / C.culverin.shotSpeed, aim = ahead(target, flight);
    const impactAt = round2(ticks * C.tick + flight);
    balls.push({ cannonId: tower.id, targetId: target.id, ...targetKey(target), hit: true, damage: tower.damage, manual: false, impactAt, culverin: true });
    tower.reload = tower.baseReload; tower.lastShot = ticks * C.tick; tower.shots++;
    events.push({ type: 'culverin_fired', t: now(), towerId: tower.id, targetId: target.id, damage: tower.damage, level: tower.level,
      x: tower.x, z: tower.z, toX: round2(aim.x), toZ: round2(aim.z), impactAt });
  }
  // The swivel nest fires (D055): `pellets` pellets that always hit (no dice, so the random stream is untouched): one at
  // the target, one at each boarder round it (nearest first, within CONFIG.swivel.spread), the rest at the target again.
  // Each pellet is a fast ball that lands through the impact code of the cannon's (boarder_hit, boarder_killed).
  function fireSwivel(tower, target, events) {
    const near = boarders.filter(item => item !== target && distance(item.x, item.z, target.x, target.z) <= C.swivel.spread)
      .sort((p, q) => distance(p.x, p.z, target.x, target.z) - distance(q.x, q.z, target.x, target.z) || (p.id < q.id ? -1 : 1));
    const hits = [target, ...near.slice(0, tower.pellets - 1)];
    while (hits.length < tower.pellets) hits.push(target);
    for (const item of hits) {
      const impactAt = round2(ticks * C.tick + distance(tower.x, tower.z, item.x, item.z) / C.swivel.shotSpeed);
      balls.push({ cannonId: tower.id, targetId: item.id, ...targetKey(item), hit: true, damage: tower.damage, manual: false, impactAt, swivel: true });
    }
    tower.reload = tower.baseReload; tower.lastShot = ticks * C.tick; tower.shots++;
    events.push({ type: 'swivel_fired', t: now(), towerId: tower.id, targetId: target.id, damage: tower.damage, pellets: tower.pellets, level: tower.level,
      x: tower.x, z: tower.z, toX: round2(target.x), toZ: round2(target.z), hits: [...new Set(hits.map(item => item.id))] });
  }
  const pending = target => balls.reduce((sum, ball) => sum + (ball.targetId === target.id && ball.hit ? ball.damage : 0), 0);
  // v3 waves: at night a lit target (near the heart, a fire, or burning) is seen at the full range.
  const litSight = tower => tower.range * fogShare;
  const sees = (tower, target, d) => d <= tower.sight || (happening.lit(target, fires) && d <= litSight(tower));
  const visible = (cannon, target) => sees(cannon, target, distance(cannon.x, cannon.z, target.x, target.z));
  const armoured = ship => ship.kind === 'flagship' && !lampsLit && ships.length > 1; // escorts first while armoured
  const shoreOrder = (a, b) => (a.state === 'attacking') !== (b.state === 'attacking') ? (a.state === 'attacking' ? -1 : 1) : a.left - b.left;
  const toHeart = item => distance(item.x, item.z, heart.x, heart.z);
  const captainBy = input => (typeof input.by === 'string' && /^[A-Za-z0-9_.:-]{1,64}$/.test(input.by) ? input.by : null);
  const captainLevel = input => (Number.isInteger(input.level) ? clamp(input.level, 1, C.captain.levels.length) : 1);

  // The captain's gun (§10, §14, §15): the shooter's own level, skills and weapon decide the numbers
  // (captain-stats.js), so every client resolves the same hits. targetId names the ship (single and
  // pierce shots); ax, az is the aim point (the cone's direction, the bomb's landing spot).
  function captainShot(input, events) {
    const by = captainBy(input);
    if (!by || !finite(input.x) || !finite(input.z) || !standing(by, input)) return;
    const level = captainLevel(input), skills = readSkills(input.skills), stats = captainStatsFor(level, skills, input.weapon), t = ticks * C.tick;
    // The named target: a ship or a boarder on foot (§12); every gun hits both where it makes sense.
    const named = findTarget(input.targetId);
    const aimed = finite(input.ax) && finite(input.az) ? { x: input.ax, z: input.az } : named ? { x: named.x, z: named.z } : null;
    if (!aimed || t - (captains.get(by) ?? -Infinity) < stats.reload - 1e-9) return;
    const x = input.x, z = input.z, base = { type: 'captain_fired', by, level, weapon: stats.weapon, mode: stats.mode, damage: stats.damage,
      reload: stats.reload, x: round2(x), z: round2(z) };
    const shotAt = (target, from = { x, z }) => round2(t + distance(from.x, from.z, target.x, target.z) / stats.shotSpeed);
    const hit = (target, impactAt) => balls.push({ cannonId: `captain:${by}`, targetId: target.id, ...targetKey(target), hit: true,
      damage: stats.damage, manual: true, captain: true, impactAt });
    const mark = (target, impactAt) => ({ id: target.id, toX: round2(target.x), toZ: round2(target.z), impactAt, ...(target.boarder ? { boarder: true } : {}) });
    if (stats.mode === 'area') {
      // A bomb: thrown at the aim point (at most the gun's range away), it bursts there after its flight.
      const d = distance(x, z, aimed.x, aimed.z), reach = Math.min(d, stats.range), k = d > 0 ? reach / d : 0;
      const toX = round2(x + (aimed.x - x) * k), toZ = round2(z + (aimed.z - z) * k), impactAt = round2(t + stats.flight + reach * stats.flightPerUnit);
      captains.set(by, t);
      shells.push({ towerId: `captain:${by}`, x: round2(x), z: round2(z), toX, toZ, damage: stats.damage, impactAt, from: now(), radius: stats.radius, captain: true });
      events.push({ ...base, t: now(), targetId: named?.id ?? null, toX, toZ, impactAt, radius: stats.radius, targets: [] });
      return;
    }
    if (stats.mode === 'cone') {
      // Select the nearest ships or boarders in the cone where the shooter saw them (bounded by seenPlace).
      // Keep the living target objects: projectiles and damage still resolve at their current positions.
      const heading = Math.atan2(aimed.z - z, aimed.x - x), half = stats.cone / 2 * Math.PI / 180;
      const inCone = [...ships, ...boarders].map(item => {
        const at = seenPlace(input, item), d = distance(x, z, at.x, at.z);
        let turn = Math.abs(Math.atan2(at.z - z, at.x - x) - heading);
        if (turn > Math.PI) turn = 2 * Math.PI - turn;
        return { item, d, turn };
      }).filter(entry => entry.d <= stats.range && entry.turn <= half + 1e-9)
        .sort((a, b) => a.d - b.d || (a.item.id < b.item.id ? -1 : 1)).slice(0, stats.targets);
      captains.set(by, t);
      const targets = inCone.map(({ item }) => { const impactAt = shotAt(item); hit(item, impactAt); return mark(item, impactAt); });
      const end = { x: x + Math.cos(heading) * stats.range, z: z + Math.sin(heading) * stats.range };
      events.push({ ...base, t: now(), targetId: targets[0]?.id ?? null, toX: round2(targets[0]?.toX ?? end.x), toZ: round2(targets[0]?.toZ ?? end.z),
        impactAt: targets[0]?.impactAt ?? round2(t + stats.range / stats.shotSpeed), cone: stats.cone, heading: round2(heading), targets });
      return;
    }
    // single and pierce: the ship or boarder named, in range.
    const seen = named ? seenPlace(input, named) : null;
    if (!named || distance(x, z, seen.x, seen.z) > stats.range) return;
    captains.set(by, t);
    const impactAt = shotAt(named);
    hit(named, impactAt);
    const targets = [mark(named, impactAt)];
    if (stats.mode === 'pierce') {
      // The ball goes through: the nearest other ship or boarder behind the first on the same line.
      const d0 = distance(x, z, named.x, named.z) || 1, ux = (named.x - x) / d0, uz = (named.z - z) / d0;
      let behind = null, best = Infinity;
      for (const item of [...ships, ...boarders]) {
        if (item === named) continue;
        const along = (item.x - x) * ux + (item.z - z) * uz, side = Math.abs((item.x - x) * uz - (item.z - z) * ux);
        if (along > d0 && along - d0 <= stats.pierceDepth && side <= stats.pierceWidth && along < best) { behind = item; best = along; }
      }
      if (behind) { const at = shotAt(behind); hit(behind, at); targets.push(mark(behind, at)); }
    }
    const last = targets[targets.length - 1];
    events.push({ ...base, t: now(), targetId: named.id, toX: last.toX, toZ: last.toZ, impactAt: last.impactAt, targets,
      ...(named.boarder ? { boarder: true } : {}) });
  }
  // The cutlass (§12, §14 Brawler; a sweep since the battle-clarity change, D052 update 15 Nov): an instant swing
  // round where the captain stood that hits EVERY boarder within the swing's radius (sweepRadius, plus the input's
  // slack: boarders walk on during its lead), all at full damage, with its own short reload. The named boarder
  // (else the nearest) is the one the swing faces. The striker's skills scale it (captain-stats.js): damage ×
  // strikeMultiplier (Cutlass), reload × strikeReloadMultiplier (Second wind), radius + 1 with Sweep. No dice.
  // Recovery waves (fix/playtest-1117): a captain's command lands about a second after the shooter saw the
  // target, which has walked on meanwhile, so a blow at a boarder that stood in reach on screen missed. A shot or
  // blow carries `seen` (the tick the shooter saw); its reach and range are checked against the target's place
  // at that tick, at most REWIND_TICKS (2 s) back, the same on every replay. Damage still lands now; no other
  // check changes (the reload, standing, the shooter's own place), so no client can claim more than a hit it
  // could have made in the last 2 s. Other waves ignore `seen`.
  function recordSeen() {
    if (recoveryPolicy !== 'structure-recovery-v1') return;
    const at = new Map();
    for (const item of boarders) at.set(item.id, { x: item.x, z: item.z });
    for (const item of ships) at.set(item.id, { x: item.x, z: item.z });
    seenAt.set(ticks, at);
    for (const key of seenAt.keys()) if (key < ticks - REWIND_TICKS) seenAt.delete(key);
  }
  function seenPlace(input, target) {
    if (recoveryPolicy !== 'structure-recovery-v1' || !Number.isInteger(input.seen) || input.seen > ticks
      || input.seen < ticks - REWIND_TICKS) return target;
    return seenAt.get(input.seen)?.get(target.id) ?? target;
  }
  function captainStrike(input, events) {
    const by = captainBy(input);
    if (!by || !finite(input.x) || !finite(input.z) || !standing(by, input)) return;
    const level = captainLevel(input), stats = captainStatsFor(level, readSkills(input.skills));
    const blade = C.captain.cutlass, reach = stats.sweepRadius + blade.slack, t = ticks * C.tick;
    const reload = round2(blade.reload * stats.strikeReloadMultiplier);
    if (t - (blades.get(by) ?? -Infinity) < reload - 1e-9) return;
    // Everyone in the circle, chosen before a blow lands (a boarder killed first never shifts the rest); in landing order.
    const hit = boarders.filter(boarder => { const at = seenPlace(input, boarder); return distance(input.x, input.z, at.x, at.z) <= reach + 1e-9; });
    if (!hit.length) return;
    let target = hit.find(boarder => boarder.id === input.targetId) ?? null;
    if (!target) {
      let best = Infinity;
      for (const boarder of hit) { const d = distance(input.x, input.z, boarder.x, boarder.z); if (d < best - 1e-9) { target = boarder; best = d; } }
    }
    blades.set(by, t);
    const damage = round2(blade.levels[level - 1].damage * stats.strikeMultiplier);
    const swept = hit.filter(item => item !== target);
    events.push({ type: 'captain_struck', t: now(), by, targetId: target.id, level, damage, reload, radius: stats.sweepRadius,
      x: round2(input.x), z: round2(input.z), toX: round2(target.x), toZ: round2(target.z), swept: swept.map(item => item.id) });
    damageBoarder(target, damage, `captain:${by}`, events, { captain: true, blade: true });
    for (const item of swept) damageBoarder(item, damage, `captain:${by}`, events, { captain: true, blade: true, sweep: true });
  }

  // Captain health (GAME-V3.md §3). A captain is in the wave from their first captain_move; a shot or a
  // blow of a known captain also says where they stand. A fallen captain's shots and blows do nothing.
  const presentAt = (hero, t) => !hero.away && t - hero.seen <= H.stale + 1e-9;
  function standing(by, input) {
    const hero = party.get(by);
    if (!hero) return true; // not in the party (an older client, a test): the gun works as before
    if (hero.down) return false;
    hero.seen = ticks * C.tick; hero.away = false; hero.x = input.x; hero.z = input.z;
    return true;
  }
  function captainMove(input, events) {
    const by = captainBy(input);
    if (!by || !finite(input.x) || !finite(input.z)) return;
    const t = ticks * C.tick;
    let hero = party.get(by);
    if (!hero) {
      if (input.away === true || party.size >= H.most) return;
      hero = { id: by, x: input.x, z: input.z, hp: H.hp, maxHp: H.hp, down: false, downAt: null, seen: t, colour: 0, away: false };
      party.set(by, hero);
      events.push({ type: 'captain_joined', t: now(), captainId: by, hp: hero.hp, x: round2(input.x), z: round2(input.z) });
    }
    hero.seen = t; hero.away = input.away === true;
    if (Number.isInteger(input.colour) && input.colour >= 0 && input.colour <= 9) hero.colour = input.colour;
    if (!hero.down) { hero.x = input.x; hero.z = input.z; } // a fallen captain stays where they fell
  }
  // A teammate next to a fallen captain (within revive reach of where the helper stood) stands them up.
  function captainRevive(input, events) {
    const by = captainBy(input), R = H.revive;
    if (!by || !finite(input.x) || !finite(input.z) || typeof input.targetId !== 'string') return;
    const helper = party.get(by), hero = party.get(input.targetId);
    if (!helper || helper.down || !hero || hero === helper || !hero.down) return;
    // A delayed paid event belongs to exactly one fall; it cannot revive a later fall.
    if (input.downAt !== undefined && input.downAt !== Math.round(hero.downAt / C.tick)) return;
    if (distance(input.x, input.z, hero.x, hero.z) > R.reach + R.slack) return;
    helper.seen = ticks * C.tick; helper.away = false; helper.x = input.x; helper.z = input.z;
    hero.down = false; hero.downAt = null; hero.hp = Math.max(1, Math.round(hero.maxHp * captainStatsFor(1, input.skills).reviveShare)); // a medic's help-up gives more hp (captain-stats.js)
    events.push({ type: 'captain_revived', t: now(), captainId: hero.id, by, hp: hero.hp, x: round2(hero.x), z: round2(hero.z) });
  }
  // A boarder's blow at a militia fighter (the Barracks): at 0 hp it falls, and every boarder on it walks on.
  function hurtMilitia(unit, boarder, events) {
    const damage = Math.min(unit.hp, round2(H.damage * curve.damage));
    unit.hp = round2(unit.hp - damage);
    events.push({ type: 'militia_hit', t: now(), militiaId: unit.id, boarderId: boarder.id, damage, hp: unit.hp, x: round2(unit.x), z: round2(unit.z) });
    if (unit.hp > 0) return;
    militia.splice(militia.indexOf(unit), 1); militiaById.delete(unit.id); militiaFell++;
    events.push({ type: 'militia_fell', t: now(), militiaId: unit.id, houseId: unit.houseId, ...(unit.guard ? { guard: true } : {}), x: round2(unit.x), z: round2(unit.z) });
    for (const other of boarders) if (other.foe === unit.id) { other.foe = null; other.goal = null; if (other.state === 'fighting') other.state = 'walking'; }
  }
  // A boarder's blow at a captain; at 0 hp the captain falls and every boarder on them walks on.
  function hurtCaptain(hero, boarder, events) {
    if (hero.militia) { hurtMilitia(hero, boarder, events); return; }
    woundCaptain(hero, round2(H.damage * curve.damage), { boarderId: boarder.id }, events);
  }
  // A captain takes `amount` (a boarder's blow, or T50 a ship's ball landing next to them: source {boarderId} or {shipId}).
  function woundCaptain(hero, amount, source, events) {
    const damage = Math.min(hero.hp, round2(amount));
    hero.hp = round2(hero.hp - damage);
    events.push({ type: 'captain_hit', t: now(), captainId: hero.id, ...source, damage, hp: hero.hp,
      x: round2(hero.x), z: round2(hero.z) });
    if (hero.hp > 0) return;
    hero.down = true; hero.downAt = now();
    events.push({ type: 'captain_fell', t: now(), captainId: hero.id, x: round2(hero.x), z: round2(hero.z) });
    for (const other of boarders) if (other.foe === hero.id) { other.foe = null; other.goal = null; if (other.state === 'fighting') other.state = 'walking'; }
  }
  // The captain a boarder goes for: the one it is on while they stand within the leash, else the nearest
  // standing captain within reach (ties: the lower id), else none. O(captains) per boarder.
  // A Barracks militia counts as a captain here (the same reach, leash and crowd), so boarders fight it too.
  function foeOf(boarder) {
    if (!party.size && !militia.length) return null;
    const t = ticks * C.tick;
    const fit = hero => (hero.militia ? hero.hp > 0 : !hero.down && presentAt(hero, t));
    if (boarder.foe) {
      const hero = party.get(boarder.foe) ?? militiaById.get(boarder.foe);
      if (hero && fit(hero) && distance(boarder.x, boarder.z, hero.x, hero.z) <= H.leash + 1e-9
          && (!paths || !towerBlocking || paths.canReach(boarder, hero))) return hero;
      boarder.foe = null; boarder.goal = null;
    }
    let best = null, near = H.reach + 1e-9;
    const consider = hero => {
      if (!fit(hero) || crowdOn(hero) >= H.crowd) return;
      const d = distance(boarder.x, boarder.z, hero.x, hero.z);
      if (paths && d < near + 1e-9 && !paths.canReach(boarder, hero)) return; // T35: never through a standing wall
      if (d < near - 1e-9 || (best && Math.abs(d - near) <= 1e-9 && hero.id < best.id)) { best = hero; near = d; }
    };
    for (const hero of party.values()) consider(hero);
    for (const unit of militia) consider(unit);
    if (best) { boarder.foe = best.id; boarder.goal = null; }
    return best;
  }
  // How many boarders are on this captain already: at most H.crowd at once, the rest walk on.
  const crowdOn = hero => { let n = 0; for (const other of boarders) if (other.foe === hero.id) n++; return n; };
  // T33 + T34: the tower a boarder goes for (only with tower health): the one it is on while that one still
  // stands within the leash, else the nearest standing tower within reach that has fewer than `crowd`
  // boarders on it (ties: the lower id; targeting.js). TARGET_PROFILES.boarder holds reach, leash and crowd.
  const TP = TARGET_PROFILES.boarder;
  const crowdOnTower = tower => { let n = 0; for (const other of boarders) if (other.towerFoe === tower.id) n++; return n; };
  function towerFoeOf(boarder) {
    if (!towerHealth.enabled) return null;
    const gap = tower => towerBlocking ? towerEdgeDistance(boarder, tower) : distance(boarder.x, boarder.z, tower.x, tower.z);
    const reachable = tower => (!towerBlocking || gap(tower) > 1e-9) && (!paths || paths.canReach(boarder, towerBlocking
      ? towerApproachPoint(boarder, tower, BODY + .01) : tower));
    if (boarder.towerFoe) {
      const held = towerById.get(boarder.towerFoe);
      if (held && towerHealth.isTarget(held) && gap(held) <= TP.leash + 1e-9 && reachable(held)) return held;
      boarder.towerFoe = null; boarder.goal = null;
    }
    const found = towerBlocking
      ? [...towers].sort((a, b) => {
        const difference = gap(a) - gap(b);
        return Math.abs(difference) <= 1e-9 ? (a.id < b.id ? -1 : 1) : difference;
      })
        .find(tower => gap(tower) <= TP.towerReach + 1e-9 && towerHealth.isTarget(tower)
          && crowdOnTower(tower) < TP.crowd && reachable(tower)) ?? null
      : nearestWithin(boarder, towers, TP.towerReach, tower => towerHealth.isTarget(tower) && crowdOnTower(tower) < TP.crowd
        && (!paths || paths.canReach(boarder, tower)));
    if (found) { boarder.towerFoe = found.id; boarder.goal = null; }
    return found;
  }
  // Every captain in the wave has fallen (at least one is in it): the island cannot hold.
  function allFallen(t) {
    let present = 0;
    for (const hero of party.values()) {
      if (!presentAt(hero, t)) continue;
      if (!hero.down) return false;
      present++;
    }
    return present > 0;
  }

  // A broken wall comes back at `share` of its hp: the rebuilder's rebuildShare (Master shipwright 60%),
  // the carpenter's CONFIG.wall.rebuild (40%).
  function rebuild(wall, by, events, share = C.wall.rebuild) {
    wall.hp = round2(Math.max(1, Math.round(wall.maxHp * share)));
    wall.rebuildAt = ticks * C.tick; wall.rebuilding = 0; wall.repairLeft = 0; wall.mending = 0;
    events.push({ type: 'wall_rebuilt', t: now(), wallId: wall.id, hp: wall.hp, by, x: wall.x, z: wall.z });
  }

  // The engineer role (docs/GAME-V3.md "Captain tree and roles"): a wall they repair or rebuild gets +25% hp, once.
  function boostWall(wall, stats) {
    if (stats.wallHpMultiplier <= 1 || wall.boosted) return;
    wall.boosted = true; wall.maxHp = round2(wall.maxHp * stats.wallHpMultiplier);
  }

  function applyInput(input, events) {
    if (!input || typeof input !== 'object' || typeof input.type !== 'string') return;
    // v3 waves: while a finisher runs the battle stands still: only positions and the finisher's own input count.
    if (input.type === 'finisher_input' || input.type === 'finisher_ready') { finisher.input(input); rescue.input(input); return; }
    if (input.type === 'structure_repaired') { applyRecoveryEvent(input.event); return; }
    if ((finisher.active || rescue.active) && input.type !== 'captain_move') return;
    if (input.type === 'fire') {
      const cannon = typeof input.cannonId === 'string' ? cannonById.get(input.cannonId) : undefined;
      const target = findTarget(input.targetId);
      if (!cannon || !target || !visible(cannon, target) || jammed(cannon, ticks * C.tick)) return; // a jammed cannon cannot be fired by hand either
      if (!towerHealth.canFire(cannon)) return; // T33: nor a broken one
      if (ticks * C.tick - cannon.lastShot < C.cannon.manualCooldown) return;
      fire(cannon, target, true, events);
    } else if (input.type === 'repair') {
      if (!freeStructureRepair) return;
      const wall = typeof input.wallId === 'string' ? wallById.get(input.wallId) : undefined;
      // T33: with tower health the same message repairs a tower (wallId names it).
      if (!wall && towerHealth.enabled) { towerHealth.repair(towerById.get(input.wallId), captainStatsFor(1, input.skills)); return; }
      if (!wall || wall.hp <= 0 || wall.hp >= wall.maxHp) return; // a broken wall is rebuilt, not repaired
      if (wall.repairLeft <= 0) wall.repaired = 0;
      wall.repairLeft = C.wall.repairSeconds;
      // The repairer's own skills (Quick fix, Master shipwright) set how fast this repair goes; a Workshop nearby too.
      const stats = captainStatsFor(1, input.skills);
      wall.repairRate = round2(C.wall.repairRate * stats.repairMultiplier * wall.repairBoost * wall.boost);
      boostWall(wall, stats); // an engineer's repair raises the wall's strength by 25% (once)
    } else if (input.type === 'rebuild') {
      if (!freeStructureRepair) return;
      const wall = typeof input.wallId === 'string' ? wallById.get(input.wallId) : undefined;
      if (!wall && towerHealth.enabled) { towerHealth.rebuild(towerById.get(input.wallId), captainStatsFor(1, input.skills), ticks * C.tick, events); return; }
      if (!wall || wall.hp > 0 || ticks * C.tick - wall.rebuildAt < wall.cooldown - 1e-9) return;
      // The rebuilder's own skills: Master shipwright brings the wall back at 60% instead of 40%.
      const stats = captainStatsFor(1, input.skills);
      boostWall(wall, stats);
      rebuild(wall, 'player', events, stats.rebuildShare);
    } else if (input.type === 'lamps_lit') {
      if (!withFlagship || lampsLit) return;
      lampsLit = true; // the beam strikes the flagship on the next tick, or as soon as it appears
    } else if (input.type === 'captain_shot') captainShot(input, events);
    else if (input.type === 'captain_strike') captainStrike(input, events);
    else if (input.type === 'captain_move') captainMove(input, events);
    else if (input.type === 'captain_revive') captainRevive(input, events);
  }

  function end(reason, events) {
    // T38: while the rescue runs it decides; once it is over end() comes again and the wave ends (still lost).
    if (rescue.active) return;
    if (rescue.offer(reason, events)) return; // island_lost / captains_fallen: the last chance first
    done = true; endReason = reason;
    events.push({ type: 'wave_ended', t: now(), reason, ...result() });
  }

  function aimTower(tower) {
    let target = null, best = Infinity;
    if (tower.kind === 'mortar') {
      // The shell goes where most pirates are (within its radius), the gunner's to the threat nearest the
      // heart (a boarder before any ship), then to the ship nearest the shore.
      const all = [...boarders, ...ships];
      for (const item of all) {
        const d = distance(tower.x, tower.z, item.x, item.z);
        if (!sees(tower, item, d) || d < C.mortar.minRange || (!item.boarder && armoured(item))) continue;
        let score = 0;
        for (const other of all) if (distance(other.x, other.z, item.x, item.z) <= C.mortar.radius) score++;
        const rank = tower.manned
          ? (item.boarder ? -2e4 + toHeart(item) : (item.state === 'attacking' ? 0 : 1) * 1e4 + item.left) - score * .01
          : -score * 1e4 + d;
        if (rank < best) { target = item; best = rank; }
      }
      return target;
    }
    if (tower.kind === 'harpoon') {
      // A harpoon only wants a ship that is still sailing (an anchored one is not going anywhere) and has no harpoon on
      // its way: one that is not slowed yet first, then the one nearest its anchorage.
      for (const ship of ships) {
        const d = distance(tower.x, tower.z, ship.x, ship.z);
        if (ship.state !== 'sailing' || !sees(tower, ship, d) || armoured(ship) || roped(ship)) continue;
        const rank = (slowedUntil(ship) > now() + 1e-9 ? 1e4 : 0) + ship.left;
        if (rank < best) { target = ship; best = rank; }
      }
      return target;
    }
    if (tower.kind === 'culverin') {
      // A culverin only wants ships (never boarders), not closer than its minimum range, and not one already doomed by
      // the balls on their way: a ship that attacks towers first (the gunboat, the siege barge), then the one with the
      // most hp left; a tie goes to the lower ship id.
      const priority = DEFENSES_V2.culverin.priority, order = ship => Number(String(ship.id).replace(/\D/g, '')) || 0;
      for (const ship of ships) {
        const d = distance(tower.x, tower.z, ship.x, ship.z);
        if (!sees(tower, ship, d) || d < C.culverin.minRange || armoured(ship) || pending(ship) >= ship.hp) continue;
        const rank = (priority.includes(ship.kind) ? -1e6 : 0) - ship.hp;
        if (rank < best || (rank === best && order(ship) < order(target))) { target = ship; best = rank; }
      }
      return target;
    }
    // The swivel nest (D055) takes only boarders: the one nearest the heart that the pellets on their way do not kill.
    if (tower.kind === 'swivel') {
      for (const boarder of boarders) {
        if (!visible(tower, boarder) || pending(boarder) >= boarder.hp) continue;
        const d = toHeart(boarder);
        if (d < best) { target = boarder; best = d; }
      }
      return target;
    }
    // A cannon takes the boarder nearest the heart first (the closest threat), else a ship as before.
    for (const boarder of boarders) {
      if (!visible(tower, boarder) || pending(boarder) >= boarder.hp) continue;
      const d = toHeart(boarder);
      if (d < best) { target = boarder; best = d; }
    }
    if (target) return target;
    for (const ship of ships) {
      const d = distance(tower.x, tower.z, ship.x, ship.z);
      if (!sees(tower, ship, d) || pending(ship) >= ship.hp || armoured(ship)) continue;
      if (tower.manned ? !target || shoreOrder(ship, target) < 0 : d < best) { target = ship; best = d; }
    }
    return target;
  }

  // A boarder climbs out of an anchored ship: wades to the beach, then walks inland through the shore wall
  // nearest its landing (if one stands close), through the ring wall it heads for (if one stands within
  // gateAngle), and on to the heart. The route is fixed when it lands; a wall on it stops it only while standing.
  function landBoarder(ship, events) {
    const landing = coastPoint(ship.a, B.landRadius, coast);
    const route = [{ x: landing.x, z: landing.z }];
    let shore = null, near = B.shoreGate;
    for (const wall of walls) {
      if (wall.inner) continue;
      const d = distance(wall.x, wall.z, landing.x, landing.z);
      if (d <= near) { shore = wall; near = d; }
    }
    const side = (crowd() * 2 - 1) * B.spread;
    if (shore) route.push({ wall: shore });
    const heading = Math.atan2(landing.z - heart.z, landing.x - heart.x) + (crowd() * 2 - 1) * B.fan * Math.PI / 180;
    let ring = null, gap = B.gateAngle * Math.PI / 180;
    for (const wall of walls) {
      if (!wall.inner) continue;
      const g = angleGap(wall.bearing, heading);
      if (g <= gap) { ring = wall; gap = g; }
    }
    route.push(ring ? { wall: ring } : { x: heart.x + Math.cos(heading) * B.meadow, z: heart.z + Math.sin(heading) * B.meadow });
    route.push({ x: heart.x, z: heart.z, heart: true });
    // T35: with pathing only the landing and the heart stay; the grid finds the way between (the dice above are drawn alike).
    if (paths) route.splice(1, route.length - 2);
    // Brutes (wave 20+): every n-th boarder is a big one, by its number, so every screen agrees.
    const T = C.tiers.brutes, every = tier.brutes > 0 ? Math.max(1, Math.round(1 / tier.brutes)) : 0;
    const brute = every > 0 && nextBoarderId % every === 0;
    const hp = Math.round(B.hp * curve.hp * (brute ? T.hp : 1) * 10) / 10;
    const start = { x: ship.x + (landing.x - ship.x) * .25, z: ship.z + (landing.z - ship.z) * .25 };
    // A coastal wall can cover the spawn before stepClear ever runs. Approach from offshore so even a
    // ship anchored next to the wall puts its boarders on the seaward side.
    if (paths && wallsInOrder.some(wall => wall.hp > 0 && edgeDistance(start, wall) === 0)) {
      const offshore = coastPoint(ship.a, C.spawnRadius, coast);
      const hit = wallInWay(offshore, start, wallsInOrder);
      if (hit) {
        const share = Math.max(0, hit.t - 1e-6);
        start.x = offshore.x + (start.x - offshore.x) * share;
        start.z = offshore.z + (start.z - offshore.z) * share;
      }
    }
    const boarder = { id: `boarder_${nextBoarderId++}`, boarder: true, shipId: ship.id, x: start.x, z: start.z, vx: 0, vz: 0,
      hp, maxHp: hp, speed: round2(B.speed * curve.speed * (brute ? T.speed : 1)), hack: round2(B.hack * curve.damage * (brute ? T.hack : 1)),
      damage: round2(B.heartDamage * curve.damage * (brute ? T.heart : 1)),
      route, leg: 0, goal: null, side, state: 'walking', wallId: null, hackIn: 0, facing: landing.x < ship.x ? -1 : 1, ...(brute ? { brute: true } : {}) };
    boarders.push(boarder); landed++;
    events.push({ type: 'boarder_landed', t: now(), boarderId: boarder.id, shipId: ship.id, hp, x: round2(start.x), z: round2(start.z),
      left: ship.crew });
  }
  // The point a boarder walks to for one leg: a wall's is just in front of it on the side the boarder comes
  // from (fixed when the leg starts, so it does not chase a moving point).
  function legPoint(boarder, leg) {
    if (!leg.wall) return leg;
    const w = leg.wall, dx = boarder.x - w.x, dz = boarder.z - w.z, length = Math.hypot(dx, dz) || 1;
    const ux = dx / length, uz = dz / length;
    return { x: w.x + ux * B.contact - uz * boarder.side, z: w.z + uz * B.contact + ux * boarder.side };
  }
  // What a boarder goes for right now: the ONE place a boarder's target is chosen (TOWER-DEFENSE.md §12).
  // Its route is fixed when it lands (the shore wall at its landing, the ring wall it heads for, the
  // heart); a broken wall on it is rubble and skipped. Returns {kind: 'wall', wall, leg} (hack it),
  // {kind: 'point', leg} (walk there) or {kind: 'heart', leg} (walk there and hurt the island).
  // attackCaptain (lane H, GAME-V3.md §3): first of all {kind: 'captain', hero}, the nearest standing
  // captain within reach (foeOf, from the positions of captain_move), whom moveBoarder strikes.
  // T33 (tower health only): after the wall in its way, {kind: 'tower', tower}, a standing tower within reach
  // (towerFoeOf), before the next point or the heart: the T34 order captain, wall, tower, heart.
  function pickBoarderTarget(boarder) {
    const foe = foeOf(boarder);
    if (foe) { boarder.towerFoe = null; return { kind: 'captain', hero: foe }; }
    // Battle clarity (pathing): a standing wall that stopped this boarder's step holds it until it is broken.
    if (paths && boarder.blockedBy) {
      const wall = wallById.get(boarder.blockedBy);
      if (wall && wall.hp > 0) { boarder.towerFoe = null; return { kind: 'wall', wall, leg: null }; }
      boarder.blockedBy = null;
    }
    if (paths && boarder.blockedTowerBy) {
      const tower = towerById.get(boarder.blockedTowerBy);
      if (tower && towerHealth.isTarget(tower)) { boarder.towerFoe = tower.id; return { kind: 'tower', tower }; }
      boarder.blockedTowerBy = null;
    }
    if (paths && boarder.leg > 0) return pathTarget(boarder);
    while (boarder.leg < boarder.route.length - 1) {
      const leg = boarder.route[boarder.leg];
      if (leg.wall && leg.wall.hp > 0) { boarder.towerFoe = null; return { kind: 'wall', wall: leg.wall, leg }; }
      if (!leg.wall) break;
      boarder.leg++; boarder.goal = null;
    }
    const tower = towerFoeOf(boarder);
    if (tower) return { kind: 'tower', tower };
    if (boarder.leg < boarder.route.length - 1) return { kind: 'point', leg: boarder.route[boarder.leg] };
    return { kind: 'heart', leg: boarder.route[boarder.route.length - 1] };
  }
  // T35 (pathing): ashore, the next step of the grid route: {kind: 'wall', wall} (hack it from here), a tower
  // in reach, {kind: 'step', point} (walk to the next cell), {kind: 'heart', leg} or {kind: 'none'} (no way: wait).
  function pathTarget(boarder) {
    const way = paths.next(boarder), wall = way.kind === 'wall' ? wallById.get(way.wallId) : null;
    if (wall && wall.hp > 0) { boarder.towerFoe = null; return { kind: 'wall', wall, leg: null }; }
    const obstacleTower = way.kind === 'tower' ? towerById.get(way.towerId) : null;
    if (obstacleTower && towerHealth.isTarget(obstacleTower)) { boarder.towerFoe = obstacleTower.id; return { kind: 'tower', tower: obstacleTower }; }
    const tower = towerFoeOf(boarder);
    if (tower) return { kind: 'tower', tower };
    if (way.kind === 'heart' || toHeart(boarder) <= B.heartRadius) return { kind: 'heart', leg: boarder.route[boarder.route.length - 1] };
    if (way.kind === 'step') return { kind: 'step', point: { x: way.x, z: way.z } };
    return { kind: 'none' };
  }
  // Battle clarity (15 Nov, with the rule "pathing"): a boarder never walks into a standing wall. Every step goes
  // through stepClear: the first wall on it (wallInWay, BODY off its footprint) stops the boarder there and the
  // step returns that wall; blockAt then makes it hack that wall until it breaks (pickBoarderTarget, blockedBy).
  // Without pathing the fixed routes step exactly as before.
  function stepClear(boarder, ux, uz, step) {
    if (!paths || !(step > 1e-9)) { boarder.x += ux * step; boarder.z += uz * step; return null; }
    const to = { x: boarder.x + ux * step, z: boarder.z + uz * step };
    const hit = towerBlocking ? obstacleInWay(boarder, to, blockingObjects) : wallInWay(boarder, to, wallsInOrder);
    if (!hit) { boarder.x = to.x; boarder.z = to.z; return null; }
    const share = Math.max(0, hit.t - 1e-6);
    boarder.x += ux * step * share; boarder.z += uz * step * share;
    return hit.kind === 'tower' ? {kind: 'tower', obstacle: hit.wall} : hit.wall;
  }
  function blockAt(boarder, wall) {
    if (wall?.kind === 'tower') {
      const tower = wall.obstacle;
      boarder.state = 'hacking'; boarder.towerId = tower.id; boarder.wallId = null; boarder.blockedTowerBy = tower.id;
      boarder.hackIn = B.hackEvery / 2; boarder.vx = boarder.vz = 0;
      return;
    }
    boarder.state = 'hacking'; boarder.wallId = wall.id; boarder.towerId = null; boarder.blockedBy = wall.id;
    boarder.hackIn = B.hackEvery / 2; boarder.vx = boarder.vz = 0;
  }
  // One tick of a boarder: hack the wall it stands at, or walk towards its target. True at the heart.
  function moveBoarder(boarder, events) {
    if (boarder.state === 'hacking') {
      const target = pickBoarderTarget(boarder);
      const onIt = target.kind === 'wall' ? target.wall.id === boarder.wallId : target.kind === 'tower' && target.tower.id === boarder.towerId;
      if (!onIt) { boarder.state = 'walking'; boarder.wallId = null; boarder.towerId = null; boarder.goal = null; return false; }
      if ((boarder.hackIn -= C.tick) > 1e-9) return false;
      boarder.hackIn += B.hackEvery;
      // T33: a blow at a tower; the one that breaks it lets every boarder on it walk on (towerFoeOf).
      if (target.kind === 'tower') { towerHealth.hit(target.tower, boarder.hack, boarder.id, events); return false; }
      const wall = target.wall, damage = Math.min(wall.hp, boarder.hack);
      wall.hp = round2(Math.max(0, wall.hp - damage));
      if (wall.hp === 0) { wall.repairLeft = 0; wall.rebuilding = 0; }
      events.push({ type: 'wall_damaged', t: now(), wallId: wall.id, boarderId: boarder.id, damage: round2(damage), hp: wall.hp,
        broken: wall.hp === 0, x: wall.x, z: wall.z });
      // Spiked (GAME-V3.md §5) and Thorns (its tier-3 capstone): the wall bites back at every hack.
      if (wall.spec === 'spiked' || wall.spec === 'thorns') damageBoarder(boarder, round2(wall.skill.damage * curve.hp), `wall:${wall.id}`, events, { spikes: true });
      return false;
    }
    if (boarder.state === 'fighting') {
      // Toe to toe with a captain: a blow every `every` seconds while they stand within contact.
      const target = pickBoarderTarget(boarder);
      if (target.kind !== 'captain' || distance(boarder.x, boarder.z, target.hero.x, target.hero.z) > H.contact + .3) {
        boarder.state = 'walking'; boarder.goal = null; return false;
      }
      if ((boarder.hitIn -= C.tick) > 1e-9) return false;
      boarder.hitIn += H.every;
      hurtCaptain(target.hero, boarder, events);
      return false;
    }
    let budget = boarder.speed * C.tick;
    while (budget > 1e-9) {
      const target = pickBoarderTarget(boarder);
      if (target.kind === 'captain') {
        // After a captain: walk up to them and start fighting.
        const hero = target.hero, dx = hero.x - boarder.x, dz = hero.z - boarder.z, d = Math.hypot(dx, dz);
        if (Math.abs(dx) > .05) boarder.facing = dx < 0 ? -1 : 1;
        if (d <= H.contact + 1e-9) {
          boarder.state = 'fighting'; boarder.wallId = null; boarder.hitIn = H.every / 2; boarder.vx = boarder.vz = 0; return false;
        }
        const step = Math.min(budget, d - H.contact * .9);
        boarder.vx = dx / d * boarder.speed; boarder.vz = dz / d * boarder.speed;
        const hit = stepClear(boarder, dx / d, dz / d, step);
        if (hit) {
          boarder.vx = boarder.vz = 0;
          if (hit.kind === 'tower') { blockAt(boarder, hit); return false; }
          break; // a wall between: it waits there, as before
        }
        budget -= step;
        if (step <= 1e-9) break;
        continue;
      }
      if (target.kind === 'tower') {
        // T33: after a tower: walk up to it and start hacking from `contact`, as at a wall.
        const tower = target.tower, approach = towerBlocking ? towerApproachPoint(boarder, tower) : tower;
        const dx = approach.x - boarder.x, dz = approach.z - boarder.z, d = Math.sqrt(dx * dx + dz * dz);
        if (Math.abs(dx) > .05) boarder.facing = dx < 0 ? -1 : 1;
        if ((towerBlocking ? towerEdgeDistance(boarder, tower) : d) <= B.contact + 1e-9) {
          boarder.state = 'hacking'; boarder.towerId = tower.id; boarder.wallId = null; boarder.hackIn = B.hackEvery / 2; boarder.vx = boarder.vz = 0; return false;
        }
        const gap = towerBlocking ? towerEdgeDistance(boarder, tower) : d;
        const step = Math.min(budget, Math.max(0, gap - B.contact * .9));
        boarder.vx = dx / d * boarder.speed; boarder.vz = dz / d * boarder.speed;
        const wall = stepClear(boarder, dx / d, dz / d, step);
        if (wall) { blockAt(boarder, wall); return false; }
        budget -= step;
        if (step <= 1e-9) break;
        continue;
      }
      if (target.kind === 'none') { boarder.vx = boarder.vz = 0; break; } // T35: no way to the heart: it waits
      if (target.kind === 'wall' && !target.leg) {
        // T35: a standing wall in the way: walk right up to it (its nearest edge), then hack it there, so a boarder
        // is seen at the wall it breaks (battle clarity; before, it hacked from up to WALL_ENGAGE away).
        const wall = target.wall, half = 1;
        const nx = Math.max(wall.x - half, Math.min(wall.x + half, boarder.x)), nz = Math.max(wall.z - half, Math.min(wall.z + half, boarder.z));
        const gap = edgeDistance(boarder, wall);
        if (gap <= BODY + .05) { blockAt(boarder, wall); return false; }
        const dx = nx - boarder.x, dz = nz - boarder.z, d = Math.sqrt(dx * dx + dz * dz);
        if (Math.abs(dx) > .05) boarder.facing = dx < 0 ? -1 : 1;
        const step = Math.min(budget, Math.max(0, gap - BODY));
        boarder.vx = dx / d * boarder.speed; boarder.vz = dz / d * boarder.speed;
        const hit = stepClear(boarder, dx / d, dz / d, step);
        budget -= step;
        if (hit || step <= 1e-9 || edgeDistance(boarder, wall) <= BODY + .05) { blockAt(boarder, hit ?? wall); return false; }
        continue;
      }
      if (target.kind === 'step') {
        // T35: walk to the middle of the next cell; the next pick gives the cell after it.
        const dx = target.point.x - boarder.x, dz = target.point.z - boarder.z, d = Math.sqrt(dx * dx + dz * dz);
        if (Math.abs(dx) > .05) boarder.facing = dx < 0 ? -1 : 1;
        const step = Math.min(budget, d);
        if (d > 1e-9) {
          boarder.vx = dx / d * boarder.speed; boarder.vz = dz / d * boarder.speed;
          const wall = stepClear(boarder, dx / d, dz / d, step);
          if (wall) { blockAt(boarder, wall); return false; }
        }
        budget -= step;
        if (step <= 1e-9) break;
        continue;
      }
      const leg = target.leg, heart = target.kind === 'heart';
      const goal = boarder.goal ??= legPoint(boarder, leg), dx = goal.x - boarder.x, dz = goal.z - boarder.z, d = Math.hypot(dx, dz);
      const reach = heart ? B.heartRadius : .05;
      if (d <= reach) {
        if (target.kind === 'wall') { boarder.state = 'hacking'; boarder.wallId = target.wall.id; boarder.hackIn = B.hackEvery / 2; boarder.vx = boarder.vz = 0; return false; }
        if (heart) return true;
        boarder.leg++; boarder.goal = null; continue;
      }
      const step = Math.min(budget, d - (heart ? reach * .5 : 0));
      boarder.vx = dx / d * boarder.speed; boarder.vz = dz / d * boarder.speed;
      if (Math.abs(dx) > .05) boarder.facing = dx < 0 ? -1 : 1;
      const blocked = stepClear(boarder, dx / d, dz / d, step); // pathing only: a wall on the beach stops the wade
      if (blocked) { blockAt(boarder, blocked); return false; }
      budget -= step;
      if (step <= 1e-9) break;
    }
    return pickBoarderTarget(boarder).kind === 'heart' && toHeart(boarder) <= B.heartRadius + 1e-6;
  }
  // One tick of a Barracks militia (CONFIG.houses.barracks): keep to its boarder while that one stays within
  // the leash of the door, else take the boarder nearest the door within guard (ties: the one that landed
  // first), walk up and strike every `every` seconds; with none, walk home. No dice, so every screen agrees.
  // A hired guard (CONFIG.crew.guard, D052) is the same fighter with its own numbers and its post by the heart.
  function moveMilitia(unit, events) {
    const G = unit.guard ? C.crew.guard : HO.barracks, fromDoor = item => distance(item.x, item.z, unit.homeX, unit.homeZ);
    let foe = unit.foe ? boarders.find(item => item.id === unit.foe) ?? null : null;
    if (foe && fromDoor(foe) > G.leash + 1e-9) foe = null;
    if (!foe) {
      let best = G.guard + 1e-9;
      for (const boarder of boarders) { const d = fromDoor(boarder); if (d < best - 1e-9) { foe = boarder; best = d; } }
    }
    unit.foe = foe?.id ?? null;
    const goal = foe ?? { x: unit.homeX, z: unit.homeZ }, dx = goal.x - unit.x, dz = goal.z - unit.z, d = Math.hypot(dx, dz);
    if (Math.abs(dx) > .05) unit.facing = dx < 0 ? -1 : 1;
    if (foe && d <= G.reach + 1e-9) {
      unit.state = 'fighting';
      if ((unit.hitIn -= C.tick) > 1e-9) return;
      unit.hitIn += G.every;
      events.push({ type: 'militia_struck', t: now(), militiaId: unit.id, targetId: foe.id, damage: unit.damage,
        x: round2(unit.x), z: round2(unit.z), toX: round2(foe.x), toZ: round2(foe.z) });
      damageBoarder(foe, unit.damage, `militia:${unit.id}`, events, { militia: true });
      return;
    }
    unit.hitIn = G.every / 2; // the first blow half a second after it reaches a boarder
    if (!foe && d <= .05) { unit.state = 'idle'; return; }
    unit.state = 'walking';
    const step = Math.min(G.speed * C.tick, Math.max(0, d - (foe ? G.reach * .9 : 0)));
    if (d > 1e-9) { unit.x = round2(unit.x + dx / d * step); unit.z = round2(unit.z + dz / d * step); }
  }
  // A Tavern (CONFIG.houses.tavern): every standing captain within its radius regains hp, also in a wave; two
  // Taverns together give at most `max` a second. A captain_healed event about every 2 hp (for the drawing).
  function tavernHeal(t, events) {
    const T = HO.tavern;
    for (const hero of party.values()) {
      if (hero.down || !presentAt(hero, t) || hero.hp >= hero.maxHp) continue;
      const n = housesNear(taverns, hero, T.radius);
      if (!n) continue;
      const amount = Math.min(hero.maxHp - hero.hp, Math.min(T.max, T.heal * n) * C.tick);
      hero.hp = round2(hero.hp + amount); hero.healed = round2((hero.healed ?? 0) + amount);
      if (hero.healed + 1e-9 >= 2 || hero.hp >= hero.maxHp) {
        events.push({ type: 'captain_healed', t: now(), captainId: hero.id, amount: hero.healed, hp: hero.hp, x: round2(hero.x), z: round2(hero.z) });
        hero.healed = 0;
      }
    }
  }

  function tick(events) {
    if (started === false) {
      const left = Math.ceil(countdown - ticks * C.tick - 1e-9);
      if (left !== lastCountdown && left > 0) { lastCountdown = left; events.push({ type: 'wave_countdown', t: now(), secondsLeft: left }); }
      ticks++;
      if (ticks * C.tick + 1e-9 >= countdown) { ticks = 0; started = null; }
      return;
    }
    if (started === null) {
      started = true;
      events.push({ type: 'wave_started', t: 0, wave: waveNumber, ships: plan.length, flagship: withFlagship, boss, warships: bosses,
        ...(tier.final && !withFlagship ? { final: true } : {}), ...(happening.id ? { event: happening.id } : {}),
        fog, sight: round2(sight), heart: { x: heart.x, z: heart.z },
        lanes: (eventLanes ?? lanes.slice(0, laneCount)).map(lane => ({ id: lane.id, x: round2(lane.stop.x), z: round2(lane.stop.z) })) });
      if (happening.id) events.push({ type: 'wave_event', t: 0, event: happening.id, wave: waveNumber });
      // The Barracks' militia walk out of their doors (CONFIG.houses.barracks), the same on every screen.
      const G = HO.barracks;
      for (const {house, x: homeX, z: homeZ} of barracksPosts(barracks, G)) {
        const id = `militia_${militia.length + 1}`, hp = Math.round(G.hp[house.level - 1] * curve.hp);
        const unit = { id, militia: true, houseId: house.id, homeX, homeZ,
          x: house.x, z: round2(house.z + .6), hp, maxHp: hp, damage: round2(G.damage[house.level - 1] * curve.hp),
          state: 'walking', foe: null, hitIn: G.every / 2, facing: 1, level: house.level };
        militia.push(unit); militiaById.set(id, unit);
        events.push({ type: 'militia_out', t: 0, militiaId: id, houseId: house.id, hp, x: round2(unit.x), z: round2(unit.z) });
      }
      // The hired guards (CONFIG.crew.guard, D052) stand at their posts around the heart from the first tick. The
      // count is the island's crew from the server at the wave start, so every screen has the same guards.
      const GU = C.crew.guard;
      for (let k = 0; k < (crew.guard ?? 0); k++) {
        const a = GU.bearings[k] * Math.PI / 180, x = round2(heart.x + Math.cos(a) * GU.post), z = round2(heart.z + Math.sin(a) * GU.post);
        // hp grows with the wave's damage curve (the blows it takes, so it lasts about as long as a captain), its blow
        // with the hp curve (the boarders it fights), like a Barracks militia's blow.
        const id = `guard_${k + 1}`, hp = Math.round(GU.hp * curve.damage);
        const unit = { id, militia: true, guard: true, houseId: null, homeX: x, homeZ: z, x, z, hp, maxHp: hp,
          damage: round2(GU.damage * curve.hp), state: 'idle', foe: null, hitIn: GU.every / 2, facing: 1, level: 1 };
        militia.push(unit); militiaById.set(id, unit);
        events.push({ type: 'militia_out', t: 0, militiaId: id, houseId: null, guard: true, hp, x, z });
      }
    }
    recordSeen();
    for (const input of queued) applyInput(input, events);
    queued = [];
    if (done) return;
    // T38: a running rescue freezes the battle too; when it is over the lost wave ends.
    if (rescue.active) { if (!rescue.tick(events)) end(rescue.reason, events); return; }
    // v3 waves: a running finisher freezes the battle (its own clock runs; the battle's ticks stand still).
    if (finisher.tick(events)) return;
    ticks++;
    const t = ticks * C.tick;
    // The lookout calls the ships out before they appear.
    while (warnLead > 0 && nextWarn < plan.length && plan[nextWarn].at - warnLead <= t + 1e-9) {
      const entry = plan[nextWarn++];
      events.push({ type: 'ship_warning', t: now(), kind: entry.kind, boss: entry.boss === true, lane: entry.lane.id,
        x: round2(entry.from.x), z: round2(entry.from.z), at: round2(entry.at) });
    }
    while (nextSpawn < plan.length && plan[nextSpawn].at <= t + 1e-9) {
      const entry = plan[nextSpawn++], stats = statsOf(entry.kind);
      const length = distance(entry.from.x, entry.from.z, entry.to.x, entry.to.z);
      const hp = entry.kind === 'flagship' ? stats.hp : Math.round(stats.hp * curve.hp * (entry.boss && entry.kind === 'warship' ? tier.bossHp : 1));
      const ship = { id: `ship_${nextShipId++}`, kind: entry.kind, boss: entry.boss === true, lane: entry.lane.id, x: entry.from.x, z: entry.from.z,
        hp, maxHp: hp, speed: round2(stats.speed * (entry.kind === 'flagship' ? 1 : curve.speed * happening.speedOf(entry))), left: length,
        damage: round2(stats.damage * (entry.kind === 'flagship' ? 1 : curve.damage)), dx: (entry.to.x - entry.from.x) / length,
        dz: (entry.to.z - entry.from.z) / length, to: entry.to, a: entry.a, state: 'sailing', attackIn: 0, target: null,
        crew: happening.crewOf(entry.kind) ?? crewFor(entry.kind, waveNumber), unloadIn: 0, ...(entry.route ? { route: entry.route.map(point => ({ ...point })) } : {}) };
      ships.push(ship);
      events.push({ type: 'ship_spawned', t: now(), shipId: ship.id, kind: ship.kind, boss: ship.boss, lane: ship.lane, hp: ship.hp,
        x: round2(ship.x), z: round2(ship.z), toX: round2(entry.to.x), toZ: round2(entry.to.z), crew: ship.crew });
    }
    for (const ship of [...ships]) {
      const stats = statsOf(ship.kind);
      if (happening.shipTick(ship, t, events)) { if (done) return; continue; } // v3 waves: fire ships, the galleon, the barge, the kraken
      if (ship.state === 'sailing') {
        const slowed = ship.slowUntil !== undefined && ship.slowUntil > t + 1e-9 ? 1 - (ship.slowBy ?? S.chain.slow) : 1;
        const move = Math.min(ship.speed * slowed * C.tick, ship.left);
        ship.x += ship.dx * move; ship.z += ship.dz * move; ship.left -= move;
        if (ship.left <= 1e-9) {
          ship.x = ship.to.x; ship.z = ship.to.z; ship.left = 0; ship.state = 'attacking'; ship.attackIn = stats.interval / 2;
          ship.unloadIn = B.interval / 2;
          if (ship.kind === 'gunboat') ship.attackIn = C.gunboat.aim; // it opens fire a moment after it anchors
          events.push({ type: 'ship_anchored', t: now(), shipId: ship.id, kind: ship.kind, crew: ship.crew, x: round2(ship.x), z: round2(ship.z) });
        }
      } else {
        if (ship.kind === 'gunboat') { gunboatFire(ship, t, events); continue; } // jams a tower instead of shelling walls
        // Boarding: one boarder every `interval` until the crew is out.
        if (ship.crew > 0 && (ship.unloadIn -= C.tick) <= 1e-9) { ship.unloadIn += B.interval; ship.crew--; landBoarder(ship, events); }
        if ((ship.attackIn -= C.tick) <= 1e-9) {
          ship.attackIn += stats.interval;
          if (shipFire.enabled) shipFire.aim(ship, t, events); // T50: a real target, or no shot at all
          else {
            let wall = null, best = C.wall.reach;
            for (const item of walls) {
              const d = distance(item.x, item.z, ship.x, ship.z);
              if (item.hp > 0 && d <= best) { wall = item; best = d; }
            }
            if (wall) {
              wall.hp = round2(Math.max(0, wall.hp - ship.damage));
              if (wall.hp === 0) { wall.repairLeft = 0; wall.rebuilding = 0; }
              events.push({ type: 'wall_damaged', t: now(), wallId: wall.id, shipId: ship.id, damage: ship.damage, hp: wall.hp,
                broken: wall.hp === 0, x: wall.x, z: wall.z });
            } else if (B.shellShare > 0) {
              const damage = Math.min(islandHp, round2(ship.damage * B.shellShare));
              islandHp = round2(islandHp - damage);
              events.push({ type: 'island_damaged', t: now(), shipId: ship.id, damage, hp: islandHp, x: round2(ship.x), z: round2(ship.z) });
              if (islandHp <= 0) { end('island_lost', events); return; }
            }
          }
        }
      }
      if (ship.kind === 'flagship' && lampsLit) {
        if (ship.beamAt === undefined) {
          ship.beamAt = t + C.flagship.beamEvery;
          damageShip(ship, ship.maxHp * C.flagship.beamShare, 'lamps', events, { source: 'lamps' });
        } else if (ship.beamAt <= t + 1e-9) {
          ship.beamAt += C.flagship.beamEvery;
          damageShip(ship, C.flagship.beamBurn, 'lamps', events, { source: 'lamps' });
        }
      }
    }
    shipFire.land(t, events, () => done); // T50: the ships' balls land (the heart at 0 ♥ ends the wave)
    if (done) return;
    happening.tick(t, events); // v3 waves: the kraken rises, the barge's shells land
    if (done) return;
    if (paths) paths.refresh(); // T35: the layout from the walls' hp now; the field is rebuilt only when it changed
    for (const boarder of [...boarders]) {
      if (!moveBoarder(boarder, events)) continue;
      // At the heart: the island is hurt and the boarder is gone.
      boarders.splice(boarders.indexOf(boarder), 1);
      const damage = Math.min(islandHp, boarder.damage);
      islandHp = round2(islandHp - damage);
      events.push({ type: 'island_damaged', t: now(), boarderId: boarder.id, damage, hp: islandHp, x: round2(boarder.x), z: round2(boarder.z) });
      if (islandHp <= 0) { end('island_lost', events); return; }
    }
    for (const unit of [...militia]) moveMilitia(unit, events);
    if (taverns.length) tavernHeal(t, events);
    if (party.size && allFallen(t)) { end('captains_fallen', events); return; }
    for (let i = balls.length - 1; i >= 0; i--) {
      const ball = balls[i];
      if (ball.impactAt > t + 1e-9) continue;
      balls.splice(i, 1);
      const target = findTarget(ball.targetId);
      if (ball.hit && target) {
        damageTarget(target, ball.damage, ball.cannonId, events, ball.captain ? { manual: true, captain: true }
          : { manual: ball.manual, ...(ball.culverin ? { culverin: true } : {}), ...(ball.swivel ? { swivel: true } : {}) });
        // Chain shot (GAME-V3.md §5): a ship that floats on is slowed for a few seconds.
        if (ball.chain && !target.boarder && target.hp > 0) { target.slowUntil = round2(t + ball.chain.seconds); target.slowBy = ball.chain.slow; events.push({ type: 'ship_slowed', t: now(), shipId: target.id, until: target.slowUntil }); }
        // A harpoon (T1): the ship floats on slowed; a new hit refreshes the time (and never weakens a stronger slow).
        if (ball.harpoon && !target.boarder && target.hp > 0) {
          const active = slowedUntil(target) > t + 1e-9;
          target.slowUntil = round2(t + ball.harpoon.seconds); target.slowBy = Math.max(active ? target.slowBy ?? 0 : 0, ball.harpoon.slow);
          events.push({ type: 'ship_slowed', t: now(), shipId: target.id, until: target.slowUntil, slow: target.slowBy, harpoon: true });
        }
        // Grapeshot (tier 3): the shot shreds the boarders around the one it hit.
        if (ball.grape) for (const other of boarders.filter(item => item !== target && distance(item.x, item.z, target.x, target.z) <= ball.grape.radius)) {
          damageBoarder(other, round2(ball.damage * ball.grape.share), ball.cannonId, events, { grape: true });
        }
      }
    }
    for (let i = 0; i < shells.length;) {
      const shell = shells[i];
      if (shell.impactAt > t + 1e-9) { i++; continue; }
      shells.splice(i, 1);
      // A mortar shell or a captain's fire bomb: every ship and every boarder within its radius.
      const radius = shell.radius ?? C.mortar.radius, extra = shell.captain ? { area: true, manual: true, captain: true } : { area: true };
      // Cluster (GAME-V3.md §5): three smaller blasts around the impact instead of one (wider with Heavy shells).
      const cluster = shell.spec === 'cluster' ? shell.skill : null, wide = radius / C.mortar.radius;
      const blasts = cluster
        ? Array.from({ length: cluster.blasts }, (_, k) => { const a = k / cluster.blasts * Math.PI * 2 + shell.toX;
          return { x: round2(shell.toX + Math.cos(a) * cluster.spread), z: round2(shell.toZ + Math.sin(a) * cluster.spread),
            radius: round2(cluster.radius * wide), damage: clusterBlastDamage(shell.damage, cluster) }; })
        : [{ x: shell.toX, z: shell.toZ, radius, damage: shell.damage }];
      for (const blast of blasts) {
        const hits = ships.filter(ship => distance(ship.x, ship.z, blast.x, blast.z) <= blast.radius);
        const crowdHits = boarders.filter(boarder => distance(boarder.x, boarder.z, blast.x, blast.z) <= blast.radius);
        events.push({ type: shell.captain ? 'captain_blast' : 'mortar_impact', t: now(), [shell.captain ? 'by' : 'towerId']: shell.towerId,
          x: blast.x, z: blast.z, radius: blast.radius, hits: hits.length + crowdHits.length, ...(shell.spec ? { spec: shell.spec } : {}) });
        for (const ship of hits) damageShip(ship, blast.damage, shell.towerId, events, extra);
        for (const boarder of crowdHits) damageBoarder(boarder, blast.damage, shell.towerId, events, extra);
        // Shockwave (tier 3): the boarders who stand it are thrown back, away from the heart, and start again.
        if (shell.spec === 'shockwave') for (const boarder of crowdHits.filter(item => item.hp > 0)) {
          const away = Math.atan2(boarder.z - heart.z, boarder.x - heart.x), push = shell.skill.push;
          boarder.x = round2(boarder.x + Math.cos(away) * push); boarder.z = round2(boarder.z + Math.sin(away) * push);
          if (boarder.state !== 'walking') { boarder.state = 'walking'; boarder.wallId = null; boarder.foe = null; }
          boarder.goal = null;
          events.push({ type: 'boarder_pushed', t: now(), boarderId: boarder.id, towerId: shell.towerId, x: boarder.x, z: boarder.z });
        }
      }
      // Fire pot (GAME-V3.md §5) and Inferno (its tier-3 capstone): the ground burns where it lands for a few seconds.
      if (shell.spec === 'fire_pot' || shell.spec === 'inferno') {
        const burn = shell.skill;
        fires.push({ towerId: shell.towerId, x: shell.toX, z: shell.toZ, radius: burn.radius, until: round2(t + burn.seconds), every: burn.every,
          damage: round2(shell.damage * burn.share * burn.every), next: round2(t + burn.every) });
        events.push({ type: 'fire_lit', t: now(), towerId: shell.towerId, x: shell.toX, z: shell.toZ, radius: burn.radius, until: round2(t + burn.seconds),
          ...(shell.spec === 'inferno' ? { inferno: true } : {}) });
      }
    }
    for (let i = fires.length - 1; i >= 0; i--) {
      const fire = fires[i];
      if (fire.until <= t + 1e-9) { fires.splice(i, 1); continue; }
      if (fire.next > t + 1e-9) continue;
      fire.next = round2(fire.next + fire.every);
      for (const ship of ships.filter(item => distance(item.x, item.z, fire.x, fire.z) <= fire.radius)) damageShip(ship, fire.damage, fire.towerId, events, { area: true, fire: true });
      for (const boarder of boarders.filter(item => distance(item.x, item.z, fire.x, fire.z) <= fire.radius)) damageBoarder(boarder, fire.damage, fire.towerId, events, { area: true, fire: true });
    }
    for (const tower of towers) {
      if (!towerHealth.canFire(tower)) continue; // T33: a broken tower does not reload or fire (no ghost shots)
      if (happening.silenced(tower, t) || jammed(tower, t)) continue; // v3 waves: shelled by the siege barge; jammed by a gunboat
      tower.reload = Math.max(0, tower.reload - C.tick);
      if (tower.reload > 1e-9) continue;
      const target = aimTower(tower);
      if (target && tower.kind === 'mortar') lob(tower, target, events);
      else if (target && tower.kind === 'harpoon') throwHarpoon(tower, target, events);
      else if (target && tower.kind === 'culverin') fireCulverin(tower, target, events);
      else if (target && tower.kind === 'swivel') fireSwivel(tower, target, events);
      else if (target) fire(tower, target, false, events);
    }
    for (const wall of walls) {
      wall.crew = false;
      if (freeStructureRepair) {
        // Bastion (tier 3): a standing wall mends a little every tick by itself.
        if (wall.skill.mend && wall.hp > 0 && wall.hp < wall.maxHp) wall.hp = round2(Math.min(wall.maxHp, wall.hp + wall.maxHp * wall.skill.mend * C.tick));
        // A Workshop in reach (CONFIG.houses.workshop): a broken wall comes back by itself after a while.
        if (wall.hp <= 0 && wall.workshop) {
          wall.mending = round2(wall.mending + C.tick);
          if (wall.mending + 1e-9 >= wall.mendAfter) rebuild(wall, 'workshop', events, W.share);
          continue;
        }
        if (wall.repairLeft > 0) {
          const amount = Math.min((wall.repairRate ?? C.wall.repairRate) * C.tick, wall.maxHp - wall.hp);
          wall.hp = round2(wall.hp + amount); wall.repaired += amount; wall.repairLeft -= C.tick;
          if (wall.hp >= wall.maxHp || wall.repairLeft <= 1e-9) {
            wall.repairLeft = 0;
            events.push({ type: 'wall_repaired', t: now(), wallId: wall.id, hp: wall.hp, amount: round2(wall.repaired), x: wall.x, z: wall.z });
            wall.repaired = 0;
          }
        }
      }
    }
    if (freeStructureRepair) towerHealth.tick(t, events); // T33: legacy E repairs in progress
    if (freeStructureRepair && crew.carpenter) {
      // Each carpenter takes the most damaged wall nobody else is on (a broken one first); two share a lone
      // one. A standing wall gains `rate` hp a second; a broken one comes back at the rebuild share after
      // `rebuild` seconds of work (two carpenters together take half the time).
      const hurt = walls.filter(wall => wall.hp < wall.maxHp).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || (a.id < b.id ? -1 : 1));
      for (let i = 0; i < crew.carpenter && hurt.length; i++) {
        const wall = hurt[Math.min(i, hurt.length - 1)];
        wall.crew = true;
        if (wall.hp <= 0) {
          wall.rebuilding = round2(wall.rebuilding + C.tick);
          if (wall.rebuilding + 1e-9 >= round2(C.crew.carpenter.rebuild * wall.sooner)) rebuild(wall, 'carpenter', events);
          continue;
        }
        wall.hp = round2(Math.min(wall.maxHp, wall.hp + C.crew.carpenter.rate * wall.repairBoost * wall.boost * C.tick));
        if (wall.hp >= wall.maxHp) events.push({ type: 'wall_repaired', t: now(), wallId: wall.id, hp: wall.hp, by: 'carpenter', x: wall.x, z: wall.z });
      }
    }
    finisher.begin(events); // v3 waves: a boss held for its finisher: the next ticks run the finisher
    if (nextSpawn >= plan.length && ships.length === 0 && boarders.length === 0 && !happening.busy() && !finisher.pending) end('all_sunk', events);
    else if (t + 1e-9 >= C.maxTime) end('timeout', events);
  }

  function result() {
    const survived = islandHp > 0 && !(endReason === 'timeout' && flagshipAfloat()) && endReason !== null && endReason !== 'captains_fallen';
    const bonuses = [...happening.bonuses(), ...finisher.bonuses()]; // v3 waves: the galleon, a won finisher (server-checked)
    return { survived, shipsSunk: sunk, boardersKilled: killed, islandHp, time: now(), ...(bonuses.length ? { bonuses } : {}), ...rescue.result() };
  }

  function applyRecoveryEvent(event) {
    if (recoveryPolicy !== 'structure-recovery-v1' || event?.type !== 'structure_repaired'
      || !Number.isInteger(event.serverSeq) || event.serverSeq < 1
      || !Number.isInteger(event.effectiveTick) || event.effectiveTick < 0 || event.effectiveTick > 18_000) return false;
    const payload = event.payload;
    if (!payload || typeof payload.spot !== 'string' || typeof payload.instanceId !== 'string'
      || payload.hpUnits !== 1_000_000 || !finite(payload.maxHP)
      || !Number.isInteger(payload.repairSeq) || payload.repairSeq < 1) return false;
    const structure = wallById.get(payload.spot) ?? towerById.get(payload.spot);
    const frozen = recoveryStructureState.get(payload.instanceId);
    if ((!structure && !frozen) || frozen && frozen.spot !== payload.spot
      || structure?.instanceId !== undefined && structure.instanceId !== payload.instanceId
      || (structure?.maxHp ?? frozen?.maxHP) !== payload.maxHP
      || (structure?.repairSeq ?? frozen?.repairSeq ?? 0) >= payload.repairSeq) return false;
    if (frozen) { frozen.hpUnits = payload.hpUnits; frozen.repairSeq = payload.repairSeq; }
    if (!structure) return true;
    structure.hp = structure.maxHp;
    structure.repairSeq = payload.repairSeq;
    structure.repairLeft = 0;
    if (structure.kind === 'wall') {
      structure.repaired = 0;
      structure.rebuilding = 0;
      structure.mending = 0;
    }
    return true;
  }

  function recoveryHealthVector() {
    if (recoveryPolicy !== 'structure-recovery-v1') return null;
    const hpUnits = {}, basisRepairSeq = {};
    for (const structure of recoveryStructureState.values()) {
      hpUnits[structure.instanceId] = structure.hpUnits;
      basisRepairSeq[structure.instanceId] = structure.repairSeq;
    }
    for (const structure of [...walls, ...towers]) {
      if (typeof structure.instanceId !== 'string' || !structure.instanceId || !(structure.maxHp > 0) || !finite(structure.hp)) return null;
      hpUnits[structure.instanceId] = Math.max(0, Math.min(1_000_000, Math.round(structure.hp / structure.maxHp * 1_000_000)));
      basisRepairSeq[structure.instanceId] = Number.isInteger(structure.repairSeq) && structure.repairSeq >= 0 ? structure.repairSeq : 0;
    }
    return { hpUnits, basisRepairSeq };
  }

  return {
    applyRecoveryEvent,
    recoveryHealthVector,
    // Raw sight and reload from this wave's frozen defenses. `litRange` is only available to lit targets at night.
    attackCoverage(id) {
      const tower = towerById.get(id);
      if (done || !tower) return null;
      const t = ticks * C.tick;
      let status = 'ready';
      if (!towerHealth.canFire(tower)) status = 'destroyed';
      else if (jammed(tower, t)) status = 'jammed';
      else if (happening.silenced(tower, t)) status = 'silenced';
      return { ...coverageProfile(tower, tower.sight),
        litRange: happening.id === 'night_raid' ? litSight(tower) : null, status, reload: tower.reload };
    },
    step(dt, inputs = []) {
      const events = [];
      if (done) return events;
      if (Array.isArray(inputs)) for (const input of inputs) queued.push(input);
      rest += finite(dt) && dt > 0 ? Math.min(dt, C.maxStep) : 0;
      while (rest + 1e-9 >= C.tick && !done) { rest -= C.tick; tick(events); }
      return events;
    },
    state() {
      const t = ticks * C.tick;
      return {
        time: now(), wave: waveNumber, boss, warships: bosses, phase: started === true ? (done ? 'ended' : 'running') : 'countdown',
        ships: ships.map(ship => ({ id: ship.id, kind: ship.kind, lane: ship.lane, x: round2(ship.x), z: round2(ship.z),
          hp: ship.hp, maxHp: ship.maxHp, state: ship.state, crew: ship.crew, ...(ship.boss ? { boss: true } : {}),
          ...(ship.kind === 'flagship' ? { exposed: lampsLit } : {}), ...(slowedUntil(ship) > t + 1e-9 ? { slowed: true } : {}) })),
        boarders: boarders.map(item => ({ id: item.id, ...(item.brute ? { brute: true } : {}), x: round2(item.x), z: round2(item.z), hp: item.hp, maxHp: item.maxHp,
          state: item.state, wallId: item.wallId, facing: item.facing, foe: item.foe ?? null, ...(item.towerId ? { towerId: item.towerId } : {}) })),
        // Captain health (GAME-V3.md §3), by id: present is false for a captain who is away or not heard lately.
        party: [...party.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map(hero => ({ id: hero.id,
          x: round2(hero.x), z: round2(hero.z), hp: hero.hp, maxHp: hero.maxHp, down: hero.down, downAt: hero.downAt,
          colour: hero.colour, present: presentAt(hero, t) })),
        // The house roles (GAME-V3.md "Houses"): the Barracks' militia in the wave, and the houses that act.
        militia: militia.map(unit => ({ id: unit.id, houseId: unit.houseId, ...(unit.guard ? { guard: true } : {}), x: unit.x, z: unit.z, hp: unit.hp, maxHp: unit.maxHp,
          state: unit.state, foe: unit.foe, facing: unit.facing, level: unit.level })),
        militiaFell, houses: roles.map(item => ({ ...item })),
        wrecks: wrecks.map(item => ({ ...item })),
        walls: walls.map(wall => ({ id: wall.id, level: wall.level, ...(wall.spec ? { spec: wall.spec } : {}), ...(wall.bonus ? { bonus: wall.bonus } : {}), hp: wall.hp, maxHp: wall.maxHp, repairing: wall.repairLeft > 0, crew: wall.crew,
          broken: wall.hp <= 0, inner: wall.inner, rebuildReady: wall.hp <= 0 && t - wall.rebuildAt >= wall.cooldown - 1e-9,
          ...(wall.workshop ? { workshop: wall.workshop } : {}) })),
        cannons: cannons.map(cannon => ({ id: cannon.id, x: cannon.x, z: cannon.z, reload: round2(cannon.reload), range: round2(cannon.sight) })),
        towers: towers.map(tower => ({ id: tower.id, kind: tower.kind, level: tower.level, ...(tower.spec ? { spec: tower.spec } : {}), ...(tower.bonus ? { bonus: tower.bonus } : {}), x: tower.x, z: tower.z, manned: tower.manned, ...(jammed(tower, t) ? { jammed: tower.jammedUntil } : {}),
          reload: round2(tower.reload), range: round2(tower.sight), ...towerHealth.stateOf(tower, t) })),
        balls: balls.map(ball => ({ ...ball })),
        ...(shipFire.enabled ? { shipShots: shipFire.state() } : {}), // T50: the ships' balls on their way
        shells: shells.map(shell => ({ ...shell })),
        fires: fires.map(fire => ({ x: fire.x, z: fire.z, radius: fire.radius, until: fire.until })),
        captains: Object.fromEntries([...captains].map(([by, at]) => [by, round2(at)])),
        blades: Object.fromEntries([...blades].map(([by, at]) => [by, round2(at)])),
        crew: { ...crew }, heart: { x: heart.x, z: heart.z },
        islandHp, maxIslandHp: maxHp, sunk, shipsLeft: plan.length + happening.extra - sunk - happening.gone, total: plan.length, lampsLit, fog, sight: round2(sight),
        boardersLeft: boarders.length, boardersKilled: killed, boardersLanded: landed,
        // v3 waves: the event's state (wind, lanes, the barge's shells…) and the finisher's, both null without one.
        event: happening.id ? happening.state(t) : null, finisher: finisher.state() ?? rescue.state(),
      };
    },
    get done() { return done; },
    // Why the wave ended: all_sunk, timeout, island_lost or captains_fallen (null while it runs).
    get endReason() { return endReason; },
    result,
  };
}
