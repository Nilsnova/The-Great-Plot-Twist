// G14 browser checks against fake same-origin API responses only; never connects to Supabase.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const origin='http://127.0.0.1:4179';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1',
  '--port','4179','--strictPort'],{stdio:'pipe'});
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const crewId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const token='browser-test-memory-only';
const summary={players:12,crews:{forming:2,active:3,finished:1},openPositions:4,
  realtimeConnections:null,day:'2026-11-06',walletToday:[{reason:'kit_grant',count:2,earned:100,spent:0,net:100}],
  build:{version:'test-build',commit:'unknown'},weather:{source:'fallback',origin:'recorded',fetchedAt:null},
  flags:{market:false},demoMode:true,caseClockAvailable:false,caseClockActions:[],
  expectedMigrations:[{name:'20261106170000_host_console.sql',feature:'core',objectPresent:true}],
  keepalive:{today:false,lastSuccessAt:null,timezone:'UTC'}};
const crew={id:crewId,code:'K7QF2M',status:'forming',startedAt:null,canClose:true,
  seats:[{seatNo:1,kind:'player',captainName:'Captain Fern'}]};
const directory=process.env.G14_CAPTURE_DIR||'captures';
let browser;
try {
  for(let i=0;i<60;i++) {
    try {if((await fetch(origin)).ok)break;} catch {/* bounded startup wait */}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/chromium',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
  const errors=[],external=[],calls=[],closes=[];
  let signedIn=false,closed=false,unknownOutcome=true,clockAvailable=false,clockUnknown=true;
  const clockCalls=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==origin){external.push(url.origin);await route.abort();return;}
    if(!url.pathname.startsWith('/api/')){await route.continue();return;}
    calls.push(url.pathname);
    const send=(status,json)=>route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(json)});
    if(url.pathname==='/api/auth/exchange'){signedIn=true;await send(200,{accessToken:token});return;}
    if(!signedIn){await send(403,{error:{code:'forbidden',message:'Only a host can do this.'}});return;}
    assert.equal(request.headers().authorization,`Bearer ${token}`);
    if(url.pathname==='/api/config'){await send(200,{capabilities:{hostCaseClock:clockAvailable}});return;}
    if(url.pathname==='/api/host/overview'){await send(200,summary);return;}
    if(url.pathname==='/api/host/crews'){
      await send(200,{crews:[{...crew,status:closed?'finished':'forming',canClose:!closed}],total:1,limit:50});return;
    }
    if(url.pathname.endsWith('/close')){
      closes.push(request.postDataJSON());
      if(unknownOutcome){unknownOutcome=false;await route.abort();return;}
      closed=true;await send(200,{status:'closed',crewId});return;
    }
    if(url.pathname==='/api/host/case/clock'){
      clockCalls.push(request.postDataJSON());
      if(clockUnknown){clockUnknown=false;await route.abort();return;}
      await send(200,{accepted:true,reason:null,message:'The case clock moved forward.',
        ...(clockCalls.length===2?{repeat:true}:{now:2725}),
        case:{privateTestSentinel:'DO-NOT-RENDER-THE-CASE-VIEW'}});return;
    }
    throw new Error(`Unexpected API request: ${url.pathname}`);
  });
  await page.goto(`${origin}/host.html`);
  await page.getByRole('status').filter({hasText:'Not a host'}).waitFor();
  assert.equal(await page.locator('#host-panels').isHidden(),true);
  assert.deepEqual(calls,['/api/host/overview']);
  // Test-only callback fixture. A real login is neither needed nor attempted.
  await page.addInitScript(()=>sessionStorage.setItem('host-console-pkce','test-only-pkce-verifier'));
  await page.goto(`${origin}/host.html?code=test-only-code`);
  await page.getByRole('heading',{name:'Game overview',exact:true}).waitFor();
  assert.equal(new URL(page.url()).search,'');
  assert.equal(await page.locator('[data-panel=clock]').count(),0);
  assert.equal(await page.locator('script:not([src]),style,[style]').count(),0);
  assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(27, 48, 40)');
  assert.match(await page.locator('#host-panels').innerText(),/Private API headers: passed/);
  assert.equal(await page.getByRole('link',{name:'Open game performance check'}).getAttribute('href'),'./?perf=1');
  await mkdir(directory,{recursive:true});
  await page.screenshot({path:`${directory}/G14-Host-Desktop.png`,fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:`${directory}/G14-Host-Phone.png`,fullPage:true});
  const close=page.getByRole('button',{name:'Close test crew',exact:true});
  assert.equal(await close.isDisabled(),true);
  await page.getByRole('checkbox').check();await close.click();
  await page.getByRole('status').filter({hasText:'Outcome unknown'}).waitFor();
  await close.click();await page.getByText('finished · sailed not yet',{exact:true}).waitFor();
  assert.equal(closes.length,2);assert.deepEqual(closes[0],closes[1]);
  assert.match(closes[0].actionUid,/^[a-f0-9-]{36}$/);
  clockAvailable=true;
  await page.getByRole('button',{name:'Refresh console',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Host access confirmed'}).waitFor();
  assert.equal(await page.locator('[data-panel=clock]').count(),0,'The case clock left with the mystery (10 Nov)');
  assert.equal(clockCalls.length,0);
  assert.equal((await page.locator('body').innerText()).includes('DO-NOT-RENDER-THE-CASE-VIEW'),false);
  assert.equal((await page.locator('body').innerText()).includes(token),false);
  assert.equal(await page.evaluate(()=>Object.values(localStorage).includes('browser-test-memory-only')||
    Object.values(sessionStorage).includes('browser-test-memory-only')),false);
  await page.getByRole('button',{name:'Forget me',exact:true}).click();
  assert.equal(await page.locator('#host-panels').isHidden(),true);
  assert.deepEqual(external,[]);
  // The intentionally aborted write is expected to produce a browser network error.
  assert.deepEqual(errors.filter(e=>!e.includes('net::ERR_FAILED')&&!e.includes('status of 403')),[]);
  const report={checked:new Date().toISOString(),browser:browser.version(),checks:[
    'Non-host sees no panels','Host callback is cleaned','Strict CSP and external CSS work',
    'Safe overview, crews and checklist','No case clock panel','390px layout has no page overflow',
    'Cleanup requires confirmation and retries with the same UUID','Token stays off screen/storage',
    'No case clock request even with the old capability',
    'Forget me removes host data','No external requests; only mocked same-origin API',
  ]};
  await writeFile(`${directory}/G14-Host-Checks.json`,`${JSON.stringify(report,null,2)}\n`);
  console.log(JSON.stringify(report,null,2));
} finally {await browser?.close();server.kill();}
