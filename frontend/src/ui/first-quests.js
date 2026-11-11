// The first 3 minutes (docs/PITCH.md) as plain data: five goals in order, then five tower-defense goals
// that follow the unlocks (docs/TOWER-DEFENSE.md §9), three shown at a time, and a
// friendly hint after 20 s of standing still. No DOM here; hud.js draws it with quest-strip.js.
import {QUEST_EVENTS} from './quest-events.js';

export const FIRST_QUEST_KEY = 'plot_twist_first_quests_v1';
// The wave a wave_finished event is about: its own number, or the island's best after it.
const waveOf = event => (Number.isSafeInteger(event?.wave) ? event.wave : Number.isSafeInteger(event?.waveBest) ? event.waveBest : 0);
export const HARBOR_ID = 'saltreach_harbor';
export const VISIBLE_GOALS = 3;
export const IDLE_HINT_MS = 20000;
// Each goal names the event (and payload test) that completes it. Goals complete strictly in order:
// only the current goal listens, so standing in the Harbor at the start does not tick goal 3.
export const FIRST_QUESTS = Object.freeze([
  {id: 'cannon', label: 'Build a cannon', hint: 'Walk to a glowing spot on your island and press E (or tap it) to build a cannon for 30 🪙.',
    event: QUEST_EVENTS.ISLAND_BUILT, matches: event => event.kind === 'cannon'},
  {id: 'wave', label: 'Ring the bell and win a wave', hint: 'Ring the bell by your cabin. Your cannon fires on its own; stay close to help.',
    event: QUEST_EVENTS.WAVE_FINISHED, matches: event => event.survived === true},
  {id: 'harbor', label: 'Sail to the Harbor', hint: 'Open the Menu and choose Sea chart, then pick The Harbor.',
    event: QUEST_EVENTS.PLACE_ARRIVED, matches: event => event.id === HARBOR_ID},
  {id: 'stake', label: 'Place a 🪙 stake', hint: 'Walk up to a Harbor stall and put 5, 10 or 25 🪙 on a real match or price.',
    event: QUEST_EVENTS.HARBOR_STAKE_PLACED, matches: () => true},
  {id: 'invite', label: 'Invite a friend', hint: 'Open Invite a friend on your island and share your island code.',
    event: QUEST_EVENTS.ISLAND_INVITE_OPENED, matches: () => true},
  // Tower defense (TOWER-DEFENSE.md), in the order things unlock: level 2 after wave 2, the mortar after
  // wave 3, the crew after wave 5.
  {id: 'upgrade', label: 'Upgrade a cannon', hint: 'Win wave 2, then tap a cannon and choose Upgrade.',
    event: QUEST_EVENTS.ISLAND_UPGRADED, matches: event => event.kind === 'cannon'},
  {id: 'mortar', label: 'Build a mortar', hint: 'After wave 3, tap an empty tower spot and choose Mortar.',
    event: QUEST_EVENTS.ISLAND_BUILT, matches: event => event.kind === 'mortar'},
  {id: 'wave5', label: 'Win wave 5', hint: 'Ring the bell and hold the island. Wave 5 is a boss wave.',
    event: QUEST_EVENTS.WAVE_FINISHED, matches: event => event.survived === true && waveOf(event) >= 5},
  {id: 'gunner', label: 'Hire a gunner', hint: 'Open the Menu and choose Crew, then hire a gunner for 40 🪙.',
    event: QUEST_EVENTS.CREW_HIRED, matches: event => event.crew === 'gunner'},
  {id: 'wave10', label: 'Win wave 10', hint: 'Upgrade your towers and bring a friend: wave 10 brings two warships.',
    event: QUEST_EVENTS.WAVE_FINISHED, matches: event => event.survived === true && waveOf(event) >= 10},
]);
export const FIRST_DONE_LINE = 'All goals done. Upgrade everything and see how far you get: wave 100 is the end.';

// The number of goals done so far (always a prefix, because goals complete in order).
export function readFirstQuests(storage) {
  try {
    const value = JSON.parse(storage?.getItem(FIRST_QUEST_KEY) ?? 'null');
    const done = Number(value?.done);
    return {done: value?.version === 1 && Number.isInteger(done) ? Math.max(0, Math.min(FIRST_QUESTS.length, done)) : 0};
  } catch { return {done: 0}; }
}
export function writeFirstQuests(storage, state) {
  try { storage?.setItem(FIRST_QUEST_KEY, JSON.stringify({version: 1, done: state.done})); return true; } catch { return false; }
}

// One bus event in, the next state out. changed is true only when the current goal completed.
export function applyQuestEvent(state, event) {
  const done = state?.done ?? 0, current = FIRST_QUESTS[done];
  if (!current || !event || event.type !== current.event) return {state, changed: false, completed: null};
  let ok = false;
  try { ok = current.matches(event) === true; } catch { ok = false; }
  if (!ok) return {state, changed: false, completed: null};
  return {state: {done: done + 1}, changed: true, completed: current};
}

// What the strip shows: three goals from the current one (the last three once near the end).
export function firstQuestView(state) {
  const done = state?.done ?? 0, total = FIRST_QUESTS.length;
  const start = Math.max(0, Math.min(done, total - VISIBLE_GOALS));
  const items = FIRST_QUESTS.slice(start, start + VISIBLE_GOALS).map((quest, index) => ({
    id: quest.id, label: quest.label, hint: quest.hint, step: start + index + 1, done: start + index < done, current: start + index === done}));
  return {kind: 'first', title: 'Goals', progress: `${Math.min(done, total)} of ${total}`, items, doneCount: done, total,
    allDone: done >= total, finale: done >= total ? FIRST_DONE_LINE : '', current: FIRST_QUESTS[done] ?? null};
}

// The idle hint: fires once after IDLE_HINT_MS of standing still without progress, then waits until
// the player moves again. step() returns true on the frame the hint should show.
export function createIdleHint({after = IDLE_HINT_MS} = {}) {
  let still = 0, armed = true;
  return {
    step(ms, {moving = false, blocked = false} = {}) {
      if (moving) { still = 0; armed = true; return false; }
      if (blocked || !armed) return false;
      still += Math.max(0, ms);
      if (still < after) return false;
      armed = false; still = 0;
      return true;
    },
    progress() { still = 0; armed = true; },
    get stillFor() { return still; },
  };
}
