// Actual post instance buffers: material walls carry their tier without a second star row.
import * as THREE from 'three';
import {describe, expect, it} from 'vitest';
import {createWaveRenderer, packAtlas} from '../../src/pirates/render.js';
import {WALL_ATLAS_IDS, frames} from '../../src/art/village/walls.js';

function fixture({materialWalls, kind = 'wall'}) {
  const atlas = {texture: new THREE.Texture(), ...packAtlas()};
  if (materialWalls) atlas.wallArt = {texture: atlas.texture, width: 512, height: 512,
    rects: Object.fromEntries(WALL_ATLAS_IDS.map((id, i) => [id, {x: i % 8 * 60, y: Math.floor(i / 8) * 40,
      w: frames[id].logical[0], h: frames[id].logical[1], anchor: frames[id].logical[2]}]))};
  const id = kind === 'wall' ? 'wall_1' : 'cannon_1', post = {id, kind, x: 0, z: 0, level: 3};
  const renderer = createWaveRenderer({scene: new THREE.Scene(), atlas, defenses: [post], reducedMotion: () => true, fx: () => null});
  renderer.update({state: {ships: [], boarders: [], fog: 0, sight: 28,
    walls: kind === 'wall' ? [{id, hp: 100, maxHp: 100}] : [], towers: kind !== 'wall' ? [{id, hp: 100, maxHp: 100}] : []}, dt: 0});
  const layer = renderer.root.getObjectByName(`pirates:defense:${id}`), uv = layer.geometry.getAttribute('iUv').array;
  const pip = atlas.rects['fx-level-pip'], expectedU = (pip.x + .01) / atlas.width, expectedV = 1 - (pip.y + pip.h - .01) / atlas.height;
  let pips = 0;
  for (let i = 0; i < layer.geometry.instanceCount; i++) if (Math.abs(Math.min(uv[i * 4], uv[i * 4 + 2]) - expectedU) < 1e-6
    && Math.abs(Math.min(uv[i * 4 + 1], uv[i * 4 + 3]) - expectedV) < 1e-6) pips++;
  return {renderer, atlas, layer, pips, dispose() { renderer.dispose(); atlas.texture.dispose(); }};
}

describe('combat tier markers on actual renderer layers', () => {
  it('keeps a real L3 material wall post while emitting no redundant pip instances', () => {
    const f = fixture({materialWalls: true}), connections = f.renderer.root.getObjectByName('pirates:wall-connections');
    expect(connections.children[0].wallPosts).toEqual([expect.objectContaining({id: 'wall_1', level: 3, look: 'intact'})]);
    expect(connections.children[0].children.some(mesh => mesh.geometry.getAttribute('position').count > 0)).toBe(true);
    expect(f.pips).toBe(0); expect(f.layer.geometry.instanceCount).toBe(0); f.dispose();
  });
  it('preserves all three L3 pips and the wall sprite in the pixel/legacy fallback', () => {
    const f = fixture({materialWalls: false}); expect(f.pips).toBe(3); expect(f.layer.geometry.instanceCount).toBe(4); f.dispose();
  });
  it('preserves the tower sprite and all three tower pips with a material wall atlas present', () => {
    const f = fixture({materialWalls: true, kind: 'cannon'}); expect(f.pips).toBe(3); expect(f.layer.geometry.instanceCount).toBe(4); f.dispose();
  });
});
