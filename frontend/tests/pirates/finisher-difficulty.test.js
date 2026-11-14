// T39 minigame difficulty (specs/T38-T39-minigames-rescue.md): every minigame's speed, timing window and
// error budget follow the wave number, bounded between the early (today's) and the late values. These tests
// check the curve at the boundary waves, that waves up to 10 keep today's numbers, that one shared snapshot
// is frozen at the start of a finisher, and that a captain with a quarter second of lag still wins at every
// boundary wave alone and in crews of 2, 4 and 10, while wrong input still fails.
import { describe, expect, it } from 'vitest';
import { CURVES, difficultyFor, difficultySnapshot, pressure } from '../../src/pirates/finisher/difficulty.js';
import { FINISHER, createFinisher, goalOf, promptAt, promptLength, scoreOf, spotAt, zoneAt } from '../../src/pirates/finisher/rules.js';

const BOUNDARY = [1, 4, 5, 10, 11, 15, 25, 30, 55, 95, 99, 100];
const TASKS = ['haul', 'cannon', 'duel', 'rescue'];
// Which way is harder for each number: a faster target, a narrower window, more hits, a shorter prompt, a bigger share.
const HARDER = { speed: 1, width: -1, easyWidth: -1, share: 1, hits: 1, prompt: -1, easyPrompt: -1 };

// A captain with a quarter second of lag (3 samples late on the needle, 2 on the cannon, the arrow 0.4 s in).
const lagging = (task, d, salt, by, easy) => {
  if (task === 'haul' || task === 'rescue') return s => Math.round(zoneAt(Math.max(0, s - 3), salt, d.speed));
  if (task === 'cannon') return s => (s % 6 === 0 ? Math.round(spotAt(Math.max(0, s - 2), salt, d.speed)) : -1);
  const L = promptLength(easy, d);
  return s => (s % L === 4 ? promptAt(by, Math.floor(s / L), salt) : -1);
};
// Wrong on purpose: the needle at the bottom, the cannon at the edge, the next arrow round.
const wrong = (task, d, salt, by, easy) => {
  if (task === 'duel') { const L = promptLength(easy, d); return s => (s % L === 1 ? (promptAt(by, Math.floor(s / L), salt) + 1) % 4 : -1); }
  return task === 'cannon' ? s => (s % 6 === 0 ? 0 : -1) : () => 0;
};
function crewScore(task, d, players, { salt, easy, length, bot }) {
  return players.reduce((total, by) => {
    const play = bot(task, d, salt, by, easy), samples = new Map(Array.from({ length }, (_, s) => [s, play(s)]));
    return total + scoreOf(task, by, samples, { salt, easy, length, difficulty: d });
  }, 0);
}
const lengthFor = (task, redtide) => (redtide ? FINISHER.redtideSamples : FINISHER.tasks[task].samples);

describe('the pressure of a wave', () => {
  it('is 0 up to wave 10, grows evenly to 1 at wave 100 and stays there', () => {
    expect(pressure(1)).toBe(0); expect(pressure(10)).toBe(0);
    expect(pressure(55)).toBeCloseTo(.5, 5); expect(pressure(100)).toBe(1); expect(pressure(250)).toBe(1);
  });
  it('treats a missing, broken or negative wave as wave 1 and drops fractions', () => {
    for (const wave of [undefined, null, NaN, -5, 0, 'x', Infinity]) expect(pressure(wave), String(wave)).toBe(0);
    expect(pressure(54.9)).toBe(pressure(54));
  });
});

describe('the curves', () => {
  it('keep today\'s numbers up to wave 10, so the boss finishers of waves 5 and 10 do not change', () => {
    for (const wave of [1, 5, 10]) {
      expect(difficultyFor('haul', wave)).toEqual({ speed: 1, width: FINISHER.tasks.haul.width, easyWidth: FINISHER.tasks.haul.easyWidth, share: FINISHER.tasks.haul.share });
      expect(difficultyFor('cannon', wave)).toEqual({ speed: 1, width: FINISHER.tasks.cannon.width, easyWidth: FINISHER.tasks.cannon.easyWidth, hits: FINISHER.tasks.cannon.hits });
      expect(difficultyFor('duel', wave)).toEqual({ prompt: FINISHER.tasks.duel.prompt, easyPrompt: FINISHER.tasks.duel.easyPrompt, share: FINISHER.tasks.duel.share });
    }
    // Without a wave (the old callers and the T28 tests) every task gets its early numbers.
    for (const task of TASKS) expect(difficultyFor(task)).toEqual(difficultyFor(task, 1));
  });
  it('reach exactly the late numbers at wave 100 and never go past them', () => {
    for (const task of TASKS) {
      const late = Object.fromEntries(Object.entries(CURVES[task]).map(([key, [, end]]) => [key, end]));
      expect(difficultyFor(task, 100), task).toEqual(late);
      expect(difficultyFor(task, 1000), task).toEqual(late);
    }
  });
  it('only get harder (or stay) from one boundary wave to the next, and stay between early and late', () => {
    for (const task of TASKS) {
      let before = null;
      for (const wave of BOUNDARY) {
        const now = difficultyFor(task, wave);
        for (const [key, [early, late]] of Object.entries(CURVES[task])) {
          expect(now[key], `${task} ${key} wave ${wave}`).toBeGreaterThanOrEqual(Math.min(early, late));
          expect(now[key], `${task} ${key} wave ${wave}`).toBeLessThanOrEqual(Math.max(early, late));
          if (before) expect((now[key] - before[key]) * HARDER[key], `${task} ${key} wave ${wave}`).toBeGreaterThanOrEqual(0);
        }
        before = now;
      }
    }
  });
  it('count whole hits and whole prompt samples, and the easy setting stays easier at every wave', () => {
    for (const wave of BOUNDARY) {
      const cannon = difficultyFor('cannon', wave), duel = difficultyFor('duel', wave);
      expect(Number.isInteger(cannon.hits)).toBe(true);
      expect(Number.isInteger(duel.prompt) && Number.isInteger(duel.easyPrompt)).toBe(true);
      for (const task of ['haul', 'cannon', 'rescue']) expect(difficultyFor(task, wave).easyWidth).toBeGreaterThan(difficultyFor(task, wave).width);
      expect(duel.easyPrompt).toBeGreaterThan(duel.prompt);
    }
  });
  it('change the prompt and the hits only at their documented waves', () => {
    expect(difficultyFor('duel', 32).prompt).toBe(9); expect(difficultyFor('duel', 33).prompt).toBe(8);
    expect(difficultyFor('duel', 77).prompt).toBe(8); expect(difficultyFor('duel', 78).prompt).toBe(7);
    expect(difficultyFor('cannon', 54).hits).toBe(7); expect(difficultyFor('cannon', 55).hits).toBe(8);
  });
  it('refuse an unknown task instead of guessing', () => {
    expect(() => difficultyFor('lantern', 5)).toThrow(/unknown minigame/);
  });
});

