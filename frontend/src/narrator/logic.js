// The narrator's rules, pure: which lines a moment brings, what was already told on this island, and
// the queue that keeps one line at a time. No DOM, no audio, no timers (tests/narrator/*.test.js).
//
// A line's trigger is a name, or name:number for a wave (lines.json):
//   game_opening        the first Start of a game (once)      game_welcome_back  a returning crew (variant)
//   wave_start:N        waves 1 to 5 and 100 start (once)     wave_every_ten:N   waves 10, 20 ... 90 start (once)
//   wave_unlock:N       wave N won: what opens (once each)    wave_milestone:N   waves 25, 50, 75 won (once)
//   victory             wave 100 won (once)                   wave_won / wave_lost  any other result (variant)
//   boarders_ashore     the first boarders of a game (once)   player_fell / player_revived (variant)
//   all_fallen          every captain is down (variant)       heart_low          the heart below 30% (variant)
//   house_role          the first house role picked on an island (once; GAME-V3.md "Houses")
//   wave_event:ID       a wave event's first time (once)      finisher_start|won|failed:KIND  a boss finisher
// A line may list `covers` (other triggers it also answers): wave_5 is also the first boss.

import {STEPS} from '../campaign/index.js';

export const STORE_KEY = 'tgpt:narrator:v1';
// The waves whose win opens something on the island (the campaign table, src/campaign/campaign.json).
const CAMPAIGN_WAVES = new Set(STEPS.filter(step => !step.later && step.wave > 0).map(step => step.wave));
export const MAX_GAMES = 30;
export const QUEUE_LIMIT = 6;
export const HEART_LOW = 0.3;
const HIGH = 3, NORMAL = 2, LOW = 1;

// once: told once per island game. priority: higher plays first. ttl: ms a queued line may wait.
// cooldown: ms before a repeatable trigger may speak again.
export const RULES = Object.freeze({
  game_opening: {once: true, priority: HIGH, ttl: null},
  game_welcome_back: {once: false, priority: NORMAL, ttl: 20000},
  wave_start: {once: true, priority: HIGH, ttl: 15000},
  boss_first: {once: true, priority: HIGH, ttl: 15000},
  wave_every_ten: {once: true, priority: NORMAL, ttl: 15000},
  wave_unlock: {once: true, priority: HIGH, ttl: null},
  wave_milestone: {once: true, priority: NORMAL, ttl: 30000},
  victory: {once: true, priority: HIGH, ttl: null},
  boarders_ashore: {once: true, priority: HIGH, ttl: 10000},
  player_fell: {once: false, priority: NORMAL, ttl: 6000, cooldown: 30000},
  player_revived: {once: false, priority: LOW, ttl: 5000, cooldown: 30000},
  all_fallen: {once: false, priority: HIGH, ttl: 8000, cooldown: 60000},
  heart_low: {once: false, priority: HIGH, ttl: 6000},
  house_role: {once: true, priority: NORMAL, ttl: 15000},
  wave_lost: {once: false, priority: NORMAL, ttl: 6000},
  wave_won: {once: false, priority: LOW, ttl: 6000},
  // v3 waves: a wave event's first appearance (wave_event:<id>, once per game) and a boss finisher's start and
  // outcome (finisher_start:<kind>, finisher_won:<kind>, finisher_failed:<kind>), every time, short-lived.
  wave_event: {once: true, priority: HIGH, ttl: 15000},
  finisher_start: {once: false, priority: HIGH, ttl: 4000},
  finisher_won: {once: false, priority: HIGH, ttl: 5000},
  finisher_failed: {once: false, priority: HIGH, ttl: 5000},
});
const VARIANTS = new Set(['game_welcome_back', 'player_fell', 'player_revived', 'all_fallen', 'heart_low', 'wave_lost', 'wave_won']);
const LINE_ID = /^[a-z0-9_]{1,48}$/;

export function parseTrigger(trigger) {
  const [name, value] = String(trigger ?? '').split(':');
  const number = value === undefined ? null : Number(value);
  return {name, wave: Number.isSafeInteger(number) ? number : null};
}
export const ruleFor = trigger => RULES[parseTrigger(trigger).name] ?? null;

// lines.json -> Map(trigger -> [line]) in file order; lines with a bad id, no text or an unknown trigger are left out.
export function indexLines(lines = []) {
  const index = new Map();
  for (const line of Array.isArray(lines) ? lines : []) {
    if (!line || !LINE_ID.test(line.id ?? '') || typeof line.text !== 'string' || !line.text.trim()) continue;
    for (const trigger of [line.trigger, ...(Array.isArray(line.covers) ? line.covers : [])]) {
      if (!ruleFor(trigger)) continue;
      if (!index.has(trigger)) index.set(trigger, []);
      index.get(trigger).push(line);
    }
  }
  return index;
}

// The lines one trigger brings now. told: Set of line ids and trigger names already told in this game.
// Variants pick one line by the seed (the wave number), so wave 7 always hears the same one.
export function selectLines(index, trigger, {told = new Set(), seed = 0} = {}) {
  const rule = ruleFor(trigger), lines = index.get(trigger) ?? [];
  if (!rule || lines.length === 0) return [];
  if (rule.once && told.has(trigger)) return [];
  if (VARIANTS.has(parseTrigger(trigger).name)) {
    const pick = Math.abs(Math.trunc(Number(seed) || 0)) % lines.length;
    return [lines[pick]];
  }
  return lines.filter(line => !told.has(line.id));
}

