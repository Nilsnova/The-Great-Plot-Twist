import * as THREE from 'three';
import {expect, it} from 'vitest';
import {defenseDisplayAnchors} from '../../src/island/defense-display.js';
import {footprintOf, KEEP_OUT} from '../../src/island/placement.js';
import {ALL_SPOTS} from '../../src/island/spots.js';
import {WALL_LANE_ROWS} from '../../src/island/wall-lanes.js';
import {cliffProfile} from '../../src/art/coast-cliffs.js';
import {projectGround, projectedCoastBounds, unprojectGround} from '../../src/world/projection.js';
import {createHomeRelief} from '../../src/world/places/home-relief.js';
import {createHomeTerraces} from '../../src/world/places/home-terraces.js';
import {backdrop, createLifetime} from '../../src/world/places/resources.js';
import {surfaceClass, surfaces} from '../../src/world/places/surfaces.js';

const EDGE_WALLS = [
  [18, -2], [18, 0], [18, 2],
  [-3, 18], [-1, 18], [1, 18],
  [-17.5, -3], [-17.5, -1], [-17.5, 1],
].map(([x, z]) => ({x, z}));

const turn = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

function covers(point, [a, b, c]) {
  if (Math.abs(turn(a, b, c)) < 1e-6) return false;
  const edges = [turn(a, b, point), turn(b, c, point), turn(c, a, point)];
  return edges.every(value => value > -1e-6) || edges.every(value => value < 1e-6);
}

