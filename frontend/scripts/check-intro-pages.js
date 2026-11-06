// Actual intro component in isolated Chromium: real story engine/storage, bounded pages and viewport fit.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
const root=fileURLToPath(new URL('..',import.meta.url));
const story=JSON.parse(await readFile(new URL('../../backend/content/story.json',import.meta.url),'utf8'));
const captures=process.env.INTRO_PAGE_CAPTURES||'/tmp/intro-pages-checks';await mkdir(captures,{recursive:true});
const server=await createServer({configFile:false,root,envDir:false,logLevel:'error',server:{host:'127.0.0.1',port:0,hmr:false}});await server.listen();
const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/chromium',headless:true});
const report={checks:[],viewports:[]},check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};
const rescue=['to_desk','take_key','read_log','desk_back','to_shore','take_lantern','warn_harbor','shore_back','to_tower','unlock_door','climb','signal'];
const trapped=['to_desk','take_key','desk_back','to_shore','take_lantern','trust_fisherman','shore_back','to_tower','unlock_door','climb','untie'];
const html='<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/src/ui/kit/kit.css"><link rel="stylesheet" href="/src/ui/intro.css"><link rel="stylesheet" href="/src/ui/devices.css"><link rel="stylesheet" href="/intro-pages.css"><script type="module" src="/intro-pages.js"></script></head><body><button id="open">Open story</button><div class="scene" aria-hidden="true">LIGHTHOUSE ISLE</div></body></html>';
const bootstrap=`import {createIntro} from '/src/story/intro.js';import {setPreferences} from '/src/settings/preferences.js';setPreferences({textSpeed:TEXT_SPEED});window.setTextSpeed=value=>setPreferences({textSpeed:value});window.events=[];window.scenes=[];window.endingReceipts=[];window.intro=createIntro({container:document.body,world:{busy:false,current:{id:'lighthouse_isle'}},on(){return()=>{}},emit(e){window.events.push(e)},onSceneChange(scene){window.scenes.push(scene)},onEnding(e){window.endingReceipts.push(e)}});document.querySelector('#open').onclick=()=>window.intro.begin(true);window.ready=true;`;
async function pageFor(viewport,{failOnce=false,textSpeed=0,reducedMotion='no-preference'}={}){
  const context=await browser.newContext({viewport,reducedMotion}),page=await context.newPage(),errors=[];let reads=0;
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
    const path=url.pathname;if(path==='/intro-pages')return route.fulfill({contentType:'text/html',body:html});
    if(path==='/intro-pages.js')return route.fulfill({contentType:'text/javascript',body:bootstrap.replace('TEXT_SPEED',String(textSpeed))});
    if(path==='/intro-pages.css')return route.fulfill({contentType:'text/css',body:'body{margin:0;background:radial-gradient(ellipse at 50% 30%,#63957f,#153a34);height:100dvh;overflow:hidden;font-family:system-ui,sans-serif}.scene{position:absolute;top:12%;width:100%;text-align:center;color:#cbe0c3;letter-spacing:.25em}#open{position:relative;z-index:1}'});
    if(path==='/api/content/intro-story'){reads++;return route.fulfill({status:failOnce&&reads===1?503:200,contentType:'application/json',body:JSON.stringify(story)});}
    if(path.startsWith('/api/'))return route.abort();return route.continue();});
  await page.goto(origin+'/intro-pages');await page.waitForFunction(()=>window.ready);return {context,page,errors,get reads(){return reads;}};
}
async function pages(page){for(let n=0;n<30;n++){const skip=page.getByRole('button',{name:'Show full text',exact:true});if(await skip.isVisible())await skip.click();const next=page.locator('[data-choice="intro:next"]');if(!await next.count())return;await next.click();}throw Error('Unbounded passage loop');}
async function choose(page,id){await pages(page);for(let n=0;n<4;n++){const target=page.locator(`[data-choice="${id}"]`);if(await target.count()){await target.click();return;}await page.locator('[data-choice="intro:more"]').click();await pages(page);}throw Error('Choice missing '+id);}
async function fit(page,label){
  const result=await page.evaluate(()=>{const modal=document.querySelector('.intro-modal'),box=modal.getBoundingClientRect();const text=modal.querySelector('.kit-dialogue-text');const controls=[...modal.querySelectorAll('button,summary')].filter(e=>e.getClientRects().length&&!e.closest('.intro-journal-body'));
    return {height:box.height,contained:box.top>=0&&box.bottom<=innerHeight&&box.left>=0&&box.right<=innerWidth,
      modalOverflow:modal.scrollHeight>modal.clientHeight+1,textOverflow:text.scrollHeight>text.clientHeight+1,
      controlsFit:controls.every(e=>{const b=e.getBoundingClientRect();return b.top>=box.top&&b.bottom<=box.bottom+1&&b.left>=box.left&&b.right<=box.right+1;}),horizontal:document.documentElement.scrollWidth>innerWidth};});
  check(result.contained&&!result.modalOverflow&&!result.textOverflow&&result.controlsFit&&!result.horizontal,label+' fits without clipped text or controls');return result.height;
}
try{
  for(const viewport of [{width:1280,height:720},{width:375,height:667},{width:320,height:568},{width:844,height:390}]){
    const env=await pageFor(viewport);const {page}=env;try{await page.getByRole('button',{name:'Open story',exact:true}).click();await page.locator('.intro-modal .kit-dialogue-text').waitFor();
      const before=await page.locator('.kit-dialogue-text').textContent();await page.locator('[data-choice="intro:next"]').click();const after=await page.locator('.kit-dialogue-text').textContent();check(before!==after&&!after.includes(before),'Only the current passage remains at '+viewport.width);
      await pages(page);check(JSON.stringify(await page.evaluate(()=>window.scenes))==='["cottage"]','Only initial scene callback while paging at '+viewport.width);const height=await fit(page,'Opening '+viewport.width);await page.screenshot({path:captures+`/opening-${viewport.width}.png`});
      await choose(page,'to_shore');await pages(page);check(Math.abs(await fit(page,'Shore '+viewport.width)-height)<1,'Panel height stays stable at '+viewport.width);
      check(JSON.stringify(await page.evaluate(()=>window.scenes))==='["cottage","shore"]','Actual scene change callback at '+viewport.width);
      const actions=await page.evaluate(()=>window.intro.actions);await page.locator('[data-choice="intro:more"]').click();check(JSON.stringify(await page.evaluate(()=>window.intro.actions))===JSON.stringify(actions),'More actions never records an engine move at '+viewport.width);await fit(page,'More choices '+viewport.width);
      await page.getByText('Journal',{exact:true}).click();check(await page.locator('.intro-journal').getAttribute('open')!==null,'Journal is opt-in at '+viewport.width);check((await page.locator('.intro-original').textContent())===story.scenes.shore.text,'Original prose retained at '+viewport.width);
      await page.keyboard.press('Escape');check(await page.locator('.intro-modal').isVisible()&&!await page.locator('.intro-journal').getAttribute('open'),'Journal Escape returns to the passage at '+viewport.width);
      check(env.errors.length===0,'No browser errors at '+viewport.width);report.viewports.push(viewport);
    }finally{await env.context.close();}
  }
  const keyboard=await pageFor({width:375,height:667},{textSpeed:1});try{const {page}=keyboard;await page.getByRole('button',{name:'Open story',exact:true}).click();const reveal=page.getByRole('button',{name:'Show full text',exact:true});await reveal.waitFor();
    await page.keyboard.press('Enter');check(!await reveal.isVisible()&&await page.locator('.intro-page-count').textContent()==='1 / 2 · Continue to read','Enter reveals the full current passage before advancing');
    await page.locator('[data-choice="intro:next"]').evaluate(button=>button.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',repeat:true,bubbles:true})));check((await page.locator('.intro-page-count').textContent()).startsWith('1 / 2'),'Held confirm cannot skip a passage');
    await page.keyboard.press('Enter');check((await page.locator('.intro-page-count').textContent()).startsWith('2 / 2')&&(await page.evaluate(()=>window.intro.actions)).length===0,'Keyboard Continue advances only presentation');
    await page.evaluate(()=>window.setTextSpeed(0));check(!await reveal.isVisible(),'Instant text preference completes the current passage');await page.keyboard.press('1');check(JSON.stringify(await page.evaluate(()=>window.intro.actions))==='["to_desk"]','Keyboard choice records the exact original action ID');
    await pages(page);await choose(page,'take_key');await pages(page);check(JSON.stringify(await page.evaluate(()=>window.scenes))==='["cottage","desk"]','Same-scene actions do not repeat the scene callback');await choose(page,'desk_back');await choose(page,'to_shore');await pages(page);await page.evaluate(()=>window.setTextSpeed(1));await page.locator('[data-choice="intro:more"]').click();check(!await reveal.isVisible(),'More actions keeps the completed passage visible');
  }finally{await keyboard.context.close();}
  const reduced=await pageFor({width:375,height:667},{textSpeed:1,reducedMotion:'reduce'});try{await reduced.page.getByRole('button',{name:'Open story',exact:true}).click();await reduced.page.locator('.intro-modal .kit-dialogue-text').waitFor();check(!await reduced.page.getByRole('button',{name:'Show full text',exact:true}).isVisible(),'Reduced motion reveals each whole passage immediately');}finally{await reduced.context.close();}
  for(const [path,ending] of [[rescue,'ending_rescue'],[trapped,'ending_trapped']]){
    const env=await pageFor({width:375,height:667});try{const {page}=env;await page.getByRole('button',{name:'Open story',exact:true}).click();await page.locator('.intro-modal .kit-dialogue-text').waitFor();for(const id of path)await choose(page,id);await pages(page);
      check(await page.evaluate(ending=>window.intro.state.scene===ending&&window.intro.state.ended,ending),'Actual engine reaches '+ending);await fit(page,ending);check(await page.locator('.intro-ending').isVisible(),'Ending continuation is visible for '+ending);
      check(await page.evaluate(ending=>window.events.filter(e=>e.type==='intro_ended'&&e.ending===ending).length===1,ending),'Exactly one ending event for '+ending);
      const moves=await page.evaluate(()=>window.intro.actions);await page.reload();await page.waitForFunction(()=>window.ready);await page.getByRole('button',{name:'Open story',exact:true}).click();await page.locator('.intro-modal .kit-dialogue-text').waitFor();await pages(page);check(JSON.stringify(await page.evaluate(()=>window.intro.actions))===JSON.stringify(moves),'Local journal restores '+ending);await page.screenshot({path:captures+'/'+ending+'.png'});await page.getByRole('button',{name:'Start a new intro',exact:true}).click();await pages(page);check(await page.evaluate(()=>window.intro.state.scene==='cottage'&&window.intro.actions.length===0),'Restart clears the exact intro move journal after '+ending);
    }finally{await env.context.close();}
  }
  const blocked=await pageFor({width:375,height:667});try{const {page}=blocked;await page.getByRole('button',{name:'Open story',exact:true}).click();await page.locator('.intro-modal .kit-dialogue-text').waitFor();for(const id of trapped.slice(0,-1))await choose(page,id);await pages(page);const signal=page.locator('[data-choice="signal"]'),before=await page.evaluate(()=>window.intro.actions);check(await signal.isDisabled(),'Blocked story choice remains disabled');await signal.evaluate(button=>button.click());await page.locator('[data-choice="untie"]').focus();await page.keyboard.press('1');check(JSON.stringify(await page.evaluate(()=>window.intro.actions))===JSON.stringify(before),'Disabled pointer and keyboard choices cannot change engine moves');}finally{await blocked.context.close();}
  const retry=await pageFor({width:375,height:667},{failOnce:true});try{await retry.page.getByRole('button',{name:'Open story',exact:true}).click();await retry.page.getByRole('button',{name:'Try again',exact:true}).click();await retry.page.locator('.intro-modal .kit-dialogue-text').waitFor();check(retry.reads===2,'Retry reuses the controller and performs one fresh read');}finally{await retry.context.close();}
  await writeFile(captures+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();await server.close();}