// Waves whose start has its own line, and the ones a win brings.
export function startTriggers(wave, {boss = false} = {}) {
  if (!Number.isSafeInteger(wave) || wave < 1) return [];
  const triggers = [];
  if (wave <= 5 || wave === 100) triggers.push(`wave_start:${wave}`);
  if (wave % 10 === 0 && wave < 100) triggers.push(`wave_every_ten:${wave}`);
  if (boss && wave !== 5) triggers.push('boss_first');
  return triggers;
}
// What a wave's result brings. The unlock lines (wave_unlock:N) are not here: they come with the campaign's
// campaign_unlocked {wave, ids} (src/island/index.js, GAME-V3.md §4), once the island answer says what opened.
export function finishTriggers(wave, survived) {
  if (!survived) return ['wave_lost'];
  if (!Number.isSafeInteger(wave) || wave < 1) return ['wave_won'];
  if (wave >= 100) return ['victory'];
  return [`wave_milestone:${wave}`];
}
// The generic "wave won" line, when a win brings nothing else: every wave up to 10, then every third, never
// a wave that opens something (its campaign_unlocked lines follow a moment later).
export const wonLineDue = wave => !Number.isSafeInteger(wave)
  || (!CAMPAIGN_WAVES.has(wave) && (wave <= 10 || wave % 3 === 0));

// Reading time for a caption without audio: about 15 characters a second, at least 3 s, at most 11 s.
export const readingMs = text => Math.max(3000, Math.min(11000, 1200 + String(text ?? '').length * 65));

// The island game's key: ISLE-XXXXX from any spelling of a code, or the given fallback.
export function gameKey(code, fallback = 'local') {
  if (typeof code !== 'string') return fallback;
  if (code === 'pirate_point') return code;
  const symbols = code.replace(/[\s-]/g, '').toUpperCase().replace(/^ISLE(?=[A-Z0-9]{5}$)/, '');
  return /^[A-Z0-9]{5}$/.test(symbols) ? `ISLE-${symbols}` : fallback;
}

// What this device told on which island game, in localStorage under STORE_KEY:
//   {version: 1, games: {"ISLE-K7Q2M": {told: ["opening_1", "game_opening", ...], at: 1731300000000}}}
// The newest MAX_GAMES games are kept. Storage may be missing or full: then it is kept for this visit.
export function createMemory(storage, {now = () => Date.now()} = {}) {
  let data = {version: 1, games: {}};
  try {
    const saved = JSON.parse(storage?.getItem(STORE_KEY) ?? 'null');
    if (saved?.version === 1 && saved.games && typeof saved.games === 'object') data = saved;
  } catch { /* A fresh memory. */ }
  const game = key => {
    const entry = data.games[key];
    return entry && Array.isArray(entry.told) ? entry : (data.games[key] = {told: [], at: now()});
  };
  function save() {
    const keys = Object.keys(data.games).sort((a, b) => (data.games[b].at ?? 0) - (data.games[a].at ?? 0));
    for (const key of keys.slice(MAX_GAMES)) delete data.games[key];
    try { storage?.setItem(STORE_KEY, JSON.stringify(data)); } catch { /* Kept for this visit. */ }
  }
  return {
    told(key) { return new Set(data.games[key]?.told ?? []); },
    known(key) { return (data.games[key]?.told?.length ?? 0) > 0; },
    mark(key, ids) {
      const entry = game(key), set = new Set(entry.told);
      for (const id of ids) if (typeof id === 'string' && id) set.add(id);
      entry.told = [...set].slice(-400); entry.at = now(); save();
    },
  };
}

// One line at a time: the highest priority first, then the oldest; a line past its ttl is dropped,
// and beyond QUEUE_LIMIT the lowest-priority, oldest line leaves.
export function createQueue({now = () => Date.now(), limit = QUEUE_LIMIT} = {}) {
  let items = [], order = 0;
  const fresh = () => { const time = now(); items = items.filter(item => item.expiresAt === null || item.expiresAt > time); };
  return {
    push(line, {priority = NORMAL, ttl = null, tag = null} = {}) {
      fresh();
      if (items.some(item => item.line.id === line.id)) return false;
      items.push({line, priority, tag, order: order++, expiresAt: ttl === null ? null : now() + ttl});
      while (items.length > limit) {
        const worst = items.reduce((low, item) => (item.priority < low.priority || (item.priority === low.priority && item.order < low.order) ? item : low));
        items = items.filter(item => item !== worst);
      }
      return items.some(item => item.line.id === line.id);
    },
    next() {
      fresh();
      if (!items.length) return null;
      const best = items.reduce((top, item) => (item.priority > top.priority || (item.priority === top.priority && item.order < top.order) ? item : top));
      items = items.filter(item => item !== best);
      return best;
    },
    // Drop queued lines that no longer fit the moment (a new wave began): those below the given priority.
    dropBelow(priority) { items = items.filter(item => item.priority >= priority); },
    clear() { items = []; },
    get size() { fresh(); return items.length; },
    get ids() { fresh(); return items.map(item => item.line.id); },
  };
}
export const PRIORITY = Object.freeze({HIGH, NORMAL, LOW});
