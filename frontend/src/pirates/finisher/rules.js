// Boss finishers (docs/GAME-V3.md §4.3): when a boss ship drops below a quarter of its hull, the battle
// freezes and the whole crew does one short task together to bring her down. Pure and deterministic: the
// sim (src/pirates/sim.js) runs createFinisher() from synced finisher_input messages, so every screen sees
// the same progress and the same outcome. The scene (scene.js) draws it and collects this player's input.
//
// The clock: the battle's ticks stand still while a finisher runs; the finisher counts its own ticks, and
// every two of them (100 ms) are one *sample*. A player's input says what they did in each sample: the
// needle's place while hauling (or -1), the crosshair's place when they fired (or -1), the arrow they
// pressed (0 up, 1 right, 2 down, 3 left; or -1). The sim scores the samples against the task's moving
// target, which is a pure function of the sample and the finisher's salt, so the score depends only on
// the set of samples heard, never on when they arrived. Inputs come aggregated, one message per player
// per window (at least 0.5 s, 2 x the room's wave gap with more players), so ten players stay in the
// room's budget; a grace time after the task lets the last windows arrive before the outcome is decided.
//
// Tasks by boss: haul the chain (waves 5 and 10), aim the great cannon (15 to 25), board and duel (30+),
// and Captain Redtide's ship at wave 100 all three in a row (two of the three cleared wins).
// The goal grows with the captains present at the start (standing and in the wave), a little less than
// in proportion, so one captain alone can win every finisher; a fallen captain or one not in the wave watches.
export const FINISHER = Object.freeze({
  trigger: .25,         // a boss below this share of its hull starts a finisher
  regain: .15,          // a failed finisher: the boss breaks free with this share of its hull back
  tick: 2,              // sim ticks per sample (100 ms)
  intro: 16,            // samples of the title card before the task
  outroWon: 26,         // samples of the sinking after a win
  outroFailed: 18,      // samples of the boss breaking free
  windowMs: 500,        // a player's input window: at least this, or 2 x the room's wave gap
  marks: 24,            // at most this many samples in one message
  scaleMost: .2,        // ten captains need 20% less each than one alone
  tasks: Object.freeze({
    haul: Object.freeze({ samples: 100, share: .6, width: 12, easyWidth: 18 }),             // 60% of the time in the zone
    cannon: Object.freeze({ samples: 100, hits: 7, width: 8, easyWidth: 12, cooldown: 5 }), // 7 hits on the weak spot, a 0.5 s reload
    duel: Object.freeze({ samples: 99, share: .55, prompt: 9, easyPrompt: 13 }),             // 55% of the prompts, net of mistakes
  }),
  redtideSamples: 80,   // each of Redtide's three tasks
  redtideNeeds: 2,      // tasks of three to clear
});
export const FINISHER_KINDS = Object.freeze(['haul', 'cannon', 'duel', 'redtide']);
const BOSS_KINDS = new Set(['warship', 'dreadnought', 'redtide']);
export const isFinisherBoss = ship => !!ship && ship.boss === true && BOSS_KINDS.has(ship.kind);
/** Which finisher a boss brings: by its kind and the wave (the boss tiers keep it fresh). */
export function finisherKind(ship, wave) {
  if (ship?.kind === 'redtide') return 'redtide';
  if (wave >= 30) return 'duel';
  if (wave >= 15) return 'cannon';
  return 'haul';
}
export const tasksOf = kind => (kind === 'redtide' ? ['haul', 'cannon', 'duel'] : [kind]);
const lengthOf = (task, redtide) => (redtide ? FINISHER.redtideSamples : FINISHER.tasks[task].samples);
/** Each captain's share of the work: ten captains need 20% less each than one alone. */
export const crewScale = n => 1 - FINISHER.scaleMost * (Math.max(1, Math.min(10, n)) - 1) / 9;
/** Samples of grace after the last task: the slowest window and its trip through the room. */
export function graceSamples(players, gapMs) {
  const windowMs = windowMsFor(players, gapMs);
  return Math.ceil((windowMs + 2 * gapMs + 500) / 100);
}
export const windowMsFor = (players, gapMs) => Math.max(FINISHER.windowMs, 2 * (Number.isFinite(gapMs) ? gapMs : 200));

// The moving targets, pure functions of the sample (s, from the start of the task) and the salt.
const wobble = (salt, k) => ((salt >>> (k * 5)) & 31) / 31;
/** Haul: the green zone's centre on the gauge (0-100). */
export function zoneAt(s, salt = 0) {
  const p = wobble(salt, 0) * Math.PI * 2;
  return 50 + 28 * Math.sin(s / 16 + p) + 10 * Math.sin(s / 6.3 + p * 2);
}
/** Aim: the weak spot's place along the hull (0-100). */
export function spotAt(s, salt = 0) {
  const p = wobble(salt, 1) * Math.PI * 2;
  return 50 + 34 * Math.sin(s / 14 + p) + 6 * Math.sin(s / 5 + p * 3);
}
/** Duel: the arrow of prompt k for one captain (0 up, 1 right, 2 down, 3 left). */
export function promptAt(by, k, salt = 0) {
  let hash = (2166136261 ^ salt) >>> 0;
  for (const char of `${by}#${k}`) hash = Math.imul(hash ^ char.codePointAt(0), 16777619) >>> 0;
  return (hash >>> 7) % 4;
}
export const promptLength = easy => (easy ? FINISHER.tasks.duel.easyPrompt : FINISHER.tasks.duel.prompt);
export const ARROWS = Object.freeze(['up', 'right', 'down', 'left']);

