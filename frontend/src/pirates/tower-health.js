// Tower health inside one wave (T33, specs/T33-tower-health.md, decision D049, proposed). Pure and
// deterministic, no DOM or Three.js: used by sim.js only when the wave carries the rule "tower_health"
// (the server's flag, on every client of the wave alike), and by render.js / interact.js to read a tower.
//
// A cannon, mortar, harpoon tower, culverin or swivel-gun nest gets hp by its level. Boarders on foot hack a tower in their reach
// (the T34 target order: captain, wall in the way, tower, heart). At 0 hp the tower is broken: it stops
// firing, cannot be fired by hand and is no longer jammed by gunboats. In the wave a captain repairs a
// damaged tower for free with E (like a wall: +10 hp a second for 3 s) and rebuilds a broken one at 40 %
// (60 % with Master shipwright) after a 5 s cooldown. A new wave starts every tower whole: lasting tower
// damage between waves is a follow-up (D049), unlike walls (D039).
//
//   towerMaxHp(kind, level)        the hp of a tower of that kind and level (0 for kinds without health)
//   towerLook(tower)               'intact', 'damaged' or 'broken' from its hp (intact without hp)
//   createTowerHealth({enabled, towers, now, tick})  the rules for one wave (inert while not enabled)
import { DEFENSES_V2 } from './defenses-v2.js';

const CANNON_HP = Object.freeze([80, 130, 200, 290, 400]);
export const TOWER_HEALTH = Object.freeze({
  // hp by level (index 0 = level 1); a harpoon is a light support tower, a cannon the sturdiest. The culverin
  // (T43, D048 proposed) is a glass cannon: hpShare (70%) of a same-level cannon's hp, rounded.
  hp: Object.freeze({
    cannon: CANNON_HP,
    mortar: Object.freeze([70, 115, 180, 260, 360]),
    harpoon: Object.freeze([60, 100, 155, 230, 320]),
    culverin: Object.freeze(CANNON_HP.map(hp => Math.round(hp * DEFENSES_V2.culverin.hpShare))),
    // The swivel-gun nest (D055) stands where the boarders walk, behind sandbags: 90% of a same-level cannon's hp.
    swivel: Object.freeze(CANNON_HP.map(hp => Math.round(hp * .9))),
  }),
  damagedShare: .5,      // at or below this share of its hp a tower shows its damaged drawing
  repairRate: 10,        // hp a second while an E repair runs (the repairer's skills scale it)
  repairSeconds: 3,      // one E press repairs for this long
  rebuildCooldown: 5,    // a tower cannot be rebuilt again sooner than this after its last rebuild
});

const round2 = value => Math.round(value * 100) / 100;

/** The hp of a tower of `kind` at `level` (1-5); 0 for a kind without health (watchtower, wall, house). */
export function towerMaxHp(kind, level) {
  const list = TOWER_HEALTH.hp[kind];
  if (!list) return 0;
  const n = Number.isInteger(level) ? Math.max(1, Math.min(list.length, level)) : 1;
  return list[n - 1];
}

/** How a tower looks: 'broken' at 0 hp, 'damaged' at or below half, else (and without hp) 'intact'. */
export function towerLook(tower) {
  if (!tower || !Number.isFinite(tower.hp) || !(tower.maxHp > 0)) return 'intact';
  if (tower.hp <= 0) return 'broken';
  return tower.hp / tower.maxHp <= TOWER_HEALTH.damagedShare ? 'damaged' : 'intact';
}

// The rules while the wave has no tower health: every tower fires, nothing is hurt or repaired.
const INERT = Object.freeze({
  enabled: false,
  canFire: () => true,
  isTarget: () => false,
  hit: () => false,
  repair: () => false,
  rebuild: () => false,
  tick: () => {},
  stateOf: () => ({}),
});

/**
 * The tower health of one wave. towers: the sim's tower objects (cannons, mortars, harpoons), which get
 * hp, maxHp and their repair fields here. now(): the wave time rounded for events; tick: seconds a tick.
 * hit(tower, damage, by, events) returns true when that blow broke the tower (once: a broken tower
 * takes no more blows), so the caller can let go of it.
 */
export function createTowerHealth({ enabled = false, towers = [], now = () => 0, tick = .05 } = {}) {
  if (!enabled) return INERT;
  const healthy = towers.filter(tower => towerMaxHp(tower.kind, tower.level) > 0);
  for (const tower of healthy) {
    tower.maxHp = towerMaxHp(tower.kind, tower.level); tower.hp = tower.maxHp;
    tower.repairLeft = 0; tower.repairRate = TOWER_HEALTH.repairRate; tower.rebuildAt = -Infinity;
  }
  const has = tower => tower?.maxHp > 0;

  function hit(tower, damage, by, events) {
    if (!has(tower) || tower.hp <= 0) return false;
    const taken = Math.min(tower.hp, round2(damage));
    tower.hp = round2(tower.hp - taken);
    const broken = tower.hp <= 0;
    if (broken) tower.repairLeft = 0;
    events.push({ type: 'tower_damaged', t: now(), towerId: tower.id, by, damage: taken, hp: tower.hp, maxHp: tower.maxHp,
      broken, x: tower.x, z: tower.z });
    if (broken) events.push({ type: 'tower_broken', t: now(), towerId: tower.id, by, x: tower.x, z: tower.z });
    return broken;
  }
  // E at a damaged tower: repair for repairSeconds at the repairer's rate (Shipwright: faster).
  function repair(tower, stats) {
    if (!has(tower) || tower.hp <= 0 || tower.hp >= tower.maxHp) return false;
    tower.repairLeft = TOWER_HEALTH.repairSeconds;
    tower.repairRate = round2(TOWER_HEALTH.repairRate * (stats?.repairMultiplier ?? 1));
    return true;
  }
  // E at a broken tower: it comes back at the rebuilder's share (40 %, Master shipwright 60 %).
  function rebuild(tower, stats, t, events) {
    if (!has(tower) || tower.hp > 0 || t - tower.rebuildAt < TOWER_HEALTH.rebuildCooldown - 1e-9) return false;
    tower.hp = round2(Math.max(1, Math.round(tower.maxHp * (stats?.rebuildShare ?? .4))));
    tower.rebuildAt = t; tower.repairLeft = 0;
    events.push({ type: 'tower_rebuilt', t: now(), towerId: tower.id, hp: tower.hp, by: 'player', x: tower.x, z: tower.z });
    return true;
  }
  // One tick of the repairs in progress.
  function step(t, events) {
    for (const tower of healthy) {
      if (tower.repairLeft <= 0) continue;
      tower.hp = round2(Math.min(tower.maxHp, tower.hp + tower.repairRate * tick));
      tower.repairLeft -= tick;
      if (tower.hp >= tower.maxHp || tower.repairLeft <= 1e-9) {
        tower.repairLeft = 0;
        events.push({ type: 'tower_repaired', t: now(), towerId: tower.id, hp: tower.hp, x: tower.x, z: tower.z });
      }
    }
  }
  function stateOf(tower, t) {
    if (!has(tower)) return {};
    return { hp: tower.hp, maxHp: tower.maxHp, broken: tower.hp <= 0, repairing: tower.repairLeft > 0,
      rebuildReady: tower.hp <= 0 && t - tower.rebuildAt >= TOWER_HEALTH.rebuildCooldown - 1e-9 };
  }
  return {
    enabled: true,
    canFire: tower => !has(tower) || tower.hp > 0,
    isTarget: tower => has(tower) && tower.hp > 0,
    hit, repair, rebuild, tick: step, stateOf,
  };
}
