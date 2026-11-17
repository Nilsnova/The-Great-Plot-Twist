// Independent visual contracts for regular buttresses and selected posts; gameplay inputs stay untouched.
import {describe, expect, it} from 'vitest';
import * as THREE from 'three';
import {texturedWallBatches, wallVisualRows} from '../../src/island/wall-batches.js';
import {makeWallConnections, wallTopology} from '../../src/island/wall-connections.js';
import {makeCombatWallConnections} from '../../src/pirates/wall-connections.js';
import {WALL_ATLAS_IDS, frames, wallFrame} from '../../src/art/village/walls.js';
const wall = (id, x, z = 0, level = 3) => ({id, x, z, level, kind: 'wall', built: true});
const atlas = () => ({texture: new THREE.Texture(), width: 512, height: 512, ownsTexture: false,
  rects: Object.fromEntries(WALL_ATLAS_IDS.map((id, i) => [id,
    {x: i % 8 * 60, y: Math.floor(i / 8) * 50, w: frames[id].logical[0], h: frames[id].logical[1], anchor: frames[id].logical[2]}]))});
const draw = (rows, art, selectedId = null) => texturedWallBatches(wallTopology(rows).links, wallVisualRows(rows), art, selectedId);
function quads(layers) {
  return [...layers.values()].flatMap(batch => Array.from({length: batch.positions.length / 12}, (_, i) => ({
    positions: batch.positions.slice(i * 12, i * 12 + 12), uvs: batch.uvs.slice(i * 8, i * 8 + 8),
  })));
}
function frameUV(art, id) {
  const {x, y, w, h} = art.rects[id];
  return [(x+.5)/512,1-(y+h-.5)/512,(x+w-.5)/512,1-(y+h-.5)/512,
    (x+w-.5)/512,1-(y+.5)/512,(x+.5)/512,1-(y+.5)/512];
}
const posts = (layers, art, id) => quads(layers).filter(quad => JSON.stringify(quad.uvs) === JSON.stringify(frameUV(art, id)));

describe('connected wall tier detail', () => {
  it.each([1,2,3,4,5])('shows the full actual level %i post when selecting a non-buttress straight segment', level => {
    const art = atlas(), rows = [wall('a',0,0,level),wall('b',2,0,level),wall('c',4,0,level)];
    const before = structuredClone(rows), layers = draw(rows, art, 'b');
    const actual = posts(layers, art, wallFrame(level)); expect(actual).toHaveLength(1);
    expect(actual[0].positions).toEqual([1.475,-.375,0,3.725,-.375,0,3.725,1.625,0,1.475,1.625,0].map(value=>expect.closeTo(value,10)));
    expect(quads(layers)).toHaveLength(9); expect(rows).toEqual(before);
    expect([...layers.keys()].sort((a,b)=>a-b)).toEqual([99.98,100]); art.texture.dispose();
  });

  it.each(['horizontal','vertical'])('retains sparse coordinate-based buttresses on %s runs after reordering and renaming', axis => {
    const art = atlas(), rows = Array.from({length:9},(_,i)=>wall(`id-${i}`,axis==='horizontal'?(i-4)*2:0,axis==='vertical'?(i-4)*2:0));
    const layers = draw(rows, art), actual = posts(layers, art, wallFrame(3));
    // Nine pieces retain five full posts: both ends and the fixed -6, 0, +6 buttresses.
    expect(actual).toHaveLength(5);
    const centres = actual.map(({positions:p}) => (p[0]+p[3])/2);
    expect(centres).toEqual((axis==='horizontal'?[-10.4,-7.8,0,7.8,10.4]:[-1.6,-1.2,0,1.2,1.6]).map(value=>expect.closeTo(value,10)));
    expect(draw([...rows].reverse(),art)).toEqual(layers);
    const renamed = rows.map((row,i)=>({...row,id:`renamed-${8-i}`}));
    expect(posts(draw(renamed,art),art,wallFrame(3)).map(row=>row.positions).sort()).toEqual(actual.map(row=>row.positions).sort());
    const root = new THREE.Group(), drawing = makeWallConnections(root); drawing.setArt(art); drawing.show(rows);
    expect(drawing.root.children).toHaveLength(axis==='horizontal'?2:17);
    expect(new Set(drawing.root.children.map(mesh=>mesh.material)).size).toBe(1);
    drawing.dispose(); art.texture.dispose();
  });

  it('keeps corners, branches, mixed tiers and damaged posts full, without closing broken joins', () => {
    const art = atlas();
    const cases = [
      [wall('a',0),wall('b',2),wall('c',2,2)],
      [wall('a',0),wall('b',2),wall('c',4),wall('d',2,2)],
      [wall('a',0,0,2),wall('b',2),wall('c',4,0,4)],
      [wall('a',0),{...wall('b',2),look:'damaged'},wall('c',4)],
    ];
    cases.forEach((rows,index)=>expect(posts(draw(rows,art),art,wallFrame(3,index===3?'damaged':'intact'))
      .some(({positions:p})=>Math.abs((p[0]+p[3])/2-2.6)<1e-10)).toBe(true));
    const rows = [wall('a',0,0,5),{...wall('b',2,0,5),hp:0},wall('c',4,0,5)];
    expect(wallTopology(rows).links).toEqual([]);
    expect(posts(draw(rows,art),art,wallFrame(5,'broken'))).toHaveLength(1);
    expect(quads(draw(rows,art,'b'))).toHaveLength(1);
    const mixed=wallTopology([wall('a',0,0,5),wall('b',2,0,2)]).links;
    expect(mixed.map(link=>link.level)).toEqual([2]); art.texture.dispose();
  });

  it('keeps actual village and combat wall buffers identical at every tier and accepted damage state', () => {
    const art=atlas();
    for(const level of [1,2,3,4,5]) for(const [look,hp] of [['intact',100],['damaged',40],['broken',0]]) {
      const rows=[wall('a',0,0,level),wall('b',2,0,level),wall('c',4,0,level)];
      const root=new THREE.Group(), world=makeWallConnections(root), battle=makeCombatWallConnections(root,art);
      world.setArt(art); world.show(rows.map(row=>({...row,look,hp})));
      battle.show(rows,rows.map(({id})=>({id,hp,maxHp:100})));
      const buffers=group=>{const result=[];group.traverse(mesh=>{if(mesh.geometry)result.push([mesh.renderOrder,
        Array.from(mesh.geometry.attributes.position.array),Array.from(mesh.geometry.attributes.uv.array),Array.from(mesh.geometry.index.array)]);});return result;};
      expect(buffers(battle.root??root.getObjectByName('pirates:wall-connections'))).toEqual(buffers(world.root));
      world.dispose();battle.dispose();
    }
    art.texture.dispose();
  });
});
