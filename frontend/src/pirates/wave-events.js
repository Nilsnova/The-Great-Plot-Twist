// Wave events (docs/GAME-V3.md §4.2): from wave 3 on every wave brings one event that changes how it plays,
// not only its numbers: a fog bank, a storm, a night raid, fire ships, a pincer, an armada of cutters, a
// siege barge, a treasure galleon, smugglers landing behind the defences, the kraken. Pure and deterministic:
//   eventFor(wave, seed, {flagship})  which event a wave brings (the server repeats it: wave_events.py)
//   EVENT_TEXT[id]                    the banner's title and line (the narrator has its own lines)
//   createEventRules(id, {...})       the sim's hooks for one wave (src/pirates/sim.js calls them)
// The table (first wave, weight) lives in wave-events.json, a copy of backend/content/wave_events.json.
//
// The choice: a seed-free sequence by wave number picks a base event that is never the one of the wave
// before (so every island meets the events in a varied order), and with `surprise` of the wave seed's dice
// the wave takes another unlocked event instead, never the base nor the wave before's base. So the same
// event rarely comes twice in a row, a lost wave played again usually meets the same event, and the
// numbers are plain 32-bit steps the server can repeat exactly (mulberry32, integer weights).
import table from './wave-events.json';

export const EVENT_TABLE = Object.freeze(table.events.map(item => Object.freeze({ ...item })));
export const EVENT_IDS = Object.freeze(EVENT_TABLE.map(item => item.id));
export const FIRST_EVENT_WAVE = table.firstWave;
export const SURPRISE = table.surprise;
const MASK = 0xffffffff, TWO32 = 4294967296, SURPRISE_U32 = Math.floor(SURPRISE * TWO32);
const MAX_WAVE = 100;

/** mulberry32 as 32-bit integers (the sim's createRandom without the division). */
export function u32Stream(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}
const baseSeed = wave => (Math.imul(wave, 0x85ebca6b) ^ 0x27d4eb2f) >>> 0;
const waveSeed = (seed, wave) => ((Number(seed) >>> 0) ^ Math.imul(wave, 0x9e3779b1)) >>> 0;
const unlocked = wave => EVENT_TABLE.filter(item => item.from <= wave);
/** A weighted pick from `pool` ([{id, weight}]) with one 32-bit number: exact in JavaScript and Python. */
function weighted(pool, u) {
  const total = pool.reduce((sum, item) => sum + item.weight, 0);
  let at = Math.floor(u * total / TWO32);
  for (const item of pool) { if (at < item.weight) return item.id; at -= item.weight; }
  return pool[pool.length - 1].id;
}
// The seed-free base sequence, wave by wave from the first event wave: never the same twice in a row.
const BASE = (() => {
  const out = new Array(MAX_WAVE + 1).fill(null);
  let previous = null;
  for (let wave = FIRST_EVENT_WAVE; wave <= MAX_WAVE; wave++) {
    const pool = unlocked(wave).filter(item => item.id !== previous);
    out[wave] = previous = weighted(pool, u32Stream(baseSeed(wave))());
  }
  return Object.freeze(out);
})();
export const baseEventFor = wave => (Number.isInteger(wave) && wave >= FIRST_EVENT_WAVE && wave <= MAX_WAVE ? BASE[wave] : null);

/** The event of a wave (an id of EVENT_IDS) or null: none on waves 1-2 (they teach) and at Pirate Point. */
export function eventFor(wave, seed, { flagship = false } = {}) {
  if (flagship === true || !Number.isInteger(wave) || wave < FIRST_EVENT_WAVE || wave > MAX_WAVE) return null;
  const base = BASE[wave], before = wave > FIRST_EVENT_WAVE ? BASE[wave - 1] : null;
  const dice = u32Stream(waveSeed(Number.isFinite(Number(seed)) ? Math.trunc(Number(seed)) : 0, wave));
  if (dice() < SURPRISE_U32) {
    const pool = unlocked(wave).filter(item => item.id !== base && item.id !== before);
    if (pool.length) return weighted(pool, dice());
  }
  return base;
}
export const isEventId = value => typeof value === 'string' && EVENT_IDS.includes(value);

