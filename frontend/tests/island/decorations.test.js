// T5: visual milestones read the viewed island, never a wave attempt or captain's wallet.
import {expect, it} from 'vitest';
import {decorationState} from '../../src/island/decorations.js';
import {waveRank} from '../../src/art/milestones.js';

const house = id => ({id, kind: 'house', built: true});
it('shows the best beaten wave, and unlocks the statue exactly at 25', () => {
  expect(decorationState()).toEqual({wave: 0, statue: false, treeScale: 1});
  expect(decorationState({wave: 24})).toMatchObject({wave: 24, statue: false});
  expect(decorationState({wave: 25})).toMatchObject({wave: 25, statue: true});
  expect(decorationState({wave: 100})).toMatchObject({wave: 100, statue: true});
});
it('does not confuse a lost attempt or next wave with the saved record', () => {
  expect(decorationState({wave: 12, nextWave: 10, survived: false})).toMatchObject({wave: 12});
});
it('uses three tree sizes, and shrinks again after a house is removed', () => {
  expect(decorationState(null, [house('house_1')]).treeScale).toBe(1.1);
  expect(decorationState(null, [house('house_1'), house('house_2')]).treeScale).toBe(1.2);
  expect(decorationState(null, [{...house('house_1'), built: false}, house('house_2')]).treeScale).toBe(1.1);
  expect(decorationState(null, [{kind: 'cannon', built: true}]).treeScale).toBe(1);
});
it('resets from a developed island to a new island without keeping another island’s milestones', () => {
  decorationState({wave: 30}, [house('house_1'), house('house_2')]);
  expect(decorationState({wave: 1}, [])).toEqual({wave: 1, statue: false, treeScale: 1});
});
it('treats missing or malformed records as zero and ignores duplicate house ids', () => {
  for (const wave of [-1, 1.5, '25', NaN, Infinity]) expect(decorationState({wave}).wave).toBe(0);
  expect(decorationState(null, [house('house_1'), house('house_1')]).treeScale).toBe(1.1);
});

it('changes the badge rank at every ten-wave milestone, with a separate unranked start', () => {
  const ranks = ['unranked', 'wood', 'bronze', 'silver', 'gold', 'crystal', 'master',
    'champion', 'titan', 'legend', 'mythic', 'crowned'];
  expect(waveRank(0).name).toBe(ranks[0]);
  expect(waveRank(1).name).toBe(ranks[1]);
  expect(waveRank(9).name).toBe(ranks[1]);
  for (let wave = 10; wave <= 100; wave += 10) {
    expect(waveRank(wave - 1).name).toBe(ranks[wave / 10]);
    expect(waveRank(wave).name).toBe(ranks[wave / 10 + 1]);
    expect(waveRank(wave + 1).name).toBe(ranks[wave / 10 + 1]);
  }
  for (const wave of [-1, '25', NaN, Infinity]) expect(waveRank(wave).name).toBe('unranked');
});
