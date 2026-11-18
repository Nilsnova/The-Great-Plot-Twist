// Passive diagnostic only: one eligible accepted shot, ordinary fake-game setup, no pose/clock/FPS changes.
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {join, resolve} from 'node:path';

const frontend=resolve(process.argv[2]),out=resolve(process.argv[3]);
process.chdir(frontend); delete process.env.TEST_URL;
const {openWorldBrowser}=await import(pathToFileURL(join(frontend,'scripts/world-browser-tools.js')));
const {stubOfflineApi}=await import(pathToFileURL(join(frontend,'scripts/api-browser-fixture.js')));
const {stubWeather}=await import(pathToFileURL(join(frontend,'scripts/weather-browser-fixture.js')));
const cards=JSON.parse(await readFile(join(frontend,'src/campaign/tutorials.json'),'utf8')).cards.map(card=>card.id);
await mkdir(out,{recursive:true});
const git=value=>execFileSync('git',['rev-parse',value],{cwd:frontend,encoding:'utf8'}).trim();
const report={kind:'passive diagnostic; not multiplayer acceptance',source:git('HEAD'),frontendTree:git('HEAD:frontend/src'),
  started:new Date().toISOString(),world:`pose${Date.now().toString(36)}`,deadlineSeconds:90,scriptSha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),pages:[],phases:[]};
