import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';

const browser = browserHarness();

it('draws the frozen prompt and responds to local keyboard and button marks without touching crew scoring', async () => {
  const result = await browser(async () => {
    const {createFinisherScene} = await window.g20Import('/src/pirates/finisher/scene.js');
    const {ARROWS, promptAt, promptLength, scoreOf} = await window.g20Import('/src/pirates/finisher/rules.js');
    const {difficultySnapshot} = await window.g20Import('/src/pirates/finisher/difficulty.js');
    const me = 'captain-a', other = 'captain-b', salt = 631;
    const difficulty = difficultySnapshot(['duel'], 74);
    const length = promptLength(false, difficulty.duel);
    const input = [], from = 16, to = 115;
    const game = createFinisherScene({container: document.body, me, reducedMotion: () => true,
      recorder: {press: (sample, direction) => input.push([sample, direction])}});
    const f = {kind: 'duel', phase: 'task', task: 0, sample: from, salt, difficulty, players: [me, other],
      tasks: [{task: 'duel', from, to, goal: 8, score: 3, players: {[me]: 2, [other]: 1}}]};
    const canvas = game.element.querySelector('canvas');
    const cue = game.element.querySelector('[role=status]');
    const picture = () => canvas.toDataURL();
    const update = (sample = f.sample, dt = .05) => { f.sample = sample; game.update({finisher: f, dt}); };
    const press = index => window.dispatchEvent(new KeyboardEvent('keydown', {
      code: 'Arrow' + ARROWS[index][0].toUpperCase() + ARROWS[index].slice(1), bubbles: true,
    }));
    const direction = promptAt(me, 0, salt);
    const nextDirection = promptAt(me, 1, salt), wrongDirection = (nextDirection + 1) % 4;
    update();
    const before = picture(), initialCue = cue.textContent;
    update(f.sample, .09);
    const steady = picture() === before;
    press(direction);
    press((direction + 1) % 4);
    update(f.sample, 0);
    const landed = picture() !== before, landedCue = cue.textContent;
    const landedButton = game.element.querySelector('[data-response=hit]')?.getAttribute('aria-label');
    update(from + length);
    const next = picture(), nextCue = cue.textContent;
    game.element.querySelector(`[data-arrow="${wrongDirection}"]`).click();
    update(f.sample, 0);
    const parried = picture() !== next, parriedCue = cue.textContent;
    const parriedButton = game.element.querySelector('[data-response=miss]')?.getAttribute('aria-label');
    const crew = game.element.querySelector('.finisher-meter-text').textContent;
    const localScore = scoreOf('duel', me, new Map(input.map(([sample, mark]) => [sample - from, mark])),
      {salt, difficulty: difficulty.duel, length: to - from});
    game.dispose();
    return {steady, landed, initialCue, landedCue, landedButton, nextCue, parried, parriedCue, parriedButton,
      expected: [`Arrow ${ARROWS[direction]}`, `Arrow ${ARROWS[nextDirection]}`, `Arrow ${ARROWS[wrongDirection]}`],
      input, expectedInput: [[from, direction], [from + length, wrongDirection]], crew, localScore, score: f.tasks[0].score};
  });

  expect(result.input).toEqual(result.expectedInput);
  expect(result.initialCue).toBe(result.expected[0]);
  expect(result.nextCue).toBe(result.expected[1]);
  expect(result).toMatchObject({steady: true, landed: true, landedCue: 'Hit', landedButton: result.expected[0],
    parried: true, parriedCue: 'Parried', parriedButton: result.expected[2], crew: '3 / 8', localScore: 0, score: 3});
});
