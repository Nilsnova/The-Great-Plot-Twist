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
    res.end('<!doctype html><html><head><link rel="stylesheet" href="/src/ui/kit/kit.css"><link rel="stylesheet" href="/src/ui/kit/components.css"><link rel="stylesheet" href="/src/ui/shell.css"><link rel="stylesheet" href="/src/ui/open-panels.css"></head><body><button id="opener">Open panel</button></body></html>');
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

// The panels a player can open today: the account and settings screens, the Harbor cards (overview, weather,
// market stall, match board), the old islet panel (islands flag off) and the island's build,
// bell and invite cards. The case screens and the duel arena panel left with the mystery (10 Nov); the old
// Exchange, sports and prediction panels were replaced in the game by the Harbor cards (lane H).
async function panel(name){
  {
    await page.goto(url+'/__panel-review');
    await page.evaluate(async name=>{
      const ctx={container:document.body,focus:()=>document.querySelector('#opener')?.focus(),focusGame:()=>document.querySelector('#opener')?.focus(),resetInput:()=>{}};
      const fx=await import('/tests/harbor/fixtures.js');
      if(name==='account'){
        const {createAccountScreen}=await import('/src/screens/account/index.js');
        const {createModal}=await import('/src/ui/kit/modal.js');
        const screen=createAccountScreen({send:async()=>({accepted:false})});
        screen.update({account:{state:'signed_in',captainName:'Harbor explorer',hasKit:true,
          save:{state:'conflict',device:{state:'saved',label:'Your island · a cannon built'},cloud:{state:'saved',label:'The Harbor · a stake placed'}}}});
        const modal=createModal({title:'Your captain',body:screen.element});modal.element.classList.add('account-modal');modal.open(document.body);
      }else if(name==='settings'){
        const {createSettingsView}=await import('/src/settings/view.js');
        const {createModal}=await import('/src/ui/kit/modal.js');
        const modal=createModal({title:'Settings',body:createSettingsView({})});
        modal.element.classList.add('shell-screen');modal.element.dataset.mode='settings';modal.open(document.body);
      }else if(name==='harbor'){
        const {createOverviewCard}=await import('/src/harbor/overview.js');
        window.__panel=createOverviewCard({...ctx,openStall:()=>{}});window.__panel.open();
      }else if(name==='weather'){
        const {createWeatherCard}=await import('/src/harbor/overview.js');
        window.__panel=createWeatherCard({...ctx,getWeather:()=>fx.weatherAnswer('storm')});window.__panel.open();
      }else if(name==='market'){
        const {createMarketEntry}=await import('/src/harbor/market-card.js');
        window.__panel=createMarketEntry({...ctx,adapter:fx.fakeCalls({calls:[fx.marketCall(),fx.marketCall({id:'won',status:'won',settlePrice:75000,payout:20,settleAt:'2026-11-11T11:00:00Z'})]}),now:()=>fx.NOW});await window.__panel.open();
      }else if(name==='match'){
        const {createSportsPanel}=await import('/src/harbor/match-card.js');
        window.__panel=createSportsPanel({...ctx,adapter:fx.fakeSports(),getToken:()=>'token',clock:()=>fx.NOW,timeZone:'UTC'});await window.__panel.open();
      }else if(name==='islet'){
        const {createIsletPanel}=await import('/src/screens/islet/panel.js');
        const {createIsletAdapter}=await import('/src/screens/islet/adapter.js');
        const {createFakeIsletTransport}=await import('/src/screens/islet/fake-transport.js');
        const adapter=createIsletAdapter({transport:createFakeIsletTransport(),mode:'local'});await adapter.refresh();
        window.__panel=createIsletPanel({...ctx,adapter});window.__panel.open();
      }else{
        const {createIslandUi}=await import('/src/island/ui.js');
        const model=await import('/src/island/card-model.js');
        const ui=createIslandUi({container:document.body});window.__panel=ui;
        if(name==='build')ui.buildCard(model.buildCardModel({spotId:'cannon_1',kind:'cannon',spot:{id:'cannon_1',kind:'cannon',built:false,cost:30},coins:100}),()=>{});
        else if(name==='bell')ui.bellCard(model.bellModel({waveBest:1}),()=>{});
        else ui.inviteCard(model.inviteModel('ISLE-K7Q2M','https://example.test/'));
      }
    },name);
    // Let lazy card data settle (the Harbor cards ask their fake adapters once).
    await page.waitForTimeout(150);
  }
  // The shared CSS loads in the page head, before these later lazy panel stylesheets.
  await page.locator('dialog[open]').waitFor();
  await page.evaluate(async()=>{for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);});
}

try{
  for(const name of ['account','settings','harbor','weather','market','match','islet','build','bell','invite']){
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
          scrolls:[...root.querySelectorAll('.kit-modal-body')].filter(el=>el.scrollHeight>el.clientHeight+1).map(el=>el.className)};
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
