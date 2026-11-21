// Real Three.js buffers/matrices prove the shared display transform rather than a second formula fixture.
import {describe,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {groundGeometry,legacyBackdrop,coastUvMatrix} from '../../src/world/ground-transform.js';
import {projectGround,unprojectGround,LEGACY_DEPTH} from '../../src/world/projection.js';
import {backdrop} from '../../src/world/places/resources.js';
import {createPixelTerrain} from '../../src/pixel/terrain.js';
import {makeFootprint,makeWallLanes} from '../../src/island/move-preview.js';
import {createLightPools, homeVillageLights} from '../../src/world/light-pools.js';
import {makeSelectionBracket} from '../../src/island/selection-bracket.js';

describe('projected ground buffers and coast sampling',()=>{
  it('keeps both real backdrop paths and upright feet on exactly one affine surface',()=>{
    const group=new THREE.Group(),texture=new THREE.Texture(),cartoon=backdrop(group,texture),pixel=createPixelTerrain(texture);
    for(const mesh of [cartoon,pixel]){
      mesh.updateMatrixWorld(true);expect(mesh.matrixAutoUpdate).toBe(false);
      for(const [x,z]of[[-20,-22],[20,22],[7.5,-.5]]){
        const actual=mesh.localToWorld(new THREE.Vector3(x,-z*LEGACY_DEPTH,0)),foot=projectGround(x,z);
        expect(actual.x).toBeCloseTo(foot.x,10);expect(actual.y).toBeCloseTo(foot.y,10);
      }
      expect(mesh.geometry.parameters).toMatchObject({width:64,height:48});
    }
  });
  it('uses the complete inverse for coast UVs under shear, translation and parent scale',()=>{
    const mesh=legacyBackdrop(new THREE.Mesh(new THREE.PlaneGeometry(64,48))),group=new THREE.Group();
    group.position.set(13,-7,0);group.scale.set(1.2,.8,1);group.add(mesh);group.updateMatrixWorld(true);
    const uv=coastUvMatrix(mesh.matrixWorld);
    for(const [x,y]of[[-32,-24],[32,24],[0,0],[7,-13]]){
      const actual=mesh.localToWorld(new THREE.Vector3(x,y,0));actual.z=1;actual.applyMatrix3(uv);
      expect(actual.x).toBeCloseTo(x/64+.5,10);expect(actual.y).toBeCloseTo(y/48+.5,10);
    }
    expect(()=>coastUvMatrix(new THREE.Matrix4().makeScale(0,1,1))).toThrow('Invalid ground transform');
  });
  it('projects every move/lane vertex while retaining positive winding and the real footprint size',()=>{
    const root=new THREE.Group(),preview=makeFootprint(root);preview.show({x:7.5,z:-.5,size:2,ok:true});root.updateMatrixWorld(true);
    const mesh=root.getObjectByName('island-move-footprint'),vertices=mesh.geometry.attributes.position;
    for(let i=0;i<vertices.count;i++){
      const displayed=new THREE.Vector3().fromBufferAttribute(vertices,i).applyMatrix4(mesh.matrixWorld),logical=unprojectGround(displayed.x,displayed.y);
      expect(Math.abs(logical.x-7.5)).toBeCloseTo(1,6);expect(Math.abs(logical.z+.5)).toBeCloseTo(1,6);
    }
    const rim=root.getObjectByName('island-move-footprint-rim'), validColour=rim.material.color.getHex();
    const rimEdges=Array.from({length:rim.geometry.attributes.position.count},(_,i)=>{
      const p=new THREE.Vector3().fromBufferAttribute(rim.geometry.attributes.position,i).applyMatrix4(rim.matrixWorld);
      return Math.abs(unprojectGround(p.x,p.y).x-7.5);
    });
    expect((Math.min(...rimEdges)+Math.max(...rimEdges))/2).toBeCloseTo(1,6);
    preview.show({x:7.5,z:-.5,size:2,ok:false});
    expect(rim.material.color.getHex()).not.toBe(validColour);
    expect(preview.shown).toEqual({x:7.5,z:-.5,size:2,ok:false});
    makeWallLanes(root,[[2,-1,1]]);const lane=root.getObjectByName('island-wall-lanes'),p=lane.geometry.attributes.position;
    expect([...lane.geometry.index.array]).toEqual([0,1,2,0,2,3]);
    for(const [i,expected]of[[-1.25,2.25],[1.25,2.25],[1.25,1.75],[-1.25,1.75]].entries()){
      const actual=unprojectGround(p.getX(i),p.getY(i));expect(actual.x).toBeCloseTo(expected[0],6);expect(actual.z).toBeCloseTo(expected[1],6);
    }
    const geometry=groundGeometry(new THREE.PlaneGeometry(1,1));geometry.computeVertexNormals();expect(geometry.attributes.normal.getZ(0)).toBeGreaterThan(0);
  });
  it('projects a real ground light instance while keeping its upright halo proportions',()=>{
    const lights=createLightPools(new THREE.Scene()),matrix=new THREE.Matrix4();
    lights.extra('fixture',[{x:5,y:7,r:2,kind:0},{x:5,y:10,r:2,kind:1}]);
    lights.mesh.getMatrixAt(0,matrix);const ground=new THREE.Vector3(0,1,0).applyMatrix4(matrix);
    expect(ground.x).toBeCloseTo(4.6,6);expect(ground.y).toBeCloseTo(8.2,6);
    lights.mesh.getMatrixAt(1,matrix);const halo=new THREE.Vector3(0,1,0).applyMatrix4(matrix);
    expect(halo.x).toBe(5);expect(halo.y).toBe(12);lights.dispose();
  });
  it('updates Home light pools when a house moves and clears them on travel', () => {
    const lights = createLightPools(new THREE.Scene()), home = new THREE.Group();
    const house = {slot: 'house', x: 7, z: -6};
    const fixed = [{slot: 'island_bell', x: 8.5, z: 12}, {slot: 'watchtower', x: 0, z: -14, ruin: true}];
    home.userData.homeVillageLights = homeVillageLights([house, ...fixed]);
    lights.setPlace(home);
    expect(lights.pools).toBe(3);
    lights.update(0, 0);
    expect(lights.mesh.visible).toBe(false);
    lights.update(0, 1);
    expect(lights.mesh.visible).toBe(true);
    const matrix = new THREE.Matrix4();
    lights.mesh.getMatrixAt(0, matrix);
    const x = unprojectGround(matrix.elements[12], matrix.elements[13]).x;
    home.userData.homeVillageLights = homeVillageLights([{...house, x: 9}, ...fixed]);
    lights.update(1, 1);
    lights.mesh.getMatrixAt(0, matrix);
    expect(unprojectGround(matrix.elements[12], matrix.elements[13]).x).toBeCloseTo(x + 2);
    lights.setPlace(new THREE.Group());
    lights.update(2, 1);
    expect(lights.pools).toBe(0);
    expect(lights.mesh.visible).toBe(false);
    lights.dispose();
  });
  it('places and releases an independent selected bracket without creating Move state',()=>{
    const root=new THREE.Group(),bracket=makeSelectionBracket(root),mesh=root.children[0],dispose=vi.spyOn(mesh.children[0].geometry,'dispose');
    bracket.show({spotId:'wall_13',x:-4,z:-17.5});expect(mesh.visible).toBe(true);expect(mesh.userData.spotId).toBe('wall_13');
    const foot=projectGround(-4,-17.5);expect(mesh.position.x).toBe(foot.x);expect(mesh.position.y).toBe(foot.y);
    expect(mesh.children).toHaveLength(2);expect(mesh.children[1].geometry.attributes.position.count).toBe(32);expect(root.getObjectByName('island-move-footprint')).toBeUndefined();
    bracket.show(null);expect(mesh.visible).toBe(false);bracket.dispose();expect(dispose).toHaveBeenCalledOnce();expect(root.children).toEqual([]);
  });
});
