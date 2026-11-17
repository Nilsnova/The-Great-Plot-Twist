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
  const at = await page.evaluate(() => {
    const g = window.__island, rect = g.renderer.domElement.getBoundingClientRect();
    const point = g.player.position.clone().set(-12.5, 14.5 * .72 + .7, 0).project(g.camera);
    return {x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2};
  });
  await page.mouse.click(at.x, at.y);
}
async function manage(page) {
  await page.keyboard.press('Escape');
  await page.getByRole('button', {name: 'Manage village', exact: true}).click();
  await page.locator('.island-village-mode:not([hidden])').waitFor();
}

it.each([false, true])('explicit management selects remotely, holds captain input and exits at reservation (phone=%s)', async phone => {
  await browser.withPage(async (page, base) => {
    await ready(page, base, phone);
    await pickCannon(page);
    expect(await page.locator('.island-card-build[open]').count()).toBe(0); // Explore still needs a walk up.
    await manage(page);
    const before = await page.evaluate(() => ({x: window.__island.player.position.x, z: window.__island.player.position.z}));
    await page.keyboard.down('KeyD');
    await page.evaluate(() => new Promise(resolve => { let n = 0; function frame() { if (++n === 12) resolve(); else requestAnimationFrame(frame); } requestAnimationFrame(frame); }));
    await page.keyboard.up('KeyD');
    expect(await page.evaluate(() => ({x: window.__island.player.position.x, z: window.__island.player.position.z}))).toEqual(before);
    await pickCannon(page);
    await page.locator('.island-card-build[open]').waitFor();
    await page.locator('.island-card-build[open] .island-move').click();
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
    expect(await page.evaluate(() => window.coc49RingDone)).toBe(false);
    const answer = await page.evaluate(async () => { window.coc49RestoreRead(); window.coc49ReleasePrepare(); return window.coc49Ring; });
    expect(answer.ok).toBe(true);
    expect(await page.evaluate(() => window.__island.island.managing)).toBe(false);
    await page.keyboard.press('Escape');
    expect(await page.getByRole('button', {name: 'Manage village', exact: true}).count()).toBe(0);
    expect(await page.getByRole('button', {name: 'Exit village mode', exact: true}).count()).toBe(0);
  });
}, 60000); // a long real-browser journey: ~17 s locally, too close to the harness's 20 s default
