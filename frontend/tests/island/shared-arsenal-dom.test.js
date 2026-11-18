// Real Chromium card controls on declared shared fixtures; no authenticated/runtime claim.
import {expect, it} from 'vitest';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {browserHarness} from '../g20-browser.js';
import {data, id} from './shared-arsenal-fixture.js';

const browser = browserHarness();
it.each([{width: 1280, height: 720}, {width: 375, height: 812}])('shared full-inventory return stays usable at $width x $height', async size => {
  await browser.withPage(async page => {
    await page.setViewportSize(size);
    const view = data();
    for (let n = 1; n < 20; n++) view.copies.push({...view.copies[0], id: id(100 + n), no: n + 1,
      holder: null, holderName: null, you: false, holderGeneration: '0'});
    view.total = 20; view.stored = 19;
    await page.evaluate(async fixture => {
      for (const sheet of ['base', 'kit/kit', 'shell', 'styles', 'travel', 'readability', 'kit/components', 'devices', 'open-panels']) {
        await window.g20Import(`/src/ui/${sheet}.css`);
      }
      const {createIslandUi} = await window.g20Import('/src/island/ui.js');
      const {arsenalModel} = await window.g20Import('/src/island/arsenal-model.js');
      window.sharedReturns = 0;
      window.sharedArsenalUi = createIslandUi({container: document.body});
      window.sharedArsenalUi.arsenalCard(arsenalModel({answer: fixture, filter: 'carried'}), {
        giveBack() { window.sharedReturns++; },
      });
    }, view);
    const back = page.getByRole('button', {name: 'Return to the rack', exact: true});
    expect(await back.isEnabled()).toBe(true);
    await back.focus(); await page.keyboard.press('Enter');
    expect(await page.evaluate(() => window.sharedReturns)).toBe(1);
    expect(await page.getByRole('heading', {name: 'Buy for the crew (island treasury)', exact: true}).count()).toBe(1);
    expect(await page.locator('[data-focus="buy-pistols"]').isDisabled()).toBe(true);
    const bounds = await back.boundingBox();
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(size.width);
    const captureDir = process.env.ARSENAL_CAPTURE_DIR;
    if (captureDir) {
      await mkdir(captureDir, {recursive: true});
      await page.screenshot({path: join(captureDir, `shared-arsenal-${size.width}.png`)});
    }
  });
});