// The banner under the wave bar (the controller shows it when the wave starts) and the HUD chip.
export const EVENT_TEXT = Object.freeze({
  fog_bank: { title: 'Fog bank', line: 'Ships show up only close in and towers see 20% less. Watchtowers cut the fog near them.' },
  storm: { title: 'Storm', line: 'Faster ships, and the wind pushes the cannonballs off course.' },
  night_raid: { title: 'Night raid', line: 'Dark out there: towers see less, and far ships show only their lanterns.' },
  fire_ships: { title: 'Fire ships', line: 'Burning hulks ram the walls and blow up. Sink them early.' },
  pincer: { title: 'Pincer', line: 'Ships come from two sides at once.' },
  armada: { title: 'Armada', line: 'A swarm of fast small cutters.' },
  siege_barge: { title: 'Siege barge', line: 'A mortar ship shells your towers from far out. Hold the beach while it does.' },
  treasure_galleon: { title: 'Treasure galleon', line: 'A galleon full of gold sails past. Sink her before she gets away for bonus loot.' },
  smugglers: { title: 'Smugglers', line: 'Longboats land on the north beach, behind your walls.' },
  kraken: { title: 'Kraken', line: 'Tentacles rise next to the walls and smash them. Shoot them down.' },
});

// The numbers of every event, in one place. Times in seconds, distances in world units.
export const EVENTS = Object.freeze({
  fog_bank: Object.freeze({ sight: .8, clear: 16 }),                  // towers see 80%, near a watchtower 100%
  storm: Object.freeze({ speed: 1.2, accuracy: .8, drift: 2.4, scatter: 1, scatterDrift: 1.2 }),
  night_raid: Object.freeze({ sight: .65, heart: 10, fire: 4 }),         // sight 65%; lit: near the heart, near a fire, burning
  fire_ships: Object.freeze({ count: [1, 6], perWaves: 6, blast: 6, wallShare: .25, wallDamage: 35, island: 3 }),
  pincer: Object.freeze({ gap: 1.5 }),
  armada: Object.freeze({ count: 1.6, gap: .65 }),
  siege_barge: Object.freeze({ count: 1, twoFrom: 40, stop: 1.42, first: 2, every: 4.5, flight: 2.2, radius: 3, silence: 4, wallDamage: 20 }),
  treasure_galleon: Object.freeze({ at: 6, out: 1.9, near: 1.3, swing: 70 }),
  smugglers: Object.freeze({ count: [2, 4], perWaves: 25, bearing: 270, spread: 20, from: .35, every: 5 }),
  kraken: Object.freeze({ count: [3, 6], perWaves: 20, first: 10, every: 8, windup: 3, smashEvery: 4, smashes: 3, wallShare: .3, wallDamage: 10, reach: 7, island: 2 }),
});
// The event ships (the sim's CONFIG.ships has the fleet's): hp, speed and damage before the wave's curve.
export const EVENT_SHIPS = Object.freeze({
  fireship: Object.freeze({ hp: 26, speed: 2.2, damage: 0, interval: 2, crew: 0 }),
  cutter: Object.freeze({ hp: 16, speed: 3, damage: 2, interval: 1.4, crew: 1 }),
  barge: Object.freeze({ hp: 160, speed: .9, damage: 0, interval: 4.5, crew: 0 }),
  galleon: Object.freeze({ hp: 60, speed: 1.6, damage: 0, interval: 9, crew: 0 }),
  longboat: Object.freeze({ hp: 16, speed: 2.3, damage: 2, interval: 2, crew: 3 }),
  tentacle: Object.freeze({ hp: 40, speed: 0, damage: 0, interval: 4, crew: 0 }),
});
const countFor = ({ count: [low, high], perWaves }, wave) => Math.min(high, low + Math.floor(wave / perWaves));
const round2 = value => Math.round(value * 100) / 100;
const distance = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const NONE = Object.freeze({
  id: null, statsOf: () => undefined, crewOf: () => undefined, sightOf: () => 1, lit: () => false, speedOf: () => 1, aim: () => 1,
  drift: () => null, scatter: () => 0, kinds: kinds => kinds, gap: gap => gap, plan: () => null, bind: () => {}, shipTick: () => false,
  tick: () => {}, silenced: () => false, onSunk: () => {}, bonuses: () => [], state: () => null, extra: 0, gone: 0,
});

