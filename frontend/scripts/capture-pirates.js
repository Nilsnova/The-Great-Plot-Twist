// Lane P evidence: the pirate wave in the real game (?pirates=demo, fake API, offline fixtures).
// node scripts/capture-pirates.js [all|shots|island|wall|point|perf|mobile]. Writes PNGs and pirates.json into
// SHOTS_DIR (default: the fri6-integration evidence folder, g31-shots/waves).
import {mkdir,writeFile} from 'node:fs/promises';
import {openWorldBrowser,measure} from './world-browser-tools.js';

const mode=process.argv[2]??'all',shotsDir=process.env.SHOTS_DIR??'/Users/nilslenke/Developer/fri6-integration/g31-shots/waves';
await mkdir(shotsDir,{recursive:true});
const env=await openWorldBrowser(),report={checked:new Date().toISOString(),shots:[],perf:{},notes:[]};
const wait=(page,ms)=>page.waitForTimeout(ms);
const shooter=(page,suffix='')=>async name=>{const path=`${shotsDir}/${name}${suffix}.png`;await page.screenshot({path});report.shots.push(path);};
async function frontDoor(page,query){
  await page.goto(`${env.url}/?${query}`);await page.locator('#play').waitFor();
  await page.locator('#play').click();
  // The intro and the goal card show on a first visit; a later visit in the same browser may skip them.
  if(await page.locator('dialog.cutscene[open]').waitFor({timeout:20000}).then(()=>true,()=>false))await page.getByRole('button',{name:'Skip',exact:true}).click();
  if(await page.locator('.goal-card[open]').waitFor({timeout:15000}).then(()=>true,()=>false))await page.getByRole('button',{name:'Got it',exact:true}).click();
  await page.waitForFunction(()=>window.__pirates&&window.__island?.world.current,null,{timeout:30000});
  await page.evaluate(()=>window.__pirates.ready);
  await page.waitForFunction(()=>!window.__island.world.busy&&!document.querySelector('dialog[open]'),null,{timeout:30000});
  await page.evaluate(()=>{for(const node of document.querySelectorAll('.demo-splash,.pirate-demo-hint,.quest-strip'))node.remove();});
}
const stand=(page,x,z)=>page.evaluate(([x,z])=>{const g=window.__island,p=g.player.position;p.set(x,g.world.current.groundHeight(x,z),z);g.view.setPlace(g.world.current.id,p);},[x,z]);
const noon=page=>page.evaluate(async()=>{const w=await import('/src/world/weather.js');window.__island.settings.hour=12;window.__island.settings.fastTime=false;w.setWeather(w.presets.clear);});
const skipCutscenes=page=>page.evaluate(()=>{const timer=setInterval(()=>{const skip=[...document.querySelectorAll('dialog.cutscene[open] .cutscene-skip')][0];skip?.click();},150);window.__skipTimer=timer;});
const waveState=page=>page.evaluate(()=>{const w=window.__pirates.pirates.island.wave??window.__pirates.pirates.point?.controller.wave;return w?{phase:w.state.phase,ships:w.state.ships.length,sunk:w.state.sunk,total:w.state.total,hp:w.state.islandHp,walls:w.state.walls,time:w.state.time,done:w.done}:null;});
async function until(page,test,timeout=60000,every=100){const end=Date.now()+timeout;while(Date.now()<end){const state=await waveState(page);if(await test(state))return state;await wait(page,every);}return waveState(page);}

