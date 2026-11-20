// Playtest (Nicolas, 20 Nov): once every goal is done, the Goals box must leave the screen instead of
// sitting there for the rest of the game. It says goodbye for GOALS_FAREWELL_MS, then hides for good.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const browser = browserHarness();

it('shows "All goals done" for a moment after the last goal, then hides, and stays hidden on the next visit', async () => {
  const result = await browser(async () => {
    const {createHud, GOALS_FAREWELL_MS} = await window.g20Import('/src/ui/hud.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const {QUEST_EVENTS} = await window.g20Import('/src/ui/quest-events.js');
    localStorage.clear();
    localStorage.setItem('plot_twist_first_quests_v1', JSON.stringify({version: 1, done: 9}));
    let clock = 1000;
    const options = {on, emit, toast() {}, now: () => clock};
    const hud = createHud(document.body, {focus() {}, travel: () => false}, options);
    const strip = () => document.querySelector('.quest-strip');
    const frame = () => hud.update(null, {speed: 0});
    frame();
    const nearEnd = {hidden: strip().hidden, progress: document.querySelector('.quest-progress').textContent};
    emit({type: QUEST_EVENTS.WAVE_FINISHED, survived: true, wave: 10});
    frame();
    const justDone = {hidden: strip().hidden, finale: document.querySelector('.quest-next').textContent, finaleHidden: document.querySelector('.quest-next').hidden};
    clock += GOALS_FAREWELL_MS - 1; frame();
    const stillThere = strip().hidden;
    clock += 2; frame();
    const gone = strip().hidden;
    // Another strip (the class demo) is not ours to hide, and the goals stay away when it leaves.
    hud.setQuests({title: 'Class goals', progress: '0 of 3 done', allDone: false, finale: '', items: [{id: 'wave', label: 'Wave to a captain', hint: 'Walk up.', step: 1, done: false, current: true}]});
    const classShown = strip().hidden;
    hud.setQuests(null); frame();
    const afterClass = strip().hidden;
    hud.dispose();
    // The next visit: every goal is already done, so the box never appears.
    const again = createHud(document.body, {focus() {}, travel: () => false}, options);
    again.update(null, {speed: 0});
    const nextVisit = strip().hidden, stored = JSON.parse(localStorage.getItem('plot_twist_first_quests_v1'));
    again.dispose();
    return {nearEnd, justDone, stillThere, gone, classShown, afterClass, nextVisit, stored, ms: GOALS_FAREWELL_MS};
  });
  expect(result.nearEnd).toEqual({hidden: false, progress: '9 of 10'});
  expect(result.justDone.hidden).toBe(false);
  expect(result.justDone.finaleHidden).toBe(false);
  expect(result.justDone.finale).toMatch(/All goals done/);
  expect(result.stillThere).toBe(false);
  expect(result.gone).toBe(true);
  expect(result.classShown).toBe(false);
  expect(result.afterClass).toBe(true);
  expect(result.nextVisit).toBe(true);
  expect(result.stored).toEqual({version: 1, done: 10});
  expect(result.ms).toBeGreaterThanOrEqual(5000);
});

it('keeps the box while goals are open', async () => {
  const hidden = await browser(async () => {
    const {createHud} = await window.g20Import('/src/ui/hud.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    localStorage.clear();
    let clock = 0;
    const hud = createHud(document.body, {focus() {}, travel: () => false}, {on, emit, toast() {}, now: () => clock});
    clock = 10 * 60 * 1000; hud.update(null, {speed: 0});
    const value = document.querySelector('.quest-strip').hidden; hud.dispose(); return value;
  });
  expect(hidden).toBe(false);
});
