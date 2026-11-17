// Ship fire at real targets (T50, the owner's play-test of 16 Nov: "the boats are shooting at something that
// doesn't really exist"). Pure and deterministic, no DOM or Three.js, no dice (the fleet's random stream is
// untouched): used by sim.js only when the wave carries the rule "ship_fire" (the server's flag of that name,
// the same on every client of the wave). Without the rule a ship at anchor shells the nearest wall in reach, else
// "the island" at a share of 1.5 %, drawn as a ball onto the beach in front of it, where the landing ring is.
//
// With the rule an anchored ship aims, every `interval` of its kind, at a real target by the T34 order for ships
// (TARGET_PROFILES.ship in targeting.js): the nearest standing wall within its reach (CONFIG.wall.reach, the walls
// on its beach, as before), else the nearest standing tower within `towerReach` (only towers with hp, the rule
// "tower_health"), else the island's heart within `heartReach`. With none in range it holds its fire. The ball flies
// (`shotSpeed`) and lands at `impactAt`: a wall takes the ship's damage, a tower `tower` × the kind's own damage
// (tower-health.js), the heart `heart` × it off its ♥, each × `hitScale`; a target that broke meanwhile takes nothing (the ball lands
// in the rubble). Captains within `splash.radius` of the impact take `splash.share` × it (a little, never a blow).
//
//   SHIP_FIRE                                 the numbers
//   createShipFire({enabled, ...})            the rules for one wave (inert while not enabled)
import { TARGET_PROFILES, nearestWithin } from './targeting.js';

export const SHIP_FIRE = Object.freeze({
  // How far an anchored ship shoots (TARGET_PROFILES.ship): a tower by its beach (the one or two tower spots nearest
  // each sea lane, not the far corners), and the heart (0, 2) from every sea lane (the anchors stand 20 to 24 units
  // off it, a boss a little farther, so a boss off a bulge of the coast may be out of reach).
  towerReach: TARGET_PROFILES.ship.towerReach,
  heartReach: TARGET_PROFILES.ship.heartReach,
  shotSpeed: 24,     // units a second (a flat, quick ball; about a second to the heart)
  // A wall takes the ship's damage (as before the rule, with the wave's damage curve). A tower, the heart and the
  // captains next to an impact take a share of the kind's own damage (CONFIG.ships, no wave curve), so the late
  // fleets press by their numbers, not by ever harder balls: a sloop's 3, a brig's 6, a dreadnought's 14.
  tower: .5,         // share a tower takes (a sloop: 1.5 hp a shot; a level-1 cannon has 80)
  heart: .2,         // share the heart's ♥ takes (a sloop: 0.6 ♥ a shot, every 1.5 s; a warship 2 ♥ every 2 s)
  // Every landed ship ball on a wall, a tower or the heart counts this many times (the owner's playtest of 17 Nov:
  // "boats hitting the island should hit harder"; fire rate, targets and the captains' splash unchanged). 1.5 was
  // asked for, but it loses the final battle for a strong full crew (0 of 4 at wave 100, 4 of 4 before; see the
  // balance check below): 1.25 is the step that still wins it (4 of 4, the heart at 31 %).
  hitScale: 1.25,
  splash: Object.freeze({ radius: 1.5, share: .25 }), // captains this close to the impact take this share (a sloop: 0.75 hp)
});

const round2 = value => Math.round(value * 100) / 100;
const distance = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); };

const INERT = Object.freeze({ enabled: false, aim: () => false, land: () => {}, state: () => [] });

/**
 * The ship fire of one wave. walls, towers: the sim's objects (hp read live); towerHealth: tower-health.js's rules
 * of the wave (a tower is a target only while isTarget); heart {x, z}; wallReach: a wall this close goes first.
 * The sim's hooks: hitWall(wall, damage, events, extra), hurtIsland(damage, events, extra) (ends the wave at 0),
 * hurtCaptain(hero, damage, shipId, events), captains() the standing, present captains, now() the event time;
 * powerOf(ship) the kind's own damage (without it the ship's damage).
 */
