// Follow account UI controls through recorded authoritative answers; no production hooks or live data.
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {openAccountFixture, ACCOUNT_INTRO_ACTIONS} from './online-account-fixture.js';
import {startFromTitle} from './shell-browser-tools.js';
import {signInFromTitle} from './online-chaos-signin.js';
import {expandTitleAccount, openAccountControls, openCrewFromHud,
  chooseIntroAction, finishIntroPassages, assertEngineReplay} from './online-browser-actions.js';

async function playIntro(page,{expectKit=true}={}) {
  for (const id of ACCOUNT_INTRO_ACTIONS) await chooseIntroAction(page, id);
  await finishIntroPassages(page);
  await assertEngineReplay(page);
  await page.locator('.intro-ending').waitFor();
  if(expectKit)await page.locator('.case-arrival .case-kit-name').filter({hasText: 'Recorded Kit'}).waitFor();
}
async function openAccount(page) {
  await openAccountControls(page);
  await page.locator('.account-screen .account-status').filter({hasText: 'Signed in'}).waitFor();
}
async function showRewards(page) {
  await openCrewFromHud(page);
  const modal = page.locator('.case-modal[open]'), picker = modal.getByRole('combobox', {name: 'Case page'});
  await modal.waitFor();
  if (await picker.isVisible()) await picker.selectOption('rewards');
  else await modal.getByRole('button', {name: 'Rewards', exact: true}).click();
  await modal.locator('.rewards-ledger').waitFor();
}

