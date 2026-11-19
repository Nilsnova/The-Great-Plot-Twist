import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const state = vi.hoisted(() => ({release: vi.fn(), paint: vi.fn(), acquire: vi.fn(), smooth: vi.fn(), oldLoad: vi.fn()}));
vi.mock('../../src/art/village-raster.js', () => ({acquireRasterSheet: state.acquire}));
vi.mock('../../src/art/ground.js', () => ({hasGround: id => id === 'home_islet', paintGround: state.paint}));
vi.mock('../../src/art/textures.js', () => ({premultiply: vi.fn(), screenDensity: () => 2, smoothTexture: state.smooth}));
vi.mock('../../src/world/texture.js', () => ({loadTexture: state.oldLoad}));
import {loadBackdrop} from '../../src/world/places/resources.js';

describe('temporary terrain decode ownership', () => {
  beforeEach(() => {
    vi.stubGlobal('document', {});
    vi.resetAllMocks();
    state.acquire.mockResolvedValue({image: {id: 'decoded terrain'}, release: state.release});
    state.paint.mockReturnValue({id: 'owned canvas'});
    state.smooth.mockReturnValue({id: 'owned texture', userData: {}});
    state.oldLoad.mockResolvedValue({});
  });
  afterEach(() => vi.unstubAllGlobals());
  it('paints while leased, then releases the source while returning only the owned texture', async () => {
    const calls = [];
    state.paint.mockImplementation((id, density, materials, image) => { calls.push('paint'); expect(materials).toBeNull(); expect(image.id).toBe('decoded terrain'); return {id: 'owned canvas'}; });
    state.smooth.mockImplementation(image => { calls.push('texture'); expect(image.id).toBe('owned canvas'); return {id: 'owned texture', userData: {}}; });
    state.release.mockImplementation(() => calls.push('release'));
    expect(await loadBackdrop('places/home_islet.png')).toEqual({id: 'owned texture', userData: {homeReference: true}});
    expect(calls).toEqual(['paint', 'texture', 'release']);
    expect(state.release).toHaveBeenCalledTimes(1);
    expect(state.oldLoad).not.toHaveBeenCalled();
  });
  it('keeps the authored fallback terrain available when the reference plate cannot decode', async () => {
    state.acquire.mockRejectedValueOnce(new Error('reference unavailable'));
    expect(await loadBackdrop('places/home_islet.png')).toEqual({id: 'owned texture', userData: {}});
    expect(state.paint).toHaveBeenCalledWith('home_islet', 16, {id: 'decoded terrain'});
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
    state.acquire.mockRejectedValue(new Error('decode failed'));
    await expect(loadBackdrop('places/home_islet.png')).rejects.toThrow('decode failed');
    expect(state.paint).not.toHaveBeenCalled(); expect(state.release).not.toHaveBeenCalled();
    await loadBackdrop('places/saltreach_harbor.png');
    expect(state.oldLoad).toHaveBeenCalledTimes(1);
    expect(state.acquire).toHaveBeenCalledTimes(2);
  });
});
