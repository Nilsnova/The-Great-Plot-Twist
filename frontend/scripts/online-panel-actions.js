// All navigation below is through visible game controls and ordinary keyboard/touch input.
import assert from 'node:assert/strict';
import {signInFromTitle} from './online-chaos-signin.js';
import {dismissIntro} from './intro-browser-fixture.js';

export async function enterPanelWorld(env,{area}={}){
  const {page}=env;await page.emulateMedia({reducedMotion:'reduce'});await signInFromTitle(env);
  if(await page.locator('.account-modal[open]').isVisible())await page.keyboard.press('Escape');
  await page.locator('.shell-menu').getByRole('button',{name:'Continue',exact:true}).click();
  await page.locator('.hud.exploring').waitFor();await dismissIntro(page);
  const expected=area==='predictions'?'Saltreach Harbor':'Smugglers’ Cove';
  await page.waitForFunction(expected=>document.querySelector('.hud .chapter')?.textContent.includes(expected),expected);
  await page.locator('canvas').first().focus();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}

async function walkFrames(page, seconds) {
  // Match the published loop's capped native frame time, including a cold software renderer.
  await page.evaluate(seconds => new Promise((resolve, reject) => {
    let previous = performance.now(), elapsed = 0, frame;
    const timeout = setTimeout(() => { cancelAnimationFrame(frame); reject(new Error('Native walking frames timed out')); }, 12000);
    function tick(now) {
      elapsed += Math.min((now - previous) / 1000, .1); previous = now;
      if (elapsed >= seconds) { clearTimeout(timeout); resolve(); }
      else frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
  }), seconds);
}

export async function openPanelHotspot(env,area,{opened=true}={}){
  const {page}=env,id=area==='predictions'?'prediction_kiosk':'arena_gate';
  // Reach the observed public Table prompt before taking its clear east side; cold frames cannot skip readiness.
  if(area==='predictions'){
    await page.keyboard.down('KeyW');
    try{await page.waitForFunction(()=>{const prompt=document.querySelector('.hud .interact');
      return prompt?.dataset.zone==='captains_table'&&!prompt.hidden;},null,{timeout:20000});}
    finally{await page.keyboard.up('KeyW');}
    await page.keyboard.down('KeyD');try{await walkFrames(page, .4);}finally{await page.keyboard.up('KeyD');}
  }
  await page.keyboard.down('KeyW');
  try{await page.waitForFunction(id=>{const prompt=document.querySelector('.hud .interact');
    return prompt?.dataset.zone===id&&!prompt.hidden;},id,{timeout:20000});}
  finally{await page.keyboard.up('KeyW');}
  const interact=page.locator('.touch-actions').getByRole('button',{name:'Interact',exact:true});
  if(await interact.isVisible())await interact.click();else await page.keyboard.press('KeyE');
  if(opened)await page.locator(area==='predictions'?'.desk-modal[open]':'.duel-modal[open]').waitFor();
  else await page.locator(area==='predictions'?'.hud .toast':'.sound-caption:not([hidden])')
    .filter({hasText:area==='predictions'?'The prediction desk is closed for now.':'The ring is closed for now.'}).waitFor();
}

export async function closePanel(page,selector){
  for(let attempt=0;attempt<2&&await page.locator(selector).isVisible();attempt++)await page.keyboard.press('Escape');
  await page.locator(selector).waitFor({state:'hidden'});
}

export async function assertPanelReadable(page,selector){
  const metrics=await page.locator(selector).evaluate(root=>{
    const visible=element=>{
      if(element.closest('[hidden],[inert]')||!element.offsetHeight||!element.getClientRects().length)return false;
      const style=getComputedStyle(element);if(style.display==='none'||style.visibility!=='visible')return false;
      for(let ancestor=element.parentElement;ancestor;ancestor=ancestor.parentElement){
        if(ancestor.tagName==='DETAILS'&&!ancestor.open){const summary=ancestor.querySelector(':scope > summary');if(!summary?.contains(element))return false;}
      }
      return true;
    };
    const controls=[...root.querySelectorAll('button,input:not([type=radio]):not([type=checkbox]),select,textarea,a[href],.desk-choice,.duel-choice,.duel-option')].filter(visible);
    const text=[...root.querySelectorAll('p,small,figcaption,h2,h3,h4')].filter(element=>visible(element)&&element.textContent.trim()
      &&!element.closest('.kit-sr-only,.server-call-announcement,[aria-hidden=true]'));
    return {fits:document.documentElement.scrollWidth<=innerWidth&&root.scrollWidth<=root.clientWidth,
      controlFont:controls.length>0&&controls.every(element=>parseFloat(getComputedStyle(element).fontSize)>=16),
      targets:controls.every(element=>{const box=element.getBoundingClientRect();return box.width>=44&&box.height>=44;}),
      body:text.length>0&&text.every(element=>parseFloat(getComputedStyle(element).fontSize)>=18)};
  });
  assert.ok(metrics.fits,'The panel fits the viewport without horizontal overflow');
  assert.ok(metrics.controlFont,'Every panel control uses at least sixteen-pixel type');
  assert.ok(metrics.targets,'Every visible panel control has a forty-four-pixel target');
  assert.ok(metrics.body,'Panel body and caption text use at least eighteen-pixel type');
}
