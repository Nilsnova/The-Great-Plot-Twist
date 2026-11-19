import * as THREE from 'three';
import {expect, it} from 'vitest';
import {defenseDisplayAnchors} from '../../src/island/defense-display.js';
import {footprintOf} from '../../src/island/placement.js';
import {ALL_SPOTS} from '../../src/island/spots.js';
import {WALL_LANE_ROWS} from '../../src/island/wall-lanes.js';
import {WALL_PERIMETER_CELLS} from '../../src/island/wall-perimeter.js';
import {projectGround, unprojectGround} from '../../src/world/projection.js';
import {createHomeRelief} from '../../src/world/places/home-relief.js';
import {createHomeTerraces} from '../../src/world/places/home-terraces.js';
import {backdrop, createLifetime} from '../../src/world/places/resources.js';
import {surfaceClass} from '../../src/world/places/surfaces.js';

const turn = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

function covers(point, [a, b, c]) {
  if (Math.abs(turn(a, b, c)) < 1e-6) return false;
  const edges = [turn(a, b, point), turn(b, c, point), turn(c, a, point)];
  return edges.every(value => value > -1e-6) || edges.every(value => value < 1e-6);
}

it('raises terraces without overlapping the shore, old defenses or any new wall footprint', () => {
  const root = new THREE.Group(), shore = new THREE.Texture();
  backdrop(root, shore);
  const terrace = createHomeTerraces(root, shore);
  const {position, terraceMaterial} = terrace.geometry.attributes;
  const triangles = [];
  let highestRear = 0, highestFront = 0;
  for (let i = 0; i < position.count; i += 3) {
    const points = [i, i + 1, i + 2].map(index => {
      const x = position.getX(index), y = position.getY(index);
      const ground = unprojectGround(x, y);
      expect(surfaceClass('home_islet', ground.x, ground.z)).toBeGreaterThan(0);
      const baseZ = terraceMaterial.getY(index);
      const depth = y - projectGround(terraceMaterial.getX(index), baseZ).y;
      if (baseZ > 0) highestFront = Math.max(highestFront, depth);
      else highestRear = Math.max(highestRear, depth);
      return {x, y};
    });
    if (terraceMaterial.getZ(i) >= 0) triangles.push(points);
  }
  expect(highestRear).toBeGreaterThan(2.45);
  expect(highestFront).toBeGreaterThan(1.42);
  const coastalGuns = ALL_SPOTS.filter(spot => ['cannon_1', 'cannon_2', 'cannon_3', 'cannon_4'].includes(spot.id))
    .map(spot => ({...spot, kind: 'cannon'}));
  const inshore = defenseDisplayAnchors('home_islet', coastalGuns);
  expect(inshore.size).toBe(4);
  const paintedGuns = Array.from(inshore, ([id, point]) => ({id, ...point}));
  for (const {id, x, z} of [...ALL_SPOTS, ...paintedGuns]) {
    const quarter = footprintOf(id) / 8;
    for (let column = -4; column <= 4; column++) for (let row = -4; row <= 4; row++) {
      const point = projectGround(x + column * quarter, z + row * quarter);
      expect(triangles.some(triangle => covers(point, triangle)), id).toBe(false);
    }
  }
  for (const {x, z} of WALL_PERIMETER_CELLS) {
    for (let dx = -1; dx <= 1; dx += .25) for (let dz = -1; dz <= 1; dz += .25) {
      const point = projectGround(x + dx, z + dz);
      expect(triangles.some(triangle => covers(point, triangle)), `${x}, ${z}`).toBe(false);
    }
  }
  for (const [z, ...ranges] of WALL_LANE_ROWS) {
    for (let i = 0; i < ranges.length; i += 2) {
      for (let x = ranges[i]; x <= ranges[i + 1]; x += .5) {
        const point = projectGround(x, z);
        expect(triangles.some(triangle => covers(point, triangle)), `${x}, ${z}`).toBe(false);
      }
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

it('keeps the complete wall perimeter clear of above-ground shoreline rock', () => {
  const root = new THREE.Group(), shore = new THREE.Texture();
  backdrop(root, shore);
  const {position, shoreRelief} = createHomeRelief(root, shore).geometry.attributes;
  const rocks = [];
  for (let i = 0; i < position.count; i += 3) {
    if (shoreRelief.getZ(i) <= 1.5) continue;
    rocks.push([i, i + 1, i + 2].map(index => ({x: position.getX(index), y: position.getY(index)})));
  }
  for (const {x, z} of WALL_PERIMETER_CELLS) {
    for (let dx = -1; dx <= 1; dx += .25) for (let dz = -1; dz <= 1; dz += .25) {
      expect(surfaceClass('home_islet', x + dx, z + dz), `${x}, ${z}`).toBeGreaterThan(0);
      const point = projectGround(x + dx, z + dz);
      expect(rocks.some(triangle => covers(point, triangle)), `${x}, ${z}`).toBe(false);
    }
  }
  createLifetime(root)();
});
