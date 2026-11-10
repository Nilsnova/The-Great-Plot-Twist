// Public production islet controls with intercepted answers; no development inspection or event injection.
import assert from 'node:assert/strict';
import {signInFromTitle} from './online-chaos-signin.js';
import {openAccountControls, playFromTitle} from './online-browser-actions.js';
import {dismissPanels} from './shell-browser-tools.js';
import {onlineChaosFaults} from './online-chaos-fixtures.js';

const modal=page=>page.locator('.islet-modal[open]');
const station=page=>modal(page).locator('.islet-spot[data-plot="islet_signal_station"]');
const build=page=>station(page).locator('button');
const writes=env=>env.isletRequests.filter(request=>request.method==='POST');
async function holdKey(page,key,ms){await page.keyboard.down(key);try{await page.waitForTimeout(ms);}finally{await page.keyboard.up(key);}}
const walletAfterBuild=page=>page.waitForFunction(()=>document.querySelector('.islet-wallet')?.textContent==='You have 700 coins and 10 timber.');
async function savedCaptain(page){
  await page.locator('.captain-status [role="status"][data-state="saved"]').waitFor({state:'visible'});
  const saved=await page.locator('.captain-status > [role="status"][data-state]').evaluate(element=>({
    state:element.dataset.state,healthy:!/(?:offline|conflict|saving)/i.test(element.textContent??'')}));
  assert.ok(saved.state==='saved'&&saved.healthy,'The native captain status confirms cloud save readiness');
}
async function chartLanding(page,place,label){
  // M is ignored while the world is still arriving (a cloud save can land on the Home islet): press it
  // again, as a player would, until the chart opens.
  const chart=page.locator('.sea-chart[open]');
  for(let attempt=0;;attempt+=1){
    await page.locator('canvas[tabindex="0"]').focus();await page.keyboard.press('KeyM');
    try{await chart.waitFor({timeout:5000});break;}catch(error){if(attempt>=3)throw error;}
  }
  await chart.getByRole('img',{name:'Built signal station',exact:true}).waitFor({state:'visible'});
  const landing=chart.locator(`[data-place="${place}"]`);
  assert.equal(await landing.getAttribute('aria-disabled'),'false','The public chart enables this recorded landing');
  await chart.getByRole('checkbox',{name:'Fast travel',exact:true}).check();await landing.click();
  await page.waitForFunction(label=>document.querySelector('.chapter')?.textContent.includes(label),label);
  await page.locator('.sailing').waitFor({state:'hidden'});await chart.waitFor({state:'hidden'});
  await savedCaptain(page);
}
async function standByBuiltStation(page){
  // Public chart round trip restores the published centerline spawn without moving any view/state hook.
  await chartLanding(page,'saltreach_harbor','Saltreach Harbor');
  await chartLanding(page,'home_islet','Home islet');
  await page.locator('canvas[tabindex="0"]').focus();await page.keyboard.down('KeyW');
  try{await page.waitForFunction(()=>{const prompt=document.querySelector('.interact');
    return prompt&&!prompt.hidden&&prompt.getClientRects().length>0&&prompt.dataset.zone==='islet_signal_station';
  },null,{timeout:20000});}finally{await page.keyboard.up('KeyW');}
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.locator('dialog[open]').count(),0,'The station world capture has no covering dialog');
  assert.ok(await page.evaluate(()=>document.activeElement?.matches('canvas[tabindex="0"]')),
    'The physical station approach retains native canvas focus');
}

