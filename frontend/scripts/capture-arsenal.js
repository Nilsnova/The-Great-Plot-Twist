// The island arsenal (T41, D042) in the integrated game with the fake server (?islands=fake&arsenal=1), one size
// per run:
//   node scripts/capture-arsenal.js <folder> 1280x800      (and again with 390x844)
// The building on the island, "Walk closer" from afar, E next to it opens its card; buying into your hands and
// onto the rack, a swap, and a full rack (20 of 20) where Return is refused and Swap still works.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {openWorldBrowser, settle} from './world-browser-tools.js';

const out = process.argv[2] ?? 'captures/arsenal';
const [width, height] = (process.argv[3] ?? '1280x800').split('x').map(Number);
await mkdir(out, {recursive: true});
const env = await openWorldBrowser(), {page} = env;
const shot = async name => { await page.waitForTimeout(400); await settle(page); await page.screenshot({path: `${out}/${name}-${width}x${height}.png`}); console.log(`${name}-${width}x${height}`); };
const stand = (x, z) => page.evaluate(([x, z]) => { const g = window.__island; g.player.position.set(x, g.world.current.groundHeight?.(x, z) ?? 1.03, z); g.view.setPlace(g.world.current.id, g.player.position); }, [x, z]);
const island = (fn, arg) => page.evaluate(([source, arg]) => (0, eval)(source)(window.__island.island, arg), [String(fn), arg]);
const closeCards = async () => { for (let i = 0; i < 4 && await page.locator('dialog[open]').count(); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); } };
const card = '.island-card-arsenal[open]';
try {
  await page.setViewportSize({width, height});
  await page.goto(`${env.url}/?islands=fake&arsenal=1`);
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
  await island(async i => { i.dev.setWaveBest(10); i.dev.setCoins(20000); await i.load();
    for (const [spot, kind] of [['cannon_1', 'cannon'], ['tower_1', 'watchtower'], ['house_2', 'house'], ['wall_11', 'wall']]) await i.build(spot, kind); });
  await closeCards();
  // 1 The building on the island, seen from the path; a click from afar says "walk closer".
  await stand(-2, -4);
  await shot('01-arsenal-on-the-island');
  // 2 Walk up: the prompt, then E opens the card (the ordinary interaction).
  await stand(-4.8, -9.2);
  await page.waitForTimeout(500);
  await shot('02-arsenal-walk-up');
  await page.keyboard.press('e');
  await page.locator(card).waitFor({timeout: 10000});
  assert.match(await page.locator(`${card} .island-arsenal-rack h3`).textContent(), /Stored: 0 of 20/);
  await shot('03-arsenal-card-empty');
  // 3 Buy into your hands, then two onto the rack.
  await page.locator(`${card} [data-focus="buy-pistols"]`).click(); await page.waitForTimeout(300);
  await page.locator(`${card} [data-focus="buy-long_rifle"]`).click(); await page.waitForTimeout(300);
  await page.locator(`${card} [data-focus="buy-blunderbuss"]`).click(); await page.waitForTimeout(300);
  assert.match(await page.locator(`${card} .island-arsenal-name`).textContent(), /Pistols #1/);
  await shot('04-arsenal-card-stocked');
  // 4 A full rack: Return is refused with its reason, Swap still works.
  for (let n = 0; n < 18; n++) await page.evaluate(() => window.__island.island.arsenal.handlers.buy('pistols')).then(() => page.waitForTimeout(60));
  await island(i => i.arsenal.refresh());
  await page.waitForTimeout(300);
  assert.match(await page.locator(`${card} .island-arsenal-rack h3`).textContent(), /Stored: 20 of 20 · Full/);
  assert.equal(await page.locator(`${card} [data-focus="arsenal-return"]`).isDisabled(), true);
  await shot('05-arsenal-card-full');
  await page.locator(`${card} .island-arsenal-copy[data-weapon="long_rifle"] .kit-button`).click(); await page.waitForTimeout(400);
  assert.match(await page.locator(`${card} .island-arsenal-name`).textContent(), /Long rifle #2/);
  await shot('06-arsenal-swap-on-full-rack');
  await closeCards();
  assert.equal(await island(i => i.captainLoadout().weapon), 'long_rifle');
  const errors = env.errors.filter(text => !/Failed to load resource|AudioContext|audio device/i.test(text));
  assert.deepEqual(errors, [], 'no browser errors');
} finally { await env.close(); }
