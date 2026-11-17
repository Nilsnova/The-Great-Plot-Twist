import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {openWorldBrowser, settle} = await import(pathToFileURL(resolve('scripts/world-browser-tools.js')));
const out = process.argv[2], mode = process.argv[3];
assert.ok(out && ['before','after'].includes(mode)); await mkdir(out, {recursive:true});
const env = await openWorldBrowser({hmr:false}), {page} = env;
const closeCards=async()=>{
  for(let i=0,calm=0;i<80&&calm<4;i++){
    const skip=page.getByRole('button',{name:/^Skip all/}),ok=page.getByRole('button',{name:'Got it',exact:true});
    if(await skip.count()){calm=0;await skip.first().evaluate(n=>n.click());}
    else if(await ok.count()){calm=0;await ok.first().evaluate(n=>n.click());}
    else if(await page.locator('dialog[open]').count()){calm=0;await page.keyboard.press('Escape');}
    else calm++;
    await page.waitForTimeout(250);
  }
  assert.equal(await page.locator('dialog[open]').count(),0,'unlock cards closed');
};
try {
  await page.setViewportSize({width:1280,height:720}); await page.goto(`${env.url}/?islands=fake`);
  await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.locator('.shell-screen[open]').waitFor(); await page.locator('#play').click();
  const ready = () => page.evaluate(() => window.__island?.world.current?.id === 'home_islet' && !!window.__island.island?.island && !document.querySelector('dialog[open]'));
  for (let i=0,calm=0;i<160&&calm<3;i++) {
    if (await ready()) { calm++; await page.waitForTimeout(500); continue; }
    calm=0; const dialog=page.locator('dialog[open]').last();
    for (const name of ['Create a game','Look around first','Skip','Got it']) {
      const button=dialog.getByRole('button',{name,exact:true});
      if (await button.count()) { await button.first().evaluate(node=>node.click()).catch(()=>{}); break; }
    }
    await page.waitForTimeout(500);
  }
  assert.ok(await ready(),'island ready');
  await page.evaluate(async()=>{
    const g=window.__island,i=g.island;g.settings.hour=11;g.settings.fastTime=false;
    i.dev.setCoins(4000);i.dev.setWaveBest(6);await i.load();
    for(const spot of i.island.spots.filter(spot=>spot.kind==='wall'||spot.id.startsWith('wall_'))) await i.build(spot.id,'wall');
    await i.load();
  });
  await closeCards();
  const initial=await page.evaluate(async()=>{
    const i=window.__island.island;
    for(const [id,x,z] of [['wall_1',-11.5,-1],['wall_2',-7.5,-1]]){
      if(!i.moveMode.start(id))throw new Error(`cannot start ${id}`);i.moveMode.tap(x,z);
      if(!i.moveMode.state.ok)throw new Error(`fixture target invalid: ${id}`);
      const result=await i.moveMode.confirm();if(!result?.ok)throw new Error(`fixture move refused: ${id}`);
    }
    await i.load();return i.island.spots.filter(s=>s.built&&s.kind==='wall').map(({id,x,z,level})=>({id,x,z,level}));
  });
  assert.equal(initial.length,12,'all twelve existing wall slots built');
  for(const [width,height] of [[1280,720],[375,812]]) {
    await page.setViewportSize({width,height});
    await page.evaluate(()=>{const g=window.__island;g.player.position.set(-6,1.03,0);g.view.setPlace('home_islet',g.player.position);});
    await closeCards();await page.waitForTimeout(1800);await settle(page);
    await page.waitForFunction(()=>window.__island.world.current.group.visible===true,null,{timeout:15000});
    const frame=await page.evaluate(()=>{const g=window.__island;return{lost:g.renderer.getContext().isContextLost(),visible:g.world.current.group.visible,drawCalls:g.renderer.info.render.calls};});
    console.log('frame',width,JSON.stringify(frame));assert.equal(frame.lost,false,'WebGL context intact');
    const joins=await page.evaluate(()=>window.__island.world.current.group.getObjectByName('island-wall-connections')?.children.length??0);
    assert.equal(joins,mode==='after'?6:0,'only six full shared sides connect in the unchanged default layout');
    await page.screenshot({path:`${out}/${mode}-${width}x${height}.png`});
  }
  const final=await page.evaluate(()=>window.__island.island.island.spots.filter(spot=>spot.built&&spot.kind==='wall').map(({id,x,z,level})=>({id,x,z,level})));
  assert.deepEqual(final,initial,'drawing and viewport changes never move or upgrade a wall');
  if(mode==='after'){
    const answer=await page.evaluate(()=>window.__island.island.ringBell());assert.ok(answer?.ok,'the normal bell starts a wave');
    await page.waitForFunction(()=>window.__island.world.current.group.getObjectByName('island-wall-connections')?.children.length===0,null,{timeout:20000});
  }
  assert.deepEqual(env.pageErrors,[],'no page exceptions');
  const debug=await page.evaluate(()=>{const g=window.__island;return{lost:g.renderer.getContext().isContextLost(),camera:g.camera.position.toArray(),zoom:g.camera.zoom,drawCalls:g.renderer.info.render.calls};});
  const report={mode,viewports:[[1280,720],[375,812]],walls:initial.length,links:mode==='after'?6:0,positions_unchanged:true,battle_handoff_hidden:mode==='after'?true:null,pageErrors:env.pageErrors,consoleErrors:env.errors,debug,externalRequests:env.external.length,fixture:'Real application fake API; two normal valid Move operations form a T. No production data.'};
  await writeFile(`${out}/report-${mode}.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}catch(error){await page.screenshot({path:`${out}/failure-${mode}.png`}).catch(()=>{});throw error;}
finally{await env.close();}
