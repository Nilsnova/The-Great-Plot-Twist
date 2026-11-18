import {beforeEach, describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';
import {decorateCore} from '../../src/island/core-world.js';
import {HEART, KEEP_OUT} from '../../src/island/placement.js';
import {projectPoint} from '../../src/world/art.js';

const made = vi.hoisted(() => ({textures: [], materials: []}));
// Test actual Three scene/resources without Canvas or a browser. The raster provider is tested separately.
vi.mock('../../src/art/textures.js', async () => {
  const THREE = await import('three');
  const track = object => {
    object.userData.disposals = 0;
    object.addEventListener('dispose', () => object.userData.disposals++);
    return object;
  };
  return {paintIds: vi.fn(), screenDensity: () => 2, lazyMaterials: () => ({}),
    smoothTexture: canvas => { const texture = track(new THREE.Texture(canvas)); made.textures.push(texture); return texture; },
    spriteMaterial: map => { const material = track(new THREE.MeshBasicMaterial({map})); made.materials.push(material); return material; }};
});

const IDS = ['island_core', 'island_core_damaged', 'island_core_broken'];
const canvas = id => ({id, width: 256, height: 256});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return {promise, resolve, reject};
};
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
const prepareAll = async (ids, density, visit) => { for (const id of ids) visit(id, canvas(id)); };
function start(prepare = prepareAll) {
  const place = {group: new THREE.Group(), colliders: [{id: 'existing-collider'}], zones: [{id: 'existing-zone'}]};
  return {place, view: decorateCore(place, {prepare, density: 2})};
}
beforeEach(() => { made.textures.length = made.materials.length = 0; });

