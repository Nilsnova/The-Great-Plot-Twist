// The fortune teller (lane H's Harbor card for the prediction desk), opened with the real hotspot E in the
// explicit development practice (?desk=local) and audited through its native buttons: pick a side, a
// 5 / 10 / 25 stake, place it with the keyboard, see it under My stakes, then Escape back to the game.
import assert from 'node:assert/strict';
import {startFromTitle} from './shell-browser-tools.js';
const selector = '.harbor-fortune[open]';
async function openLocalDesk(page, url) {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.goto(url + '/?adapter=local&desk=local'); await startFromTitle(page);
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
  await page.locator(selector + ' .harbor-question-item').first().waitFor({state: 'visible'});
}
async function prepareStake(page) {
  const card = page.locator(selector + ' .harbor-question-item').first();
  assert.equal(await card.locator('[aria-pressed="true"]').count(), 0, 'Nothing is preselected');
  assert.ok(await card.locator('.harbor-confirm').isDisabled(), 'Place stake waits for a side and a stake');
  const text = await card.locator('h3').innerText();
  await card.getByRole('group', {name: 'Yes or no?', exact: true}).getByRole('button', {name: `No, ${text}`, exact: true}).click();
  await card.getByRole('group', {name: 'Your stake', exact: true}).getByRole('button', {name: `10 coins on ${text}`, exact: true}).click();
  await card.getByRole('button', {name: `Place 🪙 10 on No, ${text}`, exact: true}).waitFor({state: 'visible'}); return card;
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
    await audit('fortune-questions', selector, 'case');
    const card = await prepareStake(page); await audit('fortune-confirm', selector, 'case');
    // Keyboard only: the place button takes Enter.
    await card.locator('.harbor-confirm').focus(); await page.keyboard.press('Enter');
    await card.locator('.harbor-notice').filter({hasText: 'Your 🪙 10 is on No.'}).waitFor({state: 'visible'});
    await audit('fortune-staked', selector, 'case');
    const listed = await modal.locator('.harbor-own-row').filter({hasText: '🪙 10 on No'}).count() > 0;
    const checks = {...await shortDesk(page, capture), stakeListed: listed};
    await page.setViewportSize({width: 1280, height: 900});
    await page.keyboard.press('Escape'); await modal.waitFor({state: 'hidden'});
    checks.escapeClosed = await page.locator(selector).count() === 0;
    checks.noPause = await page.locator('.shell-screen[open]').count() === 0;
    checks.canvasFocus = await page.evaluate(() => document.activeElement?.matches('canvas[tabindex="0"]') === true);
    return {width: 375, height: 400, checks};
  } finally { await page.setViewportSize({width: 1280, height: 900}); }
}
