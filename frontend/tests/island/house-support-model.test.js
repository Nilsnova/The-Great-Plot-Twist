import {expect, it} from 'vitest';
import {previewHouseSupport} from '../../src/island/house-support-model.js';
import {defenses} from '../../src/island/spots.js';
import {CONFIG, createWave} from '../../src/pirates/sim.js';

const house = (spec, extra = {}) => ({id: 'house_1', kind: 'house', built: true, level: 2, spec, ...extra});
const wall = (id, x, z, extra = {}) => ({id, kind: 'wall', built: true, level: 1, x, z, ...extra});
const model = (spots, extra = {}) => previewHouseSupport({houseId: 'house_1', spots, ...extra});
const ids = rows => rows.map(row => row.id);

it('uses the wave’s exact Workshop boundary and supports built legacy walls including rubble', () => {
  const spots = [house('workshop'),
    wall('wall_1', 13, 2, {health: 0}),
    wall('wall_2', 13, 2.000001),
    wall('wall_3', 8, -6, {built: false}),
    {id: 'cannon_1', kind: 'cannon', level: 1, built: true, x: 8, z: -6},
    house('tavern', {id: 'house_2', x: 9, z: -6})];
  const support = model(spots, {recoveryVersion: 0});
  const wave = createWave({seed: 1, wave: 1, defenses: defenses(spots)});
  expect(support).toMatchObject({status: 'active', effect: {target: 'wall', phase: 'wave'},
    current: {x: 7, z: -6, areas: [{x: 7, z: -6, radius: CONFIG.houses.workshop.radius}],
      beneficiaries: [{id: 'wall_1', kind: 'wall', x: 13, z: 2}]}});
  expect(ids(support.current.beneficiaries)).toEqual(ids(wave.state().walls.filter(row => row.workshop === 1)));
  expect(model(spots, {recoveryVersion: 1})).toMatchObject({role: 'workshop', status: 'inactive', effect: null,
    current: {areas: [], beneficiaries: []}, proposed: null});
  for (const recoveryVersion of [null, 2]) {
    expect(model(spots, {recoveryVersion})).toMatchObject({status: 'unknown-policy', effect: null,
      current: {areas: [], beneficiaries: null}});
  }
});

it('labels Tavern reach for confirmed standing captains and keeps the revive discount island-wide', () => {
  const captain = (id, x, extra = {}) => ({id, x, z: -6, hp: 75, maxHp: 100, present: true, down: false, ...extra});
  const captains = [
    captain('boundary', 13), captain('past', 13.000001), captain('full', 7, {hp: 100}),
    captain('down', 7, {down: true}), captain('away', 7, {present: false}), captain('invalid', NaN),
    captain('unknown-health', 7, {hp: undefined}), captain('unknown-presence', 7, {present: undefined}),
  ];
  const spots = [house('tavern'), wall('wall_1', 8, -6)];
  const support = model(spots, {captains, recoveryVersion: 1, phase: 'wave'});
  expect(support.effect).toEqual({target: 'captain', phase: 'wave', hpPerSecond: CONFIG.houses.tavern.heal,
    maximumHpPerSecond: CONFIG.houses.tavern.max, islandReviveDiscountPercent: CONFIG.houses.tavern.revive});
  expect(support.current.areas).toEqual([{x: 7, z: -6, radius: CONFIG.houses.tavern.radius}]);
  expect(support.current.beneficiaries.map(({id, kind, needsHealing}) => [id, kind, needsHealing])).toEqual([
    ['boundary', 'captain', true], ['full', 'captain', false], ['unknown-health', 'captain', null],
  ]);
  expect(model(spots).current.beneficiaries).toBeNull(); // no announced party is different from an empty one
  expect(model(spots, {captains: []}).current.beneficiaries).toEqual([]);
});

it('uses the same Barracks staffing cap and exact posts as the running wave', () => {
  const a = house('barracks', {level: 3}), b = house('barracks', {id: 'house_2', level: 3, x: -8, z: -6});
  const spots = [b, a, wall('wall_1', 8, -5)];
  const left = model(spots, {recoveryVersion: 1});
  const right = model(spots, {houseId: 'house_2', recoveryVersion: 1});
  const wave = createWave({seed: 1, wave: 1, defenses: defenses(spots)});
  wave.step(CONFIG.tick);
  const actual = wave.state().militia;
  expect(left.effect).toEqual({target: 'boarder', phase: 'wave'});
  expect(left.current.militiaAtWaveStart).toBe(actual.filter(militia => militia.houseId === a.id).length);
  expect(right.current.militiaAtWaveStart).toBe(actual.filter(militia => militia.houseId === b.id).length);
  expect(left.current.areas.map(({x, z}) => [x, z])).toEqual([[6.55, -4.4], [7.45, -4.4]]);
  expect(right.current.areas).toEqual([{x: -8.45, z: -4.4, radius: CONFIG.houses.barracks.guard, leashRadius: CONFIG.houses.barracks.leash}]);
  expect(left.current.beneficiaries).toEqual([]);
});

it('compares only a valid planning Move and never edits the accepted house or its beneficiaries', () => {
  const spots = [house('workshop'), wall('wall_1', -2.5, -6), wall('wall_2', 17.5, -6)];
  const original = structuredClone(spots);
  const move = {spotId: 'house_1', x: 8, z: -6, ok: true};
  const support = model(spots, {recoveryVersion: 0, move});
  expect(support.current).toMatchObject({x: 7, z: -6, beneficiaries: [{id: 'wall_1'}]});
  expect(support.proposed).toMatchObject({x: 8, z: -6, beneficiaries: [{id: 'wall_2'}]});
  expect(ids(support.changes.added)).toEqual(['wall_2']);
  expect(ids(support.changes.removed)).toEqual(['wall_1']);
  for (const denied of [null, {...move, ok: false}, {...move, busy: true}, {...move, message: 'Refused'}, {...move, spotId: 'house_2'},
    {...move, x: 0, z: 2}, {...move, x: 8.1}]) {
    expect(model(spots, {recoveryVersion: 0, move: denied})).toMatchObject({current: support.current, proposed: null, changes: null});
  }
  expect(model(spots, {recoveryVersion: 0, phase: 'wave', move}).proposed).toBeNull();
  const occupied = [...spots, house('tavern', {id: 'house_2', x: 8, z: -6})];
  expect(model(occupied, {recoveryVersion: 0, move}).proposed).toBeNull();
  expect(spots).toEqual(original);
});

it('does not show an unbuilt, loading, or level-one house as active support', () => {
  expect(model(null)).toBeNull();
  expect(model([house('workshop', {level: 1})], {recoveryVersion: 0})).toBeNull();
  expect(model([house('tavern', {built: false})])).toBeNull();
  expect(model([house('unknown')])).toBeNull();
});
