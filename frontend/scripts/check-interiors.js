// Build the actual room module, then exercise it under strict CSP with no game/API traffic.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,basename} from 'node:path';
import {createServer} from 'node:http';
import {build} from 'vite';
import {chromium} from 'playwright-core';
import {captainAssets} from '../src/world/interiors/captain-art.js';

const scratch=await mkdtemp(join(tmpdir(),'plot-twist-interiors-'));
const artifacts=process.env.INTERIORS_ARTIFACTS??'/tmp/plot-twist-interiors-proof';
const assetRoot=process.env.INTERIORS_ASSET_ROOT??resolve('public');
const explorerPaths=new Set(captainAssets.map(key=>`/pixel/hd/${key}.png`));
const policy="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
let server,browser;const report={checks:[],screenshots:[]};
const pass=label=>report.checks.push(label);
try{
  await mkdir(artifacts,{recursive:true});
  await build({configFile:false,envDir:false,root:process.cwd(),logLevel:'error',build:{outDir:scratch,emptyOutDir:true,
    lib:{entry:resolve('src/world/interiors/scene.js'),formats:['es'],fileName:()=> 'interiors.js',cssFileName:'interiors'},minify:true}});
  await writeFile(join(scratch,'setup.js'),`import {createInteriors} from './interiors.js';
window.roomHits=[];window.roomExits=[];window.roomResets=0;
window.interiors=createInteriors({container:document.body,reducedMotion:()=>matchMedia('(prefers-reduced-motion:reduce)').matches,
resetInput:()=>window.roomResets++,onInteract:event=>window.roomHits.push(event),onExit:event=>window.roomExits.push(event)});
let previous=performance.now();function frame(now){window.interiors.update((now-previous)/1000);previous=now;requestAnimationFrame(frame);}requestAnimationFrame(frame);
`);
  await writeFile(join(scratch,'index.html'),'<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Room scene check</title><link rel="stylesheet" href="/interiors.css"><script type="module" src="/setup.js"></script></head><body></body></html>');
  server=createServer(async(req,res)=>{
    const path=new URL(req.url,'http://localhost').pathname;
    if(explorerPaths.has(path)){
      try{const data=await readFile(join(assetRoot,path.slice(1)));res.writeHead(200,{'Content-Type':'image/png','Content-Security-Policy':policy,'X-Content-Type-Options':'nosniff'});res.end(data);}catch{res.writeHead(404);res.end();}return;
    }
    const file=req.url==='/'?'index.html':basename(new URL(req.url,'http://localhost').pathname);
    if(file==='favicon.ico'){res.writeHead(204);res.end();return;}
    if(!['index.html','setup.js','interiors.js','interiors.css'].includes(file)){res.writeHead(404);res.end();return;}
    try{const data=await readFile(join(scratch,file));res.writeHead(200,{'Content-Type':file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html','Content-Security-Policy':policy,'X-Content-Type-Options':'nosniff'});res.end(data);}catch{res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/usr/bin/chromium',headless:true});
  const errors=[],external=[],violations=[],assetResponses=[];
  async function trackedPage(context){
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(!request.url().startsWith(base))external.push(request.url());});
    page.on('response',response=>{if(explorerPaths.has(new URL(response.url()).pathname))assetResponses.push({path:new URL(response.url()).pathname,status:response.status()});});
    await page.exposeFunction('reportRoomPolicy',value=>violations.push(value));
    await page.addInitScript(()=>document.addEventListener('securitypolicyviolation',event=>window.reportRoomPolicy(event.violatedDirective)));
    return page;
  }
  let context=await browser.newContext({viewport:{width:1280,height:720},reducedMotion:'reduce'}),page=await trackedPage(context);
  await page.goto(base);await page.waitForFunction(()=>!!window.interiors);
  assert.equal(assetResponses.length,0);pass('Explorer images stay unloaded until a room is entered');
  assert.equal(await page.evaluate(()=>window.interiors.enter('lighthouse')),false);pass('The lighthouse refuses entry until its opened-door gate is supplied');
  for(const room of ['cottage','boathouse','lighthouse']){
    assert.equal(await page.evaluate(room=>window.interiors.enter(room,{unlocked:room==='lighthouse'}),room),true);
    await page.locator('.interiors-scene[data-state="ready"]').waitFor();
    await page.waitForFunction(()=>performance.getEntriesByType('resource').filter(entry=>new URL(entry.name).pathname.startsWith('/pixel/hd/explorer')).length===9);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const dimensions=await page.locator('.interiors-scene').evaluate(element=>{const r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,viewport:[innerWidth,innerHeight],overflow:document.documentElement.scrollWidth>innerWidth};});
    assert.deepEqual(dimensions,{x:0,y:0,width:1280,height:720,viewport:[1280,720],overflow:false});
    const screenshot=join(artifacts,`${room}-desktop.png`);await page.screenshot({path:screenshot});report.screenshots.push(screenshot);
    await page.locator('.interiors-hotspot').click();const event=await page.evaluate(()=>window.roomHits.at(-1));
    assert.equal(event.place,'lighthouse_isle');assert.equal(event.id,({cottage:'desk',boathouse:'shore',lighthouse:'tower_door'})[room]);
    if(room==='lighthouse')assert.equal(event.resume,true);
    pass(`${room} occupies the full desktop and dispatches its unchanged story interaction`);
    await page.getByRole('button',{name:'Leave room',exact:true}).click();assert.equal(await page.evaluate(()=>window.interiors.active),false);
    assert.equal(await page.evaluate(()=>window.roomExits.at(-1).placeId),'lighthouse_isle');
  }
  pass('Every room restores the parent island through its owned exit callback');
  await page.evaluate(()=>window.interiors.enter('cottage'));
  const before=await page.locator('.interiors-canvas').evaluate(canvas=>canvas.toDataURL());
  await page.keyboard.down('ArrowUp');await page.waitForTimeout(140);await page.keyboard.up('ArrowUp');
  const after=await page.locator('.interiors-canvas').evaluate(canvas=>canvas.toDataURL());assert.notEqual(before,after);pass('Arrow input moves the actual room explorer');
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.interiors.active),false);pass('Escape leaves the room and releases movement');
  await context.close();context=await browser.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true,reducedMotion:'reduce'});page=await trackedPage(context);
  await page.goto(base);await page.waitForFunction(()=>!!window.interiors);
  for(const width of [375,320]){
    await page.setViewportSize({width,height:812});await page.evaluate(()=>window.interiors.enter('cottage'));
    await page.waitForFunction(()=>performance.getEntriesByType('resource').filter(entry=>new URL(entry.name).pathname.startsWith('/pixel/hd/explorer')).length===9);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const layout=await page.evaluate(()=>{
      const scene=document.querySelector('.interiors-scene'),header=scene.querySelector('.interiors-heading').getBoundingClientRect(),exit=scene.querySelector('.interiors-exit').getBoundingClientRect();
      const direction=scene.querySelector('.interiors-direction').getBoundingClientRect();
      return {overflow:document.documentElement.scrollWidth>innerWidth,headerRight:header.right,exitLeft:exit.left,exitHeight:exit.height,directionWidth:direction.width,directionHeight:direction.height,sceneHeight:scene.getBoundingClientRect().height};
    });
    assert.equal(layout.overflow,false);assert.ok(layout.headerRight<=layout.exitLeft);assert.ok(layout.exitHeight>=44);assert.ok(layout.directionWidth>=44);assert.ok(layout.directionHeight>=44);assert.equal(layout.sceneHeight,812);
    const screenshot=join(artifacts,`cottage-${width}.png`);await page.screenshot({path:screenshot});report.screenshots.push(screenshot);
    await page.getByRole('button',{name:'Leave room',exact:true}).click();pass(`${width}px room keeps a full scene, readable header and nonoverlapping 44px exit`);
  }
  await page.evaluate(()=>window.interiors.dispose());assert.equal(await page.locator('.interiors-scene').count(),0);pass('Disposal removes the room and its resize/input owners');
  assert.equal(assetResponses.length,18);assert.ok(assetResponses.every(response=>response.status===200));pass('All nine HD explorer poses load once per owned browser context');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(violations,[]);pass('Strict production CSP has no violations, browser errors or external requests');
  await context.close();await writeFile(join(artifacts,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{
  try{await browser?.close();}finally{if(server)await new Promise(resolve=>server.close(resolve));await rm(scratch,{recursive:true,force:true});}
}
