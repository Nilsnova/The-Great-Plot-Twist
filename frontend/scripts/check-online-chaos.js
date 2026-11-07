// Production fault journeys use the bundled client, public controls and intercepted endpoints only.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openAuthFixture} from './online-auth-fixture.js';
import {createOnlineChaosFaults, onlineChaosFaults, onlineChaosRouteGroups} from './online-chaos-fixtures.js';
import {introChaosJourney,saveChaosJourney} from './online-chaos-account-journeys.js';
import {signInFromTitle} from './online-chaos-signin.js';
import {openAccountControls, openCrewFromHud} from './online-browser-actions.js';

async function openSignedInAccount({page, url}) {
  await signInFromTitle({page,url});
  await openAccountControls(page);
  await page.locator('.account-modal[open]').waitFor();
  await page.getByRole('button', {name: 'Change captain name once', exact: true}).waitFor();
}

export const accountChaosJourney = Object.freeze({
  group: 'account', paths: ['/api/me/name/reroll'], method: 'POST',
  call: '.account-modal[open] .server-call', focus: 'account-reroll',
  setup: openSignedInAccount,
  async trigger({page}) {
    const control = page.getByRole('button', {name: 'Change captain name once', exact: true});
    await control.focus();
    await control.click();
  },
  async snapshot({page}) {
    return page.evaluate(() => ({
      captain: document.querySelector('.account-status')?.textContent.split(' · ').slice(1).join(' · '),
      kits: document.querySelectorAll('.case-kit-name').length,
      crewCodes: document.querySelectorAll('.crew-code').length,
      journal: localStorage.getItem('plot_twist_intro_moves_v1'),
    }));
  },
  async unchanged({page}, before, fault) {
    const after = await accountChaosJourney.snapshot({page});
    assert.equal(after.kits, before.kits, 'A refused account action grants no kit');
    assert.equal(after.crewCodes, before.crewCodes, 'A refused account action creates no crew');
    assert.equal(after.journal, before.journal, 'Refusal and expiry preserve this device\'s intro');
    if (fault.status !== 401) assert.equal(after.captain, before.captain, 'A refused re-roll keeps the captain name');
  },
});

// The recorded own-account read confirms an existing kit; failures below can never award another.
export function createCrewChaosJourney() {
  const installed = new WeakMap();
  return {
    group: 'crew', paths: ['/api/crews'], method: 'POST',
    call: '.case-modal[open] .server-call', focus: 'create-crew',
    async setup(env) {
      const {page} = env;
      if (!installed.has(page)) {
        const id = env.fixtureUserId ?? randomUUID();
        const ownAccount = route => route.request().method() === 'GET'
          ? route.fulfill({json: {id, captainName: 'Recorded Captain', coins: 0, crews: [],
            kit: 'stranger', place: 'lighthouse_isle'}})
          : route.fallback();
        installed.set(page, ownAccount);
        await page.route('**/api/me', ownAccount);
      }
      await openSignedInAccount(env);
      await page.keyboard.press('Escape');
      await page.locator('.account-modal').waitFor({state: 'hidden'});
      await page.locator('.shell-menu').getByRole('button', {name: 'Continue', exact: true}).click();
      await page.locator('.hud.exploring').waitFor();
      await openCrewFromHud(page);
      await page.locator('.case-modal[open] .case-crew').waitFor();
      await page.getByRole('button', {name: 'Start a crew', exact: true}).waitFor();
    },
    async trigger({page}) {
      const control = page.getByRole('button', {name: 'Start a crew', exact: true});
      await control.focus();
      await control.click();
    },
    async snapshot({page}) {
      return page.evaluate(() => ({
        codes: document.querySelectorAll('.crew-code').length,
        occupied: document.querySelectorAll('.crew-seat[data-kind="player"],.crew-seat[data-kind="npc"]').length,
        journal: localStorage.getItem('plot_twist_intro_moves_v1'),
      }));
    },
    async unchanged({page}, before) {
      const after = await this.snapshot({page});
      assert.equal(after.codes, before.codes, 'A refused crew action creates no crew code');
      assert.equal(after.occupied, before.occupied, 'A refused crew action fills no seat');
      assert.equal(after.journal, before.journal, 'Crew failures keep this device\'s intro');
    },
    async dispose({page}) {
      const handler = installed.get(page);
      if (handler) await page.unroute('**/api/me', handler);
      installed.delete(page);
    },
  };
}

