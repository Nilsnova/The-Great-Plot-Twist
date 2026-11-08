// Room destinations share ordinary collision facts; gestures never inspect objects or advance story.
import {describe,expect,it} from 'vitest';
import {planTapPath,createTapWalker} from '../src/controls/tap-path.js';
import {canStandInRoom,moveInRoom} from '../src/world/interiors/logic.js';
import {rooms} from '../src/world/interiors/rooms.js';
import {browserHarness} from './g20-browser.js';

it('rejects furniture and room walls using the same captain clearance as ordinary walking',()=>{
  const objects=rooms.cottage.objects;
  expect(canStandInRoom(.5,.81,objects)).toBe(true);
  for(const point of [{x:.7,y:.45},{x:.09,y:.8},{x:.5,y:.92},{x:NaN,y:.6}])
    expect(canStandInRoom(point.x,point.y,objects)).toBe(false);
  expect(planTapPath(rooms.cottage.spawn,{x:.7,y:.45},{step:.025,margin:1,maxNodes:2000,
    canStand:(x,y)=>canStandInRoom(x,y,objects)})).toBeNull();
});

it.each([.5,1,2])('walks around the cottage stove at room aspect %s without crossing furniture',aspect=>{
  const room=rooms.cottage,target={x:.86,y:.6},stand=(x,y)=>canStandInRoom(x,y,room.objects);
  const path=planTapPath(room.spawn,target,{canStand:stand,step:.025,margin:1,maxNodes:2000});
  expect(path?.length).toBeGreaterThan(2);expect(path.every(p=>stand(p.x,p.y))).toBe(true);
  const walker=createTapWalker({threshold:.008});walker.follow(path);let position={...room.spawn};
  for(let frame=0;frame<300&&walker.active;frame++){
    const vector=walker.direction(position,.05,{maxStep:.014,verticalFactor:aspect});
    position=moveInRoom(position,vector,.05,room.objects,aspect);
    expect(stand(position.x,position.y)).toBe(true);
  }
  expect(walker.active).toBe(false);expect(Math.hypot(position.x-target.x,position.y-target.y)).toBeLessThan(.009);
});

it('finds the lighthouse cabinet detour for two clear floor points outside a narrow tap corridor',()=>{
  const room=rooms.lighthouse,start={x:.85,y:.68},target={x:.85,y:.87};
  const canStand=(x,y)=>canStandInRoom(x,y,room.objects);
  expect(canStand(start.x,start.y)).toBe(true);expect(canStand(target.x,target.y)).toBe(true);
  expect(planTapPath(start,target,{canStand,step:.025,margin:.06,maxNodes:2000})).toBeNull();
  const path=planTapPath(start,target,{canStand,step:.025,margin:1,maxNodes:2000});
  expect(path).not.toBeNull();expect(path.every(p=>canStand(p.x,p.y))).toBe(true);
  expect(path.some(p=>p.x<.73-.025)).toBe(true);
  const walker=createTapWalker({threshold:.008});walker.follow(path);let position={...start};
  for(let frame=0;frame<300&&walker.active;frame++){
    position=moveInRoom(position,walker.direction(position,.05,{maxStep:.014}),.05,room.objects);
    expect(canStand(position.x,position.y)).toBe(true);
  }
  expect(walker.active).toBe(false);expect(Math.hypot(position.x-target.x,position.y-target.y)).toBeLessThan(.009);
});

