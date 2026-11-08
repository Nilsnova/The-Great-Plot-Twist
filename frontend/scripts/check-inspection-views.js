// Component-only visual audit of earned case views; no world renderer, live account or server request.
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {createBuildIdentityPlugin} from './build-identity.js';
import {createCaseFixture} from './online-case-fixture.js';

const output=process.env.INSPECTION_CAPTURES??'/tmp/inspection-visual-audit';await mkdir(output,{recursive:true});
const stamp={sha:'dev',builtAt:'2026-11-08T00:00:00Z'};
const server=await createServer({configFile:false,envDir:false,root:process.cwd(),
  plugins:[{name:'inspection-base-styles',transformIndexHtml:html=>html
    .replace('</head>','<link rel="stylesheet" href="/src/ui/base.css"></head>')
    .replace('<script type="module" src="/src/adapter/lab.js"></script>','<script type="module">import "/src/ui/open-panels.css";import "/src/adapter/lab.js";</script>')},
    createBuildIdentityPlugin(stamp)],define:{__BUILD_STAMP__:JSON.stringify(stamp)},
  server:{host:'127.0.0.1',port:0},logLevel:'error'});
await server.listen();const base=`http://127.0.0.1:${server.httpServer.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/usr/bin/chromium',headless:true,args:['--disable-gpu']});
const context=await browser.newContext({reducedMotion:'reduce'}),page=await context.newPage(),report={screens:[],errors:[],external:[]};
page.on('pageerror',error=>report.errors.push(error.message));
await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==base){report.external.push(url.origin);return route.abort();}if(url.pathname.startsWith('/api/'))return route.abort();return route.continue();});
const scenarios=[['arrival-ready','arrival'],['arrival-pending','arrival'],['search-choose','search'],['search-empty','search'],
  ['search-locked','search'],['search-working','search'],['search-done','search'],['partners-idle','partners'],
  ['partners-working','partners'],['partners-done','partners'],['partners-empty','partners'],['log-earned','log'],
  ['log-empty','log'],['rewards-ready','rewards'],['rewards-unavailable','rewards'],['lights-ready','finale'],
  ['lights-night','finale'],['lights-no-crew','finale'],['inspection-error','search'],['inspection-long-report','search']];
try{
  await page.goto(base+'/case-lab.html?demo=1');await page.waitForFunction(()=>window.__caseLab);
  await page.evaluate(async()=>{window.__caseLab.screens.dispose();window.__caseLab.adapter.dispose();document.body.replaceChildren();
    await import('/src/ui/open-panels.css');const {createFakeCaseAdapter}=await import('/src/adapter/fake/index.js');
    const fake=createFakeCaseAdapter({allowBrowse:true});window.pendingArrival=fake.read().arrival;fake.dev.rehearse('board');window.baseCaseView=fake.read();fake.dispose();});
  for(const [name,screen]of scenarios){
    const progress={search:name==='search-working'?'working':name==='search-done'||name==='log-earned'||name==='inspection-long-report'?'done':undefined,
      partner:name==='partners-working'?'working':name==='partners-done'||name==='log-earned'?'done':undefined,
      night:name==='lights-night'?'night':name==='lights-ready'?'ready':undefined,post:name==='lights-night'};
    const snapshot=createCaseFixture({stage:name==='log-earned'?'paired':'earned',progress});
    if(name==='search-done'){snapshot.search.jobs[0].total=0;snapshot.search.spots[0].routes[0].timerSeconds=0;}
    if(name==='inspection-long-report'){
      snapshot.search.spots[0].line='Supplied inspection observation. '.repeat(12);
      snapshot.search.jobs[0].foundLine='Supplied earned report with the full observation preserved for reading. '.repeat(8);
    }
    await page.evaluate(async({name,screen,snapshot})=>{
      window.inspectionProof?.dispose();const {projectCase}=await import('/src/online/case-adapter/case-view.js');
      const {createCaseScreens}=await import('/src/screens/controller.js');const base=structuredClone(window.baseCaseView);
      const earned=projectCase(snapshot,{activeSpot:name==='search-choose'?null:snapshot.search.spots[0].hotspot});
      const view={...base,...earned,mode:'online',crew:{...base.crew,caseReady:true},rewards:{...base.rewards,...earned.rewards}};
      if(name==='arrival-pending')view.arrival=structuredClone(window.pendingArrival);
      if(name==='search-empty')view.search.routes=[];
      if(name==='search-locked'){view.search.routes[0].canStart=false;view.search.routes[0].statusText='Supplied route opens in 3 minutes.';}
      if(name==='partners-empty')view.partners=[];
      if(name==='log-empty')view.log={cards:[],deductions:[],partnerReports:[],nights:[],reveal:[]};
      if(name==='rewards-unavailable')Object.assign(view.rewards,{status:'unavailable',ledger:[]});
      if(name==='lights-no-crew'){view.crew.status='none';view.finale.lights=[];}
      const adapter={read:()=>structuredClone(view),subscribe:()=>()=>{},inspectSpot:async()=>({accepted:false,reason:'offline',
        message:'The connection is offline. Your progress on this device is kept.',view:structuredClone(view)})};
      const screens=createCaseScreens({container:document.body,adapter});await screens.open(screen);
      if(name==='inspection-error')await screens.send('inspectSpot',view.search.spots[0].id);
      window.inspectionProof=screens;
    },{name,screen,snapshot});
    const root=page.locator('.case-modal[open]');await root.waitFor();
    for(const [width,height]of [[1280,800],[375,667],[320,568],[844,390],[375,400]]){
      await page.setViewportSize({width,height});await root.evaluate(root=>{
        for(const scroller of [root,...root.querySelectorAll('.kit-modal-body,.case-screen-body,.case-screen-content')])scroller.scrollTop=0;
      });
      await page.screenshot({path:`${output}/${name}-${width}x${height}.png`});
      const result=await root.evaluate(async root=>{
        const h=await import('/scripts/a11y-helpers.js'),content=root.querySelector('.case-screen-content'),header=root.querySelector('.kit-modal-header').getBoundingClientRect(),
          nav=root.querySelector('.case-nav').getBoundingClientRect(),area=content.getBoundingClientRect(),close=root.querySelector('.kit-icon-button'),r=close.getBoundingClientRect();
        const controls=h.tabbableForAudit(root),fonts=[],contrast=[];let minimumContrast=21;
        for(const el of [root,...root.querySelectorAll('*')].filter(el=>h.renderedForAudit(el))){
          if(![...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())||el.matches('option,script,style')||el.closest('.kit-sr-only,.server-call-announcement'))continue;
          const style=getComputedStyle(el),metadata=el.closest('button,a[href],label,select,output,nav,small,kbd,dt,dd,figcaption,.case-caption,.case-eyebrow,.case-clock,.partner-chart-caption,.partner-life-status,.kit-badge');
          if(parseFloat(style.fontSize)<(metadata?16:18))fonts.push(el.className||el.tagName);
          if(el.closest(':disabled'))continue;
          let bg={r:255,g:255,b:255,a:1};const ancestors=[];for(let n=el;n;n=n.parentElement)ancestors.unshift(n);
          for(const n of ancestors){const colour=h.parseColour(getComputedStyle(n).backgroundColor);if(colour)bg=h.compositeColour(colour,bg);}
          const fg=h.parseColour(style.color);if(fg){for(const n of ancestors)fg.a*=Number(getComputedStyle(n).opacity);const ratio=h.contrastRatio(fg,bg);minimumContrast=Math.min(minimumContrast,ratio);if(ratio<7)contrast.push({element:el.className||el.tagName,ratio});}
        }
        return {fits:h.withinViewport(root.getBoundingClientRect(),{width:innerWidth,height:innerHeight}),
          noOverflow:!h.hasHorizontalOverflow(root)&&!h.hasHorizontalOverflow(content),bodyVisible:area.height>=60,
          noOverlap:area.top>=nav.bottom&&nav.top>=header.bottom,closeHit:close.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),
          targets44:controls.filter(c=>c.matches('button,input,select,a[href],summary')).every(c=>h.touchTargetMeetsMinimum(h.touchRectForAudit(c))),
          text:content.innerText,scrollHeight:content.scrollHeight,bodyHeight:content.clientHeight,fonts,contrast,minimumContrast};
      });
      await root.evaluate(async root=>{const h=await import('/scripts/a11y-helpers.js');h.tabbableForAudit(root).at(-1)?.focus();});
      await page.keyboard.press('Tab');const focusWrapped=await root.evaluate(async root=>{const h=await import('/scripts/a11y-helpers.js');return document.activeElement===h.tabbableForAudit(root)[0]&&h.visibleFocusForAudit(document.activeElement);});
      report.screens.push({name,width,height,...result,focusWrapped});
    }
  }
}finally{await writeFile(output+'/checks.json',JSON.stringify(report,null,2));await browser.close();await server.close();}
const failures=report.screens.filter(s=>!s.fits||!s.noOverflow||!s.bodyVisible||!s.noOverlap||!s.closeHit||!s.targets44||!s.focusWrapped||s.fonts.length||s.contrast.length);
console.log(JSON.stringify({screens:report.screens.length,failures:failures.map(({name,width,height,...checks})=>({name,width,height,checks})),errors:report.errors,external:report.external},null,2));
if(failures.length||report.errors.length||report.external.length)process.exitCode=1;
