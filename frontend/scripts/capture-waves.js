// v3 waves evidence (T17, T18): every wave event and every boss finisher in the real game on ?pirates=demo
// (fake API, offline). Events at 1280 × 800 (fog, storm, night, fire ships, kraken and the galleon at 390 × 844
// too); each finisher kind mid-task, a success and a failure. An in-page player steers the finisher through
// real key and pointer events (the needle to the zone, the sight to the weak spot, the arrow shown).
//   node scripts/capture-waves.js [folder] [all|events|finishers]
import {mkdir,writeFile} from 'node:fs/promises';
import {openWorldBrowser} from './world-browser-tools.js';

const out=process.argv[2]??`/Users/nilslenke/Developer/fri6-integration/td-shots/v3-t17-waves-${new Date().toISOString().replace(/[:.]/g,'-').slice(0,19)}`;
await mkdir(out,{recursive:true});
const mode=process.argv[3]??'all';
const env=await openWorldBrowser(),report={shots:[],notes:[]};
const {page}=env;
const wait=ms=>page.waitForTimeout(ms);
const DESK={width:1280,height:800},PHONE={width:390,height:844};
async function shot(name,size=DESK){
  if(size!==DESK){await page.setViewportSize(size);await wait(900);}
  const path=`${out}/${name}-${size.width}x${size.height}.png`;await page.screenshot({path});report.shots.push(path);
  if(size!==DESK){await page.setViewportSize(DESK);await wait(500);}
}
async function frontDoor(query){
  await page.setViewportSize(DESK);
  await page.goto(`${env.url}/?${query}`);await page.locator('#play').waitFor();await page.locator('#play').click();
  if(await page.locator('dialog.cutscene[open]').waitFor({timeout:20000}).then(()=>true,()=>false))await page.getByRole('button',{name:'Skip',exact:true}).click();
  if(await page.locator('.tutorial-card[open]').waitFor({timeout:15000}).then(()=>true,()=>false))await page.locator('.tutorial-card[open]').getByRole('button',{name:'Skip',exact:true}).click();
  if(await page.locator('.goal-card[open]').waitFor({timeout:15000}).then(()=>true,()=>false))await page.getByRole('button',{name:'Got it',exact:true}).click();
  await page.waitForFunction(()=>window.__pirates&&window.__island?.world.current,null,{timeout:30000});
  await page.evaluate(()=>window.__pirates.ready);
  await page.waitForFunction(()=>!window.__island.world.busy&&!document.querySelector('dialog[open]'),null,{timeout:30000});
  await page.evaluate(async()=>{for(const node of document.querySelectorAll('.demo-splash,.pirate-demo-hint,.quest-strip'))node.remove();
    const w=await import('/src/world/weather.js');window.__island.settings.hour=12;window.__island.settings.fastTime=false;w.setWeather(w.presets.clear);});
}
const stand=(x,z)=>page.evaluate(([x,z])=>{const g=window.__island,p=g.player.position;p.set(x,g.world.current.groundHeight(x,z),z);g.view.setPlace(g.world.current.id,p);},[x,z]);
const state=()=>page.evaluate(()=>{const w=window.__pirates.pirates.island.wave;if(!w)return null;const s=w.state;
  return {phase:s.phase,time:s.time,kinds:s.ships.map(item=>item.kind),event:s.event,finisher:s.finisher?{kind:s.finisher.kind,phase:s.finisher.phase,outcome:s.finisher.outcome,
    task:s.finisher.task,tasks:s.finisher.tasks.map(t=>({task:t.task,score:t.score,goal:t.goal}))}:null,done:w.done};});
async function until(test,timeout=90000,every=150){const end=Date.now()+timeout;let s=null;while(Date.now()<end){s=await state();if(s&&test(s))return s;await wait(every);}return s;}
const quiet=()=>page.evaluate(()=>document.querySelector('.narrator-card:not([hidden]) .narrator-skip')?.click());
async function ring(){await page.evaluate(()=>window.__pirates.ringIsland());await until(s=>s.phase==='running',30000);}

