import {afterEach, beforeEach, expect, it, vi} from 'vitest';
const state = vi.hoisted(() => ({decode: vi.fn(), images: []}));
vi.mock('../../src/art/village-families.js', () => ({villageFamilies: [{
  sheets: {one: {file: 'village/one.png', width: 2, height: 2}, two: {file: 'village/two.png', width: 2, height: 2}},
  frames: {'island-cannon-l2': {sheet: 'one', rect: [0, 0, 2, 2], logical: [56, 48, 7]},
    'png-only-broken': {sheet: 'one', rect: [0, 0, 2, 2], logical: [48, 48, 6]},
    'png-other': {sheet: 'two', rect: [0, 0, 2, 2], logical: [64, 64, 8]}},
}]}));
vi.mock('../../src/art/village-decode.js', () => ({decodeRasterSheet: (...args) => state.decode(...args)}));
import {artSizes, loadArt} from '../../src/world/art.js';
import {cartoonAtlas, paintIds} from '../../src/art/textures.js';
function canvas() {
  const result = {draws: []}; result.getContext = () => ({setTransform() {}, drawImage: (...args) => result.draws.push(args)}); return result;
}
beforeEach(() => {
  state.images = []; state.decode.mockReset().mockImplementation(async sheet => {
    const image = {width: sheet.width, height: sheet.height, close: vi.fn()}; state.images.push(image); return image;
  });
  vi.stubGlobal('document', {createElement: canvas});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('shares normalized feet/source between world and atlas, including new IDs and pixel-catalog visual overrides', async () => {
  expect(state.decode).not.toHaveBeenCalled(); const ids = ['island-cannon-l2', 'png-only-broken'];
  const world = await loadArt(ids, {density: 2}), atlas = await cartoonAtlas(ids, {density: 2});
  expect(artSizes['island-cannon-l2']).toEqual([3.5, 3, 7 / 48]); expect(atlas.rects['island-cannon-l2']).toMatchObject({w: 56, h: 48, anchor: 7});
  expect(atlas.missing).toEqual([]); expect(state.decode).toHaveBeenCalledTimes(2);
  for (const [index, id] of ids.entries()) {
    const direct = world[id].map.image, packed = atlas.image.draws[index][0];
    expect(direct.villageArt).toEqual(packed.villageArt); expect(direct.villageArt).toMatchObject({id, source: 'png', file: 'village/one.png'});
    expect([direct.width, direct.height]).toEqual([packed.width, packed.height]);
    expect(direct.draws[0].slice(1)).toEqual(packed.draws[0].slice(1));
    expect(world[id].map.userData.villageArt).toEqual(direct.villageArt);
    expect(world[id].map.premultiplyAlpha).toBe(true); expect(world[id].map.generateMipmaps).toBe(true);
    world[id].map.dispose(); world[id].dispose();
  }
  expect(state.images.every(image => image.close.mock.calls.length === 1)).toBe(true);
});
it('copies then releases each family before acquiring the next decoded sheet', async () => {
  let active = 0; const order = [];
  await paintIds(['island-cannon-l2', 'png-other'], 2, id => order.push(id), {frames: {}, acquire: async sheet => {
    expect(active).toBe(0); active++; order.push(sheet.file);
    return {image: {}, release() { active--; order.push('release'); }};
  }});
  expect(order).toEqual(['village/one.png', 'island-cannon-l2', 'release', 'village/two.png', 'png-other', 'release']); expect(active).toBe(0);
});
it('rejects registered PNG failures in both routes instead of quietly painting old art, and allows a retry', async () => {
  const error = new Error('missing approved sheet'); vi.spyOn(console, 'error').mockImplementation(() => {});
  state.decode.mockRejectedValueOnce(error); await expect(loadArt(['island-cannon-l2'], {density: 2})).rejects.toBe(error);
  state.decode.mockRejectedValueOnce(error); await expect(cartoonAtlas(['island-cannon-l2'], {density: 2})).rejects.toBe(error);
  const retry = await loadArt(['island-cannon-l2'], {density: 2}); expect(retry['island-cannon-l2'].map.userData.villageArt.source).toBe('png');
  retry['island-cannon-l2'].map.dispose(); retry['island-cannon-l2'].dispose(); expect(state.decode).toHaveBeenCalledTimes(3);
});
