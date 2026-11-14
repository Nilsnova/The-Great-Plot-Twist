// Your captain's numbers in one pure place (docs/TOWER-DEFENSE.md §10, §14 skills, §15 weapons): the
// musket level table (CONFIG.captain in sim.js), the skills the player learnt and the weapon they carry.
// Every client computes the same numbers from the same inputs, so a synced shot or repair lands the
// same everywhere: the sim (damage, hits, repairs), the controller (range, reload, aim) and the island
// cards (the skill tree and the weapon shop) all ask this file. No DOM, no clock, no randomness.
//
//   captainStats(level, skills, weapon) -> {weapon, mode, damage, range, reload, ...}
//   readSkills(list)  -> the known skill ids of a list, in tree order (anything else dropped)
//   readWeapon(id)    -> a known weapon id, else 'musket'
//
// The strike, sweep and rebuild fields are for the cutlass and wall rebuild of another branch: the
// integrator wires them (strike damage × strikeMultiplier, its reload × strikeReloadMultiplier, sweep
// hits every other boarder within sweepRadius for sweepShare of the damage, a rebuilt wall gets
// rebuildShare of its full hp).
import { CONFIG } from './sim.js';
import { REACH } from './interact.js';
import { DEFAULT_WEAPON, WEAPON_BY_ID, readSkills, readWeapon, roleOf } from './captain-ids.js';

export * from './captain-ids.js';

const round2 = value => Math.round(value * 100) / 100;

// The room sends at most one wave message every 200 ms (net/live-rules.js WAVE_GAP_MS): no gun is faster.
export const MIN_RELOAD = .3;
export const MIN_RANGE = 6;
export const STRIKE = Object.freeze({ cutlass: 1.5, secondWind: .7, sweepRadius: 2, sweepShare: .5, heavyBlade: 1.25, bruiser: 1.3 });
export const REPAIR = Object.freeze({ quickFix: 1.5, master: 2, longReach: 2, rebuild: .4, masterRebuild: .6,
  swiftHammer: 1.25, wideArc: 2, planksRebuild: .55, grandRebuild: .8 });
export const MARKSMAN = Object.freeze({ steadyAim: 1.25, longBarrel: 3, quickHands: .75, hotShot: 1.15, farSight: 4,
  heavyShot: 1.2, deadEye: 1.3, deadEyeRange: 2, snapShot: .85 });
// docs/GAME-V3.md "Captain tree and roles": what a role does. Medic: help-up hold in seconds and the share of hp a
// revived captain stands with; Engineer: walls get more hp (the server also takes 10% off building prices);
// Gunner: the gun's damage and reload.
export const ROLE_EFFECTS = Object.freeze({
  medic: Object.freeze({ reviveHold: 1.2, reviveShare: .75, surgeonShare: 1 }),
  engineer: Object.freeze({ wallHp: 1.25 }),
  gunner: Object.freeze({ damage: 1.2, reload: .85 }),
});

/**
 * Everything your captain does, from the musket level (1-5), the learnt skills (and the role, one more id in the
 * list) and the equipped weapon. Bad input falls back to level 1, no skills and the musket, so a junk message never
 * crashes a client.
 */
export function captainStats(level = 1, skills = [], weapon = DEFAULT_WEAPON) {
  const levels = CONFIG.captain.levels, lvl = Number.isInteger(level) ? Math.min(levels.length, Math.max(1, level)) : 1;
  const list = readSkills(skills), base = levels[lvl - 1], known = new Set(list), gun = WEAPON_BY_ID[readWeapon(weapon)];
  const has = id => known.has(id), role = roleOf(list), R = CONFIG.health.revive;
  const times = (...pairs) => pairs.reduce((product, [id, factor]) => product * (has(id) ? factor : 1), 1);
  const damage = round2(base.damage * gun.damage * times(['steady_aim', MARKSMAN.steadyAim], ['hot_shot', MARKSMAN.hotShot],
    ['heavy_shot', MARKSMAN.heavyShot], ['dead_eye', MARKSMAN.deadEye], ['gunner', ROLE_EFFECTS.gunner.damage]));
  const range = round2(Math.max(MIN_RANGE, base.range + gun.range) + (has('long_barrel') ? MARKSMAN.longBarrel : 0)
    + (has('far_sight') ? MARKSMAN.farSight : 0) + (has('dead_eye') ? MARKSMAN.deadEyeRange : 0));
  const reload = round2(Math.max(MIN_RELOAD, base.reload * gun.reload * times(['quick_hands', MARKSMAN.quickHands],
    ['snap_shot', MARKSMAN.snapShot], ['gunner', ROLE_EFFECTS.gunner.reload])));
  const repairMultiplier = round2((has('master_shipwright') ? REPAIR.master : has('quick_fix') ? REPAIR.quickFix : 1)
    * (has('swift_hammer') ? REPAIR.swiftHammer : 1));
  return {
    level: lvl, weapon: gun.id, name: gun.name, mode: gun.mode, damage, range, reload, shotSpeed: CONFIG.captain.shotSpeed,
    targets: gun.targets ?? 1, cone: gun.cone ?? 0, pierceDepth: gun.pierceDepth ?? 0, pierceWidth: gun.pierceWidth ?? 0,
    radius: gun.radius ?? 0, flight: gun.flight ?? 0, flightPerUnit: gun.flightPerUnit ?? 0,
    // The cutlass of the boarding branch (wired by the integrator).
    strikeMultiplier: round2(times(['cutlass', STRIKE.cutlass], ['heavy_blade', STRIKE.heavyBlade], ['bruiser', STRIKE.bruiser])),
    strikeReloadMultiplier: has('second_wind') ? STRIKE.secondWind : 1,
    sweep: has('sweep'), sweepRadius: STRIKE.sweepRadius, sweepShare: STRIKE.sweepShare,
    // Walls: your repairs (sim.js), how far you reach a wall (interact.js), a rebuild's share of hp.
    repairMultiplier, repairReach: round2(REACH + (has('long_reach') ? REPAIR.longReach : 0) + (has('wide_arc') ? REPAIR.wideArc : 0)),
    rebuildShare: has('grand_engineer') ? REPAIR.grandRebuild : has('master_shipwright') ? REPAIR.masterRebuild
      : has('sturdy_planks') ? REPAIR.planksRebuild : REPAIR.rebuild,
    // Roles: the medic's help-up (hold seconds, hp share of the one helped up) and the engineer's wall hp.
    role, reviveHold: role === 'medic' ? ROLE_EFFECTS.medic.reviveHold : R.hold,
    reviveShare: has('field_surgeon') ? ROLE_EFFECTS.medic.surgeonShare : role === 'medic' ? ROLE_EFFECTS.medic.reviveShare : R.share,
    wallHpMultiplier: role === 'engineer' ? ROLE_EFFECTS.engineer.wallHp : 1,
  };
}
