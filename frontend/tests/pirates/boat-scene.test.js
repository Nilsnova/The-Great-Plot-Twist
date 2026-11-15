// D057 real DOM: the boat games' scene takes keyboard, pointer and touch-button input, records the round's samples
// for rules.js, settles once at the end, and cleans up after itself. Driven frame by frame (no real clock).
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const browser = browserHarness();

it('broadside: Space and the Fire button shoot (the guns reload), the round ends once and pays through onFinish', async () => {
  const result = await browser(async () => {
    const {createBoatGame} = await window.g20Import('/src/pirates/boat/scene.js');
    const rules = await window.g20Import('/src/pirates/boat/rules.js');
    const finished = [];
    let closed = null;
    const g = createBoatGame({container: document.body, game: 'broadside', wave: 30, code: 'ISLE-K7Q2M', autoplay: false,
      onFinish: async outcome => { finished.push(outcome); return {line: 'paid', coins: 12}; }, onClose: outcome => { closed = outcome; }});
    const intro = g.phase;
    const key = code => window.dispatchEvent(new KeyboardEvent('keydown', {code, bubbles: true}));
    key('Space'); // during the picture card: nothing
    const early = g.samples.size;
    for (let i = 0; i < 31; i++) g.update(.1); // the 3 s card, then the round
    key('Space'); key('Space'); // the second one is inside the reload
    const afterKeys = g.samples.size;
    for (let i = 0; i < 10; i++) g.update(.1);
    document.querySelector('.boat-fire').dispatchEvent(new PointerEvent('pointerdown', {bubbles: true}));
    const afterButton = g.samples.size;
    for (let i = 0; i < 200; i++) g.update(.1);
    await new Promise(resolve => setTimeout(resolve, 20));
    const line = document.querySelector('.boat-result-line').textContent, resultShown = !document.querySelector('.boat-result').hidden;
    const expected = rules.scoreOf('broadside', g.samples, {salt: rules.boatSalt('ISLE-K7Q2M', 30, 'broadside'), wave: 30});
    key('Escape');
    return {intro, early, afterKeys, afterButton, finished, line, resultShown, closed, left: document.querySelectorAll('.boat-game').length, expected};
  });
  expect(result.intro).toBe('intro');
  expect(result.early).toBe(0);
  expect(result.afterKeys).toBe(1);
  expect(result.afterButton).toBe(2);
  expect(result.finished).toHaveLength(1);
  expect(result.finished[0]).toMatchObject({game: 'broadside', wave: 30, score: result.expected.score, max: result.expected.max});
  expect(result.resultShown).toBe(true);
  expect(result.line).toBe('paid');
  expect(result.closed).toMatchObject({game: 'broadside'});
  expect(result.left).toBe(0);
});

it('dash: arrow keys and the ◀ ▶ buttons steer, every sample keeps the boat\'s place, Again starts a fresh round', async () => {
  const result = await browser(async () => {
    const {createBoatGame} = await window.g20Import('/src/pirates/boat/scene.js');
    const g = createBoatGame({container: document.body, game: 'dash', wave: 45, code: 'ISLE-K7Q2M', autoplay: false});
    for (let i = 0; i < 30; i++) g.update(.1);
    window.dispatchEvent(new KeyboardEvent('keydown', {code: 'ArrowRight'}));
    for (let i = 0; i < 3; i++) g.update(.1);
    window.dispatchEvent(new KeyboardEvent('keyup', {code: 'ArrowRight'}));
    const right = g.boatX;
    const left = document.querySelector('.boat-left');
    left.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, pointerId: 1}));
    for (let i = 0; i < 6; i++) g.update(.1);
    left.dispatchEvent(new PointerEvent('pointerup', {bubbles: true, pointerId: 1}));
    const afterLeft = g.boatX, recorded = g.samples.size, values = [...g.samples.values()];
    for (let i = 0; i < 200; i++) g.update(.1);
    const phase = g.phase;
    document.querySelector('.boat-again').click();
    const again = {phase: g.phase, samples: g.samples.size, x: g.boatX};
    g.dispose();
    return {right, afterLeft, recorded, inRange: values.every(x => x >= 0 && x <= 100), phase, again, left: document.querySelectorAll('.boat-game').length};
  });
  expect(result.right).toBeGreaterThan(80);
  expect(result.afterLeft).toBeLessThan(result.right);
  expect(result.recorded).toBe(9);
  expect(result.inRange).toBe(true);
  expect(result.phase).toBe('result');
  expect(result.again).toEqual({phase: 'intro', samples: 0, x: 50});
  expect(result.left).toBe(0);
});
