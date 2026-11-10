// Real-browser check of the home islet panel on its local stand-in (?islet=local). Needs Chrome, like check-world.js.
// Run it from frontend/ with: node scripts/check-islet.js. It writes no files.
// The unit tests cover the rules and the labels. This covers what only a browser can show: keys, focus, the gamepad and the buttons.
import assert from 'node:assert/strict';
import {places} from '../src/world/places/registry.js';
import {PAD, installGamepad, pressPad, tiltStick} from './gamepad-browser-fixture.js';
import {startFromTitle} from './shell-browser-tools.js';
import {openWorldBrowser, settle} from './world-browser-tools.js';

const env = await openWorldBrowser();
const {page} = env;
const check = (ok, label) => { assert.ok(ok, label); console.log(`ok  ${label}`); };
const zones = Object.fromEntries(places.home_islet.zones.map(zone => [zone.id, zone]));
const STILL = 0.05; // the most the explorer may drift, in world units, when it should be standing

const isletRequests = [];
page.on('request', request => {
  const {pathname} = new URL(request.url());
  if (pathname.startsWith('/api/islet')) isletRequests.push(`${request.method()} ${pathname}`);
});

// --- the page ---
const modal = page.locator('.islet-modal[open]');
const card = plot => page.locator(`.islet-spot[data-plot=${plot}]`);
const buildButton = plot => card(plot).locator('button');
const refreshButton = page.locator('.islet-modal button', {hasText: 'Refresh'});
const wallet = () => page.locator('.islet-wallet').innerText();
const status = () => page.locator('.islet-status').innerText();
const pauseOpen = () => page.locator('.shell-screen[open]').count().then(count => count > 0);
const focused = () => page.evaluate(() => {
  const active = document.activeElement;
  return {tag: active.tagName, plot: active.closest('[data-plot]')?.dataset.plot ?? null, inPanel: !!active.closest('.islet-modal'), onCanvas: active.matches('canvas[tabindex="0"]')};
});
const waitForWallet = text => page.waitForFunction(text => document.querySelector('.islet-wallet').textContent === text, text);
const waitForStatus = start => page.waitForFunction(start => document.querySelector('.islet-status').textContent.startsWith(start), start);
const panelReady = async () => {
  await modal.waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.islet-spot').length === 5);
};
// Gives the panel a moment to close, then says whether it has. A panel that stays open then fails a check, not a timeout.
const closes = async () => {
  await page.waitForFunction(() => !document.querySelector('.islet-modal[open]'), null, {timeout: 3000}).catch(() => {});
  return await modal.count() === 0;
};
const gameBehind = () => page.evaluate(() => ({finale: false, chart: window.__island.chart.open}));

// --- the explorer ---
const where = () => page.evaluate(() => ({x: window.__island.player.position.x, z: window.__island.player.position.z}));
async function standAt(x, y, z, settleMs = 300) {
  await page.evaluate(([x, y, z]) => window.__island.player.position.set(x, y, z), [x, y, z]);
  await page.waitForTimeout(settleMs);
}
async function standOnZone(id) {
  const {x, y, z} = zones[id];
  await standAt(x, y, z, 0);
  await page.waitForFunction(({id,x,z}) => {
    const game=window.__island;
    if(document.querySelector('.islet-modal[open]'))
      return Math.hypot(game.player.position.x-x,game.player.position.z-z)<0.001;
    return document.querySelector('.interact').dataset.zone===id;
  },{id,x,z});
}
async function walked(action) { // how far the explorer moves while `action` runs
  const before = await where();
  await action();
  const after = await where();
  return Math.hypot(after.x - before.x, after.z - before.z);
}
const holdKeys = (keys, ms = 500) => async () => {
  for (const key of keys) await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  for (const key of keys) await page.keyboard.up(key);
};
const holdStick = (x, y, ms = 500) => async () => {
  await tiltStick(page, x, y);
  await page.waitForTimeout(ms);
  await tiltStick(page, 0, 0);
};
async function tap(key) {
  await page.keyboard.down(key);
  await page.waitForTimeout(100);
  await page.keyboard.up(key);
}

