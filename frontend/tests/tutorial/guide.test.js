// T52: the guided start's steps move only on the real actions, folded into the first goals.
import {describe, expect, it} from 'vitest';
import {GUIDE_STEPS, FIRST_QUESTS, applyGuideEvent, applyQuestEvent, guideCaption, guideStart, guideView, skipGuideStep} from '../../src/ui/first-quests.js';

const run = (events, state = guideStart()) => events.reduce((current, event) => applyGuideEvent(current, event).state, state);
const ids = state => GUIDE_STEPS[state.step]?.id ?? 'end';

describe('the guided start', () => {
  it('has the six steps of the brief, the cutlass as the second half of the fight', () => {
    expect(GUIDE_STEPS.map(step => step.id)).toEqual(['move', 'spot', 'cannon', 'menu', 'bell', 'shoot', 'cutlass']);
    for (const step of GUIDE_STEPS) { expect(step.caption.length).toBeLessThanOrEqual(130); expect(step.label.length).toBeLessThanOrEqual(24); }
  });
  it('moves one step per real action, in order, and ignores the wrong ones', () => {
    let state = guideStart();
    for (const wrong of [{type: 'hud_opened'}, {type: 'island_built', kind: 'wall'}, {type: 'captain_attack', weapon: 'gun'}, null]) {
      state = applyGuideEvent(state, wrong).state;
    }
    expect(ids(state)).toBe('move');
    state = run([{type: 'player_moved'}], state); expect(ids(state)).toBe('spot');
    state = run([{type: 'build_card_opened'}], state); expect(ids(state)).toBe('cannon');
    state = run([{type: 'island_built', kind: 'wall'}], state); expect(ids(state)).toBe('cannon');
    state = run([{type: 'island_built', kind: 'cannon'}], state); expect(ids(state)).toBe('menu');
    state = run([{type: 'hud_opened', what: 'menu'}], state); expect(ids(state)).toBe('bell');
    state = run([{type: 'wave_controller_started', wave: 1}], state); expect(ids(state)).toBe('shoot');
    state = run([{type: 'captain_attack', weapon: 'cutlass'}], state); expect(ids(state)).toBe('shoot');
    state = run([{type: 'captain_attack', weapon: 'gun'}], state); expect(ids(state)).toBe('cutlass');
    // The cutlass waits for boarders: a blow before they land does not count.
    expect(guideCaption(state, GUIDE_STEPS[6])).toMatch(/^If boarders land/);
    state = run([{type: 'captain_attack', weapon: 'cutlass'}], state); expect(ids(state)).toBe('cutlass');
    state = run([{type: 'boarders_ashore', wave: 1}], state);
    expect(guideCaption(state, GUIDE_STEPS[6])).toMatch(/^Boarders ashore/);
    const last = applyGuideEvent(state, {type: 'captain_attack', weapon: 'cutlass'});
    expect(last).toMatchObject({finished: true, completed: ['cutlass']});
    expect(last.state.done).toBe(true);
  });
  it('jumps ahead when the bell rings (or a cannon is built) before its step, and ends with the first wave', () => {
    const rung = applyGuideEvent(guideStart(), {type: 'wave_controller_started', wave: 1});
    expect(rung.completed).toEqual(['move', 'spot', 'cannon', 'menu', 'bell']);
    expect(ids(rung.state)).toBe('shoot');
    expect(ids(run([{type: 'island_built', kind: 'cannon'}]))).toBe('menu');
    // wave_finished before the bell is not the first wave of the guide; after it, the guide is over.
    expect(applyGuideEvent(guideStart(), {type: 'wave_finished', survived: true}).changed).toBe(false);
    const over = applyGuideEvent(rung.state, {type: 'wave_finished', survived: true});
    expect(over).toMatchObject({finished: true, completed: ['shoot', 'cutlass']});
  });
  it('skips a step or the whole guide', () => {
    const one = skipGuideStep(guideStart());
    expect(ids(one)).toBe('spot');
    expect(one.skipped).toEqual(['move']);
    const all = skipGuideStep(one, GUIDE_STEPS, {all: true});
    expect(all.done).toBe(true);
    expect(all.skipped).toEqual(GUIDE_STEPS.map(step => step.id));
  });
  it('shows in the goals strip in the goals\' own shape', () => {
    const view = guideView(run([{type: 'player_moved'}]));
    expect(view).toMatchObject({kind: 'guide', title: 'First steps', progress: '1 of 7', allDone: false});
    expect(view.items.find(item => item.current)).toMatchObject({id: 'guide_spot', label: 'Open a build spot', step: 2});
  });
  it('moves the first goals on the same actions (one vocabulary, no second system)', () => {
    // Building the cannon in step 3 is also the goal "Build a cannon"; the bell's wave is the goal "win a wave".
    const cannon = {type: 'island_built', kind: 'cannon'};
    expect(applyQuestEvent({done: 0}, cannon, FIRST_QUESTS).completed?.id).toBe('cannon');
    expect(GUIDE_STEPS.find(step => step.id === 'cannon')).toMatchObject({event: FIRST_QUESTS[0].event});
    expect(FIRST_QUESTS[0].matches(cannon)).toBe(GUIDE_STEPS[2].matches(cannon));
  });
});
