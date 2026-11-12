// Full local game input with the existing fake server; no live login, API or room is used.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const evaluate = browserHarness();

async function openGame(page, base, phone) {
  await page.setViewportSize(phone ? {width: 375, height: 812} : {width: 1280, height: 720});
  await page.addInitScript(phone => {
    localStorage.setItem('plot_twist_front_door_v1', '1');
    localStorage.setItem('plot_twist_island_arrival_v1', '1');
    if (phone) Object.defineProperty(navigator, 'maxTouchPoints', {get: () => 1});
  }, phone);
  await page.goto(`${base}/?islands=fake&fakeplayer=t19-test`);
  await page.locator('#play').click();
  await page.locator('.games-card[open]').getByRole('button', {name: 'Create a game', exact: true}).click();
  await page.locator('.island-card-lobby[open]').getByRole('button', {name: 'Start', exact: true}).click();
  await page.waitForFunction(() => window.__island?.waves && !document.querySelector('dialog[open]'));
  await page.evaluate(() => {
    const g = window.__island, zone = g.world.current.zones.find(item => item.id === 'cannon_3');
    g.player.position.set(zone.x, zone.y, zone.z);
    g.view.setPlace('home_islet', g.player.position);
    g.renderer.domElement.focus();
  });
}

async function clickBuilding(page) {
  const at = await page.evaluate(() => {
    const g = window.__island, box = g.renderer.domElement.getBoundingClientRect();
    const point = g.player.position.clone().set(15.5, -14 * .72, 0).project(g.camera);
    return {x: box.left + (point.x + 1) * box.width / 2, y: box.top + (1 - point.y) * box.height / 2};
  });
  await page.mouse.click(at.x, at.y);
}

it.each([false, true])('nearby E/Use works and a reported revive blocks building input (phone=%s)', async phone => {
  await evaluate.withPage(async (page, base) => {
    await openGame(page, base, phone);
    await page.waitForFunction(() => !document.querySelector('.touch-actions button')?.hidden);
    if (phone) await page.locator('.touch-actions').getByRole('button', {name: 'Use', exact: true}).click();
    else await page.keyboard.press('KeyE');
    await page.locator('.island-card-build[open]').waitFor();
    expect(await page.locator('.island-card-build[open]').count()).toBe(1);
    await page.keyboard.press('Escape');

    // Report a fallen local captain at the wave/UI boundary; the game must block their clicks.
    await page.evaluate(() => {
      const controller = window.__island.waves.island;
      window.t19Down = Object.getOwnPropertyDescriptor(controller, 'captainDown');
      Object.defineProperty(controller, 'captainDown', {configurable: true, get: () => true});
    });
    await clickBuilding(page);
    expect(await page.locator('.island-card[open]').count()).toBe(0);
    await page.evaluate(() => Object.defineProperty(window.__island.waves.island, 'captainDown', window.t19Down));

    // Report a revive action, without replacing its existing payment/timing controller tests.
    await page.evaluate(() => {
      const controller = window.__island.waves.island;
      Object.defineProperty(controller, 'wave', {get: () => ({action: {kind: 'revive'}})});
      window.__island.renderer.domElement.focus();
    });
    await page.waitForFunction(() => document.querySelector('.touch-actions button')?.hidden);
    await clickBuilding(page);
    await page.keyboard.press('KeyE');
    expect(await page.locator('.island-card[open]').count()).toBe(0);
    expect(await page.locator('.touch-actions button').getAttribute('hidden')).not.toBeNull();
  });
});
