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

it('uses sparse arcs with real gaps and keeps their outer boundary at the weapon radius', () => {
  const parent = new THREE.Group(), overlay = createCombatOverlay(parent);
  const positions = parent.children[0].children[1].geometry.getAttribute('position');
  const vertices = Array.from({ length: positions.count }, (_, index) => ({ x: positions.getX(index), y: positions.getY(index) }));
  expect(vertices.every(point => Math.hypot(point.x, point.y) <= 1.000001)).toBe(true);
  expect(Math.max(...vertices.map(point => Math.hypot(point.x, point.y)))).toBeCloseTo(1, 6);
  const hasDirection = angle => vertices.some(point => Math.abs(Math.atan2(point.y, point.x) - angle) < .005);
  expect(hasDirection(0)).toBe(true);
  expect(hasDirection(Math.PI / 12)).toBe(false); // a real angular gap halfway between two short arcs
  overlay.dispose();
});

it('places the direction cap at true range in logical coordinates before flattening the world', () => {
  const parent = new THREE.Group(), overlay = createCombatOverlay(parent), marker = parent.children[0].children[2];
  const range = { x: 3, z: 5, radius: 14, alpha: 1, mode: 'single' };
  const sample = new THREE.Vector3(1, 0, 0);
  for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1]]) {
    overlay.update({ range: { ...range, point: { x: range.x + dx * 80, z: range.z + dz * 80 } } });
    const point = sample.clone().applyMatrix4(marker.matrix), length = Math.hypot(dx, dz);
    expect(marker.visible).toBe(true);
    expect(point.x).toBeCloseTo(range.x + range.radius * dx / length);
    expect(point.y).toBeCloseTo(-(range.z + range.radius * dz / length) * .72);
  }
  overlay.update({ range }); expect(marker.visible).toBe(false);
  overlay.update({ range: { ...range, point: { x: range.x, z: range.z } } }); expect(marker.visible).toBe(false);
  overlay.update({ range: { ...range, melee: true, point: { x: 80, z: 5 } } }); expect(marker.visible).toBe(false);
  overlay.dispose();
});
