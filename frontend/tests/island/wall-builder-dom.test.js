// Real Chromium DOM and island pointer routing with a declared local construction transport, not SQL proof.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const browser = browserHarness();
async function wallPoint(page, x, z) {
  return page.evaluate(async ([x, z]) => {
    const {projectGround} = await window.g20Import('/src/world/projection.js');
    const {Vector3} = await window.g20Import('/node_modules/three/build/three.module.js');
    const {canvas, camera} = window.wallComponent, box = canvas.getBoundingClientRect(), foot = projectGround(x, z);
    const point = new Vector3(foot.x, foot.y, 0).project(camera);
    return {x: box.left + (point.x + 1) * box.width / 2, y: box.top + (1 - point.y) * box.height / 2};
  }, [x, z]);
}
async function installIsland(page, holdBuild = false, {offers = true, admitted = false} = {}) {
  await page.evaluate(async ({holdBuild, offers, admitted}) => {
      const THREE = await window.g20Import('/node_modules/three/build/three.module.js');
      const {createIsland} = await window.g20Import('/src/island/index.js'), {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
      const fake = createFakeIslandTransport({version: 2}); let current = admitted ? {...(await fake.get('/api/island')).data, layout: {movable: true, version: 2, wallRuleVersion: 1, wallCapacity: 128}} : null, epoch = '11111111-1111-4111-8111-111111111111'; window.wallPosted = [];
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
      const island = createIsland({container, mode: 'fake', transport, perimeterWallsOn: () => offers, on: (name, handler) => {listeners.set(name, handler); return () => listeners.delete(name);}, emit: () => {}, storage: null, search: ''});
      await island.load(); const camera = new THREE.OrthographicCamera(-30, 30, 20, -20, .1, 1000); camera.position.z = 100; camera.updateMatrixWorld();
      const cleanups = [], place = {group: new THREE.Group(), zones: [], colliders: [], update() {}};
      island.decorate(place, {}, cleanups, {canvas, camera, isActive: () => true}); island.toggleVillage();
      window.wallComponent = {island, canvas, camera, place, travel: () => listeners.get('travel')?.({to: 'saltreach_harbor'}), cleanup: () => {cleanups.forEach(stop => stop()); island.dispose(); canvas.remove(); container.remove();}};
  }, {holdBuild, offers, admitted});
}
it('keeps actual quote/retry controls accessible and within both viewport widths', async () => {
  await browser.withPage(async page => {
    for (const size of [{width: 1280, height: 720}, {width: 375, height: 812}]) {
      await page.setViewportSize(size);
      const result = await page.evaluate(async () => {
        await window.g20Import('/src/ui/kit/kit.css'); // Match the game's real 17px button font/tokens.
        await window.g20Import('/src/island/island.css'); const {createWallBuilderBar} = await window.g20Import('/src/island/wall-builder-bar.js');
        const calls = [], handlers = Object.fromEntries(['open', 'quote', 'confirm', 'undo', 'clear', 'cancel', 'camera'].map(key => [key, () => calls.push(key)]));
        const bar = createWallBuilderBar({container: document.body, handlers});
        const model = {cells: [{x: 1, z: 6}], phase: 'ready', busy: false, status: 'Draft moved. Get the price to check these positions.', quote: {totalCost: 10, remaining: 127}};
        bar.render(model); const submit = [...bar.element.querySelectorAll('button')].find(button => button.textContent === 'Build for 10 coins'); submit.click();
        const closed = bar.element.getBoundingClientRect().toJSON(); bar.element.querySelector('details').open = true;
        const expanded = bar.element.getBoundingClientRect().toJSON();
        const buttons = [...bar.element.querySelectorAll('button')].filter(button => button.getClientRects().length).map(button => {
          const r = button.getBoundingClientRect(), style = getComputedStyle(button), range = document.createRange(); range.selectNodeContents(button);
          const text = range.getBoundingClientRect(), left = r.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft),
            right = r.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
          return {label: button.textContent, textFits: text.left >= left - .5 && text.right <= right + .5 && button.scrollWidth <= button.clientWidth,
            width: r.width, height: r.height, inside: r.left >= 0 && r.right <= innerWidth,
          hit: button.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2))}; });
        bar.render({...model, phase: 'unknown'}); const undo = bar.element.querySelector('[aria-label="Remove last"]');
        const unknown = {label: submit.textContent, disabled: undo.disabled, live: bar.element.querySelector('[role=status]').getAttribute('aria-live')};
        const copy = bar.element.textContent; bar.dispose(); return {calls, buttons, unknown, copy, closed, expanded};
      });
      expect(result.calls).toEqual(['confirm']); expect(result.buttons.every(button => button.inside && button.width >= 44 && button.height >= 44)).toBe(true);
      expect(result.buttons.every(button => button.hit)).toBe(true);
      for (const button of result.buttons) expect(button.textFits, `Visible label: ${button.label}`).toBe(true);
      if (size.width === 1280) {
        expect(result.closed.width).toBeGreaterThanOrEqual(800); expect(result.closed.width).toBeLessThanOrEqual(1000);
        expect(result.closed.height).toBeLessThanOrEqual(200); expect(result.expanded.height).toBeLessThanOrEqual(250);
      }
      expect(result.unknown).toEqual({label: 'Check previous build', disabled: true, live: 'polite'}); expect(result.copy).toContain('Wall slots remaining: 127');
    }
  });
});
it('routes an actual canvas tap through the island builder, quotes, confirms and exits cleanly', async () => {
  await browser.withPage(async page => {
    await page.setViewportSize({width: 1280, height: 720});
    await installIsland(page);
    await page.getByRole('button', {name: 'Build walls', exact: true}).click();
    await page.waitForFunction(() => window.wallComponent.island.wallBuilder.state?.phase === 'draft');
    const point = await wallPoint(page, -14, -8);
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

it.each([{offers: false, admitted: false, shown: false}, {offers: true, admitted: false, shown: true},
  {offers: false, admitted: true, shown: true}])('shows wall entry only for real offers or an admitted island: %j', async setup => {
  await browser.withPage(async page => {
    await installIsland(page, false, setup);
    expect(await page.getByRole('button', {name: 'Build walls', exact: true}).count()).toBe(setup.shown ? 1 : 0);
    expect(await page.evaluate(() => window.wallPosted.length)).toBe(0);
    await page.evaluate(() => window.wallComponent.cleanup());
  });
});

it('fine-positions an unpaid draft with visible 44px phone controls and a new quote', async () => {
  await browser.withPage(async page => {
    await page.setViewportSize({width: 375, height: 812});
    await page.evaluate(() => document.documentElement.style.setProperty('--narrator-card-height', '120px'));
    await installIsland(page); await page.getByRole('button', {name: 'Build walls', exact: true}).click();
    await page.waitForFunction(() => window.wallComponent.island.wallBuilder.state?.phase === 'draft');
    const point = await wallPoint(page, -14, -8);
    await page.mouse.click(point.x, point.y); await page.keyboard.press('ArrowRight');
    await page.getByRole('button', {name: 'Get price', exact: true}).click();
    const details = page.locator('.wall-builder-fine'), summary = details.locator('summary');
    expect(await details.evaluate(element => element.open)).toBe(false);
    const before = await page.locator('.island-wall-builder').boundingBox();
    await summary.focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('.island-wall-builder').classList.contains('has-fine-position'));
    expect(await page.evaluate(() => window.wallPosted.length)).toBe(0); // native summary Enter never confirms a ready purchase
    const geometry = await page.evaluate(() => {
      const bar = document.querySelector('.island-wall-builder'), r = bar.getBoundingClientRect();
      const buttons = [...bar.querySelectorAll('.wall-builder-fine-pad button')].map(button => {const box = button.getBoundingClientRect(); return {
        width: box.width, height: box.height, inside: box.left >= 0 && box.right <= innerWidth,
        hit: button.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2))};});
      return {height: r.height, top: r.top, bottom: r.bottom, buttons};
    });
    expect(geometry.height).toBeGreaterThan(before.height); expect(geometry.height).toBeLessThanOrEqual(340);
    expect(geometry.top).toBeGreaterThanOrEqual(0); expect(geometry.bottom).toBeLessThanOrEqual(812 - 120);
    expect(geometry.buttons.every(button => button.width >= 44 && button.height >= 44 && button.inside && button.hit)).toBe(true);
    await page.getByRole('button', {name: 'Shift draft one square east', exact: true}).click();
    expect(await page.evaluate(() => window.wallComponent.island.wallBuilder.state)).toMatchObject({cells: [{x: -13.5, z: -8}, {x: -11.5, z: -8}], phase: 'draft', quote: null});
    expect(await page.locator('.wall-builder-anchors').textContent()).toContain('First: -13.5, -8');
    expect(await page.locator('.island-wall-builder [role=status]').textContent()).toContain('Draft moved.');
    expect(await page.getByRole('button', {name: 'Get price', exact: true}).count()).toBe(1);
    await page.getByRole('button', {name: 'Clear', exact: true}).click();
    expect(await page.locator('.wall-builder-anchors').textContent()).toBe('Tap a square first.');
    expect(await page.getByRole('button', {name: 'Shift draft one square east', exact: true}).isDisabled()).toBe(true);
    await page.evaluate(() => window.wallComponent.island.handleEscape());
    await page.getByRole('button', {name: 'Build walls', exact: true}).click();
    expect(await details.evaluate(element => element.open)).toBe(false); await page.evaluate(() => window.wallComponent.cleanup());
  });
});

it('retains phone quote/refusal/pending information with scrollable tools and land above the measured panel', async () => {
  await browser.withPage(async page => {
    for (const size of [{width: 375, height: 812}, {width: 320, height: 568}]) {
      await page.setViewportSize(size);
      await page.evaluate(async () => {
        await window.g20Import('/src/island/island.css');
        const {createWallBuilderBar} = await window.g20Import('/src/island/wall-builder-bar.js');
        document.documentElement.style.setProperty('--narrator-card-height', '120px');
        const bar = createWallBuilderBar({container: document.body, handlers: {cancel() {}}});
        window.workspaceBar = bar;
      });
      for (const phase of ['draft', 'ready', 'refused', 'building', 'unknown']) {
        const result = await page.evaluate(async phase => {
          const bar = window.workspaceBar, quoted = ['ready', 'building', 'unknown'].includes(phase);
          const status = phase === 'refused' ? 'That position overlaps another building. Move the draft, then get the price again.'
            : phase === 'unknown' ? 'Build outcome unknown. Retry the same build to check it.' : 'Draft moved. Get the price to check these positions.';
          bar.render({cells: [{x: -18.5, z: 2}, {x: -18.5, z: 0}], phase, busy: phase === 'building', status,
            quote: quoted ? {totalCost: 20, remaining: 126} : null});
          bar.element.querySelector('details').open = true;
          const rect = bar.element.getBoundingClientRect();
          const THREE = await window.g20Import('/node_modules/three/build/three.module.js');
          const {createCamera} = await window.g20Import('/src/player/camera.js'), {worldViewport} = await window.g20Import('/src/pixel/display.js');
          const {cliffProfile} = await window.g20Import('/src/art/coast-cliffs.js'), {surfaces} = await window.g20Import('/src/world/places/surfaces.js');
          const {projectLegacyGround} = await window.g20Import('/src/world/projection.js');
          const view = createCamera({pointer: {wheel: 0}}), player = {x: 0, z: 2};
          Object.assign(view.camera, worldViewport(innerWidth, innerHeight, 22, 16)); view.camera.updateProjectionMatrix();
          view.setPlace('home_islet', player); view.start(true);
          view.setVillageView(true, {height: innerHeight, top: 100, bottom: innerHeight - rect.top + 12});
          view.villageControl('fit'); view.update(.05, player);
          view.camera.updateMatrixWorld();
          const landBottom = Math.max(...cliffProfile(surfaces.home_islet).flatMap(p => [p.y, p.baseY].map(y => {
            const at = projectLegacyGround(p.x, -y);
            return (1 - new THREE.Vector3(at.x, at.y, 0).project(view.camera).y) * innerHeight / 2;
          })));
          return {height: rect.height, bottom: rect.bottom, top: rect.top, landBottom, status: bar.element.querySelector('[role=status]').textContent,
            hint: bar.element.querySelector('.wall-builder-hint').hidden, price: bar.element.querySelector('.wall-builder-price').hidden,
            quoted: bar.element.querySelector('.wall-builder-price').textContent, classes: bar.element.className};
        }, phase);
        expect(result.height).toBeLessThanOrEqual(340); expect(result.top).toBeGreaterThanOrEqual(100);
        expect(result.bottom).toBeLessThanOrEqual(size.height - 120); expect(result.landBottom).toBeLessThan(result.top - 12);
        expect(result.hint).toBe(!['building', 'unknown'].includes(phase)); expect(result.price).toBe(!['ready', 'building', 'unknown'].includes(phase));
        if (!result.price) {expect(result.quoted).toContain('Total: 20 coins'); expect(result.classes).toContain('has-wall-quote');}
        if (!result.hint) {expect(await page.locator('.wall-builder-hint').textContent()).toContain('Closing does not cancel'); expect(result.classes).toContain('has-wall-warning');}
        if (phase === 'refused') expect(result.status).toContain('overlaps another building');
        const buttons = page.locator('.island-wall-builder button:enabled');
        for (let i = 0; i < await buttons.count(); i++) {
          const button = buttons.nth(i); await button.scrollIntoViewIfNeeded();
          const hit = await button.evaluate(element => {const r = element.getBoundingClientRect(); return {width: r.width, height: r.height,
            inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight - 120,
            hit: element.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2))};});
          expect(hit.width).toBeGreaterThanOrEqual(44); expect(hit.height).toBeGreaterThanOrEqual(44); expect(hit.inside && hit.hit).toBe(true);
        }
      }
      await page.evaluate(() => window.workspaceBar.dispose());
    }
  });
});
