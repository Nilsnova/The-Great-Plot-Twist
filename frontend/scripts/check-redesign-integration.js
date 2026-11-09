// Actual title → room → world proof, including overlay input and the higher-density asset path.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {openWorldBrowser} from './world-browser-tools.js';
import {stubIntro} from './intro-browser-fixture.js';
import {revealIntroText} from './online-browser-actions.js';
const out=process.env.CAPTURE_DIR||'captures/visual-review';await mkdir(out,{recursive:true});
const env=await openWorldBrowser(),{page}=env,report={checks:[],viewports:[]};
const check=(value,label)=>{assert.ok(value,label);report.checks.push(label);};
const shot=name=>page.screenshot({path:`${out}/${name}.jpg`,type:'jpeg',quality:84});
const position=()=>page.evaluate(()=>window.__island.player.position.toArray());
const frames=()=>page.evaluate(async()=>{for(let i=0;i<5;i++)await new Promise(requestAnimationFrame);});
try{
 await stubIntro(page);await page.setViewportSize({width:1280,height:720});await page.goto(env.url);
 await page.locator('.shell-screen[open]').waitFor();await page.locator('.title-backdrop').evaluate(img=>img.decode());
 check(await page.locator('.title-backdrop').evaluate(img=>img.naturalWidth===1672&&img.currentSrc.endsWith('places/title.webp')),'The title uses original detailed artwork, not a scaled thumbnail');
 check(await page.locator('canvas[tabindex]').count()===0,'Title starts without a WebGL renderer');await shot('after-title');
 await page.getByRole('button',{name:'Play with friends',exact:true}).click();
 await page.getByText('Online crews are not connected in this build.',{exact:true}).waitFor();
 check(await page.getByText('Online crews are not connected in this build.',{exact:true}).isVisible(),'Friends is visible immediately and honestly describes the pending G9 connection');
 await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Lighthouse prologue',exact:true}).click();
 await page.locator('.intro-view').waitFor();await page.waitForFunction(()=>window.__island?.interiors?.roomId==='cottage'&&document.querySelector('.interiors-scene')?.dataset.state==='ready');
 await revealIntroText(page);
 check(await page.locator('.intro-modal').evaluate(el=>el.getBoundingClientRect().height===330),'Desktop dialogue stays compact at 330px');
 check(await page.locator('.intro-journal').evaluate(el=>!el.open),'Story history starts collapsed');
 const before=await position();await page.keyboard.down('KeyD');await frames();await page.keyboard.up('KeyD');
 check(JSON.stringify(await position())===JSON.stringify(before),'Dialogue blocks outside movement');await shot('after-dialogue');
 await page.keyboard.press('Escape');await page.locator('.intro-modal').waitFor({state:'hidden'});
 check(await page.locator('.interiors-scene').evaluate(el=>{const r=el.getBoundingClientRect();return r.width===innerWidth&&r.height===innerHeight;}),'Entering the cottage replaces the whole viewport');
 await shot('after-interior');await page.getByRole('button',{name:'Leave room',exact:true}).click();await page.locator('.interiors-scene').waitFor({state:'hidden'});
 await page.evaluate(()=>{const g=window.__island;g.player.position.set(-7,g.world.current.groundHeight(-7,7),7);g.view.setPlace('lighthouse_isle',g.player.position);g.settings.hour=10.4;});await frames();
 check(await page.locator('.controls').evaluate(el=>el.hidden)&&await page.locator('.case-toolbar').evaluate(el=>el.hidden),'Controls and Journal tools are hidden by default');
 await shot('after-world');
 const density=await page.evaluate(()=>{const g=window.__island,c=g.renderer.domElement;return{framebuffer:[c.width,c.height],textures:g.renderer.info.memory.textures,calls:g.renderer.info.render.calls,player:g.player.position.toArray(),zoom:g.camera.zoom};});report.density=density;
 check(density.framebuffer[0]===1280&&density.framebuffer[1]===720,'Desktop framebuffer contains 1280×720 actual pixels');
 const resources=await page.evaluate(()=>performance.getEntriesByType('resource').map(e=>e.name));
 check(resources.some(u=>u.endsWith('/pixel/hd/cottage.png'))&&resources.some(u=>u.endsWith('/pixel/hd/ground.png')),'World loads freshly detailed sprites and ground at their original geometry');
 await page.evaluate(()=>{const g=window.__island;g.player.position.set(-1,g.world.current.groundHeight(-1,10),10);});
 await page.getByRole('button',{name:'Menu',exact:true}).click();const paused=await position();await page.keyboard.down('KeyD');await frames();await page.keyboard.up('KeyD');
 check(JSON.stringify(await position())===JSON.stringify(paused),'Pause menu blocks outside movement');await page.getByRole('button',{name:'Resume',exact:true}).click();
 await page.keyboard.down('KeyD');await page.waitForFunction(x=>window.__island.player.position.x>x+.1,paused[0]);await page.keyboard.up('KeyD');await frames();const stopped=await position();await frames();
 check(JSON.stringify(await position())===JSON.stringify(stopped),'Movement starts immediately and stops without drifting');
 await page.evaluate(()=>{const g=window.__island;g.player.position.set(-7,g.world.current.groundHeight(-7,5.8),5.8);});
 await page.waitForFunction(()=>window.__island.interiors?.roomId==='cottage');check(true,'Walking across a doorway automatically opens the full-screen room');
 await page.getByRole('button',{name:'Leave room',exact:true}).click();await page.locator('.interiors-scene').waitFor({state:'hidden'});await frames();
 check(await page.evaluate(()=>!window.__island.interiors.active),'Leaving restores a safe outside position without immediately reopening the room');
 for(const [width,height] of [[375,667],[320,568],[844,390]]){
  await page.setViewportSize({width,height});await frames();
  const geometry=await page.evaluate(()=>{const h=document.querySelector('.masthead').getBoundingClientRect(),a=document.querySelector('.hud-actions').getBoundingClientRect();return{body:document.documentElement.scrollWidth<=innerWidth,headerBottom:h.bottom,actionsTop:a.top,framebuffer:[window.__island.renderer.domElement.width,window.__island.renderer.domElement.height]};});
  check(geometry.body&&geometry.headerBottom<=geometry.actionsTop,`${width}px: compact HUD has no horizontal overflow or header overlap`);report.viewports.push({width,height,...geometry});await shot(`after-world-${width}`);
 }
 await page.setViewportSize({width:1280,height:720});
 await page.evaluate(()=>{const g=window.__island;g.player.position.set(-7,g.world.current.groundHeight(-7,5.8),5.8);});await page.waitForFunction(()=>window.__island.interiors?.active);
 await page.evaluate(()=>window.__island.shell.show('pause'));await page.getByRole('button',{name:'Return to title',exact:true}).click();
 check(await page.evaluate(()=>!window.__island.interiors.active&&getComputedStyle(document.querySelector('.title-backdrop')).zIndex==='1'),'Return to title closes the room and restores the illustrated backdrop above the canvas');await shot('after-return-title');
 check(env.errors.length===0,'Integrated journey has no browser errors');check(env.external.length===0,'Integrated journey requests no external assets');console.log(JSON.stringify(report,null,2));
}finally{await writeFile(`${out}/integration-report.json`,JSON.stringify({...report,errors:env.errors},null,2));await env.close();}
