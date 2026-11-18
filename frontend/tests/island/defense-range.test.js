import {expect, it, vi} from 'vitest';
import * as THREE from 'three';
import {makeDefenseRange} from '../../src/island/defense-range.js';
import {projectGround, unprojectGround} from '../../src/world/projection.js';
import {browserHarness} from '../g20-browser.js';

const browser = browserHarness();

it('maps the two real X/Z acquisition radii through the island projection', () => {
  const root = new THREE.Group(), display = makeDefenseRange(root), mesh = root.children[0];
  const range = {id: 'cannon_1', x: 4, z: -8, range: 34, minRange: 6};
  display.show(range);
  expect(display.shown).toBe(true);
  expect(mesh.userData.spotId).toBe(range.id);
  const centre = projectGround(range.x, range.z);
  expect(mesh.position.toArray()).toEqual([centre.x, centre.y, 0]);
  expect(mesh.scale.toArray()).toEqual([34, 34, 1]);
  expect(mesh.material.uniforms.inner.value).toBeCloseTo(6 / 34);
  expect(mesh.renderOrder).toBeLessThan(20);
  const positions = mesh.geometry.attributes.position, uvs = mesh.geometry.attributes.uv;
  for (let i = 0; i < positions.count; i++) {
    const logical = unprojectGround(centre.x + positions.getX(i) * range.range, centre.y + positions.getY(i) * range.range);
    expect(logical.x).toBeCloseTo(range.x + (uvs.getX(i) * 2 - 1) * range.range);
    expect(logical.z).toBeCloseTo(range.z - (uvs.getY(i) * 2 - 1) * range.range);
  }
  const hits = [];
  mesh.raycast(new THREE.Raycaster(), hits);
  expect(hits).toEqual([]);
  display.dispose();
});

it('reuses one mesh, hides an unreachable annulus and disposes its two resources once', () => {
  const root = new THREE.Group(), display = makeDefenseRange(root), mesh = root.children[0];
  const {geometry, material} = mesh, freeGeometry = vi.spyOn(geometry, 'dispose'), freeMaterial = vi.spyOn(material, 'dispose');
  for (let i = 0; i < 50; i++) {
    display.show({id: 'mortar_1', x: i, z: -i, range: 30 + i, minRange: 8});
    expect(display.shown).toBe(true);
  }
  expect(root.children).toEqual([mesh]);
  expect(mesh.geometry).toBe(geometry);
  expect(mesh.material).toBe(material);
  display.show({id: 'mortar_1', x: 2, z: 4, range: 8, minRange: 8});
  expect(display.shown).toBe(false);
  display.show({id: 'tower_2', x: Infinity, z: 4, range: 24, minRange: 0});
  expect(display.shown).toBe(false);
  display.show(null);
  expect(mesh.userData.spotId).toBeNull();
  display.dispose();
  display.dispose();
  display.show({id: 'tower_2', x: 2, z: 4, range: 24, minRange: 0});
  expect(display.shown).toBe(false);
  expect(root.children).toEqual([]);
  expect(freeGeometry).toHaveBeenCalledOnce();
  expect(freeMaterial).toHaveBeenCalledOnce();
});

it('draws a real projected band in Chrome and leaves the minimum-range hole clear', async () => {
  const samples = await browser(async () => {
    const THREE = await window.g20Import('/node_modules/three/build/three.module.js');
    const {makeDefenseRange} = await window.g20Import('/src/island/defense-range.js');
    const {projectGround} = await window.g20Import('/src/world/projection.js');
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-10, 10, 10, -10, .1, 10);
    camera.position.z = 1;
    const renderer = new THREE.WebGLRenderer({preserveDrawingBuffer: true});
    const size = 256;
    renderer.setSize(size, size);
    renderer.setClearColor(0x263847);
    const display = makeDefenseRange(scene);
    display.show({id: 'mortar', x: 0, z: 0, range: 6, minRange: 2});
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const read = (x, z) => {
      const {x: px, y: py} = projectGround(x, z), pixel = new Uint8Array(4);
      gl.readPixels(Math.floor((px + 10) * size / 20), Math.floor((py + 10) * size / 20), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      return [...pixel];
    };
    const results = {hole: read(1, 0), inner: read(2.15, 0), across: read(3, 0), deep: read(0, 3), outside: read(7, 0)};
    display.dispose(); renderer.dispose();
    return results;
  });
  expect(samples.hole).toEqual(samples.outside);
  expect(samples.across).toEqual(samples.deep);
  expect(samples.across).not.toEqual(samples.hole);
  expect(samples.inner[1]).toBeGreaterThan(samples.across[1]);
});
