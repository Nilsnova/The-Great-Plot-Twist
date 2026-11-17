// D064: the wide projected island uses measured desktop Work; phone Work retains a pannable district.
import {describe,expect,it} from 'vitest';
import * as THREE from 'three';
import {createCamera,villageFrame} from '../../src/player/camera.js';
import {worldViewport} from '../../src/pixel/display.js';
import {projectPoint} from '../../src/world/art.js';
import {unprojectGround} from '../../src/world/projection.js';
const captain={x:12,z:-8},district={x:-4,z:-4};
function setup(width=1280,height=720){
  const input={pointer:{wheel:0},held:new Set()},view=createCamera(input),viewport={height,top:width<640?180:92,bottom:width<640?112:124};
  Object.assign(view.camera,worldViewport(width,height,22,16));view.camera.updateProjectionMatrix();view.setPlace('home_islet',captain);view.start(true);
  return{view,input,viewport,width,height};
}
function screen(t,{x,z,lift=0}){
  const p=projectPoint(x,z);t.view.camera.updateMatrixWorld();
  const v=new THREE.Vector3(p.x,p.y+lift,0).project(t.view.camera);return{x:(v.x+1)*t.width/2,y:(1-v.y)*t.height/2};
}
const state=view=>({position:view.camera.position.clone(),zoom:view.camera.zoom});
describe('approved village working composition',()=>{
  it.each([[1280,720,60],[375,812,68]])('opens a readable district at %s×%s while preserving the captain', (width,height,minimumCannon)=>{
    const t=setup(width,height),before={...captain};t.view.setVillageView(true,t.viewport);t.view.update(.05,captain);
    const frame=villageFrame(t.view.camera,'home_islet',t.viewport);
    expect(t.view.camera.zoom).toBeCloseTo(width<640?.9:frame.zoom*1.05);expect(captain).toEqual(before);
    const p=width<640?projectPoint(district.x,district.z):{x:frame.centerX,y:frame.centerY};
    t.view.camera.updateMatrixWorld();const center=new THREE.Vector3(p.x,p.y,0).project(t.view.camera);
    if(width>=640){const landWidth=(frame.bounds.maxX-frame.bounds.minX)*t.view.camera.zoom/(t.view.camera.right-t.view.camera.left);
      expect(landWidth).toBeGreaterThan(.75);expect(landWidth).toBeLessThan(.9);}
    expect((center.x+1)*width/2).toBeCloseTo(width/2,10);expect((1-center.y)*height/2).toBeCloseTo((t.viewport.top+height-t.viewport.bottom)/2,10);
    expect(screen(t,{x:1.5,z:0}).x-screen(t,{x:-1.5,z:0}).x).toBeGreaterThanOrEqual(minimumCannon);
  });
  it.each([[1280,720],[375,812]])('retains absolute working zoom and district center through real panel reflow at %s×%s', (width,height)=>{
    const t=setup(width,height);t.view.setVillageView(true,t.viewport);t.view.villageControl('in');t.view.panVillage(70,40,width,height);t.view.update(.05,captain);
    const before=state(t.view),oldCenter=screen(t,district),relative=oldCenter.y-(t.viewport.top+height-t.viewport.bottom)/2;
    for(const bottom of [335,516,112]){
      const viewport={...t.viewport,bottom};if(viewport.top+bottom>=height)continue;
      t.view.setVillageView(true,viewport);t.view.update(.05,captain);
      expect(t.view.camera.zoom).toBe(before.zoom);expect(t.view.camera.position.x).toBe(before.position.x);
      expect(screen(t,district).y-(viewport.top+height-bottom)/2).toBeCloseTo(relative,10);
    }
  });
  it.each([[1280,720],[375,812]])('keeps exact Fit/Tab and restores the saved working state at %s×%s', (width,height)=>{
    const t=setup(width,height);t.view.setVillageView(true,t.viewport);t.view.villageControl('in');t.view.panVillage(-70,40,width,height);t.view.update(.05,captain);
    const working=state(t.view),fit=villageFrame(t.view.camera,'home_islet',t.viewport);
    t.input.held.add('Tab');t.view.update(.05,captain);expect(t.view.camera.zoom).toBe(fit.zoom);expect(t.view.camera.position.x).toBe(fit.x);expect(t.view.camera.position.y).toBe(fit.y);
    t.input.held.delete('Tab');t.view.update(.05,captain);expect(state(t.view)).toEqual(working);
    t.view.villageControl('fit');t.view.update(.05,captain);expect(t.view.camera.zoom).toBe(fit.zoom);expect(t.view.camera.position.y).toBe(fit.y);
    t.view.villageControl('work');t.view.update(.05,captain);expect(t.view.camera.zoom).toBeCloseTo(width<640?.9:fit.zoom*1.05);
    expect(t.view.camera.position.x).toBeCloseTo(width<640?projectPoint(district.x,district.z).x:fit.x,10);
  });
  it.each([[1280,720],[375,812]])('makes remote logical anchors reachable without moving them or refocusing visible anchors at %s×%s', (width,height)=>{
    const t=setup(width,height);t.viewport.bottom=335;t.view.setVillageView(true,t.viewport);t.view.update(.05,captain);
    for(const anchor of [{x:-8,z:6,lift:2.6},{x:13,z:-15,lift:2},{x:15.5,z:14,lift:2},{x:-18.5,z:2,lift:1},{x:0,z:-14,lift:4.6}]){
      const original={...anchor};t.view.focusVillage(anchor);t.view.update(.05,captain);const p=screen(t,anchor);
      expect(p.x).toBeGreaterThan(0);expect(p.x).toBeLessThan(width);expect(p.y).toBeGreaterThan(t.viewport.top);expect(p.y).toBeLessThan(height-t.viewport.bottom);
      const foot=screen(t,{x:anchor.x,z:anchor.z}),picked=new THREE.Vector3(foot.x/width*2-1,1-foot.y/height*2,0).unproject(t.view.camera);
      const logical=unprojectGround(picked.x,picked.y);expect(logical.x).toBeCloseTo(anchor.x,10);expect(logical.z).toBeCloseTo(anchor.z,10);
      expect(anchor).toEqual(original);const focused=state(t.view);expect(t.view.focusVillage(anchor)).toBe(false);t.view.update(.05,captain);expect(state(t.view)).toEqual(focused);
    }
  });
  it('ignores invalid, inactive, obstructed, battle and tour focus requests and restores exploration zoom',()=>{
    const t=setup();expect(t.view.focusVillage({x:0,z:0})).toBe(false);
    t.input.pointer.wheel=-400;t.view.update(.05,captain);t.input.pointer.wheel=0;
    t.view.setVillageView(true,t.viewport);t.view.update(.05,captain);const before=state(t.view);
    for(const anchor of [null,{x:NaN,z:2},{x:2,z:Infinity},{x:2,z:2,lift:NaN}])expect(t.view.focusVillage(anchor)).toBe(false);
    t.view.camera.userData.battleZoom=.7;expect(t.view.focusVillage({x:18,z:12})).toBe(false);delete t.view.camera.userData.battleZoom;
    t.view.camera.userData.tour={x:8,z:4};expect(t.view.focusVillage({x:18,z:12})).toBe(false);delete t.view.camera.userData.tour;
    t.view.setVillageView(true,{height:720,top:300,bottom:500});expect(t.view.focusVillage({x:18,z:12})).toBe(false);t.view.update(.05,captain);expect(state(t.view)).toEqual(before);
    t.view.setVillageView(false);t.view.update(.05,captain);expect(t.view.camera.zoom).toBe(1.4);expect(t.view.camera.position.x).toBe(projectPoint(captain.x,captain.z).x);
  });
});
