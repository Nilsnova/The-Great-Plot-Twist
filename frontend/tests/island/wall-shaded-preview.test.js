// Real preview buffers match the paid renderer without granting construction or owning its texture.
import {describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';
import {createWallBuilderPreview} from '../../src/island/wall-builder-preview.js';
import {makeWallConnections} from '../../src/island/wall-connections.js';
import {WALL_ATLAS_IDS, frames} from '../../src/art/village/walls.js';
function atlas() {
  const rects = Object.fromEntries(WALL_ATLAS_IDS.map((id, i) => [id, {x: i % 5 * 50, y: Math.floor(i / 5) * 50,
    w: frames[id].logical[0], h: frames[id].logical[1], anchor: frames[id].logical[2]}]));
  return {texture: new THREE.Texture(), width: 256, height: 320, rects, ownsTexture: true};
}
function setup() {
  const root = new THREE.Group(), texture = new THREE.Texture();
  const preview = createWallBuilderPreview({root, wall: {texture, size: [48, 48], anchor: 6}});
  return {root, preview, group: root.children[0], placeholder: texture};
}
const cells = [{x: 0, z: 0}, {x: 2, z: 0}, {x: 2, z: 2}];
const rows = input => input.map((cell, i) => ({...cell, id: `draft:${String(i).padStart(2, '0')}`, kind: 'wall', built: true, level: 1}));
function buffers(group) {
  return [...group.children].sort((a, b) => a.renderOrder - b.renderOrder).map(mesh => ({order: mesh.renderOrder,
    positions: [...mesh.geometry.getAttribute('position').array], uv: [...mesh.geometry.getAttribute('uv').array], indices: [...mesh.geometry.index.array]}));
}
describe('shared shaded wall previews', () => {
  it('reapplies the current visible draft on late art, with exact paid post/span buffers and honest contacts', () => {
    const {preview, group} = setup(), art = atlas(), model = {cells: structuredClone(cells), valid: true}, before = structuredClone(model);
    preview.show(model); preview.setWallArt(art);
    const drawing = group.getObjectByName('wall-draft-connections'), paidRoot = new THREE.Group(), paid = makeWallConnections(paidRoot);
    paid.setArt({...art, ownsTexture: false}); paid.show(rows(cells));
    expect(buffers(drawing)).toEqual(buffers(paid.root)); expect(drawing.wallLinks).toHaveLength(2);
    expect(group.draftCells).toEqual(cells); expect(group.renderedWallCells).toEqual(cells); expect(model).toEqual(before);
    const edited = group.draftCells; edited[0].x = 999; expect(group.draftCells).toEqual(cells);
    expect(drawing.children.every(mesh => { const hits = []; mesh.raycast(null, hits); return hits.length === 0; })).toBe(true);
    paid.dispose(); preview.dispose();
  });
  it('keeps actual gaps and half-cell translations, rather than connecting by cell list order', () => {
    const {preview, group} = setup(); preview.setWallArt(atlas());
    const separated = [{x: 0, z: 0}, {x: 2.5, z: 0}, {x: 2.5, z: 2.5}];
    preview.show({cells: separated, valid: false}); const drawing = group.getObjectByName('wall-draft-connections');
    expect(drawing.wallLinks).toEqual([]); expect(group.renderedWallCells).toEqual(separated);
    preview.show({cells, valid: true}); const before = buffers(drawing);
    const moved = cells.map(cell => ({x: cell.x + .5, z: cell.z + .5})); preview.show({cells: moved, valid: true});
    const after = buffers(drawing); expect(group.renderedWallCells).toEqual(moved); expect(drawing.wallLinks).toHaveLength(2);
    expect(after).toHaveLength(before.length);
    after.forEach((batch, index) => {
      expect(batch.order - before[index].order).toBeCloseTo(.5);
      batch.positions.forEach((value, n) => expect(value - before[index].positions[n]).toBeCloseTo(n % 3 === 0 ? .75 : n % 3 === 1 ? -.3 : 0));
    });
    preview.dispose();
  });
  it('changes real material feedback without reallocating unchanged geometry and clears canceled buffers', () => {
    const {preview, group} = setup(); preview.setWallArt(atlas()); preview.show({cells, valid: true});
    const drawing = group.getObjectByName('wall-draft-connections'), meshes = [...drawing.children], material = meshes[0].material;
    const spies = meshes.map(mesh => vi.spyOn(mesh.geometry, 'dispose'));
    expect(material.color.g).toBeGreaterThan(material.color.r); expect(material.opacity).toBe(.55);
    preview.show({cells, refused: true}); expect(material.color.r).toBeGreaterThan(material.color.g);
    expect(drawing.children).toEqual(meshes); spies.forEach(spy => expect(spy).not.toHaveBeenCalled());
    preview.show({cells: []}); expect(group.visible).toBe(false); expect(group.draftCells).toEqual([]);
    expect(group.renderedWallCells).toEqual([]); expect(drawing.children).toEqual([]);
    spies.forEach(spy => expect(spy).toHaveBeenCalledOnce()); preview.dispose();
  });
  it('bounds ordered cells at32 and disposes only owned materials/buffers, never the borrowed world texture', () => {
    const {preview, group, placeholder} = setup(), art = atlas();
    const textureDisposed = vi.spyOn(art.texture, 'dispose'), placeholderDisposed = vi.spyOn(placeholder, 'dispose');
    preview.setWallArt(art); preview.show({cells: Array.from({length: 33}, (_, i) => ({x: i * 2, z: .5})), valid: true});
    expect(group.draftCells).toHaveLength(32); expect(group.renderedWallCells).toEqual(group.draftCells);
    const drawing = group.getObjectByName('wall-draft-connections'), materialDisposed = vi.spyOn(drawing.children[0].material, 'dispose');
    preview.dispose(); preview.dispose(); expect(materialDisposed).toHaveBeenCalledOnce();
    expect(textureDisposed).not.toHaveBeenCalled(); expect(placeholderDisposed).not.toHaveBeenCalled();
    expect(group.draftCells).toEqual([]); expect(group.renderedWallCells).toEqual([]); expect(preview.setWallArt(art)).toBe(false);
  });
});
