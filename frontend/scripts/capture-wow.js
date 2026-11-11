// G29 C4 evidence: 1280 x 720 screenshots of the world graphics (title, harbor day, dusk, night,
// rain, fog, 40 captains with emotes, the perf panel) and frame numbers at 40 simulated captains,
// at 1280 x 720 and on a presenter-sized 1440 x 900 window at 2x density (worst case: storm at night).
// npm run capture:wow -- [label] [--perf-only]. Offline fixtures only; nothing reaches a live service.
// SHOTS_DIR sets the folder (default: the fri6-integration evidence folder, subfolder <label>).
import {mkdir,writeFile} from 'node:fs/promises';
import {openWorldBrowser,measure} from './world-browser-tools.js';
import {stubOfflineApi} from './api-browser-fixture.js';
import {stubWeather} from './weather-browser-fixture.js';

const perfOnly=process.argv.includes('--perf-only'),label=process.argv.slice(2).find(arg=>!arg.startsWith('--'))??'after';
const shotsDir=process.env.SHOTS_DIR??`/Users/nilslenke/Developer/fri6-integration/g29-wow-shots/${label}`;
await mkdir(shotsDir,{recursive:true});
const env=await openWorldBrowser(),report={label,checked:new Date().toISOString(),shots:[],perf:{}};
const frames=(page,n)=>page.evaluate(async n=>{for(let i=0;i<n;i++)await new Promise(requestAnimationFrame);},n);
const shooter=page=>async name=>{await page.screenshot({path:`${shotsDir}/${name}.png`});report.shots.push(`${shotsDir}/${name}.png`);};
async function frontDoor(page,url,titleShot){
  await page.goto(url);await page.locator('#play').waitFor();
  if(titleShot){await page.waitForTimeout(2200);await shooter(page)(titleShot);}
  await page.locator('#play').click();
  await page.locator('dialog.cutscene[open]').waitFor();
  await page.getByRole('button',{name:'Skip',exact:true}).click();
  await page.locator('.tutorial-card[open]').getByRole('button',{name:'Skip',exact:true}).click();
  await page.locator('.goal-card[open]').waitFor({timeout:30000});
  await page.getByRole('button',{name:'Got it',exact:true}).click();
  await page.waitForFunction(()=>window.__island?.classDemo&&window.__island.world.current?.id==='saltreach_harbor'&&!document.querySelector('dialog[open]'),null,{timeout:30000});
  await page.evaluate(()=>document.querySelector('.demo-splash')?.remove());
}
const stand=(page,x,z)=>page.evaluate(([x,z])=>{const g=window.__island,p=g.player.position;p.set(x,g.world.current.groundHeight(x,z),z);g.view.setPlace(g.world.current.id,p);},[x,z]);
const sky=(page,hour,preset)=>page.evaluate(async([hour,preset])=>{const w=await import('/src/world/weather.js');window.__island.settings.hour=hour;window.__island.settings.fastTime=false;w.setWeather(w.presets[preset]);},[hour,preset]);
const panel=page=>page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('.performance-panel dt')].map(term=>[term.textContent,term.nextElementSibling?.textContent])));
async function perfRun(page,key,shot){
  await frontDoor(page,`${env.url}/?demo=1&perf=1&captains=40`);
  await page.waitForFunction(()=>window.__island.experience.stats.drawn>=30,null,{timeout:20000});
  await stand(page,1,17);
  for(const [name,hour,preset] of [['day',12,'clear'],['stormNight',22.5,'storm']]){
    await sky(page,hour,preset);await page.waitForTimeout(2600);
    const numbers=await measure(page,240);
    report.perf[`${key}.${name}`]={...numbers,drawn:await page.evaluate(()=>window.__island.experience.stats.drawn),
      density:await page.evaluate(()=>window.__island.renderer.userData),panel:await panel(page)};
    if(shot&&name==='day')await shot('w30-perf-40-captains');
  }
}
try{
  const {page}=env,shot=shooter(page);
  await page.setViewportSize({width:1280,height:720});
  if(perfOnly){
    await perfRun(page,'1280x720');
    const big=await env.browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2}),bigPage=await big.newPage();
    await stubOfflineApi(bigPage);await stubWeather(bigPage);await perfRun(bigPage,'1440x900@2x');await big.close();
    console.log(JSON.stringify(report.perf,null,2));process.exitCode=0;
  }else{
  await frontDoor(page,env.url+'/','w01-title');
  report.gpu=await page.evaluate(()=>{const gl=window.__island.renderer.getContext(),info=gl.getExtension('WEBGL_debug_renderer_info');return info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):'unknown';});
  for(const [name,hour,preset,x,z] of [['w02-harbor-day',12,'clear',2,18.5],['w03-harbor-dusk',18.6,'clear',2,18.5],['w04-harbor-night',23,'clear',2,18.5],
    ['w05-harbor-night-beam',23,'clear',9,13],['w06-harbor-rain',15,'storm',-2,17],['w07-harbor-storm-night',22.5,'storm',-2,17],['w08-harbor-fog',9,'fog',2,18.5],['w09-harbor-overcast',16,'overcast',-8,12]]){
    await sky(page,hour,preset);await stand(page,x,z);await frames(page,40);await page.waitForTimeout(700);await shot(name);
  }
  // Reduced motion holds the beam still, pointing out to sea: the beam over the water.
  await page.emulateMedia({reducedMotion:'reduce'});await sky(page,23,'clear');await stand(page,14,16);await page.waitForTimeout(600);await shot('w10-beam-over-sea');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await sky(page,12,'clear');
  // 40 simulated captains: emotes (every third captain), then the perf panel.
  await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});
  await perfRun(page,'1280x720',shot);
  await sky(page,12,'clear');await page.waitForTimeout(300);
  await page.evaluate(()=>{const c=window.__island.classDemo.debug.rehearsalCaptains,now=Date.now();c?.bots.forEach((bot,i)=>{if(i%3)return;bot.emote=['wave','cheer','lantern','point','shrug'][i%5];bot.emoteUntil=now+4000;});});
  await page.waitForTimeout(450);await shot('w31-captains-emotes');
  await page.evaluate(()=>{const g=window.__island,fx=g.scene.userData.pixelFx;for(const [x,z] of [[-2,15],[4,18.5]])fx&&(fx.bloom(x,-z*.72+.6,{radius:1.4,life:.9,colour:'#bfe6dc'}),fx.ring(x,-z*.72,{radius:1.8,life:.75,colour:'#d8f0e6'}),fx.ring(x,-z*.72,{radius:3.2,life:1,delay:.12,colour:'#9fd0c4'}),fx.burst(x,-z*.72+.2,{count:14,speed:[1.2,3],angle:Math.PI/2,spread:1.2,gravity:2.5,life:[.5,1],colour:'#e3f6ee',size:[1,1]}));});
  await page.waitForTimeout(260);await shot('w33-arrival-ripples');
  await sky(page,22.5,'clear');await page.waitForTimeout(400);await shot('w32-captains-night');
  // A presenter-sized window at 2x density.
  const big=await env.browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2}),bigPage=await big.newPage();
  await stubOfflineApi(bigPage);await stubWeather(bigPage);
  await perfRun(bigPage,'1440x900@2x');await big.close();
  }
  report.errors=env.errors.filter(message=>!message.includes('503'));report.external=env.external;
  console.log(JSON.stringify(report,null,2));
}finally{await writeFile(`${shotsDir}/wow.json`,JSON.stringify(report,null,2)+'\n');await env.close();}
