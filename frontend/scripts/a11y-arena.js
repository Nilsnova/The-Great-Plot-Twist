// Explicit development practice uses real arena E, native own choices and the existing local rival/replay.
import assert from 'node:assert/strict';
import {startFromTitle} from './shell-browser-tools.js';
const selector = '.duel-modal[open]';
async function openLocalArena(page, url) {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.goto(url + '/?case=local&arena=local'); await startFromTitle(page);
  await page.waitForFunction(() => !!window.__island);
  await page.evaluate(async () => {
    const game = window.__island; await game.world.goTo('smugglers_cove', {fast: true});
    const zone = game.world.current?.zones.find(item => item.id === 'arena_gate');
    if (!zone) throw new Error('The public arena hotspot is unavailable.');
    game.player.position.set(zone.x, game.world.current.groundHeight(zone.x, zone.z), zone.z);
    game.renderer.domElement.focus();
  });
  await page.waitForFunction(() => { const prompt = document.querySelector('.interact');
    return prompt?.dataset.zone === 'arena_gate' && !prompt.hidden; });
  await page.keyboard.press('KeyE'); await page.locator(selector).waitFor({state: 'visible'});
  await page.locator(selector + ' .duel-practice').filter({hasText: 'Practice ring:'}).waitFor({state: 'visible'});
  await page.locator(selector + ' .duel-wallet').waitFor({state: 'visible'});
}
async function chooseOwnShades(root) {
  const rounds = root.locator('.duel-round'), count = await rounds.count();
  assert.ok(count > 0, 'The public picker supplies native round controls');
  for (let index = 0; index < count; index++) await rounds.nth(index).locator('input[type="radio"][value="shade"]').check();
}
async function finishPublicReveal(page) {
  const reveal = page.locator(selector + ' .duel-reveal:not([hidden])'); await reveal.waitFor({state: 'visible', timeout: 15000});
  const skip = reveal.getByRole('button', {name: 'Skip', exact: true}); if (await skip.isVisible()) await skip.click();
  await reveal.locator('.duel-banner').filter({hasText: /\S/}).waitFor({state: 'visible'});
  await reveal.getByRole('button', {name: 'Back to the ring', exact: true}).waitFor({state: 'visible'});
}
async function shortArena(page, capture) {
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
export async function auditArenaPanel(page, {url, audit, capture}) {
  try {
    await openLocalArena(page, url); const modal = page.locator(selector);
    await audit('arena-challenges', selector, 'case');
    const challenge = modal.locator('.duel-section').filter({hasText: 'Named challenges to you'}).locator('.duel-card').first();
    const answerName = 'Answer challenge 1 from ' + await challenge.locator('h4').innerText();
    await challenge.getByRole('button', {name: answerName, exact: true}).click();
    const answer = modal.locator('.duel-answer:not([hidden])'); await answer.waitFor(); await chooseOwnShades(answer);
    await audit('arena-answer-form', selector, 'case');
    await answer.getByRole('button', {name: 'Back to the challenges', exact: true}).click();
    await modal.getByRole('tab', {name: 'New challenge', exact: true}).click();
    const form = modal.locator('.duel-form');
    await form.getByRole('radio', {name: 'Any captain (open challenge)', exact: true}).check();
    await form.getByRole('radio', {name: '3 rounds', exact: true}).check();
    await form.getByRole('radio', {name: 'Friendly', exact: true}).check(); await chooseOwnShades(form);
    await audit('arena-new-challenge', selector, 'case');
    await form.getByRole('button', {name: 'Seal and send', exact: true}).click();
    await modal.locator('.duel-sealed').waitFor({state: 'visible'});
    const ownDetailsVisible = await modal.locator('.duel-sealed').isVisible();
    // The existing practice adapter answers after six seconds. No timer, sealed data or outcome is injected.
    await finishPublicReveal(page); await audit('arena-reveal', selector, 'case');
    await page.keyboard.press('Escape'); await modal.locator('.duel-reveal').waitFor({state: 'hidden'});
    const revealEscapeKeptPanel = await modal.count() === 1;
    assert.ok(revealEscapeKeptPanel, 'The first arena Escape leaves the reveal before closing its modal');
    await audit('arena-history', selector, 'case');
    await modal.getByRole('tab', {name: 'Rules', exact: true}).click(); await audit('arena-rules', selector, 'case');
    await modal.getByRole('tab', {name: 'Your duels', exact: true}).click();
    await modal.getByRole('button', {name: /^Replay:/}).first().click(); await finishPublicReveal(page);
    await audit('arena-replay', selector, 'case');
    const checks = {...await shortArena(page, capture), ownDetailsVisible, revealEscapeKeptPanel};
    await page.keyboard.press('Escape'); await modal.locator('.duel-reveal').waitFor({state: 'hidden'});
    checks.replayEscapeKeptPanel = await modal.count() === 1;
    await page.keyboard.press('Escape'); await modal.waitFor({state: 'hidden'});
    checks.escapeClosed = await page.locator(selector).count() === 0;
    checks.noPause = await page.locator('.shell-screen[open]').count() === 0;
    checks.canvasFocus = await page.evaluate(() => document.activeElement?.matches('canvas[tabindex="0"]') === true);
    return {width: 375, height: 400, checks};
  } finally { await page.setViewportSize({width: 1280, height: 900}); }
}