async function islandShots(page,suffix){
  const shot=shooter(page,suffix);
  await frontDoor(page,'pirates=demo&spots=cannon_2,cannon_3,wall_1,wall_2');await noon(page);
  const cannon=await page.evaluate(()=>window.__pirates.defenses.find(item=>item.id==='cannon_2'));
  await stand(page,cannon.x-1.4,cannon.z+.6);await wait(page,600);
  await page.keyboard.press('KeyB');
  await until(page,s=>s&&s.phase==='countdown');await wait(page,1300);await shot('p01-countdown');
  await until(page,s=>s&&s.ships>=1&&s.time>4,30000);await wait(page,1500);await shot('p02-ships-arriving');
  // Cannon fire with a ball in the air and a splash: shoot by hand as soon as a ship is in sight.
  await until(page,s=>s&&s.ships>=1&&s.time>9,30000);
  for(let i=0;i<4;i++){await page.keyboard.press('KeyE');await wait(page,180);}
  await wait(page,90);await shot('p03-cannon-fire');
  await until(page,s=>s&&s.sunk>=1,40000,50);await wait(page,350);await shot('p04-ship-sinking');
  const end=await until(page,s=>s===null||s.done,80000,50);report.notes.push({islandWaveEnd:end});
  await wait(page,500);await shot('p06-wave-won');
  await page.locator('dialog.cutscene[open]').waitFor({timeout:8000}).catch(()=>null);await wait(page,1500);await shot('p07-wave-won-cutscene');
  await page.locator('dialog.cutscene[open] .cutscene-skip').click().catch(()=>null);
}
async function wallShots(page,suffix){
  // Walls only on the east beach and one cannon far away: the pirates batter the wall.
  const shot=shooter(page,suffix);
  await frontDoor(page,'pirates=demo&spots=cannon_3,wall_1,wall_2&wave=3');await noon(page);await skipCutscenes(page);
  const wall=await page.evaluate(()=>window.__pirates.defenses.find(item=>item.id==='wall_1'));
  await stand(page,wall.x-2.2,wall.z+.4);
  await page.keyboard.press('KeyB');
  await until(page,s=>s&&s.walls.some(w=>w.id==='wall_1'&&w.hp<w.maxHp*.6),70000);await wait(page,300);await shot('p05-damaged-wall');
  await page.keyboard.press('KeyE');await wait(page,700);await shot('p05b-repairing-wall');
}
async function pointShots(page,suffix){
  const shot=shooter(page,suffix);
  await frontDoor(page,'pirates=demo&place=point');await noon(page);
  await stand(page,3.5,-1.5);await wait(page,700);await shot('p08-pirate-point-bell');
  await page.keyboard.press('KeyB');
  await page.locator('dialog.cutscene[open]').waitFor({timeout:8000}).catch(()=>null);await wait(page,1800);await shot('p09-armada-cutscene');
  await skipCutscenes(page);
  await stand(page,9,-3);
  await page.waitForFunction(()=>window.__pirates.pirates.point.controller.wave?.state.ships.some(ship=>ship.kind==='flagship'),null,{timeout:60000});
  await wait(page,4500);await shot('p10-pirate-point-flagship');
  // Light lamp 2 (hold E); the rehearsal helpers light the other two.
  await page.keyboard.down('KeyE');await wait(page,1200);await shot('p11-lamp-hold');await wait(page,1200);await page.keyboard.up('KeyE');
  await page.waitForFunction(()=>window.__pirates.pirates.point.controller.wave?.state.lampsLit,null,{timeout:20000});
  await wait(page,500);await shot('p12-lamps-beam');
  await until(page,s=>s===null||s.done,90000);report.notes.push({pointEnd:await page.evaluate(()=>window.__pirates.pirates.point.controller.wave?.result??'cleaned up')});
}
async function perfRun(page){
  await frontDoor(page,'pirates=demo&perf=1&spots=wall_1,wall_2&weather=storm&wave=9&hp=2000');await noon(page);await skipCutscenes(page);
  await stand(page,12,6);await page.keyboard.press('KeyB');
  const state=await until(page,s=>s&&s.ships>=20,90000,250);
  await wait(page,500);
  const numbers=await measure(page,240);
  report.perf['1280x720 storm wave 9']={...numbers,ships:(await waveState(page))?.ships,density:await page.evaluate(()=>window.__island.renderer.userData)};
  await shooter(page)('p13-perf-20-ships');
  report.notes.push({perfState:state});
}
try{
  const {page}=env;
  await page.setViewportSize({width:1280,height:720});
  if(['shots','all','island'].includes(mode))await islandShots(page,'');
  if(['shots','all','wall'].includes(mode))await wallShots(page,'');
  if(['shots','all','point'].includes(mode))await pointShots(page,'');
  if(mode==='perf'||mode==='all')await perfRun(page);
  if(mode==='mobile'||mode==='all'){
    const phone=await env.browser.newContext({viewport:{width:375,height:812},deviceScaleFactor:2,hasTouch:true,isMobile:true}),p=await phone.newPage();
    const {stubOfflineApi}=await import('./api-browser-fixture.js'),{stubWeather}=await import('./weather-browser-fixture.js');
    await stubOfflineApi(p);await stubWeather(p);
    await islandShots(p,'-375');await pointShots(p,'-375');await phone.close();
  }
  report.errors=env.errors.filter(message=>!message.includes('503'));report.external=env.external;
  console.log(JSON.stringify({perf:report.perf,errors:report.errors,notes:report.notes},null,2));
}finally{await writeFile(`${shotsDir}/pirates.json`,JSON.stringify(report,null,2)+'\n');await env.close();}
