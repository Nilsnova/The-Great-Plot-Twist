// Intro and save fault journeys use public production controls and preserve accepted local moves.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {ACCOUNT_INTRO_ACTIONS} from './online-account-fixture.js';
import {startFromTitle} from './shell-browser-tools.js';
import {signInFromTitle} from './online-chaos-signin.js';

const finalAction = ACCOUNT_INTRO_ACTIONS.at(-1);
const saveOverrides = new WeakMap();
const accountOverrides = new WeakMap();

async function removeAccountOverride(page) {
  const handler = accountOverrides.get(page);
  if (handler) await page.unroute('**/api/me', handler);
  accountOverrides.delete(page);
}

async function useUnclaimedAccount({page, fixtureUserId}) {
  await removeAccountOverride(page);
  const id = fixtureUserId ?? randomUUID();
  const handler = route => route.request().method() === 'GET'
    ? route.fulfill({json: {id, captainName: 'Recorded Captain', coins: 0, crews: [], kit: null, place: null}})
    : route.fallback();
  accountOverrides.set(page, handler);
  await page.route('**/api/me', handler);
}

async function finishIntroText(page) {
  const skip = page.locator('.intro-modal').getByRole('button', {name: 'Show full text', exact: true});
  if (await skip.isVisible()) {
    try {await skip.click({timeout:1000});}
    catch(error){if(await skip.isVisible())throw error;}
  }
}

async function snapshot({page}) {
  return page.evaluate(() => {
    let journal = null;
    const rawJournal = localStorage.getItem('plot_twist_intro_moves_v1');
    try { journal = rawJournal ? JSON.parse(rawJournal) : null; } catch { /* A missing replay stays explicit. */ }
    return {
      kits: document.querySelectorAll('.case-kit-name').length,
      crewCodes: document.querySelectorAll('.crew-code').length,
      worlds: document.querySelectorAll('.hud.exploring').length,
      journal, rawJournal,
    };
  });
}

function assertNoGrants(before, after, label) {
  assert.equal(before.kits, 0, label + ' begins without a kit grant');
  assert.equal(after.kits, 0, label + ' cannot grant a kit');
  assert.equal(after.crewCodes, before.crewCodes, label + ' cannot create a crew');
}

export const introChaosJourney = Object.freeze({
  group: 'intro', paths: ['/api/intro/complete'], method: 'POST',
  call: '.case-arrival .server-call', focus: 'retry-server-call',
  expectedFocus(fault) {
    if (fault.status === 401) return 'account-sign-in';
    return [404, 409, 429].includes(fault.status) ? 'report-server-call' : 'retry-server-call';
  },
  async setup(env) {
    const {page} = env;
    await useUnclaimedAccount(env);
    await signInFromTitle(env);
    await startFromTitle(page, {closeIntro: false});
    for (const id of ACCOUNT_INTRO_ACTIONS.slice(0, -1)) {
      await finishIntroText(page);
      await page.locator(`.intro-modal [data-choice="${id}"]`).click();
    }
    await finishIntroText(page);
    await page.locator(`.intro-modal [data-choice="${finalAction}"]`).waitFor();
  },
  async trigger({page}) {
    const control = page.locator(`.intro-modal [data-choice="${finalAction}"]`);
    await control.focus();
    await control.click();
  },
  snapshot,
  async unchanged(env, before) {
    const after = await snapshot(env);
    assertNoGrants(before, after, 'A refused intro confirmation');
    assert.equal(before.journal?.version, 1, 'The staged intro has a versioned local replay');
    assert.deepEqual(before.journal.actions, ACCOUNT_INTRO_ACTIONS.slice(0, -1),
      'Setup follows the existing accepted public intro path');
    assert.equal(after.journal?.version, 1, 'A failed server confirmation keeps the local replay');
    assert.deepEqual(after.journal.actions, [...before.journal.actions, finalAction],
      'The final accepted local move survives every server refusal and expiry');
  },
  dispose: ({page}) => removeAccountOverride(page),
});

async function removeSaveOverride(page) {
  const handler = saveOverrides.get(page);
  if (handler) await page.unroute('**/api/save', handler);
  saveOverrides.delete(page);
}

async function currentLocalActions(page) {
  return page.evaluate(() => {
    try {
      const data = JSON.parse(localStorage.getItem('plot_twist_intro_moves_v1'));
      if (data?.version === 1 && Array.isArray(data.actions) && data.actions.length <= 300
        && data.actions.every(action => typeof action === 'string' && /^[a-z0-9_]{1,40}$/.test(action))) {
        return data.actions;
      }
    } catch { /* The first journey may start on an empty browser page. */ }
    return [];
  });
}

export const saveChaosJourney = Object.freeze({
  group: 'save', paths: ['/api/save'], method: 'GET',
  call: '.account-modal[open] .server-call', focus: 'account-continue',
  expectedFocus: fault => fault.status === 401 ? 'account-sign-in' : 'account-continue',
  async setup(env) {
    const {page} = env;
    await removeSaveOverride(page);
    await useUnclaimedAccount(env);
    const actions = await currentLocalActions(page);
    const handler = route => route.request().method() === 'GET'
      ? route.fulfill({json: {version: 1, data: {kind: 'intro', actions, place: 'lighthouse_isle'}, updatedAt: null}})
      : route.fallback();
    saveOverrides.set(page, handler);
    await page.route('**/api/save', handler);
    await signInFromTitle(env);
    await page.getByRole('button', {name: 'Account and saves', exact: true}).click();
    await page.locator('.account-modal[open]').waitFor();
    await page.locator('.account-screen').getByRole('button', {name: 'Continue from cloud', exact: true}).waitFor();
  },
  async trigger({page}) {
    // Setup's replay enables the genuine control; remove it so the runner's older fault route wins.
    await removeSaveOverride(page);
    const control = page.locator('.account-screen').getByRole('button', {name: 'Continue from cloud', exact: true});
    await control.focus();
    await control.click();
  },
  snapshot,
  async unchanged(env, before) {
    const after = await snapshot(env);
    assertNoGrants(before, after, 'A refused cloud-save read');
    assert.equal(after.worlds, before.worlds, 'A refused Continue cannot start a world');
    assert.equal(after.rawJournal, before.rawJournal, 'A refused cloud read and expiry keep this device\'s intro');
  },
  async dispose({page}) { await removeSaveOverride(page); await removeAccountOverride(page); },
});
