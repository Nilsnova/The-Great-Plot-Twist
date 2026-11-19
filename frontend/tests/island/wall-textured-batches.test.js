// Actual textured buffers retain exact contacts/feet and batch only equal painter layers.
import {describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {makeWallConnections, wallTopology} from '../../src/island/wall-connections.js';
import {makeCombatWallConnections} from '../../src/pirates/wall-connections.js';
import {texturedWallBatches, wallVisualRows} from '../../src/island/wall-batches.js';
import {WALL_ATLAS_IDS, frames, sheets, wallFrame, wallSurfaceFrame} from '../../src/art/village/walls.js';
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
    expect(batch.ground.slice(-8)).toEqual([4,3,4,3,4,3,4,3]);
    expect(rows).toEqual(before); expect(batch.indices.slice(-6).map(value => value - batch.positions.length/3 + 4)).toEqual([0, 1, 2, 0, 2, 3]);
    expect(batch.uvs.every(value => value >= 0 && value <= 1)).toBe(true);
  });
  it('insets free ends and keeps ground contact inside the accepted tile without extra picking targets', () => {
    const root = new THREE.Group(), drawing = makeWallConnections(root);
    drawing.setArt(art());
    drawing.show([wall('a', 0, 0)]);
    const facePositions = drawing.root.children[0].geometry.getAttribute('position');
    for (let at = 0; at < 28; at++) expect(Math.abs(facePositions.getX(at))).toBeLessThan(1.2);
    const ground = root.getObjectByName('wall-ground-contact'), original = ground.geometry;
    const position = original.getAttribute('position'), colour = original.getAttribute('color');
    const dispose = vi.spyOn(original, 'dispose');
    for (let at = 0; at < position.count; at++) {
      const z = -position.getY(at) / .6, x = (position.getX(at) - .2 * z) / 1.3;
      expect(Math.max(Math.abs(x), Math.abs(z))).toBeLessThan(1);
      expect(colour.getW(at)).toBeCloseTo(at === 0 ? .26 : 0);
    }
    const hits = [];
    ground.raycast(new THREE.Raycaster(), hits);
    expect(hits).toEqual([]);
    drawing.select('a');
    expect(ground.geometry).toBe(original);
    drawing.show([]);
    expect(ground.visible).toBe(false);
    drawing.dispose();
    expect(dispose).toHaveBeenCalledOnce();
    expect(root.children).toHaveLength(0);
  });
  it('batches the measured 102 posts while retaining all106 real joins and their exact depth orders', () => {
    const rows = ring.map(([x, z], i) => wall(`wall_${i+1}`, x, z, i % 5 + 1));
    const topology = wallTopology(rows), layers = texturedWallBatches(topology.links, wallVisualRows(rows), art());
    expect(topology.links).toHaveLength(106);
    const orders = new Set([...topology.links.map(link => 100 + (link.z0 + link.z1) / 2 - .02), ...rows.map(row => 100 + row.z)]);
    expect([...layers.keys()].sort()).toEqual([...orders].sort()); expect(layers.size).toBeLessThan(70);
    const byId = new Map(rows.map(row => [row.id, row]));
    const spanQuads = topology.links.reduce((sum, {a, b}) => {
      const ends = [byId.get(a), byId.get(b)].sort((left,right) => left.x-right.x || left.z-right.z);
      if (ends[0].level === ends[1].level) return sum + 4;
      return sum + (ends[0].level > ends[1].level ? 11 : 8);
    }, 0);
    expect([...layers.values()].reduce((sum, layer) => sum + layer.positions.length / 12, 0)).toBe(spanQuads + 102);
  });
  // Fixed arithmetic receipts: x'=1.3x+.2z, y'=-.6z+lift. The base is .47, then .38, then .28 from the center.
  // The legacy fallback's independent position/hash receipts remain in wall-span-batches.test.js.
  it.each([[1,.85],[2,.95],[3,1.10],[4,1.20],[5,1.30]])(
    'draws a grounded plinth, face and beveled crown for level %i on both axes', (level, h) => {
    const cases = [
      {end: [2, 0], order: 99.98, shade: .94, points: [
        [.094,-.282],[2.694,-.282],[2.676,-.028],[.076,-.028],
        [.076,-.028],[2.676,-.028],[2.676,h-.358],[.076,h-.358],
        [.076,h-.358],[2.676,h-.358],[2.656,h-.168],[.056,h-.168],
        [-.056,h+.168],[2.544,h+.168],[2.656,h-.168],[.056,h-.168],
      ]},
      {end: [0, 2], order: 100.98, shade: .74, points: [
        [.611,0],[1.011,-1.2],[.894,-1],[.494,.20],
        [.494,.20],[.894,-1],[.894,h-1.33],[.494,h-.13],
        [.494,h-.13],[.894,h-1.33],[.764,h-1.2],[.364,h],
        [-.364,h],[.364,h],[.764,h-1.2],[.036,h-1.2],
      ]},
    ];
    for (const {end: [x, z], order, shade, points} of cases) {
      const root = new THREE.Group(), drawing = makeWallConnections(root);
      drawing.setArt(art()); drawing.show([wall('a', 0, 0, level), wall('b', x, z, level)]);
      const mesh = drawing.root.children.find(row => row.renderOrder === order);
      const expected = points.flatMap(([px, py]) => [px, py, 0]).map(value => expect.closeTo(value, 6));
      expect(Array.from(mesh.geometry.attributes.position.array)).toEqual(expected);
      const colors = mesh.geometry.getAttribute('color');
      const facing = [shade * .61, shade, shade * .92, 1.09];
      for (const [index, light] of facing.entries()) {
        const at = index * 4;
        const rgb = [colors.getX(at), colors.getY(at), colors.getZ(at)];
        expect(rgb).toEqual([light, light * .982, light * .939].map(value => expect.closeTo(value, 6)));
      }
      expect(Array.from(mesh.geometry.index.array)).toEqual([0,1,2,0,2,3,4,5,6,4,6,7,8,9,10,8,10,11,12,13,14,12,14,15]);
      expect(mesh.geometry.attributes.position.count).toBe(16);
      expect(mesh.renderOrder).toBe(order); expect(mesh.frustumCulled).toBe(false);
      drawing.dispose();
    }
  });
  it.each([[2,0], [0,2]])('gives each mixed-tier connector half its own atlas color up to the shared boundary (%i,%i)', (x,z) => {
    const atlas = art();
    const rows = [wall('later-id',0,0,4),wall('earlier-id',x,z,2)];
    const topology = wallTopology(rows);
    expect(topology.links).toHaveLength(1);
    expect(topology.links[0].level).toBe(2);
    const batch = texturedWallBatches(topology.links, wallVisualRows(rows), atlas).get(100 + z/2 - .02);
    expect(batch.ground).toHaveLength(batch.positions.length / 3 * 2);
    const runCoordinate = x ? 0 : 1;
    for (const [tier, from, to] of [[4,0,1],[2,1,2]]) {
      const rect = atlas.rects[wallSurfaceFrame(tier, 'top')];
      const u0 = (rect.x+.5)/atlas.width, v0 = 1-(rect.y+rect.h-.5)/atlas.height;
      const u1 = (rect.x+rect.w-.5)/atlas.width, v1 = 1-(rect.y+.5)/atlas.height;
      const coordinates = [];
      for (let at = 0; at < batch.uvs.length; at += 8) {
        const match = [u0,v0,u1,v0,u1,v1,u0,v1].every((value, offset) => batch.uvs[at+offset] === value);
        if (match) coordinates.push(...batch.ground.slice(at,at+8).filter((_, i) => i % 2 === runCoordinate));
      }
      expect(coordinates).toContain(from);
      expect(coordinates).toContain(to);
      expect(coordinates.every(value => value >= from && value <= to)).toBe(true);
    }
  });
  it.each([[2,0],[0,2]])('keeps a continuous low ground shadow between live neighbors (%i,%i)', (x,z) => {
    const root = new THREE.Group(), drawing = makeWallConnections(root);
    drawing.setArt(art());
    drawing.show([wall('a',0,0),wall('b',x,z)]);
    const shadow = root.getObjectByName('wall-ground-contact');
    const {position, color} = shadow.geometry.attributes;
    const join = Array.from({length: 8}, (_, i) => {
      const at = position.count - 8 + i;
      const depth = -position.getY(at) / .6;
      const width = (position.getX(at) - .2 * depth) / 1.3;
      return {along: x ? width : depth, alpha: color.getW(at)};
    });
    expect(join.map(point => point.along)).toEqual([0,0,0,0,2,2,2,2].map(value => expect.closeTo(value, 6)));
    expect(join.map(point => point.alpha)).toEqual([0,.22,.26,0,0,.22,.26,0].map(value => expect.closeTo(value, 6)));
    expect(shadow.geometry.index.count).toBe(90);
    drawing.show([wall('a',0,0),{...wall('b',x,z),hp:0}]);
    expect(shadow.geometry.index.count).toBe(72);
    drawing.dispose();
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
