// The harpoon tower of GAME-V3.md §5 (T1) in the integrated game with the fake server (?islands=fake), one size per run:
//   node scripts/capture-harpoon.js <folder> 1280x800      (and again with 390x844)
// The tower spot's build card locked ("Opens after wave 12") and open with the harpoon, a harpoon tower at level 1 and
// at level 5, and a wave where a harpoon has slowed a ship (foam rings and a rope coil on it).
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {openWorldBrowser, settle} from './world-browser-tools.js';

const out = process.argv[2] ?? 'captures/harpoon';
const [width, height] = (process.argv[3] ?? '1280x800').split('x').map(Number);
await mkdir(out, {recursive: true});
const env = await openWorldBrowser(), {page} = env;
const shot = async name => { await page.waitForTimeout(400); await settle(page); await page.screenshot({path: `${out}/${name}-${width}x${height}.png`}); console.log(`${name}-${width}x${height}`); };
const stand = (x, z) => page.evaluate(([x, z]) => { const g = window.__island; g.player.position.set(x, g.world.current.groundHeight?.(x, z) ?? 1.03, z); g.view.setPlace(g.world.current.id, g.player.position); }, [x, z]);
const island = (fn, arg) => page.evaluate(([source, arg]) => (0, eval)(source)(window.__island.island, arg), [String(fn), arg]);
const wave = () => page.evaluate(() => { const w = window.__island.waves?.island.wave; return w ? {ships: w.state.ships.length, slowed: w.state.ships.filter(s => s.slowed).length, wave: w.info.wave, pause: !!w.pause} : null; });
async function until(test, timeout = 120000) { const end = Date.now() + timeout; while (Date.now() < end) { const state = await wave(); if (test(state)) return state; await page.waitForTimeout(250); } throw new Error(`timed out: ${JSON.stringify(await wave())}`); }
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
  await page.waitForFunction(() => window.__island.waves && window.__island.island?.island, null, {timeout: 30000});
  await closeCards();
  await page.evaluate(() => { window.__island.settings.hour = 12; });
  // 1 After wave 11 the harpoon is on the card but locked; after wave 12 it can be built.
  await island(async i => { i.dev.setWaveBest(11); i.dev.setCoins(60000); await i.load(); });
  await closeCards();
  await stand(-10, -10);
  await island(i => i.pick('cannon_1'));
  await page.locator('.island-card[open]').waitFor();
  assert.match(await page.locator('.island-card[open]').textContent(), /Harpoon tower[\s\S]*Opens after wave 12/);
  await shot('01-build-card-locked');
  await closeCards();
  await island(async i => { i.dev.setWaveBest(12); await i.load(); });
  await island(i => i.pick('cannon_1'));
  await page.locator('.island-card[open]').waitFor();
  assert.match(await page.locator('.island-card[open]').textContent(), /Harpoon tower[\s\S]*Slows one ship at a time/);
  await shot('02-build-card');
  await closeCards();
  // 2 A level-1 harpoon tower, then (after wave 20) a level-5 one beside it.
  await island(async i => { await i.build('cannon_1', 'harpoon'); });
  await closeCards();
  await stand(-12, -9);
  await shot('03-harpoon-level-1');
  await island(async i => { i.dev.setWaveBest(20); await i.load(); await i.build('cannon_5', 'harpoon'); for (let n = 0; n < 4; n++) await i.upgrade('cannon_5'); });
  await closeCards();
  const levels = await island(i => Object.fromEntries(i.island.spots.filter(s => s.built).map(s => [s.id, [s.kind, s.level]])));
  assert.deepEqual([levels.cannon_1, levels.cannon_5], [['harpoon', 1], ['harpoon', 5]]);
  await shot('04-harpoon-levels-1-and-5');
  await island(i => i.pick('cannon_5'));
  await page.locator('.island-card[open]').waitFor();
  await shot('05-harpoon-card');
  await closeCards();
  // 3 A wave (13) with harpoons beside cannons: a ship held back by a harpoon.
  await island(async i => { i.dev.setWaveBest(12); await i.load();
    for (const spot of ['cannon_2', 'cannon_6']) { await i.build(spot, 'harpoon'); await i.upgrade(spot); await i.upgrade(spot); }
    for (const spot of ['cannon_3', 'cannon_4']) { await i.build(spot, 'cannon'); await i.upgrade(spot); }
    for (const spot of ['wall_1', 'wall_2', 'wall_3']) await i.build(spot, 'wall'); });
  await closeCards();
  await stand(0, 4);
  await island(async i => i.ringBell());
  await until(state => state && state.slowed > 0, 90000);
  await page.waitForTimeout(500);
  console.log('slowed ship on screen:', JSON.stringify(await wave()));
  await shot('06-slowed-ship');
  const errors = env.errors.filter(text => !/Failed to load resource|AudioContext|audio device/i.test(text));
  assert.deepEqual(errors, [], 'no browser errors');
} finally { await env.close(); }
