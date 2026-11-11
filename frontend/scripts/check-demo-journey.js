// G29 C2/C3: the class-demo journey in Chrome. Part 1 (the real lock path with recorded API fixtures):
// title -> Play -> skip the lore cutscene -> goal card -> Saltreach Harbor -> quest strip -> Join the
// class harbor -> the Keeper's Lock with a fixture question and answer. Part 2 (?demo=1 rehearsal, no
// server at all): wave, duel and the three-lamps finale with simulated captains. Part 3 (optional,
// --perf): frame numbers with 0, 8 and 40 drawn captains. Screenshots go to SHOTS_DIR.
// npm run test:demo [-- --perf]. Offline fixtures only; nothing reaches a live service.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {openWorldBrowser,measure} from './world-browser-tools.js';

const shotsDir=process.env.SHOTS_DIR??'/Users/nilslenke/Developer/fri6-integration/g29-wave2-shots';
const perf=process.argv.includes('--perf');
const report={checked:new Date().toISOString(),checks:[],lockRequests:[],perf:null};
const check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};
const cutsceneTitle=()=>page.evaluate(()=>{const dialog=document.querySelector('dialog.cutscene[open]');return dialog?document.getElementById(dialog.getAttribute('aria-labelledby'))?.textContent:null;});
const lockView=(extra={})=>({question:'What does the sky over Lisbon look like right now?',
  note:'This lock uses the real weather of your place right now (Open-Meteo). Your place is used for this question only and is never stored.',
  place:{name:'Lisbon',latitude:38.72,longitude:-9.14,source:'ip'},weatherSource:'live',
  choices:[{id:'clear',label:'Sunny or clear'},{id:'cloudy',label:'Cloudy'},{id:'rain',label:'Rain'},{id:'fog',label:'Fog or mist'},{id:'snow',label:'Snow'}],
  opened:false,hintReady:false,attribution:'Weather data by Open-Meteo.com, adapted for the game',...extra});

