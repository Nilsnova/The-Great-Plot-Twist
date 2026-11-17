// Compare layer batches to the original per-span numeric buffers, and verify real topology/lifetime updates.
import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {makeWallConnections} from '../../src/island/wall-connections.js';
const ring=JSON.parse(readFileSync(new URL('../fixtures/perimeter-ring.json',import.meta.url),'utf8')).cells;
const parity=JSON.parse(readFileSync(new URL('../fixtures/wall-span-parity.json',import.meta.url),'utf8'));
const rows=()=>ring.map(([x,z],i)=>({id:`wall_${i+1}`,x,z,kind:'wall',built:true,level:i%5+1}));
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function check(group,drawing,expected){
  expect(drawing.links).toHaveLength(expected.links);expect(digest(drawing.links)).toBe(expected.linksSha256);
  expect(group.children).toHaveLength(expected.layers.length);
  expect(new Set(group.children.map(mesh=>mesh.material)).size).toBe(1);
  const actual=[...group.children].sort((a,b)=>a.renderOrder-b.renderOrder);
  expected.layers.forEach((layer,i)=>{
    const mesh=actual[i],geometry=mesh.geometry;
    expect(mesh.renderOrder).toBe(layer.order);expect(mesh.frustumCulled).toBe(false);
    expect(geometry.groups).toHaveLength(0);expect(geometry.getAttribute('position').count).toBe(layer.vertices);expect(geometry.index.count).toBe(layer.indices);
    expect(digest(Array.from(geometry.getAttribute('position').array))).toBe(layer.positionsSha256);
    expect(digest(Array.from(geometry.getAttribute('color').array))).toBe(layer.colorsSha256);
    expect(digest(Array.from(geometry.index.array))).toBe(layer.indicesSha256);
    expect(mesh.material.transparent).toBe(true);expect(mesh.material.depthTest).toBe(false);expect(mesh.material.depthWrite).toBe(false);
  });
}
describe('painter-layer wall batches',()=>{
  it('draws 106 logical joins in 36 meshes with exact original mixed-level positions/colors/indices/order',()=>{
    const root=new THREE.Group(),drawing=makeWallConnections(root);drawing.show(rows());
    check(root.getObjectByName('island-wall-connections'),drawing,parity.cases.healthy);drawing.dispose();
  });
  it('keeps logical inspection independent of draw objects and reuses unchanged topology',()=>{
    const root=new THREE.Group(),drawing=makeWallConnections(root),spots=rows();drawing.show(spots);
    const group=root.getObjectByName('island-wall-connections'),meshes=[...group.children],disposals=meshes.map(mesh=>vi.spyOn(mesh.geometry,'dispose'));
    expect(Object.getOwnPropertyDescriptor(group,'wallLinks').set).toBeUndefined();expect(group.wallLinks).toEqual(drawing.links);
    const inspected=group.wallLinks;inspected[0].a='changed';inspected.pop();expect(group.wallLinks).toEqual(drawing.links);
    drawing.show([...spots].reverse().map(row=>({...row,hp:1})));
    expect(group.children).toEqual(meshes);disposals.forEach(disposed=>expect(disposed).not.toHaveBeenCalled());drawing.dispose();
  });
  it('removes broken spans from actual batch buffers, restores them and disposes each allocation once',()=>{
    const root=new THREE.Group(),drawing=makeWallConnections(root),spots=rows();drawing.show(spots);
    const group=root.getObjectByName('island-wall-connections'),old=[...group.children],oldDisposals=old.map(mesh=>vi.spyOn(mesh.geometry,'dispose'));
    const material=old[0].material,materialDisposed=vi.spyOn(material,'dispose');
    drawing.show(spots.map((row,i)=>i===0?{...row,hp:0}:row));check(group,drawing,parity.cases.broken);
    expect(group.wallLinks.some(link=>link.a==='wall_1'||link.b==='wall_1')).toBe(false);
    oldDisposals.forEach(disposed=>expect(disposed).toHaveBeenCalledOnce());expect(materialDisposed).not.toHaveBeenCalled();
    const broken=[...group.children],brokenDisposals=broken.map(mesh=>vi.spyOn(mesh.geometry,'dispose'));
    drawing.show(spots);check(group,drawing,parity.cases.healthy);brokenDisposals.forEach(disposed=>expect(disposed).toHaveBeenCalledOnce());
    const restoredDisposals=group.children.map(mesh=>vi.spyOn(mesh.geometry,'dispose'));
    drawing.show([]);expect(group.children).toHaveLength(0);expect(group.wallLinks).toEqual([]);restoredDisposals.forEach(disposed=>expect(disposed).toHaveBeenCalledOnce());
    drawing.dispose();drawing.dispose();expect(materialDisposed).toHaveBeenCalledOnce();expect(root.children).toHaveLength(0);
    oldDisposals.forEach(disposed=>expect(disposed).toHaveBeenCalledOnce());
  });
});
