import * as THREE from 'three';
import {expect, it} from 'vitest';
import {createHomePortrait, portraitIslandFrame} from '../../src/player/home-portrait.js';

const phone = {width: 375, height: 812, top: 80, bottom: 142};
const makeCamera = () => {
  const camera = new THREE.OrthographicCamera(-8, 8, 17.3, -17.3, .1, 200);
  camera.position.z = 100;
  camera.zoom = .285;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return camera;
};

it('frames more vertical ground in portrait and keeps screen-to-world reversible after resize', () => {
  const camera = makeCamera(), portrait = createHomePortrait(camera);
  const ground = new THREE.Vector3(3, -5, 0), before = ground.clone().project(camera);
  expect(portraitIslandFrame(camera, {...phone, width: 1280})).toBeNull();
  expect(portraitIslandFrame(camera, {...phone, bottom: 780})).toBeNull();
  portrait.update(phone);
  expect(camera.userData.homePortraitDepth).toBeGreaterThan(2);
  const after = ground.clone().project(camera);
  expect(after.x).toBeCloseTo(before.x * (375 - 10) / 375, 12);
  expect(after.y).not.toBeCloseTo(before.y, 2);
  camera.updateProjectionMatrix();
  expect(ground.clone().project(camera).distanceTo(after)).toBeLessThan(1e-10);
  expect(after.clone().unproject(camera).distanceTo(ground)).toBeLessThan(1e-10);
  portrait.update(null);
  expect(ground.clone().project(camera).distanceTo(before)).toBeLessThan(1e-10);
});

it('keeps upright proportions and restores the world transforms after drawing', () => {
  const camera = makeCamera(), portrait = createHomePortrait(camera);
  const scene = new THREE.Scene(), tree = new THREE.Mesh(), floor = new THREE.Mesh();
  tree.userData.ground = {x: 0, z: 0}; tree.scale.y = .7;
  scene.add(tree, floor);
  portrait.update(phone);
  const factor = camera.userData.homePortraitDepth;
  expect(() => portrait.draw(scene, () => {
    expect(tree.scale.y * factor).toBeCloseTo(.7, 12);
    expect(floor.scale.y).toBe(1);
    throw new Error('frame stopped');
  })).toThrow('frame stopped');
  expect(tree.scale.y).toBe(.7);
  expect(tree.matrix.elements[5]).toBe(.7);
});

it('enlarges structure artwork and its label around the same ground foot only during portrait Fit', () => {
  const camera = makeCamera(), portrait = createHomePortrait(camera);
  const scene = new THREE.Scene(), building = new THREE.Mesh(), label = new THREE.Mesh();
  building.userData = {ground: {x: 0, z: 0}, portraitStructure: true};
  label.userData = {ground: {x: 0, z: 0}, portraitLabelAnchor: {x: 2, y: -3}};
  building.position.set(2, -3, 0);
  label.position.set(2.5, 1, 0);
  scene.add(building, label);
  portrait.update(phone);
  const factor = camera.userData.homePortraitDepth;
  portrait.draw(scene, () => {
    expect(building.position.toArray()).toEqual([2, -3, 0]);
    expect(building.scale.x).toBeCloseTo(1.26);
    expect(building.scale.y * factor).toBeCloseTo(1.26);
    expect(label.position.x).toBeCloseTo(2 + .5 * 1.26);
    expect((label.position.y + 3) * factor).toBeCloseTo(4 * 1.26);
  });
  expect(building.scale.toArray()).toEqual([1, 1, 1]);
  expect(label.position.toArray()).toEqual([2.5, 1, 0]);
  portrait.update(null);
  portrait.draw(scene, () => expect(building.scale.toArray()).toEqual([1, 1, 1]));
});
