// T38 last-chance rescue (specs/T38-T39-minigames-rescue.md): when the island's heart falls or every captain is
// down, the captains still on the island (fallen ones too) get one short co-op haul. The rules are pure and
// deterministic like the boss finisher's; these tests drive them directly (the sim hook is documented in the spec).
import { describe, expect, it } from 'vitest';
import { RESCUE, createRescue, rescueAllowed } from '../../src/pirates/finisher/rescue.js';
import { FINISHER, goalOf, zoneAt } from '../../src/pirates/finisher/rules.js';
import { difficultySnapshot } from '../../src/pirates/finisher/difficulty.js';

const of = (events, type) => events.filter(event => event.type === type);
// The bots (s: the sample from the start of the task, d: the rescue's numbers).
const BOTS = {
  good: (s, salt, d) => Math.round(zoneAt(s, salt, d.speed)),
  slow: (s, salt, d) => Math.round(zoneAt(Math.max(0, s - 3), salt, d.speed)),
  bad: () => 0,
};

/** A rescue with these captains: {id: {down, present}}; options go to createRescue. */
function setup(captains = { a: {} }, options = {}) {
  const party = new Map(Object.entries(captains).map(([id, hero]) => [id, { id, down: false, ...hero }]));
  const rescue = createRescue({ wave: 20, seed: 7, enabled: true, gapMs: () => 200, ...options });
  rescue.bind({ party, presentAt: hero => hero.present !== false, now: () => 42, heart: { x: 0, z: 2 } });
  return { rescue, party };
}
/** Run the rescue to its end. bots: {id: 'good' | 'slow' | 'bad' | null}; window: samples per message. */
function play(rescue, bots, { window = 10, order = list => list, stopAfter = Infinity } = {}) {
  const events = [], sent = {};
  let ticks = 0;
  while (rescue.tick(events) && ticks++ < 20000) {
    const f = rescue.state();
    if (f.phase === 'prepare') { for (const by of f.players) rescue.input({ type: 'finisher_ready', by, shipId: RESCUE.shipId }); continue; }
    const pending = [];
    for (const [by, bot] of Object.entries(bots)) {
      if (!BOTS[bot] || f.outcome) continue;
      sent[by] ??= 0;
      while (sent[by] + window <= Math.min(f.sample, stopAfter)) {
        const from = sent[by], marks = [];
        for (let s = from; s < from + window; s++) {
          const task = f.tasks.find(item => s >= item.from && s < item.to);
          marks.push(task ? BOTS[bot](s - task.from, f.salt, f.difficulty.rescue) : -1);
        }
        pending.push({ type: 'finisher_input', by, from, marks });
        sent[by] = from + window;
      }
    }
    for (const input of order(pending)) rescue.input(input);
  }
  return { events, ticks };
}

