// The wave's captains (sim.js): the gun and the cutlass (with recovery waves' rewind to what the shooter saw),
// captain health (join, fall, revive, the Tavern's heal, the militia taking blows), and applyInput, where every
// input of step() lands. A closure over `sim` (sim-setup.js).

import { finite, clamp, round2, distance } from './sim-read.js';
import { readSkills } from './captain-stats.js';

export function createCaptains(sim) {
  const { C, recoveryPolicy, REWIND_TICKS, seenAt, freeStructureRepair, captainStatsFor, withFlagship, curve,
    finisher, rescue, HO, taverns, housesNear, cannonById, towerHealth, towerById, wallById, jammed, ships, balls,
    shells, captains, blades, boarders, H, party, militia, militiaById, now, damageBoarder, findTarget, targetKey,
    fire, visible, rebuild, boostWall, applyRecoveryEvent, canonicalCaptains } = sim;
  const captainBy = input => (typeof input.by === 'string' && /^[A-Za-z0-9_.:-]{1,64}$/.test(input.by) ? input.by : null);
  const captainLevel = input => (Number.isInteger(input.level) ? clamp(input.level, 1, C.captain.levels.length) : 1);

  // The captain's gun (§10, §14, §15): the shooter's own level, skills and weapon decide the numbers
  // (captain-stats.js), so every client resolves the same hits. targetId names the ship (single and
  // pierce shots); ax, az is the aim point (the cone's direction, the bomb's landing spot).
  function captainShot(input, events) {
    const by = captainBy(input);
    if (!by || !finite(input.x) || !finite(input.z) || !standing(by, input)) return;
    const level = captainLevel(input), skills = readSkills(input.skills), stats = captainStatsFor(level, skills, input.weapon), t = sim.ticks * C.tick;
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
    seenAt.set(sim.ticks, at);
    for (const key of seenAt.keys()) if (key < sim.ticks - REWIND_TICKS) seenAt.delete(key);
  }
  function seenPlace(input, target) {
    if (recoveryPolicy !== 'structure-recovery-v1' || !Number.isInteger(input.seen) || input.seen > sim.ticks
      || input.seen < sim.ticks - REWIND_TICKS) return target;
    return seenAt.get(input.seen)?.get(target.id) ?? target;
  }
  function captainStrike(input, events) {
    const by = captainBy(input);
    if (!by || !finite(input.x) || !finite(input.z) || !standing(by, input)) return;
    const level = captainLevel(input), stats = captainStatsFor(level, readSkills(input.skills));
    const blade = C.captain.cutlass, reach = stats.sweepRadius + blade.slack, t = sim.ticks * C.tick;
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
  const presentAt = (hero, t) => !hero.away && (canonicalCaptains ? !hero.withdrawn : t - hero.seen <= H.stale + 1e-9);
  function standing(by, input) {
    const hero = party.get(by);
    if (!hero) return !canonicalCaptains; // Legacy waves retain their original first-move admission.
    if(hero.withdrawn)return false;
    if (hero.down) return false;
    hero.seen = sim.ticks * C.tick; hero.away = false; hero.x = input.x; hero.z = input.z;
    return true;
  }
  function captainMove(input, events) {
    const by = captainBy(input);
    if (!by || !finite(input.x) || !finite(input.z)) return;
    const t = sim.ticks * C.tick;
    let hero = party.get(by);
    if(canonicalCaptains && (!hero || hero.withdrawn || Object.hasOwn(input,'away')))return;
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
    if(canonicalCaptains)return; // Native revival is a server journal restore fact.
    const by = captainBy(input), R = H.revive;
    if (!by || !finite(input.x) || !finite(input.z) || typeof input.targetId !== 'string') return;
    const helper = party.get(by), hero = party.get(input.targetId);
    if (!helper || helper.down || !hero || hero === helper || !hero.down) return;
    // A delayed paid event belongs to exactly one fall; it cannot revive a later fall.
    if (input.downAt !== undefined && input.downAt !== Math.round(hero.downAt / C.tick)) return;
    if (distance(input.x, input.z, hero.x, hero.z) > R.reach + R.slack) return;
    helper.seen = sim.ticks * C.tick; helper.away = false; helper.x = input.x; helper.z = input.z;
    hero.down = false; hero.downAt = null; hero.hp = Math.max(1, Math.round(hero.maxHp * captainStatsFor(1, input.skills).reviveShare)); // a medic's help-up gives more hp (captain-stats.js)
    events.push({ type: 'captain_revived', t: now(), captainId: hero.id, by, hp: hero.hp, x: round2(hero.x), z: round2(hero.z) });
  }
  // A boarder's blow at a militia fighter (the Barracks): at 0 hp it falls, and every boarder on it walks on.
  function hurtMilitia(unit, boarder, events) {
    const damage = Math.min(unit.hp, round2(H.damage * curve.damage));
    unit.hp = round2(unit.hp - damage);
    events.push({ type: 'militia_hit', t: now(), militiaId: unit.id, boarderId: boarder.id, damage, hp: unit.hp, x: round2(unit.x), z: round2(unit.z) });
    if (unit.hp > 0) return;
    militia.splice(militia.indexOf(unit), 1); militiaById.delete(unit.id); sim.militiaFell++;
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


  function applyInput(input, events) {
    if (!input || typeof input !== 'object' || typeof input.type !== 'string') return;
    // v3 waves: while a finisher runs the battle stands still: only positions and the finisher's own input count.
    if (input.type === 'finisher_input' || input.type === 'finisher_ready') { finisher.input(input); rescue.input(input); return; }
    if (input.type === 'structure_repaired') { applyRecoveryEvent(input.event); return; }
    if(input.type==='captain_withdrawn' && canonicalCaptains){
      const hero=party.get(input.by);if(hero && !hero.withdrawn){hero.withdrawn=true;hero.away=true;}
      return;
    }
    if ((finisher.active || rescue.active) && input.type !== 'captain_move') return;
    if (input.type === 'fire') {
      const cannon = typeof input.cannonId === 'string' ? cannonById.get(input.cannonId) : undefined;
      const target = findTarget(input.targetId);
      if (!cannon || !target || !visible(cannon, target) || jammed(cannon, sim.ticks * C.tick)) return; // a jammed cannon cannot be fired by hand either
      if (!towerHealth.canFire(cannon)) return; // T33: nor a broken one
      if (sim.ticks * C.tick - cannon.lastShot < C.cannon.manualCooldown) return;
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
      if (!wall && towerHealth.enabled) { towerHealth.rebuild(towerById.get(input.wallId), captainStatsFor(1, input.skills), sim.ticks * C.tick, events); return; }
      if (!wall || wall.hp > 0 || sim.ticks * C.tick - wall.rebuildAt < wall.cooldown - 1e-9) return;
      // The rebuilder's own skills: Master shipwright brings the wall back at 60% instead of 40%.
      const stats = captainStatsFor(1, input.skills);
      boostWall(wall, stats);
      rebuild(wall, 'player', events, stats.rebuildShare);
    } else if (input.type === 'lamps_lit') {
      if (!withFlagship || sim.lampsLit) return;
      sim.lampsLit = true; // the beam strikes the flagship on the next tick, or as soon as it appears
    } else if (input.type === 'captain_shot') captainShot(input, events);
    else if (input.type === 'captain_strike') captainStrike(input, events);
    else if (input.type === 'captain_move') captainMove(input, events);
    else if (input.type === 'captain_revive') captainRevive(input, events);
  }
  return { recordSeen, presentAt, hurtCaptain, woundCaptain, allFallen, tavernHeal, applyInput };
}
