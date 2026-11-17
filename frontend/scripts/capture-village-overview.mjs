// Real game renderer with the existing local fake API; never a live backend claim.
// node scripts/capture-village-overview.mjs <frontend-root> <output-dir> <before|after>
import assert from 'node:assert/strict';
import {mkdir, writeFile, mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {stubOfflineApi} from './api-browser-fixture.js';

const root=resolve(process.argv[2]), out=resolve(process.argv[3]), mode=process.argv[4];
assert.ok(['before','after'].includes(mode)); await mkdir(out,{recursive:true});
const server=await createServer({configFile:false,root,envDir:false,logLevel:'error',cacheDir:await mkdtemp(join(tmpdir(),'coc02-view-')),
  define:{__BUILD_STAMP__:JSON.stringify({sha:'local-preview',builtAt:'2026-11-17T00:00:00Z'})},server:{host:'127.0.0.1',port:0,hmr:false}});
let browser; const screens=[];
async function closeCards(page) {
  for(let n=0,calm=0;n<100&&calm<8;n++) {
    const skip=page.getByRole('button',{name:/^Skip all/}), got=page.getByRole('button',{name:'Got it',exact:true});
    if(await skip.count()){calm=0;await skip.first().click();}
    else if(await got.count()){calm=0;await got.first().click();}
    else if(await page.locator('dialog[open]').count()){calm=0;await page.keyboard.press('Escape');}
    else calm++;
    await page.waitForTimeout(100);
  }
  assert.equal(await page.locator('dialog[open]').count(),0,'fixture cards are closed');
}
try {
  await server.listen(); const base=`http://127.0.0.1:${server.httpServer.address().port}`;
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/chromium',headless:true});
  for(const [width,height] of [[1280,720],[375,812]]) {
    const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage(),errors=[],external=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():(external.push(route.request().url()),route.abort()));
    await stubOfflineApi(page);
    await page.addInitScript(()=>{
      localStorage.setItem('plot_twist_front_door_v1','1');localStorage.setItem('plot_twist_island_arrival_v1','1');
      localStorage.setItem('tgpt:tutorials:v1',JSON.stringify({version:1,guided:true,seen:[],games:{}}));
    });
    await page.goto(`${base}/?islands=fake&fakeplayer=coc02-preview`);await page.locator('#play').click();
    await page.getByRole('button',{name:'Create a game',exact:true}).click();await page.getByRole('button',{name:'Start',exact:true}).click();
    await page.waitForFunction(()=>window.__island?.waves&&!document.querySelector('dialog[open]'));
    await page.evaluate(async()=>{
      const g=window.__island,i=g.island;g.settings.hour=11;g.settings.fastTime=false;i.dev.setCoins(8000);i.dev.setWaveBest(40);await i.load();
      for(const s of i.island.spots) if(s.id.startsWith('wall_')) await i.build(s.id,'wall');
      for(const [id,kind] of [['cannon_1','cannon'],['cannon_2','mortar'],['cannon_3','cannon'],['cannon_4','harpoon'],['tower_1','watchtower'],['house_1','house'],['house_2','house']]) await i.build(id,kind);
      await i.upgrade('house_1');await i.upgrade('house_1');await i.upgrade('house_2');
      g.player.position.set(-7,1.03,-11);g.view.setPlace('home_islet',g.player.position);g.renderer.domElement.focus();
    });
    await closeCards(page); await page.waitForFunction(()=>window.__island.world.current.group.visible===true);
    await page.keyboard.press('Escape');await page.getByRole('button',{name:'Manage village',exact:true}).click();
    await page.locator('.island-village-mode:not([hidden])').waitFor();
    await page.waitForFunction(expected=>expected?window.__island.camera.zoom<.5:window.__island.camera.zoom>=.99,mode==='after');
    // Let the visible camera ease finish, then assert the actual projected spot is usable.
    await page.waitForTimeout(1800);
    const state=await page.evaluate(async()=>{
      const g=window.__island,{surfaceClass}=await import('/src/world/places/surfaces.js');g.camera.updateMatrixWorld();
      const canvas=g.renderer.domElement.getBoundingClientRect(),ys=[];
      const screenY=(x,z,lift=0)=>(1-g.player.position.clone().set(x,-z*.72+lift,0).project(g.camera).y)*canvas.height/2;
      for(let x=-24;x<=24;x++)for(let z=-26;z<=26;z++)if(surfaceClass('home_islet',x,z))ys.push(screenY(x,z));
      ys.push(screenY(0,-22,6));
      const bar=document.querySelector('.island-village-mode').getBoundingClientRect(),quests=document.querySelector('.quest-strip')?.getBoundingClientRect();
      return {managing:g.island.managing,zoom:g.camera.zoom,position:g.camera.position.toArray(),captain:g.player.position.toArray(),built:g.island.island.spots.filter(s=>s.built).length,contextLost:g.renderer.getContext().isContextLost(),drawCalls:g.renderer.info.render.calls,landTop:Math.min(...ys),landBottom:Math.max(...ys),safeTop:canvas.width<640?(quests?.bottom??80):80,safeBottom:bar.top};
    });
    assert.equal(state.managing,true);assert.equal(state.contextLost,false);assert.ok(state.drawCalls>0);
    const button=page.getByRole('button',{name:'Exit village mode',exact:true});
    assert.ok(await button.evaluate(n=>{const r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),'exit remains clickable');
    const name=`${mode}-${width}x${height}.png`;await page.screenshot({path:join(out,name)});
    if(mode==='after') {
      assert.ok(state.landTop>state.safeTop+4,'island clears the visible HUD');
      assert.ok(state.landBottom<state.safeBottom-4,'island clears the management/caption area');
      const point=await page.evaluate(()=>{
        const g=window.__island,r=g.renderer.domElement.getBoundingClientRect();g.camera.updateMatrixWorld();
        const p=g.player.position.clone().set(-12.5,14.5*.72+.7,0).project(g.camera);
        return{x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};
      });
      assert.ok(point.x>0&&point.x<width&&point.y>0&&point.y<height,'distant tower is on screen');
      await page.mouse.click(point.x,point.y);await page.locator('.island-card-build[open]').waitFor();
      await page.keyboard.press('Escape');await button.click();await page.waitForFunction(()=>!window.__island.island.managing&&window.__island.camera.zoom>.98);
    }
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);screens.push({width,height,name,...state,pageErrors:errors,externalRequests:external.length});
    await context.close();
  }
  await writeFile(join(out,`report-${mode}.json`),JSON.stringify({mode,root,fixture:'real game / local fake transport, not production',screens},null,2)+'\n');
  console.log(`${mode}: 2 viewports, real renderer, exit hit-test, browser errors 0, external requests 0`);
} finally {await browser?.close();await server.close();}
