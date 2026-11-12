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
  },
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
    house: [{}, {}],
  },
  mortar: { radius: 4, minRange: 8, flight: 1.3, flightPerUnit: 0.025, scatter: 1.2, firstReload: 1 },
  crew: {
    gunner: { max: 2, reload: 0.75 },        // reload × 0.75 on the strongest towers, aims at the ship closest to the shore
    carpenter: { max: 2, rate: 6, rebuild: 8 }, // hp per second on the most damaged walls; a broken wall takes 8 s to rebuild
    lookout: { max: 1, sight: 1.2, warn: 3 }, // sight × 1.2 in fog; ships are announced 3 s before they appear
  },
  // Every player's musket (TOWER-DEFENSE.md §10), measured from the shooter's position at send time, and
  // the cutlass (§12) for a boarder within reach. The base numbers live here; captainStats() in
  // captain-stats.js scales them by the skills (§14) and the weapon (§15).
  captain: {
    levels: [{ damage: 6, range: 14, reload: 1.2 }, { damage: 9, range: 15, reload: 1.05 }, { damage: 13, range: 16, reload: 0.9 },
      { damage: 18, range: 18, reload: 0.75 }, { damage: 24, range: 20, reload: 0.6 }],
    shotSpeed: 45,
    cutlass: {
      reach: 2.2,             // the controller strikes a boarder this close instead of firing
      slack: .8,              // the sim accepts a little more: the boarder walks on during the input's lead
      reload: .5,
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
    broadside: { every: 4 },                     // cannon: every 4th shot fires a second ball at the same target
    grapeshot: { radius: 3, share: .6, accuracy: .85 }, // cannon: a hit on a boarder hurts every boarder within radius (share of the damage); aims better at boarders
    shockwave: { push: 3 },                      // mortar: every boarder a blast hits is thrown this far back, away from the heart
    inferno: { seconds: 5, radius: 4, share: .45, every: .5 }, // mortar: every shell sets the ground on fire (wider and hotter than Fire pot)
    bastion: { hp: 1.5, mend: .02 },             // wall: hp ×1.5, and a standing wall mends 2% of its hp a second
    thorns: { damage: 15 },                      // wall: a hacking boarder takes this (× the hp curve) at every hack
    eagle_eye: { range: 1.25, radius: 22 },      // watchtower: range ×1.25 for the towers within radius
    war_drums: { reload: .87, radius: 22 },      // watchtower: reload ×0.87 (about 15% more shots) for the towers within radius
  },
  // Tier 2 of the Tech hub (GAME-V3.md §5.1): the island picks one of two bonuses per kind (defense.bonus, read
  // from the island's research on every screen). A drill replaces the numbers of that kind's tier-1 skills; the
  // other bonus works on every tower of the kind, whatever skill it picked.
  research: {
    gun_drill: { rapid: { reload: .6 }, heavy: { damage: 1.8, reload: 1.25 }, chain: { slow: .5, seconds: 3 } },
    long_guns: { range: 1.2 },                   // every cannon: range ×1.2
    shell_drill: { cluster: { blasts: 3, damage: .65, radius: 2.8, spread: 2.4 }, fire_pot: { seconds: 5, radius: 3, share: .4, every: .5 }, long_range: { range: 16 } },
    heavy_shells: { radius: 1.25 },              // every mortar: blast radius ×1.25
    mason_drill: { stone: { hp: 2.5 }, spiked: { damage: 8 }, quick_mend: { repair: 2.5 } },
    thick_walls: { hp: 1.25 },                   // every wall: hp ×1.25
    lookout_drill: { spotter: { damage: 1.25, radius: 22 }, signal_fire: { warn: 8 } },
    high_tower: { range: 1.5 },                  // the watchtower's range bonus ×1.5
  },
});

const KINDS = new Set(['wall', 'cannon', 'mortar', 'watchtower', 'house']);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const round2 = value => Math.round(value * 100) / 100;
const distance = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); };

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

