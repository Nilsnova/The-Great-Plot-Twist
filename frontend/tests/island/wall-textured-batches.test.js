// Actual textured buffers retain exact contacts/feet and batch only equal painter layers.
import {describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {makeWallConnections, wallTopology} from '../../src/island/wall-connections.js';
import {makeCombatWallConnections} from '../../src/pirates/wall-connections.js';
import {texturedWallBatches, wallVisualRows} from '../../src/island/wall-batches.js';
import {WALL_ATLAS_IDS, frames, sheets, wallFrame} from '../../src/art/village/walls.js';
import {wallAtlasView} from '../../src/art/wall-atlas.js';
import {createWallBuilderPreview} from '../../src/island/wall-builder-preview.js';
const wall = (id, x, z, level = 1) => ({id, x, z, level, kind: 'wall', built: true});
const ring = JSON.parse(readFileSync(new URL('../fixtures/perimeter-ring.json', import.meta.url), 'utf8')).cells;
function art(ownsTexture = false) {
  const rects = Object.fromEntries(WALL_ATLAS_IDS.map((id, i) => [id, {x: i % 5 * 50, y: Math.floor(i / 5) * 50, w: frames[id].logical[0], h: frames[id].logical[1], anchor: frames[id].logical[2]}]));
  return {texture: new THREE.Texture(), width: 256, height: 320, rects, ownsTexture};
}
describe('dimensional wall artwork contract', () => {
  it('keeps every authored crop and foot inside the real sheet, retaining all five materials and ruin IDs', () => {
    expect(WALL_ATLAS_IDS).toHaveLength(30); expect(new Set(WALL_ATLAS_IDS).size).toBe(30);
    for (const level of [1, 2, 3, 4, 5]) for (const look of ['intact', 'damaged', 'broken']) {
      const spec = frames[wallFrame(level, look)], sheet = sheets[spec.sheet], [x, y, w, h] = spec.rect;
      expect(x + w).toBeLessThanOrEqual(sheet.width); expect(y + h).toBeLessThanOrEqual(sheet.height);
      expect(spec.sourceFoot[0]).toBeGreaterThan(0); expect(spec.sourceFoot[0]).toBeLessThan(w);
      expect(spec.sourceFoot[1]).toBeGreaterThan(0); expect(spec.sourceFoot[1]).toBeLessThan(h);
      expect(spec.logical).toEqual([48, 32, 6]);
    }
    const complete = art(); expect(wallAtlasView(complete)).toMatchObject({ownsTexture: false});
    delete complete.rects[wallFrame(5, 'broken')]; expect(wallAtlasView(complete)).toBeNull();
  });
  it('places the post baseline at its authoritative foot and never moves source coordinates', () => {
    const rows = [wall('a', 4, 3, 5)], before = structuredClone(rows), atlas = art();
    const layers = texturedWallBatches([], wallVisualRows(rows), atlas), batch = layers.get(103);
    const corners = batch.positions.slice(-12);
    expect(corners.filter((_, i) => i % 3 === 0)).toEqual([2.5, 5.5, 5.5, 2.5]);
    expect(corners[1]).toBeCloseTo(-2.535); expect(corners[4]).toBeCloseTo(-2.535);
    expect(corners[7]).toBeCloseTo(-.535); expect(corners[10]).toBeCloseTo(-.535);
    expect(rows).toEqual(before); expect(batch.indices.slice(-6).map(value => value - batch.positions.length/3 + 4)).toEqual([0, 1, 2, 0, 2, 3]);
    expect(batch.uvs.every(value => value >= 0 && value <= 1)).toBe(true);
  });
  it('batches the measured 102 posts while retaining all106 real joins and their exact depth orders', () => {
    const rows = ring.map(([x, z], i) => wall(`wall_${i+1}`, x, z, i % 5 + 1));
    const topology = wallTopology(rows), layers = texturedWallBatches(topology.links, wallVisualRows(rows), art());
    expect(topology.links).toHaveLength(106);
    const orders = new Set([...topology.links.map(link => 100 + (link.z0 + link.z1) / 2 - .02), ...rows.map(row => 100 + row.z)]);
    expect([...layers.keys()].sort()).toEqual([...orders].sort()); expect(layers.size).toBeLessThan(70);
    expect([...layers.values()].reduce((sum, layer) => sum + layer.positions.length / 12, 0)).toBe(106 * 4 + 102);
  });
  it('preserves the actual old span position/index buffers under the new material and post batches', () => {
    const rows = ring.map(([x, z], i) => wall(`wall_${i+1}`, x, z, i % 5 + 1));
    const oldRoot = new THREE.Group(), newRoot = new THREE.Group();
    const oldDrawing = makeWallConnections(oldRoot), newDrawing = makeWallConnections(newRoot);
    oldDrawing.show(rows); newDrawing.setArt(art()); newDrawing.show(rows);
    const newLayers = new Map(newRoot.children[0].children.map(mesh => [mesh.renderOrder, mesh]));
    for (const oldMesh of oldRoot.children[0].children) {
      const newMesh = newLayers.get(oldMesh.renderOrder);
      expect(Array.from(newMesh.geometry.getAttribute('position').array)).toEqual(Array.from(oldMesh.geometry.getAttribute('position').array));
      expect(Array.from(newMesh.geometry.index.array)).toEqual(Array.from(oldMesh.geometry.index.array));
    }
    oldDrawing.dispose(); newDrawing.dispose();
  });
  it('rebuilds real buffers for a breach, retains its ruin post and restores exactly the original contacts', () => {
    const root = new THREE.Group(), drawing = makeWallConnections(root), atlas = art(true), disposed = vi.spyOn(atlas.texture, 'dispose');
    const rows = [wall('a', 0, 0, 2), wall('b', 2, 0, 4), wall('c', 4, 0, 5)];
    drawing.show(rows); drawing.setArt(atlas); const group = root.children[0];
    const material = group.children[0].material; expect(material.forceSinglePass).toBe(true); expect(material.map).toBe(atlas.texture);
    expect(drawing.links).toHaveLength(2); const old = group.children.map(mesh => vi.spyOn(mesh.geometry, 'dispose'));
    drawing.show(rows.map(row => row.id === 'b' ? {...row, hp: 0} : row));
    expect(drawing.links).toEqual([]); expect(group.wallPosts.find(row => row.id === 'b').look).toBe('broken');
    expect(drawing.hasPost('b')).toBe(true); old.forEach(spy => expect(spy).toHaveBeenCalledOnce());
    drawing.show(rows); expect(drawing.links).toHaveLength(2);
    drawing.dispose(); drawing.dispose(); expect(disposed).toHaveBeenCalledOnce(); expect(root.children).toHaveLength(0);
    expect(drawing.setArt(art(true))).toBe(false);
  });
  it('updates every draft ghost to the registered frame height without moving its ground foot or owning its borrowed texture', () => {
    const root = new THREE.Group(), texture = new THREE.Texture(), textureDisposed = vi.spyOn(texture, 'dispose');
    const preview = createWallBuilderPreview({root, wall: {texture, size: [48, 48], anchor: 6}});
    preview.show({cells: [{x: 0, z: 0}, {x: 2, z: 0}], valid: true});
    const ghosts = root.children[0].children.filter(mesh => mesh.name.startsWith('wall-draft:'));
    const original = ghosts[0].geometry, disposed = vi.spyOn(original, 'dispose');
    preview.setFrame({size: [48, 32], anchor: 6});
    expect(ghosts[0].geometry).toBe(ghosts[1].geometry); expect(ghosts[0].geometry).not.toBe(original);
    ghosts[0].geometry.computeBoundingBox(); const bounds = ghosts[0].geometry.boundingBox;
    expect(bounds.min.y).toBeCloseTo(-.375); expect(bounds.max.y).toBeCloseTo(1.625);
    expect(ghosts.map(mesh => mesh.userData.ground)).toEqual([{x: 0, z: 0}, {x: 2, z: 0}]);
    preview.dispose(); expect(disposed).toHaveBeenCalledOnce(); expect(textureDisposed).not.toHaveBeenCalled();
  });
  it('uses accepted combat HP and break restoration without leaking stale starting-health or making unknown links', () => {
    const root = new THREE.Group(), drawing = makeCombatWallConnections(root, art());
    const posts = [{...wall('a', 0, 0, 2), health: 0}, {...wall('b', 2, 0, 4), health: 0}];
    drawing.show(posts, []); expect(drawing.links).toEqual([]);
    drawing.show(posts, [{id: 'a', hp: 50, maxHp: 100}, {id: 'b', hp: 0, maxHp: 100}]);
    expect(drawing.links).toEqual([]); expect(drawing.hasPost('a')).toBe(true);
    drawing.show(posts.map(row => ({...row, rest: 1})), [], {inBreak: true}); expect(drawing.links).toHaveLength(1);
    drawing.dispose();
  });
});
