// Real touch input through the complete local world; no account or backend writes.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {openWorldBrowser} from './world-browser-tools.js';
import {stubOfflineApi} from './api-browser-fixture.js';
import {stubWeather} from './weather-browser-fixture.js';
import {startFromTitle} from './shell-browser-tools.js';
const env=await openWorldBrowser({hmr:false}),report={checks:[],views:[]};
const check=(value,label)=>{assert.ok(value,label);report.checks.push(label);console.log(label);};
const folder='captures/20261108-mobile-walking';await mkdir(folder,{recursive:true});
try{
  await env.page.close();
  for(const viewport of [{width:375,height:667},{width:320,height:568},{width:844,height:390}]){
    const context=await env.browser.newContext({viewport,isMobile:true,hasTouch:true,deviceScaleFactor:1});
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await stubOfflineApi(page);await stubWeather(page);
    await page.addInitScript(()=>localStorage.setItem('plot_twist_preferences_v1',JSON.stringify({version:1,preferences:{quality:'low',reducedMotion:'true',textSpeed:0}})));
    await page.goto(env.url);await startFromTitle(page);
    await page.locator('.touch-controls:not([hidden])').waitFor();
    const client=await context.newCDPSession(page),touch=async(type,points=[])=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points});
    const reset=()=>page.evaluate(()=>{const g=window.__island;g.mapTouch.cancel();g.player.position.set(-1,g.world.current.groundHeight(-1,10),10);});
    const target=()=>page.evaluate(()=>{const g=window.__island,p=g.player.position.clone();p.x+=2;p.y=-p.z*.72;p.z=0;p.project(g.camera);const r=g.renderer.domElement.getBoundingClientRect();return{x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};});
    await reset();await page.waitForTimeout(250);
    const point=await target();check(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.matches('#game>canvas'),point),'clear world tap target '+viewport.width);
    await touch('touchStart',[point]);await touch('touchEnd');
    await page.waitForFunction(()=>window.__island.mapTouch.active);
    await page.waitForFunction(()=>window.__island.player.position.x>.6);
    await page.waitForFunction(()=>!window.__island.mapTouch.active);
    check(await page.evaluate(()=>Math.abs(window.__island.player.position.x-1)<.22),'tap reaches clear destination '+viewport.width);
    const stopped=await page.evaluate(()=>window.__island.player.position.toArray());await page.waitForTimeout(400);
    check(await page.evaluate(p=>window.__island.player.position.distanceTo({x:p[0],y:p[1],z:p[2]})<.001,stopped),'tap stops at destination '+viewport.width);
    await reset();await page.waitForTimeout(250);const next=await target();await touch('touchStart',[next]);await touch('touchEnd');await page.waitForFunction(()=>window.__island.mapTouch.active);
    await page.locator('.touch-actions button').filter({hasText:'Menu'}).click();await page.locator('.shell-screen[open][data-mode=pause]').waitFor();
    check(await page.evaluate(()=>!window.__island.mapTouch.active),'menu cancels route '+viewport.width);
    await page.getByRole('button',{name:'Resume',exact:true}).click();
    const stick=await page.locator('.touch-stick').boundingBox(),x=stick.x+stick.width/2,y=stick.y+stick.height/2;
    check(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.classList.contains('touch-stick'),{x,y}),'stick hit target unobstructed '+viewport.width);
    const before=await page.evaluate(()=>window.__island.player.position.x);
    await touch('touchStart',[{x,y}]);await touch('touchMove',[{x:x+43,y}]);await page.waitForTimeout(400);await touch('touchEnd');
    check(await page.evaluate(before=>window.__island.player.position.x>before+.25,before),'real joystick hold moves '+viewport.width);
    await page.waitForTimeout(150);const released=await page.evaluate(()=>window.__island.player.position.x);await page.waitForTimeout(350);
    check(await page.evaluate(x=>Math.abs(window.__island.player.position.x-x)<.001,released),'real joystick release stops '+viewport.width);
    const promptClear=await page.evaluate(()=>{
      const node=document.querySelector('.interact'),label=node.querySelector('strong'),text=label.textContent,hidden=node.hidden;
      node.hidden=false;label.textContent='Inspect the shoreline';const p=node.getBoundingClientRect();
      const overlap=[...document.querySelectorAll('.touch-stick-group,.touch-actions')].some(e=>{const r=e.getBoundingClientRect();return p.left<r.right&&p.right>r.left&&p.top<r.bottom&&p.bottom>r.top;});
      node.hidden=hidden;label.textContent=text;return !overlap;
    });
    check(promptClear,'fixture interaction prompt clears touch controls '+viewport.width);
    check(await page.locator('.build-badge').count()===0,'the phone play area carries no build badge '+viewport.width);
    await page.screenshot({path:`${folder}/world-${viewport.width}.png`});
    check(!errors.length,'no game errors '+viewport.width);report.views.push({viewport,errors});await context.close();
  }
  await writeFile(`${folder}/checks.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await env.close();}
