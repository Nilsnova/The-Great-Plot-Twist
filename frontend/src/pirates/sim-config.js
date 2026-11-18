// Every balance number of the pirate wave simulation (sim.js) in one frozen object. Times in seconds, distances
// in world units of the home_islet place. Re-exported by sim.js; import it from there.

import { surfaces } from '../world/places/surfaces.js';
import { ROLE_RADIUS } from '../campaign/houses.js';
import { DEFENSES_V2 } from './defenses-v2.js';

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
