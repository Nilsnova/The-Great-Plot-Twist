// Wall health that stays after a wave (tasks T29-T32, decision D039, proposed), as plain rules for the
// wave simulation and its controller. No DOM, no Three.js.
//
// The server keeps each wall's health after its last wave as a percent (0 = destroyed, 100 = whole)
// and hands it to every client of the next wave ("walls" on the start, join and current answers), so
// every screen starts the same walls. A wave without "walls" (the flag wall_recovery off, Pirate
// Point, an old server) starts every wall whole, exactly as before.
//
//   readHealth(value)              a percent 0..100 from anything (100 when it is not a whole number)
//   startHp(maxHp, health)         the hp a wall starts the wave with
//   withHealth(defenses, walls)    the defenses with each wall's percent from a wave's "walls"
//   healthReport(stateWalls)       {wallId: percent} at the end of a wave, for POST /api/waves/finish
export const FULL = 100;

export function readHealth(value) {
  return Number.isInteger(value) && value >= 0 && value <= FULL ? value : FULL;
}

const round2 = value => Math.round(value * 100) / 100;

/** A wall at 0% starts broken (to be rebuilt), any other share as that share of its hp. */
export function startHp(maxHp, health) {
  return round2(maxHp * readHealth(health) / FULL);
}

/** The wave's walls object ({wall_1: 40}) or null when it is not a plain object of percents. */
export function readWalls(walls) {
  if (!walls || typeof walls !== 'object' || Array.isArray(walls)) return null;
  const out = {};
  for (const [id, value] of Object.entries(walls)) if (Number.isInteger(value) && value >= 0 && value <= FULL) out[id] = value;
  return out;
}

/** The defenses for the sim: every wall named in `walls` gets its health, the rest stay whole. */
export function withHealth(defenses, walls) {
  const known = readWalls(walls);
  if (!known) return defenses;
  return defenses.map(item => (item?.kind === 'wall' && known[item.id] !== undefined ? { ...item, health: known[item.id] } : item));
}

/** One wall's percent: 0 only when broken, 100 only when whole, else rounded and kept between 1 and 99. */
export function percentOf(hp, maxHp) {
  if (!(maxHp > 0) || hp >= maxHp) return FULL;
  if (hp <= 0) return 0;
  return Math.min(FULL - 1, Math.max(1, Math.round(hp / maxHp * FULL)));
}

/** {wallId: percent} of the sim's walls (state().walls), the same on every screen of the wave. */
export function healthReport(stateWalls) {
  const out = {};
  for (const wall of Array.isArray(stateWalls) ? stateWalls : []) out[wall.id] = percentOf(wall.hp, wall.maxHp);
  return out;
}
