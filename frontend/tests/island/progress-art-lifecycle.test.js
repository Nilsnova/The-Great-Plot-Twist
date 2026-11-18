import {describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';
import {decorateProgress} from '../../src/island/decorations.js';

const text = vi.hoisted(() => []);
vi.mock('../../src/art/paint.js', () => ({paint(draw) {
  draw({drawImage() {}, fillText: (...args) => text.push(args)}); return {};
}}));
vi.mock('../../src/art/textures.js', async () => {
  const THREE = await import('three');
  return {paintIds() {}, screenDensity: () => 2, smoothTexture: () => new THREE.Texture(),
    spriteMaterial: map => new THREE.MeshBasicMaterial({map})};
});
const ready = async (ids, _density, visit) => { for (const id of ids) visit(id, {id}); };
const place = () => ({group: new THREE.Group(), colliders: [{x: 1, z: 2}], zones: [{id: 'existing'}]});

describe('small nautical progress landmarks', () => {
  it('uses the latest real record/stage after preparation and reuses unchanged textures', async () => {
    text.length = 0;
    let complete; const p = place();
    const decor = decorateProgress(p, {prepare: (...args) => new Promise(resolve => { complete = () => ready(...args).then(resolve); })});
    const flag = p.group.getObjectByName('island-best-wave'), statue = p.group.getObjectByName('island-wave-25');
    decor.apply({wave: 24}, [], true);
    expect(flag.visible).toBe(false); expect(flag.userData.wave).toBe(24);
    const pending = decor.retryArt(); expect(decor.retryArt()).toBe(pending); await Promise.resolve();
    decor.apply({wave: 51}, [], true); await complete(); await pending;
    expect(flag.visible).toBe(true); expect(statue.visible).toBe(true);
    expect(text.map(call => call[0])).toEqual(['BEST WAVE', '51', 'MASTER', '50']);
    expect(statue.userData.stage).toBe(2);
    const old = flag.material.map, disposed = vi.spyOn(old, 'dispose');
    decor.apply({wave: 51}, [], true); expect(flag.material.map).toBe(old);
    decor.apply({wave: 1}, [], true); expect(statue.visible).toBe(false); expect(disposed).toHaveBeenCalledOnce();
    expect(flag.userData).toMatchObject({wave: 1, rank: 'wood'});
    expect(p.colliders).toEqual([{x: 1, z: 2}]); expect(p.zones).toEqual([{id: 'existing'}]);
    decor.dispose(); decor.dispose();
  });
  it('reports preparation failure, retries, restores tree scale and releases owned textures once', async () => {
    const p = place(), tree = new THREE.Object3D(); tree.userData.asset = 'oak'; tree.scale.set(2, 2, 2); p.group.add(tree);
    const prepare = vi.fn().mockRejectedValueOnce(new Error('decode failed')).mockImplementation(ready);
    const decor = decorateProgress(p, {prepare}); decor.apply({wave: 100}, [{id: 'house_1', kind: 'house', built: true}], true);
    expect(tree.scale.x).toBe(2.2); await expect(decor.retryArt()).rejects.toThrow('decode failed');
    await decor.retryArt(); expect(prepare).toHaveBeenCalledTimes(2);
    const meshes = ['island-best-wave', 'island-wave-25'].map(id => p.group.getObjectByName(id));
    const freed = meshes.flatMap(mesh => [mesh.geometry, mesh.material, mesh.material.map]).map(value => vi.spyOn(value, 'dispose'));
    decor.dispose(); decor.dispose(); await decor.retryArt();
    expect(prepare).toHaveBeenCalledTimes(2); expect(tree.scale.x).toBe(2);
    for (const spy of freed) expect(spy).toHaveBeenCalledOnce();
    expect(p.group.children).toEqual([tree]);
  });
  it('ignores late prepared art after disposal without painting or reattaching the landmarks', async () => {
    text.length = 0; let resolve;
    const p = place(), prepare = vi.fn((...args) => new Promise(done => { resolve = () => ready(...args).then(done); }));
    const decor = decorateProgress(p, {prepare}); decor.apply({wave: 25}, [], true);
    const pending = decor.retryArt(); await Promise.resolve(); decor.dispose(); await resolve(); await pending;
    expect(text).toEqual([]); expect(p.group.children).toEqual([]);
    decor.apply({wave: 100}, [], true); await decor.retryArt(); expect(prepare).toHaveBeenCalledOnce();
  });
});
