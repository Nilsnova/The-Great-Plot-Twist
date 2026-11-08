// Actual menu components, local account data and standalone player pages; no world renderer.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createServer} from 'vite';

const polish=process.env.SETTINGS_POLISH!=='0',out=process.env.SETTINGS_CAPTURE_DIR??`captures/settings-${polish?'polished':'baseline'}`;
await mkdir(out,{recursive:true});
const fixture={name:'settings-visual-fixture',configureServer(server){server.middlewares.use('/__settings-review',(_req,res)=>{
  res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/ui/base.css"><link rel="stylesheet" href="/src/ui/kit/kit.css"><link rel="stylesheet" href="/src/ui/shell.css"><link rel="stylesheet" href="/src/ui/open-panels.css">${polish?'<link rel="stylesheet" href="/src/ui/settings-polish.css">':''}</head><body><button id="opener">Open test menu</button></body></html>`);
});}};
const server=await createServer({logLevel:'error',cacheDir:'/tmp/plot-twist-settings-visual-vite',plugins:[fixture],server:{host:'127.0.0.1',port:0,hmr:false}});
await server.listen();const url=server.resolvedUrls.local[0].replace(/\/$/,'');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-webgl']});
const page=await browser.newPage(),report={polish,screens:[],navigation:[],errors:[],external:[]};
page.on('pageerror',error=>report.errors.push(error.message));
await page.route('**/api/**',route=>route.fulfill({status:404,contentType:'application/json',body:'{"error":{"code":"feature_off","message":"Local visual review."}}'}));
await page.route('https://**',route=>{report.external.push(route.request().url());return route.abort();});

