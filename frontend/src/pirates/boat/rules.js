// The own boat's games (D057, docs/GAME-V3.md §4.5). Pure and deterministic, like the boss finishers
// (../finisher/rules.js): no DOM, no clock. A round is BOAT.samples samples of 100 ms (the finisher's sample);
// what the player did is one value per sample, and the score is a pure function of those samples, the
// round's salt (the island code, its best wave and the game) and the wave's difficulty (../finisher/difficulty.js).
// So every captain of a crew sails the same sea at the same wave, and the same input always scores the same.
//
//   broadside  Broadside duel: enemy ships sail across; fire when one is in the gold band in front of your guns.
//              A sample's value is 1 for a shot (or -1). A hit sinks the ship (+1), a hit in the band's middle
//              third is a bullseye (+2), a miss costs 1 (never below 0). The guns reload for BOAT.broadside.cooldown samples after every shot, so firing blind sinks little.
//   dash       Treasure dash: steer your boat left and right; coins and cannonballs come at you down the sea.
//              A sample's value is the boat's place (0-100). A coin under the boat when it arrives: +1; a
//              cannonball: -2 (then a short moment of shelter). The score never goes below 0.
//
// Stars: the share of the round's best score (BOAT[game].stars). Coins: stars × (coinsBase + wave / coinsPerWaves),
// paid by the server once per player, island and best won wave (backend/server/island/boat.py, boat.json).
import table from './boat.json';
import { difficultyFor } from '../finisher/difficulty.js';
import { clamp } from '../../core/math.js';

export const BOAT = Object.freeze({
  sampleMs: 100,
  samples: 200,           // a 20 s round
  intro: 30,              // 3 s of the picture card and the count-down before the round
  games: Object.freeze([...table.games]),
  stars: table.stars,
  coins: Object.freeze({ base: table.coinsBase, perWaves: table.coinsPerWaves, maxWave: table.maxWave }),
  broadside: Object.freeze({ cross: 27, gap: 4, cooldown: 8, bull: 1 / 3, stars: Object.freeze([.25, .5, .75]) }),
  dash: Object.freeze({ fall: 26, ballCost: 2, shelter: 8, ballReach: .8, steer: 115, stars: Object.freeze([.4, .65, .85]) }),
});
// The few words of each game (the pictures on the stage say the rest).
export const GAME_TEXT = Object.freeze({
  broadside: Object.freeze({ title: 'Broadside duel', icon: '💥', hint: 'Fire when a ship is in the gold band' }),
  dash: Object.freeze({ title: 'Treasure dash', icon: '🪙', hint: 'Steer: grab coins, dodge cannonballs' }),
});

// A small seeded dice (mulberry32): the same salt, the same sea.
export function dice(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** The round's salt: the island, its best won wave and the game (FNV-1a, like the duel's prompts). */
export function boatSalt(code, wave, game) {
  let hash = 2166136261 >>> 0;
  for (const char of `${String(code ?? '').toUpperCase()}#${Math.trunc(Number(wave) || 0)}#${game}`) hash = Math.imul(hash ^ char.codePointAt(0), 16777619) >>> 0;
  return hash >>> 0;
}
/** The round's numbers at this wave (the boat's two curves in difficulty.js). */
export const boatDifficulty = (game, wave) => difficultyFor(game, wave);
const sortedOf = samples => [...samples].filter(([s]) => Number.isInteger(s) && s >= 0 && s < BOAT.samples).sort((a, b) => a[0] - b[0]);

// ---- Broadside duel ----------------------------------------------------------------------------------
/** The enemy ships of a round: [{k, from, to, dir, kind}], one after another, each crossing the whole sea. */
export function passesOf(salt, difficulty = boatDifficulty('broadside')) {
  const roll = dice(salt ^ 0xb0a7), out = [], K = BOAT.broadside;
  let at = 6;
  for (let k = 0; k < 40; k++) {
    const kind = k > 0 && roll() < .3 ? 'cutter' : 'brig'; // a cutter is small and quick
    const pace = (kind === 'cutter' ? 1.3 : .85) + roll() * .25;
    const length = Math.max(10, Math.round(K.cross / (difficulty.speed * pace)));
    const dir = roll() < .5 ? 1 : -1;
    if (at + length > BOAT.samples) break;
    out.push(Object.freeze({ k, from: at, to: at + length, dir, kind }));
    at += length + K.gap + Math.floor(roll() * 5);
  }
  return out;
}
/** Where a ship is at (fractional) sample s: 0 = the left edge, 100 = the right edge. */
export const enemyX = (pass, s) => {
  const t = (s - pass.from) / (pass.to - pass.from);
  return pass.dir > 0 ? t * 100 : 100 - t * 100;
};
/** The ship on the sea at sample s (or null). */
export const passAt = (passes, s) => passes.find(pass => s >= pass.from && s < pass.to) ?? null;
/**
 * What one shot at sample s does: 'bull', 'hit' or 'miss'. The band's half-width comes from the difficulty; the
 * ship is where it is in the middle of the sample. A fast ship moves more than a bullseye's width in one sample,
 * so the bullseye is never narrower than half a sample's move: every ship has at least one bullseye sample.
 */
