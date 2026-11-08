// Real DOM hit testing keeps opt-in diagnostics from covering room/world controls, with no renderer benchmark.
import {expect,it} from 'vitest';
import {browserHarness} from './g20-browser.js';
const evaluate=browserHarness();

async function hitTarget(locator){
  return locator.evaluate(element=>{
    const box=element.getBoundingClientRect(),hit=document.elementFromPoint(box.left+box.width/2,box.top+box.height/2);
    return {hit:hit===element||element.contains(hit),width:box.width,height:box.height,
      size:parseFloat(getComputedStyle(element).fontSize),inside:box.left>=0&&box.top>=0&&box.right<=innerWidth&&box.bottom<=innerHeight};
  });
}

for(const viewport of [{width:1440,height:900},{width:375,height:667},{width:320,height:812},
  {width:375,height:812},{width:812,height:375},{width:1920,height:1080,recording:true}]){
  it(`keeps Leave room, Menu and Copy numbers normally clickable at ${viewport.width}x${viewport.height}${viewport.recording?' recording':''}`,async()=>{
    await evaluate.withPage(async page=>{
      await page.setViewportSize({width:viewport.width,height:viewport.height});
      await page.evaluate(async({recording})=>{
        for(const path of ['/src/ui/styles.css','/src/ui/readability.css','/src/ui/kit/kit.css','/src/ui/shell.css','/src/ui/devices.css',
          '/src/shell/presenter/presenter.css'])await window.g20Import(path);
        const {createHud}=await window.g20Import('/src/ui/hud.js');
        const {createModal}=await window.g20Import('/src/ui/kit/modal.js');
        const {createInteriors}=await window.g20Import('/src/world/interiors/scene.js');
        const {createPerformancePanel}=await window.g20Import('/src/shell/perf/index.js');
        const events={exits:[],menus:0,copies:[],qualities:[]};
        const menu=createModal({title:'Recorded pause menu',body:'Recorded menu content.'});
        const hud=createHud(document.body,{focus(){},start(){},chart(){},quality(){},
          menu(){events.menus++;menu.open(document.body);}});
        const room=createInteriors({container:document.body,reducedMotion:()=>true,onExit:value=>events.exits.push(value)});
        document.body.classList.toggle('recording-frame',recording);
        Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>events.copies.push(text)}});
        const descriptor=Object.getOwnPropertyDescriptor(performance,'now');let now=1000;
        Object.defineProperty(performance,'now',{configurable:true,value:()=>now});
        const panel=createPerformancePanel(document.body,{readStats:()=>({fps:30,calls:111,triangles:2222,geometries:33,textures:44,quality:'high'}),
          setQuality:value=>events.qualities.push(value)});
        // Drive the existing five-second offer without waiting or altering renderer quality.
        for(;now<=6500;now+=100)panel.update();
        if(descriptor)Object.defineProperty(performance,'now',descriptor);else delete performance.now;
        room.enter('cottage');
        window.recordedPerf={events,room,hud,panel,menu,dispose(){panel.dispose();room.dispose();hud.dispose();menu.dispose();document.body.classList.remove('recording-frame');}};
      },{recording:viewport.recording===true});
      try{
        const panel=page.locator('.performance-panel'),exit=page.getByRole('button',{name:'Leave room',exact:true});
        expect(await panel.locator('dt').allTextContents()).toEqual(['Frames per second','95th percentile frame','Draw calls','Triangles','Geometries','Textures','JavaScript heap']);
        const lowQuality=panel.getByRole('button',{name:'Switch to low quality',exact:true});
        expect(await lowQuality.isVisible()).toBe(true);
        const lowTarget=await hitTarget(lowQuality);
        expect(lowTarget).toMatchObject({hit:true,inside:true});expect(lowTarget.size).toBeGreaterThanOrEqual(16);expect(lowTarget.height).toBeGreaterThanOrEqual(44);
        expect(await hitTarget(exit)).toMatchObject({hit:true,inside:true});
        await exit.click();
        await page.locator('.interiors-scene').waitFor({state:'hidden'});
        expect(await page.evaluate(()=>window.recordedPerf.events.exits.map(value=>value.reason))).toEqual(['exit']);
        const worldMenu=page.locator('.hud-menu');
        expect(await hitTarget(worldMenu)).toMatchObject({hit:true,inside:true});
        await worldMenu.click();
        await page.getByRole('dialog',{name:'Recorded pause menu',exact:true}).waitFor({state:'visible'});
        expect(await page.evaluate(()=>window.recordedPerf.events.menus)).toBe(1);
        await page.keyboard.press('Escape');
        await page.getByRole('dialog',{name:'Recorded pause menu',exact:true}).waitFor({state:'hidden'});
        const copy=panel.getByRole('button',{name:'Copy numbers',exact:true}),target=await hitTarget(copy);
        expect(target).toMatchObject({hit:true,inside:true});expect(target.size).toBeGreaterThanOrEqual(16);expect(target.height).toBeGreaterThanOrEqual(44);
        await copy.click();
        await page.waitForFunction(()=>window.recordedPerf.events.copies.length===1);
        expect(await page.evaluate(()=>window.recordedPerf.events.copies[0])).toContain('Build dev');
        expect(await page.evaluate(()=>window.recordedPerf.events.copies[0])).toContain('Built at: 2026-11-06T00:00:00.000Z');
        expect(await page.evaluate(()=>window.recordedPerf.events.copies[0])).toContain('Draw calls: 111');
        expect(await page.evaluate(()=>window.recordedPerf.events.qualities)).toEqual([]);
        expect(await panel.evaluate(element=>{
          const box=element.getBoundingClientRect();
          return {inside:box.left>=0&&box.top>=0&&box.right<=innerWidth&&box.bottom<=innerHeight,
            fits:element.scrollWidth<=element.clientWidth&&element.scrollHeight<=element.clientHeight+1,
            passive:getComputedStyle(element).pointerEvents,overflow:document.documentElement.scrollWidth<=innerWidth,
            controls:[...element.querySelectorAll('button')].filter(button=>!button.hidden).every(button=>getComputedStyle(button).pointerEvents==='auto')};
        })).toEqual({inside:true,fits:true,passive:'none',overflow:true,controls:true});
      }finally{await page.evaluate(()=>window.recordedPerf?.dispose());}
    });
  });
}
