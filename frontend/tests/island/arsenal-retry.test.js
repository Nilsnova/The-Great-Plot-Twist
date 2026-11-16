// Native retry controls with delayed controller replies; no live account or database is used.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const browser = browserHarness();

async function openFailed(page, size) {
  await page.setViewportSize(size);
  await page.evaluate(async () => {
    // Same shared stylesheet order as the running game, including its phone overrides.
    for (const sheet of ['base', 'kit/kit', 'shell', 'styles', 'travel', 'readability', 'kit/components', 'devices', 'open-panels']) {
      await window.g20Import(`/src/ui/${sheet}.css`);
    }
    const {createIslandUi} = await window.g20Import('/src/island/ui.js');
    const {createArsenal} = await window.g20Import('/src/island/arsenal.js');
    window.reads = 0;
    window.reply = {code: 'ISLE-K7Q2M', capacity: 20, stored: 0, copies: [], waveRunning: false, coins: 1000};
    window.failed = {ok: false, code: 'network_error', message: 'Check your internet connection and try again.'};
    const api = {state: () => {
      window.reads++;
      return window.reads === 1 ? Promise.resolve(window.failed) : new Promise(resolve => { window.finishRead = resolve; });
    }};
    window.arsenalUi = createIslandUi({container: document.body});
    window.retryArsenal = createArsenal({api, ui: window.arsenalUi, enabled: () => true});
    window.retryArsenal.open();
  });
  await page.getByRole('button', {name: 'Try again', exact: true}).waitFor({timeout: 2000});
}

it.each([{width: 1280, height: 720}, {width: 375, height: 812}])('retry remains usable at $width x $height', async size => {
  await browser.withPage(async page => {
    await openFailed(page, size);
    const retry = page.getByRole('button', {name: 'Try again', exact: true});
    const box = await retry.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(size.width);
    expect(await retry.evaluate(node => node === document.activeElement)).toBe(true);
    // Enter is a native activation; subsequent handler calls cannot queue competing reads.
    await page.keyboard.press('Enter');
    expect(await page.getByRole('button', {name: 'Opening…', exact: true}).isDisabled()).toBe(true);
    await page.evaluate(() => { window.retryArsenal.handlers.retry(); window.retryArsenal.handlers.retry(); });
    expect(await page.evaluate(() => window.reads)).toBe(2);
    expect(await page.locator('.island-message').textContent()).toBe('');
    await page.evaluate(() => window.finishRead(window.failed));
    await retry.waitFor();
    expect(await page.locator('.island-message').textContent()).toContain('Check your internet');
    await retry.click();
    await page.evaluate(() => window.finishRead({ok: true, data: window.reply}));
    await page.getByRole('heading', {name: 'Stored: 0 of 20'}).waitFor();
    expect(await page.getByRole('button', {name: 'Try again', exact: true}).count()).toBe(0);
    expect(await page.locator('.island-message').textContent()).toBe('');
    expect(await page.evaluate(() => window.reads)).toBe(3);
    await page.keyboard.press('Escape');
    expect(await page.locator('dialog[open]').count()).toBe(0);
    await page.evaluate(() => window.arsenalUi.dispose());
  });
});

it('closing during retry prevents its eventual answer from reopening the card', async () => {
  await browser.withPage(async page => {
    await openFailed(page, {width: 375, height: 812});
    await page.getByRole('button', {name: 'Try again', exact: true}).click();
    await page.keyboard.press('Escape');
    await page.evaluate(async () => {
      window.finishRead({ok: true, data: window.reply});
      await new Promise(resolve => requestAnimationFrame(resolve));
    });
    expect(await page.locator('dialog[open]').count()).toBe(0);
    expect(await page.evaluate(() => window.reads)).toBe(2);
    await page.evaluate(() => window.arsenalUi.dispose());
  });
});
