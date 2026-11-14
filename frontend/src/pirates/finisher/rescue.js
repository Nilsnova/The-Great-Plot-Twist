// The last-chance rescue (T38, specs/T38-T39-minigames-rescue.md, decision D044). When the island's heart falls
// (island_lost) or every captain is down (captains_fallen), the wave is lost. Before it ends, the captains still on
// the island, fallen ones too, get one short co-op haul: keep the needle in the green zone and haul the treasure
// chest to safety. The wave stays lost either way (no loot, no flag, no best wave); the rescue only decides how
// far the next bell falls back, and the server decides that from the finish (backend/server/island/rescue.py):
//   saved  -> the next bell rings the island's best wave minus 1 (at least 1)
//   lost   -> the next bell rings the best wave minus 2 (at least 1), the rule of today
// Coins, buildings, crew, weapons, research and every best score are kept in both cases.
//
// Like the boss finisher (rules.js), the rules are pure and deterministic: every client runs them from the same
// synced finisher_input / finisher_ready messages (the same wire format; the ship id is RESCUE.shipId), so every
// screen sees the same progress and outcome. The scoring is the haul's (scoreOf 'rescue', difficulty.js 'rescue').
// The wave's simulation (sim.js) holds its end while the rescue runs; that small hook is described in the spec.
//
//   const rescue = createRescue({wave, seed, enabled, preparation, gapMs});
//   rescue.bind({party, presentAt, now, heart});
//   rescue.offer(reason, events)  -> true: wait, the rescue runs (call again: true while it runs, false once over)
//   rescue.tick(events)           -> true while it runs (the battle stands still meanwhile)
//   rescue.input(input); rescue.state() (finisher-shaped, null when none runs); rescue.result() -> {rescued: true} | {}
import { FINISHER, goalOf, graceSamples, scoreOf } from './rules.js';
import { difficultySnapshot } from './difficulty.js';

export const RESCUE = Object.freeze({
  fromWave: 4,          // below wave 4 both fallbacks give wave 1 (best <= 2), so nothing could be saved
  lastWave: 100,
  shipId: 'rescue',     // the id its finisher_ready messages name (any ship-id-shaped word would do)
  prepareTicks: 400,    // at most 20 seconds to read and practice (T28), then it starts anyway
  intro: 20,            // samples of the title card ("Last chance!")
  samples: 100,         // the haul itself: 10 seconds
  outroWon: 26,
  outroFailed: 22,
});
export const RESCUE_REASONS = Object.freeze(['island_lost', 'captains_fallen']);
/** Whether a lost wave of this number can be rescued (the server repeats this rule: rescue.py). */
export const rescueAllowed = wave => Number.isInteger(wave) && wave >= RESCUE.fromWave && wave <= RESCUE.lastWave;

