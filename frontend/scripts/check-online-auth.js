// Exercise the bundled PKCE client on intercepted endpoints, with no inspection hooks or real login.
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {openAuthFixture} from './online-auth-fixture.js';
import {signInFromTitle} from './online-chaos-signin.js';
import {openSettingsAccount, openAccountControls} from './online-browser-actions.js';

export async function checkOnlineAuth() {
  const env = await openAuthFixture();
  const {page} = env;
  const report = {checks: [], requests: env.requests};
  const check = (value, label) => { assert.ok(value, label); report.checks.push(label); };
  try {
    for (const width of [1280, 375]) {
      Object.assign(env.checks, {pkce: false, exchanged: false, refreshed: false, signedOut: false});
      await page.setViewportSize({width, height: 812});
      await signInFromTitle(env);
      await page.locator('.account-summary-state').filter({hasText: 'Signed in'}).waitFor();
      check(env.checks.pkce && env.checks.exchanged, 'Bundled GitHub flow exchanges a PKCE verifier at ' + width);
      check(!new URL(page.url()).searchParams.has('code'), 'Return code is removed from the address');
      check(await page.evaluate(() => Object.keys(sessionStorage).includes('plot-twist-auth-v1')
        && !Object.keys(localStorage).some(key => key.startsWith('plot-twist-auth-v1'))),
      'The default session persists only in this tab');
      check(await page.evaluate(() => !window.__plotTwist && !window.__island), 'Auth needs no production hooks');
      await page.reload();
      await openSettingsAccount(page);
      await page.locator('.account-summary-state').filter({hasText: 'Signed in'}).waitFor();
      check(true, 'This tab restores its session after reload at ' + width);
      await openAccountControls(page);
      await page.getByRole('button', {name: 'Sign out', exact: true}).waitFor();
      if (width === 375) await page.screenshot({path: 'captures/20261106_G9-C1/auth-account-375.png'});
      const logout = page.waitForResponse(response => new URL(response.url()).pathname === '/auth/v1/logout'
        && response.request().method() === 'POST');
      await page.getByRole('button', {name: 'Sign out', exact: true}).click();
      await logout;
      await page.locator('.account-status').filter({hasText: 'Signed out'}).waitFor();
      await page.waitForFunction(() => !Object.keys(sessionStorage).some(key => key.startsWith('plot-twist-auth-v1')));
      check(env.checks.signedOut, 'Sign-out reaches the intercepted SDK endpoint');
      check(await page.evaluate(() => !Object.keys(sessionStorage).some(key => key.startsWith('plot-twist-auth-v1'))),
        'Sign-out removes only the owned auth persistence');
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Auth fits ' + width);
      await page.keyboard.press('Escape');
    }
    check(env.errors.length === 0, 'Bundled auth has no browser errors');
    check(!env.checks.socketOpened, 'Auth opens no Realtime socket while presence is off');
    check(env.external.every(value => new URL(value).origin === 'https://placeholder.supabase.co'),
      'Every external auth request stays on the intercepted placeholder origin');
    check(!env.requests.some(item => item.path === '/api/auth/exchange'), 'The game never uses the temporary exchange route');
    check(env.requests.filter(item => item.path === '/api/config').every(item => !item.authorized),
      'Public config never carries a bearer token');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await mkdir('captures/20261106_G9-C1', {recursive: true});
    await writeFile('captures/20261106_G9-C1/online-auth.json', JSON.stringify(report, null, 2) + '\n');
    await env.close();
  }
}
