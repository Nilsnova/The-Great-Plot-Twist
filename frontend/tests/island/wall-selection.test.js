// Selecting a wall preserves normal occlusion; only the existing tile bracket is foreground UI.
import {describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';
import {makeWallConnections} from '../../src/island/wall-connections.js';
import {decorateIsland} from '../../src/island/world.js';
import {WALL_ATLAS_IDS, frames, wallFrame} from '../../src/art/village/walls.js';
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
const obsoleteOverlay = root => root.getObjectByName('island-selected-wall');
function quads(geometry) {
  const p = geometry.attributes.position.array, uv = geometry.attributes.uv.array, index = geometry.index.array;
  return Array.from({length: index.length / 6}, (_, i) => Array.from({length: 4}, (_, n) => {
    const at = index[i * 6] + n;
    return [...p.slice(at * 3, at * 3 + 3), ...uv.slice(at * 2, at * 2 + 2)];
  }));
}
const buffers = drawing => drawing.root.children.map(mesh => [mesh.renderOrder, quads(mesh.geometry)]);
function postAt(drawing, art, id, x, z = 0) {
  const frame = art.rects[id], u0 = (frame.x + .5) / art.width, u1 = (frame.x + frame.w - .5) / art.width;
  const v0 = 1 - (frame.y + frame.h - .5) / art.height, v1 = 1 - (frame.y + .5) / art.height;
  const wanted = Array.from(new Float32Array([u0,v0,u1,v0,u1,v1,u0,v1]));
  return drawing.root.children.flatMap(mesh => quads(mesh.geometry)
    .filter(points => JSON.stringify(points.flatMap(point => point.slice(3))) === JSON.stringify(wanted)
      && Math.abs((points[0][0] + points[1][0]) / 2 - (1.3 * x + .2 * z)) < 1e-5)
    .map(points => ({order: mesh.renderOrder, points})));
}

describe('selected walls retain ordinary painter depth', () => {
  it('exposes only an existing selected wall through a read-only diagnostic across readiness, clearing and disposal', () => {
    const root = new THREE.Group(), drawing = makeWallConnections(root), group = drawing.root;
    drawing.show([wall('a',0),wall('b',2),wall('c',4)]); drawing.select('b');
    expect(group.wallSelectedId).toBeNull(); drawing.setArt(atlas()); expect(group.wallSelectedId).toBe('b');
    const descriptor = Object.getOwnPropertyDescriptor(group,'wallSelectedId');
    expect(descriptor.get).toBeTypeOf('function'); expect(descriptor.set).toBeUndefined(); expect(descriptor.configurable).toBe(false);
    drawing.select(null); expect(group.wallSelectedId).toBeNull();
    drawing.select('missing'); expect(group.wallSelectedId).toBeNull();
    drawing.select('a'); expect(group.wallSelectedId).toBe('a');
    drawing.show([{...wall('a',0),built:false}]); expect(group.wallSelectedId).toBeNull();
    drawing.show([wall('a',0)]); expect(group.wallSelectedId).toBe('a');
    drawing.dispose(); expect(group.wallSelectedId).toBeNull();
    drawing.select('a'); drawing.show([wall('a',0)]); expect(group.wallSelectedId).toBeNull();
  });

  it('cannot paint copied wall textures over a foreground prop and retains the actual selected post once', () => {
    const root = new THREE.Group(), drawing = makeWallConnections(root), art = atlas(); drawing.setArt(art);
    const rows = [wall('a',0),wall('b',2),wall('c',4),wall('far',20,6,5)], before = structuredClone(rows); drawing.show(rows);
    const normal = [...drawing.root.children], released = normal.map(mesh => vi.spyOn(mesh.geometry, 'dispose'));
    const original = buffers(drawing), orders = normal.map(mesh => mesh.renderOrder), topology = drawing.links;
    expect(postAt(drawing,art,wallFrame(3),2)).toHaveLength(0);
    const prop = new THREE.Mesh(new THREE.PlaneGeometry(3,5),new THREE.MeshBasicMaterial());
    prop.name = 'foreground-tree'; prop.renderOrder = 103; root.add(prop); drawing.select('b');
    expect(obsoleteOverlay(root)).toBeUndefined();
    const ground = root.getObjectByName('wall-ground-contact');
    expect(root.children).toEqual([drawing.root,ground,prop]);
    expect(ground.renderOrder).toBeLessThan(drawing.root.children[0].renderOrder);
    expect(ground.material.depthWrite).toBe(false);
    expect(drawing.root.children.map(mesh => mesh.renderOrder)).toEqual(orders);
    expect(drawing.links).toEqual(topology); expect(rows).toEqual(before);
    const selectedPost = postAt(drawing,art,wallFrame(3),2);
    expect(selectedPost).toHaveLength(1); expect(selectedPost[0].order).toBe(100);
    expect(selectedPost[0].order).toBeLessThan(prop.renderOrder);
    drawing.root.children.forEach(mesh => {
      expect(mesh.material.map).toBe(art.texture); expect(mesh.renderOrder).toBeLessThan(150);
      const hits = []; mesh.raycast(new THREE.Raycaster(),hits); expect(hits).toEqual([]);
    });
    released.forEach(dispose => expect(dispose).toHaveBeenCalledOnce());
    const selected = [...drawing.root.children];
    for (let i = 0; i < 50; i++) { drawing.select('b'); drawing.show(rows); }
    expect(drawing.root.children).toEqual(selected);
    drawing.select('c'); drawing.select(null); expect(buffers(drawing)).toEqual(original);
    drawing.dispose(); prop.geometry.dispose(); prop.material.dispose();
  });

  it.each([1,2,3,4,5])('retains the exact selected level %i artwork at the accepted foot', level => {
    const root = new THREE.Group(), drawing = makeWallConnections(root), art = atlas(); drawing.setArt(art);
    const rows = [wall('a',0,4,level),wall('b',2,4,level),wall('c',4,4,level)], before = structuredClone(rows);
    drawing.show(rows); const topology = drawing.links; drawing.select('b');
    const actual = postAt(drawing,art,wallFrame(level),2,4);
    expect(actual).toHaveLength(1); expect(actual[0].order).toBe(104);
    expect(Math.min(...actual[0].points.map(point => point[1]))).toBeCloseTo(-2.4-art.rects[wallFrame(level)].anchor/16*.65,5);
    expect(drawing.posts.map(post => post.id)).toEqual(['a','b','c']);
    expect(drawing.links).toEqual(topology); expect(rows).toEqual(before); expect(obsoleteOverlay(root)).toBeUndefined(); drawing.dispose();
  });

  it('rebuilds accepted level, damage and position changes, and keeps HP-zero rubble without joins', () => {
    const root = new THREE.Group(), drawing = makeWallConnections(root), art = atlas(); drawing.setArt(art);
    const rows = [wall('a',0),wall('b',2)]; drawing.show(rows); drawing.select('a');
    const released = drawing.root.children.map(mesh => vi.spyOn(mesh.geometry,'dispose'));
    drawing.show([{...rows[0],level:5,look:'damaged',x:-.5},rows[1]]);
    released.forEach(dispose => expect(dispose).toHaveBeenCalledOnce());
    expect(postAt(drawing,art,wallFrame(5,'damaged'),-.5)).toHaveLength(1);
    drawing.show([{...rows[0],hp:0},rows[1]]); expect(drawing.links).toEqual([]);
    expect(drawing.posts.find(row => row.id === 'a').look).toBe('broken');
    expect(postAt(drawing,art,wallFrame(3,'broken'),0)).toHaveLength(1);
    expect(obsoleteOverlay(root)).toBeUndefined(); drawing.dispose();
  });

  it('retains pre-readiness selection on retry and disposes only owned resources exactly once', () => {
    const root = new THREE.Group(), drawing = makeWallConnections(root), first = atlas(), next = atlas(true);
    const borrowed = vi.spyOn(first.texture,'dispose'), owned = vi.spyOn(next.texture,'dispose');
    drawing.show([wall('a',0),wall('b',2),wall('c',4)]); drawing.select('b');
    expect(obsoleteOverlay(root)).toBeUndefined(); drawing.setArt(first);
    expect(postAt(drawing,first,wallFrame(3),2)).toHaveLength(1);
    const normal = [...drawing.root.children], released = normal.map(mesh => vi.spyOn(mesh.geometry,'dispose'));
    const materialDisposed = vi.spyOn(normal[0].material,'dispose');
    drawing.setArt(next); released.forEach(dispose => expect(dispose).toHaveBeenCalledOnce());
    expect(materialDisposed).toHaveBeenCalledOnce(); expect(borrowed).not.toHaveBeenCalled();
    expect(postAt(drawing,next,wallFrame(3),2)).toHaveLength(1);
    const current = [...drawing.root.children], finalGeometry = current.map(mesh => vi.spyOn(mesh.geometry,'dispose'));
    const finalMaterial = vi.spyOn(current[0].material,'dispose');
    drawing.dispose(); drawing.dispose(); drawing.select('b'); drawing.show([wall('late',0)]);
    finalGeometry.forEach(dispose => expect(dispose).toHaveBeenCalledOnce());
    expect(finalMaterial).toHaveBeenCalledOnce(); expect(owned).toHaveBeenCalledOnce(); expect(root.children).toHaveLength(0);
  });

  it.each(['missing','',null,undefined])('clears or ignores invalid selection %j without a foreground copy', id => {
    const root = new THREE.Group(), drawing = makeWallConnections(root), art = atlas(); drawing.setArt(art);
    const rows = [wall('a',0),wall('b',2),wall('c',4)]; drawing.show(rows); const original = buffers(drawing);
    drawing.select('b'); drawing.select(id);
    expect(obsoleteOverlay(root)).toBeUndefined(); expect(buffers(drawing)).toEqual(original); drawing.dispose();
  });

  it.each([[],[{...wall('a',0),built:false}],[{...wall('a',0),kind:'house'}],[{...wall('a',0),x:NaN}]].map(rows => ({rows})))('removes obsolete normal buffers for unbuilt/invalid state $rows', ({rows}) => {
    const root = new THREE.Group(), drawing = makeWallConnections(root); drawing.setArt(atlas());
    drawing.show([wall('a',0)]); drawing.select('a');
    const released = drawing.root.children.map(mesh => vi.spyOn(mesh.geometry,'dispose'));
    drawing.show(rows); released.forEach(dispose => expect(dispose).toHaveBeenCalledOnce());
    expect(drawing.posts).toEqual([]); expect(drawing.root.children).toHaveLength(0);
    expect(obsoleteOverlay(root)).toBeUndefined(); drawing.dispose();
  });

  it('does not invent a fallback pose when the accepted atlas lacks the current frame', () => {
    const root = new THREE.Group(), drawing = makeWallConnections(root); drawing.setArt(atlas());
    drawing.show([wall('a',0)]); drawing.select('a'); drawing.setArt({...atlas(),rects:{}});
    expect(drawing.root.children).toHaveLength(0); expect(obsoleteOverlay(root)).toBeUndefined(); drawing.dispose();
  });
});

it('the actual world reuses its one tile bracket through selection, Move, Close, visitor and battle lifecycle', async () => {
  const place = {group:new THREE.Group(),colliders:[],zones:[]}; let anchor = {spotId:'wall_13',x:-4,z:-17.5};
  const drawing = decorateIsland(place,{reducedMotion:true,loadArt:()=>new Promise(()=>{}),loadWallAtlas:async()=>atlas(),selection:()=>anchor});
  const rows = [wall('wall_13',-4,-17.5)]; drawing.apply({spots:rows}); await drawing.retryWallArt(); drawing.update(0);
  const bracket = drawing.root.getObjectByName('island-selection-bracket');
  expect(bracket.visible).toBe(true); expect(bracket.userData.spotId).toBe('wall_13');
  expect(drawing.root.getObjectsByProperty('name','island-selection-bracket')).toHaveLength(1);
  expect(bracket.children.every(mesh=>!mesh.material.map)).toBe(true);
  expect(obsoleteOverlay(drawing.root)).toBeUndefined(); const zones = place.zones, colliders = [...place.colliders];
  drawing.preview({spotId:'wall_13',x:-2,z:-17.5,size:2,ok:true}); drawing.update(0); expect(bracket.visible).toBe(false);
  drawing.preview(null); drawing.update(0); expect(bracket.visible).toBe(true);
  anchor = null; drawing.update(0); expect(bracket.visible).toBe(false);
  anchor = {spotId:'wall_13',x:-4,z:-17.5}; drawing.update(0); expect(bracket.visible).toBe(true);
  expect(place.zones).toEqual(zones); expect(place.colliders).toEqual(colliders);
  for (const state of [{spots:rows,visitor:true},{spots:rows,battle:true},{spots:rows},{spots:[]}]) {
    drawing.apply(state); const zones = JSON.stringify(place.zones), colliders = JSON.stringify(place.colliders);
    drawing.update(0); expect(obsoleteOverlay(drawing.root)).toBeUndefined();
    expect(JSON.stringify(place.zones)).toBe(zones); expect(JSON.stringify(place.colliders)).toBe(colliders);
  }
  const resources = bracket.children.map(mesh=>({geometry:vi.spyOn(mesh.geometry,'dispose'),material:vi.spyOn(mesh.material,'dispose')}));
  drawing.dispose(); resources.forEach(({geometry,material})=>{expect(geometry).toHaveBeenCalledOnce();expect(material).toHaveBeenCalledOnce();});
});
