// One eligible native shot: trace acceptance, pose reads and actual render frames without changing clocks.
// Run from frontend: node ../docs/evidence/captain-pose-feedback/native-probe.mjs /tmp/pose-probe
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {openWorldBrowser} from '../../../frontend/scripts/world-browser-tools.js';
import {stubOfflineApi} from '../../../frontend/scripts/api-browser-fixture.js';
import {stubWeather} from '../../../frontend/scripts/weather-browser-fixture.js';
const out=process.argv[2]??'/tmp/captain-pose-probe';await mkdir(out,{recursive:true});
const env=await openWorldBrowser({hmr:false}),context=env.page.context(),world=`pose${Date.now().toString(36)}`;
let count=0;
async function enter(name,id,join=false){
  const page=count++?await context.newPage():env.page;
  if(count>1){await stubOfflineApi(page);await stubWeather(page);}
  await page.setViewportSize({width:1280,height:720});
  await page.goto(`${env.url}/?islands=fake&fakeflags=ship_fire&fakeworld=${world}&fakeplayer=${id}&fakename=${name}`);
  await page.locator('#play').click();
  for(let i=0;i<20;i++){
    await page.waitForFunction(()=>document.querySelector('dialog.cutscene[open],.tutorial-card[open],.goal-card[open],.games-card[open],.island-card-lobby[open]'));
    if(await page.locator('.island-card-lobby[open]').count())return page;
    if(await page.locator('.games-card[open]').count()){
      await page.locator('.games-create-button').waitFor();
      if(join){await page.locator('.games-code').fill('k7q2m');await page.locator('.games-card').getByRole('button',{name:'Join',exact:true}).click();}
      else await page.getByRole('button',{name:'Create a game',exact:true}).click();
    }else if(await page.locator('.goal-card[open]').count())await page.getByRole('button',{name:'Got it',exact:true}).click();
    else if(await page.locator('dialog.cutscene[open],.tutorial-card[open]').count())
      await page.getByRole('button',{name:'Skip',exact:true}).click({timeout:5000}).catch(()=>{}); // The arrival can close by itself.
  }
  throw new Error('Could not reach the island lobby');
}
try{
  const page=await enter('Ianno','me');await enter('Ben','ben',true);
  await page.locator('.island-lobby-start').click();
  await page.waitForFunction(()=>window.__island.island.ui.open!=='lobby');
  await page.evaluate(async()=>{const i=window.__island.island;i.dev.setWaveBest(2);await i.load();await i.ringBell();});
  await page.waitForFunction(()=>window.__island.waves.island.wave?.state?.phase==='running');
  await page.evaluate(async()=>{
    window.poseStats=(await import('/src/pirates/captain-stats.js')).captainStats;
    const g=window.__island,c=g.waves.island;
    const t=window.poseTrace={submitted:null,events:[],reads:[],renders:[],updates:[],raf:[],quality:g.settings.quality};
    let previous=performance.now();
    const raf=()=>{const at=performance.now();if(t.raf.length<200)t.raf.push({at,gap:at-previous,hidden:document.hidden});previous=at;if(t.submitted===null||at-t.shotAt<5000)requestAnimationFrame(raf);};requestAnimationFrame(raf);
    const pose=c.pose.bind(c);c.pose=by=>{const value=pose(by);if(t.submitted!==null&&t.reads.length<100)t.reads.push({at:performance.now(),by,value});return value;};
    const update=c.update.bind(c);c.update=dt=>{const before=c.wave?.ticks,at=performance.now();const result=update(dt);if(t.submitted!==null&&t.updates.length<100)t.updates.push({at,end:performance.now(),before,after:c.wave?.ticks});return result;};
    g.on('captain_fired',event=>{if(t.submitted===null)return;const row={at:performance.now(),event,ticks:c.wave?.ticks};t.events.push(row);queueMicrotask(()=>{row.afterNoteAt=performance.now();row.pose=pose(event.by);});});
    const render=g.renderer.render.bind(g.renderer);g.renderer.render=(scene,camera)=>{
      let meshes=[];
      if(t.submitted!==null&&scene===g.scene&&t.renders.length<100){scene.traverse(item=>{
        if(item.name!=='captain-pose'||!item.visible)return;
        for(let parent=item.parent;parent;parent=parent.parent)if(!parent.visible)return;
        meshes.push({frame:item.userData.pose,figure:item.parent?.parent?.name==='other-captains'});
      });t.renders.push({at:performance.now(),meshes});}
      const result=render(scene,camera);
      if(!t.frameImage&&meshes.some(item=>!item.figure))t.frameImage=g.renderer.domElement.toDataURL('image/png');
      return result;
    };
  });
  await page.waitForFunction(()=>{
    const g=window.__island,c=g.waves.island,load=g.island.captainLoadout(),stats=window.poseStats(load.level,load.skills,load.weapon);
    return c.state?.phase==='running'&&c.state.ships.some(ship=>ship.hp>0&&Math.hypot(ship.x,ship.z)<14+stats.range*.6);
  },null,{timeout:30000,polling:100});
  await page.evaluate(()=>{
    const g=window.__island,c=g.waves.island,load=g.island.captainLoadout(),stats=window.poseStats(load.level,load.skills,load.weapon);
    const target=c.state.ships.filter(ship=>ship.hp>0).sort((a,b)=>Math.hypot(a.x,a.z)-Math.hypot(b.x,b.z))[0];
    const radius=Math.hypot(target.x,target.z),x=target.x*14/radius,z=target.z*14/radius;
    g.player.position.set(x,g.world.current.groundHeight?.(x,z)??1.03,z);c.autoBlade=false;
    const actor=c.state.party.find(hero=>hero.id===c.playerId),t=window.poseTrace;
    t.eligible={waveId:c.wave.info.waveId,by:c.playerId,targetId:target.id,targetHp:target.hp,actorHp:actor?.hp,down:actor?.down,distance:Math.hypot(target.x-x,target.z-z),range:stats.range};
    t.shotAt=performance.now();t.submitted=c.shoot(target.id);
  });
  await page.waitForTimeout(4000);
  const {frameImage,...trace}=await page.evaluate(()=>window.poseTrace);
  const accepted=trace.events.some(row=>row.event.by===trace.eligible.by&&row.event.targetId===trace.eligible.targetId);
  const drawn=trace.renders.some(row=>row.meshes.some(mesh=>!mesh.figure&&mesh.frame?.includes('musket')));
  const files=['src/game.js','src/player/controller.js','src/pirates/controller.js','src/pirates/game-wiring.js','src/pirates/live-attack-feedback.js','src/pirates/poses.js'];
  const sourceFiles=Object.fromEntries(await Promise.all(files.map(async path=>[path,await readFile(path).then(bytes=>createHash('sha256').update(bytes).digest('hex'),()=>null)])));
  const report={source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceFiles,
    dirty:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),accepted,drawn,trace,pageErrors:env.pageErrors,consoleErrorCount:env.consoleErrors.length,external:env.external};
  await writeFile(`${out}/trace.json`,JSON.stringify(report,null,2)+'\n');
  if(frameImage)await writeFile(`${out}/posed-frame.png`,Buffer.from(frameImage.split(',')[1],'base64'));
  assert.ok(trace.eligible.distance<=trace.eligible.range&&trace.submitted&&accepted,'one eligible shot was actually accepted');
  assert.equal(trace.quality,'high');assert.deepEqual(env.errors,[]);assert.deepEqual(env.external,[]);
  if(process.env.EXPECT_POSE!=='0')assert.ok(drawn,'the accepted shot reached an actually rendered body pose');
  console.log(JSON.stringify({accepted,drawn,quality:trace.quality,pageErrors:env.pageErrors.length,out}));
}finally{await env.close();}