describe('when a rescue is offered', () => {
  it('from wave 4 to 100 only: below wave 4 both fallbacks land on wave 1, so there is nothing to save', () => {
    expect([1, 2, 3, 4, 50, 100, 101].map(rescueAllowed)).toEqual([false, false, false, true, true, true, false]);
    for (const wave of [NaN, 4.5, '4', undefined]) expect(rescueAllowed(wave)).toBe(false);
  });
  it('for a fallen island or every captain down; it holds the end of the wave while it runs', () => {
    for (const reason of ['island_lost', 'captains_fallen']) {
      const { rescue } = setup(), events = [];
      expect(rescue.offer(reason, events)).toBe(true);
      expect(rescue.active).toBe(true);
      expect(rescue.reason).toBe(reason);
      expect(rescue.offer('island_lost', events)).toBe(true); // a second end() in the same tick still waits
      expect(of(events, 'rescue_started')).toEqual([{ type: 'rescue_started', t: 42, reason, players: ['a'], goal: expect.any(Number), x: 0, z: 2 }]);
    }
  });
  it('never for a won wave, a timeout, a disabled rescue, an early wave or the flagship (the caller passes enabled: false)', () => {
    for (const reason of ['all_sunk', 'timeout']) expect(setup().rescue.offer(reason, [])).toBe(false);
    expect(setup({ a: {} }, { enabled: false }).rescue.offer('island_lost', [])).toBe(false);
    expect(setup({ a: {} }, { wave: 3 }).rescue.offer('island_lost', [])).toBe(false);
  });
  it('fallen captains haul too; a captain who is away (disconnected, not heard) only watches', () => {
    const { rescue } = setup({ c: { down: true }, a: {}, b: { present: false } }), events = [];
    rescue.offer('captains_fallen', events);
    expect(rescue.state().players).toEqual(['a', 'c']);
  });
  it('with no captain on the island at all there is no rescue, and the wave ends as before', () => {
    const { rescue } = setup({ a: { present: false } }), events = [];
    expect(rescue.offer('island_lost', events)).toBe(false);
    expect(events).toEqual([]);
    expect(rescue.result()).toEqual({});
  });
  it('once per wave: after it is over the next offer lets the wave end', () => {
    const { rescue } = setup();
    rescue.offer('island_lost', []);
    play(rescue, { a: 'good' });
    expect(rescue.active).toBe(false);
    expect(rescue.offer('island_lost', [])).toBe(false);
    expect(rescue.offer('captains_fallen', [])).toBe(false);
  });
});

describe('the outcome', () => {
  it('a good captain alone saves the treasure: rescue_won, then rescue_ended, and the result says rescued', () => {
    const { rescue } = setup();
    rescue.offer('island_lost', []);
    const { events } = play(rescue, { a: 'good' });
    const won = of(events, 'rescue_won')[0];
    expect(won.score).toBeGreaterThanOrEqual(won.goal);
    expect(of(events, 'rescue_ended')).toEqual([{ type: 'rescue_ended', t: 42, outcome: 'won', reason: 'island_lost' }]);
    expect(rescue.outcome).toBe('won');
    expect(rescue.result()).toEqual({ rescued: true });
    expect(rescue.state()).toBeNull();
  });
  it('wrong input fails: rescue_failed and no rescued flag (the usual two-wave fallback)', () => {
    const { rescue } = setup();
    rescue.offer('island_lost', []);
    const { events } = play(rescue, { a: 'bad' });
    expect(of(events, 'rescue_failed').length).toBe(1);
    expect(rescue.outcome).toBe('failed');
    expect(rescue.result()).toEqual({});
  });
  it('nobody playing (timeout) fails within a fixed number of ticks', () => {
    const { rescue } = setup({ a: {} }, { preparation: true });
    rescue.offer('island_lost', []);
    const events = [];
    let ticks = 0;
    while (rescue.tick(events)) ticks++;
    // preparation (at most 20 s) + intro + 10 s task + grace + outro, at 20 ticks a second: under a minute.
    expect(ticks).toBeLessThan(RESCUE.prepareTicks + (RESCUE.intro + RESCUE.samples + 20 + RESCUE.outroFailed) * FINISHER.tick);
    expect(rescue.outcome).toBe('failed');
  });
  it('a lagging captain wins at waves 4, 50 and 100, alone and in crews of 2, 4 and 10', () => {
    for (const wave of [4, 50, 100]) for (const count of [1, 2, 4, 10]) {
      const captains = Object.fromEntries(Array.from({ length: count }, (_, i) => [`c${i}`, {}]));
      const { rescue } = setup(captains, { wave });
      rescue.offer('captains_fallen', []);
      play(rescue, Object.fromEntries(Object.keys(captains).map(id => [id, 'slow'])));
      expect(rescue.outcome, `wave ${wave}, crew ${count}`).toBe('won');
    }
  });
});

