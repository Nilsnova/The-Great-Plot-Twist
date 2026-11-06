// Regressions for useful framebuffer density and continuous, responsive logical movement.
import * as THREE from 'three';
import {describe,expect,it,vi} from 'vitest';
import {pixelViewport,worldViewport} from '../src/pixel/display.js';
import {createCamera} from '../src/player/camera.js';
import {createCharacter} from '../src/player/character.js';
import {createController} from '../src/player/controller.js';
import {artSizes} from '../src/world/art.js';
function walker({forward=0,right=1,running=false,colliders=[]}={}) {
  const character={group:new THREE.Object3D(),face:vi.fn(),animate:vi.fn()};
  const input={held:new Set(running?['ShiftLeft']:[]),axis:keys=>keys.includes('KeyW')?forward:right};
  const controller=createController(character,input,colliders);
  controller.setPlace({colliders,groundHeight:()=>1,spawn:[0,0]});return {controller,character,input};
}
describe('higher framebuffer density with stable logical framing',()=>{
  it('draws over nine times the old native desktop pixel area',()=>{
    const view=pixelViewport(1280,720),oldArea=Math.floor(1280/3)*Math.floor(720/3);
    expect(view.drawingWidth*view.drawingHeight/oldArea).toBeGreaterThan(9);
    expect(view).toMatchObject({width:1280,height:720,scale:1,pixelRatio:1});
  });
  it.each([[1280,720,2],[1920,1080,3],[3840,2160,2],[375,812,3],[320,640,1]])('bounds GPU pixels at %s×%s DPR%s',(width,height,pixelRatio)=>{
    const high=pixelViewport(width,height,{pixelRatio}),low=pixelViewport(width,height,{pixelRatio,quality:'low'});
    expect(high.pixelRatio).toBeLessThanOrEqual(1.5);
    expect(high.drawingWidth*high.drawingHeight).toBeLessThanOrEqual(1920*1080);
    expect(low.drawingWidth*low.drawingHeight).toBeLessThanOrEqual(1280*720);
    expect(low.drawingWidth*low.drawingHeight).toBeLessThanOrEqual(high.drawingWidth*high.drawingHeight);
    expect(high.width).toBe(low.width);expect(high.height).toBe(low.height);
  });
  it('uses CSS aspect and keeps portrait world width useful',()=>{
    const desktop=worldViewport(1280,720),phone=worldViewport(375,812);
    expect(desktop.top-desktop.bottom).toBe(20);expect(desktop.right-desktop.left).toBeCloseTo(20*1280/720);
    expect(phone.right-phone.left).toBeCloseTo(16);
    expect((phone.right-phone.left)/(phone.top-phone.bottom)).toBeCloseTo(375/812);
    expect(pixelViewport(NaN,Infinity)).toMatchObject({width:1,height:1});
  });
});
describe('responsive continuous explorer',()=>{
  it('starts on the first frame and stops on release or blocking',()=>{
    const {controller,character,input}=walker();expect(controller.update(1/60,true)).toBeCloseTo(3.2);
    expect(controller.player.position.x).toBeCloseTo(3.2/60);
    const before=controller.player.position.clone();input.axis=()=>0;expect(controller.update(1/60,true)).toBe(0);
    expect(controller.player.position.equals(before)).toBe(true);input.axis=()=>1;controller.update(1/60,false);
    expect(controller.player.position.equals(before)).toBe(true);expect(character.animate).toHaveBeenLastCalledWith(1/60,0);
  });
  it('travels equally at 20, 30, 60 and 144 fps',()=>{
    for(const frames of [20,30,60,144]){const {controller}=walker();for(let i=0;i<frames;i++)controller.update(1/frames,true);expect(controller.player.position.x).toBeCloseTo(3.2,9);}
  });
  it('normalizes diagonals and preserves analogue strength',()=>{
    const a=walker(),d=walker({forward:1}),h=walker({right:.5});
    for(const {controller} of [a,d,h])controller.update(.1,true);
    expect(Math.hypot(d.controller.player.position.x,d.controller.player.position.z)).toBeCloseTo(a.controller.player.position.x);
    expect(h.controller.player.position.x).toBeCloseTo(a.controller.player.position.x/2);
  });
  it('cannot tunnel through a thin wall on a stalled frame',()=>{
    const {controller}=walker({running:true,colliders:[{x:.7,z:0,width:.1,depth:3}]});controller.update(5,true);
    expect(controller.player.position.x).toBeGreaterThan(0);expect(controller.player.position.x).toBeLessThan(.7-.05-.34);
  });
  it.each([NaN,Infinity,-1])('ignores invalid duration %s',delta=>{
    const {controller}=walker(),before=controller.player.position.clone();expect(controller.update(delta,true)).toBe(0);expect(controller.player.position.equals(before)).toBe(true);
  });
  it('preserves subpixel sprite motion',()=>{
    const art=Object.fromEntries(Object.keys(artSizes).map(name=>[name,new THREE.MeshBasicMaterial()]));
    const character=createCharacter(art,{reducedMotion:true});character.group.position.set(.0123,1,.0234);character.animate(1/60,3.2);
    expect(character.sprite.position.x).toBeCloseTo(.0123,10);expect(character.sprite.position.y).toBeCloseTo(-.0234*.72,10);
    character.group.position.x+=.001;character.animate(1/60,3.2);expect(character.sprite.position.x).toBeCloseTo(.0133,10);
    Object.values(art).forEach(material=>material.dispose());character.sprite.geometry.dispose();
  });
});
describe('continuous camera follow and zoom',()=>{
  it('follows movements previously rounded to zero',()=>{
    const view=createCamera({pointer:{wheel:0}});view.setPlace('home_islet',{x:0,z:0});view.start();view.update(1/60,{x:.02,z:0});
    expect(view.camera.position.x).toBeGreaterThan(0);expect(view.camera.position.x).toBeLessThan(.02);expect(Number.isInteger(view.camera.position.x*16)).toBe(false);
  });
  it('follows frame independently while preserving orientation',()=>{
    const positions=[20,30,60,144].map(frames=>{const view=createCamera({pointer:{wheel:0}});view.setPlace('home_islet',{x:0,z:0});view.start();const q=view.camera.quaternion.clone();
      for(let i=0;i<frames;i++)view.update(1/frames,{x:3,z:0});expect(view.camera.quaternion.equals(q)).toBe(true);return view.camera.position.x;});
    for(const x of positions)expect(x).toBeCloseTo(positions[0],10);
  });
  it('smooths wheel zoom and honors reduced motion',()=>{
    const input={pointer:{wheel:-120}},view=createCamera(input);view.start();view.update(1/60,{x:0,z:0});
    expect(view.camera.zoom).toBeGreaterThan(1);expect(view.camera.zoom).toBeLessThan(1.12);input.pointer.wheel=0;view.start(true);view.update(1/60,{x:.1234,z:0});
    expect(view.camera.position.x).toBeCloseTo(.1234,12);expect(view.camera.zoom).toBeCloseTo(1.12);view.overview();expect(view.camera.zoom).toBe(1);
  });
});
