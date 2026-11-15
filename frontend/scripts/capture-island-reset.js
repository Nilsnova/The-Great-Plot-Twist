// D054, Start fresh, in the integrated game with the fake server (?islands=fake), one size per run:
//   node scripts/capture-island-reset.js <folder> 1280x720      (and again with 390x844)
// Settings › Account with the Start fresh button, its dialog (empty, then RESET typed) and the fresh island with
// its toast after the reset.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {openWorldBrowser, settle} from './world-browser-tools.js';

const out = process.argv[2] ?? 'captures/island-reset';
const [width, height] = (process.argv[3] ?? '1280x720').split('x').map(Number);
await mkdir(out, {recursive: true});
const env = await openWorldBrowser(), {page} = env;
const shot = async name => { await page.waitForTimeout(400); await settle(page); await page.screenshot({path: `${out}/${name}-${width}x${height}.png`}); console.log(`${name}-${width}x${height}`); };
const island = (fn, arg) => page.evaluate(([source, arg]) => (0, eval)(source)(window.__island.island, arg), [String(fn), arg]);
const closeCards = async () => { for (let i = 0; i < 4 && await page.locator('dialog[open]').count(); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); } };
try {
  await page.setViewportSize({width, height});
  await page.goto(`${env.url}/?islands=fake`);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.locator('#play').click();
  for (let i = 0; i < 10; i++) {
    await page.waitForFunction(() => document.querySelector('dialog.cutscene[open],.tutorial-card[open],.goal-card[open],.games-card[open],.island-card-lobby[open]')
      || (window.__island?.world.current?.id === 'home_islet' && window.__island.island?.island && !document.querySelector('dialog[open]')), null, {timeout: 40000, polling: 100});
    if (await page.locator('.goal-card[open]').count()) await page.locator('.goal-card[open]').getByRole('button', {name: 'Got it', exact: true}).click();
    else if (await page.locator('.games-card[open]').count()) { await page.waitForTimeout(400); await page.locator('.games-card[open]').getByRole('button', {name: 'Create a game', exact: true}).click(); }
    else if (await page.locator('.island-card-lobby[open]').count()) await page.locator('.island-card-lobby[open] .island-lobby-start').click();
    else if (await page.locator('dialog.cutscene[open],.tutorial-card[open]').count()) await page.getByRole('button', {name: 'Skip', exact: true}).click();
    else break;
    await page.waitForTimeout(400);
  }
  await page.waitForFunction(() => window.__island.island?.island, null, {timeout: 30000});
  await closeCards();
  await page.evaluate(() => { window.__island.settings.hour = 12; });
  await island(async i => { i.dev.setWaveBest(10); i.dev.setCoins(5000); await i.load();
    for (const [spot, kind] of [['cannon_1', 'cannon'], ['cannon_2', 'mortar'], ['tower_1', 'watchtower'], ['wall_1', 'wall'], ['wall_2', 'wall']]) await i.build(spot, kind); });
  await closeCards();
  // 1 Menu › Settings: the Account section with Start fresh.
  await page.keyboard.press('Escape');
  await page.getByRole('button', {name: 'Settings', exact: true}).click();
  const open = page.locator('.island-reset-open');
  await open.waitFor({timeout: 15000});
  await open.scrollIntoViewIfNeeded();
  await shot('01-settings-account-start-fresh');
  // 2 The dialog, then RESET typed.
  await open.click();
  const dialog = page.locator('.island-reset-modal[open]');
  await dialog.waitFor();
  assert.equal(await dialog.locator('.island-reset-go').isDisabled(), true);
  await shot('02-start-fresh-dialog');
  await dialog.locator('.island-reset-input').fill('RESET');
  assert.equal(await dialog.locator('.island-reset-go').isDisabled(), false);
  await shot('03-start-fresh-typed');
  // 3 The reset: back in the game, the island empty, the toast.
  await dialog.locator('.island-reset-go').click();
  await page.waitForFunction(() => !document.querySelector('dialog[open]') && window.__island.island.island?.spots.every(spot => !spot.built), null, {timeout: 15000});
  await page.waitForTimeout(300);
  // At once: the toast leaves after 3.6 s, and a settled shot of the island can take longer than that.
  await page.screenshot({path: `${out}/04-fresh-island-toast-${width}x${height}.png`}); console.log(`04-fresh-island-toast-${width}x${height}`);
  const errors = env.errors.filter(text => !/Failed to load resource|AudioContext|audio device/i.test(text));
  assert.deepEqual(errors, [], 'no browser errors');
} finally { await env.close(); }
