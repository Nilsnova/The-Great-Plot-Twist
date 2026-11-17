// Actual native DOM/PNG/controller evidence against a declared local transport; no live recovery claim.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const browser = browserHarness();

it('keeps supplied healthy HP, real portrait and readable44px actions within both viewports', async () => {
  await browser.withPage(async page => {
    for (const viewport of [{width: 1280, height: 720}, {width: 375, height: 812}]) {
      await page.setViewportSize(viewport);
      const result = await page.evaluate(async () => {
        await window.g20Import('/src/ui/kit/kit.css');
        const {createIslandUi} = await window.g20Import('/src/island/ui.js'), {buildCardModel} = await window.g20Import('/src/island/card-model.js');
        const ui = createIslandUi({container: document.body});
        const model = buildCardModel({spotId: 'wall_1', slot: 'wall', coins: 1000, movable: true,
          spot: {id: 'wall_1', kind: 'wall', built: true, level: 1, upgradeCost: 37}});
        // Deliberately supplied service-view values, not inferred from the building's Strength statistic.
        model.recovery = {status: 'ready', visible: false, actualHp: 60, maxHP: 60};
        ui.buildCard(model, {move() {}, upgrade() {}}, {dock: true}); window.selectionUi = ui;
        return {active: ui.active, hp: ui.selectionElement.querySelector('.island-selection-health').textContent};
      });
      expect(result).toEqual({active: false, hp: '60 / 60 HP'});
      await page.waitForFunction(() => !!document.querySelector('.island-selection-portrait canvas'));
      const bounds = await page.locator('.island-selection-dock').evaluate(element => ({height: element.getBoundingClientRect().height,
        buttons: [...element.querySelectorAll('button')].filter(button => button.getClientRects().length).map(button => {
          const r = button.getBoundingClientRect(), s = getComputedStyle(button), range = document.createRange(); range.selectNodeContents(button); const text = range.getBoundingClientRect();
          return {width: r.width, height: r.height, font: parseFloat(s.fontSize), inside: r.left >= 0 && r.right <= innerWidth,
            fits: text.left >= r.left + parseFloat(s.paddingLeft) + 1 && text.right <= r.right - parseFloat(s.paddingRight) - 1 && button.scrollWidth <= button.clientWidth};
        })}));
      expect(bounds.height).toBeLessThanOrEqual(viewport.width < 640 ? 250 : 120);
      for (const b of bounds.buttons) expect(b).toMatchObject({width: expect.any(Number), height: expect.any(Number), font: 17, inside: true, fits: true});
      expect(bounds.buttons.every(b => b.width >= 44 && b.height >= 44)).toBe(true);
      await page.evaluate(() => window.selectionUi.dispose());
    }
  });
});

it('routes real dock upgrade A through pending/reselection B and never puts A refusal into B', async () => {
  await browser.withPage(async page => {
    const setup = await page.evaluate(async () => {
      const THREE = await window.g20Import('/node_modules/three/build/three.module.js');
      const {createIsland} = await window.g20Import('/src/island/index.js'), {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
      const {createIslandApi} = await window.g20Import('/src/island/api.js');
      const fake = createFakeIslandTransport({version: 2}); fake.dev.setCoins(1000); fake.dev.setWaveBest(40);
      const api = createIslandApi({transport: fake}), builds = [await api.build({spot: 'wall_1', kind: 'wall'}), await api.build({spot: 'wall_2', kind: 'wall'})];
      const transport = {...fake, post: (path, body) => path === '/api/island/upgrade' ? new Promise(resolve => {
        window.releaseSelectionUpgrade = success => success ? fake.post(path, body).then(resolve)
          : resolve({ok: false, status: 409, code: 'wave_running', message: 'A wave is under way.'});
      }) : fake.post(path, body)};
      const island = createIsland({container: document.body, transport, mode: 'fake', on: () => () => {}, emit() {}, storage: null, menu: () => () => {}});
      await island.load(); const cleanups = [], place = {group: new THREE.Group(), zones: [], colliders: [], update() {}};
      island.decorate(place, {}, cleanups, {}); const entered = island.toggleVillage(); window.selectionController = {island, cleanups};
      return {builds: builds.map(answer => ({ok: answer.ok, code: answer.code})), entered, managing: island.managing};
    });
    expect(setup).toEqual({builds: [{ok: true}, {ok: true}], entered: true, managing: true});
    for (const success of [false, true]) {
      await page.evaluate(() => window.selectionController.island.pick('wall_1'));
      await page.locator('.island-selection-dock [data-focus=upgrade]').click();
      await page.evaluate(() => window.selectionController.island.pick('wall_2'));
      expect(await page.locator('.island-selection-dock [data-focus=upgrade]').isDisabled()).toBe(true);
      expect(await page.locator('.island-selection-dock').textContent()).toContain('Another building action is in progress.');
      await page.locator('.island-selection-dock [data-focus=details]').click();
      expect(await page.locator('dialog[open]').count()).toBe(1);
      await page.evaluate(value => window.releaseSelectionUpgrade(value), success);
      await page.waitForFunction(() => document.querySelector('.island-card-build [data-focus=upgrade]')?.disabled === false);
      if (!success) expect(await page.evaluate(() => window.selectionController.island.ui.toastText)).toBe('A wave is under way.');
      expect(await page.locator('dialog[open]').textContent()).not.toContain('A wave is under way.');
      await page.keyboard.press('Escape');
      expect(await page.locator('dialog[open]').count()).toBe(0);
      expect(await page.locator('.island-selection-level').textContent()).toBe('Level 1');
      expect(await page.evaluate(() => ({active: window.selectionController.island.active, spot: window.selectionController.island.selection.spotId}))).toEqual({active: false, spot: 'wall_2'});
    }
    expect(await page.evaluate(() => window.selectionController.island.island.spots.find(row => row.id === 'wall_1').level)).toBe(2);
    await page.locator('.island-selection-dock [data-focus=details]').click();
    await page.evaluate(() => window.selectionController.island.ui.close());
    expect(await page.locator('.island-selection-dock,dialog[open]').count()).toBe(0);
    await page.evaluate(() => { window.selectionController.cleanups.forEach(stop => stop()); window.selectionController.island.dispose(); });
  });
});