function readDefenses(list) {
  const seen = new Set(), out = [];
  for (const item of Array.isArray(list) ? list : []) {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id || seen.has(item.id)) continue;
    if (!KINDS.has(item.kind) || !finite(item.x) || !finite(item.z)) continue;
    const levels = CONFIG.levels[item.kind].length, level = Number.isInteger(item.level) ? clamp(item.level, 1, levels) : 1;
    const spec = readSpec(item.kind, item.spec); // a skill of another kind is no skill
    const bonus = readBonus(item.kind, item.bonus); // the island's tier-2 pick for this kind (GAME-V3.md §5.1)
    seen.add(item.id); out.push({ id: item.id, kind: item.kind, level, x: item.x, z: item.z, ...(spec ? { spec } : {}), ...(bonus ? { bonus } : {}) });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// The numbers of a defense's skill: its tier-1 skill (or capstone) as CONFIG.specs says, or as its island's
// drill (tier 2) replaces them. {} for no skill.
export function skillOf(item, C = CONFIG) {
  return { ...(C.specs[item?.spec] ?? {}), ...(C.research[item?.bonus]?.[item?.spec] ?? {}) };
}
const bonusOf = (item, key, C = CONFIG) => C.research[item?.bonus]?.[key] ?? 1;

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
  return { gunner: count01(crew?.gunner, C.gunner.max), carpenter: count01(crew?.carpenter, C.carpenter.max),
    lookout: count01(crew?.lookout, C.lookout.max) };
}
/** The warships of a wave: 1 on every 5th wave, 2 on every 10th, plus regular ones late in the game. */
export function warshipsFor(wave, boss = wave % CONFIG.boss.every === 0) {
  const B = CONFIG.boss, K = CONFIG.curve;
  const bosses = boss ? (wave % B.doubleEvery === 0 ? 2 : 1) : 0;
  const regular = wave >= K.warshipsFrom ? 1 + Math.floor((wave - K.warshipsFrom) / K.warshipsEvery) : 0;
  return { bosses, regular };
}
/** The coins a revive costs on `wave` (paid by the reviver, checked by the server): 20 + 5 × wave. */
export function revivePrice(wave) {
  const R = CONFIG.health.revive, n = Number.isInteger(wave) && wave > 0 ? Math.min(wave, CONFIG.maxWave) : 1;
  return R.base + R.perWave * n;
}
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
    boss: wave >= T.dreadnoughtsFrom ? 'dreadnought' : 'warship', bossHp, final: wave >= T.final };
}
/**
 * The ships of a wave before the dice (the plan of createWave shuffles them): {count, kinds (the escorts and
 * regular warships), bosses, tier}. The campaign's tiers: some sloops sail as raiders (12+), some brigs as
 * ironclads (30+), with the same list length, so the dice of the waves before a tier are untouched.
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
 * createWave({seed, wave, weather: {ships, fog}, island: {hp}, defenses: [{id, kind, level, x, z}],
 *   crew: {gunner, carpenter, lookout}, boss, flagship, countdown, coast, lanes}).
 * level (1-5) and crew are optional: an old caller without them gets level 1 and no crew. boss is
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
 */
