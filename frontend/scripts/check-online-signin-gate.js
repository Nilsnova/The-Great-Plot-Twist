// A live flag change must also hide sign-in in an external previous-request failure.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openAuthFixture} from './online-auth-fixture.js';
import {signInFromTitle} from './online-chaos-signin.js';
import {settle} from './world-browser-tools.js';
import {openAccountControls} from './online-browser-actions.js';

export async function checkOnlineSignInGate(){
  const env=await openAuthFixture(),{page}=env,report={checks:[]};
  let enabled=true,denied=false;
  const check=(value,label)=>{assert.ok(value,label);report.checks.push(label);};
  await page.route('**/api/config',route=>route.fulfill({json:{flags:{sign_in:enabled,
    live_presence:false,market:false,predictions:false,arena:false,case:false,bulletin:false}}}));
  await page.route('**/api/me',route=>route.request().method()!=='GET'?route.fallback():denied
    ?route.fulfill({status:401,json:{error:{code:'unauthorized',message:'Recorded refusal.'}}})
    :route.fulfill({json:{id:env.fixtureUserId,captainName:'Recorded Captain',coins:0,crews:[],
      kit:'stranger',place:'lighthouse_isle'}}));
  try{
    await Promise.all([signInFromTitle(env),page.waitForResponse(response=>
      new URL(response.url()).pathname==='/rest/v1/wallet_transactions')]);
    await settle(page);
    await openAccountControls(page);
    await page.locator('.account-modal[open] .account-screen').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('.account-modal').waitFor({state:'hidden'});
    const resume=page.locator('.shell-menu').getByRole('button',{name:'Continue',exact:true});
    await page.waitForFunction(()=>[...document.querySelectorAll('.shell-menu button')]
      .some(button=>button.textContent==='Continue'&&!button.disabled));
    enabled=false;
    const config=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/config');
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await config;
    await page.getByText('Sign-in opens later. Your progress on this device is kept.',{exact:true}).first().waitFor();
    denied=true;await resume.click();
    const modal=page.locator('.account-modal[open]');await modal.waitFor();
    const external=modal.locator('.account-result').locator('..');
    await external.waitFor({state:'visible'});
    await external.locator('[data-focus="sign-in-server-call"]').waitFor({state:'hidden'});
    check(await modal.getByRole('button',{name:/^Sign in/}).count()===0,
      'A disabled sign-in flag hides native and previous-request sign-in controls');
    check(await external.getByRole('link',{name:'Report a problem',exact:true}).isVisible(),
      'The previous-request failure keeps a visible next step');
    await external.getByRole('link',{name:'Report a problem',exact:true}).click({trial:true});
    check(true,'The account notice stays above the title and its report action remains reachable');
    await page.keyboard.press('Escape');
    await page.locator('.shell-screen[open][data-mode="title"]').waitFor();
    check(true,'A refused Continue returns to the title after its account notice closes');
    check(env.pageErrors.length===0,'The flag-change and expiry path has no uncaught browser errors');
    check(!env.checks.socketOpened,'The flag-change check opens no Realtime socket');
    check(env.external.every(value=>new URL(value).origin==='https://placeholder.supabase.co'),
      'All outside requests use intercepted placeholder endpoints');
    console.log(JSON.stringify(report,null,2));
  }finally{
    await writeFile('captures/20261106_G9-C1/online-signin-gate.json',JSON.stringify(report,null,2)+'\n');
    await env.close();
  }
}
