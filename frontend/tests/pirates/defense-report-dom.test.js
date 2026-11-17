import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const browser = browserHarness();

it.each([{width: 1280, height: 720}, {width: 375, height: 812}])('the real menu report works at $width x $height', async size => {
  await browser.withPage(async page => {
    await page.setViewportSize(size);
    await page.evaluate(async () => {
      for (const sheet of ['base', 'kit/kit', 'kit/components']) await window.g20Import(`/src/ui/${sheet}.css`);
      const {mountDefenseReport} = await window.g20Import('/src/pirates/defense-report-feature.js');
      const {on, emit} = await window.g20Import('/src/core/events.js');
      const {menuExtras} = await window.g20Import('/src/shell/menu-extras.js');
      window.reportContext = 'A'; window.reportMenu = menuExtras; window.reportEmit = emit; window.reportFocus = 0;
      window.reportFeature = mountDefenseReport({on, container: document.body, context: () => window.reportContext,
        defenses: () => [{id: 'wall_1', kind: 'wall', x: 2, z: 3}, {id: 'cannon_1', kind: 'cannon', x: 4, z: 5}], focus: () => { window.reportFocus++; }});
      window.reportOpen = () => menuExtras().find(item => item.label === 'Last defense report')?.onSelect();
    });
    expect(await page.evaluate(() => window.reportMenu().some(item => item.label === 'Last defense report'))).toBe(false);
    await page.evaluate(() => {
      window.reportEmit({type: 'wave_controller_started', waveId: 'w1', wave: 2});
      window.reportFeature.events([{type: 'wall_damaged', wallId: 'wall_1', damage: 20, hp: 0},
        {type: 'ship_hit', by: 'cannon_1', damage: 30}, {type: 'island_damaged', damage: 7}, {type: 'wave_ended', reason: 'captains_fallen'}]);
      window.reportOpen();
    });
    const report = page.getByRole('region', {name: 'Last defense report'});
    expect(await report.textContent()).toContain('All captains fell');
    expect(await report.textContent()).toContain('Earlier actions may be missing');
    expect(await report.textContent()).toContain('Heart damage: 7');
    expect(await report.textContent()).toContain('Hit damage: 20');
    expect(await report.textContent()).toContain('greater than health lost');
    expect(await report.textContent()).toContain('Damage done: 30');
    expect(await report.textContent()).toContain('waiting for confirmation');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => window.reportFeature.confirmed('old', 999));
    expect(await report.textContent()).not.toContain('999');
    await page.evaluate(() => window.reportFeature.confirmed('w1', 35));
    expect(await report.textContent()).toContain('Loot confirmed: 35 coins');
    await page.keyboard.press('Escape'); expect(await page.locator('dialog[open]').count()).toBe(0);
    expect(await page.evaluate(() => window.reportFocus)).toBe(1);
    await page.evaluate(() => window.reportOpen());
    await page.evaluate(() => window.reportEmit({type: 'wave_controller_started', waveId: 'w2', wave: 3}));
    expect(await page.locator('dialog[open]').count()).toBe(0);
    expect(await page.evaluate(() => window.reportMenu().some(item => item.label === 'Last defense report'))).toBe(false);
    await page.evaluate(() => window.reportFeature.events([{type: 'island_damaged', damage: 5}, {type: 'wave_ended', reason: 'all_sunk'}]));
    expect(await page.evaluate(() => window.reportMenu().some(item => item.label === 'Last defense report'))).toBe(true);
    await page.evaluate(() => window.reportOpen());
    expect(await report.textContent()).toContain('Heart damage: 5');
    expect(await report.textContent()).toContain('No building hits were recorded.');
    await page.evaluate(() => window.reportEmit({type: 'travel'}));
    expect(await page.locator('dialog[open]').count()).toBe(0);
    expect(await page.evaluate(() => window.reportMenu().some(item => item.label === 'Last defense report'))).toBe(false);
    await page.evaluate(() => window.reportFeature.dispose());
  });
});
