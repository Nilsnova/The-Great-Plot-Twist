// "Light the three lamps", the demo's team finale, as plain rules. Three lamp posts stand in the class
// harbor. A captain holds a lamp's button for 2 s to light it; a lit lamp burns for 20 s. When all
// three burn at the same time (so all were lit within one 20 s window), the lighthouse relights.
//
// The states travel only through the class harbor's broadcast room (live:place:class_harbor:1): no
// server table, no world_state and no case tables. Phones have different clocks, so a message never
// carries a time, only ages ("this lamp was lit 4.2 s ago"); the receiver turns an age into its own
// clock. Merging is idempotent, so duplicates and repeats change nothing, and a late joiner simply
// adopts the next state it hears. A lamp is re-lit only if the new time is clearly later (1 s), so the
// small delay of each message never stretches a lamp's 20 s.
//
// Ticks: whoever holds a non-empty state repeats it every 5 s plus a random 0 to 2 s, unless somebody
// else's state was heard in that time (suppression), so a room sends about one tick every 5 to 7 s.
export const LAMP_COUNT = 3;
export const LAMP_WINDOW_MS = 20000;
export const HOLD_MS = 2000;
export const TICK_MS = 5000;
export const TICK_JITTER_MS = 2000;
export const RELIT_KEEP_MS = 10 * 60 * 1000; // a relit lighthouse stays relit this long, then a new round
export const NPC_FILL_AFTER_MS = 20000; // the host may fill missing lamps this long after the first one
const RELIGHT_MARGIN_MS = 1000;
const NAME = /^[A-Za-z0-9 _.'-]{1,24}$/;

const blankLamp = () => ({litAt: null, by: null});
export const createLamps = () => ({lamps: Array.from({length: LAMP_COUNT}, blankLamp), relitAt: null, startedAt: null, round: 0});

export const isLampLit = (lamp, now) => Number.isFinite(lamp?.litAt) && now - lamp.litAt < LAMP_WINDOW_MS && now >= lamp.litAt - RELIGHT_MARGIN_MS;
export const litCount = (state, now) => state.lamps.filter(lamp => isLampLit(lamp, now)).length;
export const isRelit = (state, now) => Number.isFinite(state.relitAt) && now - state.relitAt < RELIT_KEEP_MS;
// Seconds a lit lamp has left, rounded up, or 0.
export const secondsLeft = (lamp, now) => isLampLit(lamp, now) ? Math.ceil((LAMP_WINDOW_MS - (now - lamp.litAt)) / 1000) : 0;

// After 10 minutes a relit lighthouse starts a fresh round (a second rehearsal, a second class).
export function expire(state, now) {
  if (Number.isFinite(state.relitAt) && !isRelit(state, now)) return {...createLamps(), round: state.round};
  return state;
}

// If all three burn and the lighthouse is not relit yet, it relights now. relitNow tells the caller to
// play the cutscene once.
function settle(state, now) {
  if (isRelit(state, now) || litCount(state, now) < LAMP_COUNT) return {state, relitNow: false};
  return {state: {...state, relitAt: now, round: state.round + 1}, relitNow: true};
}

const cleanName = by => (typeof by === 'string' && NAME.test(by) ? by : null);

// One captain lit lamp `index` (0 to 2). A lit lamp is not lit again (its 20 s keep running).
export function lightLamp(state, index, by, now) {
  const current = expire(state, now);
  if (!Number.isInteger(index) || index < 0 || index >= LAMP_COUNT || isRelit(current, now)) return {state: current, relitNow: false, changed: false};
  if (isLampLit(current.lamps[index], now)) return {state: current, relitNow: false, changed: false};
  const lamps = current.lamps.map((lamp, position) => (position === index ? {litAt: now, by: cleanName(by)} : lamp));
  return {...settle({...current, lamps, startedAt: current.startedAt ?? now}, now), changed: true};
}

// The host's rehearsal help: every lamp that is not burning gets an NPC partner, once the finale has
// waited 20 s since its first lamp.
export const canNpcFill = (state, now) => !isRelit(state, now) && Number.isFinite(state.startedAt)
  && now - state.startedAt >= NPC_FILL_AFTER_MS && litCount(state, now) < LAMP_COUNT;
export function npcFill(state, now) {
  if (!canNpcFill(state, now)) return {state, relitNow: false, changed: false};
  const lamps = state.lamps.map(lamp => (isLampLit(lamp, now) ? lamp : {litAt: now, by: 'NPC partner'}));
  return {...settle({...state, lamps}, now), changed: true};
}

const age = (time, now, keep) => (Number.isFinite(time) && now - time >= 0 && now - time < keep ? Math.round(now - time) : null);

// The message: ages in milliseconds (null for a dark lamp) and the relight's age. No names: a browser
// never sends a name to another (D003), so the lighters stay on their own phones.
export function encodeLamps(state, now) {
  return {v: 1,
    lamps: state.lamps.map(lamp => (isLampLit(lamp, now) ? age(lamp.litAt, now, LAMP_WINDOW_MS) : null)),
    relit: age(state.relitAt, now, RELIT_KEEP_MS),
    started: age(state.startedAt, now, RELIT_KEEP_MS)};
}

const isAge = (value, keep) => value === null || (Number.isInteger(value) && value >= 0 && value < keep);

// A lamp message from another phone, checked field by field. null if anything is off.
export function readLamps(data) {
  if (!data || typeof data !== 'object' || data.v !== 1) return null;
  const {lamps, relit, started = null} = data;
  if (!Array.isArray(lamps) || lamps.length !== LAMP_COUNT || !lamps.every(value => isAge(value, LAMP_WINDOW_MS))) return null;
  if (!isAge(relit, RELIT_KEEP_MS) || !isAge(started, RELIT_KEEP_MS)) return null;
  return {lamps: [...lamps], relit, started};
}

export const hasNews = (state, now) => litCount(state, now) > 0 || isRelit(state, now);

// Adopts what another phone knows. Idempotent: the same message twice gives the same state.
export function mergeLamps(state, data, now) {
  const message = readLamps(data);
  let current = expire(state, now);
  if (!message) return {state: current, relitNow: false, changed: false};
  let changed = false;
  if (message.relit !== null && !isRelit(current, now)) {
    current = {...current, relitAt: now - message.relit, round: current.round + 1};
    return {state: current, relitNow: true, changed: true}; // somebody else saw all three burn
  }
  if (isRelit(current, now)) return {state: current, relitNow: false, changed: false};
  const lamps = current.lamps.map((lamp, index) => {
    const ageMs = message.lamps[index];
    if (ageMs === null) return lamp;
    const litAt = now - ageMs;
    if (Number.isFinite(lamp.litAt) && litAt <= lamp.litAt + RELIGHT_MARGIN_MS) return lamp;
    changed = true;
    return {litAt, by: null};
  });
  const startedAt = message.started === null ? current.startedAt
    : Math.min(current.startedAt ?? Infinity, now - message.started);
  if (startedAt !== current.startedAt) changed = true;
  return {...settle({...current, lamps, startedAt}, now), changed: changed || false};
}

// Whether this phone should repeat its state now (see "Ticks" above). jitter is 0 to TICK_JITTER_MS,
// drawn once per tick by the caller.
export function shouldTick({state, now, lastHeardAt = -Infinity, lastSentAt = -Infinity, jitter = 0}) {
  if (!hasNews(state, now)) return false;
  return now - Math.max(lastHeardAt, lastSentAt) >= TICK_MS + Math.max(0, Math.min(TICK_JITTER_MS, jitter));
}

// The hold button: 0 to 1 while held.
export const holdProgress = (startedAt, now) => (Number.isFinite(startedAt) ? Math.max(0, Math.min(1, (now - startedAt) / HOLD_MS)) : 0);

// The words under the lamps.
export function lampStatusText(state, now) {
  if (isRelit(state, now)) return 'The lighthouse burns again. Well done, captains!';
  const lit = litCount(state, now);
  if (lit === 0) return 'Three lamps, three captains: each of you holds one lamp for 2 seconds.';
  const left = Math.min(...state.lamps.filter(lamp => isLampLit(lamp, now)).map(lamp => secondsLeft(lamp, now)));
  return `${lit} of 3 lamps burn. Light the others within ${left} s.`;
}
