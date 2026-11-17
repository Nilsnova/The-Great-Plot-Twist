// Real compiled registration/consumers; only image decoding and Canvas drawing are controlled in Node.
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import * as THREE from 'three';
const state = vi.hoisted(() => ({decode: vi.fn(), images: []}));
vi.mock('../../src/art/village-decode.js', () => ({decodeRasterSheet: (...args) => state.decode(...args)}));
vi.mock('../../src/world/texture.js', () => ({loadTexture: vi.fn()}));
import * as approved from '../../src/art/village/baked.js';
import {collectRasterFrames, getRasterFrame, rasterFrameSizes} from '../../src/art/village-raster.js';
import {artSizes, loadArt} from '../../src/world/art.js';
import {cartoonAtlas} from '../../src/art/textures.js';
import {loadTexture} from '../../src/world/texture.js';
const release = art => Object.values(art).forEach(material => { material.map.dispose(); material.dispose(); });
beforeEach(() => {
  state.images = []; state.decode.mockReset().mockImplementation(async sheet => {
    const image = {width: sheet.width, height: sheet.height, close: vi.fn()}; state.images.push(image); return image;
  });
  vi.stubGlobal('document', {createElement: () => {
    const canvas = {draws: []}; canvas.getContext = () => ({setTransform() {}, drawImage: (...args) => canvas.draws.push(args)}); return canvas;
  }});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks(); });

it('binds exactly the approved compiled IDs and native/logical feet to the active provider', () => {
  const expected = collectRasterFrames([approved]);
  expect(Object.keys(rasterFrameSizes()).sort()).toEqual(Object.keys(approved.frames).sort());
  for (const [id, frame] of Object.entries(expected)) {
    expect(getRasterFrame(id), id).toEqual(frame);
    const [width, height, anchor] = frame.logical;
    expect(artSizes[id], id).toEqual([width / 16, height / 16, anchor / height]);
  }
  for (const id of ['oak', 'island_core', 'island-wall-l1-damaged']) expect(getRasterFrame(id), id).toBeTruthy();
  expect(getRasterFrame('no-such-approved-raster')).toBeNull(); expect(state.decode).not.toHaveBeenCalled();
});

it('prepares registered nature/core/wall frames eagerly while leaving a procedural actor unpainted', async () => {
  const ids = ['oak', 'island_core', 'island-wall-l1-damaged'], art = await loadArt(['explorer', ...ids], {density: 2});
  expect('explorer' in art).toBe(true); expect(Object.keys(art).sort()).toEqual([...ids].sort());
  expect(loadTexture).not.toHaveBeenCalled(); expect(state.decode).toHaveBeenCalledTimes(3);
  for (const id of ids) {
    const frame = getRasterFrame(id), canvas = art[id].map.image;
    expect(state.decode.mock.calls.some(([sheet]) => sheet.file === frame.sheet.file && sheet.width === frame.sheet.width && sheet.height === frame.sheet.height)).toBe(true);
    expect(art[id].map.userData.villageArt).toEqual({id, file: frame.sheet.file, logical: frame.logical, source: 'png'});
    expect([canvas.width, canvas.height]).toEqual(frame.logical.slice(0, 2).map(value => value * 2));
    expect(canvas.draws[0].slice(1, 5)).toEqual(frame.rect);
  }
  expect(state.images.every(image => image.close.mock.calls.length === 1)).toBe(true); release(art);
});

it('rejects registered failure without fallback, disposes prepared world siblings, and permits actual world/atlas retry', async () => {
  const error = new Error('missing approved core sheet'); vi.spyOn(console, 'error').mockImplementation(() => {});
  const textureDispose = vi.spyOn(THREE.Texture.prototype, 'dispose'), materialDispose = vi.spyOn(THREE.Material.prototype, 'dispose');
  state.decode.mockImplementationOnce(async sheet => {
    const image = {width: sheet.width, height: sheet.height, close: vi.fn()}; state.images.push(image); return image;
  }).mockRejectedValueOnce(error);
  await expect(loadArt(['oak', 'island_core'], {density: 2})).rejects.toBe(error);
  expect(textureDispose).toHaveBeenCalledOnce(); expect(materialDispose).toHaveBeenCalledOnce(); expect(state.images[0].close).toHaveBeenCalledOnce();
  state.decode.mockRejectedValueOnce(error); await expect(cartoonAtlas(['oak'], {density: 2})).rejects.toBe(error);
  const retry = await loadArt(['oak', 'island_core'], {density: 2});
  for (const id of ['oak', 'island_core']) expect(retry[id].map.userData.villageArt.source).toBe('png');
  const atlas = await cartoonAtlas(['oak'], {density: 2}); expect(atlas.missing).toEqual([]);
  expect(atlas.image.villageArt).toContainEqual({id: 'oak', file: getRasterFrame('oak').sheet.file, logical: getRasterFrame('oak').logical, source: 'png'});
  expect(loadTexture).not.toHaveBeenCalled(); expect(state.decode).toHaveBeenCalledTimes(6);
  expect(state.images.every(image => image.close.mock.calls.length === 1)).toBe(true); release(retry);
});
