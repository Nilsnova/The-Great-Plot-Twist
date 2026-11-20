import { describe, expect, it } from 'vitest';
import { classifyApproach, prepareApproachTowers, sampleSeaApproaches } from '../../src/island/coverage-model.js';
import { CONFIG, coastPoint, createWave, previewDefenseCoverage } from '../../src/pirates/sim.js';

const sample = (x, target = 'boarders', extra = {}) => ({id: 'point', x, z: 0, target, laneId: 'east', ...extra});
const defense = (kind, extra = {}) => ({id: kind, kind, level: 1, x: 0, z: 0, ...extra});
const statuses = (...ids) => new Map(ids.map(id => [id, 'ready']));
const check = (point, towers, complete = true) => classifyApproach([point], towers, {complete})[0];

describe('prepared approach towers', () => {
  it('preserves the existing simulator profiles and does not assume unknown towers are operational', () => {
    const defenses = ['cannon', 'mortar', 'harpoon', 'culverin', 'swivel', 'wall', 'house']
      .map(kind => defense(kind)).concat(defense('watchtower', {spec: 'eagle_eye'}));
    const statusById = new Map([['cannon', 'ready'], ['harpoon', 'destroyed']]);
    const towers = prepareApproachTowers(defenses, {defensesV2: true, statusById});
    expect(towers.map(tower => [tower.id, tower.status])).toEqual([
      ['cannon', 'ready'], ['culverin', 'unknown'], ['harpoon', 'destroyed'], ['mortar', 'unknown'], ['swivel', 'unknown'],
    ]);
    for (const {status, ...tower} of towers) {
      expect(tower).toEqual(previewDefenseCoverage(defenses, tower.id, {defensesV2: true}));
    }
    expect(prepareApproachTowers(defenses).some(tower => tower.kind === 'culverin')).toBe(false);
  });

  it('recomputes the real Eagle Eye boundary for a draft position without changing the confirmed records', () => {
    const confirmed = [defense('cannon', {x: 22}), defense('watchtower', {spec: 'eagle_eye'})];
    const drafted = [{...confirmed[0], x: 22.5}, confirmed[1]];
    const options = {statusById: statuses('cannon')};
    expect(prepareApproachTowers(confirmed, options)[0].range).toBe(43.2);
    expect(prepareApproachTowers(drafted, options)[0].range).toBe(36);
    expect(confirmed[0].x).toBe(22);
  });
});

