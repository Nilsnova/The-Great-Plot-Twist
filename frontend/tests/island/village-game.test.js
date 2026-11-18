// Real game/controller/picking against the existing fake island transport, not live services.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const browser = browserHarness();

async function ready(page, base, phone) {
  await page.setViewportSize(phone ? {width: 375, height: 812} : {width: 1280, height: 720});
  await page.addInitScript(() => {
    localStorage.setItem('plot_twist_front_door_v1', '1');
    localStorage.setItem('plot_twist_island_arrival_v1', '1');
    localStorage.setItem('tgpt:tutorials:v1', JSON.stringify({version: 1, guided: true, seen: [], games: {}}));
  });
  await page.goto(`${base}/?islands=fake&fakeplayer=coc49-test`);
  // Navigating from the component harness clears its module helper; install it in the actual game document.
  await page.addScriptTag({type: 'module', content: 'window.g20Import = path => import(path);'});
  await page.waitForFunction(() => typeof window.g20Import === 'function');
  await page.locator('#play').click();
  await page.getByRole('button', {name: 'Create a game', exact: true}).click();
  await page.getByRole('button', {name: 'Start', exact: true}).click();
  await page.waitForFunction(() => window.__island?.waves && !document.querySelector('dialog[open]'));
  await page.evaluate(async () => {
    const g = window.__island;
    await g.island.build('cannon_1', 'cannon');
    g.player.position.set(-7, 1.03, -11); g.view.setPlace('home_islet', g.player.position);
    g.renderer.domElement.focus();
  });
}
async function pickCannon(page) {
  const at = await page.evaluate(async () => {
    const g = window.__island, rect = g.renderer.domElement.getBoundingClientRect();
    const {projectGround} = await window.g20Import('/src/world/projection.js');
    const {placedSpot} = await window.g20Import('/src/island/spots.js');
    const spot = placedSpot('cannon_1', g.island.island.spots), foot = projectGround(spot.x, spot.z);
    const point = g.player.position.clone().set(foot.x, foot.y + .7, 0).project(g.camera);
    return {x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2};
  });
  await page.mouse.click(at.x, at.y);
}
async function manage(page) {
  await page.keyboard.press('Escape');
  await page.getByRole('button', {name: 'Manage village', exact: true}).click();
  await page.locator('.island-village-mode:not([hidden])').waitFor();
  // D064 phone Work is pannable; use the real whole-island view for a remote edge tower.
  await page.getByRole('button', {name: 'Fit village', exact: true}).click();
  const fit = await page.evaluate(async () => {
    const g = window.__island, {villageFrame} = await window.g20Import('/src/player/camera.js');
    const canvas = g.renderer.domElement.getBoundingClientRect(), bar = document.querySelector('.island-village-mode:not([hidden])').getBoundingClientRect();
    const quest = document.querySelector('.quest-strip')?.getBoundingClientRect(), purse = document.querySelector('.hud-coins')?.getBoundingClientRect();
    const top = Math.max(80, (canvas.width < 640 ? Math.max(quest?.bottom ?? 0, purse?.bottom ?? 0) : 80) + 12);
    return villageFrame(g.camera, 'home_islet', {height: canvas.height, top, bottom: canvas.height - bar.top + 12});
  });
  await page.waitForFunction(fit => {
    const camera = window.__island.camera;
    return Math.abs(camera.zoom - fit.zoom) < .005 && Math.abs(camera.position.x - fit.x) < .05 && Math.abs(camera.position.y - fit.y) < .05;
  }, fit);
}