it('grounds the terrace footings in the original island and keeps defenses and wall lanes clear', () => {
  const root = new THREE.Group(), shore = new THREE.Texture();
  backdrop(root, shore);
  const terrace = createHomeTerraces(root, shore);
  const {position, terraceMaterial, surfaceDetail} = terrace.geometry.attributes;
  const triangles = [];
  let highestRear = 0, highestFront = 0, raisedCrests = 0;
  const joinedCliffs = new Set();
  const coast = projectedCoastBounds(cliffProfile(surfaces.home_islet));
  for (let i = 0; i < position.count; i += 3) {
    const points = [i, i + 1, i + 2].map(index => {
      const x = position.getX(index), y = position.getY(index);
      const baseX = terraceMaterial.getX(index), baseZ = terraceMaterial.getY(index);
      expect(surfaceClass('home_islet', baseX, baseZ)).toBeGreaterThan(0);
      const view = unprojectGround(x, y);
      const depth = y - projectGround(baseX, baseZ).y;
      if (surfaceClass('home_islet', view.x, view.z) === 0) {
        const shoreReach = surfaceDetail.getW(index);
        expect(terraceMaterial.getZ(index)).toBeGreaterThanOrEqual(0);
        if (shoreReach < 0) {
          expect(baseZ).toBeGreaterThan(0);
          expect(depth).toBeLessThanOrEqual(.05);
          expect(depth).toBeGreaterThanOrEqual(-.50);
          expect(x).toBeGreaterThanOrEqual(coast.minX);
          expect(x).toBeLessThanOrEqual(coast.maxX);
          expect(y).toBeGreaterThanOrEqual(coast.minY);
          expect(y).toBeLessThanOrEqual(coast.maxY);
          const aboveFoot = unprojectGround(x, y - shoreReach + .01);
          expect(surfaceClass('home_islet', aboveFoot.x, aboveFoot.z)).toBeGreaterThan(0);
          joinedCliffs.add(Math.sign(baseX));
        } else {
          expect(baseZ).toBeLessThan(0);
          expect(shoreReach).toBeGreaterThan(0);
          expect(shoreReach).toBeLessThanOrEqual(1.381);
          const belowCrest = unprojectGround(x, y - shoreReach - .01);
          expect(surfaceClass('home_islet', belowCrest.x, belowCrest.z)).toBeGreaterThan(0);
          raisedCrests++;
        }
      }
      if (baseZ > 0) highestFront = Math.max(highestFront, depth);
      else highestRear = Math.max(highestRear, depth);
      return {x, y};
    });
    if (terraceMaterial.getZ(i) >= 0) triangles.push(points);
  }
  expect(highestRear).toBeGreaterThan(2.45);
  expect(highestFront).toBeGreaterThan(1.42);
  expect(raisedCrests).toBeGreaterThan(0);
  expect(joinedCliffs).toEqual(new Set([-1, 1]));
  const coastalGuns = ALL_SPOTS.filter(spot => ['cannon_1', 'cannon_2', 'cannon_3', 'cannon_4'].includes(spot.id))
    .map(spot => ({...spot, kind: 'cannon'}));
  const inshore = defenseDisplayAnchors('home_islet', coastalGuns);
  expect(inshore.size).toBe(4);
  const paintedGuns = Array.from(inshore, ([id, point]) => ({id, ...point}));
  const buildFootprints = [...ALL_SPOTS, ...paintedGuns].map(({id, x, z}) => {
    const size = footprintOf(id);
    return {id, x, z, w: size, d: size};
  });
  for (const {id, x, z, w, d} of [...buildFootprints, ...KEEP_OUT]) {
    for (let column = -4; column <= 4; column++) for (let row = -4; row <= 4; row++) {
      const point = projectGround(x + column * w / 8, z + row * d / 8);
      expect(triangles.some(triangle => covers(point, triangle)), id).toBe(false);
    }
  }
  for (const {x, z} of EDGE_WALLS) {
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

it.each([
  {cove: 'west', from: -107, to: -96, minWidth: .56, maxGrade: .51},
  {cove: 'east', from: -81, to: -73, minWidth: .26, maxGrade: .87},
])('keeps a broad grass tread visible above the $cove cove', ({from, to, minWidth, maxGrade}) => {
  const root = new THREE.Group(), shore = new THREE.Texture();
  backdrop(root, shore);
  const {position, terraceMaterial, surfaceDetail} = createHomeTerraces(root, shore).geometry.attributes;
  const {rx, rz} = surfaces.home_islet;
  const sections = new Map();
  for (let i = 0; i < position.count; i++) {
    const x = terraceMaterial.getX(i), z = terraceMaterial.getY(i);
    if (z > -18 || terraceMaterial.getZ(i) !== 1) continue;
    if (surfaceDetail.getZ(i) !== 1 || surfaceDetail.getW(i) <= .05 || terraceMaterial.getW(i) < .7) continue;
    const angle = Math.round(Math.atan2(z / rz, x / rx) * 180 / Math.PI);
    if (angle < from || angle > to) continue;
    const crossSlope = surfaceDetail.getX(i);
    const section = sections.get(angle) ?? {};
    const y = position.getY(i), point = {x, z, y, height: y - projectGround(x, z).y};
    if (crossSlope < .01) section.lip = point;
    if (crossSlope > .5 && crossSlope < .89) section.tread = point;
    sections.set(angle, section);
  }
  const visible = [...sections.values()].filter(({lip, tread}) => lip && tread && tread.y - lip.y > .28);
  const broad = visible.filter(({lip, tread}) => {
    const width = Math.hypot(tread.x - lip.x, tread.z - lip.z);
    return width > minWidth && Math.abs(tread.height - lip.height) < width * maxGrade;
  });
  expect(visible.length).toBeGreaterThan(6);
  expect(broad.length).toBeGreaterThan(6);
  createLifetime(root)();
});

it('keeps two grass treads visible across the northeast sandstone shoulder', () => {
  const root = new THREE.Group(), shore = new THREE.Texture();
  backdrop(root, shore);
  const {position, terraceMaterial, surfaceDetail} = createHomeTerraces(root, shore).geometry.attributes;
  const {rx, rz} = surfaces.home_islet;
  const sections = new Map();
  for (let i = 0; i < position.count; i++) {
    const x = terraceMaterial.getX(i), z = terraceMaterial.getY(i);
    const bearing = Math.atan2(z / rz, x / rx) * 180 / Math.PI;
    // Shoulder turf has its own material value and records band height before shading.
    if (bearing < -71 || bearing > -59 || Math.abs(terraceMaterial.getZ(i) - 1.6) > .01) continue;
    const level = surfaceDetail.getY(i);
    const station = Math.round(bearing * 10);
    const section = sections.get(station) ?? {lower: [], upper: []};
    if (level > .46 && level < .50) section.lower.push(position.getY(i));
    if (level > .96 && level < .99) section.upper.push(position.getY(i));
    sections.set(station, section);
  }
  const depth = values => Math.max(...values) - Math.min(...values);
  const visible = [...sections.values()].filter(({lower, upper}) => depth(lower) > .10 && depth(upper) > .12);
  expect(visible.length).toBeGreaterThan(18);
  createLifetime(root)();
});

it('keeps edge walls on the live lanes clear of above-ground shoreline rock', () => {
  const root = new THREE.Group(), shore = new THREE.Texture();
  backdrop(root, shore);
  const {position, shoreRelief} = createHomeRelief(root, shore).geometry.attributes;
  const rocks = [];
  for (let i = 0; i < position.count; i += 3) {
    if (shoreRelief.getZ(i) <= 1.5) continue;
    rocks.push([i, i + 1, i + 2].map(index => ({x: position.getX(index), y: position.getY(index)})));
  }
  for (const {x, z} of EDGE_WALLS) {
    for (let dx = -1; dx <= 1; dx += .25) for (let dz = -1; dz <= 1; dz += .25) {
      expect(surfaceClass('home_islet', x + dx, z + dz), `${x}, ${z}`).toBeGreaterThan(0);
      const point = projectGround(x + dx, z + dz);
      expect(rocks.some(triangle => covers(point, triangle)), `${x}, ${z}`).toBe(false);
    }
  }
  createLifetime(root)();
});
