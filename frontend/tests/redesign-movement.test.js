// Regressions for useful framebuffer density and continuous, responsive logical movement.
import * as THREE from 'three';
import {describe,expect,it,vi} from 'vitest';
import {pixelViewport,worldViewport} from '../src/pixel/display.js';
import {createCamera} from '../src/player/camera.js';
import {createCharacter} from '../src/player/character.js';
import {createController,WALK_SPEED} from '../src/player/controller.js';
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
    expect(high.pixelRatio).toBeLessThanOrEqual(Math.min(pixelRatio, 4));
    expect(high.drawingWidth*high.drawingHeight).toBeLessThanOrEqual(3840*2160);
    expect(low.drawingWidth*low.drawingHeight).toBeLessThanOrEqual(1280*720);
    expect(low.drawingWidth*low.drawingHeight).toBeLessThanOrEqual(high.drawingWidth*high.drawingHeight);
    expect(high.width).toBe(low.width);expect(high.height).toBe(low.height);
  });
  it.each([[375,812],[390,844]])('uses every device pixel at %s×%s on a 3× phone in High', (width,height) => {
    const full = pixelViewport(width,height,{pixelRatio:3});
    expect(full).toMatchObject({pixelRatio:3,drawingWidth:width*3,drawingHeight:height*3});
    const low = pixelViewport(width,height,{pixelRatio:3,quality:'low'});
    expect(low).toMatchObject({pixelRatio:1,drawingWidth:width,drawingHeight:height});
  });
  it('keeps native desktop and denser phone displays within the UHD limit', () => {
    expect(pixelViewport(1280,720,{pixelRatio:2})).toMatchObject({pixelRatio:2,drawingWidth:2560,drawingHeight:1440});
    expect(pixelViewport(1920,1080,{pixelRatio:2})).toMatchObject({pixelRatio:2,drawingWidth:3840,drawingHeight:2160});
    expect(pixelViewport(375,812,{pixelRatio:4})).toMatchObject({pixelRatio:4,drawingWidth:1500,drawingHeight:3248});
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
  it('samples combat after movement and before drawing the same frame, including blocked movement',()=>{
    const {controller,character}=walker(),order=[];
    character.animate.mockImplementation(()=>order.push('draw'));
    controller.update(.1,true,()=>{expect(controller.player.position.x).toBeCloseTo(WALK_SPEED*.1);order.push('combat');});
    expect(order).toEqual(['combat','draw']);
    order.length=0;
    controller.update(.1,false,()=>{expect(controller.player.position.x).toBeCloseTo(WALK_SPEED*.1);order.push('combat');});
    expect(order).toEqual(['combat','draw']);
  });
  it('starts on the first frame and stops on release or blocking',()=>{
    const {controller,character,input}=walker();expect(controller.update(1/60,true)).toBeCloseTo(WALK_SPEED);
    expect(controller.player.position.x).toBeCloseTo(WALK_SPEED/60);
    const before=controller.player.position.clone();input.axis=()=>0;expect(controller.update(1/60,true)).toBe(0);
    expect(controller.player.position.equals(before)).toBe(true);input.axis=()=>1;controller.update(1/60,false);
    expect(controller.player.position.equals(before)).toBe(true);expect(character.animate).toHaveBeenLastCalledWith(1/60,0);
  });
  it('travels equally at 20, 30, 60 and 144 fps',()=>{
    for(const frames of [20,30,60,144]){const {controller}=walker();for(let i=0;i<frames;i++)controller.update(1/frames,true);expect(controller.player.position.x).toBeCloseTo(WALK_SPEED,9);}
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
  it('draws the explorer exactly where it stands (smooth art: no pixel grid, no wobble against the ground)',()=>{
    const art=Object.fromEntries(Object.keys(artSizes).map(name=>[name,new THREE.MeshBasicMaterial()]));
    const character=createCharacter(art,{reducedMotion:true});character.group.position.set(.53,1,.0234);character.animate(1/60,WALK_SPEED);
    // D064: X=1.3x+0.2z and Y=-0.6z; numeric expectations stay independent of the runtime helper.
    expect(character.sprite.position.x).toBeCloseTo(.69368,10);expect(character.sprite.position.y).toBeCloseTo(-.01404,10);
    character.group.position.x+=.04;character.animate(1/60,WALK_SPEED);expect(character.sprite.position.x).toBeCloseTo(.74568,10);
    Object.values(art).forEach(material=>material.dispose());character.sprite.geometry.dispose();
  });
});
describe('continuous camera follow',()=>{
  it('adds up tiny movements smoothly (no pixel grid) and converges on the target',()=>{
    const view=createCamera({pointer:{wheel:0}});view.setPlace('home_islet',{x:0,z:0});view.start();view.update(1/60,{x:.02,z:0});
    expect(view.camera.position.x).toBeGreaterThan(0);expect(view.camera.position.x).toBeLessThan(.026);
    let previous=view.camera.position.x;
    for(let i=0;i<60;i++){view.update(1/60,{x:.2,z:0});expect(view.camera.position.x).toBeGreaterThanOrEqual(previous);previous=view.camera.position.x;}
    expect(view.camera.position.x).toBeCloseTo(.26,3);
  });
  it('follows frame independently while preserving orientation',()=>{
    const positions=[20,30,60,144].map(frames=>{const view=createCamera({pointer:{wheel:0}});view.setPlace('home_islet',{x:0,z:0});view.start();const q=view.camera.quaternion.clone();
      for(let i=0;i<frames;i++)view.update(1/frames,{x:3,z:0});expect(view.camera.quaternion.equals(q)).toBe(true);return view.camera.position.x;});
    for(const x of positions)expect(x).toBeCloseTo(positions[0],10);
  });
  it('zooms smoothly up to 2, honors reduced motion and the battle zoom',()=>{
    const input={pointer:{wheel:-1000}},view=createCamera(input);view.start();
    const seen=[];for(let i=0;i<60;i++){view.update(1/60,{x:0,z:0});input.pointer.wheel=0;seen.push(view.camera.zoom);}
    expect(seen.every((zoom,i)=>i===0||zoom>=seen[i-1])).toBe(true);expect(seen.at(-1)).toBeCloseTo(2,2);
    view.overview();expect(view.camera.zoom).toBe(1);input.pointer.wheel=-1000;view.start(true);view.update(1/60,{x:.1234,z:0});
    expect(view.camera.position.x).toBeCloseTo(.16042,10);expect(view.camera.zoom).toBe(2);
    view.camera.userData.battleZoom=.59;view.update(1/60,{x:0,z:0});expect(view.camera.zoom).toBe(.59);
  });
});
