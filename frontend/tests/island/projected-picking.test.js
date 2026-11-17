import {describe,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {decorateIsland} from '../../src/island/world.js';
import {projectGround,unprojectGround} from '../../src/world/projection.js';
vi.mock('../../src/art/textures.js',async()=>{const T=await import('three');return{frameCanvas:()=>({}),smoothTexture:()=>new T.Texture(),spriteMaterial:map=>new T.MeshBasicMaterial({map})};});
vi.mock('../../src/island/structure-recovery-indicators.js',()=>({createStructureRecoveryIndicators:()=>({setState(){},update(){},dispose(){}})}));
function setup(placing=false,anchor={x:7.5,z:-.5}){
  const events=new Map(),onGround=vi.fn(),onPick=vi.fn(),camera=new THREE.OrthographicCamera(-32,32,24,-24,1,50);
  camera.position.z=10;camera.updateMatrixWorld();const rect={left:13,top:21,width:640,height:480};
  const canvas={addEventListener:(key,fn)=>events.set(key,fn),removeEventListener:key=>events.delete(key),getBoundingClientRect:()=>rect};
  const spot={id:'cannon_1',kind:'cannon',slot:'tower',...anchor},place={group:new THREE.Group(),colliders:[],zones:[]};
  const drawing=decorateIsland(place,{canvas,camera,onGround,onPick,placing:()=>placing,isActive:()=>true,canPickRemote:()=>true,
    loadArt:()=>new Promise(()=>{}),layout:{spots:[spot],zones:()=>[],bell:false,cabin:false}});
  return{drawing,spot,onGround,onPick,tap(displayed){const v=new THREE.Vector3(displayed.x,displayed.y,0).project(camera),event={button:0,clientX:rect.left+(v.x+1)*rect.width/2,clientY:rect.top+(1-v.y)*rect.height/2};events.get('pointerdown')(event);events.get('pointerup')(event);}};
}
describe('projected village pointer input',()=>{
  it('rejects the obsolete native cannon pointer while the shared projection reaches that same saved anchor',()=>{
    const t=setup(false,{x:-12.5,z:-14.5});
    t.tap({x:-12.5,y:14.5*.72+.7});expect(t.onPick).not.toHaveBeenCalled();
    const foot=projectGround(t.spot.x,t.spot.z);t.tap({x:foot.x,y:foot.y+.7});
    expect(t.onPick).toHaveBeenCalledExactlyOnceWith('cannon_1');t.drawing.dispose();
  });
  it('inverts a real canvas tap to the same half-grid cell while moving',()=>{
    const t=setup(true);t.tap(projectGround(12.5,-8.5));expect(t.onGround).toHaveBeenCalledOnce();
    expect(t.onGround.mock.calls[0][0]).toBeCloseTo(12.5,10);expect(t.onGround.mock.calls[0][1]).toBeCloseTo(-8.5,10);expect(t.onPick).not.toHaveBeenCalled();t.drawing.dispose();
  });
  it('picks upright visible artwork above its foot without shearing its click box',()=>{
    const t=setup(),foot=projectGround(t.spot.x,t.spot.z),inside={x:foot.x+2.2,y:foot.y+2.9},outside={x:foot.x+2.6,y:foot.y+2.9};
    t.tap(inside);expect(t.onPick).toHaveBeenCalledWith(t.spot.id);const logical=unprojectGround(outside.x,outside.y);
    expect(t.drawing.pickAt(logical.x,logical.z)).toBeNull();t.drawing.dispose();
  });
});
