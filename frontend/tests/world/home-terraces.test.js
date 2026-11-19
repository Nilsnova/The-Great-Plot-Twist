import * as THREE from 'three';
import {expect, it} from 'vitest';
import {footprintOf} from '../../src/island/placement.js';
import {ALL_SPOTS} from '../../src/island/spots.js';
import {projectGround, unprojectGround} from '../../src/world/projection.js';
import {createHomeTerraces} from '../../src/world/places/home-terraces.js';
import {backdrop, createLifetime} from '../../src/world/places/resources.js';
import {surfaceClass} from '../../src/world/places/surfaces.js';

const turn = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

function covers(point, [a, b, c]) {
  if (Math.abs(turn(a, b, c)) < 1e-6) return false;
  const edges = [turn(a, b, point), turn(b, c, point), turn(c, a, point)];
  return edges.every(value => value > -1e-6) || edges.every(value => value < 1e-6);
}

it('keeps the projected terraces behind the land boundary and outside the existing defense footprints', () => {
  const root = new THREE.Group(), shore = new THREE.Texture();
  backdrop(root, shore);
  const terrace = createHomeTerraces(root, shore);
  const {position, terraceMaterial} = terrace.geometry.attributes;
  const triangles = [];
  let highest = 0;
  for (let i = 0; i < position.count; i += 3) {
    const points = [i, i + 1, i + 2].map(index => {
      const x = position.getX(index), y = position.getY(index);
      const ground = unprojectGround(x, y);
      expect(surfaceClass('home_islet', ground.x, ground.z)).toBeGreaterThan(0);
      const at = projectGround(terraceMaterial.getX(index), terraceMaterial.getY(index));
      highest = Math.max(highest, y - at.y);
      return {x, y};
    });
    if (terraceMaterial.getZ(i) >= 0) triangles.push(points);
  }
  expect(highest).toBeGreaterThan(1.25);
  for (const {id, x, z} of ALL_SPOTS) {
    const quarter = footprintOf(id) / 8;
    for (let column = -4; column <= 4; column++) for (let row = -4; row <= 4; row++) {
      const point = projectGround(x + column * quarter, z + row * quarter);
      expect(triangles.some(triangle => covers(point, triangle)), id).toBe(false);
    }
  }
  expect(terrace.material.uniforms.uCoastArt.value).toBe(shore);
  expect(new THREE.Raycaster().intersectObject(terrace)).toEqual([]);
  const released = [];
  for (const resource of [terrace.geometry, terrace.material, shore]) resource.addEventListener('dispose', () => released.push(resource));
  const dispose = createLifetime(root);
  dispose(); dispose();
  expect(new Set(released).size).toBe(3);
  expect(released).toHaveLength(3);
});