const phase=name=>{report.phases.push({name,at:Date.now()});return writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');};
let env, deadline, failure=null; const pages=[];
async function attach(page,name,id,joinCode=null){
  await page.setViewportSize({width:960,height:600});
  if(pages.length){await stubOfflineApi(page);await stubWeather(page);}
  await page.route('**/*',route=>route.request().url().startsWith(env.url)||route.request().url().startsWith('data:')?route.fallback():route.abort());
  await page.addInitScript(seen=>{
    localStorage.setItem('plot_twist_front_door_v1','1');localStorage.setItem('plot_twist_island_arrival_v1','1');
    localStorage.setItem('tgpt:tutorials:v1',JSON.stringify({version:1,guided:true,seen,games:{}}));
  },cards);
  const row={name,id,page,errors:[]}; pages.push(row);page.on('pageerror',e=>row.errors.push(e.message));
  await page.goto(`${env.url}/?islands=fake&fakeflags=ship_fire&fakeworld=${report.world}&fakeplayer=${id}&fakename=${name}`);
  await page.locator('#play').click(); const games=page.locator('.games-card[open]');await games.waitFor();
  if(joinCode){await games.locator('.games-code').fill(joinCode);await games.getByRole('button',{name:'Join',exact:true}).click();}
  else await games.getByRole('button',{name:'Create a game',exact:true}).click();
  await page.locator('.island-card-lobby[open]').waitFor();return row;
}
async function install(page){
  await page.evaluate(()=>{
    const g=window.__island,c=g.waves.island,a=window.__poseAudit={active:false,rows:[],lastFrame:null};
    const add=row=>{if(a.active&&a.rows.length<1200)a.rows.push({at:performance.now(),hidden:document.hidden,...row});};
    const original=c.pose;
    c.pose=function(by){const value=original.call(this,by);add({type:'actual-pose-get',by,pose:value,shown:c.wave?.shown,finished:c.wave?.finished});return value;};
    g.on('captain_fired',event=>{
      add({type:'captain-fired',by:event.by,t:event.t,ticks:c.wave?.ticks,x:event.x,z:event.z,toX:event.toX,toZ:event.toZ});
      queueMicrotask(()=>add({type:'post-handle-pose',by:event.by,pose:c.pose(event.by),shown:c.wave?.shown,finished:c.wave?.finished}));
    });
    const frame=now=>{if(a.active){const meshes=[];g.scene.traverse(m=>{if(m.name==='captain-pose')meshes.push({visible:m.visible,pose:m.userData.pose,other:m.parent?.parent?.name==='other-captains'});});
      add({type:'raf',gap:a.lastFrame===null?null:now-a.lastFrame,meshes,ticks:c.wave?.ticks});a.lastFrame=now;}
      requestAnimationFrame(frame);};requestAnimationFrame(frame);
  });
}
async function run(){
  env=await openWorldBrowser({hmr:false});await phase('browser-ready');
  const host=await attach(env.page,'Nils','me');
  const code=await host.page.evaluate(()=>window.__island.island.gameCode);assert.ok(code);
  const others=await Promise.all([['Ben','ben'],['Ana','ana'],['Max','max']].map(async([name,id])=>attach(await env.page.context().newPage(),name,id,code)));
  await phase('four-lobbies');await host.page.locator('.island-card-lobby[open]').getByRole('button',{name:'Start',exact:true}).click();
  await Promise.all(pages.map(({page})=>page.waitForFunction(()=>window.__island?.waves&&window.__island.world.current?.id==='home_islet'&&!document.querySelector('dialog[open]'))));
  await host.page.evaluate(async()=>{const i=window.__island.island;i.dev.setCaptain(3);i.dev.setWaveBest(3);i.dev.setCoins(900);await i.load();
    for(const [id,kind] of [['cannon_1','cannon'],['cannon_2','cannon'],['house_1','house'],...['wall_7','wall_8','wall_9','wall_10','wall_11','wall_12'].map(id=>[id,'wall'])])await i.build(id,kind);});
  await Promise.all(pages.map(({page})=>page.evaluate(()=>window.__island.island.load())));
  await Promise.all(pages.map(({page})=>install(page)));await phase('declared-initial-fixture-ready');
  await host.page.evaluate(()=>window.__island.island.ringBell());
  await Promise.all(pages.map(({page})=>page.waitForFunction(()=>window.__island.waves.island.state?.phase==='running')));
  await host.page.waitForFunction(()=>{const g=window.__island,w=g.waves.island;return w.state.ships.some(s=>Math.hypot(s.x,s.z)<=32&&s.hp>0);},null,{timeout:30000});
  const aim=await host.page.evaluate(()=>{const g=window.__island,w=g.waves.island,s=w.state.ships.filter(s=>s.hp>0).sort((a,b)=>Math.hypot(a.x,a.z)-Math.hypot(b.x,b.z))[0],d=Math.hypot(s.x,s.z);
    const x=s.x*14/d,z=s.z*14/d;g.player.position.set(x,g.world.current.groundHeight(x,z),z);return {id:s.id,x,z,by:w.playerId,colour:g.island.captainColour()};});
  await host.page.setViewportSize({width:1280,height:720});await others[0].page.setViewportSize({width:1280,height:720});
  await others[0].page.evaluate(aim=>{const g=window.__island,place=g.island.presencePlace('home_islet');g.experience.simulate({status:'live',place,others:[{id:'me',name:'Nils',x:aim.x,y:aim.z,facing:'front',moving:false,place,colour:aim.colour}],hiddenCount:0,sampledAt:Date.now()});},aim);
  await Promise.all(pages.map(({page})=>page.evaluate(()=>{window.__poseAudit.active=true;})));
  report.aim=aim;await phase('one-shot');report.accepted=await host.page.evaluate(id=>window.__island.waves.island.shoot(id),aim.id);
  await host.page.waitForTimeout(5000);
  await phase('observation-finished');
}
const driver=run();driver.catch(()=>{});
try{await Promise.race([driver,new Promise((_,reject)=>{deadline=setTimeout(()=>reject(new Error('Diagnostic reached90s bound')),90000);})]);}
catch(error){failure={name:error.name,message:error.message};}
finally{
  clearTimeout(deadline);
  for(const row of pages){let trace;try{trace=await row.page.evaluate(()=>window.__poseAudit??null);}catch(error){trace={error:error.message};}
    report.pages.push({name:row.name,id:row.id,errors:row.errors,trace});}
  try{await env?.close();report.closed=true;}catch(error){report.cleanupError=error.message;}
  report.failure=failure;report.finished=new Date().toISOString();await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({source:report.source,accepted:report.accepted,failure,closed:report.closed,phases:report.phases.map(x=>x.name)}));
}
