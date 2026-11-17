import {describe, expect, it} from 'vitest';
import * as THREE from 'three';
import {createCamera, villageFrame} from '../../src/player/camera.js';
import {worldViewport} from '../../src/pixel/display.js';
import {projectPoint} from '../../src/world/art.js';
import {surfaceClass} from '../../src/world/places/surfaces.js';

const player = {x: 12, z: -8};
function viewAt(width = 1280, height = 720, reduced = true) {
  const input = {pointer: {wheel: 0}}, view = createCamera(input);
  Object.assign(view.camera, worldViewport(width, height, 22, 16));
  view.camera.updateProjectionMatrix(); view.setPlace('home_islet', player); view.start(reduced);
  return {view, input};
}
const onScreen = (camera, x, z, lift = 0) => {
  camera.updateMatrixWorld(); // The real renderer updates this before every draw.
  const p = projectPoint(x, z);
  return new THREE.Vector3(p.x, p.y + lift, 0).project(camera);
};

describe('village camera overview', () => {
  it.each([[1280, 720], [375, 812]])('fits actual land cells at %s × %s without moving the captain', (width, height) => {
    const {view} = viewAt(width, height), before = {...player};
    view.setVillageView(true); view.update(.05, player);
    for (let x = -24; x <= 24; x++) for (let z = -26; z <= 26; z++) {
      if (!surfaceClass('home_islet', x, z)) continue;
      const point = onScreen(view.camera, x, z);
      expect(Math.abs(point.x)).toBeLessThan(.95);
      expect(Math.abs(point.y)).toBeLessThan(.95);
    }
    expect(onScreen(view.camera, 0, -22, 6).y).toBeLessThan(.9);
    expect(view.camera.zoom).toBeGreaterThan(0);
    expect(view.camera.zoom).toBeLessThan(1);
    expect(player).toEqual(before);
  });

  it('returns to the captain and previous exploration zoom, ignoring wheel input in fit view', () => {
    const {view, input} = viewAt();
    input.pointer.wheel = -500; view.update(.05, player); input.pointer.wheel = 0;
    const oldZoom = view.camera.zoom;
    view.setVillageView(true); input.pointer.wheel = 900; view.update(.05, player);
    expect(view.camera.position.x).toBe(0);
    input.pointer.wheel = 0; view.setVillageView(false); view.update(.05, player);
    expect(view.camera.position.x).toBe(projectPoint(player.x, player.z).x);
    expect(view.camera.zoom).toBe(oldZoom);
  });

  it('keeps combat and guided-tour camera requests in control', () => {
    const {view} = viewAt(); view.setVillageView(true);
    view.camera.userData.battleZoom = .7; view.update(.05, player);
    expect(view.camera.zoom).toBe(.7);
    expect(view.camera.position.x).toBe(player.x);
    delete view.camera.userData.battleZoom;
    view.camera.userData.tour = {x: -7, z: 4}; view.update(.05, player);
    expect(view.camera.position.x).toBe(-7);
    expect(view.camera.userData.tour).toEqual({x: -7, z: 4});
    delete view.camera.userData.tour; view.update(.05, player);
    expect(view.camera.position.x).toBe(0);
  });

  it('recalculates fit after resize and resets overview on travel', () => {
    const {view} = viewAt(); view.setVillageView(true); view.update(.05, player);
    const wide = view.camera.zoom;
    Object.assign(view.camera, worldViewport(375, 812, 22, 16)); view.camera.updateProjectionMatrix(); view.update(.05, player);
    expect(view.camera.zoom).toBeLessThan(wide);
    view.setPlace('saltreach_harbor', player); view.update(.05, player);
    expect(view.camera.zoom).toBe(1);
    expect(view.camera.position.x).toBe(player.x);
    view.setVillageView(true); view.update(.05, player);
    expect(view.camera.position.x).toBe(player.x);
  });

  it('eases normally, snaps for reduced motion and leaves invalid or paused updates alone', () => {
    const {view} = viewAt(1280, 720, false); view.setVillageView(true);
    const start = view.camera.position.x; view.update(.05, player);
    expect(view.camera.position.x).toBeGreaterThan(0); expect(view.camera.position.x).toBeLessThan(start);
    for (let i = 0; i < 60; i++) view.update(.1, player);
    expect(view.camera.position.x).toBeCloseTo(0, 5);
    const position = view.camera.position.clone(); view.update(NaN, player); view.pause(); view.update(.1, player);
    expect(view.camera.position).toEqual(position);
    expect(villageFrame({left: 0, right: NaN, top: 1, bottom: -1}, 'home_islet')).toBeNull();
    expect(villageFrame(view.camera, 'unknown')).toBeNull();
  });
});
