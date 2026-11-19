import * as THREE from 'three';
import {expect, it} from 'vitest';
import {CLIFF_DEPTH, NAVAL_APPROACH_BEARINGS, cliffProfile} from '../../src/art/coast-cliffs.js';
import {createHomeRelief} from '../../src/world/places/home-relief.js';
import {backdrop, createLifetime} from '../../src/world/places/resources.js';
import {surfaceClass, surfaces} from '../../src/world/places/surfaces.js';
import {projectedCoastBounds, unprojectGround, LEGACY_DEPTH} from '../../src/world/projection.js';

it('bounds the dry sandstone to the original facade and releases the relief with Home', () => {
  const root = new THREE.Group(), shore = new THREE.Texture();
  backdrop(root, shore);
  const cliff = createHomeRelief(root, shore);
  const {position, shoreRelief} = cliff.geometry.attributes;
  const {min, max} = new THREE.Box3();
  for (let i = 0; i < position.count; i++) {
    if (shoreRelief.getZ(i) !== 0) continue;
    expect(shoreRelief.getX(i)).toBeLessThanOrEqual(CLIFF_DEPTH + .001);
    const point = new THREE.Vector3().fromBufferAttribute(position, i);
    min.min(point);
    max.max(point);
  }
  const bounds = projectedCoastBounds(cliffProfile(surfaces.home_islet));
  expect(min.x).toBeGreaterThanOrEqual(bounds.minX - .001);
  expect(max.x).toBeLessThanOrEqual(bounds.maxX + .001);
  expect(min.y).toBeGreaterThanOrEqual(bounds.minY - .001);
  expect(max.y).toBeLessThanOrEqual(bounds.maxY + .001);
  expect(cliff.material.uniforms.uCoastArt.value).toBe(shore);
  expect(new THREE.Raycaster().intersectObject(cliff)).toEqual([]);

  const released = [];
  for (const resource of [cliff.geometry, cliff.material, shore]) resource.addEventListener('dispose', () => released.push(resource));
  const dispose = createLifetime(root);
  dispose(); dispose();
  expect(new Set(released).size).toBe(3);
  expect(released).toHaveLength(3);
  expect(root.children).toHaveLength(0);
});

it('shows a lower decorative shelf on both cliff shoulders while leaving landing arcs clear', () => {
  const cliff = createHomeRelief(new THREE.Group(), new THREE.Texture());
  const {position, shoreRelief} = cliff.geometry.attributes;
  let left = 0, right = 0;
  for (let i = 0; i < position.count; i++) {
    if (shoreRelief.getZ(i) !== 1) continue;
    const height = shoreRelief.getX(i);
    const logical = unprojectGround(position.getX(i), position.getY(i));
    const bearing = Math.atan2((logical.z - height / LEGACY_DEPTH) / surfaces.home_islet.rz,
      logical.x / surfaces.home_islet.rx) * (180 / Math.PI);
    const nearestBeach = Math.min(...NAVAL_APPROACH_BEARINGS.map(lane => Math.abs(bearing - lane)));
    expect(nearestBeach).toBeGreaterThan(18);
    expect(height).toBeLessThan(CLIFF_DEPTH + 2.2);
    if (height > CLIFF_DEPTH + 1) {
      if (logical.x < 0) left++;
      else right++;
    }
  }
  expect(left).toBeGreaterThan(6);
  expect(right).toBeGreaterThan(6);
});

it('lifts the grassy front shoulders wholly inside the original walkable top', () => {
  const cliff = createHomeRelief(new THREE.Group(), new THREE.Texture());
  const {position, shoreRelief} = cliff.geometry.attributes;
  const tallCaps = [];
  for (let i = 0; i < position.count; i++) {
    const region = shoreRelief.getZ(i);
    if (region < 2) continue;
    const ground = unprojectGround(position.getX(i), position.getY(i));
    expect(surfaceClass('home_islet', ground.x, ground.z)).toBeGreaterThan(0);
    if (region === 3 && -shoreRelief.getX(i) > 1) tallCaps.push(ground.x);
  }
  expect(tallCaps.some(x => x < 0)).toBe(true);
  expect(tallCaps.some(x => x > 0)).toBe(true);
});
