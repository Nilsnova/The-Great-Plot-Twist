// The campaign of GAME-V3.md §4 and §5 in the integrated game with the fake server (?islands=fake), one size per run:
//   node scripts/capture-campaign.js <folder> 1280x800      (and again with 390x844)
// A building that opens later (the Tech hub's site, "Opens after wave 8"), the Harbor building and its stalls,
// the Tech hub's research card, a tower's skill choice, the wreck being mended and repaired, and wave 30 with
// the new pirate types (raiders, ironclads, brutes).
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {openWorldBrowser, settle} from './world-browser-tools.js';

const out = process.argv[2] ?? 'captures/campaign';
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
  // A few defenses so the island looks lived in.
  await island(async i => { i.dev.setWaveBest(3); i.dev.setCoins(5000); await i.load();
    for (const [spot, kind] of [['cannon_1', 'cannon'], ['cannon_2', 'cannon'], ['cannon_6', 'mortar'], ['wall_2', 'wall'], ['wall_3', 'wall'], ['tower_1', 'watchtower'], ['house_1', 'house']]) await i.build(spot, kind); });
  await closeCards();
  // 1 A building that opens later: the Tech hub's site with its sign, and its card "Opens after wave 8".
  await stand(5, -8);
  await shot('01a-locked-site-map');
  await island(i => i.pick('island_techhub'));
  await page.locator('.island-card-tech[open]').waitFor();
  const locked = await page.locator('.island-card-tech[open] .island-campaign-locked').textContent();
  assert.match(locked, /Opens after wave 8/);
  await shot('01b-locked-tech-hub-card');
  await closeCards();
  // The inner ring opens after wave 5: its spots show a lock badge, its card says so.
  await island(i => i.pick('wall_9'));
  assert.match(await page.locator('.island-card[open] .island-soon').textContent(), /Opens after wave 5/);
  await shot('01c-locked-ring-wall-card');
  await closeCards();
  // 2 The Harbor after wave 7: the market stall and the match board.
  await island(async i => { i.dev.setWaveBest(7); await i.load(); });
  await page.waitForTimeout(600); await closeCards();
  await stand(10, 9);
  await island(i => i.pick('island_harbor'));
  await page.locator('.island-card-harbor[open]').waitFor();
  assert.equal(await page.locator('.island-card-harbor[open] .island-stall').count(), 2);
  await shot('02-harbor');
  await closeCards();
  // 3 The Tech hub after wave 8: research cannon skills.
  await island(async i => { i.dev.setWaveBest(8); await i.load(); });
  await page.waitForTimeout(600); await closeCards();
  await stand(6, -9);
  await island(async i => { i.openTechHub(); await i.research('cannon'); i.openTechHub(); });
  await page.locator('.island-card-tech[open] .island-research-row.is-done').waitFor();
  await shot('03-tech-hub-research');
  await closeCards();
  // 4 A tower's skill choice on its upgrade card.
  await stand(-11, -12);
  await island(async i => { await i.specialise('cannon_1', 'heavy'); i.pick('cannon_1'); });
  await page.locator('.island-card[open] .island-spec.is-active').waitFor();
  await shot('04-tower-skill-choice');
  await closeCards();
  // 5 The wreck: mended part way, then repaired.
  await stand(-13, 6);
  await island(async i => { for (let n = 0; n < 3; n++) await i.giveWreck(100); i.openWreck(); });
  await page.locator('.island-card-wreck[open] .island-wreck-bar').waitFor();
  await shot('05a-wreck-mending');
  await closeCards();
  await island(async i => { for (let n = 0; n < 2; n++) await i.giveWreck(100); i.openWreck(); });
  await page.locator('.island-card-wreck[open] .island-wreck-done').waitFor();
  await shot('05b-wreck-repaired');
  await closeCards();
  // 6 Wave 30: the full island fights raiders, ironclads and brutes.
  await island(async i => { i.dev.setWaveBest(29); i.dev.setCoins(20000); await i.load();
    for (const spot of ['cannon_3', 'cannon_4', 'cannon_5', 'cannon_7']) await i.build(spot, 'cannon');
    for (const spot of ['wall_1', 'wall_4', 'wall_5', 'wall_6', 'wall_7', 'wall_8', 'wall_9', 'wall_10', 'wall_11', 'wall_12', 'house_2']) await i.build(spot, spot.startsWith('house') ? 'house' : 'wall');
    for (const spot of ['cannon_1', 'cannon_2', 'cannon_3', 'cannon_4', 'cannon_5', 'cannon_6', 'cannon_7', 'wall_1', 'wall_2', 'wall_3']) { await i.upgrade(spot); await i.upgrade(spot); } });
  await closeCards();
  await stand(0, 4);
  await island(async i => i.ringBell());
  await until(state => state && state.wave === 30 && state.ships >= 6, 90000);
  await until(state => state && (state.kinds.includes('ironclad') || state.kinds.includes('raider')), 60000);
  await page.waitForTimeout(6000);
  const seen = await wave();
  console.log('wave 30 on screen:', JSON.stringify(seen));
  await shot('06-wave30-new-pirates');
  const errors = env.errors.filter(text => !/Failed to load resource|AudioContext|audio device/i.test(text));
  assert.deepEqual(errors, [], 'no browser errors');
} finally { await env.close(); }
