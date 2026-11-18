// The pirate wave simulation (BUILD-PLAN 3.5). Pure and deterministic: a seeded random number
// generator, a fixed 50 ms tick and no Math.random, clock, DOM or Three.js, so every player on the
// same island who feeds the same inputs sees the same wave.
//
// Units are world units of the home_islet place (1 unit = 16 px), island-local: x to the east,
// +z towards the camera (south), the island centre at 0,0. The coast is the canonical ellipse of
// places/surfaces.js. Ships sail in on three sea lanes, stop just off the shore and attack the
// nearest standing wall, else the island. Cannons fire on their own at the nearest ship they can see.

//
// This file is the wave's entry point: createWave() (the inputs, step(), state(), result()) and the public
// exports. The parts live beside it, one job each, all one closure state shared as `sim` (sim-setup.js):
//   sim-config.js      CONFIG, every balance number
//   sim-read.js        the pure readers of the options (defenses, coast, lanes, heart, crew) and the dice
//   sim-fleet.js       the fleet of a wave before the dice (sizes, tiers, curves, threat, revive price)
//   sim-setup.js       createWave's start: towers, walls, houses, the event, the fleet plan, the counters
//   sim-weapons.js     damage to ships, boarders, walls and the heart; the towers' aim, shots and impacts
//   sim-structures.js  wall rebuilds and repairs, the carpenters; recovery v1's structure_repaired events
//   sim-captains.js    the captains (gun, cutlass, health, revive), the Tavern, and every input (applyInput)
//   sim-boarders.js    boarders (landing, targets, routes, steps) and the Barracks' militia and guards
//   sim-tick.js        one 50 ms tick, in its fixed order
// Determinism: tests/pirates/sim-fingerprint.test.js hashes every tick of 279 waves; any change to the order of
// iteration, dice or arithmetic shows there.

import { setupWave } from './sim-setup.js';
import { createWeapons } from './sim-weapons.js';
import { createStructures } from './sim-structures.js';
import { createCaptains } from './sim-captains.js';
import { createBoarders } from './sim-boarders.js';
import { createTick } from './sim-tick.js';
import { createShipFire } from './ship-fire.js';
import { finite, round2, coverageProfile } from './sim-read.js';

