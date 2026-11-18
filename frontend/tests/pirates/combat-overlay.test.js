// The world feedback reuses bounded geometry and disposes it. Used by CF1 renderer verification.
import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createCombatOverlay } from '../../src/pirates/combat-overlay.js';

it('projects exact range around the current player with cached resources and clears hidden feedback', () => {
  const parent = new THREE.Group(), overlay = createCombatOverlay(parent), group = parent.children[0];
  const materials = group.children.map(mesh => mesh.material);
  const geometries = new Set(group.children.map(mesh => mesh.geometry));
  const disposals = [...materials, ...geometries].map(resource => vi.spyOn(resource, 'dispose'));
  const range = { x: 3, z: 5, radius: 25, alpha: 1, mode: 'single' };
  for (let i = 0; i < 100; i++) overlay.update({ range: { ...range, x: 3 + i } });
  expect(group.children).toHaveLength(4);
  expect(group.children[1].position.x).toBe(102);
  expect(group.children[1].position.y).toBeCloseTo(-3.6);
  expect(group.children[1].position.z).toBe(0);
  expect(group.children[1].scale.toArray()).toEqual([25, 18, 1]);
  expect(group.children.map(mesh => mesh.material)).toEqual(materials);
  overlay.update({ danger: { x: 9, z: 5, critical: true }, player: { x: 3, z: 5 } });
  expect(group.children[1].visible).toBe(false);
  expect(group.children[3].visible).toBe(true);
  overlay.update(); expect(group.children.every(mesh => !mesh.visible)).toBe(true);
  overlay.dispose(); expect(parent.children).toHaveLength(0);
  expect(disposals.every(dispose => dispose.mock.calls.length === 1)).toBe(true);
});
