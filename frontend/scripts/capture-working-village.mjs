// Actual local game and fake transport: before/after working camera evidence, never production.
// node scripts/capture-working-village.mjs <frontend-root> <output-dir> <before|after>
import assert from 'node:assert/strict';
import {mkdir, writeFile, mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {stubOfflineApi} from './api-browser-fixture.js';
const root=resolve(process.argv[2]),out=resolve(process.argv[3]),mode=process.argv[4];
assert.ok(['before','after'].includes(mode));await mkdir(out,{recursive:true});
const server=await createServer({configFile:false,root,envDir:false,logLevel:'error',cacheDir:await mkdtemp(join(tmpdir(),'working-village-')),
  define:{__BUILD_STAMP__:JSON.stringify({sha:'local-preview',builtAt:'2026-11-17T00:00:00Z'})},server:{host:'127.0.0.1',port:0,hmr:false}});
let browser;const screens=[];
async function settle(page){
  for(let n=0,calm=0;n<100&&calm<8;n++){
    const skip=page.getByRole('button',{name:/^Skip all/}),got=page.getByRole('button',{name:'Got it',exact:true});
    if(await skip.count()){calm=0;await skip.first().click();}
    else if(await got.count()){calm=0;await got.first().click();}
    else if(await page.locator('dialog[open]').count()){calm=0;await page.keyboard.press('Escape');}else calm++;
    await page.waitForTimeout(100);
  }
}
async function capture(page,path){
  return page.evaluate(async()=>{const g=window.__island;g.quality('low');g.quality('high');await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return{zoom:g.camera.zoom,position:g.camera.position.toArray(),pixelRatio:g.renderer.getPixelRatio(),drawingWidth:g.renderer.domElement.width,drawingHeight:g.renderer.domElement.height,quality:g.settings.quality,...g.renderer.userData};}).then(async rendering=>{await page.screenshot({path});return rendering;});
}
try{
  await server.listen();const base=`http://127.0.0.1:${server.httpServer.address().port}`;
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/chromium',headless:true});
  for(const [width,height] of [[1280,720],[375,812]]){
    const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage(),errors=[],external=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():(external.push(route.request().url()),route.abort()));
    await stubOfflineApi(page);await page.addInitScript(()=>{
      localStorage.setItem('plot_twist_front_door_v1','1');localStorage.setItem('plot_twist_island_arrival_v1','1');
      localStorage.setItem('tgpt:tutorials:v1',JSON.stringify({version:1,guided:true,seen:[],games:{}}));
    });
    await page.goto(`${base}/?islands=fake&fakeplayer=working-village`);await page.locator('#play').click();
    await page.getByRole('button',{name:'Create a game',exact:true}).click();await page.getByRole('button',{name:'Start',exact:true}).click();
    await page.waitForFunction(()=>window.__island?.waves&&!document.querySelector('dialog[open]'));
    await page.evaluate(async()=>{
      const g=window.__island,i=g.island;g.settings.hour=11;g.settings.fastTime=false;i.dev.setCoins(8000);i.dev.setWaveBest(40);await i.load();
      for(const s of i.island.spots)if(s.id.startsWith('wall_'))await i.build(s.id,'wall');
      for(const [id,kind] of [['cannon_1','cannon'],['cannon_2','mortar'],['cannon_3','cannon'],['cannon_4','harpoon'],['tower_1','watchtower'],['house_1','house'],['house_2','house']])await i.build(id,kind);
      g.player.position.set(-7,1.03,-11);g.view.setPlace('home_islet',g.player.position);g.quality('low');g.quality('high');
    });
    await settle(page);await page.keyboard.press('Escape');await page.getByRole('button',{name:'Manage village',exact:true}).click();
    await page.locator('.island-village-mode:not([hidden])').waitFor();await page.waitForTimeout(1600);
    const initial=await page.evaluate(()=>({zoom:window.__island.camera.zoom,captain:window.__island.player.position.toArray()}));
    if(mode==='after'){
      for(let n=0;n<3;n++)await page.getByRole('button',{name:'Zoom in',exact:true}).click();
      await page.waitForFunction(zoom=>window.__island.camera.zoom>zoom*2.5,initial.zoom);
      const rect=await page.evaluate(()=>window.__island.renderer.domElement.getBoundingClientRect().toJSON());
      const bar=await page.locator('.island-village-mode').boundingBox(),top=await page.locator('.quest-strip').boundingBox();
      const x=rect.x+rect.width/2,y=((top?.y+top?.height||80)+bar.y)/2;
      await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+70,y+25,{steps:6});await page.mouse.up();
      await page.waitForFunction(()=>Math.abs(window.__island.camera.position.x)>1);
      assert.equal(await page.locator('.island-card-build[open]').count(),0,'pan does not pick a building');
      const pan=await page.evaluate(()=>window.__island.camera.position.x);await page.waitForTimeout(500);
      const before=await page.evaluate(()=>window.__island.camera.zoom);
      await page.mouse.wheel(0,-80);await page.waitForFunction(zoom=>window.__island.camera.zoom>zoom*1.1,before);
      // The screenshot records the actual working view; future art is not painted into it.
      const name=`${mode}-${width}x${height}.png`;const rendering=await capture(page,join(out,name));
      await page.getByRole('button',{name:'Fit village',exact:true}).click();
      await page.waitForFunction(zoom=>Math.abs(window.__island.camera.zoom-zoom)<.005&&Math.abs(window.__island.camera.position.x)<.1,initial.zoom);
      assert.ok(Math.abs(await page.evaluate(()=>window.__island.camera.position.x))<.1,'Fit restores island center');
      assert.deepEqual(await page.evaluate(()=>window.__island.player.position.toArray()),initial.captain,'camera gestures never move captain');
      const buttons=await page.locator('.island-village-mode button').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return{width:r.width,height:r.height,hit:n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};}));
      assert.ok(buttons.every(b=>b.width>=44&&b.height>=44&&b.hit),'camera and exit buttons fit and are clickable');
      screens.push({width,height,name,initial,workingPan:pan,workingZoom:before,buttons,rendering});
    }else{
      const name=`${mode}-${width}x${height}.png`;const rendering=await capture(page,join(out,name));screens.push({width,height,name,initial,rendering});
    }
    await page.getByRole('button',{name:'Exit village mode',exact:true}).click();
    await page.waitForFunction(()=>!window.__island.island.managing&&window.__island.camera.zoom>.98);
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await context.close();
  }
  await writeFile(join(out,`report-${mode}.json`),JSON.stringify({mode,root,fixture:'actual Chromium / local fake API, not production',screens,pageErrors:0,externalRequests:0},null,2)+'\n');
  console.log(`${mode}: 2 viewports, actual game, camera/exit actions passed, browser errors 0, external requests 0`);
}finally{await browser?.close();await server.close();}
