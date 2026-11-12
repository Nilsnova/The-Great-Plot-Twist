// The research tiers and the docked island cards (GAME-V3.md §5.1, lane T15+T16) in the integrated game with the
// fake server (?islands=fake), one size per run:
//   node scripts/capture-research.js <folder> 1280x800      (and again with 390x844 for the phone's bottom sheet)
// The docked Tech hub with the island in view, its tree with done / next / locked / closed nodes, a docked building
// card, and a capstone in action (Inferno mortars and Broadside cannons in a wave).
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {openWorldBrowser, settle} from './world-browser-tools.js';

const out = process.argv[2] ?? 'captures/research';
const [width, height] = (process.argv[3] ?? '1280x800').split('x').map(Number);
await mkdir(out, {recursive: true});
const env = await openWorldBrowser(), {page} = env;
const shot = async name => { await page.waitForTimeout(400); await settle(page); await page.screenshot({path: `${out}/${name}-${width}x${height}.png`}); console.log(`${name}-${width}x${height}`); };
const stand = (x, z) => page.evaluate(([x, z]) => { const g = window.__island; g.player.position.set(x, g.world.current.groundHeight?.(x, z) ?? 1.03, z); g.view.setPlace(g.world.current.id, g.player.position); }, [x, z]);
const island = (fn, arg) => page.evaluate(([source, arg]) => (0, eval)(source)(window.__island.island, arg), [String(fn), arg]);
const closeCards = async () => { for (let i = 0; i < 4 && await page.locator('dialog[open]').count(); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); } };
const docked = () => page.evaluate(() => { const card = document.querySelector('.island-card[open]'), box = card.getBoundingClientRect();
  return {docked: card.classList.contains('island-card-docked'), left: Math.round(box.left), top: Math.round(box.top), width: Math.round(box.width), height: Math.round(box.height)}; });
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
  await island(async i => { i.dev.setWaveBest(20); i.dev.setCoins(20000); await i.load();
    for (const [spot, kind] of [['cannon_1', 'cannon'], ['cannon_2', 'cannon'], ['cannon_5', 'mortar'], ['cannon_6', 'mortar'], ['wall_1', 'wall'], ['wall_2', 'wall'], ['wall_3', 'wall'], ['tower_1', 'watchtower'], ['house_1', 'house']]) await i.build(spot, kind);
    // The cannons: tier 1 and tier 2 (Long guns, so Rapid II is closed); the mortars: tier 1, tier 2 is next;
    // the walls: tier 1; the watchtower: nothing yet. Tier 3 is still locked (wave 20).
    await i.research({branch: 'cannon'}); await i.research({branch: 'cannon', tier: 2, choice: 'long_guns'});
    await i.research({branch: 'mortar'}); await i.research({branch: 'wall'}); });
  await closeCards();
  // 1 The docked Tech hub, the island in view beside it (a phone: the bottom sheet).
  await stand(6, -9);
  await island(i => i.openTechHub());
  await page.locator('.island-card-tech[open]').waitFor();
  const hub = await docked();
  assert.ok(hub.docked, 'the Tech hub docks');
  if (width > 900) assert.ok(hub.left > width / 2 && hub.width <= 400, `a side panel: ${JSON.stringify(hub)}`);
  else assert.ok(hub.top >= height * .39 && hub.width === width, `a bottom sheet: ${JSON.stringify(hub)}`);
  await shot('01-docked-tech-hub');
  // 2 The tree: open the cannon branch (done, chosen and closed nodes, tier 3 locked) and the mortar's (tier 2 next).
  await page.locator('.island-card-tech[open] .island-research-branch[data-branch="cannon"] > summary').click();
  await page.locator('.island-card-tech[open] .island-research-branch[data-branch="mortar"] > summary').click();
  const states = await page.evaluate(() => [...document.querySelectorAll('.island-card-tech[open] .island-research-option')].map(node => node.className.match(/is-(\w+)/)[1]));
  for (const state of ['done', 'chosen', 'closed', 'open', 'locked']) assert.ok(states.includes(state), `a ${state} node`);
  await page.locator('.island-card-tech[open] .island-research-branch[data-branch="cannon"]').scrollIntoViewIfNeeded();
  await shot('02-tree-done-next-locked-closed');
  await page.locator('.island-card-tech[open] .island-research-branch[data-branch="mortar"] .island-research-step[data-tier="2"]').scrollIntoViewIfNeeded();
  await shot('02b-tree-next-fork');
  await closeCards();
  // 3 A docked building card: the cannon's upgrade card with its skills.
  await stand(-11, -12);
  await island(i => i.pick('cannon_1'));
  await page.locator('.island-card[open]').waitFor();
  assert.ok((await docked()).docked, 'the building card docks');
  await shot('03-docked-building-card');
  await closeCards();
  // 4 A capstone in action: tier 3 after wave 25, Inferno on both mortars, Broadside on both cannons, then a wave.
  await island(async i => { i.dev.setWaveBest(26); await i.load();
    await i.research({branch: 'mortar', tier: 2, choice: 'heavy_shells'}); await i.research({branch: 'mortar', tier: 3, choice: 'inferno'});
    await i.research({branch: 'cannon', tier: 3, choice: 'broadside'});
    for (const spot of ['cannon_5', 'cannon_6']) await i.specialise(spot, 'inferno');
    for (const spot of ['cannon_1', 'cannon_2']) await i.specialise(spot, 'broadside');
    i.dev.setWaveBest(14); await i.load(); });
  await closeCards();
  await island(i => i.ringBell());
  const lit = await page.waitForFunction(() => { const w = window.__island.waves?.island.wave; return w && (w.state.fires?.length ?? 0) > 0 ? w.state.fires.length : null; }, null, {timeout: 120000, polling: 50}).catch(() => null);
  await page.waitForTimeout(300);
  await page.screenshot({path: `${out}/04-capstone-inferno-${width}x${height}.png`}); console.log(`04-capstone-inferno-${width}x${height}${lit ? '' : ' (no fire seen)'}`);
} finally {
  await env.close();
}
