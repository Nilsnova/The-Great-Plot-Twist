// Selected walls reuse real batch quads and borrowed artwork; no gameplay state is invented.
import {describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';
import {makeWallConnections} from '../../src/island/wall-connections.js';
import {decorateIsland} from '../../src/island/world.js';
import {WALL_ATLAS_IDS, frames} from '../../src/art/village/walls.js';
vi.mock('../../src/art/textures.js', async () => {
  const THREE = await import('three');
  return {frameCanvas: () => ({}), smoothTexture: () => new THREE.Texture(),
    spriteMaterial: map => new THREE.MeshBasicMaterial({map, transparent: true, depthTest: false, depthWrite: false})};
});
vi.mock('../../src/island/decorations.js', () => ({decorateProgress: () => ({apply() {}, dispose() {}})}));
vi.mock('../../src/island/structure-recovery-indicators.js', () => ({createStructureRecoveryIndicators: () => ({setState() {}, update() {}, dispose() {}})}));
vi.mock('../../src/art/wall-atlas.js', () => ({loadWallAtlas: () => new Promise(() => {}), wallPreviewCanvas: () => ({})}));
const wall = (id, x, z = 0, level = 3) => ({id, x, z, level, kind: 'wall', built: true});
function atlas(ownsTexture = false) {
  const rects = Object.fromEntries(WALL_ATLAS_IDS.map((id, i) => [id,
    {x: i % 5 * 50, y: Math.floor(i / 5) * 50, w: frames[id].logical[0], h: frames[id].logical[1], anchor: frames[id].logical[2]}]));
  return {texture: new THREE.Texture(), width: 256, height: 320, rects, ownsTexture};
}
const selected = root => root.getObjectByName('island-selected-wall');
function quads(geometry) {
  const p = geometry.attributes.position.array, uv = geometry.attributes.uv.array, index = geometry.index.array;
  return Array.from({length: index.length / 6}, (_, i) => Array.from({length: 4}, (_, n) => {
    const at = index[i * 6] + n;
    return [...p.slice(at * 3, at * 3 + 3), ...uv.slice(at * 2, at * 2 + 2)];
  }));
}

describe('current selected wall above decorative foliage', () => {
  it('reuses exactly the current straight post and incident spans in one nonpickable foreground draw', () => {
    const root = new THREE.Group(), drawing = makeWallConnections(root), art = atlas();
    drawing.setArt(art); drawing.show([wall('a', -2), wall('b', 0), wall('c', 2), wall('far', 20, 6, 5)]);
    const normal = [...drawing.root.children], buffers = normal.map(mesh => mesh.geometry);
    const bytes = normal.map(mesh => [mesh.geometry.attributes.position.array.slice(), mesh.geometry.attributes.uv.array.slice(), mesh.geometry.index.array.slice()]);
    const spans = normal.find(mesh => mesh.renderOrder === 99.98), posts = normal.find(mesh => mesh.renderOrder === 100);
    // B is the regular coordinate-zero buttress: the ordinary batch supplies its full tier post.
    const expected = [...quads(spans.geometry), quads(posts.geometry)[5]];
    drawing.select('b'); const mesh = selected(root);
    expect(quads(mesh.geometry)).toEqual(expected); expect(expected).toHaveLength(9);
    expect(mesh.material).toBe(normal[0].material); expect(mesh.material.map).toBe(art.texture);
    expect(mesh.renderOrder).toBe(199); expect(mesh.frustumCulled).toBe(false);
    expect(mesh.userData.spotId).toBe('b'); expect(drawing.root.children).toEqual(normal);
    normal.forEach((item, at) => expect(item.geometry).toBe(buffers[at]));
    const hits = []; mesh.raycast(new THREE.Raycaster(), hits); expect(hits).toEqual([]);
    for (let i = 0; i < 50; i++) drawing.select('b'); expect(selected(root)).toBe(mesh);
    drawing.root.visible = false; drawing.select('b'); expect(mesh.visible).toBe(false);
    drawing.root.visible = true; drawing.select('b'); expect(mesh.visible).toBe(true); expect(selected(root)).toBe(mesh);
    drawing.select('c'); drawing.select(null);
    normal.forEach((item, at) => {
      expect(item.geometry).toBe(buffers[at]);
      expect([item.geometry.attributes.position.array, item.geometry.attributes.uv.array, item.geometry.index.array]).toEqual(bytes[at]);
    });
    drawing.dispose();
  });

  it('rebuilds on accepted current-ID level/damage/position changes and keeps HP-zero rubble without joins', () => {
    const root = new THREE.Group(), drawing = makeWallConnections(root); drawing.setArt(atlas());
    const rows = [wall('a', 0), wall('b', 2)]; drawing.show(rows); drawing.select('a');
    const first = selected(root), released = vi.spyOn(first.geometry, 'dispose');
    drawing.show([{...rows[0], level: 5, look: 'damaged', x: -.5}, rows[1]]);
    expect(released).toHaveBeenCalledOnce(); expect(selected(root)).not.toBe(first);
    const ordinary = drawing.root.children.flatMap(mesh => quads(mesh.geometry));
    expect(quads(selected(root).geometry).every(quad => ordinary.some(row => JSON.stringify(row) === JSON.stringify(quad)))).toBe(true);
    drawing.show([{...rows[0], hp: 0}, rows[1]]); expect(drawing.links).toEqual([]);
    expect(drawing.posts.find(row => row.id === 'a').look).toBe('broken');
    expect(quads(selected(root).geometry)).toHaveLength(1);
    const rubble = drawing.root.children.find(mesh => mesh.renderOrder === 100);
    expect(quads(selected(root).geometry)[0]).toEqual(quads(rubble.geometry)[0]); drawing.dispose();
  });

  it('selects before art readiness, refreshes an accepted retry, and never disposes borrowed resources', () => {
    const root = new THREE.Group(), drawing = makeWallConnections(root), first = atlas(), next = atlas(true);
    const borrowed = vi.spyOn(first.texture, 'dispose'), owned = vi.spyOn(next.texture, 'dispose');
    drawing.show([wall('a', 0)]); drawing.select('a'); expect(selected(root)).toBeUndefined();
    drawing.setArt(first); const mesh = selected(root), geometry = vi.spyOn(mesh.geometry, 'dispose'), material = vi.spyOn(mesh.material, 'dispose');
    drawing.setArt(next); expect(geometry).toHaveBeenCalledOnce(); expect(material).toHaveBeenCalledOnce();
    expect(borrowed).not.toHaveBeenCalled(); expect(selected(root).material.map).toBe(next.texture);
    const current = selected(root), released = vi.spyOn(current.geometry, 'dispose'), shared = vi.spyOn(current.material, 'dispose');
    drawing.select(null); expect(selected(root)).toBeUndefined(); expect(released).toHaveBeenCalledOnce();
    expect(shared).not.toHaveBeenCalled(); expect(owned).not.toHaveBeenCalled();
    drawing.dispose(); drawing.dispose(); drawing.select('a');
    expect(root.children).toHaveLength(0); expect(shared).toHaveBeenCalledOnce(); expect(owned).toHaveBeenCalledOnce();
  });

  it.each(['missing', '', null, undefined])('clears invalid or closed selection %j without altering ordinary batches', id => {
    const root = new THREE.Group(), drawing = makeWallConnections(root); drawing.setArt(atlas()); drawing.show([wall('a', 0)]); drawing.select('a');
    const normal = [...drawing.root.children], mesh = selected(root), released = vi.spyOn(mesh.geometry, 'dispose');
    drawing.select(id); expect(selected(root)).toBeUndefined(); expect(released).toHaveBeenCalledOnce(); expect(drawing.root.children).toEqual(normal); drawing.dispose();
  });

  it.each([[], [{...wall('a', 0), built: false}], [{...wall('a', 0), kind: 'house'}], [{...wall('a', 0), x: NaN}]].map(rows => ({rows})))('clears removed/battle/unbuilt/invalid state $rows', ({rows}) => {
    const root = new THREE.Group(), drawing = makeWallConnections(root); drawing.setArt(atlas()); drawing.show([wall('a', 0)]); drawing.select('a');
    const released = vi.spyOn(selected(root).geometry, 'dispose'); drawing.show(rows);
    expect(selected(root)).toBeUndefined(); expect(released).toHaveBeenCalledOnce(); drawing.dispose();
  });

  it('switches IDs without changing normal buffers and rejects missing artwork instead of inventing fallback', () => {
    const root = new THREE.Group(), drawing = makeWallConnections(root), art = atlas(); drawing.setArt(art); drawing.show([wall('a', 0), wall('b', 2)]);
    drawing.select('a'); const released = vi.spyOn(selected(root).geometry, 'dispose'); drawing.select('b');
    expect(released).toHaveBeenCalledOnce(); expect(selected(root).userData.spotId).toBe('b');
    drawing.setArt({...atlas(), rects: {}}); expect(selected(root)).toBeUndefined(); drawing.dispose();
  });
});

it('the actual world update clears selected art on Move, Close, battle, and removal', async () => {
  const place = {group: new THREE.Group(), colliders: [], zones: []}; let anchor = {spotId: 'wall_13', x: -4, z: -17.5};
  const drawing = decorateIsland(place, {reducedMotion: true, loadArt: () => new Promise(() => {}), loadWallAtlas: async () => atlas(), selection: () => anchor});
  const rows = [wall('wall_13', -4, -17.5)]; drawing.apply({spots: rows}); await drawing.retryWallArt(); drawing.update(0);
  expect(selected(drawing.root)).toBeDefined(); const zones = place.zones, colliders = [...place.colliders];
  drawing.preview({spotId: 'wall_13', x: -2, z: -17.5, size: 2, ok: true}); expect(selected(drawing.root)).toBeUndefined();
  drawing.update(0); expect(selected(drawing.root)).toBeUndefined();
  drawing.preview(null); drawing.update(0); expect(selected(drawing.root)).toBeDefined();
  anchor = null; drawing.update(0); expect(selected(drawing.root)).toBeUndefined();
  anchor = {spotId: 'wall_13', x: -4, z: -17.5}; drawing.update(0); expect(selected(drawing.root)).toBeDefined();
  expect(place.zones).toEqual(zones); expect(place.colliders).toEqual(colliders);
  drawing.apply({spots: rows, visitor: true}); expect(selected(drawing.root)).toBeUndefined();
  drawing.update(0); expect(selected(drawing.root)).toBeUndefined();
  drawing.apply({spots: rows}); drawing.update(0); expect(selected(drawing.root)).toBeDefined();
  drawing.apply({spots: rows, battle: true}); drawing.update(0); expect(selected(drawing.root)).toBeUndefined();
  drawing.apply({spots: rows}); drawing.update(0); expect(selected(drawing.root)).toBeDefined();
  drawing.apply({spots: []}); drawing.update(0); expect(selected(drawing.root)).toBeUndefined(); drawing.dispose();
});
