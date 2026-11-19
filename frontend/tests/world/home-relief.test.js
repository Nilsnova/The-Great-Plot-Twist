import * as THREE from 'three';
import {expect, it} from 'vitest';
import {createHomeRearRim} from '../../src/world/places/home-rear-rim.js';
import {createLifetime} from '../../src/world/places/resources.js';
import {surfaceClass} from '../../src/world/places/surfaces.js';
import {GROUND_PROJECTION} from '../../src/world/projection.js';

it('keeps the ridge and its surf outside walkable land and releases it with Home', () => {
  const root = new THREE.Group(), rim = createHomeRearRim(root);
  const position = rim.geometry.getAttribute('position');
  const {xScale, zShear} = GROUND_PROJECTION;
  for (let i = 0; i < position.count; i += 3) {
    const logical = [i, i + 1, i + 2].map(index => {
      // The fixed-view relief stores one tenth of logical z in the depth buffer coordinate.
      const z = position.getZ(index) * 10;
      return [(position.getX(index) - zShear * z) / xScale, z];
    });
    const expectedWater = [...logical, [0, 1].map(axis => logical.reduce((sum, point) => sum + point[axis] / 3, 0))];
    for (const [x, z] of expectedWater) expect(surfaceClass('home_islet', x, z)).toBe(0);
  }
  expect(new THREE.Raycaster().intersectObject(rim)).toEqual([]);

  const released = [];
  for (const resource of [rim.geometry, rim.material, rim.material.map]) resource.addEventListener('dispose', () => released.push(resource));
  const dispose = createLifetime(root);
  dispose(); dispose();
  expect(new Set(released).size).toBe(3);
  expect(released).toHaveLength(3);
  expect(root.children).toHaveLength(0);
});
