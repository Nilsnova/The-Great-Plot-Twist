// The unchanged production config poll turns each closed hotspot on without a navigation.
// Only intercepted fixture state changes. Playwright's native clock advances the existing five-minute timer once.
import assert from 'node:assert/strict';
import {enterPanelWorld,openPanelHotspot,closePanel,assertPanelReadable} from './online-panel-actions.js';
import {assertPanelPrivacy,waitForPanelSaved} from './online-panel-fixture.js';

export async function checkPanelFlagRefresh({openFixture,area}={}){
  assert.ok(typeof openFixture==='function'&&['predictions','arena'].includes(area),'The config proof names a recorded panel fixture');
  const env=await openFixture({flag:false}),{page}=env,checks=[];
  const check=(value,label)=>{assert.ok(value,label);checks.push(label);};
  const selector=area==='predictions'?'.desk-modal[open]':'.duel-modal[open]';
  const zone=area==='predictions'?'prediction_kiosk':'arena_gate';
  const closed=area==='predictions'?'The prediction desk is closed for now.':'The ring is closed for now.';
  const opened=area==='predictions'?'Prediction kiosk':'Arena gate';
  let installed=false,navigations=0;
  const navigated=frame=>{if(frame===page.mainFrame())navigations++;};page.on('framenavigated',navigated);
  try{
    // Install before the first navigation; real-time frame/input timers run normally during all gestures.
    await page.clock.install({time:Date.now()});installed=true;await page.clock.resume();
    await page.setViewportSize({width:375,height:812});
    await enterPanelWorld(env,{area});await openPanelHotspot(env,area,{opened:false});
    const prompt=page.locator('.hud .interact[data-zone="'+zone+'"]');
    await prompt.locator('strong').filter({hasText:closed}).waitFor({state:'visible'});
    check(await prompt.locator('strong').textContent()===closed,'The strict-off hotspot visibly presents its plain closed sign');
    check(!env.moduleRequested(area)&&env.panelRequests.length===0,'The original strict-off sign imports no panel module and sends no panel HTTP');
    await waitForPanelSaved(env);
    // The existing hotspot walker already releases keys in finally. Make the timer jump boundary explicit as well.
    for(const key of ['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyE'])await page.keyboard.up(key);
    const before={navigations,url:page.url(),save:env.panelSaveStats(),coins:env.panelSnapshot().coins,
      tokenCalls:env.requests.filter(request=>request.path==='/auth/v1/token').length};
    env.setPanelFlag(true);
    const [response]=await Promise.all([
      page.waitForResponse(response=>new URL(response.url()).pathname==='/api/config'&&response.request().method()==='GET'),
      page.clock.fastForward(300000),
    ]);
    await page.clock.resume();
    check(response.status()===200&&!response.request().headers().authorization,'The unchanged five-minute poll makes an actual anonymous successful config read');
    const config=await response.json();check(config.flags?.[area]===true,'That intercepted config response enables exactly the recorded panel');
    await page.waitForFunction(({zone,label})=>{const prompt=document.querySelector('.hud .interact');
      return prompt?.dataset.zone===zone&&!prompt.hidden&&prompt.querySelector('strong')?.textContent===label;},{zone,label:opened});
    check(!env.moduleRequested(area)&&env.panelRequests.length===0,'The refreshed open sign still waits for a real interaction before importing or requesting the panel');
    // Do not walk or reload: this is the same public hotspot under the same authenticated world/save.
    const interact=page.locator('.touch-actions').getByRole('button',{name:'Interact',exact:true});
    if(await interact.isVisible())await interact.click();else await page.keyboard.press('KeyE');
    await page.locator(selector).waitFor({state:'visible'});
    await page.locator(selector+(area==='predictions'?' .desk-card':' .duel-wallet')).first().waitFor({state:'visible'});
    check(env.moduleRequested(area)&&env.panelRequests.length>0,'A second real hotspot gesture loads the real panel and recorded HTTP after the flag turns true');
    check(navigations===before.navigations&&page.url()===before.url,'The closed sign becomes a usable panel without a page navigation or reload');
    check(env.requests.filter(request=>request.path==='/auth/v1/token').length===before.tokenCalls,
      'The five-minute flag change keeps the same authenticated session without an extra token exchange');
    check(env.panelSnapshot().coins===before.coins,'A read-only flag change and panel open award or charge no coins');
    await assertPanelReadable(page,selector);await waitForPanelSaved(env);
    const save=env.panelSaveStats();
    check(save.acceptedPuts>=before.save.acceptedPuts&&save.version>=before.save.version
      &&save.version===save.acceptedPuts+1&&save.conflicts===0,'The flag transition retains the same coherent incrementing cloud save CAS');
    await closePanel(page,selector);assertPanelPrivacy(env);
    check(env.pageErrors.length===0,'The same-page config transition has no uncaught browser error');
    return {checks,requests:env.panelRequests.map(request=>({...request})),save};
  }finally{
    try{
      // Reset the synthetic wall clock before any later normal navigation/cleanup; auth uses normal current time again.
      if(installed){await page.clock.setSystemTime(Date.now());await page.clock.resume();}
    }finally{page.off('framenavigated',navigated);await env.close();}
  }
}