export function createRescue(ctx = {}) {
  const wave = ctx.wave, enabled = ctx.enabled === true;
  let sim = null, run = null, offered = false, outcome = null, reason = null;
  const round2 = value => Math.round(value * 100) / 100;

  // Everybody still on the island: standing or fallen, but heard lately (presentAt). Sorted, so every client agrees.
  const participants = t => [...sim.party.values()].filter(hero => sim.presentAt(hero, t)).map(hero => hero.id).sort();
  function salt() {
    let hash = (Number(ctx.seed) >>> 0) ^ 0x5bd1e995;
    for (const char of RESCUE.shipId) hash = Math.imul(hash ^ char.codePointAt(0), 16777619) >>> 0;
    return hash >>> 0;
  }
  function progress() {
    const from = RESCUE.intro, to = from + RESCUE.samples, d = run.difficulty.rescue, mine = {};
    let total = 0;
    for (const by of run.players) {
      const local = new Map();
      for (const [s, value] of run.marks.get(by) ?? []) if (s >= from && s < to) local.set(s - from, value);
      const score = scoreOf('rescue', by, local, { salt: run.salt, easy: run.easy.get(by) === true, length: RESCUE.samples, difficulty: d });
      mine[by] = score; total += score;
    }
    const goal = goalOf('rescue', run.players, { easy: run.easy, difficulty: d });
    return { task: 'rescue', from, to, score: total, goal, cleared: total >= goal, players: mine };
  }
  function decide(events) {
    const item = progress();
    outcome = item.cleared ? 'won' : 'failed';
    run.phase = outcome;
    run.outroEnd = Math.floor(run.ticks / FINISHER.tick) + (item.cleared ? RESCUE.outroWon : RESCUE.outroFailed);
    events.push({ type: item.cleared ? 'rescue_won' : 'rescue_failed', t: sim.now(), reason, score: item.score, goal: item.goal });
  }

  return {
    get active() { return run !== null; },
    get reason() { return reason; },
    get outcome() { return outcome; },
    bind(handles) { sim = handles; },
    offer(why, events) {
      if (run) return true;           // already running: the wave keeps waiting
      if (offered) return false;      // once per wave: now the wave may end
      offered = true;
      if (!enabled || !sim || !rescueAllowed(wave) || !RESCUE_REASONS.includes(why)) return false;
      const players = participants(sim.now());
      if (!players.length) return false; // nobody left on the island: the wave ends as before
      reason = why;
      const heart = sim.heart ?? { x: 0, z: 0 };
      const timing = graceSamples(players.length, ctx.gapMs?.(players.length) ?? 200);
      run = { players, salt: salt(), ticks: 0, marks: new Map(), easy: new Map(), ready: new Set(), prepareTicks: 0,
        phase: ctx.preparation ? 'prepare' : 'intro', end: RESCUE.intro + RESCUE.samples, decide: RESCUE.intro + RESCUE.samples + timing,
        outroEnd: null, x: round2(heart.x), z: round2(heart.z), difficulty: difficultySnapshot(['rescue'], wave), version: 0, cache: null };
      events.push({ type: 'rescue_started', t: sim.now(), reason, players: [...players], goal: progress().goal, x: run.x, z: run.z });
      return true;
    },
    input(input) {
      if (!run || outcome) return;
      const by = input?.by;
      if (typeof by !== 'string' || !run.players.includes(by)) return; // a watcher's input does nothing
      if (input.type === 'finisher_ready') {
        if (run.phase === 'prepare' && input.shipId === RESCUE.shipId) run.ready.add(by);
        return;
      }
      if (input.type !== 'finisher_input' || run.phase === 'prepare') return; // practice samples never score
      if (!Number.isInteger(input.from) || !Array.isArray(input.marks) || input.marks.length < 1 || input.marks.length > FINISHER.marks) return;
      if (!run.easy.has(by)) run.easy.set(by, input.easy === true);
      let mine = run.marks.get(by);
      if (!mine) run.marks.set(by, mine = new Map());
      input.marks.forEach((value, i) => {
        const s = input.from + i;
        if (!Number.isInteger(value) || value < -1 || value > 100 || mine.has(s) || s < RESCUE.intro || s >= run.end) return;
        mine.set(s, value);
      });
      run.version++;
    },
    tick(events) {
      if (!run) return false;
      if (run.phase === 'prepare') {
        run.prepareTicks++;
        if (run.players.every(by => run.ready.has(by)) || run.prepareTicks >= RESCUE.prepareTicks) run.phase = 'intro';
        return true;
      }
      run.ticks++;
      const sample = Math.floor(run.ticks / FINISHER.tick);
      if (run.phase === 'intro' && sample >= RESCUE.intro) run.phase = 'task';
      if (run.phase === 'task' && sample >= run.end) run.phase = 'grace';
      if (run.phase === 'grace' && sample >= run.decide) decide(events);
      if (outcome && sample >= run.outroEnd) {
        events.push({ type: 'rescue_ended', t: sim.now(), outcome, reason });
        run = null;
        return false;
      }
      return true;
    },
    // The scene and the controller draw it like a finisher (finisher/scene.js): kind 'rescue', one task.
    state() {
      if (!run) return null;
      const sample = Math.floor(run.ticks / FINISHER.tick);
      if (!run.cache || run.cache.version !== run.version) run.cache = { version: run.version, item: progress() };
      return { active: true, kind: 'rescue', reason, phase: run.phase, outcome, shipId: RESCUE.shipId, shipKind: null, x: run.x, z: run.z,
        ticks: run.ticks, sample, salt: run.salt, players: [...run.players], task: 0,
        tasks: [{ ...run.cache.item, players: { ...run.cache.item.players } }],
        ready: [...run.ready].sort(), prepareLeft: Math.max(0, (RESCUE.prepareTicks - run.prepareTicks) / 20),
        taskEnd: run.end, decide: run.decide, outroEnd: run.outroEnd, easy: Object.fromEntries(run.easy),
        heard: [...run.marks.keys()].sort(), difficulty: run.difficulty };
    },
    /** What the wave's result adds: rescued only after a won rescue (the server reads it on a lost finish). */
    result: () => (outcome === 'won' ? { rescued: true } : {}),
  };
}
