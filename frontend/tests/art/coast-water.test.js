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

describe('the sea outline', () => {
  // The shader's lookup: bilinear, clamped at the edge, open sea outside the backdrop; land below .02 units.
  function kept(field, uv) {
    if (uv.x < 0 || uv.y < 0 || uv.x > 1 || uv.y > 1) return true;
    const s = uv.x * 256 - .5, t = uv.y * 192 - .5, x = Math.floor(s), y = Math.floor(t), fx = s - x, fy = t - y;
    const at = (i, j) => field[Math.min(191, Math.max(0, j)) * 256 + Math.min(255, Math.max(0, i))];
    const value = (at(x, y) * (1 - fx) + at(x + 1, y) * fx) * (1 - fy) + (at(x, y + 1) * (1 - fx) + at(x + 1, y + 1) * fx) * fy;
    return value / 16 >= .02;
  }
  function covered(positions, x, y) {
    for (let i = 0; i < positions.length; i += 9) {
      const [ax, ay, , bx, by, , cx, cy] = positions.slice(i, i + 9);
      const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by), d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy), d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
      if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) return true;
    }
    return false;
  }
  it('draws every pixel the full plane kept and skips the inland cells', () => {
    const alpha = new Uint8Array(256 * 192);
    for (let y = 0; y < 192; y++) for (let x = 0; x < 256; x++) alpha[y * 256 + x] = (x - 128) ** 2 / 90 ** 2 + (y - 96) ** 2 / 70 ** 2 < 1 ? 255 : 0;
    const field = module.coastField(alpha);
    const group = new THREE.Group(); group.position.set(3, -2, 0); group.scale.set(1.1, .9, 1);
    const mesh = legacyBackdrop(new THREE.Mesh(new THREE.PlaneGeometry(64, 48), new THREE.MeshBasicMaterial()));
    group.add(mesh); group.updateMatrixWorld(true);
    const positions = module.seaOutline(field, mesh.matrixWorld).attributes.position.array, toUv = coastUvMatrix(mesh.matrixWorld);
    let inland = 0, skipped = 0;
    for (let i = 0; i < 6000; i++) {
      const x = ((i * 0.6180339887) % 1 - .5) * (i < 3000 ? 80 : 398), y = ((i * 0.7548776662) % 1 - .5) * (i < 3000 ? 60 : 298);
      const uv = new THREE.Vector3(x, y, 1).applyMatrix3(toUv);
      if (kept(field, uv)) expect(covered(positions, x, y)).toBe(true);
      else { inland++; if (!covered(positions, x, y)) skipped++; }
    }
    expect(skipped).toBeGreaterThan(inland * .7);
  });
  it('falls back to the full plane without a coast', () => {
    const before = water.mesh.geometry.attributes.position.count;
    water.setCoast(new THREE.Group());
    expect(water.mesh.geometry.attributes.position.count).toBe(before);
    expect(water.mesh.geometry.parameters).toMatchObject({width: 400, height: 300});
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
