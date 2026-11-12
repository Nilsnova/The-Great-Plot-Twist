// Keeping friends' wave simulations identical (BUILD-PLAN 3.6), as plain rules: no DOM, no timers.
//
// Every client runs the same deterministic sim from the same seed, ticked by the same clock: tick k
// covers server time startsAt + k × 50 ms. A manual input (a shot, a repair, the lamps) is never
// applied at once. It is stamped with a target tick a little ahead (INPUT_LEAD_TICKS, 200 ms), applied
// locally at that tick and broadcast with it (t = target tick × 0.05 s), so every client that hears it
// in time applies it at the very same tick. Inputs of one tick run in one fixed order (by sender, then
// sequence number), so the order of arrival never matters.
//
// The limit: a message that arrives after its tick has passed (a slow phone, a lost packet, a friend who
// joins mid-wave and missed earlier shots) is applied at the receiver's next tick instead. That client's
// wave can then drift a little (a ship sinks a moment later, or one shot more or less). Nothing is
// repaired afterwards; the server trusts each player's finish only within its caps (loot per wave,
// shipsSunk 0 to 1000), so a drift never pays more than an honest wave.
import { CONFIG } from './sim.js';
import { DEFAULT_WEAPON, isSkillList, isWeapon, readSkills, readWeapon } from './captain-stats.js';

export const TICK_SECONDS = CONFIG.tick;
export const INPUT_LEAD_TICKS = 4;
export const MAX_WAVE_SECONDS = 900;
export const ROOM_EVENTS = Object.freeze({ fire: 'cannon_shot', repair: 'wall_repair', lamps_lit: 'lamps_lit', captain_shot: 'captain_shot',
  rebuild: 'wall_rebuild', captain_strike: 'captain_strike' });
export const MAX_PLAYERS = 4; // TOWER-DEFENSE.md §11: up to four players defend one island together
const ID = /^[a-z0-9_-]{1,32}$/i;
const BY = /^[A-Za-z0-9_.:-]{1,64}$/;
const isAim = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 500;

export const tickOf = seconds => Math.round(seconds / TICK_SECONDS);
export const secondsOf = tick => Math.round(tick * TICK_SECONDS * 1000) / 1000;

/** The room message for an input: {type, payload} with the event names of BUILD-PLAN 3.6. */
export function toMessage(input, { by, seq, tick, waveId }) {
  const base = { by, seq, t: secondsOf(tick), waveId };
  if (input.type === 'fire') return { type: ROOM_EVENTS.fire, payload: { ...base, cannonId: input.cannonId, targetId: input.targetId } };
  // A repair or a rebuild carries the repairer's skills (Quick fix, Master shipwright: §14), so every
  // client repairs as fast and rebuilds to the same share.
  if (input.type === 'repair') return { type: ROOM_EVENTS.repair, payload: { ...base, wallId: input.wallId, skills: readSkills(input.skills) } };
  if (input.type === 'rebuild') return { type: ROOM_EVENTS.rebuild, payload: { ...base, wallId: input.wallId, skills: readSkills(input.skills) } };
  if (input.type === 'lamps_lit') return { type: ROOM_EVENTS.lamps_lit, payload: base };
  // The captain's gun: the shooter's own level, skills, weapon and position at send time (and the aim
  // point for a spray or a bomb), so every client agrees (§10, §14, §15).
  if (input.type === 'captain_shot') {
    const aim = isAim(input.ax) && isAim(input.az) ? { ax: input.ax, az: input.az } : {};
    return { type: ROOM_EVENTS.captain_shot, payload: { ...base, targetId: typeof input.targetId === 'string' ? input.targetId : null,
      level: input.level, x: input.x, z: input.z, skills: readSkills(input.skills), weapon: readWeapon(input.weapon), ...aim } };
  }
  // The cutlass (TOWER-DEFENSE.md §12): the musket shot's fields and the striker's skills (Brawler, §14).
  if (input.type === 'captain_strike') return { type: ROOM_EVENTS.captain_strike,
    payload: { ...base, targetId: input.targetId, level: input.level, x: input.x, z: input.z, skills: readSkills(input.skills) } };
  return null;
}