await mkdir(shotsDir,{recursive:true});
const env=await openWorldBrowser(),{page}=env;
const shot=name=>page.screenshot({path:`${shotsDir}/${name}.png`});
const teleport=(x,z)=>page.evaluate(([x,z])=>{const g=window.__island,p=g.player.position;p.set(x,g.world.current.groundHeight(x,z),z);},[x,z]);
async function frontDoor(url){
  await page.goto(url);await page.locator('#play').waitFor();await shot(`${url.includes('demo=1')?'20':'01'}-title`);
  await page.locator('#play').click();
  await page.locator('dialog.cutscene[open]').waitFor();
  await page.getByRole('button',{name:'Skip',exact:true}).click();
  await page.locator('.goal-card[open]').waitFor({timeout:30000});
  await page.getByRole('button',{name:'Got it',exact:true}).click();
  await page.waitForFunction(()=>window.__island?.classDemo&&window.__island.world.current?.id==='saltreach_harbor'&&!document.querySelector('dialog[open]'),null,{timeout:30000});
}
try{
  await page.setViewportSize({width:1280,height:720});
  // ---- part 1: the real lock path, recorded answers ----
  let answers=0;
  await page.route('**/api/lock**',route=>{
    const url=new URL(route.request().url()),body=route.request().postDataJSON?.()??null;
    report.lockRequests.push({method:route.request().method(),path:url.pathname,query:url.search,body});
    if(url.pathname==='/api/lock')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(lockView())});
    answers+=1;
    const reply=answers===1?{accepted:false,reason:'wrong',match:null,message:'Not quite. Look out of the window and try again.',lock:lockView({hintReady:true})}
      :{accepted:true,reason:null,match:'close',message:'Close enough: the reading says Cloudy, one step from your answer. The lock opens.',lock:lockView({opened:true})};
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(reply)});
  });
  await frontDoor(env.url+'/');
  await page.waitForTimeout(800);await shot('02-harbor');
  check(await page.locator('.quest-strip').isVisible(),'The quest strip is visible in the harbor');
  check((await page.locator('.quest-item').allTextContents()).join('|').includes("Open the Keeper's Lock"),'The strip lists wave, duel and the lock');
  check(await page.evaluate(()=>document.querySelector('#game').classList.contains('demo-path')&&!document.querySelector('.journal-toggle,.case-toolbar')),'The harbor shows the demo layer and no Journal or case tools');
  await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('button',{name:'Join the class harbor'}).click();
  check(await page.evaluate(()=>window.__island.classDemo.joined&&sessionStorage.getItem('plot_twist_join_v1')==='harbor'),'Join the class harbor remembers the class harbor');
  check(await page.evaluate(()=>window.__island.classDemo.presencePlace('saltreach_harbor')==='class_harbor'),'A joined player announces the class harbor place');
  await page.locator('.demo-splash').waitFor();await shot('03-class-harbor-splash');
  await page.locator('.quest-item').nth(2).click();
  check((await page.locator('.quest-hint').textContent()).includes('lighthouse path'),'Tapping a goal shows its one-line hint');
  await page.locator('.quest-item').nth(2).click();
  await teleport(6.2,15.3);await page.locator('.demo-prompt button').waitFor();await shot('04-lock-prompt');
  await page.keyboard.press('KeyE');await page.locator('.lock-modal[open] .lock-choice').first().waitFor();
  await shot('05-lock-question');
  check((await page.locator('.lock-question').textContent()).includes('Lisbon'),'The lock asks about the sky over the player’s place');
  check(await page.locator('.lock-choice').count()===5,'Five big sky choices with icons');
  await page.locator('.lock-choice[data-choice=fog]').click();
  await page.locator('.lock-status[data-tone=warning]').waitFor();await shot('06-lock-wrong');
  check(await page.getByRole('button',{name:"That's not what I see outside"}).isVisible(),'After a wrong answer the hint path is offered');
  await page.locator('.lock-choice[data-choice=clear]').click();
  await page.locator('dialog.cutscene[open]').waitFor({timeout:10000});await page.waitForTimeout(1200);await shot('07-lock-opens-cutscene');
  check(await cutsceneTitle()==="The Keeper's Lock",'The lock opens with the cutscene "lock opens"');
  await page.getByRole('button',{name:'Skip',exact:true}).click();await page.locator('.u-toast',{hasText:'Reward'}).waitFor();await shot('08-lock-open-reward');
  check((await page.locator('.u-toast',{hasText:'Reward'}).textContent()).includes('brass lamp key'),'After the cutscene a reward line shows');
  check(await page.evaluate(()=>window.__island.classDemo.debug.quests.lock===true),'The lock goal is ticked');
  check(report.lockRequests.filter(request=>request.method==='POST').every(request=>/^[A-Za-z0-9_-]{8,64}$/.test(request.body.actionUid)),'Every answer carries a valid action id');
  check(new Set(report.lockRequests.filter(request=>request.method==='POST').map(request=>request.body.actionUid)).size===2,'Two answers, two action ids');
  // ---- part 2: the rehearsal (no server writes) ----
  await page.unroute('**/api/lock**');
  const writes=[];page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/')&&request.method()!=='GET')writes.push(request.url());});
  await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});
  await frontDoor(env.url+'/?demo=1');
  await page.waitForFunction(()=>window.__island.classDemo.debug.others.length>=10,null,{timeout:15000});
  await page.waitForTimeout(1200);await shot('21-rehearsal-harbor');
  check(await page.evaluate(()=>window.__island.experience.stats.drawn>=10),'Simulated captains are drawn in the harbor');
  check(await page.locator('.presenter-panel,.presenter-reopen').count()===0,'The rehearsal shows no highlights-tour presenter panel over the class harbor');
  // A simulated captain away from the lock and the lamps (those spots win the E key there).
  const nearBot=async()=>{const bot=await page.evaluate(()=>{const spots=[[6.2,14.2],[-5,16.4],[-2,14.6],[2.4,14.6]];const others=window.__island.classDemo.debug.others;
    return others.find(other=>spots.every(([x,z])=>Math.hypot(other.x+.8-x,other.y-z)>2.6))??others[0];});await teleport(bot.x+.8,bot.y);};
  await nearBot();await page.waitForTimeout(300);await page.locator('.demo-prompt button').waitFor();await page.keyboard.press('KeyE');
  await page.locator('.duel-spotlight[open]').waitFor();await shot('22-captain-menu');
  await page.getByRole('button',{name:'Wave',exact:true}).click();await page.waitForTimeout(400);
  check(await page.evaluate(()=>window.__island.classDemo.debug.quests.wave===true),'Waving to a captain ticks the wave goal');
  await nearBot();await page.waitForTimeout(300);await page.keyboard.press('KeyE');await page.locator('.duel-spotlight[open]').waitFor();
  await page.getByRole('button',{name:'Friendly duel (3 rounds)'}).click();
  for(const [round,signal] of [[0,'shade'],[1,'mirror'],[2,'flash']])await page.locator('.duel-round').nth(round).locator(`input[value=${signal}]`).check({force:true});
  await page.getByRole('button',{name:'Seal and challenge'}).click();
  await page.locator('.duel-reveal:not([hidden])').waitFor({timeout:15000});await page.waitForTimeout(1000);await shot('23-duel-reveal');
  check(await page.evaluate(()=>window.__island.classDemo.debug.quests.duel===true),'A friendly duel reaches the spotlight reveal and ticks the goal');
  await page.locator('.duel-reveal .duel-banner').filter({hasText:/./}).waitFor({timeout:10000});
  await page.getByRole('button',{name:'Back to the ring'}).click();
  await teleport(-5,16.9);await page.locator('.lamp-hold').waitFor();await shot('24-lamp-prompt');
  await page.keyboard.down('KeyE');await page.waitForTimeout(2300);await page.keyboard.up('KeyE');
  check(await page.evaluate(()=>window.__island.classDemo.debug.lamps.lamps[0].litAt!==null),'Holding E for 2 s lights the lamp');
  await page.waitForTimeout(400);await shot('25-lamp-lit');
  await page.locator('dialog.cutscene[open]').waitFor({timeout:12000});await page.waitForTimeout(1500);await shot('26-lamps-relight-cutscene');
  check(await cutsceneTitle()==='The three lamps','All three lamps within 20 s relight the lighthouse with the cutscene');
  await page.getByRole('button',{name:'Skip',exact:true}).click();await page.waitForTimeout(800);await shot('27-lighthouse-relit');
  check(await page.evaluate(()=>[...document.querySelectorAll('.u-toast,.lamp-status,.sound-caption')].filter(node=>!node.hidden&&node.getClientRects().length&&node.textContent.trim()).length)===1,'The relit lighthouse shows one caption, not three');
  await page.keyboard.press('KeyJ');await page.locator('.projector:not([hidden]) canvas').waitFor();await page.waitForTimeout(300);await shot('28-projector');
  check(await page.evaluate(()=>{const canvas=document.querySelector('.projector canvas');return canvas.width>200&&!canvas.hidden&&document.querySelector('.projector-code').textContent==='HARBOR-TESTS'
    &&canvas.getAttribute('aria-label')==='QR code for https://the-great-plot-twist.vercel.app/?join=TESTS';}),'J shows the projector panel with the QR canvas for the practice class code HARBOR-TESTS');
  await page.keyboard.press('KeyJ');
  check(writes.length===0,'The rehearsal sends no server writes');
  await page.keyboard.press('Escape');await page.locator('.shell-screen[open] .shell-menu').waitFor();
  const menu=await page.locator('.shell-menu button').allTextContents();
  check(!menu.some(label=>/mystery|prologue/i.test(label)),'The pause menu offers no Full mystery or Lighthouse prologue entry');
  await page.getByRole('button',{name:'Resume',exact:true}).click();await page.waitForTimeout(300);
  check(await page.evaluate(()=>!document.querySelector('.quest-strip').hidden),'Resume returns to the harbor with the quest strip');
  // ---- part 3: frame numbers ----
  if(perf){
    report.perf={};
    for(const captains of [0,8,40]){
      await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});
      await frontDoor(`${env.url}/?demo=1&perf=1&captains=${captains}`);
      await page.waitForTimeout(2500);
      const numbers=await measure(page,180);
      const panel=await page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('.performance-panel dt')].map(term=>[term.textContent,term.nextElementSibling?.textContent])));
      report.perf[captains]={fps:numbers.fps,calls:numbers.calls,triangles:numbers.triangles,geometries:numbers.geometries,textures:numbers.textures,
        p95Frame:panel['95th percentile frame']??null,drawn:await page.evaluate(()=>window.__island.experience.stats.drawn)};
      await shot(`3${captains===0?0:captains===8?1:2}-perf-${captains}-captains`);
    }
  }
  report.errors=env.errors.filter(message=>!message.includes('503'));report.external=env.external;
  check(report.errors.length===0&&env.external.length===0,'No JavaScript errors and no outside requests');
  console.log(JSON.stringify(report,null,2));
}finally{await writeFile(`${shotsDir}/journey.json`,JSON.stringify(report,null,2)+'\n');await env.close();}