async function enterGame(search) {
  await page.goto(`${env.url}/${search}`);
  await startFromTitle(page);
  await page.evaluate(() => {
    window.__changes = [];
    window.__island.on('islet_changed', event => window.__changes.push(event));
  });
  await page.evaluate(() => window.__island.world.goTo('home_islet', {fast: true}));
  await settle(page);
}

try {
  await installGamepad(page);
  
  await enterGame('?islet=local');
  check(await page.evaluate(() => JSON.stringify(window.__changes[0])) === '{"type":"islet_changed","built":["plot_1"],"signalStationBuilt":false}', 'Arriving at the home islet tells the world that only the cabin stands');

  // The controls: with no panel open, the keyboard and the gamepad both walk the explorer. Without this the "stays put" checks below could pass for nothing.
  await standAt(0, 1.03, 3);
  check(await walked(holdKeys(['KeyD'])) > 0.3, 'Control: the keyboard walks the explorer while no panel is open');
  await standAt(0, 1.03, 3);
  check(await walked(holdStick(1, 0)) > 0.3, 'Control: the gamepad stick walks the explorer while no panel is open');

  // E at a plot opens the panel.
  await standOnZone('plot_2');
  await tap('KeyE');
  await panelReady();
  check((await page.locator('.islet-spot h3').allInnerTexts()).join() === 'Cabin,Workshop,Windmill,Greenhouse,Signal station', 'E at the workshop plot opens the panel with five cards in file order');
  check(await wallet() === 'You have 1,000 coins and 20 timber.', 'A new player sees 1,000 coins and 20 timber');
  const opened = await focused();
  check(opened.inPanel && opened.plot === 'plot_2' && opened.tag === 'BUTTON', 'Focus lands on the Build button of the plot that was used');

  // Nothing happens in the game behind the panel. A focused button swallows keys by itself, so the focus goes to a heading.
  check(await walked(holdKeys(['KeyD', 'KeyW'])) < STILL, 'Keys do not walk the explorer while a button has focus');
  await page.evaluate(() => document.querySelector('.islet-spot[data-plot=plot_3] h3').focus());
  check(await walked(holdKeys(['KeyD', 'KeyW'])) < STILL, 'Keys do not walk the explorer while a heading has focus');
  check(await walked(holdStick(1, -1)) < STILL, 'The gamepad stick does not walk the explorer');
  await standOnZone('islet_signal_station'); // E here would open the case finale, if it reached the game
  await tap('KeyE');
  await tap('KeyM');
  let behind = await gameBehind();
  check(!behind.finale, 'E does not open the finale behind the panel');
  check(!behind.chart, 'M does not open the sea chart behind the panel');
  await pressPad(page, PAD.A);
  await pressPad(page, PAD.Y);
  behind = await gameBehind();
  check(!behind.finale, 'A does not open the finale behind the panel');
  check(!behind.chart, 'Y does not open the sea chart behind the panel');
  check(await modal.count() === 1, 'The panel is still open after E, M, A and Y');

  // Locked and unaffordable buttons are off, and say why.
  check(await buildButton('plot_3').isDisabled() && await buildButton('plot_4').isDisabled(), 'The windmill and greenhouse buttons are off');
  check((await card('plot_3').innerText()).includes('Coming later'), 'The windmill says Coming later');
  check(await buildButton('plot_1').isHidden(), 'The cabin has no button');
  await page.waitForFunction(() => window.__isletLocal);
  await page.evaluate(() => window.__isletLocal.dev.setCoins(100));
  await refreshButton.click();
  await waitForWallet('You have 100 coins and 20 timber.');
  check(await buildButton('plot_2').isDisabled() && await buildButton('islet_signal_station').isDisabled(), 'With 100 coins the Build buttons are off');
  check((await card('islet_signal_station').innerText()).includes('You need 200 more coins'), 'The station card says it needs 200 more coins');
  await page.evaluate(() => window.__isletLocal.dev.reset());
  await refreshButton.click();
  await waitForWallet('You have 1,000 coins and 20 timber.');
  check(await buildButton('plot_2').isEnabled() && await buildButton('islet_signal_station').isEnabled(), 'With 1,000 coins the Build buttons are on again');
  const names = await Promise.all(['plot_2', 'islet_signal_station'].map(plot => buildButton(plot).innerText()));
  check(new Set(names).size === 2 && names.every(name => name.startsWith('Build the ')), 'Each Build button names its building');

  // Building the station by click leaves 700 coins and 10 timber.
  await buildButton('islet_signal_station').click();
  await waitForStatus('Signal station built.');
  check(await status() === 'Signal station built. You have 700 coins and 10 timber left.' && await wallet() === 'You have 700 coins and 10 timber.', 'Building the station leaves 700 coins and 10 timber');
  check((await card('islet_signal_station').innerText()).includes('Standing') && await buildButton('islet_signal_station').isHidden(), 'The station card shows Standing and has no button');
  check(await page.evaluate(() => JSON.stringify(window.__changes.at(-1))) === '{"type":"islet_changed","built":["plot_1","islet_signal_station"],"signalStationBuilt":true}', 'The world is told that the station stands');

  // The gamepad can drive the panel: the D-pad moves focus, A builds, B closes.
  await refreshButton.focus();
  await pressPad(page, PAD.DOWN);
  check((await focused()).plot === 'plot_2', 'The D-pad moves focus to the workshop button');
  await pressPad(page, PAD.A);
  await waitForStatus('Workshop built.');
  check(await wallet() === 'You have 400 coins and 0 timber.', 'A builds the workshop: 400 coins and 0 timber are left');
  await pressPad(page, PAD.B);
  check(await closes() && !await pauseOpen(), 'B closes the panel and opens no Pause menu');
  check((await focused()).onCanvas, 'After B, focus is back on the canvas');

  // A click on a plot opens it too, and Escape closes it without Pause.
  await standAt(0, 1.03, 3, 750);
  const point = await page.evaluate(() => {
    const game = window.__island, projected = game.camera.position.clone().set(-8, -2 * 0.72, 0).project(game.camera), box = game.renderer.domElement.getBoundingClientRect();
    return {x: box.left + (projected.x + 1) / 2 * box.width, y: box.top + (1 - projected.y) / 2 * box.height};
  });
  await page.mouse.click(point.x, point.y);
  await panelReady();
  const cabin = await focused();
  check(cabin.inPanel && cabin.plot === 'plot_1' && cabin.tag === 'H3', 'A click on the cabin plot opens the panel with focus on the cabin heading');
  await page.keyboard.press('Escape');
  check(await closes() && !await pauseOpen(), 'Escape closes the panel without opening Pause');
  check((await focused()).onCanvas, 'After Escape, focus is back on the canvas');

  // Travelling closes the panel.
  await page.evaluate(() => window.__island.emit({type: 'plot_clicked', plot: 'plot_3'}));
  await panelReady();
  await page.evaluate(() => window.__island.world.goTo('saltreach_harbor', {fast: true}));
  await settle(page);
  check(await modal.count() === 0, 'Travelling closes the panel');

  // Without the flag and without a sign-in, the panel asks nothing.
  await enterGame('');
  await page.evaluate(() => window.__island.emit({type: 'plot_clicked', plot: 'plot_2'}));
  await modal.waitFor();
  check(await status() === 'Your islet will be saved to your account once sign-in is connected.', 'Without a transport the panel says the islet will be saved once sign-in is connected');
  check(await page.locator('.islet-spot').count() === 0 && await page.evaluate(() => window.__changes.length) === 0, 'It shows no cards and tells the world nothing');
  await page.keyboard.press('Escape');
  check(await closes(), 'Escape closes the panel in unavailable mode too');
  check(isletRequests.length === 0, 'Neither mode sent a request to /api/islet');
  check(env.errors.length === 0, 'No browser errors');
  check(env.external.length === 0, 'No external requests');
} finally {
  await env.close();
}
