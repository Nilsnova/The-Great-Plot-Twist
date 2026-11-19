// The island between waves wears the path plates and skill emblems (src/art/path-marks.js) over its own sprites:
// placed with the building, swapped when the tree or skill changes, and left off a ruin.
import {describe, expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';

const evaluate = browserHarness();

describe('path marks on the island', () => {
  it('places, swaps and hides the marks with the building', async () => {
    const result = await evaluate(async () => {
      const THREE = await window.g20Import('/node_modules/three/build/three.module.js');
      const {decorateIsland} = await window.g20Import('/src/island/world.js');
      const place = {group: new THREE.Group(), colliders: [], zones: []};
      let wanted = [];
      const drawing = decorateIsland(place, {layout: {spots: [{id: 'cannon_1', slot: 'tower', x: 3, z: 4}, {id: 'wall_1', slot: 'wall', x: -6, z: 2}], zones: () => [], cabin: false, bell: false},
        loadArt: async names => { wanted = names; return Object.fromEntries(names.map(id => [id, new THREE.MeshBasicMaterial()])); }});
      await Promise.resolve(); await Promise.resolve();
      const group = place.group.children.find(child => child.name === 'island');
      const marks = () => group.children.filter(child => child.name.startsWith('island-mark:')).map(child => `${child.name}=${child.userData.mark}`).sort();
      const cannon = {id: 'cannon_1', kind: 'cannon', built: true, level: 5, tree: {a: 2, b: 1}, spec: 'rapid'};
      const wall = {id: 'wall_1', kind: 'wall', built: true, level: 2, spec: 'thorns'};
      drawing.apply({spots: [cannon, wall]});
      const first = marks();
      const plate = group.children.find(child => child.name === 'island-mark:cannon_1:a'), tower = group.children.find(child => child.name === 'island-cannon:cannon_1');
      const offset = [plate.position.x - tower.position.x, plate.position.y - tower.position.y];
      drawing.apply({spots: [{...cannon, tree: {a: 1, b: 3}, spec: null}, wall]});
      const swapped = marks();
      drawing.apply({spots: [{...cannon, level: 4}, {...wall, spec: null}]});
      const none = marks();
      drawing.apply({spots: [cannon, wall], battle: true});
      const battle = marks();
      drawing.dispose();
      return {wanted: wanted.filter(id => id.startsWith('mark-')).length, first, swapped, none, battle, offset};
    });
    expect(result.wanted).toBe(20);
    expect(result.first).toEqual(['island-mark:cannon_1:a=mark-path-a-2', 'island-mark:cannon_1:b=mark-path-b-1',
      'island-mark:cannon_1:spec=mark-spec-quick', 'island-mark:wall_1:spec=mark-spec-thorn-cap']);
    expect(result.offset[0]).toBeCloseTo(-.62, 5);
    expect(result.swapped).toEqual(['island-mark:cannon_1:a=mark-path-a-1', 'island-mark:cannon_1:b=mark-path-b-3', 'island-mark:wall_1:spec=mark-spec-thorn-cap']);
    expect(result.none).toEqual(['island-mark:cannon_1:spec=mark-spec-quick']);
    // In a wave the renderer draws walls and towers (and their marks); the island's step aside.
    expect(result.battle).toEqual([]);
  });

  it('restores tower level pips only when confirmed recovery raises health above zero', async () => {
    const result = await evaluate(async () => {
      const THREE = await window.g20Import('/node_modules/three/build/three.module.js');
      const {decorateIsland} = await window.g20Import('/src/island/world.js');
      const place = {group: new THREE.Group(), colliders: [], zones: []};
      const drawing = decorateIsland(place, {
        layout: {spots: [{id: 'cannon_1', slot: 'tower', x: 3, z: 4}], zones: () => [], cabin: false, bell: false},
        loadArt: async names => Object.fromEntries(names.map(id => [id, new THREE.MeshBasicMaterial()])),
      });
      await Promise.resolve(); await Promise.resolve();
      const cannon = {id: 'cannon_1', kind: 'cannon', level: 3, built: true};
      const observe = () => {
        const visible = drawing.root.children.filter(mesh => mesh.visible);
        return {
          look: visible.find(mesh => mesh.name === 'island-cannon:cannon_1')?.userData.recoveryLook,
          pips: visible.filter(mesh => mesh.name.startsWith('island-pip:cannon_1:')).length,
          health: visible.some(mesh => mesh.name === 'structure-recovery:cannon_1'),
        };
      };
      const recovery = (hpUnits, recoveryVersion = 1) => ({recoveryVersion, displayPhase: 'between_waves', islandEpoch: 'test-island',
        structures: [{spot: cannon.id, kind: cannon.kind, level: cannon.level, instanceId: 'test-cannon', hpUnits, maxHP: 60}]});
      try {
        drawing.apply({spots: [cannon]});
        drawing.setRecoveryState(recovery(0)); const broken = observe();
        drawing.setRecoveryState(recovery(1)); const damaged = observe();
        drawing.setRecoveryState(recovery(1_000_000)); const whole = observe();
        drawing.setRecoveryState(recovery(0, 0)); const legacy = observe();
        return {broken, damaged, whole, legacy};
      } finally { drawing.dispose(); }
    });
    expect(result.broken).toEqual({look: 'broken', pips: 0, health: true});
    expect(result.damaged).toEqual({look: 'damaged', pips: 3, health: true});
    expect(result.whole).toEqual({look: 'intact', pips: 3, health: false});
    expect(result.legacy).toEqual(result.whole);
  });
});
