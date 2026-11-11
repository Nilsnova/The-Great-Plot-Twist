// Man a cannon, patch a wall (lane P4), as plain rules: what the player standing at (x, z) can do now,
// and which input a key press or a tap on a ship turns into. No DOM here.
export const REACH = 2.6;          // world units from a cannon or wall to man or repair it
export const TAP_RADIUS = 2.4;     // world units around a ship's middle that count as tapping it
const SHIP_MIDDLE = { sloop: 1.6, brig: 2.2, flagship: 3.2 }; // drawn units above the waterline

const near = (list, player, reach = REACH) => {
  let best = null, bestDistance = reach;
  for (const item of list) {
    const d = Math.hypot(item.x - player.x, item.z - player.z);
    if (d <= bestDistance) { best = item; bestDistance = d; }
  }
  return best;
};

/**
 * What the player can do: {kind: 'fire', cannonId, targetId|null} next to a cannon, {kind: 'repair',
 * wallId, hp} next to a damaged wall, else null. defenses: [{id, kind, x, z}]; state: wave.state().
 * repairReach: how far you reach a wall (captain-stats.js: Long reach adds 2 units, §14).
 */
export function actionAt(player, defenses, state, { repairReach = REACH } = {}) {
  if (!player || !state || state.phase !== 'running') return null;
  const cannon = near(defenses.filter(item => item.kind === 'cannon'), player);
  const walls = new Map((state.walls ?? []).map(wall => [wall.id, wall]));
  const damaged = defenses.filter(item => item.kind === 'wall' && walls.has(item.id) && walls.get(item.id).hp < walls.get(item.id).maxHp);
  const wall = near(damaged, player, Number.isFinite(repairReach) && repairReach > 0 ? repairReach : REACH);
  const toCannon = cannon ? Math.hypot(cannon.x - player.x, cannon.z - player.z) : Infinity;
  const toWall = wall ? Math.hypot(wall.x - player.x, wall.z - player.z) : Infinity;
  if (cannon && toCannon <= toWall) {
    const target = nearestShip(cannon, state);
    return { kind: 'fire', cannonId: cannon.id, targetId: target?.id ?? null, x: cannon.x, z: cannon.z };
  }
  if (wall) {
    const live = walls.get(wall.id);
    return { kind: 'repair', wallId: wall.id, hp: live.hp, maxHp: live.maxHp, repairing: live.repairing, x: wall.x, z: wall.z };
  }
  return null;
}

/** The nearest ship this cannon can see (within the sim's sight), or null. */
export function nearestShip(cannon, state) {
  let best = null, bestDistance = state.sight ?? Infinity;
  for (const ship of state.ships ?? []) {
    const d = Math.hypot(ship.x - cannon.x, ship.z - cannon.z);
    if (d <= bestDistance) { best = ship; bestDistance = d; }
  }
  return best;
}

/** The input for the E key (or the prompt button), or null when there is nothing to do. */
export function inputFor(action) {
  if (action?.kind === 'fire' && action.targetId) return { type: 'fire', cannonId: action.cannonId, targetId: action.targetId };
  if (action?.kind === 'repair' && !action.repairing) return { type: 'repair', wallId: action.wallId };
  return null;
}

/**
 * A tap at the logical point (x, z) on the water: the ship drawn there, or null. Ships are drawn up
 * from their waterline, so the tap is compared with the middle of the hull and sails.
 */
export function shipAt(point, state) {
  let best = null, bestDistance = TAP_RADIUS;
  for (const ship of state?.ships ?? []) {
    const middleZ = ship.z - (SHIP_MIDDLE[ship.kind] ?? 1.6) / .72;
    const d = Math.hypot(ship.x - point.x, (middleZ - point.z) * .72);
    if (d <= bestDistance) { best = ship; bestDistance = d; }
  }
  return best;
}

/** The input for a tap on a ship while manning a cannon, or null. */
export function tapInput(action, ship, state) {
  if (action?.kind !== 'fire' || !ship) return null;
  if (Math.hypot(ship.x - action.x, ship.z - action.z) > (state?.sight ?? Infinity)) return null;
  return { type: 'fire', cannonId: action.cannonId, targetId: ship.id };
}

/** The prompt's words: "E · Fire", "E · Repair". */
export function promptText(action) {
  if (!action) return '';
  if (action.kind === 'fire') return action.targetId ? 'Fire' : 'No ship in sight';
  return action.repairing ? 'Repairing…' : 'Repair';
}
