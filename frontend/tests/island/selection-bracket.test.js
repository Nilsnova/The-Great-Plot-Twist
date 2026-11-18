import {describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';
import {makeSelectionBracket} from '../../src/island/selection-bracket.js';
import {projectGround, unprojectGround} from '../../src/world/projection.js';

describe('portable selected wall corners', () => {
  it('fills the exact projected 2×2 tile corners with thick positive-winding strips', () => {
    const root = new THREE.Group(), bracket = makeSelectionBracket(root), group = root.getObjectByName('island-selection-bracket');
    expect(group.children).toHaveLength(2);
    const green = group.getObjectByName('selection-corner-green'), p = green.geometry.attributes.position;
    expect(green.isMesh).toBe(true); expect(p.count).toBe(32);
    for (let i = 0; i < p.count; i += 4) {
      const logical = Array.from({length: 4}, (_, j) => unprojectGround(p.getX(i + j), p.getY(i + j)));
      const xs = logical.map(point => point.x), zs = logical.map(point => point.z);
      const width = Math.max(...xs) - Math.min(...xs), depth = Math.max(...zs) - Math.min(...zs);
      expect(Math.min(width, depth)).toBeCloseTo(.16, 6); expect(Math.max(width, depth)).toBeCloseTo(.64, 6);
      expect(Math.max(...xs.map(Math.abs))).toBeLessThanOrEqual(1.000001); expect(Math.max(...zs.map(Math.abs))).toBeLessThanOrEqual(1.000001);
      const cross = (p.getX(i + 1) - p.getX(i)) * (p.getY(i + 2) - p.getY(i)) - (p.getY(i + 1) - p.getY(i)) * (p.getX(i + 2) - p.getX(i));
      expect(cross).toBeGreaterThan(0);
    }
    bracket.show({spotId: 'wall_128', x: 7.5, z: -.5}); const foot = projectGround(7.5, -.5);
    expect(group.position.toArray()).toEqual([foot.x, foot.y, 0]); expect(group.userData.spotId).toBe('wall_128');
    for (const mesh of group.children) {
      expect(mesh.renderOrder).toBeGreaterThan(150); expect(mesh.material).toMatchObject({depthTest: false, depthWrite: false, toneMapped: false});
      const intersections = []; mesh.raycast(new THREE.Raycaster(), intersections); expect(intersections).toEqual([]);
    }
    bracket.dispose();
  });

  it('reuses both buffers during selection updates and releases them exactly once', () => {
    const root = new THREE.Group(), bracket = makeSelectionBracket(root), group = root.children[0];
    const resources = group.children.map(mesh => ({geometry: mesh.geometry, positions: mesh.geometry.attributes.position.array,
      geometryDisposed: vi.spyOn(mesh.geometry, 'dispose'), materialDisposed: vi.spyOn(mesh.material, 'dispose')}));
    for (let i = 0; i < 50; i++) bracket.show({spotId: 'wall_1', x: i / 2, z: -i});
    group.children.forEach((mesh, i) => { expect(mesh.geometry).toBe(resources[i].geometry); expect(mesh.geometry.attributes.position.array).toBe(resources[i].positions); });
    bracket.show(null); expect(group.visible).toBe(false); bracket.show({x: NaN, z: 0}); expect(group.visible).toBe(false);
    bracket.dispose(); bracket.dispose(); bracket.show({spotId: 'late', x: 0, z: 0});
    expect(group.visible).toBe(false); expect(root.children).toEqual([]);
    for (const resource of resources) { expect(resource.geometryDisposed).toHaveBeenCalledOnce(); expect(resource.materialDisposed).toHaveBeenCalledOnce(); }
  });
});
