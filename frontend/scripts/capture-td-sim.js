// Tower defense v2 evidence (lane S): boss wave, mortar impacts, levels with pips, crew, the break with
// Next wave and a 25+ ship perf reading, in the real game on ?pirates=demo (fake API v2, offline).
// node scripts/capture-td-sim.js. Writes PNGs and td-sim.json into SHOTS_DIR (a NEW folder).
import {mkdir,writeFile} from 'node:fs/promises';
import {openWorldBrowser,measure} from './world-browser-tools.js';

const shotsDir=process.env.SHOTS_DIR??'/Users/nilslenke/Developer/fri6-integration/td-shots/sim';
await mkdir(shotsDir,{recursive:true});
const env=await openWorldBrowser(),report={checked:new Date().toISOString(),shots:[],perf:{},notes:[]};
const wait=(page,ms)=>page.waitForTimeout(ms);
const shot=page=>async name=>{const path=`${shotsDir}/${name}.png`;await page.screenshot({path});report.shots.push(path);};
async function frontDoor(page,query){
  await page.goto(`${env.url}/?${query}`);await page.locator('#play').waitFor();
  await page.locator('#play').click();
  if(await page.locator('dialog.cutscene[open]').waitFor({timeout:20000}).then(()=>true,()=>false))await page.getByRole('button',{name:'Skip',exact:true}).click();
  if(await page.locator('.goal-card[open]').waitFor({timeout:15000}).then(()=>true,()=>false))await page.getByRole('button',{name:'Got it',exact:true}).click();
  await page.waitForFunction(()=>window.__pirates&&window.__island?.world.current,null,{timeout:30000});
  await page.evaluate(()=>window.__pirates.ready);
  await page.waitForFunction(()=>!window.__island.world.busy&&!document.querySelector('dialog[open]'),null,{timeout:30000});
  await page.evaluate(()=>{for(const node of document.querySelectorAll('.demo-splash,.pirate-demo-hint,.quest-strip'))node.remove();});
  await page.evaluate(async()=>{const w=await import('/src/world/weather.js');window.__island.settings.hour=12;window.__island.settings.fastTime=false;w.setWeather(w.presets.clear);});
}
const stand=(page,x,z)=>page.evaluate(([x,z])=>{const g=window.__island,p=g.player.position;p.set(x,g.world.current.groundHeight(x,z),z);g.view.setPlace(g.world.current.id,p);},[x,z]);
const state=page=>page.evaluate(()=>{const c=window.__pirates.pirates.island,w=c.wave;return w?{phase:w.state.phase,ships:w.state.ships.length,kinds:w.state.ships.map(s=>s.kind),shells:w.state.shells?.length??0,
  sunk:w.state.sunk,total:w.state.total,hp:w.state.islandHp,time:w.state.time,done:w.done,inBreak:c.inBreak,boss:w.state.boss}:null;});
async function until(page,test,timeout=60000,every=100){const end=Date.now()+timeout;while(Date.now()<end){const s=await state(page);if(await test(s))return s;await wait(page,every);}return state(page);}

try{
  const {page}=env;await page.setViewportSize({width:1280,height:720});
  // 1-2: wave 5, the boss warship against level-2 cannons, a mortar and walls; the mortar's shells land.
  await frontDoor(page,'pirates=demo&spots=cannon_1:2,cannon_2:2,cannon_3:2,mortar_1:2,wall_1:2,wall_2:1,wall_5:2&crew=gunner1,carpenter1&wave=5&captain=3');
  await stand(page,15,2);await page.keyboard.press('KeyB');
  await until(page,s=>s&&s.phase==='running',30000);await wait(page,800);await shot(page)('s01-boss-warning-wave5');
  await until(page,s=>s&&s.kinds.includes('warship'),60000);await wait(page,5000);
  for(let i=0;i<3;i++){await page.keyboard.press('KeyF');await wait(page,1300);}
  await shot(page)('s02-boss-warship-fight');
  await until(page,s=>s&&s.shells>0,30000,40);await wait(page,700);await shot(page)('s03-mortar-shell-and-impact');
  // 4: the break after the win: Next wave and the Auto switch.
  const end=await until(page,s=>s===null||s.inBreak||s.done&&!s.inBreak,120000,250);report.notes.push({wave5:end});
  await wait(page,1200);await shot(page)('s04-break-next-wave');
  report.notes.push({breakText:await page.evaluate(()=>document.querySelector('.pirate-break')?.innerText??null)});
  // 5: the full island at level 3 with crew: pips and figures, close up.
  await frontDoor(page,'pirates=demo&full=1&wave=3');
  await stand(page,13,4);await page.keyboard.press('KeyB');
  await until(page,s=>s&&s.phase==='running'&&s.ships>2,40000);await wait(page,3500);await shot(page)('s05-levels-pips-crew');
  await stand(page,6,6);await wait(page,600);await shot(page)('s06-crew-mortars-closeup');
  // 7: perf with 25+ ships: storm wave 25 on a sturdy island.
  await frontDoor(page,'pirates=demo&full=1&weather=storm&wave=25&hp=100000');
  await stand(page,12,6);await page.keyboard.press('KeyB');
  const busy=await until(page,s=>s&&s.ships>=25,120000,250);
  report.notes.push({perfState:busy});
  report.perf['1280x720 storm wave 25 full island']={...await measure(page,240),ships:(await state(page))?.ships};
  await shot(page)('s07-perf-25-ships');
  report.errors=env.errors.filter(message=>!message.includes('503'));report.external=env.external;
  console.log(JSON.stringify({perf:report.perf,errors:report.errors,notes:report.notes},null,2));
}finally{await writeFile(`${shotsDir}/td-sim.json`,JSON.stringify(report,null,2)+'\n');await env.close();}
