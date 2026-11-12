// The tower tiers of GAME-V3.md §4.1 in the integrated game with the fake server (?islands=fake), one size per run:
//   node scripts/capture-tiers.js <folder> 1280x800      (and again with 390x844)
// The locked level-4 upgrade card ("Level 4: Opens after wave 12."), level-4 and level-5 towers and walls with
// their gold trim, banners and gold pips, and a late wave (70) against a level-5 island.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {openWorldBrowser, settle} from './world-browser-tools.js';

const out = process.argv[2] ?? 'captures/tiers';
const [width, height] = (process.argv[3] ?? '1280x800').split('x').map(Number);
await mkdir(out, {recursive: true});
const env = await openWorldBrowser(), {page} = env;
const shot = async name => { await page.waitForTimeout(400); await settle(page); await page.screenshot({path: `${out}/${name}-${width}x${height}.png`}); console.log(`${name}-${width}x${height}`); };
const stand = (x, z) => page.evaluate(([x, z]) => { const g = window.__island; g.player.position.set(x, g.world.current.groundHeight?.(x, z) ?? 1.03, z); g.view.setPlace(g.world.current.id, g.player.position); }, [x, z]);
const island = (fn, arg) => page.evaluate(([source, arg]) => (0, eval)(source)(window.__island.island, arg), [String(fn), arg]);
const wave = () => page.evaluate(() => { const w = window.__island.waves?.island.wave; return w ? {ships: w.state.ships.length, kinds: [...new Set(w.state.ships.map(s => s.kind))], brutes: (w.state.boarders ?? []).filter(b => b.brute).length, wave: w.info.wave, pause: !!w.pause} : null; });
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
  // 1 After wave 11: a level-3 cannon's card says when level 4 opens.
  await island(async i => { i.dev.setWaveBest(11); i.dev.setCoins(60000); await i.load();
    await i.build('cannon_1', 'cannon'); await i.upgrade('cannon_1'); await i.upgrade('cannon_1'); });
  await closeCards();
  await stand(-10, -10);
  await island(i => i.pick('cannon_1'));
  assert.match(await page.locator('.island-card[open] .island-soon').textContent(), /Level 4: Opens after wave 12/);
  await shot('01-locked-level-4-card');
  await closeCards();
  // 2 After wave 20: level 4 on the west, level 5 on the east.
  await island(async i => { i.dev.setWaveBest(20); await i.load();
    const up = async (spot, times) => { for (let n = 0; n < times; n++) await i.upgrade(spot); };
    await up('cannon_1', 1);
    await i.build('cannon_5', 'mortar'); await up('cannon_5', 3);
    await i.build('wall_1', 'wall'); await up('wall_1', 3);
    await i.build('cannon_2', 'cannon'); await up('cannon_2', 4);
    await i.build('cannon_6', 'mortar'); await up('cannon_6', 4);
    await i.build('wall_3', 'wall'); await up('wall_3', 4);
    await i.build('wall_2', 'wall'); await up('wall_2', 4);
    await i.build('tower_1', 'watchtower'); await up('tower_1', 4); });
  await closeCards();
  const levels = await island(i => Object.fromEntries(i.island.spots.filter(s => s.built).map(s => [s.id, s.level])));
  assert.deepEqual([levels.cannon_1, levels.cannon_5, levels.wall_1, levels.cannon_2, levels.cannon_6, levels.wall_3, levels.tower_1], [4, 4, 4, 5, 5, 5, 5]);
  await stand(-12, -8);
  await shot('02-level-4-towers');
  await island(i => i.pick('cannon_1'));
  await page.locator('.island-card[open]').waitFor();
  await shot('03-level-4-card');
  await closeCards();
  await stand(11, -9);
  await shot('04-level-5-towers');
  // 3 Wave 70 against a level-5 island.
  await island(async i => { i.dev.setWaveBest(69); await i.load();
    const up = async (spot, times) => { for (let n = 0; n < times; n++) await i.upgrade(spot); };
    for (const spot of ['cannon_3', 'cannon_4', 'cannon_7']) { await i.build(spot, 'cannon'); await up(spot, 4); }
    await up('cannon_1', 1); await up('cannon_5', 1); await up('wall_1', 1);
    for (const spot of ['wall_4', 'wall_5', 'wall_6', 'wall_7', 'wall_8', 'wall_9', 'wall_10', 'wall_11', 'wall_12']) { await i.build(spot, 'wall'); await up(spot, 4); } });
  await closeCards();
  await stand(0, 4);
  await island(async i => i.ringBell());
  await until(state => state && state.wave === 70 && state.ships >= 6, 90000);
  await page.waitForTimeout(9000);
  console.log('wave 70 on screen:', JSON.stringify(await wave()));
  await shot('05-wave-70');
  const errors = env.errors.filter(text => !/Failed to load resource|AudioContext|audio device/i.test(text));
  assert.deepEqual(errors, [], 'no browser errors');
} finally { await env.close(); }
