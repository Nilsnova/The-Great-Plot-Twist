import {expect,it} from 'vitest';
import {browserHarness} from './g20-browser.js';
const evaluate=browserHarness();

it('opens an opaque complete room, emits existing interactions and restores its exterior on exit',async()=>{
  const result=await evaluate(async()=>{
    const {createInteriors}=await window.g20Import('/src/world/interiors/scene.js');
    const events=[],exits=[];let focused=0,resets=0;
    const scene=createInteriors({container:document.body,reducedMotion:()=>true,resetInput:()=>resets++,focus:()=>focused++,onInteract:e=>events.push(e),onExit:e=>exits.push(e)});
    const locked=scene.enter('lighthouse'),opened=scene.enter('cottage');
    const box=scene.element.getBoundingClientRect(),canvas=scene.element.querySelector('canvas');
    const focus=document.activeElement===canvas;scene.element.querySelector('.interiors-hotspot').click();scene.close('exit',{immediate:true});
    const result={locked,opened,box:{x:box.x,y:box.y,w:box.width,h:box.height},viewport:{w:innerWidth,h:innerHeight},focus,
      events,exits,focused,reset:resets>0,active:scene.active,hidden:scene.element.hidden};scene.dispose();return result;
  });
  expect(result.locked).toBe(false);expect(result.opened).toBe(true);expect(result.focus).toBe(true);
  expect(result.box).toEqual({x:0,y:0,w:result.viewport.w,h:result.viewport.h});
  expect(result.events).toEqual([{type:'interact',id:'desk',place:'lighthouse_isle',roomId:'cottage',resume:false}]);
  expect(result.exits).toEqual([{roomId:'cottage',placeId:'lighthouse_isle',outside:{x:-7,z:7},reason:'exit'}]);
  expect(result).toMatchObject({focused:1,reset:true,active:false,hidden:true});
});

it('pauses room movement under a story dialog and owns game keys without leaking them outside',async()=>{
  const result=await evaluate(async()=>{
    const {createInteriors}=await window.g20Import('/src/world/interiors/scene.js');
    const scene=createInteriors({container:document.body,reducedMotion:()=>true});scene.enter('cottage');
    const canvas=scene.element.querySelector('canvas'),ctx=canvas.getContext('2d'),sum=()=>ctx.getImageData(0,0,canvas.width,canvas.height).data.reduce((n,p,i)=>n+(i%29===0?p:0),0);
    const before=sum(),dialog=document.createElement('dialog');document.body.append(dialog);dialog.showModal();
    window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',bubbles:true}));scene.update(.05);const paused=sum();dialog.close();scene.update(.05);
    let leaked=0;const listener=()=>leaked++;window.addEventListener('keydown',listener);
    canvas.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',bubbles:true,cancelable:true}));scene.update(.05);const walked=sum();
    scene.dispose();canvas.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',bubbles:true}));window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW'}));
    window.removeEventListener('keydown',listener);return {before,paused,walked,leaked,removed:!document.querySelector('.interiors-scene')};
  });
  expect(result.paused).toBe(result.before);expect(result.walked).not.toBe(result.before);expect(result.leaked).toBe(1);expect(result.removed).toBe(true);
});

it('cancels entry/exit timers when disposed, without late callbacks or focus',async()=>{
  const result=await evaluate(async()=>{
    const {createInteriors}=await window.g20Import('/src/world/interiors/scene.js');let exits=0,focus=0;
    const scene=createInteriors({container:document.body,onExit:()=>exits++,focus:()=>focus++});scene.enter('cottage');scene.close();scene.dispose();
    await new Promise(resolve=>setTimeout(resolve,260));return {exits,focus,active:scene.active,reopened:scene.enter('boathouse'),removed:!scene.element.isConnected};
  });
  expect(result).toEqual({exits:0,focus:0,active:false,reopened:false,removed:true});
});

