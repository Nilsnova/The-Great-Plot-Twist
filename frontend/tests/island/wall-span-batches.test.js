// Verify D064 positions against an independent endpoint reference and retain original topology/color/index receipts.
import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {makeWallConnections} from '../../src/island/wall-connections.js';
import {referenceWallLayers} from '../fixtures/wall-span-reference.js';
const ring=JSON.parse(readFileSync(new URL('../fixtures/perimeter-ring.json',import.meta.url),'utf8')).cells;
const parity=JSON.parse(readFileSync(new URL('../fixtures/wall-span-parity.json',import.meta.url),'utf8'));
const rows=()=>ring.map(([x,z],i)=>({id:`wall_${i+1}`,x,z,kind:'wall',built:true,level:i%5+1}));
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function check(group,drawing,expected){
  expect(drawing.links).toHaveLength(expected.links);expect(digest(drawing.links)).toBe(expected.linksSha256);
  expect(group.children).toHaveLength(expected.layers.length);
  expect(new Set(group.children.map(mesh=>mesh.material)).size).toBe(1);
  const reference=referenceWallLayers(drawing.links),legacy=referenceWallLayers(drawing.links,true);
  const actual=[...group.children].sort((a,b)=>a.renderOrder-b.renderOrder);
  expected.layers.forEach((layer,i)=>{
    const mesh=actual[i],geometry=mesh.geometry;
    expect(mesh.renderOrder).toBe(layer.order);expect(mesh.frustumCulled).toBe(false);
    expect(geometry.groups).toHaveLength(0);expect(geometry.getAttribute('position').count).toBe(layer.vertices);expect(geometry.index.count).toBe(layer.indices);
    expect(digest(legacy.get(layer.order))).toBe(layer.legacyPositionsSha256); // Retain the b1755351 receipt.
    expect(digest(reference.get(layer.order))).toBe(layer.positionsSha256); // Derived without runtime drawing code.
    expect(Array.from(geometry.getAttribute('position').array)).toEqual(reference.get(layer.order));
    expect(digest(Array.from(geometry.getAttribute('color').array))).toBe(layer.colorsSha256);
    expect(digest(Array.from(geometry.index.array))).toBe(layer.indicesSha256);
    expect(mesh.material.transparent).toBe(true);expect(mesh.material.depthTest).toBe(false);expect(mesh.material.depthWrite).toBe(false);
  });
}
describe('painter-layer wall batches',()=>{
  it('derives both ground axes and keeps top height separate from depth compression',()=>{
    const horizontal={x0:0,z0:0,x1:2,z1:0,level:1},vertical={x0:0,z0:0,x1:0,z1:2,level:3};
    const flat=referenceWallLayers([horizontal]).get(99.98),deep=referenceWallLayers([vertical]).get(100.98);
    // Horizontal top: logical(0,-.28,height.95) => display(-.056,1.118).
    expect(flat[0]).toBeCloseTo(-.056,6);expect(flat[1]).toBeCloseTo(1.118,6);
    // Vertical top: logical(-.28,0,height1.45) => display(-.364,1.45).
    expect(deep[0]).toBeCloseTo(-.364,6);expect(deep[1]).toBeCloseTo(1.45,6);
    expect(deep[4]-deep[1]).toBeCloseTo(0,6);expect(deep[7]-deep[1]).toBeCloseTo(-1.2,6);
  });
  it('draws 106 logical joins in 36 meshes with independently projected positions and original colors/indices/order',()=>{
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