// The public API, unchanged: CONFIG and the pure helpers live in their own files now.
export { CONFIG } from './sim-config.js';
export { createRandom, coastPoint, skillOf, previewDefenseCoverage } from './sim-read.js';
export { crewFor, warshipsFor, revivePrice, houseRoles, hasTavern, tierShare, tierFor, fleetOf, threatOf, fleetSize,
  curveFor } from './sim-fleet.js';

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
  // The wave's state and parts, shared by the modules below as one object (sim-setup.js): its counters and flags
  // (sim.ticks, sim.islandHp and the like) and everything built at the start (the towers, the walls, the fleet plan, ...).
  const sim = setupWave(options);
  const { C, towerById, heart, waveNumber, fog, maxHp, boss, crew, happening, finisher, rescue, towers, cannons, sight, roles,
    walls, towerHealth, jammed, bosses, plan, ships, wrecks, balls, shells, captains, blades, boarders, fires, party,
    militia, now, flagshipAfloat, statsOf } = sim;
  function end(reason, events) {
    // T38: while the rescue runs it decides; once it is over end() comes again and the wave ends (still lost).
    if (rescue.active) return;
    if (rescue.offer(reason, events)) return; // island_lost / captains_fallen: the last chance first
    sim.done = true; sim.endReason = reason;
    events.push({ type: 'wave_ended', t: now(), reason, ...result() });
  }

  function result() {
    const survived = sim.islandHp > 0 && !(sim.endReason === 'timeout' && flagshipAfloat()) && sim.endReason !== null && sim.endReason !== 'captains_fallen';
    const bonuses = [...happening.bonuses(), ...finisher.bonuses()]; // v3 waves: the galleon, a won finisher (server-checked)
    return { survived, shipsSunk: sim.sunk, boardersKilled: sim.killed, islandHp: sim.islandHp, time: now(), ...(bonuses.length ? { bonuses } : {}), ...rescue.result() };
  }
  Object.assign(sim, { end, result });
  // The wave's parts, each a closure over `sim`, in the order they use each other (each one adds its functions).
  Object.assign(sim, createWeapons(sim));
  const { damageShip, hitWall, hurtIsland, fire, slowedUntil, litSight } = sim;
  Object.assign(sim, createStructures(sim));
  const { applyRecoveryEvent, recoveryHealthVector } = sim;
  Object.assign(sim, createCaptains(sim));
  const { presentAt, woundCaptain } = sim;
  Object.assign(sim, createBoarders(sim));
  const removeShip = ship => { const at = ships.indexOf(ship); if (at >= 0) ships.splice(at, 1); };
  happening.bind({ ships, walls, towers, tick: C.tick, now: () => now(), newShipId: () => `ship_${sim.nextShipId++}`, remove: removeShip, hitWall, hurtIsland });
  finisher.bind({ party, ships, presentAt: (hero, t) => presentAt(hero, t), damageShip, now: () => now() });
  // T50: the ship fire of the wave rule ship_fire (inert without it). No dice.
  const shipFire = createShipFire({ enabled: options?.shipFire === true, walls, towers, towerHealth, heart, wallReach: C.wall.reach,
    hitWall, hurtIsland, hurtCaptain: (hero, damage, shipId, events) => woundCaptain(hero, damage, { shipId }, events),
    captains: () => { const t = sim.ticks * C.tick; return [...party.values()].filter(hero => !hero.down && presentAt(hero, t)); }, now: () => now(),
    powerOf: ship => statsOf(ship.kind)?.damage ?? ship.damage });
  rescue.bind({ party, presentAt: (hero, t) => presentAt(hero, t), now: () => now(), heart });
  sim.shipFire = shipFire;
  const { tick } = createTick(sim);

  return {
    applyRecoveryEvent,
    recoveryHealthVector,
    // Raw sight and reload from this wave's frozen defenses. `litRange` is only available to lit targets at night.
    attackCoverage(id) {
      const tower = towerById.get(id);
      if (sim.done || !tower) return null;
      const t = sim.ticks * C.tick;
      let status = 'ready';
      if (!towerHealth.canFire(tower)) status = 'destroyed';
      else if (jammed(tower, t)) status = 'jammed';
      else if (happening.silenced(tower, t)) status = 'silenced';
      return { ...coverageProfile(tower, tower.sight),
        litRange: happening.id === 'night_raid' ? litSight(tower) : null, status, reload: tower.reload };
    },
    step(dt, inputs = []) {
      const events = [];
      if (sim.done) return events;
      if (Array.isArray(inputs)) for (const input of inputs) sim.queued.push(input);
      sim.rest += finite(dt) && dt > 0 ? Math.min(dt, C.maxStep) : 0;
      while (sim.rest + 1e-9 >= C.tick && !sim.done) { sim.rest -= C.tick; tick(events); }
      return events;
    },
    state() {
      const t = sim.ticks * C.tick;
      return {
        time: now(), wave: waveNumber, boss, warships: bosses, phase: sim.started === true ? (sim.done ? 'ended' : 'running') : 'countdown',
        ships: ships.map(ship => ({ id: ship.id, kind: ship.kind, lane: ship.lane, x: round2(ship.x), z: round2(ship.z),
          hp: ship.hp, maxHp: ship.maxHp, state: ship.state, crew: ship.crew, ...(ship.boss ? { boss: true } : {}),
          ...(ship.kind === 'flagship' ? { exposed: sim.lampsLit } : {}), ...(slowedUntil(ship) > t + 1e-9 ? { slowed: true } : {}) })),
        boarders: boarders.map(item => ({ id: item.id, ...(item.brute ? { brute: true } : {}), x: round2(item.x), z: round2(item.z), hp: item.hp, maxHp: item.maxHp,
          state: item.state, wallId: item.wallId, facing: item.facing, foe: item.foe ?? null, ...(item.towerId ? { towerId: item.towerId } : {}) })),
        // Captain health (GAME-V3.md §3), by id: present is false for a captain who is away or not heard lately.
        party: [...party.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map(hero => ({ id: hero.id,
          x: round2(hero.x), z: round2(hero.z), hp: hero.hp, maxHp: hero.maxHp, down: hero.down, downAt: hero.downAt,
          colour: hero.colour, present: presentAt(hero, t) })),
        // The house roles (GAME-V3.md "Houses"): the Barracks' militia in the wave, and the houses that act.
        militia: militia.map(unit => ({ id: unit.id, houseId: unit.houseId, ...(unit.guard ? { guard: true } : {}), x: unit.x, z: unit.z, hp: unit.hp, maxHp: unit.maxHp,
          state: unit.state, foe: unit.foe, facing: unit.facing, level: unit.level })),
        militiaFell: sim.militiaFell, houses: roles.map(item => ({ ...item })),
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
        islandHp: sim.islandHp, maxIslandHp: maxHp, sunk: sim.sunk, shipsLeft: plan.length + happening.extra - sim.sunk - happening.gone, total: plan.length, lampsLit: sim.lampsLit, fog, sight: round2(sight),
        boardersLeft: boarders.length, boardersKilled: sim.killed, boardersLanded: sim.landed,
        // v3 waves: the event's state (wind, lanes, the barge's shells…) and the finisher's, both null without one.
        event: happening.id ? happening.state(t) : null, finisher: finisher.state() ?? rescue.state(),
      };
    },
    get done() { return sim.done; },
    // Why the wave ended: all_sunk, timeout, island_lost or captains_fallen (null while it runs).
    get endReason() { return sim.endReason; },
    result,
  };
}
