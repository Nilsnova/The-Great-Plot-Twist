// Controlled component evidence using the real island/HUD and a local fake second captain.
// Run from frontend: node ../docs/evidence/boat-quest-flow/capture.mjs
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {openWorldBrowser} from '../../../frontend/scripts/world-browser-tools.js';
const out=fileURLToPath(new URL('.',import.meta.url));await mkdir(out,{recursive:true});
const env=await openWorldBrowser({hmr:false}),{page}=env,report={kind:'Controlled component fixture, local fake transport',shots:[]};
try{
  await page.route('**/boat-quest-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><p id="fixture-label">Component fixture: production UI, local fake server</p></body></html>'}));
  for(const [name,width,height] of [['desktop',1280,720],['phone',375,812]]){
    await page.setViewportSize({width,height});await page.goto(env.url+'/boat-quest-fixture');
    await page.evaluate(async()=>{
      for(const path of ['/src/ui/base.css','/src/ui/kit/kit.css','/src/ui/styles.css'])await import(path);
      const style=document.createElement('style');style.textContent='body{margin:0;min-height:100vh;background:#244957}#fixture-label{position:fixed;left:12px;bottom:6px;margin:0;color:white;font:12px system-ui}';document.head.append(style);
      const {createIsland}=await import('/src/island/index.js'),{createHud}=await import('/src/ui/hud.js');
      const {createFakeIslandTransport}=await import('/src/pirates/fake-api.js'),{on,emit}=await import('/src/core/events.js');
      localStorage.clear();localStorage.setItem('plot_twist_first_quests_v1',JSON.stringify({version:1,done:8}));
      const transport=window.fixtureTransport=createFakeIslandTransport();transport.dev.setWaveBest(30);
      const own=transport.world.islands.get('K7Q2M');own.wreck=500;own.crew.gunner=2;
      const canvas=document.createElement('canvas');canvas.tabIndex=0;canvas.setAttribute('aria-label','Game input target');document.body.append(canvas);
      const hud=window.fixtureHud=createHud(document.body,{focus:()=>canvas.focus(),hasIsland:()=>true,travel:()=>false});
      const island=window.fixtureIsland=createIsland({container:document.body,on,emit,transport,mode:'fake',storage:null,
        focus:()=>canvas.focus(),onCoins:value=>hud.setCoins(value),onQuestIsland:value=>hud.setQuestIsland(value),menu:()=>()=>{}});
      await island.load();island.openWreck();
    });
    await page.waitForSelector('[data-focus="boat-dash"]');
    await page.screenshot({path:out+`ship-card-${name}.png`});
    await page.locator('[data-focus="boat-dash"]').click();await page.waitForSelector('.boat-game');
    const state=await page.evaluate(async()=>{
      const island=window.fixtureIsland;
      const wave=await window.fixtureTransport.dev.startWaveAt(island.island.code);
      if(!wave)throw new Error('Second fake captain could not start the wave.');
      await island.joinRunningWave();
      const key=new KeyboardEvent('keydown',{code:'ArrowRight',cancelable:true});window.dispatchEvent(key);
      const notice=document.querySelector('.island-boat-notice'),box=notice.getBoundingClientRect();
      const banner=document.querySelector('.island-banner'),count= banner.getBoundingClientRect();
      return {goals:window.fixtureHud.quests.done,boats:document.querySelectorAll('.boat-game').length,
        active:island.active,card:island.ui.open,consumed:key.defaultPrevented,notice:notice.textContent,
        noticeVisible:!notice.hidden,withinViewport:box.left>=0&&box.right<=innerWidth&&box.top>=0&&box.bottom<=innerHeight,
        countdownOverlap:!banner.hidden&&box.left<count.right&&box.right>count.left&&box.top<count.bottom&&box.bottom>count.top,
        overflow:document.documentElement.scrollWidth>innerWidth};
    });
    if(state.goals!==10||state.boats||state.active||state.card||state.consumed||!state.noticeVisible||!state.withinViewport||state.countdownOverlap||state.overflow)throw new Error(JSON.stringify(state));
    await page.screenshot({path:out+`interrupted-${name}.png`});report.shots.push({name,width,height,...state});
    await page.evaluate(()=>{window.fixtureIsland.dispose();window.fixtureHud.dispose();});
  }
  report.pageErrors=env.pageErrors;report.external=env.external;report.consoleErrorCount=env.consoleErrors.length;
  // Local Vite's hot-reload socket is blocked on this host; retain that limitation without its transient token.
  report.consoleLimit=env.errors.length?'Local Vite HMR WebSocket errors; no application page errors.':null;
  const unexpected=env.errors.filter(error=>!/WebSocket|websocket|Vite server/.test(error));
  if(report.pageErrors.length||report.external.length||unexpected.length)throw new Error('Unexpected browser error or external request.');
  await writeFile(out+'capture.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await env.close();}