export async function enterRecordedIslet(env){
  const {page}=env;env.resetIslet();
  await signInFromTitle(env);await openAccountControls(page);
  await page.getByRole('button',{name:'Change captain name once',exact:true}).waitFor();
  await page.keyboard.press('Escape');await page.locator('.account-modal').waitFor({state:'hidden'});
  await playFromTitle(page);
  await page.locator('.hud.exploring').waitFor();
  await page.waitForFunction(()=>document.querySelector('.chapter')?.textContent.includes('Home islet'));
  await dismissPanels(page); // This public helper already closes the open panels; no extra Escape.
  await savedCaptain(page);
  assert.equal(await page.locator('.shell-screen[open],.account-modal[open]').count(),0,'Continue leaves the world ready for physical movement');
  await page.locator('canvas[tabindex="0"]').focus();
  // Published spawn (0,12) -> public workshop zone (7,7.5), with an observed HUD prompt as the final gate.
  await holdKey(page,'KeyW',1250);
  await page.keyboard.down('KeyD');
  try{await page.waitForFunction(()=>{
    const prompt=document.querySelector('.interact');return prompt&&!prompt.hidden&&prompt.dataset.zone==='plot_2';
  },null,{timeout:6000});}finally{await page.keyboard.up('KeyD');}
  await page.keyboard.press('KeyE');await modal(page).waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('.islet-modal[open] .islet-spot').length===5);
  await page.waitForFunction(()=>/1.?000 coins and 20 timber/.test(document.querySelector('.islet-wallet')?.textContent??''));
  assert.equal(await build(page).isEnabled(),true,'The server-supplied station card allows this recorded build');
  return modal(page);
}

export async function recordedIsletGolden(env,{width=375,capture}={}){
  const {page}=env,checks=[];const check=(okay,label)=>{assert.ok(okay,label);checks.push(label);};
  await page.setViewportSize({width,height:812});await enterRecordedIslet(env);
  check(env.isletSaveStats().acceptedPuts>0&&env.isletSaveStats().version>1,
    'Continue receives an accepted incrementing server save before the islet journey');
  check(!/Local rehearsal/.test(await modal(page).textContent()),'The production islet panel uses the real A2 transport');
  const before=writes(env).length,held=env.holdNextBuild();
  await build(page).scrollIntoViewIfNeeded();await build(page).click();await held.started;
  check(await build(page).isDisabled(),'One pending build disables its public control');
  await build(page).dispatchEvent('click');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  check(writes(env).length===before+1,'A forced second activation sends no duplicate build');
  held.release();await walletAfterBuild(page);
  await page.waitForFunction(()=>document.querySelector('.islet-spot[data-plot="islet_signal_station"]')?.dataset.state==='built');
  check(await build(page).isHidden(),'The accepted server snapshot replaces Build with the standing building');
  check(/Signal station built/.test(await modal(page).locator('.islet-status').textContent()),'The server receipt shows the successful building and remaining resources');
  assert.deepEqual(env.isletStats(),{coins:700,timber:10,charges:1,builtCount:1});
  check(env.isletRequests.slice().filter(request=>request.method==='POST').at(-1).bodyKeys.join()==='actionUid,plot,type',
    'The A2 build body has exactly actionUid, plot and server-supplied type');
  check(await page.evaluate(()=>!window.__island&&!window.__isletLocal&&!window.__plotTwist),'Production exposes no inspection or local-fake hooks');
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'The islet panel has no horizontal overflow');
  check(env.isletRequests.every(request=>Object.keys(request).sort().join()==='actionUidMatchesPrevious,bodyKeys,method,path'
    &&typeof request.actionUidMatchesPrevious==='boolean'),'Islet request records contain only the approved safe fields');
  check(env.pageErrors.length===0&&!env.checks.socketOpened,'The islet journey has no uncaught errors or Realtime connection');
  check(env.external.every(value=>new URL(value).origin==='https://placeholder.supabase.co'),'Outside requests stay on intercepted placeholder endpoints');
  await savedCaptain(page);
  check(true,'The built panel capture keeps the native captain save status ready without Offline or Conflict');
  await capture?.('islet-built',page);
  await page.keyboard.press('Escape');await page.locator('.islet-modal').waitFor({state:'hidden'});
  check(await page.evaluate(()=>document.activeElement?.matches('canvas[tabindex="0"]')),'Escape restores focus to the game');
  check(await page.locator('.shell-screen[open]').count()===0,'Closing the islet does not open Pause');
  await standByBuiltStation(page);
  check(true,'Public chart landings and physical walking reach the server-confirmed station prompt for the world capture');
  await savedCaptain(page);
  check(true,'The built world capture keeps the native captain save status ready without Offline or Conflict');
  await capture?.('islet-world-built',page); // Root's sequential visual review proves the actual world building.
  return {checks};
}

