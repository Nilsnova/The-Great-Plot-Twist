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
  maxTime: 120,               // the pirates sail off after this; the wave ends
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
    base: 3, perWave: 2, max: 24,   // ships = (base + perWave × (wave − 1)) × weather.ships
    firstSpawn: 2, gap: 8, gapPerWave: 0.6, minGap: 1.6, window: 70, // spawn timing
    lanesPerWave: 1,          // wave 1 uses 1 lane, wave 2 two lanes, wave 3+ all three
    brigFromWave: 3, brigShare: 0.15, brigMaxShare: 0.5,
  },
  ships: {
    sloop: { hp: 30, speed: 2, damage: 3, interval: 1.5 },
    brig: { hp: 80, speed: 1.3, damage: 6, interval: 2 },
    flagship: { hp: 600, speed: 0.8, damage: 10, interval: 2.5 },
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
  maxWave: 50,
});

const KINDS = new Set(['wall', 'cannon', 'watchtower', 'house']);
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
    seen.add(item.id); out.push({ id: item.id, kind: item.kind, x: item.x, z: item.z });
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

function shuffle(list, random) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** createWave({seed, wave, weather: {ships, fog}, island: {hp}, defenses, flagship, countdown, coast, lanes}) */
export function createWave(options = {}) {
  const C = CONFIG, random = createRandom(options?.seed);
  const waveNumber = clamp(Math.trunc(finite(options?.wave) ? options.wave : 1), 1, C.maxWave);
  const shipFactor = clamp(finite(options?.weather?.ships) ? options.weather.ships : 1, C.weather.minShips, C.weather.maxShips);
  const fog = clamp(finite(options?.weather?.fog) ? options.weather.fog : 0, 0, C.fog.max);
  const maxHp = finite(options?.island?.hp) && options.island.hp > 0 ? options.island.hp : C.islandHp;
  const countdown = finite(options?.countdown) ? clamp(options.countdown, 0, 60) : 0;
  const withFlagship = options?.flagship === true;
  const defenses = readDefenses(options?.defenses);
  const hasTower = defenses.some(item => item.kind === 'watchtower');
  const range = C.cannon.range + (hasTower ? C.cannon.towerBonus : 0);
  const sight = range * (waveNumber === 1 ? Math.max(1 - fog, C.fog.firstWaveSight) : 1 - fog);
  const coast = readCoast(options?.coast), laneList = readLanes(options?.lanes);
  const cannons = defenses.filter(item => item.kind === 'cannon')
    .map(item => ({ ...item, reload: 0, lastShot: -Infinity, shots: 0 }));
  const walls = defenses.filter(item => item.kind === 'wall')
    .map(item => ({ ...item, hp: C.wall.hp, maxHp: C.wall.hp, repairLeft: 0, repaired: 0 }));
  const cannonById = new Map(cannons.map(item => [item.id, item]));
  const wallById = new Map(walls.map(item => [item.id, item]));

  // The fleet is planned up front, so the random sequence never depends on frame timing.
  const lanes = laneList.map(lane => {
    const a = lane.bearing * Math.PI / 180, stop = coastPoint(a, C.stopRadius, coast);
    const cover = cannons.length ? Math.min(...cannons.map(c => distance(c.x, c.z, stop.x, stop.z))) : 0;
    return { id: lane.id, a, stop, cover };
  });
  shuffle(lanes, random);
  if (cannons.length) lanes.sort((a, b) => a.cover - b.cover); // the first waves come where the guns are
  const laneCount = clamp(C.fleet.lanesPerWave * waveNumber, 1, lanes.length);
  const count = clamp(Math.round((C.fleet.base + C.fleet.perWave * (waveNumber - 1)) * shipFactor), 1, C.fleet.max);
  const brigs = waveNumber >= C.fleet.brigFromWave
    ? Math.round(count * Math.min(C.fleet.brigMaxShare, (waveNumber - C.fleet.brigFromWave + 1) * C.fleet.brigShare)) : 0;
  const kinds = shuffle([...Array(count - brigs).fill('sloop'), ...Array(brigs).fill('brig')], random);
  const gap = Math.min(Math.max(C.fleet.minGap, C.fleet.gap - C.fleet.gapPerWave * (waveNumber - 1)), C.fleet.window / count);
  const plan = kinds.map((kind, index) => ({ kind, lane: lanes[index % laneCount], at: C.fleet.firstSpawn + index * gap }));
  if (withFlagship) {
    const at = C.fleet.firstSpawn + Math.min(C.flagship.afterShips, count) * gap;
    plan.push({ kind: 'flagship', lane: lanes[0], at });
    plan.sort((a, b) => a.at - b.at);
  }
  for (const entry of plan) {
    const a = entry.lane.a + (random() * 2 - 1) * C.laneSpread * Math.PI / 180;
    const stopR = C.stopRadius + (random() * 2 - 1) * C.stopJitter;
    entry.from = coastPoint(a, C.spawnRadius, coast); entry.to = coastPoint(a, entry.kind === 'flagship' ? C.stopRadius + .1 : stopR, coast);
  }

  let ticks = 0, rest = 0, nextSpawn = 0, nextShipId = 1, sunk = 0, islandHp = maxHp, done = false;
  let started = countdown === 0 ? null : false, lastCountdown = null, lampsLit = false, endReason = null;
  const ships = [], wrecks = [], balls = [];
  let queued = [];
  const now = () => round2(ticks * C.tick);
  const flagshipAfloat = () => ships.some(ship => ship.kind === 'flagship') ||
    plan.slice(nextSpawn).some(entry => entry.kind === 'flagship');

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
    events.push({ type: 'ship_sunk', t: now(), shipId: ship.id, kind: ship.kind, by, x: round2(ship.x), z: round2(ship.z) });
  }

  function fire(cannon, ship, manual, events) {
    const flight = distance(cannon.x, cannon.z, ship.x, ship.z) / C.cannon.ballSpeed;
    const lead = ship.state === 'sailing' ? Math.min(ship.speed * flight, ship.left) : 0;
    let toX = ship.x + ship.dx * lead, toZ = ship.z + ship.dz * lead;
    const hit = manual || random() < C.cannon.accuracy;
    if (!hit) { const a = random() * Math.PI * 2, r = 1 + random() * (C.cannon.missSpread - 1); toX += Math.cos(a) * r; toZ += Math.sin(a) * r; }
    const damage = C.cannon.damage * (manual ? C.cannon.manualMultiplier : 1);
    const impactAt = round2(ticks * C.tick + flight);
    balls.push({ cannonId: cannon.id, shipId: ship.id, hit, damage, manual, impactAt });
    cannon.reload = C.cannon.reload; cannon.lastShot = ticks * C.tick; cannon.shots++;
    events.push({ type: 'cannon_fired', t: now(), cannonId: cannon.id, targetId: ship.id, manual, hit, damage,
      x: cannon.x, z: cannon.z, toX: round2(toX), toZ: round2(toZ), impactAt });
  }

  const pending = ship => balls.reduce((sum, ball) => sum + (ball.shipId === ship.id && ball.hit ? ball.damage : 0), 0);
  const visible = (cannon, ship) => distance(cannon.x, cannon.z, ship.x, ship.z) <= sight;

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
    }
  }

  function end(reason, events) {
    done = true; endReason = reason;
    events.push({ type: 'wave_ended', t: now(), reason, ...result() });
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
      events.push({ type: 'wave_started', t: 0, wave: waveNumber, ships: plan.length, flagship: withFlagship, fog, sight: round2(sight),
        lanes: lanes.slice(0, laneCount).map(lane => ({ id: lane.id, x: round2(lane.stop.x), z: round2(lane.stop.z) })) });
    }
    for (const input of queued) applyInput(input, events);
    queued = [];
    if (done) return;
    ticks++;
    const t = ticks * C.tick;
    while (nextSpawn < plan.length && plan[nextSpawn].at <= t + 1e-9) {
      const entry = plan[nextSpawn++], stats = C.ships[entry.kind];
      const length = distance(entry.from.x, entry.from.z, entry.to.x, entry.to.z);
      const ship = { id: `ship_${nextShipId++}`, kind: entry.kind, lane: entry.lane.id, x: entry.from.x, z: entry.from.z,
        hp: stats.hp, maxHp: stats.hp, speed: stats.speed, left: length, dx: (entry.to.x - entry.from.x) / length,
        dz: (entry.to.z - entry.from.z) / length, to: entry.to, state: 'sailing', attackIn: 0, target: null };
      ships.push(ship);
      events.push({ type: 'ship_spawned', t: now(), shipId: ship.id, kind: ship.kind, lane: ship.lane, hp: ship.hp,
        x: round2(ship.x), z: round2(ship.z), toX: round2(entry.to.x), toZ: round2(entry.to.z) });
    }
    for (const ship of [...ships]) {
      const stats = C.ships[ship.kind];
      if (ship.state === 'sailing') {
        const move = Math.min(ship.speed * C.tick, ship.left);
        ship.x += ship.dx * move; ship.z += ship.dz * move; ship.left -= move;
        if (ship.left <= 1e-9) { ship.x = ship.to.x; ship.z = ship.to.z; ship.state = 'attacking'; ship.attackIn = stats.interval / 2; }
      } else if ((ship.attackIn -= C.tick) <= 1e-9) {
        ship.attackIn += stats.interval;
        let wall = null, best = C.wall.reach;
        for (const item of walls) {
          const d = distance(item.x, item.z, ship.x, ship.z);
          if (item.hp > 0 && d <= best) { wall = item; best = d; }
        }
        if (wall) {
          wall.hp = round2(Math.max(0, wall.hp - stats.damage));
          events.push({ type: 'wall_damaged', t: now(), wallId: wall.id, shipId: ship.id, damage: stats.damage, hp: wall.hp,
            broken: wall.hp === 0, x: wall.x, z: wall.z });
        } else {
          const damage = Math.min(islandHp, stats.damage);
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
      if (ball.hit && ship) damageShip(ship, ball.damage, ball.cannonId, events, { manual: ball.manual });
    }
    for (const cannon of cannons) {
      cannon.reload = Math.max(0, cannon.reload - C.tick);
      if (cannon.reload > 1e-9) continue;
      let target = null, best = Infinity;
      for (const ship of ships) {
        const d = distance(cannon.x, cannon.z, ship.x, ship.z);
        if (d > sight || d >= best || pending(ship) >= ship.hp) continue;
        if (ship.kind === 'flagship' && !lampsLit && ships.length > 1) continue; // escorts first while armoured
        target = ship; best = d;
      }
      if (target) fire(cannon, target, false, events);
    }
    for (const wall of walls) {
      if (wall.repairLeft <= 0) continue;
      const amount = Math.min(C.wall.repairRate * C.tick, wall.maxHp - wall.hp);
      wall.hp = round2(wall.hp + amount); wall.repaired += amount; wall.repairLeft -= C.tick;
      if (wall.hp >= wall.maxHp || wall.repairLeft <= 1e-9) {
        wall.repairLeft = 0;
        events.push({ type: 'wall_repaired', t: now(), wallId: wall.id, hp: wall.hp, amount: round2(wall.repaired), x: wall.x, z: wall.z });
        wall.repaired = 0;
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
        time: now(), wave: waveNumber, phase: started === true ? (done ? 'ended' : 'running') : 'countdown',
        ships: ships.map(ship => ({ id: ship.id, kind: ship.kind, lane: ship.lane, x: round2(ship.x), z: round2(ship.z),
          hp: ship.hp, maxHp: ship.maxHp, state: ship.state, ...(ship.kind === 'flagship' ? { exposed: lampsLit } : {}) })),
        wrecks: wrecks.map(item => ({ ...item })),
        walls: walls.map(wall => ({ id: wall.id, hp: wall.hp, maxHp: wall.maxHp, repairing: wall.repairLeft > 0 })),
        cannons: cannons.map(cannon => ({ id: cannon.id, x: cannon.x, z: cannon.z, reload: round2(cannon.reload), range: round2(sight) })),
        balls: balls.map(ball => ({ ...ball })),
        islandHp, maxIslandHp: maxHp, sunk, shipsLeft: plan.length - sunk, total: plan.length, lampsLit, fog, sight: round2(sight),
      };
    },
    get done() { return done; },
    result,
  };
}
