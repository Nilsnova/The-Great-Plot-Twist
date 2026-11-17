import * as THREE from 'three';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {legacyBackdrop, coastUvMatrix} from '../../src/world/ground-transform.js';

let module, scene, water;
beforeEach(async () => {
  vi.resetModules();
  module = await import('../../src/world/water.js');
  scene = new THREE.Scene(); water = module.createWater(scene);
});
afterEach(() => {water?.dispose(); vi.unstubAllGlobals();});

function maskReader(alphaAt) {
  let image;
  const context = {drawImage: value => {image = value;}, getImageData: () => {
    if (image.unreadable) throw new Error('unreadable backdrop');
    const data = new Uint8ClampedArray(256 * 192 * 4);
    for (let y = 0; y < 192; y++) for (let x = 0; x < 256; x++) data[(y * 256 + x) * 4 + 3] = alphaAt(image, x, y);
    return {data};
  }};
  vi.stubGlobal('document', {createElement: () => ({getContext: () => context})});
}
function backdrop(image, x = 0, y = 0) {
  const group = new THREE.Group(), mesh = new THREE.Mesh(new THREE.PlaneGeometry(64, 48), new THREE.MeshBasicMaterial());
  mesh.material.map = {image: {width: 1024, height: 768, ...image}}; mesh.position.set(x, y, 0); group.add(mesh);
  return group;
}

describe('the real decorative coast field', () => {
  it('binds the cold manual affine backdrop before the first render or forced matrix update', () => {
    maskReader((image, x, y) => x < 20 && y < 20 ? 255 : 0);
    const group = new THREE.Group(); group.position.set(13, -7, 0); group.scale.set(1.2, .8, 1);
    const mesh = legacyBackdrop(new THREE.Mesh(new THREE.PlaneGeometry(64, 48), new THREE.MeshBasicMaterial()));
    mesh.material.map = {image: {width: 1024, height: 768}}; group.add(mesh);
    // No renderer or updateMatrixWorld(true): this is the actual first setCoast ordering.
    water.setCoast(group);
    const expected = group.matrix.clone().multiply(mesh.matrix);
    expect(mesh.matrixWorld.elements).toEqual(expected.elements);
    expect(module.seaUniforms.uCoastUv.value.elements).toEqual(coastUvMatrix(expected).elements);
    for (const [x, y] of [[0, 16], [-20, -14], [7, -10]]) {
      const point = new THREE.Vector3(x, y, 0).applyMatrix4(expected); point.z = 1;
      point.applyMatrix3(module.seaUniforms.uCoastUv.value);
      expect(point.x).toBeCloseTo(x / 64 + .5, 10); expect(point.y).toBeCloseTo(y / 48 + .5, 10);
    }
    expect(module.seaUniforms.uCoastOn.value).toBe(1);
  });
  it('keeps water clear, land zero-distance, native-distance scale and image-row orientation', () => {
    expect([...module.coastField(new Uint8Array(9), 3, 3)]).toEqual(Array(9).fill(255));
    expect([...module.coastField(new Uint8Array(9).fill(255), 3, 3)]).toEqual(Array(9).fill(0));
    const corner = new Uint8Array(9); corner[0] = 255;
    const field = module.coastField(corner, 3, 3);
    expect(field[6]).toBe(0); expect(field[7]).toBe(4); expect(field[0]).toBe(8); expect(field[2]).toBe(11);
  });
  it('refreshes another place, maps its translated ground and clears stale coast on failure', () => {
    maskReader((image, x, y) => image.land && x < 20 && y < 20 ? 255 : 0);
    const first = backdrop({land: true}, 5, -3); first.position.set(12, 7, 0);
    water.setCoast(first);
    expect(module.seaUniforms.uCoastOn.value).toBe(1);
    expect(module.seaUniforms.uCoastRect.value.toArray()).toEqual([-15, -20, 64, 48]);
    expect(module.seaUniforms.uCoast.value.image.data.some(value => value === 0)).toBe(true);
    water.setCoast(backdrop({land: false}, -8, 2));
    expect(module.seaUniforms.uCoast.value.image.data.every(value => value === 255)).toBe(true);
    expect(module.seaUniforms.uCoastRect.value.toArray()).toEqual([-40, -22, 64, 48]);
    water.setCoast(backdrop({unreadable: true}));
    expect(module.seaUniforms.uCoastOn.value).toBe(0);
    expect(module.seaUniforms.uCoast.value.image.data.every(value => value === 255)).toBe(true);
    water.setCoast(first); water.setCoast(new THREE.Group());
    expect(module.seaUniforms.uCoastOn.value).toBe(0);
    expect(module.seaUniforms.uCoast.value.image.data.every(value => value === 255)).toBe(true);
  });
});

describe('sea ownership and existing effect controls', () => {
  it('shares weather/coast/quality/time references with the existing lighthouse beam', async () => {
    const {createBeam} = await import('../../src/world/beam.js');
    const beam = createBeam(scene, 2, 3), uniforms = water.mesh.material.uniforms;
    for (const name of ['uSeaTime', 'uWind', 'uRain', 'uDetail', 'uCoast', 'uCoastOn', 'uCoastRect', 'uCoastUv']) {
      expect(uniforms[name]).toBe(module.seaUniforms[name]);
      expect(beam.mesh.material.uniforms[name]).toBe(module.seaUniforms[name]);
    }
    water.setQuality('low'); expect(uniforms.uDetail.value).toBe(0);
    water.update(10, {wind: .8, rain: .4});
    expect(beam.mesh.material.uniforms.uWind.value).toBe(.8); expect(beam.mesh.material.uniforms.uRain.value).toBe(.4);
    water.setQuality('high'); expect(beam.mesh.material.uniforms.uDetail.value).toBe(1);
    beam.mesh.geometry.dispose(); beam.mesh.material.dispose(); beam.mesh.removeFromParent();
  });
  it('retains the boss pace and repeated reduced-motion time-zero behavior', () => {
    water.update(100, {}); water.update(104, {}); expect(module.seaUniforms.uSeaTime.value).toBe(104);
    module.setSeaPace(.25); water.update(108, {}); expect(module.seaUniforms.uSeaTime.value).toBe(105);
    module.setSeaPace(0); water.update(112, {}); expect(module.seaUniforms.uSeaTime.value).toBe(105);
    water.update(0, {}); water.update(0, {}); expect(module.seaUniforms.uSeaTime.value).toBe(0);
    module.setSeaPace(NaN); water.update(4, {}); expect(module.seaUniforms.uSeaTime.value).toBe(4);
  });
  it('owns one water mesh/material and releases those without destroying shared coast state', () => {
    const geometry = vi.fn(), material = vi.fn(), coast = vi.fn();
    water.mesh.geometry.addEventListener('dispose', geometry);
    water.mesh.material.addEventListener('dispose', material);
    module.seaUniforms.uCoast.value.addEventListener('dispose', coast);
    expect(scene.children).toEqual([water.mesh]);
    water.dispose(); water = null;
    expect(scene.children).toHaveLength(0);
    expect(geometry).toHaveBeenCalledOnce(); expect(material).toHaveBeenCalledOnce(); expect(coast).not.toHaveBeenCalled();
  });
});