describe('the shared snapshot', () => {
  it('is frozen per task and the same for every client of the same wave', () => {
    const one = difficultySnapshot(['haul', 'cannon', 'duel'], 100), two = difficultySnapshot(['haul', 'cannon', 'duel'], 100);
    expect(one).toEqual(two);
    expect(Object.isFrozen(one) && Object.isFrozen(one.haul)).toBe(true);
  });
  it('is taken when the finisher starts: the goals and the window do not move when a captain joins later', () => {
    const party = new Map([['a', { id: 'a' }]]);
    const f = createFinisher({ wave: 95, enabled: true });
    const ship = { id: 'boss_1', kind: 'dreadnought', boss: true, hp: 1, maxHp: 100, x: 0, z: 0 };
    f.bind({ party, presentAt: () => true, now: () => 0, ships: [ship], damageShip() {} });
    f.watch(ship); f.begin([]);
    const first = f.state();
    expect(first.difficulty).toEqual(difficultySnapshot(['duel'], 95));
    party.set('b', { id: 'b' });
    f.tick([]);
    expect(f.state().difficulty).toEqual(first.difficulty);
    expect(f.state().tasks.map(item => item.goal)).toEqual(first.tasks.map(item => item.goal));
    expect(f.state().players).toEqual(['a']);
  });
});

describe('playable at early, middle and late waves', () => {
  // The finisher kind each boundary wave brings (rules.js finisherKind), the rescue at any wave from 4 and
  // Redtide's three tasks at wave 100 (80 samples each, two of three clear it).
  const CASES = [['haul', 5], ['haul', 10], ['cannon', 15], ['cannon', 25], ['duel', 30], ['duel', 55], ['duel', 95],
    ['rescue', 4], ['rescue', 30], ['rescue', 55], ['rescue', 100]];
  it('a captain with a quarter second of lag wins alone and in crews of 2, 4 and 10, on both settings', () => {
    for (const [task, wave] of CASES) for (const count of [1, 2, 4, 10]) for (const easy of [false, true]) for (const salt of [0, 3, 42, 999]) {
      const d = difficultyFor(task, wave), players = Array.from({ length: count }, (_, i) => `captain-${i}`);
      const score = crewScore(task, d, players, { salt, easy, length: lengthFor(task), bot: lagging });
      const goal = goalOf(task, players, { easy: new Map(players.map(by => [by, easy])), difficulty: d });
      expect(score, `${task} wave ${wave}, crew ${count}, easy ${easy}, salt ${salt}`).toBeGreaterThanOrEqual(goal);
    }
  });
  it('Redtide at wave 100 stays beatable: the lagging captain clears at least two of the three tasks', () => {
    for (const count of [1, 2, 4, 10]) for (const easy of [false, true]) for (const salt of [0, 3, 42, 999]) {
      const players = Array.from({ length: count }, (_, i) => `captain-${i}`);
      const cleared = ['haul', 'cannon', 'duel'].filter(task => {
        const d = difficultyFor(task, 100);
        const score = crewScore(task, d, players, { salt, easy, length: lengthFor(task, true), bot: lagging });
        return score >= goalOf(task, players, { redtide: true, easy: new Map(players.map(by => [by, easy])), difficulty: d });
      });
      expect(cleared.length, `crew ${count}, easy ${easy}, salt ${salt}: ${cleared}`).toBeGreaterThanOrEqual(2);
    }
  });
  it('wrong input still fails at every boundary wave, so the error budget means something', () => {
    for (const [task, wave] of CASES) for (const count of [1, 4]) {
      const d = difficultyFor(task, wave), players = Array.from({ length: count }, (_, i) => `captain-${i}`);
      const score = crewScore(task, d, players, { salt: 3, easy: false, length: lengthFor(task), bot: wrong });
      expect(score, `${task} wave ${wave}, crew ${count}`).toBeLessThan(goalOf(task, players, { difficulty: d }));
    }
  });
  it('the late error budget is smaller: a captain idle for 38% of the haul wins at wave 10 and loses at wave 100', () => {
    const idleSome = (task, d, salt) => s => (s % 50 < 19 ? -1 : Math.round(zoneAt(s, salt, d.speed)));
    const at = wave => {
      const d = difficultyFor('haul', wave);
      return crewScore('haul', d, ['a'], { salt: 3, easy: false, length: 100, bot: idleSome }) >= goalOf('haul', ['a'], { difficulty: d });
    };
    expect(at(10)).toBe(true);
    expect(at(100)).toBe(false);
  });
});
