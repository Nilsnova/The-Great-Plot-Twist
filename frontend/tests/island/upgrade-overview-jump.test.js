import {join} from 'node:path';
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';

const browser = browserHarness();
const expectedSpot = 'cannon_8';

it.each([
  {device: 'desktop', viewport: {width: 1280, height: 720}, isMobile: false, hasTouch: false},
  {device: 'phone', viewport: {width: 375, height: 812}, isMobile: true, hasTouch: true},
])('finds the accepted extra tower from its overview row on $device', async ({device, ...context}) => {
  await browser.withPage(async (page, base) => {
    const press = button => context.hasTouch ? button.tap() : button.press('Enter');
    const screenshot = async stage => {
      if (process.env.SHOTS_DIR) {
        await page.locator('.hud-arrival').waitFor({state: 'hidden'});
        await page.waitForFunction(() => !document.querySelector('.u-toast'));
        await page.screenshot({path: join(process.env.SHOTS_DIR, `${device}-${stage}.png`)});
      }
    };
    await page.addInitScript(() => {
      localStorage.setItem('plot_twist_front_door_v1', '1');
      localStorage.setItem('plot_twist_island_arrival_v1', '1');
      localStorage.setItem('tgpt:tutorials:v1', JSON.stringify({version: 1, guided: true, seen: [], games: {}}));
    });
    await page.goto(`${base}/?islands=fake&fakeplayer=overview-navigation&fakeflags=more_tower_spots,defenses_v2`);
    await page.addScriptTag({type: 'module', content: 'window.g20Import = path => import(path);'});
    await page.waitForFunction(() => typeof window.g20Import === 'function');
    await press(page.locator('#play'));
    await press(page.getByRole('button', {name: 'Create a game', exact: true}));
    await press(page.getByRole('button', {name: 'Start', exact: true}));
    await page.waitForFunction(() => window.__island?.waves && !document.querySelector('dialog[open]'));
    const accepted = await page.evaluate(async id => {
      const game = window.__island, island = game.island;
      const {setPreferences} = await window.g20Import('/src/settings/preferences.js');
      const {checkMove, positionsOf} = await window.g20Import('/src/island/placement.js');
      setPreferences({tutorials: false, narrator: false, reducedMotion: true});
      island.dev.setWaveBest(30);
      island.dev.setCoins(5000);
      await island.refreshDefended();
      for (const spot of ['cannon_1', id]) {
        if (!(await island.api.build({spot, kind: 'cannon'})).ok) throw new Error(`Could not build ${spot}`);
      }
      if (!(await island.api.upgrade({spot: id})).ok) throw new Error('Could not upgrade the extra tower');
      await island.refreshDefended();
      const spots = positionsOf(island.island.spots), old = spots[id];
      const move = [{x: old.x, z: old.z + 3}, {x: old.x - 3, z: old.z}, {x: old.x + 3, z: old.z}]
        .find(({x, z}) => checkMove(id, x, z, spots).ok);
      if (!move || !(await island.api.move({spot: id, ...move})).ok) throw new Error('Could not move the accepted extra tower');
      await island.refreshDefended();
      const original = island.island;
      window.overviewWrites = [];
      for (const write of ['build', 'upgrade', 'move']) {
        const send = island.api[write];
        island.api[write] = (...args) => { window.overviewWrites.push(write); return send(...args); };
      }
      return {coins: original.coins, spot: original.spots.find(row => row.id === id)};
    }, expectedSpot);

    await page.keyboard.press('Escape');
    await press(page.getByRole('button', {name: 'Base overview', exact: true}));
    const overview = page.getByRole('dialog', {name: 'Base overview'});
    const action = overview.getByRole('button', {name: 'Find Cannon at tower 8', exact: true});
    await action.waitFor();
    const old = await action.elementHandle();
    await page.evaluate(() => window.__island.island.setBattle(true));
    expect(await overview.getByRole('button', {name: /^Find Cannon/}).count()).toBe(0);
    await old.evaluate(button => button.click());
    expect(await overview.isVisible()).toBe(true);
    expect(await page.evaluate(() => window.__island.island.managing)).toBe(false);
    await page.evaluate(() => window.__island.island.setBattle(false));
    await action.focus();
    await page.evaluate(() => window.__island.island.refreshDefended());
    expect(await action.evaluate(button => document.activeElement === button)).toBe(true);
    expect((await action.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await screenshot('overview');
    await press(action);

    const selection = page.getByRole('region', {name: 'Selected building'});
    await selection.waitFor();
    expect(await selection.getByText('Cannon', {exact: true}).isVisible()).toBe(true);
    expect(await selection.getByText('Level 2', {exact: true}).isVisible()).toBe(true);
    expect(await selection.getByRole('button', {name: 'Close', exact: true})
      .evaluate(button => document.activeElement === button)).toBe(true);
    await page.waitForFunction(async spot => {
      const g = window.__island;
      const {projectGround} = await window.g20Import('/src/world/projection.js');
      const canvas = g.renderer.domElement.getBoundingClientRect();
      const foot = projectGround(spot.x, spot.z);
      const projected = g.player.position.clone().set(foot.x, foot.y + 1, 0).project(g.camera);
      const x = canvas.left + (projected.x + 1) * canvas.width / 2;
      const y = canvas.top + (1 - projected.y) * canvas.height / 2;
      return x > 12 && x < canvas.right - 12 && y > 80
        && y < document.querySelector('.island-selection-dock').getBoundingClientRect().top;
    }, accepted.spot);
    const result = await page.evaluate(id => {
      const island = window.__island.island, snapshot = island.island;
      return {anchor: island.selection, spot: snapshot.spots.find(row => row.id === id), coins: snapshot.coins,
        writes: window.overviewWrites, overflow: document.documentElement.scrollWidth > innerWidth};
    }, expectedSpot);
    expect(result.anchor).toMatchObject({spotId: expectedSpot, x: accepted.spot.x, z: accepted.spot.z, level: 2});
    expect(result.spot).toEqual(accepted.spot);
    expect(result.coins).toBe(accepted.coins);
    expect(result.writes).toEqual([]);
    expect(result.overflow).toBe(false);
    await screenshot('selected');
  }, context);
}, 60000);