describe('a shared, fixed attempt', () => {
  it('the goal and the numbers are frozen at the start: a captain who comes back later only watches', () => {
    const { rescue, party } = setup({ a: {}, b: { present: false } });
    rescue.offer('island_lost', []);
    const before = rescue.state();
    expect(before.difficulty).toEqual(difficultySnapshot(['rescue'], 20));
    expect(before.tasks[0].goal).toBe(goalOf('rescue', ['a'], { difficulty: before.difficulty.rescue }));
    party.get('b').present = true;
    rescue.input({ type: 'finisher_input', by: 'b', from: RESCUE.intro, marks: [50, 50, 50] });
    rescue.tick([]);
    expect(rescue.state().players).toEqual(['a']);
    expect(rescue.state().tasks[0].goal).toBe(before.tasks[0].goal);
    expect(rescue.state().heard).toEqual([]);
  });
  it('captains who disconnect leave the goal as it was: half a crew of four can still save it, one captain alone cannot', () => {
    const crew = { a: {}, b: {}, c: {}, d: {} };
    const full = setup(crew);
    full.rescue.offer('island_lost', []);
    const goal = full.rescue.state().tasks[0].goal;
    const leaving = gone => {
      const { rescue } = setup(crew);
      rescue.offer('island_lost', []);
      expect(rescue.state().tasks[0].goal).toBe(goal);
      // The captains in `gone` vanish as the haul starts: their windows never come, the others keep hauling.
      play(rescue, Object.fromEntries(Object.keys(crew).map(id => [id, gone.includes(id) ? null : 'good'])));
      return rescue.outcome;
    };
    expect(leaving(['c', 'd'])).toBe('won');
    expect(leaving(['b', 'c', 'd'])).toBe('failed');
  });
  it('two rescues with the same inputs end alike, however the windows were chunked or ordered', () => {
    const one = setup({ a: {}, b: {} }), two = setup({ a: {}, b: {} });
    one.rescue.offer('island_lost', []); two.rescue.offer('island_lost', []);
    const a = play(one.rescue, { a: 'slow', b: 'bad' }, { window: 10 });
    const b = play(two.rescue, { a: 'slow', b: 'bad' }, { window: 24, order: list => [...list].reverse() });
    expect(of(a.events, 'rescue_won').concat(of(a.events, 'rescue_failed')).map(({ score, goal }) => [score, goal]))
      .toEqual(of(b.events, 'rescue_won').concat(of(b.events, 'rescue_failed')).map(({ score, goal }) => [score, goal]));
  });
  it('the preparation waits for every participant, accepts no watcher and no other ship, and has a time limit', () => {
    const { rescue } = setup({ a: {}, b: {} }, { preparation: true });
    rescue.offer('island_lost', []);
    expect(rescue.state().phase).toBe('prepare');
    rescue.input({ type: 'finisher_ready', by: 'a', shipId: RESCUE.shipId });
    rescue.input({ type: 'finisher_ready', by: 'z', shipId: RESCUE.shipId });
    rescue.input({ type: 'finisher_ready', by: 'b', shipId: 'boss_1' });
    rescue.input({ type: 'finisher_input', by: 'a', from: RESCUE.intro, marks: [50] }); // practice never scores
    rescue.tick([]);
    expect(rescue.state()).toMatchObject({ phase: 'prepare', ready: ['a'], heard: [] });
    rescue.input({ type: 'finisher_ready', by: 'b', shipId: RESCUE.shipId });
    rescue.tick([]);
    expect(rescue.state().phase).toBe('intro');
    const slow = setup({ a: {} }, { preparation: true });
    slow.rescue.offer('island_lost', []);
    for (let i = 0; i < RESCUE.prepareTicks; i++) slow.rescue.tick([]);
    expect(slow.rescue.state().phase).toBe('intro');
  });
  it('looks like a finisher to the scene and the controller (kind rescue, its own ship id, the heart\'s place)', () => {
    const { rescue } = setup();
    rescue.offer('captains_fallen', []);
    expect(rescue.state()).toMatchObject({ active: true, kind: 'rescue', shipId: RESCUE.shipId, x: 0, z: 2, task: 0,
      tasks: [{ task: 'rescue', from: RESCUE.intro, to: RESCUE.intro + RESCUE.samples }], reason: 'captains_fallen' });
  });
});