export function createWave(options = {}) {
  const C = CONFIG, B = C.boarding, random = createRandom(options?.seed);
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
  const defenses = readDefenses(options?.defenses), crew = readCrew(options?.crew);
  const curve = curveFor(waveNumber);
  const lookouts = defenses.filter(item => item.kind === 'watchtower'), watchtowers = lookouts.map(item => C.levels.watchtower[item.level - 1]);
  // High tower (tier 2): the watchtower lends more range.
  const towerBonus = Math.max(0, ...lookouts.map((item, i) => round2(watchtowers[i].range * bonusOf(item, 'range', C)))), boost = Math.max(1, ...watchtowers.map(item => item.boost ?? 1));
  const S = C.specs, near = spec => lookouts.filter(item => item.spec === spec).map(item => ({ ...item, skill: skillOf(item, C) }));
  const spotters = near('spotter'), eagles = near('eagle_eye'), drummers = near('war_drums');
  const signal = Math.max(0, ...near('signal_fire').map(item => item.skill.warn));
  const reach = (list, item) => list.find(tower => distance(tower.x, tower.z, item.x, item.z) <= tower.skill.radius);
  let fogShare = waveNumber === 1 ? Math.max(1 - fog, C.fog.firstWaveSight) : 1 - fog;
  if (crew.lookout && fog > 0) fogShare = Math.min(1, fogShare * C.crew.lookout.sight);
  const warnLead = (crew.lookout ? C.crew.lookout.warn : 0) + signal;
  const coast = readCoast(options?.coast), laneList = readLanes(options?.lanes);
  // Cannons and mortars, in id order; the gunners man the strongest (damage per second, then level).
  const towers = defenses.filter(item => item.kind === 'cannon' || item.kind === 'mortar').map(item => {
    const stats = C.levels[item.kind][item.level - 1], spec = skillOf(item, C);
    // Long guns (tier 2) and Eagle eye (a watchtower's capstone in reach) stretch the range; Long range adds to it.
    const eagle = reach(eagles, item)?.skill.range ?? 1;
    const range = round2(((item.kind === 'cannon' ? stats.range * bonusOf(item, 'range', C) : stats.range) + towerBonus) * eagle + (spec.range ?? 0));
    // A spotter watchtower in reach adds its share of damage (GAME-V3.md §5); the skill's own numbers on top.
    const spotted = reach(spotters, item)?.skill.damage ?? 1, drums = reach(drummers, item)?.skill.reload ?? 1;
    const radius = item.kind === 'mortar' ? round2(C.mortar.radius * bonusOf(item, 'radius', C)) : undefined;
    return { ...item, skill: spec, damage: round2(stats.damage * (spec.damage ?? 1) * spotted * boost), baseReload: round2(stats.reload * C.pace.reload * (spec.reload ?? 1) * drums),
      range, sight: range * fogShare, manned: false, reload: item.kind === 'mortar' ? C.mortar.firstReload : 0, lastShot: -Infinity, shots: 0,
      ...(radius !== undefined ? { radius } : {}) };
  });
  const strength = tower => tower.damage / tower.baseReload * (tower.kind === 'mortar' ? 1.5 : 1);
  [...towers].sort((a, b) => strength(b) - strength(a) || b.level - a.level || (a.id < b.id ? -1 : 1))
    .slice(0, crew.gunner).forEach(tower => { tower.manned = true; tower.baseReload = round2(tower.baseReload * C.crew.gunner.reload); });
  const cannons = towers.filter(item => item.kind === 'cannon'), mortars = towers.filter(item => item.kind === 'mortar');
  // The sight the island shows (fog edge, the manual-fire reach): the level-1 cannon's, or the best cannon's.
  const sight = Math.max(C.cannon.range + towerBonus, ...cannons.map(item => item.range)) * fogShare;
  const walls = defenses.filter(item => item.kind === 'wall').map(item => {
    const skill = skillOf(item, C), hp = round2(C.levels.wall[item.level - 1].hp * (skill.hp ?? 1) * bonusOf(item, 'hp', C));
    return { ...item, skill, hp, maxHp: hp, repairLeft: 0, repaired: 0, crew: false, rebuildAt: -Infinity, rebuilding: 0,
      inner: distance(item.x, item.z, heart.x, heart.z) <= heart.ring, bearing: Math.atan2(item.z - heart.z, item.x - heart.x) };
  });
  const cannonById = new Map(cannons.map(item => [item.id, item]));
  const wallById = new Map(walls.map(item => [item.id, item]));

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
  const kinds = shuffle([...fleetKinds], random);
  const gap = Math.min(Math.max(C.fleet.minGap, C.fleet.gap - C.fleet.gapPerWave * (waveNumber - 1)), C.fleet.window / count);
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
  plan.sort((a, b) => a.at - b.at);
  for (const entry of plan) {
    const a = entry.lane.a + (random() * 2 - 1) * C.laneSpread * Math.PI / 180;
    const stopR = C.stopRadius + (random() * 2 - 1) * C.stopJitter;
    entry.a = a; entry.from = coastPoint(a, C.spawnRadius, coast);
    entry.to = coastPoint(a, ['flagship', 'warship', 'dreadnought', 'redtide'].includes(entry.kind) ? C.stopRadius + .1 : stopR, coast);
  }

  let ticks = 0, rest = 0, nextSpawn = 0, nextWarn = 0, nextShipId = 1, sunk = 0, islandHp = maxHp, done = false;
  let started = countdown === 0 ? null : false, lastCountdown = null, lampsLit = false, endReason = null;
  let nextBoarderId = 1, killed = 0, landed = 0;
  const ships = [], wrecks = [], balls = [], shells = [], captains = new Map(), blades = new Map(), boarders = [], fires = [];
  // Captain health (GAME-V3.md §3): id -> {id, x, z, hp, maxHp, down, downAt, seen, colour, away}.
  const H = C.health, party = new Map();
  let queued = [];
  const now = () => round2(ticks * C.tick);
  const flagshipAfloat = () => ships.some(ship => ship.kind === 'flagship') ||
    plan.slice(nextSpawn).some(entry => entry.kind === 'flagship');
  const statsOf = kind => C.ships[kind];

  function damageShip(ship, amount, by, events, extra = {}) {
    let damage = amount;
    if (ship.kind === 'flagship' && extra.source !== 'lamps') damage *= lampsLit ? C.flagship.exposed : C.flagship.armor;
    damage = Math.min(ship.hp, round2(damage));
    ship.hp = round2(ship.hp - damage);
    events.push({ type: 'ship_hit', t: now(), shipId: ship.id, kind: ship.kind, by, damage, hp: ship.hp,
      x: round2(ship.x), z: round2(ship.z), blocked: damage === 0, ...extra });
    if (ship.hp > 0) return;
    ships.splice(ships.indexOf(ship), 1); sunk++;
    wrecks.push({ id: ship.id, kind: ship.kind, x: round2(ship.x), z: round2(ship.z), t: now() });
    events.push({ type: 'ship_sunk', t: now(), shipId: ship.id, kind: ship.kind, by, boss: ship.boss, x: round2(ship.x), z: round2(ship.z),
      ...(ship.crew > 0 ? { crewLost: ship.crew } : {}) });
  }
  function damageBoarder(boarder, amount, by, events, extra = {}) {
    const damage = Math.min(boarder.hp, round2(amount));
    boarder.hp = round2(boarder.hp - damage);
    events.push({ type: 'boarder_hit', t: now(), boarderId: boarder.id, by, damage, hp: boarder.hp, x: round2(boarder.x), z: round2(boarder.z), ...extra });
    if (boarder.hp > 0) return;
    boarders.splice(boarders.indexOf(boarder), 1); killed++;
    events.push({ type: 'boarder_killed', t: now(), boarderId: boarder.id, by, x: round2(boarder.x), z: round2(boarder.z), ...extra });
  }
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
    const hit = manual || random() < (target.boarder ? cannon.skill?.accuracy ?? C.cannon.boarderAccuracy : C.cannon.accuracy);
    if (!hit) { const a = random() * Math.PI * 2, r = 1 + random() * (C.cannon.missSpread - 1); toX += Math.cos(a) * r; toZ += Math.sin(a) * r; }
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
    const aim = ahead(target, flight), a = random() * Math.PI * 2, r = random() * C.mortar.scatter;
    const toX = round2(aim.x + Math.cos(a) * r), toZ = round2(aim.z + Math.sin(a) * r), impactAt = round2(ticks * C.tick + flight);
    const radius = mortar.radius ?? C.mortar.radius;
    shells.push({ towerId: mortar.id, x: mortar.x, z: mortar.z, toX, toZ, damage: mortar.damage, impactAt, from: now(),
      ...(radius !== C.mortar.radius ? { radius } : {}),
      ...(['cluster', 'fire_pot', 'shockwave', 'inferno'].includes(mortar.spec) ? { spec: mortar.spec, skill: mortar.skill } : {}) });
    mortar.reload = mortar.baseReload; mortar.lastShot = ticks * C.tick; mortar.shots++;
    events.push({ type: 'mortar_fired', t: now(), towerId: mortar.id, targetId: target.id, damage: mortar.damage, level: mortar.level,
      x: mortar.x, z: mortar.z, toX, toZ, impactAt, radius });
  }

  const pending = target => balls.reduce((sum, ball) => sum + (ball.targetId === target.id && ball.hit ? ball.damage : 0), 0);
  const visible = (cannon, target) => distance(cannon.x, cannon.z, target.x, target.z) <= cannon.sight;
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
    const level = captainLevel(input), skills = readSkills(input.skills), stats = captainStats(level, skills, input.weapon), t = ticks * C.tick;
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
      // A spray of shot: the nearest ships or boarders inside the cone towards the aim point, up to stats.targets.
      const heading = Math.atan2(aimed.z - z, aimed.x - x), half = stats.cone / 2 * Math.PI / 180;
      const inCone = [...ships, ...boarders].map(item => {
        const d = distance(x, z, item.x, item.z);
        let turn = Math.abs(Math.atan2(item.z - z, item.x - x) - heading);
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
    if (!named || distance(x, z, named.x, named.z) > stats.range) return;
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
  // The cutlass (§12, §14 Brawler): an instant blow at a boarder within reach of where the captain stood
  // (the named one, else the nearest), with its own short reload. The striker's skills scale it
  // (captain-stats.js): damage × strikeMultiplier (Cutlass), reload × strikeReloadMultiplier (Second
  // wind), and with Sweep every other boarder within sweepRadius of the struck one takes sweepShare.
  function captainStrike(input, events) {
    const by = captainBy(input);
    if (!by || !finite(input.x) || !finite(input.z) || !standing(by, input)) return;
    const level = captainLevel(input), stats = captainStats(level, readSkills(input.skills));
    const blade = C.captain.cutlass, reach = blade.reach + blade.slack, t = ticks * C.tick;
    const reload = round2(blade.reload * stats.strikeReloadMultiplier);
    if (t - (blades.get(by) ?? -Infinity) < reload - 1e-9) return;
    let target = findTarget(input.targetId);
    if (!target?.boarder || distance(input.x, input.z, target.x, target.z) > reach) {
      target = null;
      let best = reach;
      for (const boarder of boarders) {
        const d = distance(input.x, input.z, boarder.x, boarder.z);
        if (d <= best) { target = boarder; best = d; }
      }
    }
    if (!target) return;
    blades.set(by, t);
    const damage = round2(blade.levels[level - 1].damage * stats.strikeMultiplier);
    // The sweep's victims are chosen before the blow lands, so a boarder the blow kills still anchors it.
    const swept = stats.sweep
      ? boarders.filter(item => item !== target && distance(item.x, item.z, target.x, target.z) <= stats.sweepRadius + 1e-9) : [];
    events.push({ type: 'captain_struck', t: now(), by, targetId: target.id, level, damage, reload,
      x: round2(input.x), z: round2(input.z), toX: round2(target.x), toZ: round2(target.z),
      ...(stats.sweep ? { swept: swept.map(item => item.id) } : {}) });
    damageBoarder(target, damage, `captain:${by}`, events, { captain: true, blade: true });
    const share = round2(damage * stats.sweepShare);
    for (const item of swept) damageBoarder(item, share, `captain:${by}`, events, { captain: true, blade: true, sweep: true });
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
    if (distance(input.x, input.z, hero.x, hero.z) > R.reach + R.slack) return;
    helper.seen = ticks * C.tick; helper.away = false; helper.x = input.x; helper.z = input.z;
    hero.down = false; hero.downAt = null; hero.hp = Math.max(1, Math.round(hero.maxHp * R.share));
    events.push({ type: 'captain_revived', t: now(), captainId: hero.id, by, hp: hero.hp, x: round2(hero.x), z: round2(hero.z) });
  }
  // A boarder's blow at a captain; at 0 hp the captain falls and every boarder on them walks on.
  function hurtCaptain(hero, boarder, events) {
    const damage = Math.min(hero.hp, round2(H.damage * curve.damage));
    hero.hp = round2(hero.hp - damage);
    events.push({ type: 'captain_hit', t: now(), captainId: hero.id, boarderId: boarder.id, damage, hp: hero.hp,
      x: round2(hero.x), z: round2(hero.z) });
    if (hero.hp > 0) return;
    hero.down = true; hero.downAt = now();
    events.push({ type: 'captain_fell', t: now(), captainId: hero.id, x: round2(hero.x), z: round2(hero.z) });
    for (const other of boarders) if (other.foe === hero.id) { other.foe = null; other.goal = null; if (other.state === 'fighting') other.state = 'walking'; }
  }
  // The captain a boarder goes for: the one it is on while they stand within the leash, else the nearest
  // standing captain within reach (ties: the lower id), else none. O(captains) per boarder.
  function foeOf(boarder) {
    if (!party.size) return null;
    const t = ticks * C.tick;
    if (boarder.foe) {
      const hero = party.get(boarder.foe);
      if (hero && !hero.down && presentAt(hero, t) && distance(boarder.x, boarder.z, hero.x, hero.z) <= H.leash + 1e-9) return hero;
      boarder.foe = null; boarder.goal = null;
    }
    let best = null, near = H.reach + 1e-9;
    for (const hero of party.values()) {
      if (hero.down || !presentAt(hero, t) || crowdOn(hero) >= H.crowd) continue;
      const d = distance(boarder.x, boarder.z, hero.x, hero.z);
      if (d < near - 1e-9 || (best && Math.abs(d - near) <= 1e-9 && hero.id < best.id)) { best = hero; near = d; }
    }
    if (best) { boarder.foe = best.id; boarder.goal = null; }
    return best;
  }
  // How many boarders are on this captain already: at most H.crowd at once, the rest walk on.
  const crowdOn = hero => { let n = 0; for (const other of boarders) if (other.foe === hero.id) n++; return n; };
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
    wall.rebuildAt = ticks * C.tick; wall.rebuilding = 0; wall.repairLeft = 0;
    events.push({ type: 'wall_rebuilt', t: now(), wallId: wall.id, hp: wall.hp, by, x: wall.x, z: wall.z });
  }

  function applyInput(input, events) {
    if (!input || typeof input !== 'object' || typeof input.type !== 'string') return;
    if (input.type === 'fire') {
      const cannon = typeof input.cannonId === 'string' ? cannonById.get(input.cannonId) : undefined;
      const target = findTarget(input.targetId);
      if (!cannon || !target || !visible(cannon, target)) return;
      if (ticks * C.tick - cannon.lastShot < C.cannon.manualCooldown) return;
      fire(cannon, target, true, events);
    } else if (input.type === 'repair') {
      const wall = typeof input.wallId === 'string' ? wallById.get(input.wallId) : undefined;
      if (!wall || wall.hp <= 0 || wall.hp >= wall.maxHp) return; // a broken wall is rebuilt, not repaired
      if (wall.repairLeft <= 0) wall.repaired = 0;
      wall.repairLeft = C.wall.repairSeconds;
      // The repairer's own skills (Quick fix, Master shipwright) set how fast this repair goes.
      wall.repairRate = round2(C.wall.repairRate * captainStats(1, input.skills).repairMultiplier * (wall.skill.repair ?? 1));
    } else if (input.type === 'rebuild') {
      const wall = typeof input.wallId === 'string' ? wallById.get(input.wallId) : undefined;
      if (!wall || wall.hp > 0 || ticks * C.tick - wall.rebuildAt < C.wall.rebuildCooldown - 1e-9) return;
      // The rebuilder's own skills: Master shipwright brings the wall back at 60% instead of 40%.
      rebuild(wall, 'player', events, captainStats(1, input.skills).rebuildShare);
    } else if (input.type === 'lamps_lit') {
      if (!withFlagship || lampsLit) return;
      lampsLit = true; // the beam strikes the flagship on the next tick, or as soon as it appears
    } else if (input.type === 'captain_shot') captainShot(input, events);
    else if (input.type === 'captain_strike') captainStrike(input, events);
    else if (input.type === 'captain_move') captainMove(input, events);
    else if (input.type === 'captain_revive') captainRevive(input, events);
  }

  function end(reason, events) {
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
        if (d > tower.sight || d < C.mortar.minRange || (!item.boarder && armoured(item))) continue;
        let score = 0;
        for (const other of all) if (distance(other.x, other.z, item.x, item.z) <= C.mortar.radius) score++;
        const rank = tower.manned
          ? (item.boarder ? -2e4 + toHeart(item) : (item.state === 'attacking' ? 0 : 1) * 1e4 + item.left) - score * .01
          : -score * 1e4 + d;
        if (rank < best) { target = item; best = rank; }
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
      if (d > tower.sight || pending(ship) >= ship.hp || armoured(ship)) continue;
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
    // Brutes (wave 20+): every n-th boarder is a big one, by its number, so every screen agrees.
    const T = C.tiers.brutes, every = tier.brutes > 0 ? Math.max(1, Math.round(1 / tier.brutes)) : 0;
    const brute = every > 0 && nextBoarderId % every === 0;
    const hp = Math.round(B.hp * curve.hp * (brute ? T.hp : 1) * 10) / 10;
    const startX = ship.x + (landing.x - ship.x) * .25, startZ = ship.z + (landing.z - ship.z) * .25;
    const boarder = { id: `boarder_${nextBoarderId++}`, boarder: true, shipId: ship.id, x: startX, z: startZ, vx: 0, vz: 0,
      hp, maxHp: hp, speed: round2(B.speed * curve.speed * (brute ? T.speed : 1)), hack: round2(B.hack * curve.damage * (brute ? T.hack : 1)),
      damage: round2(B.heartDamage * curve.damage * (brute ? T.heart : 1)),
      route, leg: 0, goal: null, side, state: 'walking', wallId: null, hackIn: 0, facing: landing.x < ship.x ? -1 : 1, ...(brute ? { brute: true } : {}) };
    boarders.push(boarder); landed++;
    events.push({ type: 'boarder_landed', t: now(), boarderId: boarder.id, shipId: ship.id, hp, x: round2(startX), z: round2(startZ),
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
  function pickBoarderTarget(boarder) {
    const foe = foeOf(boarder);
    if (foe) return { kind: 'captain', hero: foe };
    while (boarder.leg < boarder.route.length - 1) {
      const leg = boarder.route[boarder.leg];
      if (!(leg.wall && leg.wall.hp <= 0)) return leg.wall ? { kind: 'wall', wall: leg.wall, leg } : { kind: 'point', leg };
      boarder.leg++; boarder.goal = null;
    }
    return { kind: 'heart', leg: boarder.route[boarder.route.length - 1] };
  }
  // One tick of a boarder: hack the wall it stands at, or walk towards its target. True at the heart.
  function moveBoarder(boarder, events) {
    if (boarder.state === 'hacking') {
      const target = pickBoarderTarget(boarder);
      if (target.kind !== 'wall' || target.wall.id !== boarder.wallId) { boarder.state = 'walking'; boarder.wallId = null; boarder.goal = null; return false; }
      if ((boarder.hackIn -= C.tick) > 1e-9) return false;
      boarder.hackIn += B.hackEvery;
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
        boarder.x += dx / d * step; boarder.z += dz / d * step; budget -= step;
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
      boarder.x += dx / d * step; boarder.z += dz / d * step; budget -= step;
      if (step <= 1e-9) break;
    }
    return pickBoarderTarget(boarder).kind === 'heart' && toHeart(boarder) <= B.heartRadius + 1e-6;
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
        ...(tier.final && !withFlagship ? { final: true } : {}),
        fog, sight: round2(sight), heart: { x: heart.x, z: heart.z },
        lanes: lanes.slice(0, laneCount).map(lane => ({ id: lane.id, x: round2(lane.stop.x), z: round2(lane.stop.z) })) });
    }
    for (const input of queued) applyInput(input, events);
    queued = [];
    if (done) return;
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
        hp, maxHp: hp, speed: round2(stats.speed * (entry.kind === 'flagship' ? 1 : curve.speed)), left: length,
        damage: round2(stats.damage * (entry.kind === 'flagship' ? 1 : curve.damage)), dx: (entry.to.x - entry.from.x) / length,
        dz: (entry.to.z - entry.from.z) / length, to: entry.to, a: entry.a, state: 'sailing', attackIn: 0, target: null,
        crew: crewFor(entry.kind, waveNumber), unloadIn: 0 };
      ships.push(ship);
      events.push({ type: 'ship_spawned', t: now(), shipId: ship.id, kind: ship.kind, boss: ship.boss, lane: ship.lane, hp: ship.hp,
        x: round2(ship.x), z: round2(ship.z), toX: round2(entry.to.x), toZ: round2(entry.to.z), crew: ship.crew });
    }
    for (const ship of [...ships]) {
      const stats = statsOf(ship.kind);
      if (ship.state === 'sailing') {
        const slowed = ship.slowUntil !== undefined && ship.slowUntil > t + 1e-9 ? 1 - (ship.slowBy ?? S.chain.slow) : 1;
        const move = Math.min(ship.speed * slowed * C.tick, ship.left);
        ship.x += ship.dx * move; ship.z += ship.dz * move; ship.left -= move;
        if (ship.left <= 1e-9) {
          ship.x = ship.to.x; ship.z = ship.to.z; ship.left = 0; ship.state = 'attacking'; ship.attackIn = stats.interval / 2;
          ship.unloadIn = B.interval / 2;
          events.push({ type: 'ship_anchored', t: now(), shipId: ship.id, kind: ship.kind, crew: ship.crew, x: round2(ship.x), z: round2(ship.z) });
        }
      } else {
        // Boarding: one boarder every `interval` until the crew is out.
        if (ship.crew > 0 && (ship.unloadIn -= C.tick) <= 1e-9) { ship.unloadIn += B.interval; ship.crew--; landBoarder(ship, events); }
        if ((ship.attackIn -= C.tick) <= 1e-9) {
          ship.attackIn += stats.interval;
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
    for (const boarder of [...boarders]) {
      if (!moveBoarder(boarder, events)) continue;
      // At the heart: the island is hurt and the boarder is gone.
      boarders.splice(boarders.indexOf(boarder), 1);
      const damage = Math.min(islandHp, boarder.damage);
      islandHp = round2(islandHp - damage);
      events.push({ type: 'island_damaged', t: now(), boarderId: boarder.id, damage, hp: islandHp, x: round2(boarder.x), z: round2(boarder.z) });
      if (islandHp <= 0) { end('island_lost', events); return; }
    }
    if (party.size && allFallen(t)) { end('captains_fallen', events); return; }
    for (let i = balls.length - 1; i >= 0; i--) {
      const ball = balls[i];
      if (ball.impactAt > t + 1e-9) continue;
      balls.splice(i, 1);
      const target = findTarget(ball.targetId);
      if (ball.hit && target) {
        damageTarget(target, ball.damage, ball.cannonId, events, ball.captain ? { manual: true, captain: true } : { manual: ball.manual });
        // Chain shot (GAME-V3.md §5): a ship that floats on is slowed for a few seconds.
        if (ball.chain && !target.boarder && target.hp > 0) { target.slowUntil = round2(t + ball.chain.seconds); target.slowBy = ball.chain.slow; events.push({ type: 'ship_slowed', t: now(), shipId: target.id, until: target.slowUntil }); }
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
            radius: round2(cluster.radius * wide), damage: round2(shell.damage * cluster.damage) }; })
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
          if (boarder.state !== 'walking') { boarder.state = 'walking'; boarder.wallId = null; }
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
      tower.reload = Math.max(0, tower.reload - C.tick);
      if (tower.reload > 1e-9) continue;
      const target = aimTower(tower);
      if (target && tower.kind === 'mortar') lob(tower, target, events);
      else if (target) fire(tower, target, false, events);
    }
    for (const wall of walls) {
      wall.crew = false;
      // Bastion (tier 3): a standing wall mends a little every tick by itself.
      if (wall.skill.mend && wall.hp > 0 && wall.hp < wall.maxHp) wall.hp = round2(Math.min(wall.maxHp, wall.hp + wall.maxHp * wall.skill.mend * C.tick));
      if (wall.repairLeft <= 0) continue;
      const amount = Math.min((wall.repairRate ?? C.wall.repairRate) * C.tick, wall.maxHp - wall.hp);
      wall.hp = round2(wall.hp + amount); wall.repaired += amount; wall.repairLeft -= C.tick;
      if (wall.hp >= wall.maxHp || wall.repairLeft <= 1e-9) {
        wall.repairLeft = 0;
        events.push({ type: 'wall_repaired', t: now(), wallId: wall.id, hp: wall.hp, amount: round2(wall.repaired), x: wall.x, z: wall.z });
        wall.repaired = 0;
      }
    }
    if (crew.carpenter) {
      // Each carpenter takes the most damaged wall nobody else is on (a broken one first); two share a lone
      // one. A standing wall gains `rate` hp a second; a broken one comes back at the rebuild share after
      // `rebuild` seconds of work (two carpenters together take half the time).
      const hurt = walls.filter(wall => wall.hp < wall.maxHp).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || (a.id < b.id ? -1 : 1));
      for (let i = 0; i < crew.carpenter && hurt.length; i++) {
        const wall = hurt[Math.min(i, hurt.length - 1)];
        wall.crew = true;
        if (wall.hp <= 0) {
          wall.rebuilding = round2(wall.rebuilding + C.tick);
          if (wall.rebuilding + 1e-9 >= C.crew.carpenter.rebuild) rebuild(wall, 'carpenter', events);
          continue;
        }
        wall.hp = round2(Math.min(wall.maxHp, wall.hp + C.crew.carpenter.rate * (wall.skill.repair ?? 1) * C.tick));
        if (wall.hp >= wall.maxHp) events.push({ type: 'wall_repaired', t: now(), wallId: wall.id, hp: wall.hp, by: 'carpenter', x: wall.x, z: wall.z });
      }
    }
    if (nextSpawn >= plan.length && ships.length === 0 && boarders.length === 0) end('all_sunk', events);
    else if (t + 1e-9 >= C.maxTime) end('timeout', events);
  }

  function result() {
    const survived = islandHp > 0 && !(endReason === 'timeout' && flagshipAfloat()) && endReason !== null && endReason !== 'captains_fallen';
    return { survived, shipsSunk: sunk, boardersKilled: killed, islandHp, time: now() };
  }

  return {
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
          ...(ship.kind === 'flagship' ? { exposed: lampsLit } : {}) })),
        boarders: boarders.map(item => ({ id: item.id, ...(item.brute ? { brute: true } : {}), x: round2(item.x), z: round2(item.z), hp: item.hp, maxHp: item.maxHp,
          state: item.state, wallId: item.wallId, facing: item.facing, foe: item.foe ?? null })),
        // Captain health (GAME-V3.md §3), by id: present is false for a captain who is away or not heard lately.
        party: [...party.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map(hero => ({ id: hero.id,
          x: round2(hero.x), z: round2(hero.z), hp: hero.hp, maxHp: hero.maxHp, down: hero.down, downAt: hero.downAt,
          colour: hero.colour, present: presentAt(hero, t) })),
        wrecks: wrecks.map(item => ({ ...item })),
        walls: walls.map(wall => ({ id: wall.id, level: wall.level, ...(wall.spec ? { spec: wall.spec } : {}), hp: wall.hp, maxHp: wall.maxHp, repairing: wall.repairLeft > 0, crew: wall.crew,
          broken: wall.hp <= 0, inner: wall.inner, rebuildReady: wall.hp <= 0 && t - wall.rebuildAt >= C.wall.rebuildCooldown - 1e-9 })),
        cannons: cannons.map(cannon => ({ id: cannon.id, x: cannon.x, z: cannon.z, reload: round2(cannon.reload), range: round2(cannon.sight) })),
        towers: towers.map(tower => ({ id: tower.id, kind: tower.kind, level: tower.level, ...(tower.spec ? { spec: tower.spec } : {}), x: tower.x, z: tower.z, manned: tower.manned,
          reload: round2(tower.reload), range: round2(tower.sight) })),
        balls: balls.map(ball => ({ ...ball })),
        shells: shells.map(shell => ({ ...shell })),
        fires: fires.map(fire => ({ x: fire.x, z: fire.z, radius: fire.radius, until: fire.until })),
        captains: Object.fromEntries([...captains].map(([by, at]) => [by, round2(at)])),
        blades: Object.fromEntries([...blades].map(([by, at]) => [by, round2(at)])),
        crew: { ...crew }, heart: { x: heart.x, z: heart.z },
        islandHp, maxIslandHp: maxHp, sunk, shipsLeft: plan.length - sunk, total: plan.length, lampsLit, fog, sight: round2(sight),
        boardersLeft: boarders.length, boardersKilled: killed, boardersLanded: landed,
      };
    },
    get done() { return done; },
    // Why the wave ended: all_sunk, timeout, island_lost or captains_fallen (null while it runs).
    get endReason() { return endReason; },
    result,
  };
}
