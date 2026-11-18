// Native local game: interrupt an actual boat with wave 31 and measure its real announcement layout.
// Run from frontend: node ../docs/evidence/boat-quest-flow/native-layout.mjs /tmp/boat-notice-proof
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {openWorldBrowser} from '../../../frontend/scripts/world-browser-tools.js';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const out=process.argv[2]??'/tmp/boat-notice-layout-probe';
await mkdir(out,{recursive:true});
const files=['frontend/src/island/ui.js','frontend/src/island/boat-card.css','frontend/src/pirates/pirates.css','frontend/src/pirates/hud.js','frontend/src/ui/toasts.js'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async name=>[name,createHash('sha256').update(await readFile(`${root}${name}`)).digest('hex')])));
const before=await hashes();
const env=await openWorldBrowser({hmr:false}),page=env.page,results=[];
async function enter(width,height){
  await page.setViewportSize({width:1280,height:720});
  await page.goto(`${env.url}/?islands=fake&fakeworld=notice${width}${height}${Date.now().toString(36)}&fakeplayer=me&fakename=Ianno`);
  await page.locator('#play').click();
  for(let i=0;i<20;i++){
    await page.waitForFunction(()=>document.querySelector('dialog.cutscene[open],.tutorial-card[open],.goal-card[open],.games-card[open],.island-card-lobby[open]'));
    if(await page.locator('.island-card-lobby[open]').count())break;
    if(await page.locator('.games-card[open]').count()){
      await page.getByRole('button',{name:'Create a game',exact:true}).click();
      await page.waitForFunction(()=>!document.querySelector('.games-card[open]'));
    }
    else if(await page.locator('.goal-card[open]').count())await page.getByRole('button',{name:'Got it',exact:true}).click();
    else await page.getByRole('button',{name:'Skip',exact:true}).click({timeout:5000}).catch(()=>{});
  }
  await page.locator('.island-lobby-start').click();
  await page.waitForFunction(()=>window.__island.island.ui.open!=='lobby');
  console.log(`bootstrapped ${width}x${height}`);
  await page.setViewportSize({width,height});
  await page.evaluate(async()=>{
    const i=window.__island.island;i.dev.setWaveBest(30);i.dev.setCoins(10000);await i.load();
    for(let n=0;n<5;n++)await i.giveWreck(100);
    i.openWreck();
  });
  await page.locator('[data-focus="boat-dash"]').click();
  await page.locator('.boat-game').waitFor();
  await page.evaluate(()=>{
    window.noticePopSamples=[];
    new MutationObserver(()=>{
      const notice=document.querySelector('.island-boat-notice'),count=document.querySelector('.pirate-countdown'),number=document.querySelector('.pirate-countdown-number');
      if(!notice||notice.hidden||!count||count.hidden||!number||window.noticePopSamples.length>=40)return;
      const a=notice.getBoundingClientRect(),b=number.getBoundingClientRect();
      window.noticePopSamples.push({at:performance.now(),number:number.textContent,transform:getComputedStyle(number).transform,
        notice:{top:a.top,bottom:a.bottom,left:a.left,right:a.right},numberBounds:{top:b.top,bottom:b.bottom,left:b.left,right:b.right},
        overlapX:Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left)),overlapY:Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top))});
    }).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','hidden']});
  });
}
async function measure(){return page.evaluate(()=>{
      const selectors={bar:'.pirate-hud:not([hidden]) .pirate-bar',countdown:'.pirate-hud:not([hidden]) .pirate-countdown',
        countNumber:'.pirate-hud:not([hidden]) .pirate-countdown-number',
        narrator:'.narrator-card:not([hidden])',soundCaption:'.sound-caption:not([hidden])',islandBanner:'.island-banner',notice:'.island-boat-notice',toast:'.u-toasts',boss:'.pirate-hud:not([hidden]) .pirate-boss'};
      const bounds={};
      for(const [name,selector]of Object.entries(selectors)){
        const node=document.querySelector(selector),style=node&&getComputedStyle(node),rect=node?.getBoundingClientRect();
        bounds[name]=!node||node.hidden||style.display==='none'||style.visibility==='hidden'||!rect.width||!rect.height?null:
          {x:rect.x,y:rect.y,width:rect.width,height:rect.height,right:rect.right,bottom:rect.bottom,zIndex:style.zIndex,text:node.textContent};
      }
      const overlap=(a,b)=>!a||!b?null:{x:Math.max(0,Math.min(a.right,b.right)-Math.max(a.x,b.x)),y:Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y))};
      const key=new KeyboardEvent('keydown',{code:'ArrowRight',cancelable:true});window.dispatchEvent(key);window.dispatchEvent(new KeyboardEvent('keyup',{code:'ArrowRight'}));
      const root=getComputedStyle(document.documentElement);
      return {viewport:{width:innerWidth,height:innerHeight},bounds,overlap:{bar:overlap(bounds.notice,bounds.bar),countdown:overlap(bounds.notice,bounds.countdown),countNumber:overlap(bounds.notice,bounds.countNumber),toast:overlap(bounds.notice,bounds.toast)},
        withinViewport:Object.fromEntries(['notice','countdown','countNumber'].map(name=>[name,!!bounds[name]&&bounds[name].x>=0&&bounds[name].y>=0&&bounds[name].right<=innerWidth&&bounds[name].bottom<=innerHeight])),
        hudZIndex:getComputedStyle(document.querySelector('.pirate-hud:not([hidden])')).zIndex,
        wave:window.__island.waves.island.wave?.info.wave,phase:window.__island.waves.island.state?.phase,
        boatCount:document.querySelectorAll('.boat-game').length,modal:window.__island.island.ui.open,islandActive:window.__island.island.active,keyConsumed:key.defaultPrevented,
        variables:Object.fromEntries(['--pirate-bar-bottom','--pirate-count-space','--toast-stack-height','--boat-notice-space'].map(name=>[name,root.getPropertyValue(name)]))};
  });}
