// The demo's quest strip as plain data: three small goals, a one-line hint each, and the done state
// kept per player in local storage. No DOM here; quest-strip.js draws it.
export const QUEST_KEY = 'plot_twist_quests_v1';
export const QUESTS = Object.freeze([
  {id: 'wave', label: 'Wave to a captain', hint: 'Walk up to another captain, then tap them or press E and choose Wave.'},
  {id: 'duel', label: 'Duel a captain', hint: 'Tap a captain or press E next to them, then choose Friendly duel.'},
  {id: 'lock', label: "Open the Keeper's Lock", hint: "The lock stands on the lighthouse path, right of the ferry pier. Press E next to it."},
]);
export const FINALE_HINT = 'All done. Now light the three lamps together: each lamp needs one captain.';
const MAX_PLAYERS = 12; // a shared laptop keeps at most this many players' strips

const empty = () => ({wave: false, duel: false, lock: false});

// The key of one player: the captain's name when signed in, otherwise this device.
export function playerKey(view) {
  const name = view?.account?.state === 'signed_in' ? view?.captain?.name : null;
  return typeof name === 'string' && name.trim() && name !== 'Captain pending' ? `captain:${name.trim().slice(0, 24)}` : 'device';
}

function readAll(storage) {
  try {
    const value = JSON.parse(storage?.getItem(QUEST_KEY) ?? 'null');
    return value && value.version === 1 && value.players && typeof value.players === 'object' ? value : {version: 1, players: {}};
  } catch { return {version: 1, players: {}}; }
}

export function readQuests(storage, player) {
  const saved = readAll(storage).players[player];
  const state = empty();
  for (const quest of QUESTS) state[quest.id] = saved?.[quest.id] === true;
  return state;
}

export function writeQuests(storage, player, state) {
  const all = readAll(storage);
  all.players[player] = {...empty(), ...Object.fromEntries(QUESTS.map(quest => [quest.id, state?.[quest.id] === true])), at: Date.now()};
  const keys = Object.keys(all.players).sort((a, b) => (all.players[b].at ?? 0) - (all.players[a].at ?? 0));
  for (const key of keys.slice(MAX_PLAYERS)) delete all.players[key];
  try { storage?.setItem(QUEST_KEY, JSON.stringify(all)); return true; } catch { return false; }
}

// Ticks a goal. changed is false for an unknown id or a goal already done (a repeat is harmless).
export function completeQuest(state, id) {
  if (!QUESTS.some(quest => quest.id === id) || state?.[id] === true) return {state, changed: false};
  return {state: {...state, [id]: true}, changed: true};
}

export function questView(state) {
  const items = QUESTS.map(quest => ({...quest, done: state?.[quest.id] === true}));
  const doneCount = items.filter(item => item.done).length;
  return {items, doneCount, allDone: doneCount === QUESTS.length,
    summary: `${doneCount} of ${QUESTS.length} done`};
}

// What the shared HUD strip draws for the class demo (src/ui/quest-strip.js).
export function classQuestView(state) {
  const view = questView(state), current = view.items.findIndex(item => !item.done);
  return {kind: 'class', title: 'Class goals', progress: view.summary, allDone: view.allDone, finale: FINALE_HINT,
    items: view.items.map((item, index) => ({id: item.id, label: item.label, hint: item.hint, step: index + 1, done: item.done, current: index === current}))};
}
