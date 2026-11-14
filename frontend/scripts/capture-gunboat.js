// The gunboat of GAME-V3.md §4.1 in the integrated game with the fake server (?islands=fake), one size per run:
//   node scripts/capture-gunboat.js <folder> 1280x800 [best wave] [name tag]      (and again with 390x844)
// A gunboat anchored at its range, a tower with the "jammed" mark, and a wave with several gunboats (the
// third argument is the island's best wave before the bell: 15 for wave 16's single boat, 39 for wave 40's four).
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {openWorldBrowser, settle} from './world-browser-tools.js';

const out = process.argv[2] ?? 'captures/gunboat';
const [width, height] = (process.argv[3] ?? '1280x800').split('x').map(Number);
const best = Number(process.argv[4] ?? 15), tag = process.argv[5] ? `-${process.argv[5]}` : '';
await mkdir(out, {recursive: true});
const env = await openWorldBrowser(), {page} = env;
const shot = async name => { await settle(page); await page.screenshot({path: `${out}/${name}${tag}-${width}x${height}.png`}); console.log(`${name}${tag}-${width}x${height}`); };
const stand = (x, z) => page.evaluate(([x, z]) => { const g = window.__island; g.player.position.set(x, g.world.current.groundHeight?.(x, z) ?? 1.03, z); g.view.setPlace(g.world.current.id, g.player.position); }, [x, z]);
const island = (fn, arg) => page.evaluate(([source, arg]) => (0, eval)(source)(window.__island.island, arg), [String(fn), arg]);
const sim = () => page.evaluate(() => { const w = window.__island.waves?.island.wave; if (!w) return null; const s = w.state;
  return {wave: w.info.wave, event: s.event?.id ?? null, boats: s.ships.filter(x => x.kind === 'gunboat').length, anchored: s.ships.filter(x => x.kind === 'gunboat' && x.state === 'attacking').length,
    jammed: s.towers.filter(t => t.jammed !== undefined).length, ships: s.ships.length,
    at: s.ships.filter(x => x.kind === 'gunboat').map(x => [Math.round(x.x), Math.round(x.z), x.state])}; });
let last = null;
async function until(test, timeout = 120000) { const end = Date.now() + timeout; while (Date.now() < end) { const state = await sim(); if (state) last = state; if (state && test(state)) return state; await page.waitForTimeout(100); } throw new Error(`timed out; last state ${JSON.stringify(last)}`); }
const skipCaption = async () => { const skip = page.locator('.narrator-skip'); if (await skip.count()) await skip.first().click().catch(() => {}); };
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
  // A modest island: cannons, a mortar and walls, so the boats get their shots in.
  await island(async (i, wave) => { i.dev.setWaveBest(wave); i.dev.setCoins(60000); await i.load();
    for (const [spot, kind] of [['cannon_1', 'cannon'], ['cannon_2', 'cannon'], ['cannon_3', 'cannon'], ['cannon_6', 'mortar'], ['wall_1', 'wall'], ['wall_2', 'wall'], ['wall_3', 'wall'], ['tower_1', 'watchtower'], ['house_1', 'house']]) await i.build(spot, kind);
    for (const spot of ['cannon_1', 'cannon_2', 'cannon_3']) { await i.upgrade(spot); await i.upgrade(spot); }
    // A late wave needs more to hold: every wall, two more cannons and the mortar's levels.
    if (wave >= 24) {
      for (const spot of ['cannon_4', 'cannon_5']) { await i.build(spot, 'cannon'); await i.upgrade(spot); await i.upgrade(spot); }
      for (const spot of ['wall_4', 'wall_5', 'wall_6', 'wall_7', 'wall_8', 'wall_9', 'wall_10', 'wall_11', 'wall_12']) await i.build(spot, 'wall');
      for (const spot of ['wall_1', 'wall_2', 'wall_3', 'cannon_6']) { await i.upgrade(spot); await i.upgrade(spot); }
    } }, best);
  await closeCards();
  await stand(0, 4);
  await island(async i => i.ringBell());
  // One loop watches the wave and takes each picture the first moment it is there: a gunboat anchored at its
  // range, a jammed tower (the broken gear over it), and two or more gunboats afloat at once.
  await page.addStyleTag({content: '.narrator-card{display:none !important}'});
  const done = new Set(), end = Date.now() + 150000;
  while (done.size < 3 && Date.now() < end) {
    const state = await sim();
    if (!state) { if (done.size) break; await page.waitForTimeout(100); continue; }
    if (!done.has('range') && state.anchored >= 1 && state.jammed === 0) { done.add('range'); console.log('gunboats', JSON.stringify(state.at)); await shot('01-gunboat-at-range'); }
    else if (!done.has('jam') && state.jammed >= 1) { done.add('jam'); await page.waitForTimeout(250); await shot('02-jammed-tower'); }
    else if (!done.has('several') && state.boats >= 2) { done.add('several'); console.log('several', JSON.stringify(state)); await shot('03-several-gunboats'); }
    else await page.waitForTimeout(100);
  }
  console.log('taken:', [...done].join(', '));
  const errors = env.errors.filter(text => !/Failed to load resource|AudioContext|audio device/i.test(text));
  assert.deepEqual(errors, [], 'no browser errors');
} finally { await env.close(); }
