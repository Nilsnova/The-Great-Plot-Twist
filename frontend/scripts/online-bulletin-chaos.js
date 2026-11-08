// Seven real public GET failures: native Journal/Retry, recorded HTTP and native paused time only.
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {openBulletinFixture,openBulletinDrawer,assertBulletinSaveReady,
  assertPublicBulletinTraffic,PUBLIC_BULLETIN_TEXT,nextBulletinRead} from './online-bulletin-fixture.js';

const leafCall='.case-modal[open] .bulletin-screen .server-call';
const frameCall='.case-modal[open] > .kit-modal-body > .case-screen-body > .server-call';
const retrySelector=leafCall+' [data-focus="retry-server-call"]';
const pathOf=request=>{try{return new URL(request.url()).pathname;}catch{return null;}};
const isBulletin=request=>pathOf(request)==='/api/bulletin'&&request.method()==='GET';
const phaseFor=fault=>fault.status===0?'offline':fault.status===429?'rate_limited':'error';
const wordsFor=fault=>fault.status===0?/You are offline\. Your progress on this device is kept\./i
  :fault.status===404?/The harbor bulletin is closed\. You can keep exploring\./i
  :fault.status===429?/Try again in \d+ s/i
  :fault.status===503?/The harbor bulletin is unavailable right now\. Try again in a moment\./i
  :/The public bulletin could not be read\. Try again or report a problem\./i;
// Test-side wall time observes public DOM while browser RAF/timers are deliberately paused.
async function waitForPhase(page,selector,phase){
  const until=Date.now()+10000;
  do{
    if(await page.evaluate(({selector,phase})=>document.querySelector(selector)?.dataset.state===phase,{selector,phase}))return;
    await delay(10);
  }while(Date.now()<until);
  assert.fail('The actual public call did not commit its expected failure phase');
}
const mutationCount=env=>env.publicRequests.filter(item=>item.method!=='GET').length;
const authCount=env=>env.requests.filter(item=>item.path==='/auth/v1/token').length;
const privateValues=page=>page.evaluate(()=>({
  walletVisible:(()=>{const wallet=document.querySelector('.captain-status .coin-counter');
    return !!wallet&&wallet.getClientRects().length>0&&getComputedStyle(wallet).visibility==='visible';})(),
  captain:document.querySelector('.captain-status > strong')?.textContent??null,
  wallet:document.querySelector('.captain-status .coin-counter')?.textContent??null,
  walletLabel:document.querySelector('.captain-status .coin-counter')?.getAttribute('aria-label')??null,
  save:document.querySelector('.captain-status > [role="status"][data-state]')?.textContent??null,
  saved:document.querySelector('.captain-status > [role="status"][data-state]')?.dataset.state??null,
  signedIn:document.querySelector('.account-summary-state')?.textContent??null,
  journal:localStorage.getItem('plot_twist_intro_moves_v1'),
}));

