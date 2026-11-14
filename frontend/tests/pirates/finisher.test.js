// Boss finishers (docs/GAME-V3.md §4.3): the trigger below a quarter of the boss's hull, the frozen battle, the
// crew task scored from synced samples (the same outcome however the inputs were chunked or ordered), the goal
// that scales with the captains present, a failure that gives the boss 15% back, and the success that sinks it.
import { describe, expect, it } from 'vitest';
import { CONFIG, createWave } from '../../src/pirates/sim.js';
import { FINISHER, createFinisher, crewScale, finisherKind, goalOf, promptAt, scoreOf, spotAt, zoneAt } from '../../src/pirates/finisher/rules.js';
import { ISLANDS } from './balance-fixture.js';

const SAFE = { x: 0, z: -12 }; // north of the heart, away from the sea lanes
const move = (by, at = SAFE) => ({ type: 'captain_move', by, x: at.x, z: at.z });
const of = (events, type) => events.filter(event => event.type === type);

// A bot captain: what they do in each sample of a task (s: from the start of the task).
const BOTS = {
  // Perfect: the needle on the zone, the cannon on the spot when loaded, the right arrow at once.
  good: { haul: (s, salt) => Math.round(zoneAt(s, salt)), cannon: (s, salt) => (s % 6 === 0 ? Math.round(spotAt(s, salt)) : -1),
    duel: (s, salt, by, length) => (s % length === 1 ? promptAt(by, Math.floor(s / length), salt) : -1) },
  // A human with a quarter second of lag.
  slow: { haul: (s, salt) => Math.round(zoneAt(Math.max(0, s - 3), salt)), cannon: (s, salt) => (s % 6 === 0 ? Math.round(spotAt(Math.max(0, s - 2), salt)) : -1),
    duel: (s, salt, by, length) => (s % length === 4 ? promptAt(by, Math.floor(s / length), salt) : -1) },
  // Pressing the wrong thing.
  bad: { haul: () => 0, cannon: s => (s % 6 === 0 ? 3 : -1), duel: (s, salt, by, length) => (s % length === 1 ? (promptAt(by, Math.floor(s / length), salt) + 1) % 4 : -1) },
};
const lengthOf = easy => (easy ? FINISHER.tasks.duel.easyPrompt : FINISHER.tasks.duel.prompt);

/**
 * A boss wave with captains standing safe. bots: {id: 'good' | 'slow' | 'bad' | null (idle)}; window: samples per
 * message. Returns {events, wave, started, ended, sent} once the wave is over (or `seconds` ran out).
 */
function bossWave({ wave = 5, island = ISLANDS.full, seed = 7, bots = { a: 'good' }, window = 10, finishers = true, easy = {},
  order = list => list, seconds = 220, stopAtEnd = false } = {}) {
  const sim = createWave({ ...island, seed, wave, countdown: 0, finishers, gapMs: () => 200 });
  const events = [], ids = Object.keys(bots), sent = {};
  let pending = [];
  for (let i = 0; i < seconds * 20 && !sim.done; i++) {
    const inputs = i % 40 === 0 ? ids.map(by => move(by)) : [];
    const f = sim.state().finisher;
    if (f?.active && !f.outcome) {
      for (const by of ids) {
        const bot = BOTS[bots[by]];
        if (!bot || !f.players.includes(by)) continue;
        sent[by] ??= 0;
        // Send the samples heard so far, a window at a time (the scene does the same).
        while (sent[by] + window <= f.sample) {
          const from = sent[by], marks = [];
          for (let s = from; s < from + window; s++) {
            const task = f.tasks.find(item => s >= item.from && s < item.to);
            marks.push(task ? bot[task.task](s - task.from, f.salt, by, lengthOf(easy[by] === true)) : -1);
          }
          pending.push({ type: 'finisher_input', by, from, marks, ...(easy[by] ? { easy: true } : {}) });
          sent[by] = from + window;
        }
      }
      inputs.push(...order(pending)); pending = [];
    }
    const out = sim.step(CONFIG.tick, inputs);
    events.push(...out);
    if (stopAtEnd && out.some(event => event.type === 'finisher_ended')) break;
  }
  return { events, wave: sim, started: of(events, 'finisher_started'), ended: of(events, 'finisher_ended') };
}