it('finishes a gamepad exit during its frame without updating a released room',async()=>{
  const result=await evaluate(async()=>{
    const {createInteriors}=await window.g20Import('/src/world/interiors/scene.js');
    const controller={connected:true,mapping:'standard',axes:[0,0],buttons:Array.from({length:10},()=>({pressed:false}))};
    Object.defineProperty(navigator,'getGamepads',{value:()=>[controller]});
    let exits=0;const scene=createInteriors({container:document.body,reducedMotion:()=>true,onExit:()=>exits++});
    scene.enter('cottage');controller.buttons[1].pressed=true;scene.update(.016);
    const result={exits,active:scene.active,hidden:scene.element.hidden};scene.dispose();return result;
  });
  expect(result).toEqual({exits:1,active:false,hidden:true});
});

it('opens the room menu on a fresh Start press and respects native dialog ownership',async()=>{
  const result=await evaluate(async()=>{
    const {createInteriors}=await window.g20Import('/src/world/interiors/scene.js');
    const controller={connected:true,mapping:'standard',axes:[0,0],buttons:Array.from({length:10},()=>({pressed:false}))};
    Object.defineProperty(navigator,'getGamepads',{value:()=>[controller]});
    let menus=0;const scene=createInteriors({container:document.body,reducedMotion:()=>true,onMenu:()=>menus++});scene.enter('cottage');
    controller.buttons[9].pressed=true;scene.update(.016);scene.update(.016);const first=menus;
    controller.buttons[9].pressed=false;scene.update(.016);
    const dialog=document.createElement('dialog');document.body.append(dialog);dialog.showModal();controller.buttons[9].pressed=true;scene.update(.016);dialog.close();scene.update(.016);const held=menus;
    controller.buttons[9].pressed=false;scene.update(.016);controller.buttons[9].pressed=true;scene.update(.016);
    const result={first,held,menus,active:scene.active};scene.dispose();dialog.remove();return result;
  });
  expect(result).toEqual({first:1,held:1,menus:2,active:true});
});

it('releases only the owned touch pointer and does not repeat a held gamepad action after an overlay',async()=>{
  const result=await evaluate(async()=>{
    const {createRoomControls}=await window.g20Import('/src/world/interiors/controls.js');
    const root=document.createElement('section'),canvas=document.createElement('canvas'),pad=document.createElement('nav'),button=document.createElement('button');button.dataset.direction='right';button.setPointerCapture=()=>{};pad.append(button);root.append(canvas,pad);document.body.append(root);
    let allowed=true,actions=0,exits=0;const controller={connected:true,mapping:'standard',axes:[0,0],buttons:Array.from({length:10},()=>({pressed:false}))};
    Object.defineProperty(navigator,'getGamepads',{value:()=>[controller]});
    const controls=createRoomControls({element:root,canvas,pad,enabled:()=>allowed,interact:()=>actions++,exit:()=>exits++});controls.reset();
    button.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:1,cancelable:true}));button.dispatchEvent(new PointerEvent('pointerup',{pointerId:2}));const touch=controls.read().x;
    button.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1}));const released=controls.read().x;
    controller.buttons[0].pressed=true;controls.read();controls.read();allowed=false;controls.read();allowed=true;controls.read();
    controller.buttons[0].pressed=false;controls.read();controller.buttons[1].pressed=true;controls.read();controls.dispose();return {touch,released,actions,exits};
  });
  expect(result).toEqual({touch:1,released:0,actions:1,exits:1});
});


it('keeps rooms usable when the browser denies gamepad access',async()=>{
  const result=await evaluate(async()=>{
    const {createInteriors}=await window.g20Import('/src/world/interiors/scene.js');
    Object.defineProperty(navigator,'getGamepads',{value:()=>{throw new DOMException('Blocked','SecurityError');}});
    let inspections=0;const scene=createInteriors({container:document.body,reducedMotion:()=>true,onInteract:()=>inspections++});
    const entered=scene.enter('cottage');scene.update(.016);scene.element.querySelector('.interiors-hotspot').click();
    const closed=scene.close('exit',{immediate:true}),active=scene.active;scene.dispose();
    return {entered,closed,active,inspections};
  });
  expect(result).toEqual({entered:true,closed:true,active:false,inspections:1});
});
