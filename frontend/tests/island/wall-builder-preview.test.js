// Exact construction ghost geometry and resource ownership; no browser, paid state or placement authority.
import * as THREE from 'three';
import {expect, it, vi} from 'vitest';
import {createWallBuilderPreview} from '../../src/island/wall-builder-preview.js';
function setup() {
  const root = new THREE.Group(), texture = new THREE.Texture();
  return {root, texture, preview: createWallBuilderPreview({root, wall: {texture, size: [32, 32], anchor: 8}})};
}
it('draws snapped wall art and half-grid footprints, green only for an accepted quote', () => {
  const {root, preview} = setup(), cells = [{x: 1.5, z: 6}, {x: 3.5, z: 6}];
  preview.show({cells, valid: false}); const group = root.getObjectByName('island-wall-draft');
  const first = group.getObjectByName('wall-draft:0'); expect(first.position.x).toBeCloseTo(3.15,10); expect(first.position.y).toBeCloseTo(-3.6,10); // D064:1.3×1.5+.2×6,−.6×6.
  expect(first.userData.ground).toEqual(cells[0]); expect(first.geometry.parameters).toMatchObject({width: 2, height: 2});
  const amber = first.material.color.getHex(); preview.show({cells, valid: true}); expect(first.material.color.getHex()).not.toBe(amber);
  const grid = group.getObjectByName('wall-draft-grid'); expect(grid.geometry.attributes.position.count).toBe(40);
  preview.show(null); expect(group.visible).toBe(false); preview.dispose();
});
it('reuses bounded ghost meshes and releases only its own resources once', () => {
  const {root, texture, preview} = setup(), cells = [{x: 1, z: 6}, {x: 3, z: 6}];
  const borrowed = vi.fn(); texture.addEventListener('dispose', borrowed); preview.show({cells, valid: false});
  const group = root.getObjectByName('island-wall-draft'), first = group.getObjectByName('wall-draft:0');
  preview.show({cells, valid: false}); expect(group.getObjectByName('wall-draft:0')).toBe(first);
  preview.show({cells: cells.slice(0, 1), valid: false}); expect(group.getObjectByName('wall-draft:1').visible).toBe(false);
  const freed = vi.fn(); first.geometry.addEventListener('dispose', freed); preview.dispose(); preview.dispose();
  preview.show({cells, valid: true}); expect(root.children).toHaveLength(0); expect(freed).toHaveBeenCalledTimes(1); expect(borrowed).not.toHaveBeenCalled();
});
