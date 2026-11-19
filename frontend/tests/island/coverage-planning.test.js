import {describe, expect, it} from 'vitest';
import {classifyApproach} from '../../src/island/coverage-model.js';
import {approachSnapshot} from '../../src/island/coverage-planning.js';

const tower = {id: 'cannon_1', kind: 'mortar', built: true, level: 2, x: 0, z: 0};
const wall = {id: 'wall_1', kind: 'wall', built: true, level: 1, x: -18.5, z: -1};
const island = {code: 'test', islandEpoch: 'example', waveBest: 14, spots: [tower, wall]};
const towerHealth = {spot: tower.id, kind: tower.kind, level: tower.level, hpUnits: 1_000_000, maxHP: 120};
const wallHealth = {spot: wall.id, kind: wall.kind, level: wall.level, hpUnits: 500_000, maxHP: 60};
const recovery = {structures: [towerHealth, wallHealth]};
const draft = {spotId: tower.id, x: 15, z: -1, ok: true, message: ''};
const sample = {x: 10, z: 0, target: 'boarders'};
const view = (overrides = {}) => approachSnapshot({target: 'boarders', island, ...overrides});
const coverageAt = ({towers, complete}) => classifyApproach([sample], towers, {complete})[0].status;

describe('approach coverage from village data', () => {
  it('uses the valid draft position and only changes the renderer version for a different layout', () => {
    const saved = view();
    const preview = view({draft});
    expect(saved.wave).toBe(15);
    expect(preview.defenses.find(item => item.id === tower.id)).toMatchObject({x: 15, z: -1});
    expect(tower).toMatchObject({x: 0, z: 0});
    expect(coverageAt(saved)).toBe('covered');
    expect(coverageAt(preview)).toBe('uncovered');
    expect(preview.version).not.toBe(saved.version);
    expect(view({draft: {...draft}}).version).toBe(preview.version);
    expect(view({draft: {...draft, ok: false}}).version).toBe(saved.version);
    expect(view({draft: {...draft, message: 'Refused'}}).version).toBe(saved.version);
    expect(view({draft: {...draft, x: NaN}}).version).toBe(saved.version);
  });

  it('keeps health on the saved building and ignores missing, malformed or mismatched records', () => {
    const ready = view({recovery, needsRecovery: true, draft});
    expect(ready.stateWalls).toEqual([{id: wall.id, hp: 30, maxHp: 60}]);
    expect(ready.stateTowers).toEqual([{id: tower.id, hp: 120, maxHp: 120}]);
    expect(ready.towers[0]).toMatchObject({id: tower.id, status: 'ready', x: draft.x, z: draft.z});

    const destroyed = view({needsRecovery: true, recovery: {structures: [{...towerHealth, hpUnits: 0}, wallHealth]}});
    expect(coverageAt(destroyed)).toBe('uncovered');
    expect(destroyed.towers[0].status).toBe('destroyed');
    expect(destroyed.version).not.toBe(view({needsRecovery: true, recovery}).version);
    for (const changed of [{level: 1}, {kind: 'harpoon'}, {hpUnits: -1}, {maxHP: 0}]) {
      const stale = view({needsRecovery: true, recovery: {structures: [{...towerHealth, ...changed}, wallHealth]}});
      expect(coverageAt(stale)).toBe('unknown');
      expect(stale.stateTowers).toEqual([]);
    }
  });

  it('marks ground gaps unknown when wall durability is absent and preserves known legacy wall health', () => {
    const waiting = view({needsLegacyWalls: true});
    const read = view({needsLegacyWalls: true, legacyWalls: new Map([[wall.id, {health: 0}]])});
    expect(waiting.complete).toBe(false);
    expect(read.complete).toBe(true);
    expect(read.defenses.find(item => item.id === wall.id).health).toBe(0);
    expect(view({target: 'ships', needsLegacyWalls: true}).complete).toBe(true);
    expect(view({needsRecovery: true, recovery: {structures: [towerHealth]}}).complete).toBe(false);
  });

  it('leaves ground gaps unknown until blocking tower health is confirmed without hiding sea gaps', () => {
    const nonBlockers = [{id: 'tower_1', kind: 'watchtower', level: 1, built: true, x: 6, z: 6},
      {id: 'house_1', kind: 'house', level: 1, built: true, x: 6, z: 12}];
    const planning = {island: {...island, spots: [...island.spots, ...nonBlockers]}, needsRecovery: true};
    const missing = {structures: [wallHealth]};
    const outside = {x: 100, z: 0};
    const statusAt = ({towers, complete}, target) => classifyApproach([{...outside, target}], towers, {complete})[0].status;

    const ground = view({...planning, recovery: missing});
    expect(ground.complete).toBe(false);
    expect(statusAt(ground, 'boarders')).toBe('unknown');
    const sea = view({...planning, recovery: missing, target: 'ships'});
    expect(sea.complete).toBe(true);
    expect(statusAt(sea, 'sailing-ships')).toBe('uncovered');
    for (const hpUnits of [0, 1_000_000]) {
      const confirmed = view({...planning, recovery: {structures: [wallHealth, {...towerHealth, hpUnits}]}});
      expect(confirmed.complete).toBe(true);
      expect(statusAt(confirmed, 'boarders')).toBe('uncovered');
    }
  });
});
