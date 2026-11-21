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

it('uses tall portrait room for more depth and still yields to the selection dock', () => {
  const camera = makeCamera();
  const fit = portraitIslandFrame(camera, phone);
  const selected = portraitIslandFrame(camera, {...phone, bottom: 250});
  expect(1 / fit.height).toBeCloseTo(2.55);
  expect(selected.height).toBeGreaterThan(fit.height);
  expect(selected.width).toBe(fit.width);
});

it('fits a short portrait viewport with the same coverage and depth safeguards', () => {
  const camera = makeCamera();
  const compact = {width: 390, height: 530, top: 80, bottom: 164};
  camera.top = 8 * compact.height / compact.width;
  camera.bottom = -camera.top;
  const fit = portraitIslandFrame(camera, compact);
  expect(fit.width).toBeGreaterThan(1);
  expect(fit.height).toBeLessThan(1);
  expect(portraitIslandFrame(camera, {...compact, bottom: 270})).toBeNull();
  expect(portraitIslandFrame(camera, {...compact, width: 844, height: 390})).toBeNull();
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