export async function recordedIsletUnknownOutcome(env){
  const {page}=env,checks=[];
  for(const {applied,readback} of [{applied:true,readback:'answered'},{applied:true,readback:'offline'},
    {applied:false,readback:'offline'}]){
    await enterRecordedIslet(env);const start=env.isletRequests.length;
    env.faultNextBuild({status:503,code:'database_unavailable',apply:applied,
      ...(readback==='offline'?{readbackStatus:0}:{})});
    await build(page).scrollIntoViewIfNeeded();await build(page).click();
    if(readback==='offline'){
      const retry=station(page).getByRole('button',{name:/^Try again: build the signal station/});
      await retry.waitFor();
      assert.equal(await retry.isEnabled(),true,'An unconfirmed write keeps a safe explicit retry');
      const afterFault=env.isletRequests.slice(start).filter(request=>request.method==='POST');
      assert.equal(afterFault.length,1,'A 503 is not automatically replayed by A2 or the islet adapter');
      const retryStart=env.isletRequests.length;
      await retry.click();await walletAfterBuild(page);
      const posts=env.isletRequests.slice(start).filter(request=>request.method==='POST');
      const retryRequests=env.isletRequests.slice(retryStart);
      const readIndex=retryRequests.findIndex(request=>request.method==='GET'&&request.path==='/api/islet');
      assert.ok(readIndex>=0,'The explicit retry first reads the authoritative islet');
      if(applied){
        assert.equal(posts.length,1,'Retry read-back confirms an applied build without another POST');
        assert.ok(!retryRequests.some(request=>request.method==='POST'),'An already built server snapshot needs no repeated write');
      }else{
        const writeIndex=retryRequests.findIndex(request=>request.method==='POST'&&request.path==='/api/islet/build');
        assert.ok(writeIndex>readIndex,'A fresh unbuilt read precedes the explicit repeated write');
        assert.equal(posts.length,2,'Only the explicit retry repeats an unapplied build');
        assert.equal(posts[1].actionUidMatchesPrevious,true,'An unknown outcome retains exactly the original runtime UID');
      }
    }else{
      await walletAfterBuild(page);
      await page.waitForFunction(()=>document.querySelector('.islet-status')?.textContent.trim()==='Built.');
      assert.equal(env.isletRequests.slice(start).filter(request=>request.method==='POST').length,1,
        'A successful readback confirms the applied build without a repeated write');
      assert.equal((await modal(page).locator('.islet-status').textContent()).trim(),'Built.');
    }
    assert.deepEqual(env.isletStats(),{coins:700,timber:10,charges:1,builtCount:1});
    await page.waitForFunction(()=>document.querySelector('.islet-spot[data-plot="islet_signal_station"]')?.dataset.state==='built');
    assert.ok(await build(page).isHidden(),'The authoritative built snapshot removes the build action');
    assert.equal(env.isletRequests.slice(start).some(request=>request.method==='GET'&&request.path==='/api/islet'),true,
      'An unknown build is checked through an authoritative islet read');
    checks.push(`Unknown 503 applied=${applied} with ${readback} readback charges once and reads before any retry write`);
  }
  assert.equal(env.pageErrors.length,0,'Unknown islet outcomes cause no uncaught browser error');
  return {checks};
}

export async function recordedIsletExpiry(env,{capture}={}){
  const {page}=env;await enterRecordedIslet(env);const start=env.isletRequests.length;
  env.denyBuilds();await build(page).scrollIntoViewIfNeeded();await build(page).click();
  await page.locator('.account-modal[open]').waitFor();
  await page.waitForFunction(()=>document.activeElement?.dataset.focus==='account-sign-in');
  await page.locator('.islet-modal[open]').waitFor({state:'hidden'});
  assert.equal(await page.locator('.account-modal[open]').getByRole('button',{name:/^Sign in(?: again)? with GitHub$/}).count(),1,
    'Immediate final 401 opens the real Account sign-in action');
  const posts=env.isletRequests.slice(start).filter(request=>request.method==='POST');
  assert.equal(posts.length,2,'A2 renews the refused original request only once before expiry');
  assert.equal(posts[1].actionUidMatchesPrevious,true,'A2 renewal retains the same build UID/body');
  assert.deepEqual(env.isletStats(),{coins:1000,timber:20,charges:0,builtCount:0});
  assert.equal(env.pageErrors.length,0,'Islet expiry causes no uncaught browser error');
  await capture?.('islet-expired-account',page);
  return {checks:['Immediate expiry clears the private islet UI and gives Account focus without charging']};
}

