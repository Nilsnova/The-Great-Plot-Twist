// The tower-defense numbers of docs/TOWER-DEFENSE.md as plain data (sections 2, 3, 9 and 10), for the
// cards only: what a building does, what the next level costs and gives, what a crew member does, when
// something unlocks. The server decides every price and refusal; an island answer's `prices`, `level`,
// `crew`, `captain` and `unlocks` win over these tables whenever they are present. No DOM here.

// §2: per kind, per level (index 0 = level 1). price[n] is the price of building (n = 0) or of the
// upgrade to level n + 1.
export const BUILDINGS = Object.freeze({
  wall: Object.freeze({name: 'Wall', line: 'Stops boarders until they break it; ships shell it.', price: [10, 20, 40],
    stats: [{hp: 60}, {hp: 120}, {hp: 200}]}),
  cannon: Object.freeze({name: 'Cannon', line: 'Fires at one ship at a time.', price: [30, 60, 120],
    stats: [{damage: 10, range: 28}, {damage: 16, range: 31}, {damage: 24, range: 34}]}),
  mortar: Object.freeze({name: 'Mortar', line: 'Hits every ship near the impact. Cannot hit close ships.', price: [60, 120, 240],
    stats: [{damage: 14, range: 36}, {damage: 22, range: 40}, {damage: 32, range: 44}]}),
  watchtower: Object.freeze({name: 'Watchtower', line: 'Gives all your towers more range.', price: [40, 80],
    stats: [{range: 8}, {range: 12}]}),
  house: Object.freeze({name: 'House', line: 'Adds loot for every wave you win.', price: [50, 100],
    stats: [{loot: 5}, {loot: 10}]}),
});
export const maxLevel = kind => BUILDINGS[kind]?.price.length ?? 1;
// The kinds a spot of each slot accepts (§2): a tower spot takes a cannon or a mortar, chosen once.
export const SLOT_KINDS = Object.freeze({wall: ['wall'], tower: ['cannon', 'mortar'], watchtower: ['watchtower'], house: ['house']});

// §3
export const CREW = Object.freeze({
  gunner: Object.freeze({name: 'Gunner', line: 'Mans your strongest tower: it reloads 25% faster.', price: 40, max: 2}),
  carpenter: Object.freeze({name: 'Carpenter', line: 'Repairs your most damaged wall during a wave.', price: 30, max: 2}),
  lookout: Object.freeze({name: 'Lookout', line: 'Sees further in fog; ships show 3 s earlier.', price: 25, max: 1}),
});
export const CREW_IDS = Object.freeze(Object.keys(CREW));

// §10: the captain's musket. price[n] is the upgrade to level n + 1 (level 1 is free).
export const CAPTAIN = Object.freeze({
  stats: Object.freeze([{damage: 6, range: 14}, {damage: 9, range: 15}, {damage: 13, range: 16}, {damage: 18, range: 18}, {damage: 24, range: 20}]),
  price: Object.freeze([0, 20, 40, 80, 160]),
});
export const CAPTAIN_MAX = CAPTAIN.stats.length;

// §9: after winning wave N, these unlock. Levels are "the highest level allowed"; crew are "may hire".
export const UNLOCK_STEPS = Object.freeze([
  Object.freeze({wave: 0, levels: {wall: 1, cannon: 1}, captain: 1, crew: []}),
  Object.freeze({wave: 1, captain: 3, crew: []}),
  Object.freeze({wave: 2, levels: {wall: 2, cannon: 2, house: 1}, crew: []}),
  Object.freeze({wave: 3, levels: {mortar: 1, watchtower: 1}, crew: []}),
  Object.freeze({wave: 5, levels: {wall: 3, cannon: 3, mortar: 3, watchtower: 2, house: 2}, crew: ['gunner', 'carpenter']}),
  Object.freeze({wave: 8, captain: 5, crew: ['lookout']}),
]);
// What one unlock step is called in its toast and its first-time line.
export const UNLOCK_NEWS = Object.freeze({
  1: {title: 'Captain upgrades unlocked!', line: 'Open Menu › Captain and skills to make your musket stronger.'},
  2: {title: 'Level 2 and the house unlocked!', line: 'Tap a cannon or wall to upgrade it. Houses add loot after every won wave.'},
  3: {title: 'New: Mortar unlocked!', line: 'A mortar hits every ship near the impact. Build one on a tower spot.'},
  5: {title: 'New: Crew and level 3 unlocked!', line: 'Hire a gunner or a carpenter in Menu › Crew.'},
  8: {title: 'New: Lookout unlocked!', line: 'The lookout spots ships earlier. Your captain can reach level 5.'},
});

