// Public browser gestures shared by online checks; presentation paging never becomes an engine move.
import assert from 'node:assert/strict';
import {dismissIntro} from './intro-browser-fixture.js';

// Since the G29 front door the title holds only Play, Join and Settings; account, saves and sign-in
// live in Settings > Account. Opens that section from the title, pause or Settings and returns its summary.
export async function openSettingsAccount(page) {
  const shell = page.locator('.shell-screen[open]');
  await shell.waitFor({state: 'visible'});
  // A genuine conflict/expiry may already have opened its account modal above the title.
  if (await page.locator('.account-modal[open]').isVisible()) return page.locator('.account-summary');
  if (await shell.getAttribute('data-mode') !== 'settings') {
    try { await shell.locator('.shell-menu, .shell-body').getByRole('button', {name: 'Settings', exact: true}).first().click(); }
    catch (error) { if (!await page.locator('.account-modal[open]').isVisible()) throw error; }
  }
  if (await page.locator('.account-modal[open]').isVisible()) return page.locator('.account-summary');
  const summary = page.locator('.shell-screen[open][data-mode="settings"] .account-summary');
  await summary.waitFor({state: 'visible'});
  return summary;
}

// Leaves Settings (opened from the title) for the title, where Play and Join live.
export async function returnToTitle(page) {
  const shell = page.locator('.shell-screen[open]');
  if (await shell.getAttribute('data-mode') === 'title') return;
  await page.keyboard.press('Escape');
  await page.locator('.shell-screen[open][data-mode="title"]').waitFor();
}

// Play is on the title: leave Settings first when an account step left it open.
export async function playFromTitle(page) {
  await returnToTitle(page);
  await page.locator('#play').click();
}

export async function openAccountControls(page) {
  if (await page.locator('.account-modal[open]').isVisible()) return;
  const shell = page.locator('.shell-screen[open]');
  if (!await shell.isVisible()) {
    await dismissIntro(page);
    await page.locator('.hud.exploring').getByRole('button', {name: 'Menu', exact: true}).click();
    await page.locator('.shell-screen[open][data-mode="pause"]').waitFor();
  }
  const source = await shell.getAttribute('data-mode') === 'pause' ? shell : await openSettingsAccount(page);
  if (await page.locator('.account-modal[open]').isVisible()) return;
  await source.getByRole('button', {name: 'Account and saves', exact: true}).click();
  await page.locator('.account-modal[open]').waitFor();
}

export async function openCrewFromHud(page) {
  const crew = page.locator('.case-toolbar').getByRole('button', {name: 'Crew', exact: true});
  if (!await crew.isVisible()) {
    await page.locator('.hud.exploring .hud-actions').getByRole('button', {name: 'Journal', exact: true}).click();
  }
  await crew.click();
  await page.locator('.case-modal[open]').waitFor();
}

export async function revealIntroText(page) {
  await page.locator('.intro-modal .kit-dialogue').evaluate(dialogue => {
    const skip = [...dialogue.querySelectorAll('button')].find(button => button.textContent === 'Show full text');
    if (skip && !skip.hidden) skip.click();
  });
}

export async function finishIntroPassages(page) {
  await page.locator('.intro-modal[open] .intro-view').waitFor();
  for (let count = 0; count < 30; count += 1) {
    const next = page.locator('.intro-modal [data-choice="intro:next"]');
    if (await page.locator('.account-modal[open]').isVisible()) {
      assert.equal(await next.count(), 0, 'Account attention must be handled before unfinished intro passages');
      return;
    }
    await revealIntroText(page);
    if (!await next.count()) return;
    await next.click();
  }
  throw new Error('Intro passages did not reach their choices.');
}

export async function findIntroChoice(page, id) {
  assert.match(id, /^[a-z0-9_]{1,40}$/, 'Only original engine action IDs are selected as moves');
  await finishIntroPassages(page);
  for (let count = 0; count < 8; count += 1) {
    const target = page.locator(`.intro-modal [data-choice="${id}"]`);
    if (await target.count()) return target;
    const more = page.locator('.intro-modal [data-choice="intro:more"]');
    if (!await more.count()) break;
    await more.click();
    await revealIntroText(page);
  }
  throw new Error(`Original intro action is not reachable: ${id}`);
}

export async function chooseIntroAction(page, id) {
  await (await findIntroChoice(page, id)).click();
  await assertEngineReplay(page);
}

export async function assertEngineReplay(page) {
  const actions = await page.evaluate(() => {
    const raw = localStorage.getItem('plot_twist_intro_moves_v1');
    return raw ? JSON.parse(raw).actions : [];
  });
  assert.ok(Array.isArray(actions) && actions.every(action => typeof action === 'string'
    && /^[a-z0-9_]{1,40}$/.test(action)), 'Continue and More actions never enter the accepted engine replay');
  return actions;
}