/** One task's goal for these captains: {by: easy?} decides the duel's prompts. */
export function goalOf(task, players, { redtide = false, easy = new Map() } = {}) {
  const n = Math.max(1, players.length), scale = crewScale(n), T = lengthOf(task, redtide), K = FINISHER.tasks[task];
  if (task === 'haul') return Math.max(1, Math.ceil(T * K.share * n * scale));
  if (task === 'cannon') return Math.max(1, Math.ceil(K.hits * (T / K.samples) * n * scale));
  const prompts = players.reduce((sum, by) => sum + Math.floor(T / promptLength(easy.get(by) === true)), 0);
  return Math.max(1, Math.ceil(prompts * K.share * scale));
}

/** One captain's score in one task from their samples (Map sample -> value, s from the start of the task). */
export function scoreOf(task, by, samples, { salt = 0, easy = false, length } = {}) {
  const K = FINISHER.tasks[task], T = length ?? K.samples;
  const sorted = [...samples].filter(([s]) => s >= 0 && s < T).sort((a, b) => a[0] - b[0]);
  if (task === 'haul') {
    const width = easy ? K.easyWidth : K.width;
    return sorted.reduce((sum, [s, value]) => sum + (value >= 0 && Math.abs(value - zoneAt(s, salt)) <= width ? 1 : 0), 0);
  }
  if (task === 'cannon') {
    const width = easy ? K.easyWidth : K.width;
    let hits = 0, last = -Infinity;
    for (const [s, value] of sorted) {
      if (value < 0 || s - last < K.cooldown) continue; // the great cannon reloads between shots
      last = s;
      if (Math.abs(value - spotAt(s, salt)) <= width) hits++;
    }
    return hits;
  }
  // The duel: the first arrow pressed in a prompt's time counts; the right one +1, a wrong one -1.
  const L = promptLength(easy), decided = new Set();
  let score = 0;
  for (const [s, value] of sorted) {
    if (value < 0 || value > 3) continue;
    const k = Math.floor(s / L);
    if (decided.has(k) || (k + 1) * L > T) continue;
    decided.add(k);
    score += value === promptAt(by, k, salt) ? 1 : -1;
  }
  return score;
}

/**
 * The finisher of one wave, inside the sim. ctx: {wave, seed, enabled, gapMs(players)}; bind({party, presentAt,
 * damageShip, now}) once the sim's lists exist. watch(ship) after a boss is hurt: true holds it at 1 hp
 * while its finisher is about to start; begin(events) at the end of that tick; tick(events) every tick
 * while active (the sim skips the battle); input(input) a finisher_input; state(); bonuses().
 */
