// The world draws 1:1 into a native buffer magnified by whole device pixels (td-clean). Quality,
// density calibration and DPR never change the visible world; the CSS box covers the viewport.
import {expect,it} from 'vitest';
import {browserHarness} from './g20-browser.js';
const evaluate=browserHarness();
it('fills desktop and phone viewports with bounded quality-independent framing',async()=>{
  await evaluate.withPage(async page=>{
    for(const [width,height] of [[1280,720],[375,812],[320,640]]){
      await page.setViewportSize({width,height});
      const result=await page.evaluate(async()=>{
        const {createRenderer}=await window.g20Import('/src/core/renderer.js');
        const {createCamera}=await window.g20Import('/src/player/camera.js');
        Object.defineProperty(window,'devicePixelRatio',{value:2,configurable:true});
        const graphics=createRenderer(document.body),camera=createCamera({pointer:{wheel:0}}).camera;
        graphics.resize(camera);const high={width:graphics.renderer.domElement.width,height:graphics.renderer.domElement.height,
          left:camera.left,right:camera.right,top:camera.top,bottom:camera.bottom,cssWidth:graphics.renderer.domElement.style.width};
        graphics.setQuality('low');const low={width:graphics.renderer.domElement.width,height:graphics.renderer.domElement.height,
          left:camera.left,right:camera.right,top:camera.top,bottom:camera.bottom};
        graphics.renderer.dispose();graphics.renderer.forceContextLoss();graphics.renderer.domElement.remove();return {high,low,remaining:document.querySelectorAll('canvas').length};
      });
      const css=parseFloat(result.high.cssWidth),step=css*2/result.high.width;
      expect(css).toBeGreaterThanOrEqual(width);expect(css-width).toBeLessThan(2);expect(Number.isInteger(step)).toBe(true);
      expect(result.high.width*result.high.height).toBeLessThanOrEqual(1280*720);
      for(const bound of ['left','right','top','bottom'])expect(result.high[bound]).toBe(result.low[bound]);
      expect(result.high.right-result.high.left).toBeCloseTo(result.high.width/16);expect(result.remaining).toBe(0);
    }
  });
});

it('calibrates actual backing pixels while keeping CSS and world framing fixed',async()=>{
  await evaluate.withPage(async page=>{
    await page.setViewportSize({width:1280,height:720});
    const result=await page.evaluate(async()=>{
      const {createRenderer}=await window.g20Import('/src/core/renderer.js');
      const {createCamera}=await window.g20Import('/src/player/camera.js');
      const graphics=createRenderer(document.body),camera=createCamera({pointer:{wheel:0}}).camera;
      graphics.resize(camera);const canvas=graphics.renderer.domElement;
      const before={width:canvas.width,height:canvas.height,css:canvas.style.cssText,bounds:[camera.left,camera.right,camera.top,camera.bottom]};
      for(let now=0;now<6000;now+=66.7)graphics.sampleFrame(now);
      const after={width:canvas.width,height:canvas.height,css:canvas.style.cssText,bounds:[camera.left,camera.right,camera.top,camera.bottom]};
      graphics.sampleFrame(7000,{active:false});graphics.sampleFrame(10000);
      const paused={width:canvas.width,height:canvas.height};
      graphics.setQuality('low');const qualityReset={width:canvas.width,scale:graphics.renderer.userData.densityScale};
      for(let now=12000;now<18000;now+=66.7)graphics.sampleFrame(now);
      Object.defineProperty(window,'innerWidth',{value:375,configurable:true});Object.defineProperty(window,'innerHeight',{value:667,configurable:true});graphics.resize(camera);
      const viewportReset={width:canvas.width,scale:graphics.renderer.userData.densityScale};
      graphics.renderer.dispose();graphics.renderer.forceContextLoss();canvas.remove();return {before,after,paused,qualityReset,viewportReset};
    });
    // The native buffer is already small: slow frames keep it (and the world framing) as it is.
    expect(result.before.width).toBe(640);expect(result.after.width).toBe(result.before.width);
    expect(result.after.bounds).toEqual(result.before.bounds);expect(result.after.css).toBe(result.before.css);
    expect(result.paused).toEqual({width:result.after.width,height:result.after.height});
    expect(result.qualityReset).toEqual({width:result.before.width,scale:1});expect(result.viewportReset).toEqual({width:376,scale:1});
  });
});