async function menu(){
  await page.goto(url+'/__settings-review');
  await page.evaluate(async()=>{
    const {createShell}=await import('/src/shell/controller.js');
    window.__shell=createShell({container:document.body,readSave:()=>null,readAccount:()=>({canContinue:false}),resetInput(){},onState(){},focus(){document.querySelector('#opener').focus();},onPlay(){},hasOverlay:()=>false,
      settingsView:async()=>{const {createSettingsView}=await import('/src/settings/view.js');return createSettingsView({mode:'online',account:{state:'signed_out'}});}});
    window.__shell.openSettings();
  });
  await page.locator('.preferences').waitFor();
}
async function capture(name,selector='dialog[open]'){
  const result=await page.locator(selector).evaluate(async root=>{
    const h=await import('/scripts/a11y-helpers.js');
    const nodes=[root,...root.querySelectorAll('*')].filter(el=>h.renderedForAudit(el));
    const text=nodes.filter(el=>[...el.childNodes].some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim()));
    const controls=nodes.filter(el=>el.matches('button:not(:disabled),select:not(:disabled),input:not(:disabled),a[href],summary'));
    const contrasts=text.filter(el=>!el.closest(':disabled')).map(el=>{
      let bg={r:255,g:255,b:255,a:1};const ancestors=[];for(let n=el;n;n=n.parentElement)ancestors.unshift(n);
      for(const n of ancestors){const color=h.parseColour(getComputedStyle(n).backgroundColor);if(color)bg=h.compositeColour(color,bg);}
      const fg=h.parseColour(getComputedStyle(el).color);return {text:el.textContent.slice(0,60),ratio:fg?h.contrastRatio(fg,bg):null};
    });
    const r=root.getBoundingClientRect();return{fits:root.tagName!=='DIALOG'||h.withinViewport(r,{width:innerWidth,height:innerHeight}),
      overflow:h.hasHorizontalOverflow(root)||h.hasHorizontalOverflow(document.documentElement),
      smallText:text.filter(el=>parseFloat(getComputedStyle(el).fontSize)<16).map(el=>({class:el.className,text:el.textContent.slice(0,60)})),
      smallTargets:controls.filter(el=>!h.touchTargetMeetsMinimum(h.touchRectForAudit(el))).map(el=>el.textContent.slice(0,60)),
      lowContrast:contrasts.filter(item=>item.ratio===null||item.ratio<7),
      scrollTop:root.querySelector('.kit-modal-body')?.scrollTop??scrollY};
  });
  const size=page.viewportSize();report.screens.push({name,viewport:size,...result});
  assert.ok(result.fits,`${name} fits ${size.width}x${size.height}`);assert.ok(!result.overflow,`${name} no horizontal overflow`);
  if(polish){assert.equal(result.smallText.length,0,`${name} readable text`);assert.equal(result.smallTargets.length,0,`${name} full-size targets`);assert.deepEqual(result.lowContrast,[],`${name} text contrast7`);}
  await page.screenshot({path:`${out}/${name}-${size.width}x${size.height}.png`});
}
async function account(){
  await page.goto(url+'/__settings-review');
  await page.evaluate(async()=>{
    const {createAccountHost}=await import('/src/shell/account-host.js');
    const view={mode:'online',account:{state:'signed_in',captainName:'Captain of the Northern Lighthouse and the Stormy Sea',canSignIn:true,hasKit:true,
      save:{state:'conflict',device:{state:'saved',label:'Cottage desk · brass key found · current device',updatedAt:'2026-11-08T14:35:00Z'},cloud:{state:'saved',label:'Harbor crew · search completed · cloud copy',updatedAt:'2026-11-08T14:40:00Z'}}}};
    window.__account=createAccountHost({container:document.body,adapter:{read:()=>view},focus:()=>document.querySelector('#opener').focus()});await window.__account.open();
  });
  await page.locator('.account-screen').waitFor();
}
try{
  for(const viewport of [{width:1280,height:800},{width:375,height:667},{width:320,height:568},{width:844,height:390},{width:375,height:400}]){
    await page.setViewportSize(viewport);await menu();await capture('settings-top');
    const range=page.getByRole('slider',{name:'Master volume',exact:true});await range.focus();await page.keyboard.press('Home');
    assert.equal(await range.inputValue(),'0');
    const output=page.locator('.preference:has([data-preference=master]) output');
    if(polish){
      assert.equal(await output.textContent(),'0%');const start=await output.boundingBox();
      await page.keyboard.press('End');assert.equal(await output.textContent(),'100%');
      assert.equal(await range.getAttribute('aria-valuetext'),'100 percent');
      assert.equal(await output.getAttribute('aria-hidden'),'true');
      const end=await output.boundingBox();assert.ok(Math.abs(start.width-end.width)<1&&Math.abs(start.x-end.x)<1,'Volume value has a fixed position');
    }else await page.keyboard.press('End');
    assert.equal(await range.inputValue(),'100');await capture('settings-range-focus');
    await page.locator('.controls-overview').scrollIntoViewIfNeeded();await capture('settings-controls');
    await page.getByRole('button',{name:'Credits',exact:true}).scrollIntoViewIfNeeded();await capture('settings-footer');
    await page.getByRole('button',{name:'Credits',exact:true}).click();await page.locator('.shell-credits').waitFor();await capture('credits-top');
    await page.getByRole('button',{name:'Back',exact:true}).scrollIntoViewIfNeeded();await capture('credits-footer');
    await page.keyboard.press('Escape');assert.equal(await page.locator('dialog[open]').getAttribute('data-mode'),'settings');
    await page.keyboard.press('Escape');assert.equal(await page.locator('dialog[open]').getAttribute('data-mode'),'title');
    if(polish){
      await page.evaluate(()=>{window.__shell.play();window.__shell.show('pause');});
      await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('.preferences').waitFor();
      await page.getByRole('button',{name:'Close dialog',exact:true}).click();
      assert.equal(await page.locator('dialog[open]').getAttribute('data-mode'),'pause');
    }
    report.navigation.push({viewport,creditsEscape:'settings',settingsEscape:'title',settingsCloseFromPause:polish?'pause':'not checked'});
    await account();await capture('account-long-name');await page.getByRole('button',{name:'Delete my data',exact:true}).click();
    await page.locator('.account-delete-confirm').scrollIntoViewIfNeeded();await capture('account-deletion');
    if(polish){const colors=await page.locator('.account-delete-confirm').evaluate(root=>[...root.querySelectorAll('button')].map(el=>getComputedStyle(el).backgroundColor));assert.notEqual(colors[0],colors[1],'Deletion and keep-data actions remain visually distinct');}
    await page.goto(url+'/__settings-review');await page.evaluate(async()=>{const {createShortcutsOverlay}=await import('/src/shell/hints/shortcuts.js');window.__shortcuts=createShortcutsOverlay();window.__shortcuts.open(document.body);});
    await capture('shortcuts-top');await page.locator('.shortcuts-note').scrollIntoViewIfNeeded();await capture('shortcuts-footer');
    await page.goto(url+'/help.html');await capture('help-top','.help-layout');
    await page.locator('#topic-search').fill('volcano unicorn missing');await page.locator('#no-results').waitFor({state:'visible'});
    await page.locator('#help-search').scrollIntoViewIfNeeded();await capture('help-no-results','.help-layout');
    await page.locator('#clear-search').click();assert.equal(await page.locator('#topic-search').inputValue(),'');
    await page.locator('.help-footer').scrollIntoViewIfNeeded();await capture('help-footer','.help-layout');
    await page.goto(url+'/privacy.html');await capture('privacy-top','.page');
    await page.locator('footer').scrollIntoViewIfNeeded();await capture('privacy-footer','.page');
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);
  console.log(JSON.stringify({screens:report.screens.length,navigation:report.navigation.length,smallTextScreens:report.screens.filter(s=>s.smallText.length).map(s=>s.name),smallTargetScreens:report.screens.filter(s=>s.smallTargets.length).map(s=>s.name),errors:report.errors}));
}finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();await server.close();}
