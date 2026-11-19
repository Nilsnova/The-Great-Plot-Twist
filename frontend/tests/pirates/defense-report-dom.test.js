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
      window.reportTrips = []; window.canFindReport = true;
      window.reportFeature = mountDefenseReport({on, container: document.body, context: () => window.reportContext,
        defenses: () => [{id: 'wall_1', kind: 'wall', x: 2, z: 3}, {id: 'cannon_1', kind: 'cannon', x: 4, z: 5}],
        focus: () => { window.reportFocus++; }, navigation: {
          capture: () => ({identity: window.reportContext}), available: () => window.canFindReport,
          resolve: () => new Promise(resolve => { window.finishFinding = resolve; }),
          go: intent => window.reportTrips.push([intent.id, intent.x, intent.z]),
        }});
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
    const improve = report.getByRole('button', {name: 'Improve base', exact: true});
    await improve.focus();
    await page.keyboard.press('Tab');
    const details = report.locator('details');
    expect(await details.locator('summary').evaluate(element => document.activeElement === element)).toBe(true);
    await page.keyboard.press('Enter');
    expect(await details.getAttribute('open')).not.toBe(null);
    await improve.focus();
    await page.evaluate(() => window.reportFeature.confirmed('old', 999));
    expect(await report.textContent()).not.toContain('999');
    await page.evaluate(() => window.reportFeature.confirmed('w1', 35));
    expect(await report.textContent()).toContain('Loot confirmed: 35 coins');
    expect(await improve.evaluate(button => document.activeElement === button)).toBe(true);
    expect(await details.getAttribute('open')).not.toBe(null);
    await page.keyboard.press('Escape'); expect(await page.locator('dialog[open]').count()).toBe(0);
    expect(await page.evaluate(() => window.reportFocus)).toBe(1);
    await page.evaluate(() => window.reportOpen());
    await improve.click();
    expect(await improve.isEnabled()).toBe(false);
    expect(await report.getByRole('status').textContent()).toContain('Finding the battle location');
    expect(await page.evaluate(() => window.reportTrips)).toEqual([]);
    await page.evaluate(() => window.reportEmit({type: 'wave_controller_started', waveId: 'w2', wave: 3}));
    await page.evaluate(() => window.finishFinding({spot: 'wall_1'}));
    expect(await page.locator('dialog[open]').count()).toBe(0);
    expect(await page.evaluate(() => window.reportTrips)).toEqual([]);
    expect(await page.evaluate(() => window.reportMenu().some(item => item.label === 'Last defense report'))).toBe(false);
    await page.evaluate(() => window.reportFeature.events([{type: 'island_damaged', damage: 5}, {type: 'wave_ended', reason: 'all_sunk'}]));
    expect(await page.evaluate(() => window.reportMenu().some(item => item.label === 'Last defense report'))).toBe(true);
    await page.evaluate(() => window.reportOpen());
    expect(await report.textContent()).toContain('Heart damage: 5');
    expect(await report.textContent()).toContain('No building hits were recorded.');
    expect(await improve.count()).toBe(0);
    await page.evaluate(() => window.reportEmit({type: 'travel'}));
    expect(await page.locator('dialog[open]').count()).toBe(0);
    expect(await page.evaluate(() => window.reportMenu().some(item => item.label === 'Last defense report'))).toBe(false);
    await page.evaluate(() => {
      window.reportEmit({type: 'wave_controller_started', waveId: 'w3', wave: 4});
      window.reportFeature.events([{type: 'wall_damaged', wallId: 'wall_1', damage: 20, hp: 0},
        {type: 'wave_ended', reason: 'captains_fallen'}]);
      window.reportFeature.confirmed('w3', 0, false);
      window.canFindReport = false; window.reportOpen();
    });
    expect(await report.textContent()).toContain('Observed end: All captains fell.');
    expect(await report.textContent()).toContain('between waves on your own island');
    expect(await improve.count()).toBe(0);
    await page.keyboard.press('Escape');
    await page.evaluate(() => { window.canFindReport = true; window.reportOpen(); });
    await improve.press('Enter');
    await page.evaluate(() => window.finishFinding(null));
    expect(await report.getByRole('status').textContent()).toContain('no longer available');
    await improve.press('Enter');
    await page.evaluate(() => window.finishFinding({spot: null}));
    expect(await page.evaluate(() => window.reportTrips)).toEqual([['wall_1', 2, 3]]);
    expect(await page.locator('dialog[open]').count()).toBe(0);
    await page.evaluate(() => window.reportFeature.dispose());
  });
});
