import * as THREE from 'three';
import {expect, it} from 'vitest';
import {cliffProfile} from '../../src/art/coast-cliffs.js';
import {createHomeRelief} from '../../src/world/places/home-relief.js';
import {backdrop, createLifetime} from '../../src/world/places/resources.js';
import {surfaces} from '../../src/world/places/surfaces.js';
import {projectedCoastBounds} from '../../src/world/projection.js';

it('keeps the sandstone geometry within the original facade and releases it with Home', () => {
  const root = new THREE.Group(), shore = new THREE.Texture();
  backdrop(root, shore);
  const cliff = createHomeRelief(root, shore);
  cliff.geometry.computeBoundingBox();
  const {min, max} = cliff.geometry.boundingBox;
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
