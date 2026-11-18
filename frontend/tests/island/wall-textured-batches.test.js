// Actual textured buffers retain exact contacts/feet and batch only equal painter layers.
import {describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {makeWallConnections, wallTopology} from '../../src/island/wall-connections.js';
import {makeCombatWallConnections} from '../../src/pirates/wall-connections.js';
import {texturedWallBatches, wallVisualRows} from '../../src/island/wall-batches.js';
import {WALL_ATLAS_IDS, frames, sheets, wallFrame} from '../../src/art/village/walls.js';
import {wallAtlasView} from '../../src/art/wall-atlas.js';
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
      expect(spec.logical).toEqual([48, 48, 6]);
    }
    const complete = art(); expect(wallAtlasView(complete)).toMatchObject({ownsTexture: false});
    delete complete.rects[wallFrame(5, 'broken')]; expect(wallAtlasView(complete)).toBeNull();
  });
  it('places the post baseline at its authoritative foot and never moves source coordinates', () => {
    const rows = [wall('a', 4, 3, 5)], before = structuredClone(rows), atlas = art();
    const layers = texturedWallBatches([], wallVisualRows(rows), atlas), batch = layers.get(103);
    const corners = batch.positions.slice(-12);
    // Foot(4,3) stays at(5.8,−1.8); the post is1.8 wide with a.24375 foot margin.
    expect(corners.filter((_, i) => i % 3 === 0)).toEqual([4.9,6.7,6.7,4.9].map(x=>expect.closeTo(x,10)));
    expect(corners[1]).toBeCloseTo(-2.04375,10); expect(corners[4]).toBeCloseTo(-2.04375,10);
    expect(corners[7]).toBeCloseTo(-.09375,10); expect(corners[10]).toBeCloseTo(-.09375,10);
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
  // Fixed arithmetic receipts: x'=1.3x+.2z, y'=-.6z+lift. No runtime height/projection helper.
  // The legacy fallback's independent position/hash receipts remain in wall-span-batches.test.js.
  it.each([
    [1, [1.018,.682,.542,.692], [.85,-.35,.71,-.49,-.34,.86]],
    [2, [1.118,.782,.642,.792], [.95,-.25,.81,-.39,-.24,.96]],
    [3, [1.268,.932,.792,.942], [1.10,-.10,.96,-.24,-.09,1.11]],
    [4, [1.368,1.032,.892,1.042], [1.20,0,1.06,-.14,.01,1.21]],
    [5, [1.468,1.132,.992,1.142], [1.30,.10,1.16,-.04,.11,1.31]],
  ])('draws level %i spans with fixed projected feet, tier profile, upright trim and unchanged indices', (level, h, v) => {
    const cases = [
      {end: [2, 0], order: 99.98, points: [
        [-.056,h[0]],[2.544,h[0]],[2.656,h[1]],[.056,h[1]],
        [.056,-.168],[2.656,-.168],[2.656,h[1]],[.056,h[1]],
        [2.544,.168],[2.656,-.168],[2.656,h[1]],[2.544,h[0]],
        [.056,h[2]],[2.656,h[2]],[2.656,h[3]],[.056,h[3]],
      ]},
      {end: [0, 2], order: 100.98, points: [
        [-.364,v[0]],[.364,v[0]],[.764,v[1]],[.036,v[1]],
        [.036,-1.2],[.764,-1.2],[.764,v[1]],[.036,v[1]],
        [.364,0],[.764,-1.2],[.764,v[1]],[.364,v[0]],
        [.364,v[2]],[.764,v[3]],[.764,v[4]],[.364,v[5]],
      ]},
    ];
    for (const {end: [x, z], order, points} of cases) {
      const root = new THREE.Group(), drawing = makeWallConnections(root);
      drawing.setArt(art()); drawing.show([wall('a', 0, 0, level), wall('b', x, z, level)]);
      const mesh = drawing.root.children.find(row => row.renderOrder === order);
      const expected = Array.from(new Float32Array(points.flatMap(([px, py]) => [px, py, 0])));
      expect(Array.from(mesh.geometry.attributes.position.array)).toEqual(expected);
      expect(Array.from(mesh.geometry.index.array)).toEqual([0,1,2,0,2,3,4,5,6,4,6,7,8,9,10,8,10,11,12,13,14,12,14,15]);
      expect(mesh.geometry.attributes.position.count).toBe(16);
      expect(mesh.renderOrder).toBe(order); expect(mesh.frustumCulled).toBe(false);
      drawing.dispose();
    }
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
