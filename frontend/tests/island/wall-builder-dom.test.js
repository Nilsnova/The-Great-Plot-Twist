// Real Chromium DOM and island pointer routing with a declared local construction transport, not SQL proof.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const browser = browserHarness();
it('keeps actual quote/retry controls accessible and within both viewport widths', async () => {
  await browser.withPage(async page => {
    for (const size of [{width: 1280, height: 720}, {width: 375, height: 812}]) {
      await page.setViewportSize(size);
      const result = await page.evaluate(async () => {
        await window.g20Import('/src/island/island.css'); const {createWallBuilderBar} = await window.g20Import('/src/island/wall-builder-bar.js');
        const calls = [], handlers = Object.fromEntries(['open', 'quote', 'confirm', 'undo', 'clear', 'cancel', 'camera'].map(key => [key, () => calls.push(key)]));
        const bar = createWallBuilderBar({container: document.body, handlers});
        const model = {cells: [{x: 1, z: 6}], phase: 'ready', busy: false, status: 'Positions checked.', quote: {totalCost: 10, remaining: 127}};
        bar.render(model); const submit = [...bar.element.querySelectorAll('button')].find(button => button.textContent === 'Build for 10 coins'); submit.click();
        const buttons = [...bar.element.querySelectorAll('button')].map(button => { const r = button.getBoundingClientRect(); return {width: r.width, height: r.height, inside: r.left >= 0 && r.right <= innerWidth}; });
        bar.render({...model, phase: 'unknown'}); const undo = [...bar.element.querySelectorAll('button')].find(button => button.textContent === 'Undo');
        const unknown = {label: submit.textContent, disabled: undo.disabled, live: bar.element.querySelector('[role=status]').getAttribute('aria-live')};
        const copy = bar.element.textContent; bar.dispose(); return {calls, buttons, unknown, copy};
      });
      expect(result.calls).toEqual(['confirm']); expect(result.buttons.every(button => button.inside && button.width >= 44 && button.height >= 44)).toBe(true);
      expect(result.unknown).toEqual({label: 'Check previous build', disabled: true, live: 'polite'}); expect(result.copy).toContain('Remaining after building: 127');
    }
  });
});
it('routes an actual canvas tap through the island builder, quotes, confirms and exits cleanly', async () => {
  await browser.withPage(async page => {
    await page.setViewportSize({width: 1280, height: 720});
    await page.evaluate(async () => {
      const THREE = await window.g20Import('/node_modules/three/build/three.module.js');
      const {createIsland} = await window.g20Import('/src/island/index.js'), {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
      const fake = createFakeIslandTransport({version: 2}); let current = null; window.wallPosted = [];
      const transport = {dev: fake.dev, get: path => path === '/api/island' && current ? Promise.resolve({ok: true, data: current}) : fake.get(path),
        async post(path, body) {
          if (path === '/api/island/walls/enable') { current ??= (await fake.get('/api/island')).data; current = {...current, layout: {...current.layout, wallRuleVersion: 1, wallCapacity: 128}}; return {ok: true, data: current}; }
          if (path === '/api/island/walls/quote') return {ok: true, data: {placements: body.cells.map((cell, i) => ({spot: `wall_${i + 1}`, ...cell})), unitCost: 10, totalCost: body.cells.length * 10, remaining: 128 - body.cells.length, wallRuleVersion: 1, wallCapacity: 128}};
          if (path === '/api/island/walls/build') { window.wallPosted.push(body); current = {...current, coins: current.coins - body.quotedTotal, spots: current.spots.map(spot => {const p = body.placements.find(row => row.spot === spot.id); return p ? {...spot, built: true, ...p} : spot;})}; return {ok: true, data: {receipt: {...body, totalCost: body.quotedTotal, repeat: false}, island: current}}; }
          return fake.post(path, body);
        }};
      const canvas = document.createElement('canvas'); canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh'; document.body.append(canvas);
      const container = document.createElement('div'); document.body.append(container);
      const island = createIsland({container, mode: 'fake', transport, on: () => () => {}, emit: () => {}, storage: null, search: ''});
      await island.load(); const camera = new THREE.OrthographicCamera(-30, 30, 20, -20, .1, 1000); camera.position.z = 100; camera.updateMatrixWorld();
      const cleanups = [], place = {group: new THREE.Group(), zones: [], colliders: [], update() {}};
      island.decorate(place, {}, cleanups, {canvas, camera, isActive: () => true}); island.toggleVillage();
      window.wallComponent = {island, canvas, camera, place, cleanup: () => {cleanups.forEach(stop => stop()); island.dispose(); canvas.remove(); container.remove();}};
    });
    await page.getByRole('button', {name: 'Build walls', exact: true}).click();
    await page.waitForFunction(() => window.wallComponent.island.wallBuilder.state?.phase === 'draft');
    const point = await page.evaluate(() => {const {canvas} = window.wallComponent, r = canvas.getBoundingClientRect(); return {x: r.left + (1 - 14 / 30) * r.width / 2, y: r.top + (1 - 5.76 / 20) * r.height / 2};});
    await page.mouse.click(point.x, point.y); await page.keyboard.press('ArrowRight');
    expect(await page.evaluate(() => window.wallComponent.island.wallBuilder.state.cells)).toEqual([{x: -14, z: -8}, {x: -12, z: -8}]);
    await page.getByRole('button', {name: 'Get price', exact: true}).click(); await page.getByRole('button', {name: 'Build for 20 coins', exact: true}).click();
    await page.waitForFunction(() => !window.wallComponent.island.wallBuilder.active);
    expect(await page.evaluate(() => window.wallPosted[0].placements)).toEqual([{spot: 'wall_1', x: -14, z: -8}, {spot: 'wall_2', x: -12, z: -8}]);
    expect(await page.locator('.island-village-mode:not([hidden])').count()).toBe(1);
    await page.evaluate(() => window.wallComponent.cleanup());
  });
});
