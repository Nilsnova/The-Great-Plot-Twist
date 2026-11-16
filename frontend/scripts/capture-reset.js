// T53 evidence: Settings › Reset my island in the integrated game with the fake server (?islands=fake), one size
// per run:
//   node scripts/capture-reset.js <folder> 1280x800      (and again with 390x844)
// The section as it opens (the red button off), the island code typed (on), and after the reset (done, the island
// back to 🪙 100 and no buildings).
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {openWorldBrowser, settle} from './world-browser-tools.js';

const out = process.argv[2] ?? 'captures/reset';
const [width, height] = (process.argv[3] ?? '1280x800').split('x').map(Number);
await mkdir(out, {recursive: true});
const env = await openWorldBrowser(), {page} = env;
const section = '.shell-screen[open] .island-reset';
const shot = async name => {
  await page.waitForTimeout(400); await settle(page);
  await page.locator(section).scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({path: `${out}/${name}-${width}x${height}.png`}); console.log(`${name}-${width}x${height}`);
};
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
  await island(async i => { i.dev.setWaveBest(6); i.dev.setCoins(2400); await i.load();
    for (const [spot, kind] of [['cannon_1', 'cannon'], ['cannon_2', 'cannon'], ['wall_1', 'wall'], ['house_1', 'house']]) await i.build(spot, kind); });
  await closeCards();
  const code = await island(i => i.island.code);
  // 1 Settings, the section as it opens: what is reset and what stays, the field, the red button off.
  await page.keyboard.press('Escape');
  await page.locator('.shell-screen[open][data-mode=pause]').waitFor();
  await page.getByRole('button', {name: 'Settings', exact: true}).click();
  await page.locator(section).waitFor({timeout: 10000});
  assert.equal(await page.locator(`${section} .island-reset-button`).isDisabled(), true);
  await shot('01-reset-empty');
  // 2 The island code typed: the button turns on.
  await page.locator(`${section} input`).fill(code.toLowerCase());
  assert.equal(await page.locator(`${section} .island-reset-button`).isDisabled(), false);
  await shot('02-reset-code-typed');
  // 3 Enter resets: the done line; the island is back to the start behind the menu.
  await page.locator(`${section} input`).press('Enter');
  await page.locator(`${section}[data-state=done]`).waitFor({timeout: 10000});
  const after = await island(i => ({coins: i.island.coins, built: i.island.spots.filter(spot => spot.built).length, waveBest: i.island.waveBest}));
  assert.deepEqual(after, {coins: 100, built: 0, waveBest: 0});
  await shot('03-reset-done');
  const errors = env.errors.filter(text => !/Failed to load resource|AudioContext|audio device/i.test(text));
  assert.deepEqual(errors, [], 'no browser errors');
} finally { await env.close(); }