export function createShipFire({ enabled = false, walls = [], towers = [], towerHealth = null, heart = { x: 0, z: 2 },
  wallReach = TARGET_PROFILES.ship.wallReach, hitWall, hurtIsland, hurtCaptain, captains = () => [], now = () => 0,
  powerOf = ship => ship.damage } = {}) {
  if (!enabled) return INERT;
  const P = TARGET_PROFILES.ship, shots = [];
  const isTower = tower => !!towerHealth?.isTarget?.(tower);

  /** The target of a ship now ({kind, item}) by P.order, or null when nothing is in range. */
  function pick(ship) {
    for (const kind of P.order) {
      if (kind === 'wall') {
        const wall = nearestWithin(ship, walls, wallReach, item => item.hp > 0);
        if (wall) return { kind, item: wall };
      } else if (kind === 'tower') {
        const tower = nearestWithin(ship, towers, SHIP_FIRE.towerReach, isTower);
        if (tower) return { kind, item: tower };
      } else if (kind === 'heart' && distance(ship.x, ship.z, heart.x, heart.z) <= SHIP_FIRE.heartReach + 1e-9) {
        return { kind, item: heart };
      }
    }
    return null;
  }

  /** A ship at anchor whose gun is loaded fires at its target (true), or holds its fire with none in range. */
  function aim(ship, t, events) {
    const target = pick(ship);
    if (!target) return false;
    const toX = round2(target.item.x), toZ = round2(target.item.z);
    const impactAt = round2(t + distance(ship.x, ship.z, toX, toZ) / SHIP_FIRE.shotSpeed);
    const shot = { shipId: ship.id, target: target.kind, ...(target.kind === 'heart' ? {} : { targetId: target.item.id }),
      x: round2(ship.x), z: round2(ship.z), toX, toZ, impactAt, damage: ship.damage, power: powerOf(ship) };
    shots.push(shot);
    events.push({ type: 'ship_fired', t: now(), kind: ship.kind, ...shot });
    return true;
  }

  // The impact: the target takes its share (if it still stands), the captains next to it a little.
  function hit(shot, events) {
    const extra = { shipId: shot.shipId, landed: true };
    if (shot.target === 'wall') {
      const wall = walls.find(item => item.id === shot.targetId);
      if (wall && wall.hp > 0) hitWall(wall, shot.damage * SHIP_FIRE.hitScale, events, extra);
    } else if (shot.target === 'tower') {
      const tower = towers.find(item => item.id === shot.targetId);
      if (tower && isTower(tower)) towerHealth.hit(tower, shot.power * SHIP_FIRE.tower * SHIP_FIRE.hitScale, shot.shipId, events);
    }
    const S = SHIP_FIRE.splash, splash = round2(shot.power * S.share);
    if (splash > 0) {
      const near = captains().filter(hero => distance(hero.x, hero.z, shot.toX, shot.toZ) <= S.radius + 1e-9)
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      for (const hero of near) hurtCaptain(hero, splash, shot.shipId, events);
    }
    // The heart last: at 0 ♥ the wave ends there and then.
    if (shot.target === 'heart') hurtIsland(shot.power * SHIP_FIRE.heart * SHIP_FIRE.hitScale, events, extra);
  }

  /** One tick: every shot whose time has come lands, in the order they were fired. Stops once the wave ended. */
  function land(t, events, isDone = () => false) {
    for (let i = 0; i < shots.length;) {
      if (shots[i].impactAt > t + 1e-9) { i++; continue; }
      const [shot] = shots.splice(i, 1);
      hit(shot, events);
      if (isDone()) return;
    }
  }

  return { enabled: true, pick, aim, land, state: () => shots.map(shot => ({ ...shot })) };
}