describe('the existing core landmark renderer', () => {
  it('keeps the approved 128-square visual foot at HEART without changing placement or walking geometry', () => {
    const {place, view} = start(), {mesh} = view;
    mesh.geometry.computeBoundingBox();
    expect(mesh.geometry.boundingBox.min.toArray()).toEqual([-4, -.75, 0]);
    expect(mesh.geometry.boundingBox.max.toArray()).toEqual([4, 7.25, 0]);
    const point = projectPoint(HEART.x, HEART.z);
    expect(mesh.position.toArray()).toEqual([point.x, point.y, 0]);
    expect(mesh.userData.ground).toEqual(HEART);
    expect(HEART).toEqual({x: 0, z: 2});
    expect(KEEP_OUT.find(row => row.id === 'heart')).toMatchObject({x: 0, z: 2, w: 4, d: 4});
    expect(place.colliders).toEqual([{id: 'existing-collider'}]);
    expect(place.zones).toEqual([{id: 'existing-zone'}]);
    expect(mesh.renderOrder).toBe(100 + HEART.z);
    expect(mesh.visible).toBe(false); expect(mesh.frustumCulled).toBe(false);
    view.dispose(); expect(place.group.children).toHaveLength(0);
  });

  it('remains hidden until complete artwork is ready and uses the latest health received while loading', async () => {
    const work = deferred(); let visit;
    const prepare = vi.fn((ids, density, callback) => { visit = callback; return work.promise; });
    const {view} = start(prepare), pending = view.retryArt();
    view.setHealth({frame: 'island_core_damaged', hp: 20, max: 100, waveId: 'wave-a'});
    expect(view.mesh.visible).toBe(false); await flush();
    expect(prepare).toHaveBeenCalledWith(IDS, 2, expect.any(Function));
    visit(IDS[0], canvas(IDS[0])); expect(view.mesh.visible).toBe(false);
    view.setHealth({frame: 'island_core_broken', hp: 0, max: 100, waveId: 'wave-a'});
    for (const id of IDS.slice(1)) visit(id, canvas(id)); work.resolve(); await pending;
    expect(view.mesh.visible).toBe(true);
    expect(view.mesh.material.map.image.id).toBe('island_core_broken');
    expect(view.mesh.userData.health).toEqual({hp: 0, max: 100, waveId: 'wave-a'});
    view.dispose();
  });

  it('uses three distinct prepared maps, retains truthful HP, and resets to unknown health without invented numbers', async () => {
    const {view} = start(); await view.retryArt();
    const geometry = view.mesh.geometry, maps = [];
    for (const [frame, hp] of [[IDS[0], 100], [IDS[1], 25], [IDS[2], 0]]) {
      view.setHealth({frame, hp, max: 100, waveId: 'wave-a'});
      maps.push(view.mesh.material.map);
      expect(view.mesh.userData.art).toBe(frame);
      expect(view.mesh.material.map.image.id).toBe(frame);
      expect(view.mesh.userData.health).toEqual({hp, max: 100, waveId: 'wave-a'});
      expect(view.mesh.geometry).toBe(geometry);
    }
    expect(new Set(maps).size).toBe(3);
    view.reset(); expect(view.mesh.material.map.image.id).toBe(IDS[0]);
    expect(view.mesh.userData.health).toBeNull();
    view.dispose(); view.dispose();
    for (const object of [...made.materials, ...made.textures]) expect(object.userData.disposals).toBe(1);
  });

  it('coalesces concurrent attempts, releases a partial failure once, and retries without accepting incomplete art', async () => {
    const work = deferred(); let visit;
    const prepare = vi.fn((ids, density, callback) => { visit = callback; return work.promise; });
    const {view} = start(prepare), first = view.retryArt();
    expect(view.retryArt()).toBe(first); await flush(); expect(prepare).toHaveBeenCalledOnce();
    visit(IDS[0], canvas(IDS[0])); work.reject(new Error('PNG decode failed'));
    await expect(first).rejects.toThrow('PNG decode failed');
    expect(made.textures[0].userData.disposals).toBe(1);
    expect(made.materials[1].userData.disposals).toBe(1);
    expect(view.mesh.visible).toBe(false); expect(view.mesh.material.map).toBeNull();
    prepare.mockImplementation(prepareAll); await view.retryArt();
    expect(prepare).toHaveBeenCalledTimes(2); expect(view.mesh.visible).toBe(true);
    await view.retryArt(); expect(prepare).toHaveBeenCalledTimes(2);
    view.dispose();
    for (const object of [...made.materials, ...made.textures]) expect(object.userData.disposals).toBe(1);
  });

  it('rejects missing registered states and releases their incomplete resource pool', async () => {
    const {view} = start(async (ids, density, visit) => visit(IDS[0], canvas(IDS[0])));
    await expect(view.retryArt()).rejects.toThrow('not registered');
    expect(view.mesh.visible).toBe(false);
    expect(made.textures[0].userData.disposals).toBe(1);
    view.dispose();
  });

  it('ignores late preparation after disposal, releases all resources exactly once, and never reloads a dead view', async () => {
    const work = deferred(); let visit;
    const prepare = vi.fn((ids, density, callback) => { visit = callback; return work.promise; });
    const {view, place} = start(prepare), {mesh} = view, blank = mesh.material;
    const geometryDispose = vi.spyOn(mesh.geometry, 'dispose'), pending = view.retryArt();
    view.setHealth({frame: IDS[2], hp: 0, max: 100, waveId: 'wave-a'}); await flush();
    view.dispose(); view.dispose(); const userData = {...mesh.userData};
    for (const id of IDS) visit(id, canvas(id)); work.resolve(); await pending;
    expect(place.group.children).toHaveLength(0); expect(mesh.material).toBe(blank);
    expect(mesh.visible).toBe(false); expect(mesh.userData).toEqual(userData);
    expect(geometryDispose).toHaveBeenCalledOnce();
    for (const object of [...made.materials, ...made.textures]) expect(object.userData.disposals).toBe(1);
    view.setHealth({frame: IDS[0], hp: 100, max: 100, waveId: 'late'});
    await view.retryArt(); expect(prepare).toHaveBeenCalledOnce(); expect(mesh.userData).toEqual(userData);
  });
});