export async function checkOnlineAccount({widths = [1280, 375]} = {}) {
  const env = await openAccountFixture(), {page} = env;
  const report = {checks: [], requests: env.accountRequests, scenarios: [],reducedMotion:true};
  const check = (value, label) => { assert.ok(value, label); report.checks.push(label); };
  const folder = 'captures/20261106_G9-C1';
  try {
    await mkdir(folder, {recursive: true});
    await page.emulateMedia({reducedMotion:'reduce'});
    for (const width of widths) {
      env.resetAccount();
      await page.setViewportSize({width, height: 812});
      await signInFromTitle(env);
      await page.locator('.account-summary-state').filter({hasText: 'Signed in'}).waitFor();
      await openAccount(page);
      await page.locator('.account-screen .account-status').filter({hasText: 'Recorded Captain'}).waitFor();
      check(env.accountStats().nameInitializations > 0, 'Sign-in initializes the captain name at ' + width);
      await page.getByRole('button', {name: 'Change captain name once', exact: true}).click();
      await page.locator('.account-screen .account-status').filter({hasText: 'Recorded Captain Two'}).waitFor();
      check(env.accountStats().rerollsGranted === 1, 'The server grants one captain-name change');
      await page.keyboard.press('Escape');

      env.faultNextSave('unknown_committed');
      await startFromTitle(page, {closeIntro: false});
      await playIntro(page);
      await page.locator('.captain-status [data-state="saved"]').waitFor();
      check(env.accountStats().kitGrants === 1 && env.accountStats().coinsGranted === 1000,
        'Arrival displays the first server-confirmed kit and coin grant at ' + width);
      const arrival = await page.locator('.case-arrival').innerText();
      check(arrival.includes('Recorded item') && arrival.includes('Lighthouse Isle'),
        'Arrival displays the supplied item and start-place text');
      check(env.accountStats().unknownSaveOutcomes === 1 && env.accountStats().unknownSaveReadbacks === 1
        && env.accountStats().blindSaveRetries === 0, 'An unknown save is read back before any further write');
      check(await page.evaluate(() => JSON.parse(localStorage.getItem('plot_twist_intro_moves_v1'))?.actions?.at(-1) === 'signal'),
        'The accepted intro journal remains available on this device');

      await page.getByRole('button', {name: 'Start a new intro', exact: true}).click();
      await playIntro(page);
      await page.locator('.case-arrival').getByRole('heading', {name: 'Welcome back', exact: true}).waitFor();
      check(env.accountStats().kitGrants === 1 && env.accountStats().kitRepeats >= 1
        && env.accountStats().coinsGranted === 1000, 'Replaying the intro keeps the first kit and pays no second grant');

      // A stale name reply simulates another view retaining the old reroll control after it was used.
      env.showStaleRerollOnce();
      env.setCloudReplay('intro', ACCOUNT_INTRO_ACTIONS);
      await page.reload();
      await expandTitleAccount(page);
      await page.locator('.account-summary-state').filter({hasText: 'Signed in'}).waitFor();
      await openAccount(page);
      await page.getByRole('button', {name: 'Change captain name once', exact: true}).click();
      await page.getByText('Your captain name change has been used.', {exact: true}).waitFor();
      check(env.accountStats().rerollsGranted === 1 && env.accountStats().rerollsRefused === 1,
        'The server refuses a second reroll from a stale screen');
      check(await page.locator('.account-screen').getByRole('button', {name: 'Change captain name once', exact: true}).count() === 0,
        'The refused reroll control is removed');
      await page.keyboard.press('Escape');

      env.setCloudReplay('intro', ACCOUNT_INTRO_ACTIONS.slice(0, 2));
      await page.reload();
      await expandTitleAccount(page);
      await page.locator('.account-conflict').waitFor();
      const writesBeforeKeep = env.accountStats().saveWrites;
      await page.getByRole('button', {name: 'Keep this device', exact: true}).click();
      await page.locator('.account-conflict').waitFor({state: 'hidden'});
      check(env.accountStats().saveWrites === writesBeforeKeep + 1, 'Keep this device rereads and writes the current cloud version');

      env.setCloudReplay('world', ACCOUNT_INTRO_ACTIONS.slice(0, 3));
      await page.reload();
      await expandTitleAccount(page);
      await page.locator('.account-conflict').waitFor();
      const writesBeforeCloud = env.accountStats().saveWrites;
      await page.getByRole('button', {name: 'Use the cloud save', exact: true}).click();
      await page.locator('.account-conflict').waitFor({state: 'hidden'});
      check(env.accountStats().saveWrites === writesBeforeCloud, 'Use the cloud save makes no replacement write');
      await page.locator('.account-screen').getByRole('button', {name: 'Continue from cloud', exact: true}).click();
      await page.locator('.account-modal').waitFor({state: 'hidden'});
      await page.locator('.hud.exploring').waitFor();
      check(await page.locator('.intro-modal[open]').count() === 0, 'Continue resumes the confirmed world instead of restarting Act 1');

      await showRewards(page);
      const ledger = await page.locator('.rewards-ledger').innerText();
      check(ledger.includes('+1,000 coins') && ledger.includes('kit grant'), 'Own-row rewards show only the amount and plain reason');
      await page.keyboard.press('Escape');
      await openAccount(page);
      const deletesBefore = env.accountStats().deletes;
      await page.getByRole('button', {name: 'Delete my data', exact: true}).click();
      await page.getByRole('heading', {name: 'Delete all your player data?', exact: true}).waitFor();
      check(env.accountStats().deletes === deletesBefore, 'The first deletion tap sends no request');
      check((await page.locator('.account-delete-confirm').innerText()).includes('ledger history'),
        'The confirmation explains that coin ledger history is deleted');
      if (width === 375) await page.screenshot({path: folder + '/account-delete-375.png'});
      const logout = page.waitForResponse(response => new URL(response.url()).pathname === '/auth/v1/logout'
        && response.request().method() === 'POST');
      await page.getByRole('button', {name: 'Confirm deletion', exact: true}).click();
      await logout;
      await page.locator('.account-screen .account-status').filter({hasText: 'Signed out'}).waitFor();
      await page.waitForFunction(() => !localStorage.getItem('plot_twist_intro_moves_v1')
        && !Object.keys(sessionStorage).some(key => key.startsWith('plot-twist-auth-v1'))
        && !Object.keys(localStorage).some(key => key.startsWith('plot-twist-auth-v1')));
      check(env.accountStats().deletes === deletesBefore + 1, 'The confirmed deletion sends one authoritative request');
      check(await page.evaluate(() => !localStorage.getItem('plot_twist_intro_moves_v1')
        && !Object.keys(sessionStorage).some(key => key.startsWith('plot-twist-auth-v1'))
        && !Object.keys(localStorage).some(key => key.startsWith('plot-twist-auth-v1'))),
      'Deletion clears the local journal and owned auth persistence');
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Account controls fit ' + width + ' px');
      check(env.accountStats().invalidBodies === 0 && env.accountStats().publicBearerLeaks === 0,
        'All account request bodies follow their contract and public config has no bearer');
      report.scenarios.push({width, stats: env.accountStats()});
    }
    env.resetAccount();
    await page.setViewportSize({width:375,height:812});
    await page.goto(env.url);
    await expandTitleAccount(page);
    await page.locator('.account-summary-state').filter({hasText:'Signed out'}).waitFor();
    await startFromTitle(page,{closeIntro:false});
    await playIntro(page,{expectKit:false});
    const claim=page.locator('.case-arrival').getByRole('button',{name:'Sign in with GitHub',exact:true});
    await claim.waitFor();
    check(env.accountStats().kitGrants===0,'An anonymous ending keeps its accepted replay and grants no kit');
    await claim.click();
    await page.locator('.account-summary-state').filter({hasText:'Signed in'}).waitFor({state:'attached'});
    await expandTitleAccount(page);
    await page.locator('.account-summary-state').filter({hasText:'Signed in'}).waitFor();
    await page.locator('.shell-menu').getByRole('button',{name:'Continue',exact:true}).click();
    await finishIntroPassages(page);
    await assertEngineReplay(page);
    await page.locator('.case-arrival .case-kit-name').filter({hasText:'Recorded Kit'}).waitFor();
    check(env.accountStats().kitGrants===1&&env.accountStats().coinsGranted===1000,
      'Returning from arrival sign-in claims the accepted journal once when Continue resumes it');
    check(await page.evaluate(()=>JSON.parse(localStorage.getItem('plot_twist_intro_moves_v1'))?.actions?.length)===ACCOUNT_INTRO_ACTIONS.length,
      'The sign-in return preserves all accepted anonymous moves');
    report.anonymousClaim={width:375,stats:env.accountStats()};
    report.browser = {pageErrorTypes: env.pageErrors, consoleErrors: env.consoleErrors,
      controlledResponses: env.controlledResponses};
    check(env.pageErrors.length === 0 && env.consoleErrors.every(error => error.resource
      && env.controlledResponses.some(reply => reply.path === error.path && reply.status === error.status)),
    'Recorded account path has no errors beyond its exact intercepted HTTP refusals');
    check(!env.checks.socketOpened, 'Account checks open no Realtime sockets');
    check(env.external.every(url => new URL(url).origin === 'https://placeholder.supabase.co'),
      'Every external account request uses the intercepted placeholder origin');
    check(!env.requests.some(request => request.path === '/api/auth/exchange'), 'Account UI never uses the temporary exchange endpoint');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await writeFile(folder + '/online-account.json', JSON.stringify(report, null, 2) + '\n');
    await env.close();
  }
}
