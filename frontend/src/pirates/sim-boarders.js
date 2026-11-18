// The wave's boarders (sim.js): what each goes for (a captain, a wall, a tower, the heart: pickBoarderTarget),
// how it lands, walks (fixed routes, or the grid of boarder-paths.js with the rule pathing), hacks and fights,
// and the Barracks' militia and hired guards who fight them. A closure over `sim` (sim-setup.js).

import { round2, distance, coastPoint, angleGap } from './sim-read.js';
import { TARGET_PROFILES, nearestWithin } from './targeting.js';
import { BODY, edgeDistance, obstacleInWay, wallInWay } from './boarder-paths.js';
import { towerApproachPoint, towerEdgeDistance } from './tower-obstacles.js';

export function createBoarders(sim) {
  const { C, B, crowd, heart, curve, coast, towers, HO, walls, towerHealth, towerById, wallById, wallsInOrder,
    blockingObjects, towerBlocking, paths, tier, boarders, H, party, militia, militiaById, now, damageBoarder,
    toHeart, presentAt, hurtCaptain } = sim;
  // The captain a boarder goes for: the one it is on while they stand within the leash, else the nearest
  // standing captain within reach (ties: the lower id), else none. O(captains) per boarder.
  // A Barracks militia counts as a captain here (the same reach, leash and crowd), so boarders fight it too.
  function foeOf(boarder) {
    if (!party.size && !militia.length) return null;
    const t = sim.ticks * C.tick;
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
    const brute = every > 0 && sim.nextBoarderId % every === 0;
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
    const boarder = { id: `boarder_${sim.nextBoarderId++}`, boarder: true, shipId: ship.id, x: start.x, z: start.z, vx: 0, vz: 0,
      hp, maxHp: hp, speed: round2(B.speed * curve.speed * (brute ? T.speed : 1)), hack: round2(B.hack * curve.damage * (brute ? T.hack : 1)),
      damage: round2(B.heartDamage * curve.damage * (brute ? T.heart : 1)),
      route, leg: 0, goal: null, side, state: 'walking', wallId: null, hackIn: 0, facing: landing.x < ship.x ? -1 : 1, ...(brute ? { brute: true } : {}) };
    boarders.push(boarder); sim.landed++;
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
  return { landBoarder, moveBoarder, moveMilitia };
}