describe('room tap gestures',()=>{
const evaluate=browserHarness();

it('accepts only single touch or pen taps, rejecting drag, multitouch, mouse and cancelled lifetimes',async()=>{
  const result=await evaluate(async()=>{
    const {createRoomControls}=await window.g20Import('/src/world/interiors/controls.js');
    const root=document.createElement('section'),canvas=document.createElement('canvas'),pad=document.createElement('nav');
    canvas.style.cssText='width:200px;height:300px';root.append(canvas,pad);document.body.append(root);
    let allowed=true,cancels=0;const taps=[];
    const controls=createRoomControls({element:root,canvas,pad,enabled:()=>allowed,interact(){},exit(){},
      onTap:p=>taps.push(p),cancelWalk:()=>cancels++});
    const rect=canvas.getBoundingClientRect();
    const pointer=(type,id=1,x=100,y=150,pointerType='touch',target=canvas)=>target.dispatchEvent(new PointerEvent(type,
      {pointerId:id,pointerType,button:0,clientX:rect.left+x,clientY:rect.top+y,bubbles:true}));
    const tap=(id,type='touch')=>{pointer('pointerdown',id,100,150,type);pointer('pointerup',id,100,150,type);};
    tap(1);tap(2,'pen');const accepted=taps.length;
    tap(3,'mouse');pointer('pointerdown',4);pointer('pointermove',4,120);pointer('pointerup',4,120);
    pointer('pointerdown',5);pointer('pointerdown',6,100,150,'touch',root);pointer('pointerup',6);pointer('pointerup',5);
    pointer('pointerdown',7);pointer('pointercancel',7);pointer('pointerup',7);
    pointer('pointerdown',12);pointer('lostpointercapture',12);pointer('pointerup',12);
    pointer('pointerdown',8);allowed=false;controls.read();allowed=true;pointer('pointerup',8);
    pointer('pointerdown',9);controls.reset();pointer('pointerup',9);
    pointer('pointerdown',10);window.dispatchEvent(new Event('blur'));pointer('pointerup',10);
    controls.dispose();tap(11);return {accepted,taps,cancelled:cancels>0};
  });
  expect(result).toEqual({accepted:2,taps:[{x:.5,y:.5},{x:.5,y:.5}],cancelled:true});
});

it('keeps held D-pad, keyboard and gamepad movement authoritative over destinations',async()=>{
  const result=await evaluate(async()=>{
    const {createRoomControls}=await window.g20Import('/src/world/interiors/controls.js');
    const root=document.createElement('section'),canvas=document.createElement('canvas'),pad=document.createElement('nav'),right=document.createElement('button');
    right.dataset.direction='right';right.setPointerCapture=()=>{};pad.append(right);root.append(canvas,pad);document.body.append(root);
    const controller={connected:true,mapping:'standard',axes:[0,0],buttons:Array.from({length:10},()=>({pressed:false}))};
    Object.defineProperty(navigator,'getGamepads',{value:()=>[controller]});let cancels=0;
    const controls=createRoomControls({element:root,canvas,pad,enabled:()=>true,interact(){},exit(){},cancelWalk:()=>cancels++});
    right.dispatchEvent(new PointerEvent('pointerdown',{pointerId:1,button:0,bubbles:true,cancelable:true}));
    const held=[controls.read().x,controls.read().x];right.dispatchEvent(new PointerEvent('pointerup',{pointerId:2,bubbles:true}));held.push(controls.read().x);
    right.dispatchEvent(new PointerEvent('pointerup',{pointerId:1,bubbles:true}));const released=controls.read().x;
    canvas.dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowUp',bubbles:true,cancelable:true}));const keyboard=controls.read().y;
    canvas.dispatchEvent(new KeyboardEvent('keyup',{code:'ArrowUp',bubbles:true}));controller.axes[0]=-.8;const gamepad=controls.read().x;
    controls.dispose();return {held,released,keyboard,gamepad,cancelled:cancels>0};
  });
  expect(result).toEqual({held:[1,1,1],released:0,keyboard:-1,gamepad:-.8,cancelled:true});
});

it('walks a room tap to completion and discards it on native dialog, manual input, close and room change',async()=>{
  const result=await evaluate(async()=>{
    const {createInteriors}=await window.g20Import('/src/world/interiors/scene.js');
    let inspected=0;const scene=createInteriors({container:document.body,reducedMotion:()=>true,onInteract:()=>inspected++});
    scene.enter('cottage');const canvas=scene.element.querySelector('canvas'),marker=scene.element.querySelector('.interiors-destination');
    const tap=(x=.7,y=.84)=>{const rect=canvas.getBoundingClientRect();for(const type of ['pointerdown','pointerup'])canvas.dispatchEvent(new PointerEvent(type,
      {pointerId:1,pointerType:'touch',button:0,clientX:rect.left+x*rect.width,clientY:rect.top+y*rect.height,bubbles:true}));scene.update(.05);};
    tap();const started=!marker.hidden;for(let frame=0;frame<70;frame++)scene.update(.05);const completed=marker.hidden;
    tap(.4,.8);const dialog=document.createElement('dialog');document.body.append(dialog);dialog.showModal();scene.update(.05);
    const overlayStopped=marker.hidden;dialog.close();scene.update(.05);const noResume=marker.hidden;dialog.remove();
    tap(.4,.8);scene.update(.05,{blocked:true});scene.update(.05,{blocked:false});const blockedStopped=marker.hidden;
    tap(.7,.84);canvas.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',bubbles:true,cancelable:true}));
    const manualStopped=marker.hidden;canvas.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW',bubbles:true}));
    tap(.4,.8);scene.close('exit',{immediate:true});scene.enter('boathouse');const freshRoom=marker.hidden;
    scene.dispose();return {started,completed,overlayStopped,noResume,blockedStopped,manualStopped,freshRoom,inspected,removed:!scene.element.isConnected};
  });
  expect(result).toEqual({started:true,completed:true,overlayStopped:true,noResume:true,blockedStopped:true,manualStopped:true,freshRoom:true,inspected:0,removed:true});
});
});
