// The first 3 minutes (docs/PITCH.md) as plain data: five goals in order, then five tower-defense goals
// that follow the unlocks (docs/TOWER-DEFENSE.md §9), three shown at a time, and a
// friendly hint after 20 s of standing still. No DOM here; hud.js draws it with quest-strip.js.
import {QUEST_EVENTS, GUIDE_EVENTS} from './quest-events.js';

export const FIRST_QUEST_KEY = 'plot_twist_first_quests_v1';
// The wave a wave_finished event is about: its own number, or the island's best after it.
const waveOf = event => (Number.isSafeInteger(event?.wave) ? event.wave : Number.isSafeInteger(event?.waveBest) ? event.waveBest : 0);
export const HARBOR_ID = 'saltreach_harbor';
export const VISIBLE_GOALS = 3;
export const IDLE_HINT_MS = 20000;
// Each goal names the event (and payload test) that completes it. Goals complete strictly in order:
// only the current goal listens, so standing in the Harbor at the start does not tick goal 3.
// TRAVEL_QUESTS are the goals with the sea chart (the Harbor and its stake); FIRST_QUESTS replace those two
// with island goals while "one island" is on (docs/GAME-V3.md §2, src/island/one-island.js), at the same
// places in the list, so a saved count of done goals means the same thing in both lists.
export const TRAVEL_QUESTS = Object.freeze([
  {id: 'cannon', label: 'Build a cannon', hint: 'Walk to a glowing spot on your island and press E (or the Use button) to build a cannon for 30 🪙.',
    event: QUEST_EVENTS.ISLAND_BUILT, matches: event => event.kind === 'cannon'},
  {id: 'wave', label: 'Ring the bell and win a wave', hint: 'Ring the bell by your cabin. Your cannon fires on its own; stay close to help.',
    event: QUEST_EVENTS.WAVE_FINISHED, matches: event => event.survived === true},
  {id: 'harbor', label: 'Sail to the Harbor', hint: 'Open the Menu and choose Sea chart, then pick The Harbor.',
    event: QUEST_EVENTS.PLACE_ARRIVED, matches: event => event.id === HARBOR_ID},
  {id: 'stake', label: 'Place a 🪙 stake', hint: 'Walk up to a Harbor stall and put 5, 10 or 25 🪙 on a real match or price.',
    event: QUEST_EVENTS.HARBOR_STAKE_PLACED, matches: () => true},
  {id: 'invite', label: 'Invite a friend', hint: 'Open the Menu, choose Players and invite, and send the link to a friend.',
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
const ISLAND_GOALS = Object.freeze({
  harbor: {id: 'wall', label: 'Build a wall', hint: 'Walls stop the ships at the shore. Tap a wall spot on the beach and build one for 10 🪙.',
    event: QUEST_EVENTS.ISLAND_BUILT, matches: event => event.kind === 'wall'},
  stake: {id: 'wave3', label: 'Win wave 3', hint: 'Ring the bell again after each win. Wave 3 opens the mortar and the watchtower.',
    event: QUEST_EVENTS.WAVE_FINISHED, matches: event => event.survived === true && waveOf(event) >= 3},
});
// The goals of the one island: the same list with the two travel goals swapped for island goals.
export const FIRST_QUESTS = Object.freeze(TRAVEL_QUESTS.map(quest => ISLAND_GOALS[quest.id] ?? quest));
export const questsFor = (travel = false) => (travel === true ? TRAVEL_QUESTS : FIRST_QUESTS);
export const FIRST_DONE_LINE = 'All goals done. Upgrade everything and see how far you get: wave 100 is the end.';

// The number of goals done so far (always a prefix, because goals complete in order).
export function readFirstQuests(storage) {
  try {
    const value = JSON.parse(storage?.getItem(FIRST_QUEST_KEY) ?? 'null');
    const done = Number(value?.done);
    return {done: value?.version === 1 && Number.isInteger(done) ? Math.max(0, Math.min(TRAVEL_QUESTS.length, done)) : 0};
  } catch { return {done: 0}; }
}
export function writeFirstQuests(storage, state) {
  try { storage?.setItem(FIRST_QUEST_KEY, JSON.stringify({version: 1, done: state.done})); return true; } catch { return false; }
}

// One bus event in, the next state out. changed is true only when the current goal completed.
export function applyQuestEvent(state, event, quests = FIRST_QUESTS) {
  const done = state?.done ?? 0, current = quests[done];
  if (!current || !event || event.type !== current.event) return {state, changed: false, completed: null};
  let ok = false;
  try { ok = current.matches(event) === true; } catch { ok = false; }
  if (!ok) return {state, changed: false, completed: null};
  return {state: {done: done + 1}, changed: true, completed: current};
}

// What the strip shows: three goals from the current one (the last three once near the end).
export function firstQuestView(state, quests = FIRST_QUESTS) {
  const done = state?.done ?? 0, total = quests.length;
  const start = Math.max(0, Math.min(done, total - VISIBLE_GOALS));
  const items = quests.slice(start, start + VISIBLE_GOALS).map((quest, index) => ({
    id: quest.id, label: quest.label, hint: quest.hint, step: start + index + 1, done: start + index < done, current: start + index === done}));
  return {kind: 'first', title: 'Goals', progress: `${Math.min(done, total)} of ${total}`, items, doneCount: done, total,
    allDone: done >= total, finale: done >= total ? FIRST_DONE_LINE : '', current: quests[done] ?? null};
}

// ---- The guided start of a new island (T52) ----
// The first goals, walked through one action at a time: before wave 1 of a new island the strip shows these
// steps instead of the goals (hud.setGuide), each with a caption and a target the tutorial overlay points at
// (src/tutorial/tutorials.js). They use the goals' own shape and bus events, so the steps and the goals move
// on the same actions: building the cannon in step 3 also ticks the goal "Build a cannon", and ringing the
// bell starts the wave the goal "Ring the bell and win a wave" waits for. One list, one strip, one vocabulary.
// target: 'spot' (the nearest empty tower spot), 'hud:menu', an island zone id, or null. jumps: the event
// also counts while an earlier step is current (a friend rang the bell first), completing the steps before it.
// after: the step waits for that event first (the cutlass: only once boarders land); until then it shows wait.
export const GUIDE_STEPS = Object.freeze([
  {id: 'move', label: 'Walk around', target: null, keys: 'WASD',
    caption: 'Walk with WASD or the arrow keys. On a phone, drag the stick.',
    event: GUIDE_EVENTS.PLAYER_MOVED, matches: () => true},
  {id: 'spot', label: 'Open a build spot', target: 'spot', keys: 'E',
    caption: 'Walk to the glowing ring and press E (or Use on a phone).',
    event: GUIDE_EVENTS.BUILD_CARD_OPENED, matches: () => true},
  {id: 'cannon', label: 'Build a cannon', target: 'spot',
    caption: 'Choose Cannon on the card. It costs 🪙 30 and fires at ships by itself.',
    event: GUIDE_EVENTS.ISLAND_BUILT, matches: event => event.kind === 'cannon', jumps: true},
  {id: 'menu', label: 'Look at the Menu', target: 'hud:menu',
    caption: 'Open the Menu at the top right, or tap a goal for a hint. Crew, Captain and Settings are in the Menu.',
    event: GUIDE_EVENTS.HUD_OPENED, matches: () => true},
  {id: 'bell', label: 'Ring the bell', target: 'island_bell', keys: 'E',
    caption: 'Walk to the bell on the beach and press E to ring it. Wave 1 begins.',
    event: GUIDE_EVENTS.WAVE_BEGAN, matches: event => !(Number(event.wave) < 1), jumps: true},
  {id: 'shoot', label: 'Fire your musket', target: null, keys: 'F',
    caption: 'Help your cannon: click or tap toward a ship, or press F, to fire your musket.',
    event: GUIDE_EVENTS.CAPTAIN_ATTACK, matches: event => event.weapon === 'gun', narrator: 'guide:shoot'},
  {id: 'cutlass', label: 'Swing the cutlass', target: null, keys: 'F', after: GUIDE_EVENTS.BOARDERS_ASHORE,
    wait: 'If boarders land, walk up to one and press F (or tap it) to swing your cutlass.',
    caption: 'Boarders ashore! Walk up to one and press F (or tap it) to swing your cutlass.',
    event: GUIDE_EVENTS.CAPTAIN_ATTACK, matches: event => event.weapon === 'cutlass', narrator: 'guide:cutlass'},
].map(step => Object.freeze(step)));
export const GUIDE_TITLE = 'First steps';
// The guide's state: {step: index of the current step, ready: the current step's `after` came, done, skipped: [ids]}.
export const guideStart = () => ({step: 0, ready: false, done: false, skipped: []});
const stepMatches = (step, event) => {
  if (!step || !event || event.type !== step.event) return false;
  try { return step.matches(event) === true; } catch { return false; }
};
// One bus event in, the next guide state out: completed lists the steps this event finished, finished is true once
// the last step is done. The end of the first wave (wave_finished) ends the guide wherever it stands.
export function applyGuideEvent(state, event, steps = GUIDE_STEPS) {
  const current = state ?? guideStart(), none = {state: current, changed: false, completed: [], finished: false};
  if (!event || current.done) return none;
  const at = Math.max(0, Math.min(steps.length, current.step ?? 0));
  if (event.type === GUIDE_EVENTS.WAVE_FINISHED && at >= steps.findIndex(step => step.id === 'bell')) {
    return {state: {...current, step: steps.length, done: true}, changed: true, completed: steps.slice(at).map(step => step.id), finished: true};
  }
  const step = steps[at];
  if (step?.after && !current.ready && event.type === step.after) return {...none, state: {...current, ready: true}, changed: true};
  let to = -1;
  if (stepMatches(step, event) && (!step.after || current.ready)) to = at;
  else for (let i = at + 1; i < steps.length; i++) if (steps[i].jumps && stepMatches(steps[i], event)) { to = i; break; }
  if (to < 0) return none;
  const next = to + 1, finished = next >= steps.length;
  return {state: {...current, step: next, ready: false, done: finished}, changed: true, completed: steps.slice(at, next).map(item => item.id), finished};
}
// Skip the current step (or, with all: the whole guide).
export function skipGuideStep(state, steps = GUIDE_STEPS, {all = false} = {}) {
  const current = state ?? guideStart(), at = Math.max(0, Math.min(steps.length, current.step ?? 0));
  if (current.done) return current;
  const skipped = [...new Set([...(current.skipped ?? []), ...steps.slice(at, all ? steps.length : at + 1).map(step => step.id)])];
  const next = all ? steps.length : at + 1;
  return {...current, step: next, ready: false, done: next >= steps.length, skipped};
}
export const guideCurrent = (state, steps = GUIDE_STEPS) => (state && !state.done ? steps[state.step] ?? null : null);
// What the strip shows while the guide runs: the same view shape as the goals.
export function guideView(state, steps = GUIDE_STEPS) {
  const done = Math.min(state?.step ?? 0, steps.length), total = steps.length;
  const start = Math.max(0, Math.min(done, total - VISIBLE_GOALS));
  const skipped = new Set(state?.skipped ?? []);
  const items = steps.slice(start, start + VISIBLE_GOALS).map((step, index) => ({
    id: `guide_${step.id}`, label: step.label, hint: guideCaption(state, step, steps), step: start + index + 1,
    done: start + index < done, skipped: skipped.has(step.id), current: start + index === done}));
  return {kind: 'guide', title: GUIDE_TITLE, progress: `${done} of ${total}`, items, doneCount: done, total,
    allDone: done >= total, finale: '', current: steps[done] ?? null};
}
// The caption of a step: its waiting line until its `after` event came (only the current step can be ready).
export function guideCaption(state, step, steps = GUIDE_STEPS) {
  if (!step) return '';
  const ready = state?.ready === true && steps[state.step] === step;
  return step.after && !ready ? step.wait ?? step.caption : step.caption;
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
