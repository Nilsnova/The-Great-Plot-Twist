// Actual native DOM/shared-frame/controller evidence on a local transport; no live recovery claim.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const browser = browserHarness();

it('keeps supplied healthy HP, real portrait and readable44px actions across desktop and phone', async () => {
  await browser.withPage(async page => {
    for (const viewport of [{width: 1280, height: 720}, {width: 375, height: 812}, {width: 320, height: 568}]) {
      await page.setViewportSize(viewport);
      const result = await page.evaluate(async () => {
        await window.g20Import('/src/ui/kit/kit.css');
        const {createIslandUi} = await window.g20Import('/src/island/ui.js'), {buildCardModel} = await window.g20Import('/src/island/card-model.js');
        const {getRasterFrame} = await window.g20Import('/src/art/village-raster.js');
        const ui = createIslandUi({container: document.body});
        const model = buildCardModel({spotId: 'wall_1', slot: 'wall', coins: 1000, movable: true,
          spot: {id: 'wall_1', kind: 'wall', built: true, level: 1, upgradeCost: 37}});
        // Deliberately supplied service-view values, not inferred from the building's Strength statistic.
        model.recovery = {status: 'ready', visible: false, actualHp: 60, maxHP: 60};
        ui.buildCard(model, {move() {}, upgrade() {}}, {dock: true}); window.selectionUi = ui;
        return {active: ui.active, hp: ui.selectionElement.querySelector('.island-selection-health').textContent, registered: getRasterFrame('island-wall')?.sheet.file ?? null};
      });
      expect(result).toMatchObject({active: false, hp: '60 / 60 HP'});
      await page.waitForFunction(() => !!document.querySelector('.island-selection-portrait canvas'));
      const source = await page.locator('.island-selection-portrait canvas').evaluate(canvas => canvas.villageArt ?? null);
      if (result.registered) expect(source).toMatchObject({id: 'island-wall', file: result.registered, source: 'png'});
      else expect(source).toBe(null); // Pinned dependency has no wall registration: explicitly procedural.
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

it('keeps pressed range and eligible upgrade distinct on the short phone', async () => {
  await browser.withPage(async page => {
    await page.setViewportSize({width: 320, height: 568});
    await page.evaluate(async () => {
      await window.g20Import('/src/ui/kit/kit.css');
      const {createIslandUi} = await window.g20Import('/src/island/ui.js');
      const {buildCardModel} = await window.g20Import('/src/island/card-model.js');
      const ui = createIslandUi({container: document.body});
      const model = buildCardModel({spotId: 'cannon_1', coins: 1000, movable: true,
        spot: {id: 'cannon_1', kind: 'cannon', built: true, level: 2}});
      model.coverage = {id: 'cannon_1', x: 0, z: 0, range: 38, targets: ['ships', 'boarders']};
      ui.buildCard(model, {move() {}, upgrade() {}, camera() {}}, {dock: true});
      window.shortSelection = {ui, house: coins => ui.buildCard(buildCardModel({spotId: 'house_2', coins, movable: true,
        spot: {id: 'house_2', kind: 'house', built: true, level: 1, upgradeCost: 100}}), {move() {}, upgrade() {}}, {dock: true})};
    });
    const range = page.getByRole('button', {name: 'Range', exact: true});
    const surface = locator => locator.evaluate(node => {
      const style = getComputedStyle(node);
      return [style.backgroundColor, style.backgroundImage];
    });
    await range.click();
    await page.mouse.move(1, 1);
    const pressed = await surface(range);
    await range.hover();
    expect(await range.getAttribute('aria-pressed')).toBe('true');
    expect(await surface(range)).toEqual(pressed);
    await range.click();
    expect(await surface(range)).not.toEqual(pressed);
    await page.evaluate(() => window.shortSelection.house(1000));
    const upgrade = page.getByRole('button', {name: 'Upgrade · 🪙 100', exact: true});
    expect(await upgrade.isEnabled()).toBe(true);
    await page.mouse.move(1, 1);
    const offered = await surface(upgrade);
    await upgrade.hover();
    const hovered = await surface(upgrade);
    expect(hovered[1]).toContain('linear-gradient');
    expect(hovered).not.toEqual(offered);
    await page.evaluate(() => window.shortSelection.house(0));
    expect(await upgrade.isDisabled()).toBe(true);
    expect(await surface(upgrade)).not.toEqual(offered);
    const bounds = await upgrade.boundingBox();
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
    await page.evaluate(() => window.shortSelection.ui.dispose());
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
