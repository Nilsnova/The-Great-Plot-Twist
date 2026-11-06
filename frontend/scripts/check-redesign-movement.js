// Bounded local world proof: actual density, responsive controls and stable quality framing.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {stubWeather} from './weather-browser-fixture.js';
import {stubIntro} from './intro-browser-fixture.js';
import {startFromTitle} from './shell-browser-tools.js';
const output=process.env.CAPTURE_DIR||'/tmp/redesign-movement';
const report={checks:[],modes:[]},check=(value,label)=>{assert.ok(value,label);report.checks.push(label);};
const server=await createServer({envDir:false,logLevel:'error',server:{host:'127.0.0.1',port:0,hmr:false}});
let browser;
try{
  await mkdir(output,{recursive:true});await server.listen();
  const url=server.resolvedUrls.local[0];
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/chromium',headless:true});
  for(const [width,height,dpr] of [[1280,720,1],[375,812,2],[320,640,2]]){
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr});
    try{
      const page=await context.newPage(),errors=[],external=[];
      page.on('pageerror',error=>errors.push(error.message));
      page.on('request',request=>{if(!request.url().startsWith(url)&&!request.url().startsWith('data:'))external.push(request.url());});
      await stubWeather(page);await stubIntro(page);await page.goto(url);await startFromTitle(page);
      await page.waitForFunction(()=>window.__island?.renderer.info.render.frame>8);
      const before=await page.evaluate(()=>{
        const g=window.__island;return {x:g.player.position.x,width:g.renderer.domElement.width,height:g.renderer.domElement.height};
      });
      check(before.width*before.height<=1920*1080,`${width}px high quality bounds framebuffer pixels`);
      if(width===1280)check(before.width*before.height/(426*240)>9,'Desktop renders over nine times the old native pixel area');
      await page.keyboard.down('KeyD');
      await page.waitForFunction(start=>window.__island.player.position.x>start+.15,before.x,{timeout:3000});
      await page.keyboard.up('KeyD');
      const stopped=await page.evaluate(()=>({x:window.__island.player.position.x,z:window.__island.player.position.z}));
      await page.evaluate(async()=>{for(let i=0;i<5;i++)await new Promise(requestAnimationFrame);});
      const after=await page.evaluate(()=>({x:window.__island.player.position.x,z:window.__island.player.position.z}));
      check(Math.hypot(after.x-stopped.x,after.z-stopped.z)<.001,`${width}px release has no drifting momentum`);
      const metrics=await page.evaluate(async()=>{
        const g=window.__island,start=performance.now();let calls=0;const samples=30;
        for(let i=0;i<samples;i++){await new Promise(requestAnimationFrame);calls=Math.max(calls,g.renderer.info.render.calls);}
        const high={width:g.renderer.domElement.width,height:g.renderer.domElement.height,pixelRatio:g.renderer.getPixelRatio()};
        const camera=[g.camera.left,g.camera.right,g.camera.top,g.camera.bottom];g.quality('low');
        return {high,low:{width:g.renderer.domElement.width,height:g.renderer.domElement.height},camera,
          lowCamera:[g.camera.left,g.camera.right,g.camera.top,g.camera.bottom],fps:Math.round(samples*1000/(performance.now()-start)),calls};
      });
      check(JSON.stringify(metrics.camera)===JSON.stringify(metrics.lowCamera),`${width}px quality changes preserve world framing`);
      check(metrics.low.width*metrics.low.height<=1280*720,`${width}px low quality bounds framebuffer pixels`);
      check(errors.length===0&&external.length===0,`${width}px world has no page errors or external requests`);
      await page.evaluate(()=>window.__island.quality('high'));
      await page.screenshot({path:`${output}/world-${width}.png`});
      report.modes.push({width,height,dpr,...metrics});
    }finally{await context.close();}
  }
  console.log(JSON.stringify(report,null,2));
}finally{
  await writeFile(`${output}/report.json`,JSON.stringify(report,null,2)+'\n');
  try{await browser?.close();}finally{await server.close();}
}
