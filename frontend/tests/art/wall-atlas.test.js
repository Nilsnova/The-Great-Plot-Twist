// World and combat must normalize UV extents from the actual rounded canvas, not ideal logical rows.
import {beforeEach, describe, expect, it, vi} from 'vitest';
const mocks = vi.hoisted(() => ({pack: vi.fn(), texture: vi.fn()}));
vi.mock('../../src/art/textures.js', () => ({cartoonAtlas: mocks.pack, smoothTexture: mocks.texture}));
import {loadWallAtlas} from '../../src/art/wall-atlas.js';
import {WALL_ATLAS_IDS} from '../../src/art/village/walls.js';
const packed = () => ({image: {width: 640, height: 533}, width: 256, height: 213, density: 2.5, missing: [],
  rects: Object.fromEntries(WALL_ATLAS_IDS.map(id => [id, {x: 3, y: 3, w: 48, h: 32, anchor: 6}]))});
beforeEach(() => { mocks.pack.mockReset(); mocks.texture.mockReset(); mocks.texture.mockImplementation(image => ({image})); });
describe('wall atlas ownership and fractional density', () => {
  it('uses actual padded pixel extents so fractional-density world UVs match the combat convention', async () => {
    const source = packed(); mocks.pack.mockResolvedValue(source);
    const art = await loadWallAtlas({density: 2.5});
    expect(art.width).toBe(256); expect(art.height).toBe(213.2); expect(art.ownsTexture).toBe(true);
    expect(art.rects).toBe(source.rects); expect(art.texture.image).toBe(source.image);
  });
  it('does not allocate a texture for an incomplete unregistered family', async () => {
    const source = packed(); source.missing = [WALL_ATLAS_IDS.at(-1)]; mocks.pack.mockResolvedValue(source);
    await expect(loadWallAtlas()).resolves.toBeNull(); expect(mocks.texture).not.toHaveBeenCalled();
  });
  it('propagates a registered asset decode failure for the visible retry path', async () => {
    const error = new Error('Wall sheet decode failed'); mocks.pack.mockRejectedValue(error);
    await expect(loadWallAtlas()).rejects.toBe(error); expect(mocks.texture).not.toHaveBeenCalled();
  });
});
