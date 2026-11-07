// Explicit development practice is opened with real hotspot E and audited through native desk controls.
import assert from 'node:assert/strict';
import {startFromTitle} from './shell-browser-tools.js';
const selector = '.desk-modal[open]';
async function openLocalDesk(page, url) {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.goto(url + '/?case=local&desk=local'); await startFromTitle(page);
  await page.waitForFunction(() => !!window.__island);
  await page.evaluate(async () => {
    const game = window.__island; await game.world.goTo('saltreach_harbor', {fast: true});
    const zone = game.world.current?.zones.find(item => item.id === 'prediction_kiosk');
    if (!zone) throw new Error('The public prediction hotspot is unavailable.');
    game.player.position.set(zone.x, game.world.current.groundHeight(zone.x, zone.z), zone.z);
    game.renderer.domElement.focus();
  });
  await page.waitForFunction(() => { const prompt = document.querySelector('.interact');
    return prompt?.dataset.zone === 'prediction_kiosk' && !prompt.hidden; });
  await page.keyboard.press('KeyE'); await page.locator(selector).waitFor({state: 'visible'});
  await page.locator(selector + ' .desk-practice').filter({hasText: 'Practice desk: not real coins'}).waitFor({state: 'visible'});
  await page.locator(selector + ' .desk-card').first().waitFor({state: 'visible'});
}
async function prepareStake(page) {
  const card = page.locator(selector + ' .desk-card').first();
  await card.getByRole('radio', {name: 'No', exact: true}).check();
  const stakeName = 'Stake ' + await card.locator('h3').innerText();
  await card.getByRole('spinbutton').fill('17'); await card.getByRole('button', {name: stakeName, exact: true}).click();
  await card.getByRole('button', {name: 'Confirm', exact: true}).waitFor({state: 'visible'}); return card;
}
async function shortDesk(page, capture) {
  await page.setViewportSize({width: 375, height: 400});
  const checks = await page.locator(selector).evaluate(async root => {
    const h = await import('/scripts/a11y-helpers.js');
    const controls = [...root.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),summary')]
      .filter(control=>h.renderedForAudit(control));
    return {fitsViewport: h.withinViewport(root.getBoundingClientRect(), {width: innerWidth, height: innerHeight}),
      noPanelOverflow: !h.hasHorizontalOverflow(root), noDocumentOverflow: !h.hasHorizontalOverflow(document.documentElement),
      targets44: controls.length > 0 && controls.every(control => h.touchTargetMeetsMinimum(control.getBoundingClientRect()))};
  });
  await page.screenshot({path: capture}); return checks;
}
export async function auditPredictionsPanel(page, {url, audit, capture}) {
  try {
    await openLocalDesk(page, url); const modal = page.locator(selector);
    await audit('predictions-questions', selector, 'case');
    await prepareStake(page); await audit('predictions-confirm', selector, 'case');
    await page.keyboard.press('Escape');
    const confirmEscapeKeptPanel = await modal.count() === 1
      && await modal.getByRole('button', {name: 'Confirm', exact: true}).count() === 0;
    assert.ok(confirmEscapeKeptPanel, 'The first desk Escape cancels only its unsubmitted confirmation');
    const card = await prepareStake(page); await card.getByRole('button', {name: 'Confirm', exact: true}).click();
    await card.locator('.desk-your-stake').filter({hasText: '17 coins on NO'}).waitFor({state: 'visible'});
    await audit('predictions-staked', selector, 'case');
    await modal.getByRole('tab', {name: 'My stakes', exact: true}).click();
    await modal.locator('.desk-stake-main').filter({hasText: '17 coins on NO'}).waitFor({state: 'visible'});
    await audit('predictions-stakes', selector, 'case');
    const checks = {...await shortDesk(page, capture), confirmEscapeKeptPanel};
    await page.keyboard.press('Escape'); await modal.waitFor({state: 'hidden'});
    checks.escapeClosed = await page.locator(selector).count() === 0;
    checks.noPause = await page.locator('.shell-screen[open]').count() === 0;
    checks.canvasFocus = await page.evaluate(() => document.activeElement?.matches('canvas[tabindex="0"]') === true);
    return {width: 375, height: 400, checks};
  } finally { await page.setViewportSize({width: 1280, height: 900}); }
}