// A later stream supplies an actual setup/trigger/snapshot journey for each additional route group.
// The returned pendingGroups are an explicit coverage limit, not successful fault checks.
export async function checkOnlineChaos({openFixture = openAuthFixture,
  journeys = [accountChaosJourney, introChaosJourney, saveChaosJourney, createCrewChaosJourney()], widths = [375],
  folder = process.env.CAPTURE_DIR ?? 'captures/20261106_G9-C1-chaos',
  requireAllGroups = false, log = true} = {}) {
  const env = await openFixture();
  const {page} = env;
  const faults = createOnlineChaosFaults(page);
  const pageErrors = [];
  const collectError = error => pageErrors.push(error.name);
  page.on('pageerror', collectError);
  const coveredGroups = [...new Set(journeys.map(journey => journey.group))];
  const report = {checks: [], cases: [], requests: faults.requests, coveredGroups,reducedMotion:true,
    pendingGroups: onlineChaosRouteGroups.filter(group => !coveredGroups.includes(group))};
  report.coverage = report.pendingGroups.length ? 'partial' : 'complete';
  const check = (value, label) => { assert.ok(value, label); report.checks.push(label); };
  try {
    await mkdir(folder, {recursive: true});
    await page.emulateMedia({reducedMotion:'reduce'});
    await faults.install();
    for (const width of widths) {
      await page.setViewportSize({width, height: 812});
      for (const journey of journeys) {
        for (const fault of onlineChaosFaults) {
          if(log)console.log(`CHAOS ${journey.group}/${fault.id} @ ${width}`);
          faults.clear();
          await journey.setup(env, fault);
          const before = await journey.snapshot(env, fault);
          const requestStart = faults.requests.length;
          faults.set(journey, fault);
          await journey.trigger(env, fault, {before, check});
          const call = page.locator(journey.call);
          await call.waitFor({state: 'visible'});
          await page.waitForFunction(({selector, phase}) =>
            document.querySelector(selector)?.dataset.state === phase,
          {selector: journey.call, phase: fault.phase});
          check(fault.words.test(await call.textContent()), `${journey.group}/${fault.id}: refusal has plain words at ${width}`);
          check(faults.requests.length > requestStart, `${journey.group}/${fault.id}: the real route was intercepted`);
          await journey.unchanged(env, before, fault);
          if (journey.checkFocus && fault.status === 401) await journey.checkFocus(env, fault, check);
          else {
            const expectedFocus = journey.expectedFocus?.(fault) ?? (fault.status === 401 ? 'account-sign-in' : journey.focus);
            await page.waitForFunction(key => document.activeElement?.dataset.focus === key, expectedFocus);
            check(true, `${journey.group}/${fault.id}: focus stays on the next available control`);
          }
          const reportLink = call.getByRole('link', {name: 'Report a problem', exact: true});
          check(await reportLink.isVisible(), `${journey.group}/${fault.id}: a report action is available`);
          if (fault.status === 429) {
            const retry = call.getByRole('button', {name: /^Retry/});
            check(await retry.isDisabled(), `${journey.group}: the cooldown disables retry`);
            const requestsDuringWait = faults.requests.length;
            if(width===375)await page.screenshot({path:`${folder}/${journey.group}-${fault.id}-${width}.png`});
            const original=page.locator(`[data-focus="${journey.focus}"]`).last();
            check(await original.isDisabled(),`${journey.group}: the refused control is disabled during the wait`);
            await original.dispatchEvent('click');
            check(faults.requests.length===requestsDuringWait,`${journey.group}: a forced activation cannot bypass the cooldown`);
            await retry.waitFor({state: 'visible'});
            await page.waitForFunction(selector => {
              const control = document.querySelector(selector)?.querySelector('[data-focus="retry-server-call"]');
              return control && !control.disabled;
            }, journey.call);
            check(faults.requests.length === requestsDuringWait, `${journey.group}: the countdown never sends a write`);
          }
          check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            `${journey.group}/${fault.id}: the page fits ${width} px`);
          if (width === 375 && ['offline', 'expired'].includes(fault.id)) {
            await page.screenshot({path: `${folder}/${journey.group}-${fault.id}-${width}.png`});
          }
          report.cases.push({group: journey.group, fault: fault.id, width, status: fault.status});
        }
        await journey.dispose?.(env);
      }
    }
    check(pageErrors.length === 0, 'Fault journeys have no uncaught browser errors');
    check(!env.requests.some(request => request.path === '/api/auth/exchange'),
      'Fault journeys never use the retired sign-in exchange');
    check(env.external.every(value => new URL(value).origin === 'https://placeholder.supabase.co'),
      'All external requests stay on intercepted placeholder endpoints');
    if (requireAllGroups) check(report.pendingGroups.length === 0, 'Every online route group has a production UI journey');
    if (log) console.log(JSON.stringify(report, null, 2));
    return report;
  } catch(error) {
    report.failure={type:error.name,browser:await page.evaluate(()=>({
      accountState:document.querySelector('.account-summary-state')?.textContent??null,
      dialogs:[...document.querySelectorAll('dialog[open]')].map(element=>element.className),
      crewPresent:!!document.querySelector('.case-crew'),
      crewControls:[...document.querySelectorAll('.case-crew button')].map(button=>({label:button.textContent,disabled:button.disabled})),
      connectionState:document.querySelector('.connection-banner')?.dataset.state??null,
    })),pageErrorTypes:pageErrors};
    await page.screenshot({path:'/tmp/g9-chaos-failure.png'});
    throw error;
  } finally {
    try {
      await faults.dispose();
      for (const journey of journeys) await journey.dispose?.(env);
      page.off('pageerror', collectError);
      await writeFile(`${folder}/online-chaos.json`, JSON.stringify(report, null, 2) + '\n');
    } finally { await env.close(); }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await checkOnlineChaos({requireAllGroups: process.argv.includes('--all-groups')});
  await (await import('./check-online-crew.js')).checkOnlineCrewChaos({checkChaos:checkOnlineChaos});
}
