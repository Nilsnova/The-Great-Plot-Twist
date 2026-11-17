// Old-art framing regression only: matched paid layout, real entry/Fit/Tab/drag and actual ground picking.
// node scripts/capture-village-composition.mjs <runtime-frontend> <output> <before|after>
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {stubOfflineApi} from './api-browser-fixture.js';
import {boot,capture,groundPoint,hitButtons,manage,settleCards,village,wallet} from './perimeter-game-ui.mjs';
const root=resolve(process.argv[2]),out=resolve(process.argv[3]),mode=process.argv[4];
assert.ok(['before','after'].includes(mode));await mkdir(out,{recursive:true});
const head=()=>execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),source=head();
const sourceTree=execFileSync('git',['rev-parse','HEAD:frontend/src'],{cwd:root,encoding:'utf8'}).trim();
const fixture=JSON.parse(await readFile(join(root,'tests/fixtures/perimeter-ring.json'),'utf8')).cells.map(([x,z])=>({x,z}));
const server=await createServer({root,configFile:false,envDir:false,logLevel:'error',cacheDir:await mkdtemp(join(tmpdir(),'vis33-camera-')),
  define:{__BUILD_STAMP__:JSON.stringify({sha:source,builtAt:new Date().toISOString()})},server:{host:'127.0.0.1',port:0,hmr:false}});
let browser;const checks=[];
try{
  await server.listen();const base=`http://127.0.0.1:${server.httpServer.address().port}`;
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/chromium',headless:true});
  for(const [width,height] of [[1280,720],[375,812]]){
    const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage(),errors=[],external=[],consoleErrors=[];
    page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
    await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():(external.push(route.request().url()),route.abort()));
    await stubOfflineApi(page);await page.addInitScript(()=>{
      localStorage.setItem('plot_twist_front_door_v1','1');localStorage.setItem('plot_twist_island_arrival_v1','1');
      localStorage.setItem('tgpt:tutorials:v1',JSON.stringify({version:1,guided:true,seen:[],games:{}}));
    });
    await page.clock.install();await boot(page,`${base}/?islands=fake&fakeworld=vis33_camera&fakeplayer=me&fakeflags=perimeter_walls,wall_recovery`);
    await page.evaluate(async()=>{
      const g=window.__island,i=g.island;await i.dev.setCoins(8000);await i.dev.setWaveBest(40);await i.load();
      for(const [id,kind] of [['cannon_1','cannon'],['cannon_2','mortar'],['cannon_3','cannon'],['cannon_4','harpoon'],['tower_1','watchtower'],['house_1','house'],['house_2','house']])await i.build(id,kind);
      g.settings.hour=11;g.settings.fastTime=false;g.player.position.set(8.5,1.03,12.8);g.view.setPlace('home_islet',g.player.position);
    });
    await settleCards(page);await manage(page);
    await page.evaluate(async cells=>{
      const i=window.__island.island;
      for(let start=0;start<cells.length;start+=32){
        assertLocal(await i.startWalls(),'builder opens');
        for(const cell of cells.slice(start,start+32))assertLocal(i.wallBuilder.tap(cell.x,cell.z),'draft accepts exact cell');
        assertLocal((await i.wallBuilder.quote())?.ok,'real quote accepted');assertLocal((await i.wallBuilder.confirm())?.ok,'real payment accepted');
      }
      await i.upgrade('wall_1');
      function assertLocal(value,message){if(!value)throw Error(message);}
    },fixture);
    await settleCards(page);
    await village(page).getByRole('button',{name:'Exit village mode',exact:true}).click();await manage(page);
    const paid=await wallet(page);assert.equal(paid.coins,6660);assert.equal(paid.walls.length,102);
    const entry=await capture(page,out,`${mode}-entry-${width}x${height}.png`),buttons=await hitButtons(village(page));
    if(mode==='after')assert.ok(entry.zoom>.95&&entry.zoom<1.05,'initial close scale');else assert.ok(entry.zoom<.5,'old complete-island entry');
    const bar=await village(page).boundingBox(),quests=await page.locator('.quest-strip').boundingBox();
    const x=width/2,y=((width<640?quests?.y+quests?.height:80)+bar.y)/2;
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+60,y+20,{steps:6});await page.mouse.up();await page.waitForTimeout(900);
    const dragged=await page.evaluate(()=>({camera:window.__island.camera.position.toArray(),zoom:window.__island.camera.zoom}));
    if(mode==='after')assert.ok(Math.abs(dragged.camera[0]-entry.camera[0])>1,'working drag pans');
    assert.equal(await page.locator('.island-card-build[open]').count(),0,'drag does not select');
    await page.keyboard.down('Tab');await page.waitForFunction(()=>window.__island.camera.zoom<.5);await page.waitForTimeout(700);
    const peek=await page.evaluate(()=>({camera:window.__island.camera.position.toArray(),zoom:window.__island.camera.zoom}));
    await page.keyboard.up('Tab');await page.waitForFunction(expected=>Math.abs(window.__island.camera.zoom-expected.zoom)<.005&&Math.abs(window.__island.camera.position.x-expected.camera[0])<.05,dragged);
    await village(page).getByRole('button',{name:'Fit village',exact:true}).click();await page.waitForFunction(()=>window.__island.camera.zoom<.5&&Math.abs(window.__island.camera.position.x)<.05);
    const fit=await capture(page,out,`${mode}-fit-${width}x${height}.png`);assert.ok(Math.abs(fit.zoom-peek.zoom)<.005,'Fit and Tab use same frame');
    let focus=null;
    if(mode==='after'){
      focus=await page.evaluate(()=>window.__island.view.focusVillage({x:13,z:-15,lift:1}));await page.waitForTimeout(1100);
      assert.equal(focus,true,'public camera API focuses remote selected anchor');
    }
    const pick=await groundPoint(page,[13,-15],.7);assert.ok(pick.x>0&&pick.x<width&&pick.y>0&&pick.y<height,'remote ground anchor is on screen');
    await page.mouse.click(pick.x,pick.y);await page.locator('.island-card-build[open]').waitFor();
    assert.match(await page.locator('.island-card-build[open]').innerText(),/Mortar/,'actual ground pick opens the paid remote mortar');
    assert.deepEqual(await wallet(page),paid,'camera actions do not alter paid layout');
    assert.deepEqual(await page.evaluate(()=>window.__island.player.position.toArray()),entry.captain,'management preserves captain');
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    checks.push({width,height,paid,entry,buttons,dragged,peek,fit,focusApiDiagnostic:focus,pick,pageErrors:errors,externalRequests:external,consoleErrors});
    await context.close();
  }
  assert.equal(head(),source,'runtime remained frozen');
  await writeFile(join(out,'report.json'),JSON.stringify({mode,source,sourceTree,scope:'actual old-art camera regression, not new-look acceptance; explicit focus is a public camera API diagnostic until consuming UI hooks land',fixture:'declared8000coins/best40/seven paid buildings/102paid ring/one20coin upgrade; long drafts use public builder; entry/Fit/Tab/drag/pick use real controls',checks},null,2)+'\n');
  console.log(`PASS: ${mode} old-art camera at1280x720/375x812;102walls/6660coins unchanged; entry/Fit/Tab/drag/ground pick;0page errors/external`);
}finally{await browser?.close();await server.close();}
