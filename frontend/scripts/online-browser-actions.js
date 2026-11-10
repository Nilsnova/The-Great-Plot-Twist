// Public browser gestures shared by online checks; presentation paging never becomes an engine move.
import assert from 'node:assert/strict';

// Since the G29 front door the title holds only Play, Join and Settings; account and sign-in live in
// Settings > Account. Opens that section from the title, pause or Settings and returns its summary.
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
    for (const selector of ['.islet-modal', '.duel-modal', '.desk-modal', '.sports-modal', '.market-modal']) {
      const modal = page.locator(`${selector}[open]`);
      if (await modal.count()) { await page.keyboard.press('Escape'); await modal.waitFor({state: 'hidden'}); }
    }
    await page.locator('.hud.exploring').getByRole('button', {name: 'Menu', exact: true}).click();
    await page.locator('.shell-screen[open][data-mode="pause"]').waitFor();
  }
  const source = await shell.getAttribute('data-mode') === 'pause' ? shell : await openSettingsAccount(page);
  if (await page.locator('.account-modal[open]').isVisible()) return;
  await source.getByRole('button', {name: 'Account', exact: true}).click();
  await page.locator('.account-modal[open]').waitFor();
}
