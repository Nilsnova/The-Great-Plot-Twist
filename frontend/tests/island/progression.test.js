// T45: the statue stages and the "This island" progress lines read only the island's best won wave.
import {expect, it} from 'vitest';
import {STATUE_STAGES, statueStage} from '../../src/art/milestones.js';
import {crewLabel, progressLines, progressSummary} from '../../src/island/progression.js';
import {decorationState} from '../../src/island/decorations.js';

it('raises the statue one stage at waves 25, 50, 75 and 100, and never before 25', () => {
  expect(STATUE_STAGES.map(stage => [stage.wave, stage.name])).toEqual(
    [[25, 'bronze'], [50, 'silver'], [75, 'gold'], [100, 'crowned']]);
  const at = wave => statueStage(wave).index;
  expect([0, 24, 25, 49, 50, 74, 75, 99, 100, 1000].map(at)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  expect(statueStage(24).name).toBe('none');
  for (const wave of [-1, '50', 2.5, NaN, Infinity, null]) expect(at(wave)).toBe(0);
});

it('gives the island decoration the statue stage, keeping the T5 wave-25 switch', () => {
  expect(decorationState({wave: 24})).toMatchObject({statue: false, statueStage: 0});
  expect(decorationState({wave: 25})).toMatchObject({statue: true, statueStage: 1});
  expect(decorationState({wave: 74})).toMatchObject({statue: true, statueStage: 2});
  expect(decorationState({wave: 100})).toMatchObject({statue: true, statueStage: 4});
  expect(decorationState({wave: 12, nextWave: 10, survived: false})).toMatchObject({statueStage: 0});
});

it('summarises the shield, the statue and the next milestone of each kind', () => {
  expect(progressSummary(0)).toEqual({wave: 0, shield: 'unranked', statue: 'none',
    nextShield: {wave: 1, name: 'wood'}, nextStatue: {wave: 25, name: 'bronze'}});
  expect(progressSummary(27)).toEqual({wave: 27, shield: 'silver', statue: 'bronze',
    nextShield: {wave: 30, name: 'gold'}, nextStatue: {wave: 50, name: 'silver'}});
  expect(progressSummary(99)).toMatchObject({nextShield: {wave: 100, name: 'crowned'}, nextStatue: {wave: 100, name: 'crowned'}});
  expect(progressSummary(100)).toMatchObject({shield: 'crowned', statue: 'crowned', nextShield: null, nextStatue: null});
  for (const wave of [-3, '30', NaN]) expect(progressSummary(wave).wave).toBe(0);
});

it('turns the summary into short card lines', () => {
  expect(progressLines(progressSummary(0))).toEqual({headline: 'Best wave 0',
    detail: 'Unranked shield · No statue yet', next: 'Next: Wood shield at wave 1 · Bronze statue at wave 25'});
  expect(progressLines(progressSummary(27))).toEqual({headline: 'Best wave 27',
    detail: 'Silver shield · Bronze statue', next: 'Next: Gold shield at wave 30 · Silver statue at wave 50'});
  expect(progressLines(progressSummary(55)).next).toBe('Next: Champion shield at wave 60 · Gold statue at wave 75');
  expect(progressLines(progressSummary(100))).toEqual({headline: 'Best wave 100',
    detail: 'Crowned shield · Crowned statue', next: 'Every milestone reached.'});
});

it('labels solo and crew wins without inventing a number', () => {
  expect(crewLabel(1)).toBe('Solo');
  expect(crewLabel(4)).toBe('Crew of 4');
  for (const crew of [undefined, 0, 11, 2.5, '3']) expect(crewLabel(crew)).toBe('');
});
