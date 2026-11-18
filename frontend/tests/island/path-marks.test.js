// Path and skill marks (owner: "visualize the buildings differently based on the upgrade path chosen"): which plate
// and emblem a building wears for its tower tree (D055) and skill (D051), the frames behind them, and the data
// reaching both renderers read-only (the island read's {a, b}, the recovery snapshot's [a, b]).
import * as THREE from 'three';
import {describe, expect, it} from 'vitest';
import {MARK_IDS, MARK_PLACES, PATH_MARK_IDS, SPEC_FAMILY, SPEC_MARK_IDS, buildingMarks, marksKey, pathMark, specMark, treeTiers}
  from '../../src/art/path-marks.js';
import {islandFrame, islandSizes} from '../../src/art/registry.js';
import {SPECS, SPEC_IDS} from '../../src/campaign/tech.js';
import {TREE_KINDS} from '../../src/pirates/tower-trees.js';
import {defenses} from '../../src/island/spots.js';
import {recoveryWaveDefenses} from '../../src/pirates/recovery-snapshot.js';
import {ATLAS_IDS, createWaveRenderer, packAtlas} from '../../src/pirates/render.js';
import {pirateDimensions} from '../../src/pixel/pirate-catalog.js';

const arts = list => list.map(mark => mark.art);

describe('the marks a building wears', () => {
  it('shows path a on the left and path b on the right of a level-5 tower, one plate per path, sized by tier', () => {
    for (const kind of TREE_KINDS) {
      expect(buildingMarks(kind, 5, null), kind).toEqual([]);
      expect(buildingMarks(kind, 5, {a: 0, b: 0}), kind).toEqual([]);
      for (const tier of [1, 2, 3]) {
        expect(arts(buildingMarks(kind, 5, {a: tier, b: 0})), kind).toEqual([`mark-path-a-${tier}`]);
        expect(arts(buildingMarks(kind, 5, {a: 0, b: tier})), kind).toEqual([`mark-path-b-${tier}`]);
      }
      expect(arts(buildingMarks(kind, 5, {a: 1, b: 1})), kind).toEqual(['mark-path-a-1', 'mark-path-b-1']);
      expect(arts(buildingMarks(kind, 5, {a: 3, b: 1})), kind).toEqual(['mark-path-a-3', 'mark-path-b-1']);
    }
    const [a, b] = buildingMarks('cannon', 5, {a: 1, b: 1});
    expect(a).toMatchObject({part: 'a', ...MARK_PLACES.pathA});
    expect(b).toMatchObject({part: 'b', ...MARK_PLACES.pathB});
    expect(a.dx).toBeLessThan(0);
    expect(b.dx).toBeGreaterThan(0);
    // The plate grows with the tier (wider frame), the shield stands a little taller than the pill (a shape cue).
    const width = name => islandFrame(name)[0];
    for (const path of ['a', 'b']) expect([1, 2, 3].map(tier => width(pathMark(path, tier)))).toEqual([11, 16, 21]);
    expect(islandFrame('mark-path-b-1')[1]).toBeGreaterThan(islandFrame('mark-path-a-1')[1]);
  });
  it('reads a tree as the sim does: level 5 only, the Bloons rule, unknown kinds and broken values are no tree', () => {
    expect(buildingMarks('cannon', 4, {a: 2, b: 0})).toEqual([]);
    expect(buildingMarks('cannon', 5, {a: 2, b: 2})).toEqual([]);
    expect(buildingMarks('cannon', 5, {a: 4, b: 0})).toEqual([]);
    expect(buildingMarks('cannon', 5, {a: '2', b: 0})).toEqual([]);
    expect(buildingMarks('wall', 5, {a: 2, b: 0})).toEqual([]);
    expect(buildingMarks('house', 3, {a: 1, b: 0}, 'tavern')).toEqual([]);
    // The recovery snapshot's [a, b] (backend wave_recovery.py) reads the same as the island read's {a, b}.
    expect(treeTiers('mortar', [2, 1])).toEqual({a: 2, b: 1});
    expect(arts(buildingMarks('mortar', 5, [0, 3]))).toEqual(['mark-path-b-3']);
    expect(treeTiers('mortar', [2, 2])).toBeNull();
  });
  it('gives every tower, wall and watchtower skill one family emblem, gold-rimmed for a capstone, and none for another kind', () => {
    for (const id of SPEC_IDS) {
      expect(SPEC_FAMILY[id], id).toBeTruthy();
      expect(specMark(id), id).toBe(`mark-spec-${SPEC_FAMILY[id]}${SPECS[id].capstone ? '-cap' : ''}`);
      const kind = SPECS[id].branch, marks = buildingMarks(kind, 2, null, id);
      expect(arts(marks), id).toEqual([specMark(id)]);
      expect(marks[0].part).toBe('spec');
    }
    expect(buildingMarks('mortar', 3, null, 'rapid')).toEqual([]); // a cannon's skill on a mortar is no skill
    expect(buildingMarks('house', 2, null, 'barracks')).toEqual([]); // a house's role is its own drawing
    expect(arts(buildingMarks('cannon', 5, {a: 0, b: 2}, 'broadside'))).toEqual(['mark-path-b-2', 'mark-spec-power-cap']);
    expect(new Set(SPEC_IDS.map(specMark)).size).toBeGreaterThan(8);
  });
  it('is memoised per (kind, level, tree a, tree b, spec): the same frozen list every frame', () => {
    const one = buildingMarks('swivel', 5, {a: 2, b: 1}, null);
    expect(buildingMarks('swivel', 5, {a: 2, b: 1}, null)).toBe(one);
    expect(buildingMarks('swivel', 5, [2, 1], null)).toBe(one);
    expect(Object.isFrozen(one) && Object.isFrozen(one[0])).toBe(true);
    expect(buildingMarks('swivel', 5, {a: 1, b: 1})).not.toBe(one);
    expect(marksKey('swivel', 5, {a: 2, b: 1})).toBe('mark-path-a-2+mark-path-b-1');
  });
  it('has a cartoon frame for every mark, anchored at its bottom, small next to a 48 x 32 tower', () => {
    expect(MARK_IDS).toEqual([...PATH_MARK_IDS, ...SPEC_MARK_IDS]);
    const sizes = islandSizes();
    for (const id of MARK_IDS) {
      const frame = islandFrame(id);
      expect(frame, id).not.toBeNull();
      expect(frame[2], id).toBe(0);
      expect(frame[0] <= 24 && frame[1] <= 14, id).toBe(true);
      expect(sizes[id], id).toEqual([frame[0] / 16, frame[1] / 16, 0]);
    }
  });
});

