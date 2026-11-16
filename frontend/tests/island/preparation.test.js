import {expect, it} from 'vitest';
import {preparationModel, nextWaveNumber} from '../../src/island/preparation-model.js';
import {bellModel} from '../../src/island/card-model.js';

it.each([
  [20, 18, 18], // A defeat can restart below the island's best wave.
  [0, 1, 1],
  [100, 100, 100],
  [100, undefined, 100], // Older answers still need a bounded fallback.
])('bell preview follows the next wave (best=%s, next=%s)', (waveBest, nextWave, expected) => {
  expect(bellModel({waveBest, nextWave}).line).toBe(`Ring it and wave ${expected} sails in after a 10 second countdown.`);
});

const island = {code: 'ISLE-K7Q2M', waveBest: 1, spots: [
  {id: 'cannon_1', kind: 'cannon', built: true}, {id: 'tower_1', kind: 'watchtower', built: true},
  {id: 'wall_1', kind: 'wall', built: true}, {id: 'wall_2', kind: 'wall', built: true},
  {id: 'swivel_1', kind: 'swivel', built: true}, {id: 'house_1', kind: 'house', built: true}, {id: 'cannon_2', kind: 'mortar', built: false},
]};
it('counts built defenses only and reads the existing campaign unlocks', () => {
  const view = preparationModel({island});
  expect(view.lines).toEqual(['Built: 3 towers · 2 walls.']);
  expect(view.unlocks).toHaveLength(3);
  expect(view.unlocks[0]).toContain('Win wave 2:');
  expect(view.unlocks.join(' ')).not.toContain('repaired ship');
  expect(island.spots[6].built).toBe(false);
});
it('known wall damage is descriptive, never a new start restriction', () => {
  const preparation = preparationModel({island, wallRecovery: true,
    wallState: {code: island.code, rows: [{spot: 'wall_1', health: 0}, {spot: 'wall_2', health: 70}]}});
  expect(preparation.lines[1]).toBe('Last known wall health: 1 destroyed · 1 damaged.');
  expect(bellModel({preparation}).disabled).toBe(false);
});
it.each([null, {code: 'OTHER', rows: [{spot: 'wall_1', health: 0}]},
  {code: island.code, rows: [{spot: 'wall_1', health: 100}]},
  {code: island.code, rows: [{spot: 'wall_1', health: 101}, {spot: 'wall_2', health: 100}]}])(
  'incomplete, invalid and other-island wall data stays unknown (%j)', wallState => {
    expect(preparationModel({island, wallRecovery: true, wallState}).lines[1]).toBe('Wall health is not available for every built wall.');
  });
it('loading, the feature flag and the final campaign step have explicit boundaries', () => {
  expect(preparationModel().lines).toEqual(['Island data is still loading.']);
  expect(preparationModel({island, wallRecovery: false}).lines).toHaveLength(1);
  expect(preparationModel({island: {...island, waveBest: 100}}).unlocks).toEqual([]);
  expect(nextWaveNumber('7', -1)).toBe(1);
  expect(nextWaveNumber(101, 99)).toBe(100);
});
it('preparation disappears once joining or defending a running wave', () => {
  expect(bellModel({wave: {wave: 5}, preparation: preparationModel({island})}).preparation).toBeUndefined();
});