/** A message from the room, checked field by field: {by, seq, tick, input} or null. */
export function readMessage(type, payload, waveId) {
  if (!payload || typeof payload !== 'object' || payload.waveId !== waveId) return null;
  const { by, seq, t } = payload;
  if (typeof by !== 'string' || !BY.test(by) || !Number.isInteger(seq) || seq < 0 || seq > 1e9) return null;
  if (typeof t !== 'number' || !Number.isFinite(t) || t < 0 || t > MAX_WAVE_SECONDS) return null;
  const tick = tickOf(t);
  if (type === ROOM_EVENTS.fire) {
    if (typeof payload.cannonId !== 'string' || !ID.test(payload.cannonId) || typeof payload.targetId !== 'string' || !ID.test(payload.targetId)) return null;
    return { by, seq, tick, input: { type: 'fire', cannonId: payload.cannonId, targetId: payload.targetId } };
  }
  if (type === ROOM_EVENTS.repair) {
    if (typeof payload.wallId !== 'string' || !ID.test(payload.wallId)) return null;
    if (payload.skills !== undefined && !isSkillList(payload.skills)) return null;
    return { by, seq, tick, input: { type: 'repair', wallId: payload.wallId, skills: readSkills(payload.skills) } };
  }
  if (type === ROOM_EVENTS.rebuild) {
    if (typeof payload.wallId !== 'string' || !ID.test(payload.wallId)) return null;
    if (payload.skills !== undefined && !isSkillList(payload.skills)) return null;
    return { by, seq, tick, input: { type: 'rebuild', wallId: payload.wallId, skills: readSkills(payload.skills) } };
  }
  if (type === ROOM_EVENTS.lamps_lit) return { by, seq, tick, input: { type: 'lamps_lit' } };
  if (type === ROOM_EVENTS.captain_shot) {
    const { targetId = null, level, x, z, skills = [], weapon = DEFAULT_WEAPON, ax, az } = payload;
    if (targetId !== null && (typeof targetId !== 'string' || !ID.test(targetId))) return null;
    if (!Number.isInteger(level) || level < 1 || level > 5 || !isSkillList(skills) || !isWeapon(weapon)) return null;
    if (![x, z].every(isAim) || ((ax !== undefined || az !== undefined) && ![ax, az].every(isAim))) return null;
    if (targetId === null && ax === undefined) return null; // a shot needs a ship or an aim point
    // The shooter is the sender: a message cannot fire somebody else's gun.
    const aim = ax !== undefined ? { ax, az } : {};
    return { by, seq, tick, input: { type: 'captain_shot', by, targetId, level, x, z, skills: readSkills(skills), weapon, ...aim } };
  }
  if (type === ROOM_EVENTS.captain_strike) {
    const { targetId, level, x, z, skills = [] } = payload;
    if (typeof targetId !== 'string' || !ID.test(targetId) || !Number.isInteger(level) || level < 1 || level > 5) return null;
    if (![x, z].every(isAim) || !isSkillList(skills)) return null;
    // The striker is the sender: a message cannot swing somebody else's cutlass.
    return { by, seq, tick, input: { type: 'captain_strike', by, targetId, level, x, z, skills: readSkills(skills) } };
  }
  return null;
}

/** Inputs waiting for their tick. add() says when an input will run; take(tick) hands them over in order. */
export function createInputSchedule() {
  const pending = new Map(), seen = new Set();
  let late = 0;
  return {
    get late() { return late; },
    get size() { let n = 0; for (const list of pending.values()) n += list.length; return n; },
    // current: the next tick the sim will run. A repeat (same sender and sequence) is dropped.
    add({ by, seq, tick, input }, current) {
      const key = `${by}#${seq}`;
      if (seen.has(key)) return null;
      seen.add(key);
      let at = tick;
      if (!(at >= current)) { at = current; late++; }
      if (!pending.has(at)) pending.set(at, []);
      pending.get(at).push({ by, seq, input });
      return at;
    },
    take(tick) {
      const list = pending.get(tick);
      if (!list) return [];
      pending.delete(tick);
      return list.sort((a, b) => (a.by < b.by ? -1 : a.by > b.by ? 1 : a.seq - b.seq)).map(item => item.input);
    },
    clear() { pending.clear(); seen.clear(); late = 0; },
  };
}