// The unlocks for a won wave, as one plain object:
//   {wonWave, levels: {wall, cannon, mortar, watchtower, house}, captain, crew: {gunner, carpenter, lookout}, next}
// levels[kind] 0 = locked; crew[id] true = may hire; next = {wave, title} of the next step or null.
export function unlocksFor(wonWave = 0) {
  const won = Number.isSafeInteger(wonWave) && wonWave > 0 ? wonWave : 0;
  const levels = {wall: 0, cannon: 0, mortar: 0, watchtower: 0, house: 0}, crew = {gunner: false, carpenter: false, lookout: false};
  let captain = 1, next = null;
  for (const step of UNLOCK_STEPS) {
    if (step.wave > won) { next ??= {wave: step.wave, title: UNLOCK_NEWS[step.wave]?.title ?? ''}; continue; }
    Object.assign(levels, step.levels ?? {});
    if (step.captain) captain = step.captain;
    for (const id of step.crew) crew[id] = true;
  }
  return {wonWave: won, levels, captain, crew, next};
}
// The wave after which a kind's level (or a crew member) first appears, or null.
export function unlockWave({kind = null, level = 1, crew = null, captain = null} = {}) {
  for (const step of UNLOCK_STEPS) {
    if (kind && (step.levels?.[kind] ?? 0) >= level) return step.wave;
    if (crew && step.crew.includes(crew)) return step.wave;
    if (captain && (step.captain ?? 0) >= captain) return step.wave;
  }
  return null;
}

// The island answer's unlocks (the backend's shape, TOWER-DEFENSE.md §9):
//   {wave, unlocked: ["wall:1", "cannon:1", "captain:1", "crew:gunner", ...], locked: {"mortar:1": 3, ...}}
// read into the plain object of unlocksFor(), plus `locked` (id -> wave). Without `unlocked` it is
// derived from unlocks.wave (or waveBest) with the table above.
export function readUnlocks(island) {
  const sent = island?.unlocks && typeof island.unlocks === 'object' ? island.unlocks : null;
  const won = Number.isSafeInteger(sent?.wave) ? sent.wave : Number.isSafeInteger(island?.waveBest) ? island.waveBest : 0;
  const base = unlocksFor(won);
  const locked = sent?.locked && typeof sent.locked === 'object' ? {...sent.locked} : {};
  if (!Array.isArray(sent?.unlocked)) return {...base, locked};
  const levels = {wall: 0, cannon: 0, mortar: 0, watchtower: 0, house: 0}, crew = {gunner: false, carpenter: false, lookout: false};
  let captain = 1;
  for (const id of sent.unlocked) {
    if (typeof id !== 'string') continue;
    const [name, value] = id.split(':');
    if (name === 'crew' && Object.hasOwn(crew, value)) crew[value] = true;
    else if (name === 'captain') captain = Math.max(captain, Number(value) || 1);
    else if (Object.hasOwn(levels, name)) levels[name] = Math.max(levels[name], Number(value) || 1);
  }
  const waves = Object.values(locked).filter(Number.isSafeInteger);
  const soonest = waves.length ? Math.min(...waves) : null;
  return {wonWave: won, levels, crew, captain, locked,
    next: soonest === null ? null : {wave: soonest, title: UNLOCK_NEWS[soonest]?.title ?? ''}};
}
// The wave after which an id ("mortar:1", "crew:gunner", "captain:4") unlocks: the server's word
// first, then the table.
export function lockedWave(unlocks, {kind = null, level = 1, crew = null, captain = null} = {}) {
  const id = kind ? `${kind}:${level}` : crew ? `crew:${crew}` : captain ? `captain:${captain}` : '';
  const sent = unlocks?.locked?.[id];
  return Number.isSafeInteger(sent) ? sent : unlockWave({kind, level, crew, captain});
}
// The unlock steps passed between two island answers (for the "New: … unlocked!" toast), oldest first.
export function newUnlocks(before, after) {
  const from = readUnlocks(before).wonWave, to = readUnlocks(after).wonWave;
  if (!before || to <= from) return [];
  return UNLOCK_STEPS.filter(step => step.wave > from && step.wave <= to && UNLOCK_NEWS[step.wave])
    .map(step => ({wave: step.wave, ...UNLOCK_NEWS[step.wave]}));
}

// The price of the next step of a spot: build (level 0 → 1) or upgrade, from the answer when it has one.
export function priceFor(kind, level, prices = null) {
  const sent = prices?.kinds?.[kind]?.[level];
  if (Number.isSafeInteger(sent)) return sent;
  return BUILDINGS[kind]?.price[level] ?? null;
}
// "Damage 10 → 16 · Range 28 → 31" or "Hp 60 → 120": what an upgrade gives.
const STAT_NAMES = {damage: 'Damage', range: 'Range', hp: 'Strength', loot: 'Loot'};
export function statLine(kind, level, nextLevel = null) {
  const now = BUILDINGS[kind]?.stats[level - 1], then = nextLevel ? BUILDINGS[kind]?.stats[nextLevel - 1] : null;
  if (!now) return '';
  const plus = kind === 'watchtower' ? '+' : '', unit = kind === 'house' ? ' 🪙' : '';
  return Object.keys(now).map(key => `${STAT_NAMES[key]} ${plus}${now[key]}${unit}${then ? ` → ${plus}${then[key]}${unit}` : ''}`).join(' · ');
}
export function captainLine(level, nextLevel = null) {
  const now = CAPTAIN.stats[level - 1], then = nextLevel ? CAPTAIN.stats[nextLevel - 1] : null;
  if (!now) return '';
  return `Damage ${now.damage}${then ? ` → ${then.damage}` : ''} · Range ${now.range}${then ? ` → ${then.range}` : ''}`;
}
