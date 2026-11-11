// The pirate wave simulation (BUILD-PLAN 3.5). Pure and deterministic: a seeded random number
// generator, a fixed 50 ms tick and no Math.random, clock, DOM or Three.js, so every player on the
// same island who feeds the same inputs sees the same wave.
//
// Units are world units of the home_islet place (1 unit = 16 px), island-local: x to the east,
// +z towards the camera (south), the island centre at 0,0. The coast is the canonical ellipse of
// places/surfaces.js. Ships sail in on three sea lanes, stop just off the shore and attack the
// nearest standing wall, else the island. Cannons fire on their own at the nearest ship they can see.
import { surfaces } from '../world/places/surfaces.js';

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
    firstSpawn: 2, gap: 8, gapPerWave: 0.6, minGap: 1.6, window: 70, // spawn timing
    lanesPerWave: 1,          // wave 1 uses 1 lane, wave 2 two lanes, wave 3+ all three
    brigFromWave: 3, brigShare: 0.15, brigMaxShare: 0.5,
  },
  ships: {
    sloop: { hp: 30, speed: 2, damage: 3, interval: 1.5 },
    brig: { hp: 80, speed: 1.3, damage: 6, interval: 2 },
    flagship: { hp: 600, speed: 0.8, damage: 10, interval: 2.5 },
    warship: { hp: 260, speed: 1.1, damage: 10, interval: 2 },
  },
  // The difficulty curve to wave 100: hp, speed and damage grow with the wave number (× per ship kind).
  curve: {
    hpFrom: 4, hpPerWave: 0.07,       // hp × (1 + hpPerWave × (wave − hpFrom)) from wave hpFrom on
    hpLateFrom: 30, hpLatePerWave: 0.1,  // and faster after wave 30: the endless part
    speedPerWave: 0.004, speedMax: 1.35,
    damageFrom: 10, damagePerWave: 0.04,
    warshipsFrom: 21, warshipsEvery: 10, // regular warships in the fleet: one more every 10 waves from wave 21
  },
  boss: { every: 5, doubleEvery: 10, afterShips: 3 }, // every 5th wave a warship, every 10th two
  // Towers by level (index 0 = level 1). Cannon: one ball at one ship. Mortar: a shell on an arc that
  // hurts every ship within `radius` of the impact, never at ships closer than minRange.
  levels: {
    cannon: [{ damage: 10, range: 28, reload: 1.5 }, { damage: 16, range: 31, reload: 1.3 }, { damage: 24, range: 34, reload: 1.1 }],
    mortar: [{ damage: 14, range: 36, reload: 3.5 }, { damage: 22, range: 40, reload: 3.0 }, { damage: 32, range: 44, reload: 2.6 }],
    wall: [{ hp: 60 }, { hp: 120 }, { hp: 200 }],
    watchtower: [{ range: 8 }, { range: 12 }],
    house: [{}, {}],
  },
  mortar: { radius: 4, minRange: 8, flight: 1.3, flightPerUnit: 0.025, scatter: 1.2, firstReload: 1 },
  crew: {
    gunner: { max: 2, reload: 0.75 },        // reload × 0.75 on the strongest towers, aims at the ship closest to the shore
    carpenter: { max: 2, rate: 6 },          // hp per second on the most damaged walls
    lookout: { max: 1, sight: 1.2, warn: 3 }, // sight × 1.2 in fog; ships are announced 3 s before they appear
  },
  // Every player's musket (TOWER-DEFENSE.md §10), measured from the shooter's position at send time.
  captain: {
    levels: [{ damage: 6, range: 14, reload: 1.2 }, { damage: 9, range: 15, reload: 1.05 }, { damage: 13, range: 16, reload: 0.9 },
      { damage: 18, range: 18, reload: 0.75 }, { damage: 24, range: 20, reload: 0.6 }],
    shotSpeed: 45,
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
    manualMultiplier: 2, manualCooldown: 0.5, missSpread: 2.5,
  },
  fog: { max: 0.9,            // sight = range × (1 − fog)
    firstWaveSight: 0.7 },    // wave 1 always sees at least this share of the range: one cannon wins it in fog
  weather: { minShips: 0.5, maxShips: 3 },
  wall: { hp: 60, reach: 8, repairRate: 10, repairSeconds: 3 },
  maxWave: 100,
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
    seen.add(item.id); out.push({ id: item.id, kind: item.kind, level, x: item.x, z: item.z });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
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
/** The fleet's size before the weather: steep for the first waves, then slower. */
export function fleetSize(wave) {
  const F = CONFIG.fleet;
  return F.base + F.perWave * (Math.min(wave, F.steepUntil) - 1) + F.latePerWave * Math.max(0, wave - F.steepUntil);
}
/** Ship hp, speed and damage multipliers for a wave number. */
export function curveFor(wave) {
  const K = CONFIG.curve;
  return {
    hp: round2(1 + K.hpPerWave * Math.max(0, wave - K.hpFrom) + K.hpLatePerWave * Math.max(0, wave - K.hpLateFrom)),
    speed: round2(Math.min(K.speedMax, 1 + K.speedPerWave * (wave - 1))),
    damage: round2(1 + K.damagePerWave * Math.max(0, wave - K.damageFrom)),
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
 * level (1-3) and crew are optional: an old caller without them gets level 1 and no crew. boss is
 * optional too: without it every 5th wave is a boss wave (TOWER-DEFENSE.md §1), never with the flagship.
 * Inputs to step(): {type: 'fire', cannonId, targetId}, {type: 'repair', wallId}, {type: 'lamps_lit'},
 * {type: 'captain_shot', by, targetId, level, x, z} (the shooter's own position and captain level).
 */
export function createWave(options = {}) {
  const C = CONFIG, random = createRandom(options?.seed);
  const waveNumber = clamp(Math.trunc(finite(options?.wave) ? options.wave : 1), 1, C.maxWave);
  const shipFactor = clamp(finite(options?.weather?.ships) ? options.weather.ships : 1, C.weather.minShips, C.weather.maxShips);
  const fog = clamp(finite(options?.weather?.fog) ? options.weather.fog : 0, 0, C.fog.max);
  const maxHp = finite(options?.island?.hp) && options.island.hp > 0 ? options.island.hp : C.islandHp;
  const countdown = finite(options?.countdown) ? clamp(options.countdown, 0, 60) : 0;
  const withFlagship = options?.flagship === true;
  const boss = typeof options?.boss === 'boolean' ? options.boss : !withFlagship && waveNumber % C.boss.every === 0;
  const defenses = readDefenses(options?.defenses), crew = readCrew(options?.crew);
  const curve = curveFor(waveNumber);
  const towerBonus = Math.max(0, ...defenses.filter(item => item.kind === 'watchtower').map(item => C.levels.watchtower[item.level - 1].range));
  let fogShare = waveNumber === 1 ? Math.max(1 - fog, C.fog.firstWaveSight) : 1 - fog;
  if (crew.lookout && fog > 0) fogShare = Math.min(1, fogShare * C.crew.lookout.sight);
  const warnLead = crew.lookout ? C.crew.lookout.warn : 0;
  const coast = readCoast(options?.coast), laneList = readLanes(options?.lanes);
  // Cannons and mortars, in id order; the gunners man the strongest (damage per second, then level).
  const towers = defenses.filter(item => item.kind === 'cannon' || item.kind === 'mortar').map(item => {
    const stats = C.levels[item.kind][item.level - 1], range = stats.range + towerBonus;
    return { ...item, damage: stats.damage, baseReload: stats.reload, range, sight: range * fogShare, manned: false,
      reload: item.kind === 'mortar' ? C.mortar.firstReload : 0, lastShot: -Infinity, shots: 0 };
  });
  const strength = tower => tower.damage / tower.baseReload * (tower.kind === 'mortar' ? 1.5 : 1);
  [...towers].sort((a, b) => strength(b) - strength(a) || b.level - a.level || (a.id < b.id ? -1 : 1))
    .slice(0, crew.gunner).forEach(tower => { tower.manned = true; tower.baseReload = round2(tower.baseReload * C.crew.gunner.reload); });
  const cannons = towers.filter(item => item.kind === 'cannon'), mortars = towers.filter(item => item.kind === 'mortar');
  // The sight the island shows (fog edge, the manual-fire reach): the level-1 cannon's, or the best cannon's.
  const sight = Math.max(C.cannon.range + towerBonus, ...cannons.map(item => item.range)) * fogShare;
  const walls = defenses.filter(item => item.kind === 'wall').map(item => {
    const hp = C.levels.wall[item.level - 1].hp;
    return { ...item, hp, maxHp: hp, repairLeft: 0, repaired: 0, crew: false };
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
  const count = clamp(Math.round(fleetSize(waveNumber) * shipFactor), 1, C.fleet.max);
  const brigs = waveNumber >= C.fleet.brigFromWave
    ? Math.round(count * Math.min(C.fleet.brigMaxShare, (waveNumber - C.fleet.brigFromWave + 1) * C.fleet.brigShare)) : 0;
  const { bosses, regular } = warshipsFor(waveNumber, boss);
  const escorts = Math.max(0, count - regular);
  const kinds = shuffle([...Array(escorts - Math.min(brigs, escorts)).fill('sloop'), ...Array(Math.min(brigs, escorts)).fill('brig'),
    ...Array(Math.min(regular, count)).fill('warship')], random);
  const gap = Math.min(Math.max(C.fleet.minGap, C.fleet.gap - C.fleet.gapPerWave * (waveNumber - 1)), C.fleet.window / count);
  const plan = kinds.map((kind, index) => ({ kind, lane: lanes[index % laneCount], at: C.fleet.firstSpawn + index * gap }));
  for (let i = 0; i < bosses; i++) {
    // The boss sails in after a few escorts; a second one a little later on another lane.
    const at = C.fleet.firstSpawn + (Math.min(C.boss.afterShips, count) + i * 3) * gap;
    plan.push({ kind: 'warship', boss: true, lane: lanes[i % laneCount], at }); // where the guns are, like the flagship
  }
  if (withFlagship) {
    const at = C.fleet.firstSpawn + Math.min(C.flagship.afterShips, count) * gap;
    plan.push({ kind: 'flagship', lane: lanes[0], at });
  }
  plan.sort((a, b) => a.at - b.at);
  for (const entry of plan) {
    const a = entry.lane.a + (random() * 2 - 1) * C.laneSpread * Math.PI / 180;
    const stopR = C.stopRadius + (random() * 2 - 1) * C.stopJitter;
    entry.from = coastPoint(a, C.spawnRadius, coast);
    entry.to = coastPoint(a, entry.kind === 'flagship' || entry.kind === 'warship' ? C.stopRadius + .1 : stopR, coast);
  }

  let ticks = 0, rest = 0, nextSpawn = 0, nextWarn = 0, nextShipId = 1, sunk = 0, islandHp = maxHp, done = false;
  let started = countdown === 0 ? null : false, lastCountdown = null, lampsLit = false, endReason = null;
  const ships = [], wrecks = [], balls = [], shells = [], captains = new Map();
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
    events.push({ type: 'ship_sunk', t: now(), shipId: ship.id, kind: ship.kind, by, boss: ship.boss, x: round2(ship.x), z: round2(ship.z) });
  }

  // Where a ship will be after `seconds`: along its course, stopping at its anchor.
  const ahead = (ship, seconds) => {
    const lead = ship.state === 'sailing' ? Math.min(ship.speed * seconds, ship.left) : 0;
    return { x: ship.x + ship.dx * lead, z: ship.z + ship.dz * lead };
  };

  function fire(cannon, ship, manual, events) {
    const flight = distance(cannon.x, cannon.z, ship.x, ship.z) / C.cannon.ballSpeed;
    const aim = ahead(ship, flight);
    let toX = aim.x, toZ = aim.z;
    const hit = manual || random() < C.cannon.accuracy;
    if (!hit) { const a = random() * Math.PI * 2, r = 1 + random() * (C.cannon.missSpread - 1); toX += Math.cos(a) * r; toZ += Math.sin(a) * r; }
    const damage = cannon.damage * (manual ? C.cannon.manualMultiplier : 1);
    const impactAt = round2(ticks * C.tick + flight);
    balls.push({ cannonId: cannon.id, shipId: ship.id, hit, damage, manual, impactAt });
    cannon.reload = cannon.baseReload; cannon.lastShot = ticks * C.tick; cannon.shots++;
    events.push({ type: 'cannon_fired', t: now(), cannonId: cannon.id, targetId: ship.id, manual, hit, damage, level: cannon.level,
      x: cannon.x, z: cannon.z, toX: round2(toX), toZ: round2(toZ), impactAt });
  }

  function lob(mortar, ship, events) {
    const d = distance(mortar.x, mortar.z, ship.x, ship.z), flight = round2(C.mortar.flight + d * C.mortar.flightPerUnit);
    const aim = ahead(ship, flight), a = random() * Math.PI * 2, r = random() * C.mortar.scatter;
    const toX = round2(aim.x + Math.cos(a) * r), toZ = round2(aim.z + Math.sin(a) * r), impactAt = round2(ticks * C.tick + flight);
    shells.push({ towerId: mortar.id, x: mortar.x, z: mortar.z, toX, toZ, damage: mortar.damage, impactAt, from: now() });
    mortar.reload = mortar.baseReload; mortar.lastShot = ticks * C.tick; mortar.shots++;
    events.push({ type: 'mortar_fired', t: now(), towerId: mortar.id, targetId: ship.id, damage: mortar.damage, level: mortar.level,
      x: mortar.x, z: mortar.z, toX, toZ, impactAt, radius: C.mortar.radius });
  }

  const pending = ship => balls.reduce((sum, ball) => sum + (ball.shipId === ship.id && ball.hit ? ball.damage : 0), 0);
  const visible = (cannon, ship) => distance(cannon.x, cannon.z, ship.x, ship.z) <= cannon.sight;
  const armoured = ship => ship.kind === 'flagship' && !lampsLit && ships.length > 1; // escorts first while armoured
  const shoreOrder = (a, b) => (a.state === 'attacking') !== (b.state === 'attacking') ? (a.state === 'attacking' ? -1 : 1) : a.left - b.left;

  function captainShot(input, events) {
    const by = typeof input.by === 'string' && /^[A-Za-z0-9_.:-]{1,64}$/.test(input.by) ? input.by : null;
    const ship = typeof input.targetId === 'string' ? ships.find(item => item.id === input.targetId) : undefined;
    if (!by || !ship || !finite(input.x) || !finite(input.z)) return;
    const level = Number.isInteger(input.level) ? clamp(input.level, 1, C.captain.levels.length) : 1, stats = C.captain.levels[level - 1];
    const d = distance(input.x, input.z, ship.x, ship.z), t = ticks * C.tick;
    if (d > stats.range || t - (captains.get(by) ?? -Infinity) < stats.reload - 1e-9) return;
    captains.set(by, t);
    const impactAt = round2(t + d / C.captain.shotSpeed);
    balls.push({ cannonId: `captain:${by}`, shipId: ship.id, hit: true, damage: stats.damage, manual: true, captain: true, impactAt });
    events.push({ type: 'captain_fired', t: now(), by, targetId: ship.id, level, damage: stats.damage, reload: stats.reload,
      x: round2(input.x), z: round2(input.z), toX: round2(ship.x), toZ: round2(ship.z), impactAt });
  }

  function applyInput(input, events) {
    if (!input || typeof input !== 'object' || typeof input.type !== 'string') return;
    if (input.type === 'fire') {
      const cannon = typeof input.cannonId === 'string' ? cannonById.get(input.cannonId) : undefined;
      const ship = typeof input.targetId === 'string' ? ships.find(item => item.id === input.targetId) : undefined;
      if (!cannon || !ship || !visible(cannon, ship)) return;
      if (ticks * C.tick - cannon.lastShot < C.cannon.manualCooldown) return;
      fire(cannon, ship, true, events);
    } else if (input.type === 'repair') {
      const wall = typeof input.wallId === 'string' ? wallById.get(input.wallId) : undefined;
      if (!wall || wall.hp >= wall.maxHp) return;
      if (wall.repairLeft <= 0) wall.repaired = 0;
      wall.repairLeft = C.wall.repairSeconds;
    } else if (input.type === 'lamps_lit') {
      if (!withFlagship || lampsLit) return;
      lampsLit = true; // the beam strikes the flagship on the next tick, or as soon as it appears
    } else if (input.type === 'captain_shot') captainShot(input, events);
  }

  function end(reason, events) {
    done = true; endReason = reason;
    events.push({ type: 'wave_ended', t: now(), reason, ...result() });
  }

  function aimTower(tower) {
    let target = null, best = Infinity;
    if (tower.kind === 'mortar') {
      // The shell goes where most ships are (within its radius), the gunner's to the ship nearest the shore.
      for (const ship of ships) {
        const d = distance(tower.x, tower.z, ship.x, ship.z);
        if (d > tower.sight || d < C.mortar.minRange || armoured(ship)) continue;
        let score = 0;
        for (const other of ships) if (distance(other.x, other.z, ship.x, ship.z) <= C.mortar.radius) score++;
        const rank = tower.manned ? (ship.state === 'attacking' ? 0 : 1) * 1e4 + ship.left - score * .01 : -score * 1e4 + d;
        if (rank < best) { target = ship; best = rank; }
      }
      return target;
    }
    for (const ship of ships) {
      const d = distance(tower.x, tower.z, ship.x, ship.z);
      if (d > tower.sight || pending(ship) >= ship.hp || armoured(ship)) continue;
      if (tower.manned ? !target || shoreOrder(ship, target) < 0 : d < best) { target = ship; best = d; }
    }
    return target;
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
        fog, sight: round2(sight), lanes: lanes.slice(0, laneCount).map(lane => ({ id: lane.id, x: round2(lane.stop.x), z: round2(lane.stop.z) })) });
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
      const hp = entry.kind === 'flagship' ? stats.hp : Math.round(stats.hp * curve.hp);
      const ship = { id: `ship_${nextShipId++}`, kind: entry.kind, boss: entry.boss === true, lane: entry.lane.id, x: entry.from.x, z: entry.from.z,
        hp, maxHp: hp, speed: round2(stats.speed * (entry.kind === 'flagship' ? 1 : curve.speed)), left: length,
        damage: round2(stats.damage * (entry.kind === 'flagship' ? 1 : curve.damage)), dx: (entry.to.x - entry.from.x) / length,
        dz: (entry.to.z - entry.from.z) / length, to: entry.to, state: 'sailing', attackIn: 0, target: null };
      ships.push(ship);
      events.push({ type: 'ship_spawned', t: now(), shipId: ship.id, kind: ship.kind, boss: ship.boss, lane: ship.lane, hp: ship.hp,
        x: round2(ship.x), z: round2(ship.z), toX: round2(entry.to.x), toZ: round2(entry.to.z) });
    }
    for (const ship of [...ships]) {
      const stats = statsOf(ship.kind);
      if (ship.state === 'sailing') {
        const move = Math.min(ship.speed * C.tick, ship.left);
        ship.x += ship.dx * move; ship.z += ship.dz * move; ship.left -= move;
        if (ship.left <= 1e-9) { ship.x = ship.to.x; ship.z = ship.to.z; ship.left = 0; ship.state = 'attacking'; ship.attackIn = stats.interval / 2; }
      } else if ((ship.attackIn -= C.tick) <= 1e-9) {
        ship.attackIn += stats.interval;
        let wall = null, best = C.wall.reach;
        for (const item of walls) {
          const d = distance(item.x, item.z, ship.x, ship.z);
          if (item.hp > 0 && d <= best) { wall = item; best = d; }
        }
        if (wall) {
          wall.hp = round2(Math.max(0, wall.hp - ship.damage));
          events.push({ type: 'wall_damaged', t: now(), wallId: wall.id, shipId: ship.id, damage: ship.damage, hp: wall.hp,
            broken: wall.hp === 0, x: wall.x, z: wall.z });
        } else {
          const damage = Math.min(islandHp, ship.damage);
          islandHp = round2(islandHp - damage);
          events.push({ type: 'island_damaged', t: now(), shipId: ship.id, damage, hp: islandHp, x: round2(ship.x), z: round2(ship.z) });
          if (islandHp <= 0) { end('island_lost', events); return; }
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
    for (let i = balls.length - 1; i >= 0; i--) {
      const ball = balls[i];
      if (ball.impactAt > t + 1e-9) continue;
      balls.splice(i, 1);
      const ship = ships.find(item => item.id === ball.shipId);
      if (ball.hit && ship) damageShip(ship, ball.damage, ball.cannonId, events, ball.captain ? { manual: true, captain: true } : { manual: ball.manual });
    }
    for (let i = 0; i < shells.length;) {
      const shell = shells[i];
      if (shell.impactAt > t + 1e-9) { i++; continue; }
      shells.splice(i, 1);
      const hits = ships.filter(ship => distance(ship.x, ship.z, shell.toX, shell.toZ) <= C.mortar.radius);
      events.push({ type: 'mortar_impact', t: now(), towerId: shell.towerId, x: shell.toX, z: shell.toZ, radius: C.mortar.radius, hits: hits.length });
      for (const ship of hits) damageShip(ship, shell.damage, shell.towerId, events, { area: true });
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
      if (wall.repairLeft <= 0) continue;
      const amount = Math.min(C.wall.repairRate * C.tick, wall.maxHp - wall.hp);
      wall.hp = round2(wall.hp + amount); wall.repaired += amount; wall.repairLeft -= C.tick;
      if (wall.hp >= wall.maxHp || wall.repairLeft <= 1e-9) {
        wall.repairLeft = 0;
        events.push({ type: 'wall_repaired', t: now(), wallId: wall.id, hp: wall.hp, amount: round2(wall.repaired), x: wall.x, z: wall.z });
        wall.repaired = 0;
      }
    }
    if (crew.carpenter) {
      // Each carpenter takes the most damaged standing wall nobody else is on; two share a lone one. A broken
      // wall is rubble until the wave ends (else a sliver of hp would soak up every hit).
      const hurt = walls.filter(wall => wall.hp > 0 && wall.hp < wall.maxHp).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || (a.id < b.id ? -1 : 1));
      for (let i = 0; i < crew.carpenter && hurt.length; i++) {
        const wall = hurt[Math.min(i, hurt.length - 1)];
        wall.crew = true;
        wall.hp = round2(Math.min(wall.maxHp, wall.hp + C.crew.carpenter.rate * C.tick));
        if (wall.hp >= wall.maxHp) events.push({ type: 'wall_repaired', t: now(), wallId: wall.id, hp: wall.hp, by: 'carpenter', x: wall.x, z: wall.z });
      }
    }
    if (nextSpawn >= plan.length && ships.length === 0) end('all_sunk', events);
    else if (t + 1e-9 >= C.maxTime) end('timeout', events);
  }

  function result() {
    const survived = islandHp > 0 && !(endReason === 'timeout' && flagshipAfloat()) && endReason !== null;
    return { survived, shipsSunk: sunk, islandHp, time: now() };
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
      return {
        time: now(), wave: waveNumber, boss, warships: bosses, phase: started === true ? (done ? 'ended' : 'running') : 'countdown',
        ships: ships.map(ship => ({ id: ship.id, kind: ship.kind, lane: ship.lane, x: round2(ship.x), z: round2(ship.z),
          hp: ship.hp, maxHp: ship.maxHp, state: ship.state, ...(ship.boss ? { boss: true } : {}),
          ...(ship.kind === 'flagship' ? { exposed: lampsLit } : {}) })),
        wrecks: wrecks.map(item => ({ ...item })),
        walls: walls.map(wall => ({ id: wall.id, level: wall.level, hp: wall.hp, maxHp: wall.maxHp, repairing: wall.repairLeft > 0, crew: wall.crew })),
        cannons: cannons.map(cannon => ({ id: cannon.id, x: cannon.x, z: cannon.z, reload: round2(cannon.reload), range: round2(cannon.sight) })),
        towers: towers.map(tower => ({ id: tower.id, kind: tower.kind, level: tower.level, x: tower.x, z: tower.z, manned: tower.manned,
          reload: round2(tower.reload), range: round2(tower.sight) })),
        balls: balls.map(ball => ({ ...ball })),
        shells: shells.map(shell => ({ ...shell })),
        captains: Object.fromEntries([...captains].map(([by, at]) => [by, round2(at)])),
        crew: { ...crew },
        islandHp, maxIslandHp: maxHp, sunk, shipsLeft: plan.length - sunk, total: plan.length, lampsLit, fog, sight: round2(sight),
      };
    },
    get done() { return done; },
    result,
  };
}
