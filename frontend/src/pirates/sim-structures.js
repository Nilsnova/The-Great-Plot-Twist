// The wave's walls and towers mending (sim.js): a rebuild, the engineer's boost, each tick's repairs (Bastion,
// Workshop, E repairs, the carpenters; only where free repairs are allowed), and recovery v1's server
// structure_repaired events and health vector. A closure over `sim` (sim-setup.js).

import { finite, round2 } from './sim-read.js';

export function createStructures(sim) {
  const { C, recoveryPolicy, freeStructureRepair, recoveryStructureState, crew, towers, W, walls, towerHealth,
    towerById, wallById, now } = sim;
  // A broken wall comes back at `share` of its hp: the rebuilder's rebuildShare (Master shipwright 60%),
  // the carpenter's CONFIG.wall.rebuild (40%).
  function rebuild(wall, by, events, share = C.wall.rebuild) {
    wall.hp = round2(Math.max(1, Math.round(wall.maxHp * share)));
    wall.rebuildAt = sim.ticks * C.tick; wall.rebuilding = 0; wall.repairLeft = 0; wall.mending = 0;
    events.push({ type: 'wall_rebuilt', t: now(), wallId: wall.id, hp: wall.hp, by, x: wall.x, z: wall.z });
  }

  // The engineer role (docs/GAME-V3.md "Captain tree and roles"): a wall they repair or rebuild gets +25% hp, once.
  function boostWall(wall, stats) {
    if (stats.wallHpMultiplier <= 1 || wall.boosted) return;
    wall.boosted = true; wall.maxHp = round2(wall.maxHp * stats.wallHpMultiplier);
  }
  // The walls and towers mend, the carpenters work (part of tick(), sim-tick.js).
  function repairStructures(t, events) {
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
  return { rebuild, boostWall, repairStructures, applyRecoveryEvent, recoveryHealthVector };
}
