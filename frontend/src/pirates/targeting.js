// What an enemy on foot goes for (T34, specs/T34-T35-targeting-pathing.md, decision D040): a captain
// (or a Barracks militia), a tower, a wall or the island's heart, by its enemy type's priority list.
// Pure and deterministic: equal distances go to the lower id, and the order of the input lists never
// matters, so every browser that feeds the same positions picks the same target. Used by the tests now
// and by sim.js's pickBoarderTarget after the wiring step.

const EPSILON = 1e-9; // distances closer than this count as equal

// The priority lists by enemy type, first entry first. `boarder` matches today's sim.js numbers
// (CONFIG.health: reach 3, leash 5, crowd 3); towers count only once they have hp (T33).
// `brute` is the proposed siege type: walls and towers first, a captain only right next to it.
export const TARGET_PROFILES = Object.freeze({
  boarder: Object.freeze({ order: Object.freeze(['captain', 'wall', 'tower', 'heart']), captainReach: 3, towerReach: 2.5, leash: 5, crowd: 3 }),
  brute: Object.freeze({ order: Object.freeze(['wall', 'tower', 'captain', 'heart']), captainReach: 1.5, towerReach: 4, leash: 3, crowd: 3 }),
});

/** The profile for an enemy: a brute's when it is a brute and brutes are switched on, else a boarder's. */
export function profileFor(enemy, { brutes = false } = {}) {
  return brutes && enemy.brute ? TARGET_PROFILES.brute : TARGET_PROFILES.boarder;
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// A captain or militia who can be fought: standing, present, with hp. A tower: it has hp (T33) above 0.
const isFightable = hero => hero && !hero.down && !hero.away && hero.hp > 0;
const isStandingTower = tower => tower && Number.isFinite(tower.hp) && tower.hp > 0;

/**
 * The nearest item of `list` within `reach` of the enemy that passes `fits`; equal distances go to the
 * lower id. Sorting by id first and keeping only strictly nearer items makes the input order irrelevant.
 * The distance is checked before `fits`, so the dearer checks (a clear way there) run only for near items.
 */
export function nearestWithin(enemy, list, reach, fits) {
  let best = null, bestDistance = reach + EPSILON;
  for (const item of [...list].sort(byId)) {
    const d = distance(enemy, item);
    if (d < bestDistance - EPSILON && fits(item)) { best = item; bestDistance = d; }
  }
  return best;
}

// Fresh candidates of one kind (not the target the enemy already holds).
function candidate(kind, enemy, world, profile) {
  const crowdOk = item => (world.crowdOf?.(kind, item.id) ?? 0) < profile.crowd;
  const reachable = item => world.canReach?.(enemy, item) ?? true;
  if (kind === 'captain') {
    return nearestWithin(enemy, world.captains ?? [], profile.captainReach, hero => isFightable(hero) && crowdOk(hero) && reachable(hero));
  }
  if (kind === 'tower') {
    return nearestWithin(enemy, world.towers ?? [], profile.towerReach, tower => isStandingTower(tower) && crowdOk(tower) && reachable(tower));
  }
  if (kind === 'wall') return world.blockingWall && world.blockingWall.hp > 0 ? world.blockingWall : null;
  if (kind === 'heart') return world.heart && world.heartReachable !== false ? world.heart : null;
  return null;
}

// The enemy's current target, looked up again, while it is still worth keeping: a captain still
// fightable within the leash, a tower still standing within the leash, a wall still standing and still
// the one in the way, the heart while it can be reached. Otherwise null (dead, gone, out of reach).
function keptTarget(enemy, world, profile) {
  const held = enemy.target;
  if (!held) return null;
  const within = item => distance(enemy, item) <= profile.leash + EPSILON && (world.canReach?.(enemy, item) ?? true);
  if (held.kind === 'captain') {
    const hero = (world.captains ?? []).find(item => item.id === held.id);
    return isFightable(hero) && within(hero) ? hero : null;
  }
  if (held.kind === 'tower') {
    const tower = (world.towers ?? []).find(item => item.id === held.id);
    return isStandingTower(tower) && within(tower) ? tower : null;
  }
  if (held.kind === 'wall') return world.blockingWall?.id === held.id && world.blockingWall.hp > 0 ? world.blockingWall : null;
  if (held.kind === 'heart') return candidate('heart', enemy, world, profile);
  return null;
}

const describe = (kind, item) => (kind === 'heart' ? { kind, x: item.x, z: item.z } : { kind, id: item.id, x: item.x, z: item.z });

/**
 * The target for `enemy` ({id, x, z, target?: {kind, id}}) in `world`:
 *   captains   [{id, x, z, hp, down?, away?}] (captains and militia together),
 *   towers     [{id, x, z, hp}] (only towers with hp count),
 *   blockingWall  the standing wall the route says is next in the way (pathing.js nextStep), or null,
 *   heart      {x, z}; heartReachable false when no way to it exists,
 *   crowdOf(kind, id)  how many OTHER enemies are on that target, canReach(enemy, item) a clear way there.
 * The enemy keeps its current target while that stays valid, unless a kind earlier in its profile's
 * order turns up. Returns {kind, id?, x, z}, or {kind: 'none'} when there is nothing to go for.
 */
export function pickTarget(enemy, world, profile = TARGET_PROFILES.boarder) {
  const kept = keptTarget(enemy, world, profile);
  const keptRank = kept ? profile.order.indexOf(enemy.target.kind) : profile.order.length;
  for (let rank = 0; rank < keptRank; rank++) {
    const kind = profile.order[rank], found = candidate(kind, enemy, world, profile);
    if (found) return describe(kind, found);
  }
  return kept ? describe(enemy.target.kind, kept) : { kind: 'none' };
}