/**
 * The sim's hooks for one wave's event (or NONE without one). ctx: {seed, wave, curve, coastPoint, coast, heart,
 * stopRadius, spawnRadius, firstSpawn}. bind({ships, walls, towers, boarders, newShipId, damageShip, hitWall,
 * hurtIsland, now}) once the sim's lists exist. Every dice roll comes from the event's own stream, so the
 * fleet's and the cannons' rolls do not depend on it.
 */
export function createEventRules(id, ctx = {}) {
  if (!isEventId(id)) return NONE;
  const E = EVENTS[id], wave = ctx.wave ?? 1, curve = ctx.curve ?? { hp: 1, speed: 1, damage: 1 };
  const dice = u32Stream((waveSeed(Number(ctx.seed) || 0, wave) ^ 0x5f3759df) >>> 0), roll = () => dice() / TWO32;
  let sim = null, extra = 0, gone = 0;
  const bonuses = [];
  const at = (bearing, radius) => ctx.coastPoint(bearing * Math.PI / 180, radius, ctx.coast);
  // Storm: the wind's direction for the whole wave.
  const windAngle = id === 'storm' ? roll() * Math.PI * 2 : 0;
  const wind = { x: round2(Math.cos(windAngle)), z: round2(Math.sin(windAngle)) };
  // Siege barge: shells in the air; kraken: when the next tentacle rises and how many are left; galleon: its path.
  const barrage = [];
  let nextTentacle = id === 'kraken' ? E.first : Infinity, tentaclesLeft = id === 'kraken' ? countFor(E, wave) : 0;
  let galleon = null, pincerLanes = null;
  const watchtowers = [];

  const rules = {
    id,
    get extra() { return extra; },
    get gone() { return gone; },
    statsOf: kind => EVENT_SHIPS[kind],
    crewOf: kind => EVENT_SHIPS[kind]?.crew,
    // A tower's sight (× its range and the weather's fog): the fog bank and the night take a share.
    sightOf(tower, list = []) {
      if (id === 'night_raid') return E.sight;
      if (id !== 'fog_bank') return 1;
      return list.some(item => item.kind === 'watchtower' && distance(item.x, item.z, tower.x, tower.z) <= E.clear) ? 1 : E.sight;
    },
    // At night a target is seen at the full range when something lights it: near the heart, near a fire, or burning.
    lit(target, fires = []) {
      if (id !== 'night_raid') return false;
      if (distance(target.x, target.z, ctx.heart.x, ctx.heart.z) <= E.heart) return true;
      if (!target.boarder && target.maxHp > 0 && target.hp / target.maxHp < .5) return true;
      return fires.some(fire => distance(fire.x, fire.z, target.x, target.z) <= E.fire);
    },
    speedOf: () => (id === 'storm' ? E.speed : 1),
    aim: target => (id === 'storm' && !target.boarder ? E.accuracy : 1),
    drift: share => (id === 'storm' ? { x: wind.x * E.drift * share, z: wind.z * E.drift * share } : null),
    scatter: () => (id === 'storm' ? E.scatter : 0),
    // The fleet's ship kinds before the dice: fire ships take some sloops' places, the armada swaps brigs for cutters.
    kinds(kinds) {
      if (id === 'fire_ships') {
        const out = [...kinds];
        let left = countFor(E, wave);
        for (const kind of ['sloop', 'raider', 'brig', 'ironclad']) for (let i = 0; i < out.length && left > 0; i++) if (out[i] === kind) { out[i] = 'fireship'; left--; }
        return out;
      }
      if (id === 'armada') {
        const escorts = kinds.filter(kind => kind !== 'warship').length, total = Math.min(36, Math.round(escorts * E.count));
        return [...Array(total).fill('cutter'), ...kinds.filter(kind => kind === 'warship')];
      }
      return kinds;
    },
    gap: gap => (id === 'armada' ? gap * E.gap : gap),
    // The plan of the fleet ({kind, lane, at}), changed in place; returns the lanes the wave announces, or null.
    plan(plan, { lanes, laneCount, gap }) {
      if (id === 'pincer') {
        // Two opposite sides at once: east and west, or south and north, ships in pairs.
        const pair = roll() < .5 ? [0, 180] : [90, 270];
        pincerLanes = pair.map(bearing => {
          const a = bearing * Math.PI / 180, stop = at(bearing, ctx.stopRadius);
          return { id: `pincer_${bearing}`, a, stop, cover: 0 };
        });
        const escorts = plan.filter(entry => !entry.boss);
        escorts.forEach((entry, i) => { entry.lane = pincerLanes[i % 2]; entry.at = round2(ctx.firstSpawn + Math.floor(i / 2) * gap * E.gap); });
        plan.filter(entry => entry.boss).forEach((entry, i) => { entry.lane = pincerLanes[i % 2]; });
        return pincerLanes;
      }
      if (id === 'siege_barge') {
        const n = wave >= E.twoFrom ? 2 : E.count;
        for (let i = 0; i < n; i++) plan.push({ kind: 'barge', lane: lanes[(i + 1) % laneCount], at: round2(ctx.firstSpawn + gap * (2 + i * 4)), stop: E.stop });
      }
      if (id === 'treasure_galleon') {
        // She crosses the south (the camera's side) from one corner to the other, out of reach at both ends.
        const from = roll() < .5 ? 90 - E.swing : 90 + E.swing, to = 180 - from;
        const a = at(from, E.out), mid = at(90, E.near), b = at(to, E.out);
        galleon = { route: [a, mid, b] };
        plan.push({ kind: 'galleon', lane: { id: 'galleon', a: from * Math.PI / 180 }, at: E.at, fixed: true, a: from * Math.PI / 180,
          from: a, to: mid, route: [mid, b] });
      }
      if (id === 'smugglers') {
        const n = countFor(E, wave), north = { id: 'north', a: E.bearing * Math.PI / 180, stop: at(E.bearing, ctx.stopRadius), cover: 0 };
        const last = plan.reduce((most, entry) => Math.max(most, entry.at), ctx.firstSpawn);
        for (let i = 0; i < n; i++) plan.push({ kind: 'longboat', lane: north, at: round2(ctx.firstSpawn + (last - ctx.firstSpawn) * E.from + i * E.every), spread: E.spread });
      }
      return null;
    },
    bind(handles) {
      sim = handles;
      for (const tower of handles.defenses ?? []) if (tower.kind === 'watchtower') watchtowers.push(tower);
    },
    // One ship's tick before the fleet's own rules; true when the event moved it (the sim skips the rest).
    shipTick(ship, t, events) {
      if (!sim) return false;
      if (ship.kind === 'fireship' && ship.state === 'attacking') { burst(ship, events); return true; }
      if (ship.kind === 'galleon') return sailGalleon(ship, events);
      if (ship.kind === 'barge' && ship.state === 'attacking') { bombard(ship, t, events); return true; }
      if (ship.kind === 'tentacle') { flail(ship, t, events); return true; }
      return false;
    },
    // Once a tick, after the ships: the kraken rises, the barge's shells land.
    tick(t, events) {
      if (!sim) return;
      if (id === 'kraken' && tentaclesLeft > 0 && t + 1e-9 >= nextTentacle && sim.fleetOut()) { rise(t, events); nextTentacle = t + E.every; }
      for (let i = barrage.length - 1; i >= 0; i--) {
        const shell = barrage[i];
        if (shell.impactAt > t + 1e-9) continue;
        barrage.splice(i, 1);
        land(shell, t, events);
      }
    },
    // A tower hit by the barge is silenced for a few seconds (it does not reload).
    silenced: (tower, t) => tower.silencedUntil !== undefined && tower.silencedUntil > t + 1e-9,
    onSunk(ship, events) {
      if (ship.kind !== 'galleon') return;
      if (!bonuses.includes('galleon')) bonuses.push('galleon');
      events.push({ type: 'galleon_sunk', t: sim.now(), shipId: ship.id, x: round2(ship.x), z: round2(ship.z) });
    },
    bonuses: () => [...bonuses],
    state(t) {
      const out = { id };
      if (id === 'storm') out.wind = wind;
      if (id === 'fog_bank') out.clear = E.clear;
      if (id === 'pincer' && pincerLanes) out.lanes = pincerLanes.map(lane => ({ id: lane.id, x: round2(lane.stop.x), z: round2(lane.stop.z) }));
      if (id === 'treasure_galleon' && galleon) out.route = galleon.route.map(point => ({ x: round2(point.x), z: round2(point.z) }));
      if (id === 'siege_barge') out.shells = barrage.map(shell => ({ x: shell.x, z: shell.z, toX: shell.toX, toZ: shell.toZ, from: shell.from, impactAt: shell.impactAt }));
      if (id === 'siege_barge' && sim) out.silenced = sim.towers.filter(tower => rules.silenced(tower, t)).map(tower => tower.id);
      if (id === 'kraken') out.tentaclesLeft = tentaclesLeft;
      return out;
    },
  };

  // Fire ships: at their anchor they blow up; every standing wall within the blast takes a share of its hp.
  function burst(ship, events) {
    const hits = sim.walls.filter(wall => wall.hp > 0 && distance(wall.x, wall.z, ship.x, ship.z) <= E.blast);
    events.push({ type: 'fireship_burst', t: sim.now(), shipId: ship.id, x: round2(ship.x), z: round2(ship.z), radius: E.blast, walls: hits.map(wall => wall.id) });
    sim.remove(ship); gone++;
    for (const wall of hits) sim.hitWall(wall, round2(wall.maxHp * E.wallShare + E.wallDamage * curve.damage), events, { shipId: ship.id, fireship: true });
    if (!hits.length) sim.hurtIsland(round2(E.island * curve.damage), events, { shipId: ship.id, fireship: true });
  }
  // The galleon sails her route and is gone at its end.
  function sailGalleon(ship, events) {
    let move = ship.speed * sim.tick;
    while (move > 1e-9) {
      const step = Math.min(move, ship.left);
      ship.x += ship.dx * step; ship.z += ship.dz * step; ship.left -= step; move -= step;
      if (ship.left > 1e-9) break;
      const next = ship.route?.shift();
      if (!next) {
        events.push({ type: 'galleon_escaped', t: sim.now(), shipId: ship.id, x: round2(ship.x), z: round2(ship.z) });
        sim.remove(ship); gone++;
        return true;
      }
      const length = distance(ship.x, ship.z, next.x, next.z) || 1;
      ship.dx = (next.x - ship.x) / length; ship.dz = (next.z - ship.z) / length; ship.left = length; ship.to = next;
    }
    return true;
  }
  // The siege barge: at anchor far out, a shell at a tower every few seconds (the event's dice pick it).
  function bombard(ship, t, events) {
    if (ship.bombardAt === undefined) ship.bombardAt = t + E.first;
    if (ship.bombardAt > t + 1e-9) return;
    ship.bombardAt = round2(ship.bombardAt + E.every);
    const guns = sim.towers.length ? sim.towers : sim.walls.filter(wall => wall.hp > 0);
    if (!guns.length) return;
    const target = guns[Math.floor(roll() * guns.length)];
    const impactAt = round2(t + E.flight);
    barrage.push({ shipId: ship.id, x: round2(ship.x), z: round2(ship.z), toX: target.x, toZ: target.z, from: sim.now(), impactAt });
    events.push({ type: 'mortar_fired', t: sim.now(), towerId: ship.id, enemy: true, targetId: target.id, damage: 0, level: 1,
      x: round2(ship.x), z: round2(ship.z), toX: target.x, toZ: target.z, impactAt, radius: E.radius });
  }
  function land(shell, t, events) {
    const towers = sim.towers.filter(tower => distance(tower.x, tower.z, shell.toX, shell.toZ) <= E.radius);
    const walls = sim.walls.filter(wall => wall.hp > 0 && distance(wall.x, wall.z, shell.toX, shell.toZ) <= E.radius);
    events.push({ type: 'mortar_impact', t: sim.now(), towerId: shell.shipId, enemy: true, x: shell.toX, z: shell.toZ, radius: E.radius, hits: towers.length + walls.length });
    for (const tower of towers) {
      tower.silencedUntil = round2(t + E.silence);
      events.push({ type: 'tower_silenced', t: sim.now(), towerId: tower.id, until: tower.silencedUntil, x: tower.x, z: tower.z });
    }
    for (const wall of walls) sim.hitWall(wall, round2(E.wallDamage * curve.damage), events, { shipId: shell.shipId, barge: true });
  }
  // The kraken: a tentacle rises in the water next to a standing shore wall (else next to the shore of a lane).
  function rise(t, events) {
    tentaclesLeft--;
    const shore = sim.walls.filter(wall => wall.hp > 0 && !wall.inner);
    const target = shore.length ? shore[Math.floor(roll() * shore.length)] : null;
    const bearing = target ? Math.atan2(target.z, target.x) * 180 / Math.PI : [0, 90, 180][Math.floor(roll() * 3)];
    const p = at(bearing, 1.01), hp = Math.round(EVENT_SHIPS.tentacle.hp * curve.hp);
    const ship = { id: sim.newShipId(), kind: 'tentacle', boss: false, lane: 'kraken', x: p.x, z: p.z, hp, maxHp: hp, speed: 0, left: 0,
      damage: 0, dx: 0, dz: 0, to: p, a: bearing * Math.PI / 180, state: 'attacking', attackIn: 0, target: null, crew: 0, unloadIn: 0,
      wallId: target?.id ?? null, smashAt: round2(t + E.windup), smashes: 0 };
    sim.ships.push(ship); extra++;
    events.push({ type: 'ship_spawned', t: sim.now(), shipId: ship.id, kind: 'tentacle', boss: false, lane: 'kraken', hp, x: round2(p.x), z: round2(p.z),
      toX: round2(p.x), toZ: round2(p.z), crew: 0 });
    events.push({ type: 'kraken_rose', t: sim.now(), shipId: ship.id, wallId: ship.wallId, x: round2(p.x), z: round2(p.z) });
  }
  function flail(ship, t, events) {
    if (ship.smashAt > t + 1e-9) return;
    ship.smashAt = round2(ship.smashAt + E.smashEvery); ship.smashes++;
    const wall = sim.walls.find(item => item.id === ship.wallId && item.hp > 0)
      ?? sim.walls.filter(item => item.hp > 0 && distance(item.x, item.z, ship.x, ship.z) <= E.reach)
        .sort((a, b) => distance(a.x, a.z, ship.x, ship.z) - distance(b.x, b.z, ship.x, ship.z))[0];
    events.push({ type: 'kraken_smash', t: sim.now(), shipId: ship.id, wallId: wall?.id ?? null, x: round2(ship.x), z: round2(ship.z) });
    if (wall) sim.hitWall(wall, round2(wall.maxHp * E.wallShare + E.wallDamage * curve.damage), events, { shipId: ship.id, kraken: true });
    else sim.hurtIsland(round2(E.island * curve.damage), events, { shipId: ship.id, kraken: true });
    if (ship.smashes >= E.smashes && sim.ships.includes(ship)) {
      events.push({ type: 'kraken_dived', t: sim.now(), shipId: ship.id, x: round2(ship.x), z: round2(ship.z) });
      sim.remove(ship); gone++;
    }
  }
  return rules;
}
