// One 50 ms tick of the wave (sim.js), in its fixed order: the countdown and the start, the inputs, the rescue and
// finisher pauses, the lookout's warnings, spawns, ships, ship fire, the event, boarders, militia, the Tavern, the
// shots landing, the towers, the repairs, the end. Every client runs this order, so it must not change.
// A closure over `sim` (sim-setup.js).

import { round2, distance } from './sim-read.js';
import { crewFor } from './sim-fleet.js';

export function createTick(sim) {
  const { C, B, heart, waveNumber, fog, countdown, withFlagship, boss, crew, curve, happening, finisher, rescue, S,
    warnLead, sight, HO, barracks, taverns, walls, paths, lanes, laneCount, bosses, tier, plan, eventLanes, ships,
    boarders, party, militia, militiaById, now, statsOf, end, damageShip, gunboatFire, landShots, fireTowers,
    repairStructures, recordSeen, allFallen, tavernHeal, applyInput, landBoarder, moveBoarder, moveMilitia, shipFire } = sim;
  function tick(events) {
    if (sim.started === false) {
      const left = Math.ceil(countdown - sim.ticks * C.tick - 1e-9);
      if (left !== sim.lastCountdown && left > 0) { sim.lastCountdown = left; events.push({ type: 'wave_countdown', t: now(), secondsLeft: left }); }
      sim.ticks++;
      if (sim.ticks * C.tick + 1e-9 >= countdown) { sim.ticks = 0; sim.started = null; }
      return;
    }
    if (sim.started === null) {
      sim.started = true;
      events.push({ type: 'wave_started', t: 0, wave: waveNumber, ships: plan.length, flagship: withFlagship, boss, warships: bosses,
        ...(tier.final && !withFlagship ? { final: true } : {}), ...(happening.id ? { event: happening.id } : {}),
        fog, sight: round2(sight), heart: { x: heart.x, z: heart.z },
        lanes: (eventLanes ?? lanes.slice(0, laneCount)).map(lane => ({ id: lane.id, x: round2(lane.stop.x), z: round2(lane.stop.z) })) });
      if (happening.id) events.push({ type: 'wave_event', t: 0, event: happening.id, wave: waveNumber });
      // The Barracks' militia walk out of their doors (CONFIG.houses.barracks), the same on every screen.
      const G = HO.barracks;
      for (const house of barracks) for (let k = 0; k < G.units[house.level - 1] && militia.length < G.max; k++) {
        const id = `militia_${militia.length + 1}`, hp = Math.round(G.hp[house.level - 1] * curve.hp);
        const unit = { id, militia: true, houseId: house.id, homeX: round2(house.x + (k ? .9 : 0) - (G.units[house.level - 1] > 1 ? .45 : 0)),
          homeZ: round2(house.z + G.door), x: house.x, z: round2(house.z + .6), hp, maxHp: hp, damage: round2(G.damage[house.level - 1] * curve.hp),
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
    for (const input of sim.queued) applyInput(input, events);
    sim.queued = [];
    if (sim.done) return;
    // T38: a running rescue freezes the battle too; when it is over the lost wave ends.
    if (rescue.active) { if (!rescue.tick(events)) end(rescue.reason, events); return; }
    // v3 waves: a running finisher freezes the battle (its own clock runs; the battle's ticks stand still).
    if (finisher.tick(events)) return;
    sim.ticks++;
    const t = sim.ticks * C.tick;
    // The lookout calls the ships out before they appear.
    while (warnLead > 0 && sim.nextWarn < plan.length && plan[sim.nextWarn].at - warnLead <= t + 1e-9) {
      const entry = plan[sim.nextWarn++];
      events.push({ type: 'ship_warning', t: now(), kind: entry.kind, boss: entry.boss === true, lane: entry.lane.id,
        x: round2(entry.from.x), z: round2(entry.from.z), at: round2(entry.at) });
    }
    while (sim.nextSpawn < plan.length && plan[sim.nextSpawn].at <= t + 1e-9) {
      const entry = plan[sim.nextSpawn++], stats = statsOf(entry.kind);
      const length = distance(entry.from.x, entry.from.z, entry.to.x, entry.to.z);
      const hp = entry.kind === 'flagship' ? stats.hp : Math.round(stats.hp * curve.hp * (entry.boss && entry.kind === 'warship' ? tier.bossHp : 1));
      const ship = { id: `ship_${sim.nextShipId++}`, kind: entry.kind, boss: entry.boss === true, lane: entry.lane.id, x: entry.from.x, z: entry.from.z,
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
      if (happening.shipTick(ship, t, events)) { if (sim.done) return; continue; } // v3 waves: fire ships, the galleon, the barge, the kraken
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
              const damage = Math.min(sim.islandHp, round2(ship.damage * B.shellShare));
              sim.islandHp = round2(sim.islandHp - damage);
              events.push({ type: 'island_damaged', t: now(), shipId: ship.id, damage, hp: sim.islandHp, x: round2(ship.x), z: round2(ship.z) });
              if (sim.islandHp <= 0) { end('island_lost', events); return; }
            }
          }
        }
      }
      if (ship.kind === 'flagship' && sim.lampsLit) {
        if (ship.beamAt === undefined) {
          ship.beamAt = t + C.flagship.beamEvery;
          damageShip(ship, ship.maxHp * C.flagship.beamShare, 'lamps', events, { source: 'lamps' });
        } else if (ship.beamAt <= t + 1e-9) {
          ship.beamAt += C.flagship.beamEvery;
          damageShip(ship, C.flagship.beamBurn, 'lamps', events, { source: 'lamps' });
        }
      }
    }
    shipFire.land(t, events, () => sim.done); // T50: the ships' balls land (the heart at 0 ♥ ends the wave)
    if (sim.done) return;
    happening.tick(t, events); // v3 waves: the kraken rises, the barge's shells land
    if (sim.done) return;
    if (paths) paths.refresh(); // T35: the layout from the walls' hp now; the field is rebuilt only when it changed
    for (const boarder of [...boarders]) {
      if (!moveBoarder(boarder, events)) continue;
      // At the heart: the island is hurt and the boarder is gone.
      boarders.splice(boarders.indexOf(boarder), 1);
      const damage = Math.min(sim.islandHp, boarder.damage);
      sim.islandHp = round2(sim.islandHp - damage);
      events.push({ type: 'island_damaged', t: now(), boarderId: boarder.id, damage, hp: sim.islandHp, x: round2(boarder.x), z: round2(boarder.z) });
      if (sim.islandHp <= 0) { end('island_lost', events); return; }
    }
    for (const unit of [...militia]) moveMilitia(unit, events);
    if (taverns.length) tavernHeal(t, events);
    if (party.size && allFallen(t)) { end('captains_fallen', events); return; }
    landShots(t, events);
    fireTowers(t, events);
    repairStructures(t, events);
    finisher.begin(events); // v3 waves: a boss held for its finisher: the next ticks run the finisher
    if (sim.nextSpawn >= plan.length && ships.length === 0 && boarders.length === 0 && !happening.busy() && !finisher.pending) end('all_sunk', events);
    else if (t + 1e-9 >= C.maxTime) end('timeout', events);
  }
  return { tick };
}