it.each([false, true])('explicit management selects remotely, holds captain input and exits at reservation (phone=%s)', async phone => {
  await browser.withPage(async (page, base) => {
    await ready(page, base, phone);
    await pickCannon(page);
    expect(await page.locator('.island-card-build[open]').count()).toBe(0); // Explore still needs a walk up.
    await manage(page);
    if (!phone) {
      await page.evaluate(() => window.__island.renderer.domElement.focus());
      await page.keyboard.press('KeyE');
      const finder = page.getByRole('combobox', {name: 'Find building'});
      expect(await finder.evaluate(node => document.activeElement === node)).toBe(true);
      const close = page.getByRole('region', {name: 'Selected building'}).getByRole('button', {name: 'Close', exact: true});
      await page.keyboard.press('c');
      if (!await close.count()) await page.keyboard.press('Enter');
      await close.waitFor();
      await page.keyboard.press('Enter');
      await finder.waitFor();
    }
    const before = await page.evaluate(() => ({x: window.__island.player.position.x, z: window.__island.player.position.z}));
    await page.keyboard.down('KeyD');
    await page.evaluate(() => new Promise(resolve => { let n = 0; function frame() { if (++n === 12) resolve(); else requestAnimationFrame(frame); } requestAnimationFrame(frame); }));
    await page.keyboard.up('KeyD');
    expect(await page.evaluate(() => ({x: window.__island.player.position.x, z: window.__island.player.position.z}))).toEqual(before);
    await pickCannon(page);
    const selected = page.getByRole('region', {name: 'Selected building'});
    await selected.waitFor();
    expect(await selected.locator('.island-selection-title').textContent()).toBe('Cannon');
    await selected.getByRole('button', {name: 'Move', exact: true}).click();
    await page.locator('.island-move-bar:not([hidden])').waitFor();
    const cell = await page.evaluate(() => {
      const input = document.createElement('input'); input.id = 'coc49-focus-probe'; document.body.append(input); input.focus();
      return window.__island.island.moving;
    });
    await page.keyboard.press('ArrowRight');
    expect(await page.evaluate(() => window.__island.island.moving)).toEqual(cell);
    await page.evaluate(() => { document.querySelector('#coc49-focus-probe').remove(); window.__island.renderer.domElement.focus(); });
    const savedSpot = await page.evaluate(() => window.__island.island.island.spots.find(spot => spot.id === 'cannon_1'));
    await page.evaluate(() => window.__island.island.moveMode.nudge(0, 1));
    await page.locator('.island-move-cancel').focus();
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => window.__island.island.island.spots.find(spot => spot.id === 'cannon_1'))).toEqual(savedSpot);
    await page.evaluate(() => { window.__island.island.startMove('cannon_1'); window.__island.renderer.domElement.focus(); });
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => window.__island.island.managing)).toBe(true);
    expect(await page.locator('.island-move-bar:not([hidden])').count()).toBe(0);
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => window.__island.island.managing)).toBe(false);
    await manage(page);
    await page.evaluate(() => {
      const island = window.__island.island, read = island.api.getIsland, start = island.api.startWave;
      const held = new Promise(resolve => { window.coc49ReleasePrepare = resolve; });
      window.coc49Accepted = false; window.coc49Preparing = false; window.coc49RingDone = false;
      island.api.startWave = async args => { const answer = await start(args); window.coc49Accepted = answer.ok; return answer; };
      island.api.getIsland = async () => { window.coc49Preparing = true; await held; return read(); };
      island.startMove('cannon_1');
      window.coc49Ring = island.ringBell().then(answer => { window.coc49RingDone = true; return answer; });
      window.coc49RestoreRead = () => { island.api.getIsland = read; };
    });
    await page.waitForFunction(() => window.coc49Accepted && window.coc49Preparing);
    expect(await page.evaluate(() => ({active: window.__island.island.managing, done: window.coc49RingDone,
      moving: window.__island.island.moving, current: window.__island.island.flow.current})))
      .toEqual({active: false, done: false, moving: null, current: null});
    expect(await page.locator('.island-village-mode:not([hidden])').count()).toBe(0);
    expect(await page.evaluate(() => window.__island.island.toggleVillage())).toBe(false);
    await pickCannon(page);
    expect(await page.locator('.island-card-build[open]').count()).toBe(0);
    expect(await selected.count()).toBe(0);
    expect(await page.evaluate(() => window.coc49RingDone)).toBe(false);
    const answer = await page.evaluate(async () => { window.coc49RestoreRead(); window.coc49ReleasePrepare(); return window.coc49Ring; });
    expect(answer.ok).toBe(true);
    expect(await page.evaluate(() => window.__island.island.managing)).toBe(false);
    await page.keyboard.press('Escape');
    expect(await page.getByRole('button', {name: 'Manage village', exact: true}).count()).toBe(0);
    expect(await page.getByRole('button', {name: 'Exit village mode', exact: true}).count()).toBe(0);
  });
}, 60000); // a long real-browser journey: ~17 s locally, too close to the harness's 20 s default

it('keeps the effective upgrade read-only and clears it when a new accepted answer has unknown crew', async () => {
  await browser.withPage(async (page, base) => {
    await ready(page, base, false);
    expect(await page.evaluate(async () => {
      const island = window.__island.island;
      const {setPreferences} = await window.g20Import('/src/settings/preferences.js');
      setPreferences({tutorials: false});
      const entered = island.toggleVillage();
      island.dev.setWaveBest(2);
      island.dev.setCoins(0);
      await island.refreshDefended();
      return entered;
    })).toBe(true);
    await page.getByRole('combobox', {name: 'Find building'}).selectOption('cannon_1');
    const selection = page.getByRole('region', {name: 'Selected building'});
    const saved = () => page.evaluate(() => {
      const {coins, spots} = window.__island.island.island;
      return {coins, spot: spots.find(row => row.id === 'cannon_1')};
    });
    const before = await saved();
    await selection.getByRole('button', {name: 'Details', exact: true}).click();
    const comparison = page.getByRole('region', {name: 'Next level comparison'});
    await comparison.waitFor();
    expect(await comparison.locator('dd').allTextContents()).toEqual(['28 → 31 units', '1.05 → 0.91 s', '10 → 16']);
    const upgrade = page.locator('.island-tree-detail [data-focus="upgrade"]');
    expect(await upgrade.isDisabled()).toBe(true);
    expect(await upgrade.textContent()).toContain(String(before.spot.upgradeCost));
    expect(await saved()).toEqual(before);

    await page.evaluate(async () => {
      const island = window.__island.island, read = island.api.getIsland;
      island.api.getIsland = async () => {
        const result = await read();
        return result.ok ? {...result, data: {...result.data, crew: null}} : result;
      };
      try { await island.refreshDefended(); } finally { island.api.getIsland = read; }
    });
    expect(await comparison.count()).toBe(0);
    expect(await page.locator('.island-tree-detail .island-skill-line').textContent()).toContain('Base stats');
    await page.evaluate(() => window.__island.island.refreshDefended());
    await comparison.waitFor();
    await page.keyboard.press('Escape');
    await selection.getByRole('button', {name: 'Details', exact: true}).waitFor();
    expect(await saved()).toEqual(before);
  });
}, 60000);
