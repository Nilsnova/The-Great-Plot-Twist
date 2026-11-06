// Actual WebGL quality changes alter density, never the visible world or CSS dimensions.
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
      expect(result.high.cssWidth).toBe(`${width}px`);expect(result.high.width*result.high.height).toBeLessThanOrEqual(1920*1080);
      expect(result.low.width*result.low.height).toBeLessThanOrEqual(1280*720);
      for(const bound of ['left','right','top','bottom'])expect(result.high[bound]).toBe(result.low[bound]);
      expect(result.high.width).toBeGreaterThan(result.low.width);expect(result.remaining).toBe(0);
    }
  });
});
