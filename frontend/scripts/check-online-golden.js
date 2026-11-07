// Production online path, recorded HTTP only. Later streams extend this same path through sign-in and the case.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {openWorldBrowser} from './world-browser-tools.js';
import {stubIntro} from './intro-browser-fixture.js';
import {startFromTitle} from './shell-browser-tools.js';
import {expandTitleAccount, chooseIntroAction, finishIntroPassages, assertEngineReplay} from './online-browser-actions.js';

const env=await openWorldBrowser({preview:true}),{page}=env;
const folder='captures/20261106_G9-C1';
const report={checks:[],requests:[],stage:'stream 2: anonymous real adapter'};
const check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};
try{
  await mkdir(folder,{recursive:true});
  await page.route('https://*.supabase.co/**',route=>{
    report.requests.push({path:'intercepted Supabase request',method:route.request().method()});
    return route.abort();
  });
  await stubIntro(page);
  page.on('request',request=>{
    const path=new URL(request.url()).pathname;
    if(path.startsWith('/api/'))report.requests.push({path,method:request.method(),
      authorized:!!request.headers().authorization});
  });
  for(const width of [1280,375]){
    await page.setViewportSize({width,height:800});await page.goto(env.url);
    const accountSummary = await expandTitleAccount(page);
    await accountSummary.getByRole('button',{name:'Account and saves',exact:true}).waitFor();
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    const link=page.getByRole('link',{name:'Report a problem',exact:true});
    await link.dispatchEvent('pointerdown',{pointerType:'mouse'});
    const body=new URL(await link.getAttribute('href')).searchParams.get('body');
    check(body.includes('Mode: online'),'Ordinary production title uses the real online adapter at '+width+' px');
    check(body.includes('Account state: signed_out'),'Recorded flag-off build invents no sign-in');
    await page.keyboard.press('Escape');await startFromTitle(page,{closeIntro:false});
    for(const id of ['to_desk','take_key','read_log','desk_back','to_shore','take_lantern',
      'warn_harbor','shore_back','to_tower','unlock_door','climb','signal']){
      await chooseIntroAction(page, id);
    }
    await finishIntroPassages(page);
    await assertEngineReplay(page);
    check(true, 'Dialogue paging never enters the accepted move journal');
    await page.locator('.intro-ending').waitFor();
    await page.getByText('Sign in with GitHub to claim your kit. Your progress on this device is kept.',
      {exact:true}).first().waitFor();
    check(await page.locator('.case-kit-name').count()===0,'Anonymous ending never grants a local kit');
    check(await page.locator('.case-arrival').getByRole('button',{name:'Sign in with GitHub',exact:true}).count()===0,
      'Flag-off or unconfigured arrival exposes no sign-in control');
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('plot_twist_intro_moves_v1')));
    check(saved.actions.at(-1)==='signal','Anonymous ending retains the accepted replay on this device');
    check(await page.evaluate(()=>!window.__island&&!window.__plotTwist),'Production exposes no inspection hooks');
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Online intro fits '+width+' px');
    await page.locator('.intro-arrival-slot .case-arrival').scrollIntoViewIfNeeded();
    await page.screenshot({path:`${folder}/online-intro-${width}.png`});
  }
  check(report.requests.some(r=>r.path==='/api/config')
    &&report.requests.every(r=>r.method==='GET'&&!r.authorized),'Anonymous public reads carry no token or write');
  check(env.errors.length===0&&env.external.length===0,'Recorded online path has no browser errors or external calls');
  console.log(JSON.stringify(report,null,2));
}finally{
  await writeFile(folder+'/online-golden.json',JSON.stringify(report,null,2)+'\n');await env.close();
}
if(!process.argv.includes('--anonymous-only')){
await (await import('./check-online-auth.js')).checkOnlineAuth();
await (await import('./check-online-signin-gate.js')).checkOnlineSignInGate();
await (await import('./check-online-account.js')).checkOnlineAccount();
await (await import('./check-online-crew.js')).checkOnlineCrew();
await (await import('./check-online-presence.js')).checkOnlinePresence();
}
