// Lane U contact sheet: the harbor HUD, goal card, a toast, pause menu, Settings, Keeper's Lock and the
// duel spotlight at 1280×720 and 375×812. Offline fixtures only. SHOTS_DIR=… LABEL=before|after
// node scripts/capture-ui-lane.js
import {mkdir} from 'node:fs/promises';
import {openWorldBrowser} from './world-browser-tools.js';

const dir=process.env.SHOTS_DIR??'/tmp/plot-ui-lane',label=process.env.LABEL??'after';
await mkdir(dir,{recursive:true});
const env=await openWorldBrowser(),{page}=env;
const lockView={question:'What does the sky over Lisbon look like right now?',
  note:'This lock uses the real weather of your place right now (Open-Meteo). Your place is used for this question only and is never stored.',
  place:{name:'Lisbon',latitude:38.72,longitude:-9.14,source:'ip'},weatherSource:'live',
  choices:[{id:'clear',label:'Sunny or clear'},{id:'cloudy',label:'Cloudy'},{id:'rain',label:'Rain'},{id:'fog',label:'Fog or mist'},{id:'snow',label:'Snow'}],
  opened:false,hintReady:false,attribution:'Weather data by Open-Meteo.com, adapted for the game'};
await page.route('**/api/lock**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(lockView)}));
const teleport=(x,z)=>page.evaluate(([x,z])=>{const g=window.__island,p=g.player.position;p.set(x,g.world.current.groundHeight(x,z),z);},[x,z]);
const escapeAll=async()=>{for(let i=0;i<4&&await page.locator('dialog[open]').count();i++){await page.keyboard.press('Escape');await page.waitForTimeout(250);}};
async function frontDoor(url,size,shotCard){
  await page.goto(url);await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});await page.goto(url);
  await page.locator('#play').waitFor();await page.locator('#play').click();
  await page.locator('dialog.cutscene[open]').waitFor({timeout:30000});
  await page.getByRole('button',{name:'Skip',exact:true}).click();
  await page.locator('.goal-card[open]').waitFor({timeout:30000});await page.waitForTimeout(400);
  if(shotCard)await page.screenshot({path:`${dir}/${label}-goal-card-${size}.png`});
  await page.getByRole('button',{name:/Got it|Let's go/}).click();
  await page.waitForFunction(()=>window.__island?.classDemo&&window.__island.world.current?.id==='saltreach_harbor'&&!document.querySelector('dialog[open]'),null,{timeout:30000});
}
try{
  for(const [width,height] of [[1280,720],[375,812]]){
    await page.setViewportSize({width,height});const size=`${width}`,shot=name=>page.screenshot({path:`${dir}/${label}-${name}-${size}.png`});
    await frontDoor(env.url+'/',size,true);await page.waitForTimeout(1200);await shot('harbor-hud');
    // A toast: the shared toast queue when it exists, else the old HUD toast.
    await page.evaluate(async()=>{
      let module=null;try{module=await import('/src/ui/toasts.js');}catch{}
      if(!module){window.__island.emit({type:'interact',id:'ferry_pier'});return;}
      module.showToast({text:'Goal done: Build a cannon',tone:'success'});
      module.showError({ok:false,status:503,code:'unavailable',message:'The Harbor stalls are closed right now.'});
    });
    await page.waitForTimeout(350);await shot('toast');await page.waitForTimeout(3500);
    await page.keyboard.press('Escape');await page.locator('.shell-screen[open][data-mode=pause]').waitFor();await page.waitForTimeout(300);await shot('pause-menu');
    await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('.preferences').waitFor();await page.waitForTimeout(400);await shot('settings');
    await escapeAll();
    // Keeper's Lock: join the class harbor, walk to the lock, press E.
    await page.evaluate(()=>{sessionStorage.setItem('plot_twist_join_v1','harbor');});
    await page.goto(env.url+'/');await page.locator('#play').click();
    await page.waitForFunction(()=>window.__island?.classDemo&&window.__island.world.current?.id==='saltreach_harbor'&&!document.querySelector('dialog[open]'),null,{timeout:30000});
    await page.waitForTimeout(3000);
    await teleport(6.2,15.3);await page.locator('.demo-prompt button').waitFor();await page.keyboard.press('KeyE');
    await page.locator('.lock-modal[open] .lock-choice').first().waitFor();await page.waitForTimeout(400);await shot('keepers-lock');
    await escapeAll();
    // Duel spotlight: the rehearsal with simulated captains.
    await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});
    await frontDoor(env.url+'/?demo=1',size,false);
    await page.waitForFunction(()=>window.__island.classDemo.debug.others.length>=6,null,{timeout:15000});await page.waitForTimeout(800);
    const bot=await page.evaluate(()=>{const spots=[[6.2,14.2],[-5,16.4],[-2,14.6],[2.4,14.6]];const others=window.__island.classDemo.debug.others;
      return others.find(o=>spots.every(([x,z])=>Math.hypot(o.x+.8-x,o.y-z)>2.6))??others[0];});
    await teleport(bot.x+.8,bot.y);await page.waitForTimeout(300);await page.locator('.demo-prompt button').waitFor();await page.keyboard.press('KeyE');
    await page.locator('.duel-spotlight[open]').waitFor();await page.waitForTimeout(400);await shot('duel-spotlight');
    await escapeAll();
  }
  console.log(JSON.stringify({dir,label,errors:env.errors.filter(m=>!m.includes('503')),external:env.external}));
}finally{await env.close();}
