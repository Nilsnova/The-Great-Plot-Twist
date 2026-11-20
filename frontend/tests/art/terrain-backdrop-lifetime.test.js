import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {MirroredRepeatWrapping, Texture} from 'three';

const state = vi.hoisted(() => ({release: vi.fn(), paint: vi.fn(), acquire: vi.fn(), smooth: vi.fn(), oldLoad: vi.fn()}));
vi.mock('../../src/art/village-raster.js', () => ({acquireRasterSheet: state.acquire}));
vi.mock('../../src/art/ground.js', () => ({hasGround: id => id === 'home_islet', paintGround: state.paint}));
vi.mock('../../src/art/textures.js', () => ({premultiply: vi.fn(), screenDensity: () => 2, smoothTexture: state.smooth}));
vi.mock('../../src/world/texture.js', () => ({loadTexture: state.oldLoad}));
import {loadBackdrop} from '../../src/world/places/resources.js';
import {materialRect, TERRAIN_SHEET} from '../../src/art/village/terrain-materials.js';

describe('temporary terrain decode ownership', () => {
  beforeEach(() => {
    vi.stubGlobal('document', {});
    vi.resetAllMocks();
    state.acquire.mockResolvedValue({image: {id: 'decoded terrain'}, release: state.release});
    state.paint.mockReturnValue({id: 'owned canvas'});
    state.smooth.mockReturnValue({id: 'owned texture'});
    state.oldLoad.mockResolvedValue({});
  });
  afterEach(() => vi.unstubAllGlobals());
  it('paints while leased, then releases the source while returning only the owned texture', async () => {
    const calls = [];
    state.paint.mockImplementation((id, density, image) => { calls.push('paint'); expect(image.id).toBe('decoded terrain'); return {id: 'owned canvas'}; });
    state.smooth.mockImplementation(image => { calls.push('texture'); expect(image.id).toBe('owned canvas'); return {id: 'owned texture'}; });
    state.release.mockImplementation(() => calls.push('release'));
    expect(await loadBackdrop('places/home_islet.png')).toEqual({id: 'owned texture'});
    expect(calls).toEqual(['paint', 'texture', 'release']);
    expect(state.release).toHaveBeenCalledTimes(1);
    expect(state.oldLoad).not.toHaveBeenCalled();
  });
  it('keeps the existing sandstone crop with Home ground until it is disposed', async () => {
    const image = {width: TERRAIN_SHEET.width, height: TERRAIN_SHEET.height};
    const drawImage = vi.fn(() => expect(state.release).not.toHaveBeenCalled());
    const tile = {getContext: () => ({drawImage})};
    document.createElement = vi.fn(() => tile);
    state.acquire.mockResolvedValue({image, release: state.release});
    const paintedGround = new Texture(), stone = {dispose: vi.fn()};
    state.smooth.mockReturnValueOnce(paintedGround).mockReturnValueOnce(stone);

    expect(await loadBackdrop('places/home_islet.png')).toBe(paintedGround);
    const [x, y, width, height] = materialRect(image, 'rock');
    expect(drawImage).toHaveBeenCalledWith(image, x, y, width, height, 0, 0, width, height);
    expect(state.release).toHaveBeenCalledTimes(1);
    expect(paintedGround.userData.homeStone).toBe(stone);
    expect(stone.wrapS).toBe(MirroredRepeatWrapping);
    expect(stone.dispose).not.toHaveBeenCalled();
    paintedGround.dispose();
    paintedGround.dispose();
    expect(stone.dispose).toHaveBeenCalledTimes(1);
    expect(paintedGround.userData.homeStone).toBeUndefined();
  });
  it('keeps painted ground if clipping the optional sandstone fails', async () => {
    const image = {width: TERRAIN_SHEET.width, height: TERRAIN_SHEET.height};
    document.createElement = () => { throw new Error('no extra canvas'); };
    state.acquire.mockResolvedValue({image, release: state.release});
    const paintedGround = new Texture();
    state.smooth.mockReturnValueOnce(paintedGround);
    expect(await loadBackdrop('places/home_islet.png')).toBe(paintedGround);
    expect(paintedGround.userData.homeStone).toBeUndefined();
    expect(state.release).toHaveBeenCalledTimes(1);
  });
  it('releases after a painter or texture failure and never invents a successful backdrop', async () => {
    state.paint.mockImplementationOnce(() => { throw new Error('paint failed'); });
    await expect(loadBackdrop('places/home_islet.png')).rejects.toThrow('paint failed');
    expect(state.release).toHaveBeenCalledTimes(1);
    state.smooth.mockImplementationOnce(() => { throw new Error('texture failed'); });
    await expect(loadBackdrop('places/home_islet.png')).rejects.toThrow('texture failed');
    expect(state.release).toHaveBeenCalledTimes(2);
  });
  it('propagates failed acquisition without painting and leaves other places on their old route', async () => {
    state.acquire.mockRejectedValueOnce(new Error('decode failed'));
    await expect(loadBackdrop('places/home_islet.png')).rejects.toThrow('decode failed');
    expect(state.paint).not.toHaveBeenCalled(); expect(state.release).not.toHaveBeenCalled();
    await loadBackdrop('places/saltreach_harbor.png');
    expect(state.oldLoad).toHaveBeenCalledTimes(1);
    expect(state.acquire).toHaveBeenCalledTimes(1);
  });
});
