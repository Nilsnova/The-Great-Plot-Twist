import * as THREE from 'three';
import {expect, it} from 'vitest';
import {CLIFF_DEPTH, NAVAL_APPROACH_BEARINGS, cliffProfile} from '../../src/art/coast-cliffs.js';
import {createHomeRelief} from '../../src/world/places/home-relief.js';
import {createHomeTerraces} from '../../src/world/places/home-terraces.js';
import {backdrop, createLifetime} from '../../src/world/places/resources.js';
import {surfaceClass, surfaces} from '../../src/world/places/surfaces.js';
import {projectGround, projectedCoastBounds, unprojectGround, LEGACY_DEPTH} from '../../src/world/projection.js';

it('bounds the dry sandstone to the original facade and releases the relief with Home', () => {
  const root = new THREE.Group(), shore = new THREE.Texture();
  backdrop(root, shore);
  const cliff = createHomeRelief(root, shore);
  const {position, shoreRelief} = cliff.geometry.attributes;
  const {min, max} = new THREE.Box3();
  for (let i = 0; i < position.count; i++) {
    if (shoreRelief.getZ(i) >= 1) continue;
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
    if (region < 2 || region > 3) continue;
    const ground = unprojectGround(position.getX(i), position.getY(i));
    expect(surfaceClass('home_islet', ground.x, ground.z)).toBeGreaterThan(0);
    if (region === 3 && -shoreRelief.getX(i) > 1) tallCaps.push(ground.x);
  }
  expect(tallCaps.some(x => x < 0)).toBe(true);
  expect(tallCaps.some(x => x > 0)).toBe(true);
});

it('roots the raised rear headlands and both flank shelves on existing dry ground', () => {
  const root = new THREE.Group(), art = new THREE.Texture();
  const cliff = createHomeRelief(root, art);
  const {position, shoreRelief} = cliff.geometry.attributes;
  const {rx, rz} = surfaces.home_islet;
  const sampleAt = (x, z) => 180 + Math.atan2(z / rz, x / rx) * 90 / Math.PI;
  const sides = [-1, 1];
  const footings = new Set(), crowns = new Set(), flankCrowns = new Set();
  const raisedArcs = [[100.5, 109.6], [119.4, 127.4], [146.0, 152.8], [162.5, 170.3]];
  for (let i = 0; i < position.count; i++) {
    const region = shoreRelief.getZ(i);
    if (region < 4 || region > 5) continue;
    const height = -shoreRelief.getX(i);
    const ground = unprojectGround(position.getX(i), position.getY(i) - height);
    const sample = sampleAt(ground.x, ground.z);
    expect(ground.z).toBeLessThan(0);
    expect(raisedArcs.some(([from, to]) => sample > from && sample < to)).toBe(true);
    expect(surfaceClass('home_islet', ground.x, ground.z)).toBeGreaterThan(0);
    if (height === 0) footings.add(Math.sign(ground.x));
    if (height > 1.4 && region === 5) {
      if (sample < 112 || sample > 158) flankCrowns.add(Math.sign(ground.x));
      else crowns.add(Math.sign(ground.x));
    }
  }

  // The continuous eastern ledge carries the headland's turf above the rock heel.
  const {position: terracePosition, terraceMaterial} = createHomeTerraces(root, art).geometry.attributes;
  for (let i = 0; i < terracePosition.count; i++) {
    const material = terraceMaterial.getZ(i);
    if (material < 1 || material >= 4 || terraceMaterial.getW(i) < .95) continue;
    const x = terraceMaterial.getX(i), z = terraceMaterial.getY(i);
    const sample = sampleAt(x, z);
    if (sample <= 145.8 || sample >= 152.6) continue;
    const height = terracePosition.getY(i) - projectGround(x, z).y;
    if (height <= 1.4) continue;
    expect(surfaceClass('home_islet', x, z)).toBeGreaterThan(0);
    crowns.add(Math.sign(x));
  }
  expect([...footings].sort()).toEqual(sides);
  expect([...crowns].sort()).toEqual(sides);
  expect([...flankCrowns].sort()).toEqual(sides);
});

it('keeps the tidal rock groups and their wash in the existing Fit envelope', () => {
  const cliff = createHomeRelief(new THREE.Group(), new THREE.Texture());
  const {position, shoreRelief} = cliff.geometry.attributes;
  const bounds = projectedCoastBounds(cliffProfile(surfaces.home_islet));
  const shoreQuadrants = new Set();
  const sillSides = new Set();
  const {rx, rz} = surfaces.home_islet;
  for (let i = 0; i < position.count; i++) {
    const region = shoreRelief.getZ(i);
    if (region < 6) continue;
    const x = position.getX(i), y = position.getY(i);
    expect(x).toBeGreaterThanOrEqual(bounds.minX - .001);
    expect(x).toBeLessThanOrEqual(bounds.maxX + .001);
    expect(y).toBeGreaterThanOrEqual(bounds.minY - .001);
    expect(y).toBeLessThanOrEqual(bounds.maxY + .001);
    if (region === 6 && shoreRelief.getY(i) > .8) {
      shoreQuadrants.add((x > 0 ? 1 : 0) + (y > 0 ? 2 : 0));
    }
    if (region === 7) {
      const ground = unprojectGround(x, y);
      const bearing = Math.atan2(ground.z / rz, ground.x / rx) * (180 / Math.PI);
      expect(surfaceClass('home_islet', ground.x, ground.z)).toBe(0);
      expect(Math.min(...NAVAL_APPROACH_BEARINGS.map(lane => Math.abs(bearing - lane)))).toBeGreaterThan(18);
      if (shoreRelief.getY(i) > .8) sillSides.add(Math.sign(x));
    }
  }
  expect(shoreQuadrants).toEqual(new Set([0, 1, 2, 3]));
  expect(sillSides).toEqual(new Set([-1, 1]));
});