export function createBulletinChaosJourney(){
  const pages=new WeakMap(),snapshots=new WeakMap();
  function stateFor(page){
    let state=pages.get(page);
    if(!state){
      state={paused:false,t0:null,requests:[]};
      state.observe=request=>{if(pathOf(request)==='/api/bulletin')state.requests.push({
        method:request.method(),bearer:!!request.headers().authorization,body:request.postData()!==null});};
      page.on('request',state.observe);pages.set(page,state);
    }
    return state;
  }
  async function assertPrivateUnchanged(env,before){
    const expected=snapshots.get(before);assert.ok(expected,'The journey retains its private comparison only in memory');
    const after=await privateValues(env.page);
    for(const key of Object.keys(expected))assert.ok(after[key]===expected[key],
      'Public bulletin refusal preserves the native '+key+' value');
    assert.ok(after.saved==='saved'&&/signed in/i.test(after.signedIn??''),
      'A public failure retains the real saved, signed-in captain');
    assert.equal(after.walletVisible,expected.walletVisible,
      'Public bulletin refusal preserves the approved quiet HUD wallet presentation');
    assert.ok(await env.page.locator('.account-modal[open],.account-conflict,.connection-banner[data-state="expired"]').count()===0,
      'Public 401/409 never open private sign-in, expiry or save-conflict presentation');
    assert.ok(mutationCount(env)===before.mutations&&authCount(env)===before.auth,
      'Public bulletin faults trigger no token renewal, PUT or POST');
    assert.ok(env.saveStats().acceptedPuts===before.saves&&env.saveStats().conflicts===0,
      'The same recorded account keeps its accepted save version without a conflict');
  }
  return {
    group:'bulletin',paths:['/api/bulletin'],method:'GET',cooldownSeconds:3,
    call:leafCall,control:retrySelector,
    faultExpectation(fault){return {phase:phaseFor(fault),words:wordsFor(fault),
      call:fault.status===404?frameCall:leafCall};},
    async setup(env,fault){
      const {page}=env,state=stateFor(page);
      if(state.paused){await page.clock.resume();state.paused=false;}
      // Reload each case at current real wall time: fourteen five-minute cases must not age the
      // generated one-hour auth fixture into an unrelated private session expiry. Timers within
      // this case (especially the original429 deadline) are never reset.
      await page.clock.setSystemTime(new Date());
      state.t0=null;env.setFlag(true);env.setReply('ready');
      await env.enterWorld();await page.locator('.captain-status .coin-counter').waitFor({state:'attached'});
      const drawer=await openBulletinDrawer(page);
      await drawer.locator('.bulletin-lines li').filter({hasText:PUBLIC_BULLETIN_TEXT}).waitFor();
      assert.ok(await page.evaluate(()=>!window.__island&&!window.__plotTwist),
        'The production public-fault journey exposes no inspection hook');
      assert.ok(await page.locator(leafCall).count()===1,'The real drawer owns one shared server-call element');
      // Expire a successful five-minute public cache through the genuine reader timer.
      env.setReply('offline');const expired=nextBulletinRead(page);
      await page.clock.fastForward(300000);await expired;
      await page.locator(leafCall+'[data-state="offline"]').waitFor({state:'visible'});
      await page.locator(retrySelector+':enabled').waitFor({state:'visible'});
      await drawer.locator('.bulletin-status').filter({hasText:'This is the last posted bulletin.'}).waitFor();
      await assertBulletinSaveReady(page);assertPublicBulletinTraffic(env);
      if(fault.status===429){
        await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));state.paused=true;
        state.t0=await page.evaluate(()=>Date.now());
      }
    },
    async snapshot(env){
      const before={mutations:mutationCount(env),auth:authCount(env),saves:env.saveStats().acceptedPuts,
        bulletin:env.reads('/api/bulletin').length};
      const values=await privateValues(env.page);
      assert.ok(['captain','wallet','walletLabel','save','signedIn'].every(key=>typeof values[key]==='string'&&values[key].trim().length>0)
        &&values.saved==='saved'&&/signed in/i.test(values.signedIn),
        'The preservation baseline comes from actual native captain, wallet, save and signed-in elements');
      snapshots.set(before,values);return before;
    },
    async trigger({page},fault){
      const read=nextBulletinRead(page);
      const completed=fault.status===0?page.waitForEvent('requestfailed',{predicate:isBulletin})
        :page.waitForResponse(response=>isBulletin(response.request())&&response.status()===fault.status);
      await page.locator(retrySelector).click();await read;
      const response=await completed;if(fault.status!==0)await response.finished();
      const expected=this.faultExpectation(fault);
      await waitForPhase(page,expected.call,expected.phase);
    },
    async afterTrigger({page},fault){
      if(fault.status===429){
        // The response was committed while paused at t0; release its real focus RAF, not a fabricated focus.
        await page.clock.runFor(34);
      }
    },
    async unchanged(env,before,fault){
      const {page}=env,state=stateFor(page);
      assert.ok(env.reads('/api/bulletin').length===before.bulletin+1,
        'One native Retry issues exactly one real public GET');
      assert.ok(state.requests.every(item=>item.method==='GET'&&!item.bearer&&!item.body),
        'Every observed bulletin call is a bodyless anonymous GET');
      await assertPrivateUnchanged(env,before);
      if(fault.status===404){
        assert.ok(await page.locator('.case-modal[open] .bulletin-screen').isVisible()===false,
          'Feature-off removes the public leaf');
        assert.ok(await page.locator('.bulletin-lines li:visible,.bulletin-hook:visible').count()===0,
          'Feature-off clears public lines and hook presentation');
        assert.ok(await page.locator('.bulletin-toggle').evaluate(element=>element.hidden)
          &&await page.locator('.tonight-chip').evaluate(element=>element.hidden),
          'Feature-off hides both real Journal bulletin entry controls');
        const reads=env.reads('/api/bulletin').length;await page.clock.fastForward(60000);
        assert.ok(env.reads('/api/bulletin').length===reads,
          'Feature-off stops bulletin HTTP for sixty seconds without navigation');
        await assertPrivateUnchanged(env,before);
      }else{
        await page.locator('.bulletin-lines li').filter({hasText:PUBLIC_BULLETIN_TEXT}).waitFor();
        assert.ok(await page.locator('.bulletin-status').textContent()==='This is the last posted bulletin. The latest update is unavailable.',
          'Generic public failures keep the exact last-good stale bulletin');
      }
      assertPublicBulletinTraffic(env);
    },
    async checkFocus({page},fault,check){
      if(fault.status===404){
        const report=page.locator(frameCall).getByRole('link',{name:'Report a problem',exact:true});
        await report.waitFor({state:'visible'});
        await page.waitForFunction(selector=>document.activeElement===document.querySelector(selector)?.querySelector('a'),frameCall);
        check(await report.evaluate(element=>element===document.activeElement&&element.tagName==='A'&&!!element.getAttribute('href')),
          'bulletin/feature_off: the surviving real frame Report link receives native focus');
      }else if(fault.status===429){
        const message=page.locator('.bulletin-screen .bulletin-retry-status');
        check(await message.evaluate(element=>element===document.activeElement&&element.tagName==='P'
          &&element.tabIndex===-1&&element.getAttribute('aria-live')==='off'&&/Try again in \d+ s/i.test(element.textContent??'')),
          'bulletin/rate_limited: the real visible cooldown message receives native focus');
        check(await page.locator(leafCall+' .server-call-announcement[role="status"][aria-live="polite"]').count()===1,
          'The cooldown retains the shared polite announcement sibling');
      }else{
        await page.waitForFunction(selector=>document.activeElement===document.querySelector(selector),retrySelector);
        check(await page.locator(retrySelector).evaluate(element=>element===document.activeElement
          &&element.tagName==='BUTTON'&&!element.disabled),
          'bulletin/'+fault.id+': focus reaches the actual enabled public Retry button');
      }
    },
    async advanceRenderFrames({page},fault){if(fault.status===429)await page.clock.runFor(34);},
    async afterCooldownProbe(env,fault,{check}){
      if(fault.status!==429)return;
      const {page}=env,state=stateFor(page),retry=page.locator(retrySelector);
      assert.ok(state.paused&&Number.isFinite(state.t0),'The deadline proof owns an actual paused native clock');
      const remaining=state.t0+2999-await page.evaluate(()=>Date.now());
      assert.ok(Number.isInteger(remaining)&&remaining>=0,'Native render frames never overrun the original deadline probe');
      await page.clock.runFor(remaining);
      check(await retry.isDisabled(),'bulletin: the original three-second deadline still blocks Retry at 2999ms');
      const reads=env.reads('/api/bulletin').length;await retry.dispatchEvent('click');
      check(env.reads('/api/bulletin').length===reads,'bulletin: forced Retry at 2999ms sends no public GET');
      await page.clock.runFor(1);
      check(await retry.isEnabled(),'bulletin: the same original Retry deadline enables at exactly 3000ms');
      check(env.reads('/api/bulletin').length===reads,
        'bulletin: cooldown completion neither fetches automatically nor sends a write');
    },
    async dispose({page}){
      const state=pages.get(page);if(!state)return;
      page.off('request',state.observe);pages.delete(page);
      if(state.paused){await page.clock.resume();state.paused=false;}
    },
  };
}

export async function checkOnlineBulletinChaos({checkChaos,openFixture=openBulletinFixture,
  widths=[375,320],folder='captures/20261107_G9-C3-bulletin-chaos'}={}){
  // Never statically import the unfinished CLI parent. Callers inject their already-running function.
  const run=checkChaos??(await import('./check-online-chaos.js')).checkOnlineChaos;
  assert.ok(typeof run==='function'&&run.groupFaultExpectations===true,'Bulletin public faults require real group-aware fault expectations');
  assert.ok(run?.publicReadFaultHooks===true,
    'Bulletin public faults require native render-frame and after-cooldown-probe hooks');
  const report=await run({openFixture:()=>openFixture({clock:true}),journeys:[createBulletinChaosJourney()],widths,folder});
  report.publicReadSemantics={method:'GET',anonymous:true,
    public401:'error; no private expiry or renewal',public409:'error; no private save conflict',
    generic503:'retains stale last-good; semantic bulletin_unavailable is covered by readFaults',
    cooldown:'original response deadline; 2999ms blocked, 3000ms enabled; no automatic fetch'};
  return report;
}
