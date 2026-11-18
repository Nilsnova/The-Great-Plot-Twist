// CW4: synthetic arsenal purchase -> actual integrated fake wave -> bomb pose, at both review sizes.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {openWorldBrowser} from './world-browser-tools.js';

const out=process.argv[2]??'/tmp/cw4-match';
await mkdir(out,{recursive:true});
const env=await openWorldBrowser({hmr:false}),{page}=env;
try {
  await page.setViewportSize({width:1280,height:720});
  await page.goto(`${env.url}/?islands=fake&fakeworld=cw4synthetic&fakeflags=arsenal`);
  await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();for(const key of ['plot_twist_front_door_v1','plot_twist_tutorial_v1','plot_twist_island_arrival_v1'])localStorage.setItem(key,'1');});
  await page.reload();await page.locator('#play').click();
  for(let i=0;i<15;i++) {
    await page.waitForFunction(()=>document.querySelector('dialog[open]')||window.__island?.world.current?.id==='home_islet',null,{timeout:60000});
    if(await page.locator('.games-card[open]').count())await page.locator('.games-card[open]').getByRole('button',{name:'Create a game',exact:true}).click();
    else if(await page.locator('.goal-card[open]').count())await page.getByRole('button',{name:'Got it',exact:true}).click();
    else if(await page.locator('dialog.cutscene[open],.tutorial-card[open]').count())await page.getByRole('button',{name:'Skip',exact:true}).click();
    else if(await page.locator('.island-card-lobby[open]').count()||await page.evaluate(()=>window.__island?.world.current?.id==='home_islet'))break;
    await page.waitForTimeout(200);
  }
  await page.waitForFunction(()=>!!window.__island?.island?.island?.spots,null,{timeout:30000});
  if(await page.locator('.island-card-lobby[open]').count())await page.locator('.island-lobby-start').click();
  for(let i=0;i<4&&await page.locator('dialog[open]').count();i++)await page.keyboard.press('Escape');
  const purchase=await page.evaluate(async()=>{
    const g=window.__island,i=g.island;g.settings.hour=12;i.dev.setWaveBest(10);i.dev.setCoins(5000);await i.load();
    const {createFakeIslandTransport}=await import('/src/pirates/fake-api.js');
    const result=await createFakeIslandTransport().post('/api/island/arsenal/buy',{weapon:'fire_bombs',actionUid:'cw4-bomb-purchase'});
    await i.arsenal.refresh();i.dev.setWaveBest(2);await i.load();
    window.__cw4Fired=[];g.on('captain_fired',event=>window.__cw4Fired.push(event.weapon));
    return {ok:result.ok,weapon:i.captainLoadout().weapon};
  });
  assert.deepEqual(purchase,{ok:true,weapon:'fire_bombs'});
  assert.equal(await page.evaluate(async()=> (await window.__island.island.ringBell()).ok),true);
  await page.waitForFunction(()=>window.__island.waves.island.wave?.state.ships.length>0,null,{timeout:90000});
  for(const [width,height] of [[1280,720],[375,812]]) {
    await page.setViewportSize({width,height});let fired=false;
    for(let attempt=0;attempt<80&&!fired;attempt++) {
      fired=await page.evaluate(()=>{
        const g=window.__island,ships=g.waves.island.wave?.state.ships??[];
        if(!ships.length)return false;
        const ship=ships.reduce((a,b)=>Math.hypot(a.x,a.z)<Math.hypot(b.x,b.z)?a:b),d=Math.hypot(ship.x,ship.z);
        const x=ship.x*14/d,z=ship.z*14/d;g.player.position.set(x,g.world.current.groundHeight(x,z),z);
        return g.waves.island.shoot();
      });
      if(!fired)await page.waitForTimeout(250);
    }
    assert.ok(fired,'the carried bomb fired in the actual fake wave');
    await page.waitForFunction(()=>{let visible=false;window.__island.scene.traverseVisible(item=>{if(item.name==='captain-pose'&&item.userData.pose?.includes('fire_bombs'))visible=true;});return visible;},null,{timeout:5000,polling:'raf'});
    await page.screenshot({path:`${out}/integrated-fake-bomb-${width}x${height}.png`});
  }
  assert.ok((await page.evaluate(()=>window.__cw4Fired)).every(weapon=>weapon==='fire_bombs'));
  assert.deepEqual(env.errors,[]);assert.deepEqual(env.external,[]);
  await writeFile(`${out}/match-check.json`,JSON.stringify({synthetic:true,weapon:'fire_bombs',viewports:[[1280,720],[375,812]],browserErrors:env.errors,externalRequests:env.external},null,2));
  console.log(`capture-weapon-match: OK (integrated fake wave, carried fire bombs, 2 viewports); ${out}`);
}finally{await env.close();}