try{
  for(const [width,height] of [[320,568],[844,390]]){
    await enter(width,height);
    const started=await page.evaluate(()=>window.__island.island.ringBell());
    if(!started.ok)throw new Error(`Wave refused: ${started.code}`);
    await page.locator('.pirate-countdown:not([hidden])').waitFor();
    await page.locator('.island-boat-notice:not([hidden])').waitFor();
    await page.evaluate(async()=>{for(let frame=0;frame<4;frame++)await new Promise(requestAnimationFrame);});
    for(const variant of ['normal','error']){
    if(variant==='error')await page.evaluate(()=>window.__island.island.ui.toast('Connection interrupted.','error','Check your connection and try again.'));
    const measured=await measure();
    measured.variant=variant;
    results.push(measured);
    await page.screenshot({path:`${out}/wave31-${width}x${height}-${variant}.png`});
    console.log(JSON.stringify(measured));
    }
    const rotated=width===320?{width:844,height:390}:{width:320,height:568};
    await page.setViewportSize(rotated);
    await page.evaluate(async()=>{for(let frame=0;frame<4;frame++)await new Promise(requestAnimationFrame);});
    const rotation=await measure();rotation.variant=`rotation-from-${width}x${height}`;results.push(rotation);
    await page.screenshot({path:`${out}/wave31-${width}x${height}-rotated.png`});console.log(JSON.stringify(rotation));
    const previous=await page.evaluate(()=>({x:window.__island.player.position.x,z:window.__island.player.position.z}));
    await page.keyboard.down('ArrowRight');await page.evaluate(()=>new Promise(requestAnimationFrame));await page.keyboard.up('ArrowRight');
    const current=await page.evaluate(()=>({x:window.__island.player.position.x,z:window.__island.player.position.z}));
    rotation.inputMovement={before:previous,after:current,distance:Math.hypot(current.x-previous.x,current.z-previous.z)};
    rotation.popSamples=await page.evaluate(()=>window.noticePopSamples);
  }
  const after=await hashes();
  const report={source:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
    dirty:!!execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim(),sourceFiles:after,sourcesStable:JSON.stringify(before)===JSON.stringify(after),
    results,pageErrors:env.pageErrors,consoleErrors:env.consoleErrors,external:env.external};
  await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');
  assert.ok(report.sourcesStable,'application files stayed unchanged during capture');
  assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.consoleErrors,[]);assert.deepEqual(report.external,[]);
  for(const sample of results){
    assert.equal(sample.wave,31);assert.equal(sample.boatCount,0);assert.equal(sample.modal,null);
    assert.equal(sample.islandActive,false);
    assert.ok(Object.values(sample.withinViewport).every(Boolean),`${sample.variant}: announcements fit the viewport`);
    assert.ok(Object.values(sample.overlap).every(box=>!box||box.x===0||box.y===0),`${sample.variant}: critical announcements stay clear`);
    assert.ok(Number(sample.hudZIndex)>Number(sample.bounds.notice.zIndex),'combat remains above the status');
    // The full game's ordinary controls prevent scrolling with ArrowRight; actual movement proves release.
    if(sample.inputMovement)assert.ok(sample.inputMovement.distance>0,'native captain movement resumes');
  }
  console.log(JSON.stringify({out,source:report.source,passed:true,pageErrors:report.pageErrors,consoleErrors:report.consoleErrors}));
}catch(error){await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});throw error;}
finally{await env.close();}