describe('the trigger', () => {
  it('a boss below a quarter of its hull freezes the battle and starts a finisher for the captains in the wave', () => {
    const sim = createWave({ ...ISLANDS.full, seed: 7, wave: 5, countdown: 0, finishers: true, gapMs: () => 200 });
    let started = null, frozenAt = null;
    for (let i = 0; i < 200 * 20 && !started; i++) {
      for (const event of sim.step(CONFIG.tick, i % 40 === 0 ? [move('a'), move('b')] : [])) if (event.type === 'finisher_started') started = event;
    }
    expect(started).toMatchObject({ kind: 'haul', shipKind: 'warship', players: ['a', 'b'] });
    const boss = sim.state().ships.find(ship => ship.id === started.shipId);
    expect(boss.hp).toBeGreaterThan(0);
    expect(boss.hp).toBeLessThan(boss.maxHp * FINISHER.trigger);
    frozenAt = sim.state().time;
    const ships = JSON.stringify(sim.state().ships), boarders = JSON.stringify(sim.state().boarders);
    for (let i = 0; i < 40; i++) sim.step(CONFIG.tick, [{ type: 'fire', cannonId: 'tower_s1', targetId: started.shipId }]);
    expect(sim.state().time).toBe(frozenAt); // the battle's clock stands still
    expect(JSON.stringify(sim.state().ships)).toBe(ships);
    expect(JSON.stringify(sim.state().boarders)).toBe(boarders);
    expect(sim.state().finisher).toMatchObject({ active: true, kind: 'haul', phase: 'task' });
  });

  it('needs a captain in the wave: without one (or without finishers) the boss sinks as before', () => {
    const plain = bossWave({ bots: {}, seconds: 200 });
    expect(plain.started).toEqual([]);
    expect(of(plain.events, 'ship_sunk').some(item => item.boss)).toBe(true);
    const off = bossWave({ finishers: false, seconds: 200 });
    expect(off.started).toEqual([]);
  });

  it('the kind follows the boss tier', () => {
    expect(finisherKind({ kind: 'warship' }, 5)).toBe('haul');
    expect(finisherKind({ kind: 'warship' }, 10)).toBe('haul');
    expect(finisherKind({ kind: 'warship' }, 15)).toBe('cannon');
    expect(finisherKind({ kind: 'warship' }, 25)).toBe('cannon');
    expect(finisherKind({ kind: 'warship' }, 30)).toBe('duel');
    expect(finisherKind({ kind: 'dreadnought' }, 60)).toBe('duel');
    expect(finisherKind({ kind: 'redtide' }, 100)).toBe('redtide');
  });
});