describe('approach coverage', () => {
  it('keeps boarders, sailing ships and ships at anchor distinct', () => {
    const defenses = ['harpoon', 'swivel', 'culverin'].map(kind => defense(kind));
    const towers = prepareApproachTowers(defenses, {defensesV2: true, statusById: statuses('harpoon', 'swivel', 'culverin')});
    expect(check(sample(12), towers)).toMatchObject({status: 'covered', towerIds: ['swivel']});
    expect(check(sample(12, 'sailing-ships'), towers)).toMatchObject({status: 'covered', towerIds: ['culverin', 'harpoon']});
    expect(check(sample(12, 'anchored-ships'), towers)).toMatchObject({status: 'covered', towerIds: ['culverin']});
    expect(check(sample(12), towers.filter(tower => tower.kind === 'harpoon')).status).toBe('uncovered');
    expect(check(sample(12, 'sailing-ships'), towers.filter(tower => tower.kind === 'swivel')).status).toBe('uncovered');
  });

  it('preserves points, lets dual-role defenses contribute, and matches inclusive dead-zone and outer boundaries', () => {
    const towers = prepareApproachTowers([defense('mortar')], {statusById: statuses('mortar')});
    const exactMin = sample(8, 'sailing-ships', {note: 'keep me'});
    expect(classifyApproach([sample(7.999), exactMin, sample(36), sample(36.001)], towers, {complete: true})).toEqual([
      {...sample(7.999), status: 'uncovered', towerIds: []},
      {...exactMin, status: 'covered', towerIds: ['mortar']},
      {...sample(36), status: 'covered', towerIds: ['mortar']},
      {...sample(36.001), status: 'uncovered', towerIds: []},
    ]);
  });

  it('keeps the simulator night and reload conditions distinct from confirmed reach', () => {
    const sim = createWave({wave: 5, countdown: 3, event: 'night_raid', defenses: [defense('mortar')]});
    const tower = sim.attackCoverage('mortar');
    expect(tower.reload).toBeGreaterThan(0);
    expect(check(sample(12), [tower])).toMatchObject({status: 'conditional', towerIds: ['mortar']});
    expect(check(sample(12), [{...tower, reload: 0}]).status).toBe('covered');
    expect(check(sample(30), [{...tower, reload: 0}]).status).toBe('conditional');
    expect(check(sample(37), [tower]).status).toBe('uncovered');
  });

  it('prioritizes available reach over temporary and unknown reach and omits destroyed towers', () => {
    const base = prepareApproachTowers(['cannon', 'mortar', 'swivel'].map(kind => defense(kind)));
    const [cannon, mortar, swivel] = base;
    const jammed = {...cannon, status: 'jammed'};
    const silenced = {...mortar, status: 'silenced'};
    expect(check(sample(12), [jammed, silenced, swivel])).toMatchObject({status: 'conditional', towerIds: ['cannon', 'mortar']});
    expect(check(sample(12), [jammed, silenced, {...swivel, status: 'ready'}])).toMatchObject({status: 'covered', towerIds: ['swivel']});
    expect(check(sample(12), [{...mortar, status: 'destroyed'}, swivel])).toMatchObject({status: 'unknown', towerIds: ['swivel']});
    expect(check(sample(12), [{...mortar, status: 'destroyed'}]).status).toBe('uncovered');
    expect(check(sample(20), [swivel]).status).toBe('uncovered');
  });

  it('only shows a missing defense as a gap when the snapshot and route sample are known', () => {
    const point = sample(12);
    const towers = prepareApproachTowers([defense('cannon')], {statusById: statuses('cannon')});
    expect(check(point, [], false)).toMatchObject({status: 'unknown', towerIds: []});
    expect(check(point, [], true)).toMatchObject({status: 'uncovered', towerIds: []});
    expect(check({...point, unresolved: true}, towers)).toMatchObject({status: 'unknown', towerIds: []});
    expect(check({...point, x: NaN}, towers)).toMatchObject({status: 'unknown', towerIds: []});
  });
});

describe('sea approach samples', () => {
  it('samples the canonical coast between known spawn and stop geometry, without claiming an actual anchorage', () => {
    const coast = {...CONFIG.coast, rx: 21, rz: 15, seed: 2};
    const lanes = [{id: 'test', bearing: 44}];
    const samples = sampleSeaApproaches(lanes, coast);
    const from = coastPoint(44 * Math.PI / 180, CONFIG.spawnRadius, coast);
    const to = coastPoint(44 * Math.PI / 180, CONFIG.stopRadius, coast);
    expect(samples).toHaveLength(8);
    expect(new Set(samples.map(row => row.id)).size).toBe(8);
    for (const [index, row] of samples.entries()) {
      const share = (index + .5) / samples.length;
      expect(row).toMatchObject({laneId: 'test', target: 'sailing-ships'});
      expect(row.x).toBeCloseTo(from.x + (to.x - from.x) * share);
      expect(row.z).toBeCloseTo(from.z + (to.z - from.z) * share);
    }
    expect(sampleSeaApproaches()).toHaveLength(CONFIG.lanes.length * 8);
    expect(sampleSeaApproaches([])).toEqual([]);
    expect(sampleSeaApproaches(Array.from({length: 5}, (_, index) => ({id: String(index), bearing: index * 30})))).toHaveLength(32);
    expect(sampleSeaApproaches([{id: 'bad', bearing: NaN}])).toEqual([]);
  });
});
