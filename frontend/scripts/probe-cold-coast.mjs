// Actual cold coast GPU readback; coordinator grants the sole browser lane.
// node scripts/probe-cold-coast.mjs <runtime-frontend> <output> <before|after>
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {readFile,mkdir,writeFile,mkdtemp} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {boot,manage,settleCards,capture} from './perimeter-game-ui.mjs';
import {stubOfflineApi} from './api-browser-fixture.js';
const root=process.argv[2],out=process.argv[3],mode=process.argv[4];assert.ok(root&&out&&['before','after'].includes(mode)); await mkdir(out,{recursive:true});
const source=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const server=await createServer({root,configFile:false,envDir:false,logLevel:'error',cacheDir:await mkdtemp(join(tmpdir(),'coast-d064-')),define:{__BUILD_STAMP__:JSON.stringify({sha:source,builtAt:new Date().toISOString()})},server:{host:'127.0.0.1',port:0,hmr:false}});let browser;
try{await server.listen();const base=`http://127.0.0.1:${server.httpServer.address().port}`;browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true});const page=await browser.newPage({viewport:{width:1280,height:720}});
await stubOfflineApi(page);await page.addInitScript(()=>{localStorage.setItem('plot_twist_front_door_v1','1');localStorage.setItem('plot_twist_island_arrival_v1','1');localStorage.setItem('tgpt:tutorials:v1',JSON.stringify({version:1,guided:true,seen:[],games:{}}));});
await boot(page,base+'/?islands=fake&fakeworld=coast_probe&fakeplayer=me&fakeflags=perimeter_walls,wall_recovery');
await page.evaluate(async()=>{const g=window.__island,i=g.island;await i.dev.setCoins(8000);await i.dev.setWaveBest(40);await i.load();for(const [id,kind] of [['cannon_1','cannon'],['cannon_2','mortar'],['cannon_3','cannon'],['cannon_4','harpoon'],['tower_1','watchtower'],['house_1','house'],['house_2','house']])await i.build(id,kind);g.settings.hour=11;g.settings.fastTime=false;g.player.position.set(8.5,1.03,12.8);g.view.setPlace('home_islet',g.player.position);});
await settleCards(page);await manage(page);const cells=JSON.parse(await readFile(join(root,'tests/fixtures/perimeter-ring.json'),'utf8')).cells;
await page.evaluate(async cells=>{const i=window.__island.island;for(let n=0;n<cells.length;n+=32){await i.startWalls();for(const [x,z] of cells.slice(n,n+32))i.wallBuilder.tap(x,z);if(!(await i.wallBuilder.quote())?.ok)throw Error('quote');if(!(await i.wallBuilder.confirm())?.ok)throw Error('build');}await i.upgrade('wall_1');},cells);
await settleCards(page);await page.getByRole('button',{name:'Exit village mode',exact:true}).click();await manage(page);const shot=await capture(page,out,'actual.png');
const result=await page.evaluate(async()=>{const g=window.__island,sea=g.scene.getObjectByName('sea'),gl=g.renderer.getContext(),u=sea.material.uniforms;const bg=g.world.current.group.children.find(m=>m.userData.legacyGround);bg.updateWorldMatrix(true,false);const image=bg.material.map.image,c=document.createElement('canvas');c.width=256;c.height=192;const ctx=c.getContext('2d');ctx.drawImage(image,0,0,256,192);const rgba=ctx.getImageData(0,0,256,192).data,alpha=Uint8Array.from({length:256*192},(_,i)=>rgba[i*4+3]);const {coastField}=await import('/src/world/water.js');const expected=coastField(alpha),field=u.uCoast.value.image.data;
const gpu=g.renderer.info.programs.filter(p=>gl.getUniformLocation(p.program,'uCoastUv')).map(p=>({name:p.name,key:p.cacheKey,uv:Array.from(gl.getUniform(p.program,gl.getUniformLocation(p.program,'uCoastUv'))??[])}));
const actual=u.uCoastUv.value;const points=[[-20,-14],[20,14],[0,0],[0,16],[7,-10]].map(([x,y])=>{const world=bg.localToWorld(g.player.position.clone().set(x,y,0)),uv=world.clone();uv.z=1;uv.applyMatrix3(actual);return{local:[x,y],world:world.toArray(),uv:uv.toArray(),expected:[x/64+.5,y/48+.5]};});
const {coastUvMatrix}=await import('/src/world/ground-transform.js');const expectedUv=coastUvMatrix(bg.matrixWorld).toArray();return{expectedUv,matrix:bg.matrixWorld.toArray(),materialUv:actual.toArray(),gpu,points,coastOn:u.uCoastOn.value,fieldDiff:field.reduce((n,v,i)=>n+(v!==expected[i]),0),textureFlip:bg.material.map.flipY,fieldFlip:u.uCoast.value.flipY,imageSize:[image.width,image.height],geometryUv:Array.from(bg.geometry.attributes.uv.array),mapMatrix:bg.material.map.matrix.toArray(),materialKeys:Object.keys(g.renderer.properties.get(sea.material)),camera:g.camera.position.toArray()};});
const hashes={};for(const path of ['src/world/ground-transform.js','src/world/water.js','src/world/projection.js','src/art/ground.js','src/art/coast-cliffs.js'])hashes[path]=createHash('sha256').update(await readFile(join(root,path))).digest('hex');const gpuError=Math.max(...result.gpu.flatMap(p=>p.uv.map((v,i)=>Math.abs(v-result.expectedUv[i]))));assert.equal(result.fieldDiff,0);if(mode==='after')assert.ok(gpuError<1e-7,'actual GPU coast matrix matches the visible affine backdrop');else assert.ok(gpuError>1e-3,'cold baseline reproduces stale GPU inverse');await writeFile(join(out,'report.json'),JSON.stringify({mode,source,hashes,gpuError,scope:'actual raw screenshot, identical public paid fixture, real cold sea GPU/material/alpha readback; no canvas override or pixel editing',shot,result},null,2));console.log(JSON.stringify({source,result},null,2));
}finally{await browser?.close();await server.close();}