describe('the outcome', () => {
  for (const [wave, kind] of [[5, 'haul'], [15, 'cannon'], [30, 'duel']]) {
    it(`${kind} (wave ${wave}): one good captain alone wins and the boss sinks with bonus loot`, () => {
      const island = wave >= 30 ? { ...ISLANDS.full, island: { hp: 10000 } } : ISLANDS.full;
      const { events, wave: sim, started } = bossWave({ wave, island, bots: { a: 'good' } });
      expect(started[0]?.kind).toBe(kind);
      const won = of(events, 'finisher_won')[0];
      expect(won).toBeTruthy();
      expect(won.scores[0]).toBeGreaterThanOrEqual(won.goals[0]);
      expect(of(events, 'ship_sunk').find(item => item.shipId === started[0].shipId)).toMatchObject({ by: 'finisher', finisher: true });
      expect(sim.result().bonuses).toContain('finisher');
    });
    it(`${kind} (wave ${wave}): a captain who presses the wrong things fails, and the boss gets 15% back`, () => {
      const island = wave >= 30 ? { ...ISLANDS.full, island: { hp: 10000 } } : ISLANDS.full;
      const { events, started } = bossWave({ wave, island, bots: { a: 'bad' }, stopAtEnd: true });
      const failed = of(events, 'finisher_failed')[0];
      expect(failed).toBeTruthy();
      const before = of(events, 'ship_hit').filter(item => item.shipId === started[0].shipId).at(-1).hp;
      const boss = of(events, 'ship_spawned').find(item => item.shipId === started[0].shipId);
      expect(failed.hp).toBeCloseTo(before + boss.hp * FINISHER.regain, 1);
    });
  }

  it('a human with some lag wins every kind too', () => {
    for (const wave of [5, 15, 30]) {
      const island = wave >= 30 ? { ...ISLANDS.full, island: { hp: 10000 } } : ISLANDS.full;
      expect(of(bossWave({ wave, island, bots: { a: 'slow' }, stopAtEnd: true }).events, 'finisher_won').length, `wave ${wave}`).toBe(1);
    }
  });

  it('Redtide remains beatable after losing the cannon task, with delayed input and crews of 1 to 10', () => {
    for (const count of [1, 2, 4, 10]) for (const easy of [false, true]) for (const salt of [0, 3, 42]) {
      const players = Array.from({length: count}, (_, i) => `captain-${i}`);
      for (const task of ['haul', 'duel']) {
        const score = players.reduce((total, by) => {
          const samples = new Map(Array.from({length: FINISHER.redtideSamples}, (_, s) =>
            [s, BOTS.slow[task](s, salt, by, lengthOf(easy))]));
          return total + scoreOf(task, by, samples, {salt, easy, length: FINISHER.redtideSamples});
        }, 0);
        const goal = goalOf(task, players, {redtide: true, easy: new Map(players.map(by => [by, easy]))});
        expect(score, `${task}, crew ${count}, easy ${easy}, salt ${salt}`).toBeGreaterThanOrEqual(goal);
      }
    }
  });

  it('after a failure the battle goes on: the boss can still sink, and it brings no second finisher', () => {
    const { events, wave, started } = bossWave({ bots: { a: 'bad' } });
    expect(started.length).toBe(1);
    expect(of(events, 'finisher_failed').length).toBe(1);
    expect(wave.done).toBe(true);
    expect(of(events, 'ship_sunk').some(item => item.shipId === started[0].shipId && item.by !== 'finisher')).toBe(true);
    expect(wave.result().bonuses).toBeUndefined();
  });

  it('a watcher (not in the wave) or a fallen captain counts for nothing', () => {
    const { events, started } = bossWave({ bots: { a: 'bad' }, stopAtEnd: true });
    const sim = createWave({ ...ISLANDS.full, seed: 7, wave: 5, countdown: 0, finishers: true, gapMs: () => 200 });
    expect(started[0].players).toEqual(['a']);
    // The same wave, a stranger sends perfect samples: nothing changes.
    const again = bossWave({ bots: { a: 'bad' }, stopAtEnd: true, order: list => [...list, { type: 'finisher_input', by: 'zed', from: 16, marks: Array(24).fill(50) }] });
    expect(of(again.events, 'finisher_failed')).toEqual(of(events, 'finisher_failed'));
    expect(sim.state().finisher).toBeNull();
  });

  it('Redtide at wave 100: all three tasks in a row, two of three clear it', () => {
    // The rules alone, with Redtide's ship held below a quarter (the late-game tests cover reaching it).
    const ship = { id: 'ship_9', kind: 'redtide', boss: true, hp: 2000, maxHp: 10000, x: 30, z: 0 };
    const sunk = [];
    const finisher = createFinisher({ wave: 100, seed: 3, enabled: true, gapMs: () => 200 });
    const party = new Map([['a', { id: 'a', down: false }], ['b', { id: 'b', down: false }]]);
    finisher.bind({ party, ships: [ship], presentAt: () => true, now: () => 90, damageShip: (target, amount, by) => { target.hp = 0; sunk.push(by); } });
    expect(finisher.watch(ship)).toBe(true);
    const events = [];
    finisher.begin(events);
    expect(events[0]).toMatchObject({ type: 'finisher_started', kind: 'redtide', players: ['a', 'b'] });
    expect(finisher.state().tasks.map(item => item.task)).toEqual(['haul', 'cannon', 'duel']);
    // Both play the haul and the duel well and miss with the great cannon.
    const mixed = { haul: BOTS.good.haul, cannon: BOTS.bad.cannon, duel: BOTS.good.duel };
    const sent = { a: 0, b: 0 };
    while (finisher.tick(events)) {
      const f = finisher.state();
      for (const by of ['a', 'b']) while (!f.outcome && sent[by] + 10 <= f.sample) {
        const from = sent[by], marks = [];
        for (let s = from; s < from + 10; s++) { const task = f.tasks.find(item => s >= item.from && s < item.to); marks.push(task ? mixed[task.task](s - task.from, f.salt, by, 9) : -1); }
        finisher.input({ type: 'finisher_input', by, from, marks }); sent[by] += 10;
      }
    }
    const won = of(events, 'finisher_won')[0];
    expect(won.scores.length).toBe(3);
    expect(won.scores.map((score, k) => score >= won.goals[k])).toEqual([true, false, true]);
    expect(sunk).toEqual(['finisher']);
    expect(finisher.bonuses()).toEqual(['finisher']);
    // Each of Redtide's tasks is shorter (8 s), all three in a row.
    expect(FINISHER.redtideSamples * 3 / 10).toBe(24);
  });
});

