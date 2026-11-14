// Minigame difficulty by wave (T39, specs/T38-T39-minigames-rescue.md). Pure numbers, no DOM, no clock.
//
// Every minigame of the waves (the boss finishers haul, cannon and duel, and the last-chance rescue) has
// three kinds of difficulty:
//   speed         how fast the target moves (the haul's green zone, the cannon's weak spot);
//   timing        how wide the window is (width, easyWidth) or how long an arrow waits (prompt, easyPrompt);
//   error budget  how much may go wrong: share is the part of the time/prompts that must be right (the rest is
//                 the budget), hits is how many cannon shots must land of the about 20 a reload allows.
// Each number moves in a straight line from its early value (today's numbers, kept up to wave 10, so the boss
// finishers of waves 5 and 10 play exactly as before) to its late value at wave 100, and never past it:
//   pressure(wave) = (wave - 10) / 90, kept between 0 and 1.
// Whole numbers (hits, prompt samples) are rounded, so they change at a few known waves only.
//
// The shared snapshot: a finisher reads difficultySnapshot(tasks, wave) once, when it starts, from the wave
// number the server handed out. Every client of that wave computes the same numbers, and a captain who joins
// later does not change them. How many captains share the work is a separate rule (rules.js crewScale).
export const CALM_UNTIL = 10;   // up to this wave: the early numbers
export const FULL_AT = 100;     // from this wave: the late numbers

// [early, late] for each number of each minigame. Early = today's FINISHER.tasks (rules.js; a test keeps them equal).
export const CURVES = Object.freeze({
  haul: Object.freeze({ speed: [1, 1.3], width: [12, 10], easyWidth: [18, 15], share: [.6, .65] }),
  cannon: Object.freeze({ speed: [1, 1.3], width: [8, 7], easyWidth: [12, 10.5], hits: [7, 8] }),
  duel: Object.freeze({ prompt: [9, 7], easyPrompt: [13, 11], share: [.55, .6] }),
  // The last-chance rescue (rescue.js) is kinder than a boss: a comeback should feel possible.
  rescue: Object.freeze({ speed: [.85, 1.15], width: [14, 12], easyWidth: [20, 17], share: [.5, .58] }),
});
const WHOLE = new Set(['hits', 'prompt', 'easyPrompt']);

/** 0 for waves up to 10 (and for a missing or broken wave), 1 from wave 100, evenly in between. */
export function pressure(wave) {
  const n = typeof wave === 'number' && Number.isFinite(wave) ? Math.trunc(wave) : 1;
  return Math.max(0, Math.min(1, (n - CALM_UNTIL) / (FULL_AT - CALM_UNTIL)));
}

/** The numbers of one minigame at one wave. Without a wave: the early numbers. */
export function difficultyFor(task, wave) {
  const curve = CURVES[task];
  if (!curve) throw new Error(`unknown minigame: ${task}`);
  const p = pressure(wave), out = {};
  for (const [key, [early, late]] of Object.entries(curve)) {
    const value = early + (late - early) * p;
    out[key] = WHOLE.has(key) ? Math.round(value) : Math.round(value * 100) / 100;
  }
  return out;
}

/** The frozen numbers of every task of one minigame run ({haul: {...}, ...}), shared by every client. */
export function difficultySnapshot(tasks, wave) {
  return Object.freeze(Object.fromEntries(tasks.map(task => [task, Object.freeze(difficultyFor(task, wave))])));
}