describe('the data reaching the renderers (read-only)', () => {
  it('keeps the tree and the skill on the legacy defense list', () => {
    const list = defenses([{id: 'cannon_1', kind: 'cannon', level: 5, built: true, spec: 'rapid', tree: {a: 2, b: 1}},
      {id: 'wall_1', kind: 'wall', level: 2, built: true, spec: 'spiked'}]);
    expect(list.find(item => item.id === 'cannon_1')).toMatchObject({tree: {a: 2, b: 1}, spec: 'rapid'});
    expect(arts(buildingMarks('cannon', 5, list[0]?.tree, list[0]?.spec)).length).toBeGreaterThan(0);
  });
  it('keeps the tree and the skill of the recovery snapshot\'s createWave defenses', () => {
    const snapshot = {createWave: {defenses: [{id: 'cannon_1', kind: 'cannon', level: 5, x: 1, z: 2, spec: 'heavy', tree: [0, 3]}]},
      structures: [{spot: 'cannon_1', kind: 'cannon', level: 5, x: 1, z: 2, instanceId: 'i-1', hpUnits: 1_000_000, repairSeq: 0, maxHP: 60}]};
    const [item] = recoveryWaveDefenses(snapshot);
    expect(item).toMatchObject({tree: [0, 3], spec: 'heavy'});
    expect(arts(buildingMarks(item.kind, item.level, item.tree, item.spec))).toEqual(['mark-path-b-3', 'mark-spec-power']);
  });
  it('draws the marks over a wave post, takes new ones in the break, and none on a broken tower or a pixel atlas', () => {
    const dims = {...pirateDimensions, ...Object.fromEntries(MARK_IDS.map(id => [id, islandFrame(id).slice(0, 3)]))};
    const atlas = {texture: new THREE.Texture(), ...packAtlas([...ATLAS_IDS, ...MARK_IDS], dims, 1024)};
    const scene = new THREE.Scene();
    const start = [{id: 'cannon_1', kind: 'cannon', level: 5, x: 4, z: 2, tree: {a: 1, b: 1}, spec: 'chain'}, {id: 'wall_1', kind: 'wall', level: 2, x: 0, z: 3, spec: 'stone'}];
    const renderer = createWaveRenderer({scene, atlas, defenses: start, fx: () => null});
    expect(renderer.marks()).toEqual({cannon_1: ['mark-path-a-1', 'mark-path-b-1', 'mark-spec-bind'], wall_1: ['mark-spec-power']});
    const count = id => renderer.root.children.find(child => child.name === `pirates:defense:${id}`).geometry.instanceCount;
    const state = (towers = []) => ({ships: [], walls: [], towers, boarders: [], fires: []});
    renderer.update({state: state(), dt: .016});
    const withMarks = count('cannon_1');
    renderer.setDefenses([{...start[0], tree: {a: 3, b: 0}, spec: null}, start[1]]);
    expect(renderer.marks().cannon_1).toEqual(['mark-path-a-3']);
    renderer.update({state: state(), dt: .016});
    expect(count('cannon_1')).toBe(withMarks - 2);
    renderer.dispose();
    // A pixel atlas (no mark frames) draws the same post without marks, never throws.
    const plain = createWaveRenderer({scene, atlas: {texture: new THREE.Texture(), ...packAtlas()}, defenses: start, fx: () => null});
    plain.update({state: state(), dt: .016});
    expect(plain.root.children.find(child => child.name === 'pirates:defense:cannon_1').geometry.instanceCount).toBe(withMarks - 3);
    plain.dispose();
  });
});