// ---- the events ----
// A light island (one cannon, four walls): the barge reaches anchor, the galleon sails past, the longboats land.
const LIGHT='spots=cannon_2:1,wall_1:2,wall_2:2,wall_3:2,wall_5:2';
const EVENTS=[
  ['fog_bank',12,s=>s.time>6,true,[-2,10]],['storm',12,s=>s.time>6,true,[-2,10]],['night_raid',12,s=>s.time>9,true,[-2,10]],
  ['fire_ships',12,s=>s.kinds.includes('fireship')&&s.time>7,true,[10,6]],['pincer',12,s=>s.time>3.5,false,[-2,10]],['armada',12,s=>s.kinds.filter(k=>k==='cutter').length>5,false,[-2,10]],
  ['siege_barge',12,s=>(s.event?.shells?.length??0)>0,false,[10,6],LIGHT],['treasure_galleon',12,s=>s.kinds.includes('galleon')&&s.time>12,true,[0,14],LIGHT],
  ['smugglers',12,s=>s.kinds.includes('longboat'),false,[0,-12],LIGHT],['kraken',20,s=>s.kinds.includes('tentacle')&&s.time>13,true,[12,4]],
];
for(const [id,wave,ready,phone,[x,z],island='full=1'] of mode==='finishers'?[]:EVENTS){
  await frontDoor(`pirates=demo&${island}&wave=${wave}&event=${id}&hp=100000`);
  await stand(x,z);await ring();
  const s=await until(ready,90000);await quiet();await wait(400);
  report.notes.push({event:id,seen:s?.event?.id,time:s?.time,kinds:[...new Set(s?.kinds??[])]});
  await shot(`event-${id}`);
  if(phone)await shot(`event-${id}`,PHONE);
}

// ---- the finishers: an in-page player through real input events ----
async function autoplay(on){
  await page.evaluate(async on=>{
    const rules=await import('/src/pirates/finisher/rules.js');
    cancelAnimationFrame(window.__autoplay??0);
    if(!on){window.dispatchEvent(new KeyboardEvent('keyup',{code:'Space'}));return;}
    let held=false,lastKey=-1;
    const step=()=>{
      window.__autoplay=requestAnimationFrame(step);
      const c=window.__pirates.pirates.island,f=c.state?.finisher,scene=c.wave?.finisher?.scene;
      if(!f||!scene||f.phase!=='task')return;
      const t=f.tasks[f.task],s=f.sample-t.from,easy=false;
      if(t.task==='haul'){const want=scene.needle<rules.zoneAt(s+2,f.salt);if(want!==held){held=want;window.dispatchEvent(new KeyboardEvent(want?'keydown':'keyup',{code:'Space',bubbles:true}));}}
      if(t.task==='cannon'){
        const stage=document.querySelector('.finisher-stage'),rect=stage.getBoundingClientRect(),spot=rules.spotAt(s+1,f.salt);
        stage.dispatchEvent(new PointerEvent('pointermove',{clientX:rect.left+rect.width*(.1+.8*spot/100),clientY:rect.top+rect.height/2,bubbles:true}));
        if(Math.abs(scene.aim-rules.spotAt(s,f.salt))<4&&s%6===0&&lastKey!==f.sample){lastKey=f.sample;window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyF',bubbles:true}));window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyF',bubbles:true}));}
      }
      if(t.task==='duel'){const L=rules.promptLength(easy),k=Math.floor(s/L);if(s%L===2&&lastKey!==k){lastKey=k;const dir=rules.promptAt(c.playerId,k,f.salt);
        const code=['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'][dir];window.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true}));window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));}}
    };
    step();
  },on);
}
const FINISHERS=[['haul',5,'',true],['cannon',15,'',true],['duel',30,'',false],['redtide',100,'&trigger=0.98',true]];
for(const [kind,wave,extra,play] of mode==='events'?[]:FINISHERS){
  await frontDoor(`pirates=demo&full=1&wave=${wave}&hp=1000000${extra}`);
  await stand(0,-12);await ring();await autoplay(play);
  const begun=await until(s=>s.finisher?.kind===kind,200000,200);
  if(begun?.finisher?.kind!==kind){report.notes.push({finisher:kind,missing:begun});continue;}
  await wait(700);await shot(`finisher-${kind}-title-card`);
  await until(s=>s.finisher?.phase==='task',20000,100);await wait(kind==='redtide'?3500:4000);
  await shot(`finisher-${kind}-mid-task`);
  if(kind==='redtide'){for(const n of [1,2]){await until(s=>s.finisher?.task===n&&s.finisher.phase==='task',40000,150);await wait(3000);await shot(`finisher-redtide-mid-task-${n+1}`);}}
  if(kind==='haul')await shot('finisher-haul-mid-task',PHONE);
  const end=await until(s=>!!s.finisher?.outcome,60000,100);await wait(500);
  report.notes.push({finisher:kind,outcome:end?.finisher?.outcome,tasks:end?.finisher?.tasks});
  await shot(`finisher-${kind}-${end?.finisher?.outcome??'unknown'}`);
  await autoplay(false);
}
report.errors=env.errors.filter(message=>!/Failed to load resource|503|AudioContext|audio device/.test(message));
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({notes:report.notes,errors:report.errors},null,1));
console.log(`capture-waves: ${report.shots.length} shots in ${out}`);
await env.close();
