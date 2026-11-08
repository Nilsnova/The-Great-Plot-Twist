// Bounded DOM-only review of the real panels; fixtures are local, with no game/server writes.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createServer} from 'vite';

const out=process.env.PANEL_CAPTURE_DIR??'captures/open-panels';
await mkdir(out,{recursive:true});
const fixture={name:'panel-review-fixture',transformIndexHtml(){return [{tag:'link',attrs:{rel:'stylesheet',href:'/src/ui/open-panels.css'},injectTo:'head'}];},configureServer(server){
  server.middlewares.use('/__panel-review',(_req,res)=>{
    res.setHeader('Content-Type','text/html');
    res.end('<!doctype html><html><head><link rel="stylesheet" href="/src/ui/kit/kit.css"><link rel="stylesheet" href="/src/ui/shell.css"><link rel="stylesheet" href="/src/ui/open-panels.css"></head><body><button id="opener">Open panel</button></body></html>');
  });
}};
const server=await createServer({logLevel:'error',cacheDir:'/tmp/plot-twist-panel-review-vite',plugins:[fixture],
  server:{host:'127.0.0.1',port:0,hmr:false}});
await server.listen();
const url=server.resolvedUrls.local[0].replace(/\/$/,'');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/usr/bin/chromium',
  headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage(),report={screens:[],errors:[],external:[]};
page.on('pageerror',error=>report.errors.push(error.message));
page.on('request',request=>{if(!request.url().startsWith(url)&&!request.url().startsWith('data:'))report.external.push(request.url());});
await page.route('**/api/**',route=>route.fulfill({status:404,contentType:'application/json',body:'{"error":{"code":"feature_off","message":"Local review only."}}'}));

async function panel(name){
  if(['arrival','crew','board','hints','finale'].includes(name)){
    await page.goto(url+'/case-lab.html?demo=1');
    await page.waitForFunction(()=>window.__caseLab);
    await page.evaluate(async name=>{
      const {adapter:a,screens}=window.__caseLab;
      await a.createCrew();await a.muster();a.dev.give('C1',1);a.dev.give('C2',2);
      await a.pin('C1');a.dev.pinForSeat('C2',2);await a.pair('C1','C2');
      await screens.open(name);
    },name);
  }else{
    await page.goto(url+'/__panel-review');
    await page.evaluate(async name=>{
      const ctx={container:document.body,focus:()=>document.querySelector('#opener')?.focus()};
      if(name==='account'){
        const {createAccountScreen}=await import('/src/screens/account/index.js');
        const {createModal}=await import('/src/ui/kit/modal.js');
        const screen=createAccountScreen({send:async()=>({accepted:false})});
        screen.update({account:{state:'signed_in',captainName:'Harbor explorer',hasKit:true,
          save:{state:'conflict',device:{state:'saved',label:'The cottage · a clue found'},cloud:{state:'saved',label:'The harbor · crew progress'}}}});
        const modal=createModal({title:'Your captain',body:screen.element});modal.element.classList.add('account-modal');modal.open(document.body);
      }else if(name==='settings'){
        const {createSettingsView}=await import('/src/settings/view.js');
        const {createModal}=await import('/src/ui/kit/modal.js');
        const modal=createModal({title:'Settings',body:createSettingsView({})});
        modal.element.classList.add('shell-screen');modal.element.dataset.mode='settings';modal.open(document.body);
      }else if(name==='market'){
        const {createMarketPanel}=await import('/src/screens/market/panel.js');
        const {createFakeMarketAdapter}=await import('/src/screens/market/fake.js');
        window.__panel=createMarketPanel({...ctx,adapter:createFakeMarketAdapter({scenario:'mixed'})});await window.__panel.open();
      }else if(name==='predictions'){
        const {createDesk}=await import('/src/screens/predictions/desk.js');
        window.__panel=createDesk({...ctx,search:'?desk=local'});await window.__panel.open();
      }else if(name==='arena'){
        await import('/src/screens/duels/duels.css');
        const {createPanel}=await import('/src/screens/duels/panel.js');
        const {createFakeAdapter}=await import('/src/screens/duels/fake-adapter.js');
        const adapter=createFakeAdapter({rivalDelayMs:null});await adapter.refresh();
        window.__panel=createPanel(ctx,adapter);await window.__panel.open();
      }else if(name==='islet'){
        const {createIsletPanel}=await import('/src/screens/islet/panel.js');
        const {createIsletAdapter}=await import('/src/screens/islet/adapter.js');
        const {createFakeIsletTransport}=await import('/src/screens/islet/fake-transport.js');
        const adapter=createIsletAdapter({transport:createFakeIsletTransport(),mode:'local'});await adapter.refresh();
        window.__panel=createIsletPanel({...ctx,adapter});window.__panel.open();
      }else if(name==='sports'){
        const {createSportsPanel}=await import('/src/screens/sports/panel.js');
        const {BOARD,MINE}=await import('/tests/sports/sample-answers.js');
        window.__panel=createSportsPanel({...ctx,getToken:()=>null,adapter:{board:async()=>({ok:true,data:BOARD}),mine:async()=>({ok:true,data:MINE})}});await window.__panel.open();
      }
    },name);
  }
  // The shared CSS loads in the page head, before these later lazy panel stylesheets.
  await page.locator('dialog[open]').waitFor();
  await page.evaluate(async()=>{for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);});
}

try{
  for(const name of ['arrival','crew','board','hints','finale','account','settings','market','predictions','arena','islet','sports']){
    await panel(name);
    for(const viewport of [{width:1280,height:800},{width:375,height:667},{width:320,height:568},{width:844,height:390}]){
      await page.setViewportSize(viewport);
      const result=await page.locator('dialog[open]').evaluate(async root=>{
        const h=await import('/scripts/a11y-helpers.js');
        const r=root.getBoundingClientRect();
        const controls=[...root.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],summary')].filter(el=>h.renderedForAudit(el));
        const text=[...root.querySelectorAll('*')].filter(el=>h.renderedForAudit(el)&&[...el.childNodes].some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim()));
        return {bounds:{width:r.width,height:r.height},fits:h.withinViewport(r,{width:innerWidth,height:innerHeight}),
          overflow:h.hasHorizontalOverflow(root)||h.hasHorizontalOverflow(document.documentElement),
          smallControls:controls.filter(el=>!h.touchTargetMeetsMinimum(h.touchRectForAudit(el))).map(el=>el.outerHTML.slice(0,180)),
          smallText:text.filter(el=>parseFloat(getComputedStyle(el).fontSize)<16).map(el=>({tag:el.tagName,class:el.className,text:el.textContent.slice(0,80)})),
          scrolls:[...root.querySelectorAll('.kit-modal-body,.case-screen-content')].filter(el=>el.scrollHeight>el.clientHeight+1).map(el=>el.className)};
      });
      report.screens.push({name,viewport,...result});
      assert.ok(result.fits,`${name} fits ${viewport.width}`);assert.ok(!result.overflow,`${name} no horizontal overflow ${viewport.width}`);
      assert.equal(result.smallControls.length,0,`${name} full-size targets ${viewport.width}`);
      assert.equal(result.smallText.length,0,`${name} readable text ${viewport.width}`);
      if(viewport.width!==844)await page.screenshot({path:`${out}/${name}-${viewport.width}.png`});
    }
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);
  console.log(JSON.stringify({screens:report.screens.length,errors:report.errors,external:report.external}));
}finally{
  await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();await server.close();
}