export function shotAt(pass, s, width) {
  if (!pass) return 'miss';
  const off = Math.abs(enemyX(pass, s + .5) - 50), step = 100 / (pass.to - pass.from);
  return off <= Math.max(width * BOAT.broadside.bull, step / 2 + 1e-9) ? 'bull' : off <= Math.max(width, step / 2 + 1e-9) ? 'hit' : 'miss';
}
export function scoreBroadside(samples, { salt = 0, easy = false, difficulty = boatDifficulty('broadside') } = {}) {
  const passes = passesOf(salt, difficulty), width = easy ? difficulty.easyWidth : difficulty.width, sunk = new Set();
  let score = 0, hits = 0, bulls = 0, shots = 0, misses = 0, last = -Infinity;
  for (const [s, value] of sortedOf(samples)) {
    if (value !== 1 || s - last < BOAT.broadside.cooldown) continue; // the guns reload between shots
    last = s; shots++;
    const pass = passAt(passes, s);
    const shot = !pass || sunk.has(pass.k) ? 'miss' : shotAt(pass, s, width);
    if (shot === 'miss') { misses++; continue; } // a ball into empty sea costs one: aim, do not spray
    sunk.add(pass.k); hits++; score++;
    if (shot === 'bull') { bulls++; score++; }
  }
  return { score: Math.max(0, score - misses), hits, bulls, shots, misses, max: passes.length * 2, ships: passes.length };
}

// ---- Treasure dash -----------------------------------------------------------------------------------
/** The coins and cannonballs of a round: [{id, at, x, kind}] sorted by when they reach the boat. */
export function itemsOf(salt, difficulty = boatDifficulty('dash')) {
  const roll = dice(salt ^ 0xd45a), coins = [], balls = [];
  let at = 18;
  while (at < BOAT.samples - 8) {
    const shape = Math.floor(roll() * 3), x0 = 16 + roll() * 68, side = roll() < .5 ? -1 : 1;
    for (let i = 0; i < 4; i++) {
      // A line, a diagonal or an arc of four coins: something to follow.
      const x = shape === 0 ? x0 : shape === 1 ? x0 + side * i * 7 : x0 + side * Math.sin(i / 3 * Math.PI) * 14;
      coins.push({ at: at + i * 2, x: Math.round(clamp(x, 6, 94) * 10) / 10, kind: 'coin' });
    }
    at += 13 + Math.floor(roll() * 6);
  }
  const step = (BOAT.samples - 26) / difficulty.balls;
  for (let i = 0; i < difficulty.balls; i++) {
    const when = Math.round(16 + (i + roll() * .8) * step);
    let x = 8 + roll() * 84;
    // Never a ball right on a coin arriving at the same moment: the player always has a fair way through.
    for (let tries = 0; tries < 4 && coins.some(c => Math.abs(c.at - when) <= 2 && Math.abs(c.x - x) < 14); tries++) x = 8 + ((x - 8 + 31) % 84);
    balls.push({ at: when, x: Math.round(x * 10) / 10, kind: 'ball' });
  }
  return [...coins, ...balls].sort((a, b) => a.at - b.at || a.x - b.x).map((item, id) => Object.freeze({ id, ...item }));
}
/** Samples an item is on screen before it reaches the boat (shorter at a higher wave). */
export const fallOf = (difficulty = boatDifficulty('dash')) => Math.max(10, Math.round(BOAT.dash.fall / difficulty.speed));
export function scoreDash(samples, { salt = 0, easy = false, difficulty = boatDifficulty('dash') } = {}) {
  const items = itemsOf(salt, difficulty), reach = easy ? difficulty.easyCatch : difficulty.catch, at = new Map(sortedOf(samples));
  let coins = 0, hits = 0, shelterUntil = -Infinity;
  const total = items.filter(item => item.kind === 'coin').length;
  for (const item of items) {
    const x = at.get(item.at);
    if (!Number.isFinite(x) || x < 0 || x > 100) continue;
    const off = Math.abs(x - item.x);
    if (item.kind === 'coin' && off <= reach) coins++;
    else if (item.kind === 'ball' && off <= reach * BOAT.dash.ballReach && item.at >= shelterUntil) { hits++; shelterUntil = item.at + BOAT.dash.shelter; }
  }
  return { score: Math.max(0, coins - BOAT.dash.ballCost * hits), coins, hits, max: total, balls: items.length - total };
}

// ---- both games ----------------------------------------------------------------------------------------
export function scoreOf(game, samples, options = {}) {
  if (game === 'broadside') return scoreBroadside(samples, { ...options, difficulty: options.difficulty ?? boatDifficulty('broadside', options.wave) });
  if (game === 'dash') return scoreDash(samples, { ...options, difficulty: options.difficulty ?? boatDifficulty('dash', options.wave) });
  throw new Error(`unknown boat game: ${game}`);
}
/** 0 to 3 stars for a score out of max. */
export function starsOf(game, { score = 0, max = 0 } = {}) {
  const share = max > 0 ? score / max : 0;
  return BOAT[game].stars.filter(need => share >= need - 1e-9).length;
}
/** The coins a round pays at this wave (the server's formula, boat.py): stars × (base + wave / perWaves). */
export function coinsFor(stars, wave) {
  const n = clamp(Math.trunc(Number(stars) || 0), 0, BOAT.stars), w = clamp(Math.trunc(Number(wave) || 0), 0, BOAT.coins.maxWave);
  return n * (BOAT.coins.base + Math.floor(w / BOAT.coins.perWaves));
}