// The runner observes the actual L2 common status and native controls; it creates no product metadata.
export function createIsletChaosJourney(){
  const control='.islet-modal[open] .islet-spot[data-plot="islet_signal_station"] > button';
  return {
    group:'islet',paths:['/api/islet/build'],method:'POST',call:'.islet-modal[open] .server-call',
    focus:'islet-build-islet_signal_station',control,
    faultIds:onlineChaosFaults.map(fault=>fault.id),
    faultExpectation(fault){return {phase:fault.phase,words:fault.words,
      ...(fault.status===401?{call:'.account-modal[open] .server-call:not([hidden])'}:{})};},
    async setup(env){
      await enterRecordedIslet(env);
      assert.equal(await env.page.locator(this.call).count(),1,
        'The actual L2 common request-state component must exist before seven-fault verification');
      assert.ok(await env.page.locator(control).evaluate(element=>element.matches('button')),
        'The station action is an actual native build button');
    },
    async trigger({page}){await build(page).scrollIntoViewIfNeeded();await build(page).focus();await build(page).click();},
    async afterTrigger(env,fault){
      if(fault.status!==401)return;
      await env.page.locator('.islet-modal[open]').waitFor({state:'hidden'});
      if(!await env.page.locator('.account-modal[open]').isVisible())await openAccountControls(env.page);
    },
    async snapshot(env){return {wallet:await env.page.locator('.islet-wallet').textContent(),stats:env.isletStats(),
      requestCount:env.isletRequests.length,replay:await env.page.evaluate(()=>localStorage.getItem('plot_twist_intro_moves_v1'))};},
    async unchanged(env,before,fault){
      assert.deepEqual(env.isletStats(),before.stats,'A refused intercepted build does not charge or grant a building');
      if(fault.status!==401)assert.ok(await env.page.locator('.islet-wallet').textContent()===before.wallet,
        'A refused intercepted build preserves the displayed wallet');
      assert.ok(await env.page.evaluate(expected=>localStorage.getItem('plot_twist_intro_moves_v1')===expected,before.replay),
        'Islet refusals preserve this device replay');
      if(fault.status===0||fault.status>=500){
        // A visible original failure can precede completion of the authoritative recovery GET.
        await env.page.waitForFunction(selector=>{const button=document.querySelector(selector);
          return button&&!button.hidden&&!button.matches(':disabled');},control);
        await env.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        const requests=env.isletRequests.slice(before.requestCount),firstWrite=requests.findIndex(request=>
          request.method==='POST'&&request.path==='/api/islet/build');
        assert.equal(requests.filter(request=>request.method==='POST'&&request.path==='/api/islet/build').length,1,
          'An unknown islet outcome is not automatically repeated');
        assert.ok(firstWrite>=0&&requests.some((request,index)=>index>firstWrite&&request.method==='GET'&&request.path==='/api/islet'),
          'An unknown islet outcome reads the authoritative islet after the refused write');
        assert.deepEqual(env.isletStats(),before.stats,'Recovery does not invent a charge or building');
      }
    },
    async checkFocus({page},fault,check){
      await page.waitForFunction(({control,status})=>{
        if(status===401){const button=document.querySelector('.account-modal[open] [data-focus="account-sign-in"]');
          return !!button&&document.activeElement===button&&!button.matches(':disabled');}
        const button=document.querySelector(control),heading=document.querySelector('.islet-modal[open] .islet-spot[data-plot="islet_signal_station"] h3');
        const available=button&&!button.hidden&&!button.closest('[hidden],[inert]')&&!button.matches(':disabled')&&button.getClientRects().length;
        const target=status===429?heading:available?button:heading;
        return !!target&&target.getClientRects().length>0&&document.activeElement===target;
      },{control,status:fault.status});
      check(true,fault.status===401?'islet/expired: Account receives sign-in focus immediately':
        fault.status===429?'islet/rate_limited: the disabled action leaves focus on its station heading':
          'Islet refusal restores focus to its available build action or station heading');
    },
  };
}
