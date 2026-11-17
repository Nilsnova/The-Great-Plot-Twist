// Real Chromium DOM and island pointer routing with a declared local construction transport, not SQL proof.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const browser = browserHarness();
async function installIsland(page, holdBuild = false) {
  await page.evaluate(async holdBuild => {
      const THREE = await window.g20Import('/node_modules/three/build/three.module.js');
      const {createIsland} = await window.g20Import('/src/island/index.js'), {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
      const fake = createFakeIslandTransport({version: 2}); let current = null, epoch = '11111111-1111-4111-8111-111111111111'; window.wallPosted = [];
      const transport = {dev: fake.dev, get: path => path === '/api/island' && current ? Promise.resolve({ok: true, data: current}) : fake.get(path),
        async post(path, body) {
          if (path === '/api/island/walls/enable') { current ??= (await fake.get('/api/island')).data; current = {...current, layout: {...current.layout, wallRuleVersion: 1, wallCapacity: 128}}; return {ok: true, data: current}; }
          if (path === '/api/island/walls/quote') return {ok: true, data: {islandEpoch: epoch, placements: body.cells.map((cell, i) => ({spot: `wall_${i + 1}`, ...cell})), unitCost: 10, totalCost: body.cells.length * 10, remaining: 128 - body.cells.length, wallRuleVersion: 1, wallCapacity: 128}};
          if (path === '/api/island/walls/build') { window.wallPosted.push(body); current = {...current, coins: current.coins - body.quotedTotal, spots: current.spots.map(spot => {const p = body.placements.find(row => row.spot === spot.id); return p ? {...spot, built: true, ...p} : spot;})}; const response = {ok: true, data: {receipt: {...body, totalCost: body.quotedTotal, repeat: false}, island: structuredClone(current)}}; if (holdBuild) {holdBuild = false; return new Promise(resolve => {window.wallReleaseBuild = () => resolve(response);});} return response; }
          if (path === '/api/island/fresh-start') {const answer = await fake.post(path, body); if (answer.ok) {epoch = '22222222-2222-4222-8222-222222222222'; current = {...(await fake.get('/api/island')).data, layout: {movable: true, version: 2, wallRuleVersion: 1, wallCapacity: 128}};} return answer;}
          return fake.post(path, body);
        }};
      const canvas = document.createElement('canvas'); canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh'; document.body.append(canvas);
      const container = document.createElement('div'); document.body.append(container);
      const listeners = new Map();
      const island = createIsland({container, mode: 'fake', transport, on: (name, handler) => {listeners.set(name, handler); return () => listeners.delete(name);}, emit: () => {}, storage: null, search: ''});
      await island.load(); const camera = new THREE.OrthographicCamera(-30, 30, 20, -20, .1, 1000); camera.position.z = 100; camera.updateMatrixWorld();
      const cleanups = [], place = {group: new THREE.Group(), zones: [], colliders: [], update() {}};
      island.decorate(place, {}, cleanups, {canvas, camera, isActive: () => true}); island.toggleVillage();
      window.wallComponent = {island, canvas, camera, place, travel: () => listeners.get('travel')?.({to: 'saltreach_harbor'}), cleanup: () => {cleanups.forEach(stop => stop()); island.dispose(); canvas.remove(); container.remove();}};
  }, holdBuild);
}
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
        bar.render({...model, phase: 'unknown'}); const undo = [...bar.element.querySelectorAll('button')].find(button => button.textContent === 'Remove last');
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
    await installIsland(page);
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

it('invalidates an old pending wall session after a confirmed same-code reset without an island epoch field', async () => {
  await browser.withPage(async page => {
    await page.setViewportSize({width: 1280, height: 720}); await installIsland(page, true);
    const result = await page.evaluate(async () => {
      const {island} = window.wallComponent; await island.startWalls(); island.wallBuilder.tap(-14, -8); await island.wallBuilder.quote();
      const oldCode = island.island.code, missingEpoch = island.island.islandEpoch === undefined;
      const pending = island.wallBuilder.confirm();
      const reset = await island.resetIsland(oldCode); island.toggleVillage(); await island.startWalls();
      const before = island.wallBuilder.state?.phase; window.wallReleaseBuild(); await pending;
      return {reset: reset.ok, sameCode: island.island.code === oldCode, missingEpoch, before, after: island.wallBuilder.state?.phase,
        oldWallRestored: island.island.spots.find(spot => spot.id === 'wall_1')?.built === true, posted: window.wallPosted.length};
    });
    expect(result).toEqual({reset: true, sameCode: true, missingEpoch: true, before: 'draft', after: 'draft', oldWallRestored: false, posted: 1});
    await page.evaluate(() => window.wallComponent.cleanup());
  });
});

it.each(['travel', 'dispose'])('prevents an old pending reply from reopening the builder after %s', async action => {
  await browser.withPage(async page => {
    await installIsland(page, true);
    const result = await page.evaluate(async action => {
      const component = window.wallComponent, island = component.island;
      await island.startWalls(); island.wallBuilder.tap(-14, -8); await island.wallBuilder.quote();
      const pending = island.wallBuilder.confirm();
      if (action === 'travel') component.travel(); else island.dispose();
      window.wallReleaseBuild(); await pending;
      return {active: island.wallBuilder.active, paintedOldWall: island.island.spots.find(spot => spot.id === 'wall_1')?.built === true};
    }, action);
    expect(result).toEqual({active: false, paintedOldWall: false}); await page.evaluate(() => window.wallComponent.cleanup());
  });
});