export function createFinisher(ctx = {}) {
  const wave = ctx.wave ?? 1, enabled = ctx.enabled === true;
  let sim = null, pending = null, run = null, regularUsed = false;
  const bonuses = [];
  const round2 = value => Math.round(value * 100) / 100;

  function participants(t) {
    return [...sim.party.values()].filter(hero => !hero.down && sim.presentAt(hero, t)).map(hero => hero.id).sort();
  }
  const salted = ship => {
    let hash = (Number(ctx.seed) >>> 0) ^ 0x9e3779b9;
    for (const char of ship.id) hash = Math.imul(hash ^ char.codePointAt(0), 16777619) >>> 0;
    return hash >>> 0;
  };
  // The tasks' timeline in samples: intro, each task, grace, then the outcome and its outro.
  function timeline(kind, players) {
    const redtide = kind === 'redtide', tasks = [];
    let at = FINISHER.intro;
    for (const task of tasksOf(kind)) { const length = lengthOf(task, redtide); tasks.push({ task, from: at, to: at + length }); at += length; }
    const grace = graceSamples(players.length, ctx.gapMs?.(players.length) ?? 200);
    return { tasks, end: at, decide: at + grace };
  }
  function progress(current) {
    return current.plan.tasks.map(({ task, from, to }) => {
      let total = 0;
      const mine = {};
      for (const by of current.players) {
        const all = current.marks.get(by);
        if (!all) continue;
        const local = new Map();
        for (const [s, value] of all) if (s >= from && s < to) local.set(s - from, value);
        const score = scoreOf(task, by, local, { salt: current.salt, easy: current.easy.get(by) === true, length: to - from });
        mine[by] = score; total += score;
      }
      const goal = goalOf(task, current.players, { redtide: current.kind === 'redtide', easy: current.easy });
      return { task, from, to, score: Math.max(0, total), goal, cleared: Math.max(0, total) >= goal, players: mine };
    });
  }

  const api = {
    get active() { return run !== null; },
    get pending() { return pending !== null; },
    bind(handles) { sim = handles; },
    // A boss below the trigger: hold it at 1 hp until its finisher starts at the end of this tick.
    watch(ship) {
      if (!enabled || !sim || run || !isFinisherBoss(ship) || ship.finisherTried) return false;
      if (pending === ship) return true;
      if (pending || ship.hp >= ship.maxHp * FINISHER.trigger) return false;
      if (ship.kind !== 'redtide' && regularUsed) return false;
      if (!participants(sim.now()).length) return false; // nobody to do it: the boss sinks as before
      pending = ship;
      return true;
    },
    holds: ship => pending === ship || (run?.ship === ship && !run.outcome),
    begin(events) {
      if (!pending || run) return;
      const ship = pending; pending = null;
      ship.finisherTried = true;
      if (ship.kind !== 'redtide') regularUsed = true;
      const players = participants(sim.now()), kind = finisherKind(ship, wave);
      run = { ship, kind, players, salt: salted(ship), plan: timeline(kind, players), ticks: 0, marks: new Map(), easy: new Map(),
        phase: 'intro', outcome: null, outroEnd: null, cache: null, version: 0 };
      events.push({ type: 'finisher_started', t: sim.now(), kind, shipId: ship.id, shipKind: ship.kind, players: [...players],
        x: round2(ship.x), z: round2(ship.z), goals: progress(run).map(item => item.goal) });
    },
    input(input) {
      if (!run || run.outcome) return;
      const by = input?.by;
      if (typeof by !== 'string' || !run.players.includes(by)) return; // a watcher's input does nothing
      if (!Number.isInteger(input.from) || !Array.isArray(input.marks) || input.marks.length < 1 || input.marks.length > FINISHER.marks) return;
      if (!run.easy.has(by)) run.easy.set(by, input.easy === true);
      let mine = run.marks.get(by);
      if (!mine) run.marks.set(by, mine = new Map());
      const { tasks } = run.plan;
      input.marks.forEach((value, i) => {
        const s = input.from + i;
        if (!Number.isInteger(value) || value < -1 || value > 100 || mine.has(s)) return;
        if (!tasks.some(item => s >= item.from && s < item.to)) return;
        mine.set(s, value);
      });
      run.version++;
    },
    // One tick of the finisher (the battle stands still meanwhile). Returns true while it runs.
    tick(events) {
      if (!run) return false;
      run.ticks++;
      const sample = Math.floor(run.ticks / FINISHER.tick), { plan } = run;
      if (run.phase === 'intro' && sample >= FINISHER.intro) run.phase = 'task';
      if (run.phase === 'task' && sample >= plan.end) run.phase = 'grace';
      if (run.phase === 'grace' && sample >= plan.decide) decide(events);
      if (run.outcome && sample >= run.outroEnd) {
        events.push({ type: 'finisher_ended', t: sim.now(), kind: run.kind, outcome: run.outcome, shipId: run.ship.id });
        run = null;
        return false;
      }
      return true;
    },
    state() {
      if (!run) return null;
      const sample = Math.floor(run.ticks / FINISHER.tick);
      if (!run.cache || run.cache.version !== run.version) run.cache = { version: run.version, tasks: progress(run) };
      const current = run.plan.tasks.findIndex(item => sample < item.to);
      return { active: true, kind: run.kind, phase: run.phase, outcome: run.outcome, shipId: run.ship.id, shipKind: run.ship.kind,
        x: round2(run.ship.x), z: round2(run.ship.z), ticks: run.ticks, sample, salt: run.salt, players: [...run.players],
        task: current < 0 ? run.plan.tasks.length - 1 : current, tasks: run.cache.tasks.map(item => ({ ...item, players: { ...item.players } })),
        taskEnd: run.plan.end, decide: run.plan.decide, outroEnd: run.outroEnd,
        easy: Object.fromEntries(run.easy), heard: [...run.marks.keys()].sort() };
    },
    bonuses: () => [...bonuses],
  };
  function decide(events) {
    const tasks = progress(run), cleared = tasks.filter(item => item.cleared).length;
    const won = run.kind === 'redtide' ? cleared >= FINISHER.redtideNeeds : cleared === tasks.length;
    const ship = run.ship, common = { t: sim.now(), kind: run.kind, shipId: ship.id, x: round2(ship.x), z: round2(ship.z),
      scores: tasks.map(item => item.score), goals: tasks.map(item => item.goal) };
    run.outcome = won ? 'won' : 'failed';
    run.phase = run.outcome;
    run.outroEnd = Math.floor(run.ticks / FINISHER.tick) + (won ? FINISHER.outroWon : FINISHER.outroFailed);
    if (won) {
      if (!bonuses.includes('finisher')) bonuses.push('finisher');
      events.push({ type: 'finisher_won', ...common });
      if (sim.ships.includes(ship)) sim.damageShip(ship, ship.hp, 'finisher', events, { finisher: true });
    } else {
      ship.hp = round2(Math.min(ship.maxHp, ship.hp + ship.maxHp * FINISHER.regain));
      events.push({ type: 'finisher_failed', ...common, hp: ship.hp });
    }
  }
  return api;
}