describe('determinism', () => {
  it('two sims with the same inputs end alike, however the samples were chunked or ordered', () => {
    const a = bossWave({ bots: { a: 'good', b: 'slow' }, window: 10 });
    const b = bossWave({ bots: { a: 'good', b: 'slow' }, window: 10 });
    expect(JSON.stringify(b.events)).toBe(JSON.stringify(a.events));
    // Other windows and the messages in reverse order: the same scores and the same outcome.
    const c = bossWave({ bots: { a: 'good', b: 'slow' }, window: 24, order: list => [...list].reverse() });
    const outcome = run => of(run.events, 'finisher_won').concat(of(run.events, 'finisher_failed')).map(({ type, scores, goals }) => ({ type, scores, goals }));
    expect(outcome(c)).toEqual(outcome(a));
    expect(c.wave.result()).toEqual(a.wave.result());
  });
  it('a sample heard twice counts once', () => {
    const a = bossWave({ bots: { a: 'good' }, stopAtEnd: true });
    const b = bossWave({ bots: { a: 'good' }, stopAtEnd: true, order: list => [...list, ...list] });
    expect(of(b.events, 'finisher_won')).toEqual(of(a.events, 'finisher_won'));
  });
});

describe('the goal scales with the captains present', () => {
  it('more captains need more in all, a little less each, and a solo captain can win', () => {
    for (const task of ['haul', 'cannon', 'duel']) {
      const goals = [1, 2, 4, 10].map(n => goalOf(task, Array.from({ length: n }, (_, i) => `p${i}`)));
      expect(goals[1]).toBeGreaterThan(goals[0]);
      expect(goals[3]).toBeGreaterThan(goals[2]);
      expect(goals[3] / 10).toBeLessThan(goals[0]);
    }
    expect(crewScale(1)).toBe(1);
    expect(crewScale(10)).toBeCloseTo(.8);
  });
  it('two captains share the work: one idle partner makes it harder, both playing win', () => {
    const both = bossWave({ bots: { a: 'slow', b: 'slow' }, stopAtEnd: true });
    expect(of(both.events, 'finisher_won').length).toBe(1);
    const idle = bossWave({ bots: { a: 'slow', b: null }, stopAtEnd: true });
    expect(idle.started[0].goals[0]).toBe(both.started[0].goals[0]);
    expect(of(idle.events, 'finisher_failed').length).toBe(1);
  });
  it('Easier finishers widens the zone and slows the prompts for that captain', () => {
    expect(goalOf('duel', ['a'], { easy: new Map([['a', true]]) })).toBeLessThan(goalOf('duel', ['a']));
    expect(FINISHER.tasks.haul.easyWidth).toBeGreaterThan(FINISHER.tasks.haul.width);
    expect(FINISHER.tasks.cannon.easyWidth).toBeGreaterThan(FINISHER.tasks.cannon.width);
  });
});
